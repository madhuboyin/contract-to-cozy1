// Composition FRD §5: runs a composed turn. Each component is an ORDINARY child turn through `createAskExecution` (routing declared, execution, the
// operation's own trust pipeline, persistence), so nothing about a single answer changes. This module owns only what is new: creating children
// idempotently, recording attempts under a compare-and-set on the parent, one automatic retry of a retryable child, the final authorization gate, assembly
// and the durable composite on the parent. The database is injected so every path is tested with an in-memory fake.
import type { AskExecution } from '@prisma/client';
import { ASK_RESPONSE_SCHEMA_VERSION, type AskExecutionResponse, type AskPresentationBlock, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import type { AskAccountRole } from '../askAccountEligibility';
import { parseTargetDate } from '../support/targetDate';
import { quantitiesOf } from './quantities';
import { extractSlots, sanitizeSlots } from './slots';
import type { ComposedClause } from './decompose';
import {
  applyAttemptMutation, childClientRequestId, componentKeyOf, nextAttemptNumber, requireVersion, retryAllowed, selectAttempt, AssemblyInvariantError,
  type Attempt, type AttemptKind, type AssemblyState,
} from './attempts';
import {
  applyAuthorizationGate, assembleComposite, componentStateOf, decideStatus, projectForDelivery, validateComposite,
  type AuthorizationView, type ComponentOutcome, type CompositeResult, type DeliveredComposite,
} from './compositeResult';

export type CreateChild = (
  userId: string, request: CreateAskExecutionRequest, accountRole: AskAccountRole | undefined,
  internal: { composition: { parentExecutionId: string; expiresAt: Date | null } },
) => Promise<AskExecutionResponse>;

/** The slice of the Prisma client this module uses; the real client satisfies it. */
export interface CompositionDb {
  askExecution: {
    findUnique(args: { where: { id: string } }): Promise<AskExecution | null>;
    findMany(args: { where: { id: { in: string[] } } }): Promise<AskExecution[]>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<AskExecution>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  askExecutionEvent: { create(args: { data: { executionId: string; eventType: string; metadataJson?: unknown } }): Promise<unknown> };
}

export interface ComposedTurnInput {
  db: CompositionDb;
  userId: string;
  accountRole?: AskAccountRole;
  parent: AskExecution;
  message: string;
  sessionId: string;
  propertyId: string;
  clauses: ComposedClause[];
  createChild: CreateChild;
  loadAuthorizationView: () => Promise<AuthorizationView>;
  executionTimeoutMs: number;
  now?: () => Date;
}

const MAX_CAS_RETRIES = 6;
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const normalizeClause = (clause: string) => clause.trim().replace(/\s+/g, ' ').toLowerCase();

interface Stored { attempts: Attempt[] }
const storedOf = (row: AskExecution): Stored => {
  const raw = row.parametersJson && typeof row.parametersJson === 'object' && !Array.isArray(row.parametersJson) ? (row.parametersJson as Record<string, unknown>).composition : null;
  const attempts = raw && typeof raw === 'object' && Array.isArray((raw as Stored).attempts) ? (raw as Stored).attempts : [];
  return { attempts };
};

/** FR-PER-13: read, merge and write the parent's attempt set atomically with a guarded updateMany on the assembly version; re-read and retry if it moved. */
export async function recordAttempt(db: CompositionDb, parentId: string, attempt: Attempt): Promise<AssemblyState> {
  for (let tries = 0; tries < MAX_CAS_RETRIES; tries += 1) {
    const row = await db.askExecution.findUnique({ where: { id: parentId } });
    if (!row) throw new Error('composite parent not found');
    const state: AssemblyState = { version: row.assemblyVersion ?? null, attempts: storedOf(row).attempts };
    const expected = requireVersion(state);
    const mutation = applyAttemptMutation(state, expected, attempt);
    if (!mutation.applied) {
      if (mutation.reason === 'DUPLICATE') return mutation.state;
      continue; // STALE_VERSION: the state moved between our read and the check; re-read
    }
    const base = row.parametersJson && typeof row.parametersJson === 'object' && !Array.isArray(row.parametersJson) ? row.parametersJson as Record<string, unknown> : {};
    const written = await db.askExecution.updateMany({
      where: { id: parentId, assemblyVersion: expected },
      data: { assemblyVersion: mutation.state.version, parametersJson: json({ ...base, composition: { attempts: mutation.state.attempts } }) },
    });
    if (written.count === 1) return mutation.state;
  }
  throw new AssemblyInvariantError('could not record an attempt: the assembly version kept moving');
}

interface ComponentRun { clause: ComposedClause; key: string }

export async function runComposedTurn(input: ComposedTurnInput): Promise<AskExecution> {
  const { db, parent, clauses } = input;
  const now = input.now ?? (() => new Date());
  // FR-PER-13: a composed parent starts at version 0.
  await db.askExecution.update({ where: { id: parent.id }, data: { status: 'RUNNING', assemblyVersion: 0, parametersJson: json({ composition: { attempts: [] }, slots: sanitizeSlots(extractSlots(input.message)) }) } });
  await db.askExecutionEvent.create({ data: { executionId: parent.id, eventType: 'COMPOSED_TURN_STARTED', metadataJson: json({ components: clauses.map((c) => c.operationId) }) } });

  const runs: ComponentRun[] = clauses.map((clause) => ({ clause, key: componentKeyOf(clause.operationId, { clause: normalizeClause(clause.clause) }) }));

  const runAttempt = async (run: ComponentRun, kind: AttemptKind): Promise<Attempt> => {
    const row = await db.askExecution.findUnique({ where: { id: parent.id } });
    const number = nextAttemptNumber(storedOf(row!).attempts, run.key);
    const clientRequestId = childClientRequestId(parent.clientRequestId, run.key, number);
    let executionId = `unstarted:${clientRequestId}`;
    let status = 'FAILED_RETRYABLE';
    try {
      const response = await input.createChild(input.userId, {
        clientRequestId, sessionId: input.sessionId, message: run.clause.clause, propertyId: input.propertyId,
        launchContext: { surface: 'ASK_COMPOSED_COMPONENT', operationId: run.clause.operationId },
      } as CreateAskExecutionRequest, input.accountRole, { composition: { parentExecutionId: parent.id, expiresAt: parent.expiresAt } });
      executionId = response.executionId;
      status = response.status;
    } catch { /* the child never persisted a result: a retryable failure, recorded below */ }
    const attempt: Attempt = { executionId, componentKey: run.key, number, kind, status };
    await recordAttempt(db, parent.id, attempt);
    return attempt;
  };

  // Both components are dispatched concurrently (FR-EXE-4); each child applies its own authorization in its own service path.
  await Promise.all(runs.map((run) => runAttempt(run, 'INITIAL')));

  // D9 (proposed): one automatic retry of a retryable child, rejected near family expiration (FR-PER-16). A rejected retry converts to a terminal outcome.
  const exhausted = new Set<string>();
  for (const run of runs) {
    const row = await db.askExecution.findUnique({ where: { id: parent.id } });
    const attempts = storedOf(row!).attempts.filter((a) => a.componentKey === run.key);
    // A FAILED_RETRYABLE attempt is not terminal, so selectAttempt reports the component as pending; look at the latest attempt directly.
    const latest = [...attempts].sort((a, b) => b.number - a.number)[0];
    if (latest && latest.status === 'FAILED_RETRYABLE' && !selectAttempt(attempts).attempt) {
      const decision = retryAllowed({ parentExpiresAt: parent.expiresAt, now: now(), executionTimeoutMs: input.executionTimeoutMs });
      if (decision.allowed && attempts.length < 2) await runAttempt(run, 'RETRY');
      exhausted.add(run.key);
    }
  }

  const assembleOnce = async (): Promise<{ row: AskExecution; won: boolean }> => {
  const finalRow = (await db.askExecution.findUnique({ where: { id: parent.id } }))!;
  const attempts = storedOf(finalRow).attempts;
  // The effective attempt: the selected one (FR-PER-15) or, when none is terminal, the latest. Retries are exhausted by now (one automatic retry), so a
  // component that is still FAILED_RETRYABLE converts to a terminal limitation (D9).
  const selections = runs.map((run) => {
    const mine = attempts.filter((a) => a.componentKey === run.key);
    const selection = selectAttempt(mine);
    const latest = [...mine].sort((a, b) => b.number - a.number)[0] ?? null;
    return { run, selection: { ...selection, attempt: selection.attempt ?? latest } };
  });
  const states = selections.map(({ selection }) => (selection.attempt ? componentStateOf(selection.attempt.status, true) : 'FAILED' as const));
  const decision = decideStatus(states);
  const completedAt = now();
  const claimedVersion = requireVersion({ version: finalRow.assemblyVersion ?? null, attempts });

  // FR-PER-13c/e: only the worker that wins the compare-and-set on the claimed version writes the composite; a loser reassembles against the new version.
  const persist = async (data: Record<string, unknown>): Promise<{ row: AskExecution; won: boolean }> => {
    const written = await db.askExecution.updateMany({ where: { id: parent.id, assemblyVersion: claimedVersion }, data: { ...data, assemblyVersion: claimedVersion + 1 } });
    return { row: (await db.askExecution.findUnique({ where: { id: parent.id } }))!, won: written.count === 1 };
  };

  const children = await db.askExecution.findMany({ where: { id: { in: selections.map((s) => s.selection.attempt?.executionId).filter((id): id is string => !!id && !id.startsWith('unstarted:')) } } });
  const childById = new Map(children.map((c) => [c.id, c]));
  const blocksOf = (row?: AskExecution): AskPresentationBlock[] => {
    const result = row?.resultJson && typeof row.resultJson === 'object' && !Array.isArray(row.resultJson) ? row.resultJson as Record<string, unknown> : null;
    return Array.isArray(result?.blocks) ? result!.blocks as AskPresentationBlock[] : [];
  };

  if (decision.kind === 'CLARIFY_ALONE') {
    // The clarification is asked alone, under the parent: nothing else is shown and nothing is partially answered.
    const source = childById.get(selections[decision.clauseIndex].selection.attempt?.executionId ?? '');
    return persist({ status: source?.status ?? 'NEEDS_CLARIFICATION', reasonCode: source?.reasonCode ?? 'ASK_ROUTING_AMBIGUOUS', resultJson: source?.resultJson ?? undefined, completedAt: null });
  }

  const outcomes: ComponentOutcome[] = selections.flatMap(({ run, selection }) => {
    const attempt = selection.attempt;
    const state = attempt ? componentStateOf(attempt.status, true) : 'FAILED';
    if (!attempt || (state !== 'ANSWERED' && state !== 'LIMITED')) return [];
    const row = childById.get(attempt.executionId);
    return [{ clause: run.clause.clause, operationId: run.clause.operationId, executionId: attempt.executionId, attempt: attempt.number, status: attempt.status, reasonCode: row?.reasonCode ?? undefined, blocks: blocksOf(row), quantities: quantitiesOf(row?.parametersJson) }];
  });
  const notAnswered = selections.flatMap(({ run, selection }) => {
    const attempt = selection.attempt;
    const state = attempt ? componentStateOf(attempt.status, true) : 'FAILED';
    return state === 'ANSWERED' || state === 'LIMITED' ? [] : [{ clause: run.clause.clause, reasonCode: attempt?.status === 'FAILED_RETRYABLE' ? 'AskExecutionTimeoutError' : `COMPONENT_${attempt?.status ?? 'FAILED'}`, detail: 'This part could not be answered right now.' }];
  });

  if (!outcomes.length) {
    return persist({ status: 'READY_WITH_LIMITATIONS', reasonCode: 'COMPOSITE_NONE_ANSWERED', completedAt, resultJson: json(compositeEnvelope(null, null, notAnswered, attempts)) });
  }

  const composite = assembleComposite({ outcomes, dated: parseTargetDate(input.message) != null, notAnswered });
  // The final authorization gate (§6.10), before the composite becomes visible.
  const gate = applyAuthorizationGate(composite, await input.loadAuthorizationView());
  if (gate.kind === 'WITHHELD') {
    return persist({ status: 'UNAVAILABLE', reasonCode: gate.reason === 'PROPERTY_ACCESS_LOST' ? 'ASK_PROPERTY_NOT_FOUND' : 'ASK_COMPOSITE_NOT_AUTHORIZED', completedAt, resultJson: json(compositeEnvelope(null, null, [], attempts, true)) });
  }
  const visible = gate.composite;
  const issues = validateComposite(visible);
  if (issues.length) {
    // FR-TRU-3: one envelope on the same parent, the validated sections inside, no merged figure and no answer-first line.
    const plain: CompositeResult = { ...visible, answerFirst: null, basis: null, status: 'READY_WITH_LIMITATIONS', coverage: 'PARTIAL' };
    return persist({ status: 'READY_WITH_LIMITATIONS', reasonCode: 'COMPOSITE_VALIDATION_FAILED', completedAt, resultJson: json(compositeEnvelope(plain, projectForDelivery(plain), [], attempts, false, issues)) });
  }
  const delivered = projectForDelivery(visible);
  return persist({ status: visible.status, reasonCode: visible.coverage === 'PARTIAL' ? 'COMPOSITE_PARTIAL' : undefined, completedAt, resultJson: json(compositeEnvelope(visible, delivered, visible.notAnswered, attempts)) });
  };
  let last: { row: AskExecution; won: boolean } | null = null;
  for (let round = 0; round < MAX_CAS_RETRIES; round += 1) {
    last = await assembleOnce();
    if (last.won) return last.row;
  }
  return last!.row;
}

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

/** The stored result of a composed parent: ordinary `blocks` (so every existing renderer works) plus the composite state that replay, refresh and the gate read. */
export function compositeEnvelope(
  composite: CompositeResult | null, delivered: DeliveredComposite | null, notAnswered: ReadonlyArray<{ clause: string; reasonCode: string; detail: string }>,
  attempts: Attempt[], withheld = false, validationIssues: string[] = [],
) {
  const blocks: AskPresentationBlock[] = [];
  if (withheld) {
    blocks.push({ type: 'SUMMARY', id: 'composite-unavailable', title: 'This answer is no longer available', body: 'Your access to this home changed, so the answer is not shown.', tone: 'CAUTION', actions: [] } as AskPresentationBlock);
  }
  if (composite?.answerFirst) {
    const basisText = (composite.basis?.lines ?? []).map((line) => `${line.itemKey.charAt(0)}${line.itemKey.slice(1).toLowerCase()} replacement ${line.basisLabel}: ${line.minCents === line.maxCents ? money(line.minCents) : `${money(line.minCents)}–${money(line.maxCents)}`}.`).join(' ');
    blocks.push({ type: 'SUMMARY', id: 'composite-answer-first', title: composite.answerFirst, body: [basisText, ...(composite.basis?.notes ?? []), ...(composite.basis?.contradictions ?? [])].filter(Boolean).join(' ') || 'Both parts of your question are answered below.', tone: composite.status === 'ANSWERED' ? 'DEFAULT' : 'CAUTION', actions: [] } as AskPresentationBlock);
  } else if (validationIssues.length) {
    blocks.push({ type: 'SUMMARY', id: 'composite-combined-unavailable', title: 'The combined view is unavailable', body: 'Each part is shown below as it was answered, without a combined summary.', tone: 'CAUTION', actions: [] } as AskPresentationBlock);
  }
  for (const section of delivered?.sections ?? []) blocks.push(...section.blocks);
  if (notAnswered.length) {
    blocks.push({ type: 'SUMMARY', id: 'composite-not-answered', title: notAnswered.length === 1 ? 'One part could not be answered' : 'These parts could not be answered', body: notAnswered.map((n) => `“${n.clause}” — ${n.detail}`).join(' '), tone: 'CAUTION', actions: [] } as AskPresentationBlock);
  }
  return {
    schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks, captureRequests: [], confirmation: null, clarification: null, suggestions: [] as string[],
    composite: composite ? { ...json(composite), attempts: json(attempts), validationIssues } : { notAnswered: json(notAnswered), attempts: json(attempts), validationIssues },
  };
}
