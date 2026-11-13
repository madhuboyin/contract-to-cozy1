// Composition FRD §5: runs a composed turn. Each component is an ORDINARY child turn through `createAskExecution` (routing declared, execution, the
// operation's own trust pipeline, persistence), so nothing about a single answer changes. This module owns only what is new: creating children
// idempotently, recording attempts under a compare-and-set on the parent, one automatic retry of a retryable child, the final authorization gate, assembly
// and the durable composite on the parent. The database is injected so every path is tested with an in-memory fake.
import type { AskExecution } from '@prisma/client';
import { ASK_RESPONSE_SCHEMA_VERSION, type AskExecutionResponse, type AskPresentationBlock, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import type { AskAccountRole } from '../askAccountEligibility';
import { COMPOSITION_PURE_VARIANTS, getAskOperationDefinition, type AskOperationId, type AskOperationResult } from '../askOperationRegistry';
import { parseTargetDate } from '../support/targetDate';
import {
  askCompositionContradictionsTotal, askCompositionDurationSeconds, askCompositionResultTotal, askCompositionTimeoutsTotal, askCompositionTotal,
  askCompositionUnansweredTotal, askCompositionValidatorFailuresTotal,
} from '../../../lib/metrics';
import { quantitiesOf } from './quantities';
import { COMPOSABLE_SOURCE_AUTHORIZATION, type CompositeSourceReference } from './sourceAuthorization';
import { extractSlots, sanitizeSlots } from './slots';
import { withheldDetail, withheldRuns } from './withholding';
import { clarificationLabelFor } from '../support/clarificationLabels';
import type { ComposedClause, DeferredClause } from './decompose';
import {
  applyAttemptMutation, childClientRequestId, componentKeyOf, nextAttemptNumber, requireVersion, retryAllowed, selectAttempt, AssemblyInvariantError,
  type Attempt, type AttemptKind, type AssemblyState,
} from './attempts';
import {
  applyAuthorizationGate, assembleComposite, componentStateOf, decideStatus, projectForDelivery, validateComposite,
  type AuthorizationView, type ComponentOutcome, type ComponentState, type CompositeResult, type DeliveredComposite,
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
  /** Omitted on recovery and refresh: the clauses stored on the parent at start are used. */
  clauses?: ComposedClause[];
  /** FR-DEC-4a: parts that were not run, named in the answer. Stored on the parent so recovery and refresh name them again. */
  deferred?: DeferredClause[];
  createChild: CreateChild;
  loadAuthorizationView: () => Promise<AuthorizationView>;
  /** Runs the assembled parent through the same governed Suggested Next Action pipeline as an ordinary settled answer. */
  finalizeResult?: (result: AskOperationResult) => Promise<AskOperationResult>;
  executionTimeoutMs: number;
  /** A manual retry's clientRequestId; bound to each reservation it makes (FR-PER-10). */
  requestKey?: string;
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
      data: { assemblyVersion: mutation.state.version, parametersJson: json({ ...base, composition: { ...(base.composition && typeof base.composition === 'object' ? base.composition : {}), attempts: mutation.state.attempts } }) },
    });
    if (written.count === 1) return mutation.state;
  }
  throw new AssemblyInvariantError('could not record an attempt: the assembly version kept moving');
}

interface ComponentRun { clause: ComposedClause; key: string }
export type DriveMode = 'START' | 'RECOVER' | 'REFRESH' | 'RETRY_EXHAUSTED';

const storedDeferredOf = (row: AskExecution): DeferredClause[] => {
  const raw = row.parametersJson && typeof row.parametersJson === 'object' && !Array.isArray(row.parametersJson) ? (row.parametersJson as Record<string, unknown>).composition : null;
  const deferred = raw && typeof raw === 'object' ? (raw as { deferred?: unknown }).deferred : null;
  return Array.isArray(deferred) ? deferred as DeferredClause[] : [];
};
const storedClausesOf = (row: AskExecution): ComposedClause[] => {
  const raw = row.parametersJson && typeof row.parametersJson === 'object' && !Array.isArray(row.parametersJson) ? (row.parametersJson as Record<string, unknown>).composition : null;
  const clauses = raw && typeof raw === 'object' ? (raw as { clauses?: unknown }).clauses : null;
  return Array.isArray(clauses) ? clauses as ComposedClause[] : [];
};

/**
 * FR-PER-13: reserve the next attempt number AND record a pending attempt in one compare-and-set on the parent, before any child is created, so two
 * overlapping retry/refresh requests can never allocate the same number or the same child clientRequestId. A retry or refresh is admitted here against the
 * parent's CURRENT row (FR-PER-16: not near family expiration), not the in-memory copy. Returns null when the retry is not admitted.
 */
export async function reserveAttempt(
  db: CompositionDb, parentId: string, componentKey: string, kind: AttemptKind, childId: (number: number) => string, opts: { now: Date; executionTimeoutMs: number; requestKey?: string },
): Promise<{ number: number; executionId: string } | 'DUPLICATE' | null> {
  for (let tries = 0; tries < MAX_CAS_RETRIES; tries += 1) {
    const row = await db.askExecution.findUnique({ where: { id: parentId } });
    if (!row) throw new Error('composite parent not found');
    if (kind !== 'INITIAL' && !retryAllowed({ parentExpiresAt: row.expiresAt, now: opts.now, executionTimeoutMs: opts.executionTimeoutMs }).allowed) return null;
    const state: AssemblyState = { version: row.assemblyVersion ?? null, attempts: storedOf(row).attempts };
    const expected = requireVersion(state);
    // FR-PER-10: the same retry request delivered twice reserves once. The check reads the same row the reservation compare-and-sets, so a concurrent twin
    // that loses the CAS re-reads, finds the key and stops.
    if (opts.requestKey && state.attempts.some((a) => a.componentKey === componentKey && a.requestKey === opts.requestKey)) return 'DUPLICATE';
    const number = nextAttemptNumber(state.attempts, componentKey);
    const executionId = `unstarted:${childId(number)}`;
    const reserved: Attempt = { executionId, componentKey, number, kind, status: 'RUNNING', ...(opts.requestKey ? { requestKey: opts.requestKey } : {}) };
    const base = row.parametersJson && typeof row.parametersJson === 'object' && !Array.isArray(row.parametersJson) ? row.parametersJson as Record<string, unknown> : {};
    const composition = (base.composition && typeof base.composition === 'object' ? base.composition : {}) as Record<string, unknown>;
    const written = await db.askExecution.updateMany({
      where: { id: parentId, assemblyVersion: expected },
      data: { assemblyVersion: expected + 1, parametersJson: json({ ...base, composition: { ...composition, attempts: [...state.attempts, reserved] } }) },
    });
    if (written.count === 1) return { number, executionId };
  }
  throw new AssemblyInvariantError('could not reserve an attempt: the assembly version kept moving');
}

export async function runComposedTurn(input: ComposedTurnInput): Promise<AskExecution> {
  const { db, parent } = input;
  const clauses = input.clauses ?? [];
  // FR-PER-13: a composed parent starts at version 0. The clauses are stored so an interrupted turn can be recovered and a refresh can rerun every component.
  await db.askExecution.update({ where: { id: parent.id }, data: { status: 'RUNNING', assemblyVersion: 0, parametersJson: json({ composition: { attempts: [], clauses, ...(input.deferred?.length ? { deferred: input.deferred } : {}) }, slots: sanitizeSlots(extractSlots(input.message)) }) } });
  await db.askExecutionEvent.create({ data: { executionId: parent.id, eventType: 'COMPOSED_TURN_STARTED', metadataJson: json({ components: clauses.map((c) => c.operationId) }) } });
  askCompositionTotal.inc({ outcome: 'composed' });
  return driveComposite({ ...input, clauses }, 'START');
}

/** FR-PER-4: continue an interrupted composite on the SAME parent: keep the authoritative attempt set, finish what is pending, create only what is missing, reassemble. */
export async function recoverComposedTurn(input: Omit<ComposedTurnInput, 'clauses'>): Promise<AskExecution> {
  const row = (await input.db.askExecution.findUnique({ where: { id: input.parent.id } })) ?? input.parent;
  const clauses = storedClausesOf(row);
  if (!clauses.length) throw new AssemblyInvariantError('a composite parent has no stored clauses to recover');
  await input.db.askExecution.update({ where: { id: row.id }, data: { status: 'RUNNING', completedAt: null } });
  await input.db.askExecutionEvent.create({ data: { executionId: row.id, eventType: 'COMPOSED_TURN_RECOVERED', metadataJson: json({ components: clauses.map((c) => c.operationId) }) } });
  askCompositionTotal.inc({ outcome: 'recovered' });
  return driveComposite({ ...input, parent: row, clauses }, 'RECOVER');
}

/**
 * FR-FACET-9(d): the follow-up that answers an inline clarification is MERGED into the stored parent turn. The chosen operation runs for the clarified part as one more component of the SAME parent, the facets that were
 * waiting on it run now, the part leaves the deferred list, and the composite is reassembled (the answered components keep their attempts and are not run again). Returns null when nothing is pending for this
 * clause and operation (already merged, never asked, or not a read this composed answer can run), when the parent is still running, or when it has expired; the caller then answers the click as an ordinary turn.
 */
export async function resumeClarifiedComposedTurn(input: Omit<ComposedTurnInput, 'clauses' | 'deferred'> & { clause: string; selectedOperationId: AskOperationId }): Promise<AskExecution | null> {
  const row = (await input.db.askExecution.findUnique({ where: { id: input.parent.id } })) ?? input.parent;
  const now = (input.now ?? (() => new Date()))();
  if (row.status === 'RUNNING' || row.status === 'RECEIVED' || (row.expiresAt && row.expiresAt.getTime() <= now.getTime())) return null;
  const deferred = storedDeferredOf(row);
  const wanted = normalizeClause(input.clause);
  const pending = deferred.find((part) => part.reason === 'NEEDS_CLARIFICATION' && normalizeClause(part.clause) === wanted && part.options?.some((option) => option.operationId === input.selectedOperationId));
  if (!pending) return null;
  const operationId = COMPOSITION_PURE_VARIANTS[input.selectedOperationId] ?? input.selectedOperationId;
  if (!getAskOperationDefinition(operationId).composableRead) return null;
  const clauses = [...storedClausesOf(row), { clause: pending.clause, operationId, confidence: 0.9, ...(pending.facetId ? { facetId: pending.facetId } : {}) } as ComposedClause];
  const remaining = deferred.filter((part) => part !== pending);
  const internal = row.parametersJson && typeof row.parametersJson === 'object' && !Array.isArray(row.parametersJson) ? row.parametersJson as Record<string, unknown> : {};
  const composition = (internal.composition && typeof internal.composition === 'object' ? internal.composition : {}) as Record<string, unknown>;
  const { deferred: _old, ...compositionRest } = composition;
  const updated = await input.db.askExecution.update({ where: { id: row.id }, data: { status: 'RUNNING', completedAt: null, parametersJson: json({ ...internal, composition: { ...compositionRest, clauses, ...(remaining.length ? { deferred: remaining } : {}) } }) } });
  await input.db.askExecutionEvent.create({ data: { executionId: row.id, eventType: 'COMPOSED_TURN_CLARIFIED', metadataJson: json({ operationId, resumedFacets: clauses.filter((c) => (c.dependsOn ?? []).includes(pending.facetId ?? '')).length }) } });
  askCompositionTotal.inc({ outcome: 'clarified' });
  return driveComposite({ ...input, parent: updated, clauses, deferred: remaining }, 'RECOVER');
}

/** Components of a stored composite that ended retryable-failed after the automatic retry (no successful or terminal attempt is selected for them). */
export function exhaustedComponentKeys(row: AskExecution): string[] {
  const clauses = storedClausesOf(row);
  const attempts = storedOf(row).attempts;
  return clauses.map((clause) => componentKeyOf(clause.operationId, { clause: normalizeClause(clause.clause) })).filter((key) => {
    const mine = attempts.filter((a) => a.componentKey === key);
    const latest = [...mine].sort((a, b) => b.number - a.number)[0];
    return !!latest && latest.status === 'FAILED_RETRYABLE' && !selectAttempt(mine).attempt;
  });
}

/** True when a manual retry request with this key already reserved an attempt on the parent. */
export const hasRetryRequest = (row: AskExecution, requestKey: string): boolean => storedOf(row).attempts.some((a) => a.requestKey === requestKey);

/** A manual retry after the automatic retry was exhausted: reserve a new RETRY attempt for each exhausted component only, then reassemble the same parent. */
export async function retryExhaustedComposedTurn(input: Omit<ComposedTurnInput, 'clauses'>): Promise<AskExecution | 'TOO_NEAR_EXPIRATION'> {
  const row = (await input.db.askExecution.findUnique({ where: { id: input.parent.id } })) ?? input.parent;
  const clauses = storedClausesOf(row);
  // A duplicate delivery of a retry already applied (or in flight) returns the parent as it stands, not an error.
  if (input.requestKey && hasRetryRequest(row, input.requestKey)) return row;
  if (!clauses.length || !exhaustedComponentKeys(row).length) throw new AssemblyInvariantError('no exhausted component to retry');
  const decision = retryAllowed({ parentExpiresAt: row.expiresAt, now: (input.now ?? (() => new Date()))(), executionTimeoutMs: input.executionTimeoutMs });
  if (!decision.allowed) return 'TOO_NEAR_EXPIRATION';
  await input.db.askExecutionEvent.create({ data: { executionId: row.id, eventType: 'COMPOSED_TURN_RETRIED', metadataJson: json({ components: exhaustedComponentKeys(row).length }) } });
  askCompositionTotal.inc({ outcome: 'retried' });
  return driveComposite({ ...input, parent: row, clauses }, 'RETRY_EXHAUSTED');
}

/** Refreshing a composite refreshes EVERY selected component as a REFRESH attempt and reassembles; a worse refresh never replaces a better stored answer. */
export async function refreshComposedTurn(input: Omit<ComposedTurnInput, 'clauses'>): Promise<AskExecution> {
  const row = (await input.db.askExecution.findUnique({ where: { id: input.parent.id } })) ?? input.parent;
  const clauses = storedClausesOf(row);
  if (!clauses.length) throw new AssemblyInvariantError('a composite parent has no stored clauses to refresh');
  await input.db.askExecutionEvent.create({ data: { executionId: row.id, eventType: 'COMPOSED_TURN_REFRESHED', metadataJson: json({ components: clauses.map((c) => c.operationId) }) } });
  askCompositionTotal.inc({ outcome: 'refreshed' });
  return driveComposite({ ...input, parent: row, clauses }, 'REFRESH');
}

async function driveComposite(input: ComposedTurnInput & { clauses: ComposedClause[] }, mode: DriveMode): Promise<AskExecution> {
  const { db, parent, clauses } = input;
  const now = input.now ?? (() => new Date());
  const startedAt = Date.now();
  const runs: ComponentRun[] = clauses.map((clause) => ({ clause, key: componentKeyOf(clause.operationId, { clause: normalizeClause(clause.clause) }) }));

  const callChild = async (run: ComponentRun, number: number): Promise<{ executionId: string; status: string }> => {
    const clientRequestId = childClientRequestId(parent.clientRequestId, run.key, number);
    try {
      const response = await input.createChild(input.userId, {
        clientRequestId, sessionId: input.sessionId, message: run.clause.clause, propertyId: input.propertyId,
        launchContext: {
          surface: 'ASK_COMPOSED_COMPONENT', operationId: run.clause.operationId,
          ...(run.clause.dataPointId ? { dataPointId: run.clause.dataPointId } : {}),
          ...(run.clause.dataPointParameters ? { dataPointParameters: run.clause.dataPointParameters } : {}),
          ...(run.clause.requiredSlots?.length ? { dataPointRequiredSlots: run.clause.requiredSlots } : {}),
          ...(run.clause.entityRef !== undefined ? { dataPointEntityRef: run.clause.entityRef } : {}),
        },
      } as CreateAskExecutionRequest, input.accountRole, { composition: { parentExecutionId: parent.id, expiresAt: parent.expiresAt } });
      return { executionId: response.executionId, status: response.status };
    } catch {
      // The child never persisted a result: a retryable failure, recorded by the caller.
      return { executionId: `unstarted:${clientRequestId}`, status: 'FAILED_RETRYABLE' };
    }
  };

  const runAttempt = async (run: ComponentRun, kind: AttemptKind): Promise<Attempt | null> => {
    const requestKey = kind === 'RETRY' && mode === 'RETRY_EXHAUSTED' ? input.requestKey : undefined;
    const reserved = await reserveAttempt(db, parent.id, run.key, kind, (n) => childClientRequestId(parent.clientRequestId, run.key, n), { now: now(), executionTimeoutMs: input.executionTimeoutMs, ...(requestKey ? { requestKey } : {}) });
    if (!reserved || reserved === 'DUPLICATE') return null;
    const outcome = await callChild(run, reserved.number);
    const attempt: Attempt = { executionId: outcome.executionId, componentKey: run.key, number: reserved.number, kind, status: outcome.status, ...(requestKey ? { requestKey } : {}) };
    await recordAttempt(db, parent.id, attempt);
    return attempt;
  };

  const attemptsOf = async (run: ComponentRun) => storedOf((await db.askExecution.findUnique({ where: { id: parent.id } }))!).attempts.filter((a) => a.componentKey === run.key);
  const latestOf = (attempts: Attempt[]) => [...attempts].sort((a, b) => b.number - a.number)[0];

  const executeRun = async (run: ComponentRun): Promise<void> => {
    const mine = await attemptsOf(run);
    if (mode === 'REFRESH') { await runAttempt(run, 'REFRESH'); return; }
    if (mode === 'RETRY_EXHAUSTED') { if (exhaustedComponentKeys(await db.askExecution.findUnique({ where: { id: parent.id } }) as AskExecution).includes(run.key)) await runAttempt(run, 'RETRY'); return; }
    if (!mine.length) { await runAttempt(run, 'INITIAL'); return; }
    // A reserved or still-running attempt is resumed by asking for the same deterministic child again: createAskExecution returns the existing child (and
    // reclaims it if it was orphaned) rather than starting a second one.
    const latest = latestOf(mine);
    if (latest.status === 'RUNNING' || latest.status === 'RECEIVED' || latest.status === 'ROUTING') {
      const outcome = await callChild(run, latest.number);
      await recordAttempt(db, parent.id, { ...latest, executionId: outcome.executionId, status: outcome.status });
    }
  };
  // Independent facets run concurrently. A dependent facet is dispatched only
  // after all named predecessor facets have settled, preserving the validated
  // request-plan DAG rather than flattening it into an unordered batch.
  const pending = new Set(runs);
  const settledFacetIds = new Set<string>();
  // FR-FACET-9(c): the settled state of a run that has run, from its latest attempt; null when it has not run (so a dependent of a clarifying or failed facet is held back, not run on a guess).
  // Facets of parts that are waiting on an inline clarification (FR-FACET-9b): they were not run, so a facet that depends on one is held back until the clarification is resolved (9d).
  const unresolvedFacetIds = (): ReadonlySet<string> => new Set((input.deferred ?? storedDeferredOf(input.parent)).filter((part) => part.reason === 'NEEDS_CLARIFICATION' && part.facetId).map((part) => part.facetId!));
  const settledStateOf = async (): Promise<(key: string) => ComponentState | null> => {
    const stored = storedOf((await db.askExecution.findUnique({ where: { id: parent.id } }))!).attempts;
    return (key) => { const mine = stored.filter((a) => a.componentKey === key); const latest = latestOf(mine); return latest ? componentStateOf(latest.status, true) : null; };
  };
  while (pending.size) {
    const held = withheldRuns(runs.map((run) => ({ key: run.key, facetId: run.clause.facetId, dependsOn: run.clause.dependsOn })), await settledStateOf(), unresolvedFacetIds());
    for (const run of [...pending]) if (held.has(run.key)) { pending.delete(run); if (run.clause.facetId) settledFacetIds.add(run.clause.facetId); }
    if (!pending.size) break;
    const ready = [...pending].filter((run) => (run.clause.dependsOn ?? []).every((dependency) => settledFacetIds.has(dependency)));
    if (!ready.length) throw new AssemblyInvariantError('validated request plan contains an unresolved dependency');
    await Promise.all(ready.map(executeRun));
    for (const run of ready) {
      pending.delete(run);
      if (run.clause.facetId) settledFacetIds.add(run.clause.facetId);
    }
  }

  // D9: one automatic retry of a retryable child, admitted against the parent's current row (FR-PER-16). A rejected retry converts to a terminal outcome.
  if (mode === 'START' || mode === 'RECOVER') {
    for (const run of runs) {
      const attempts = await attemptsOf(run);
      const latest = latestOf(attempts);
      // A FAILED_RETRYABLE attempt is not terminal, so selectAttempt reports the component as pending; look at the latest attempt directly.
      if (latest && latest.status === 'FAILED_RETRYABLE' && !selectAttempt(attempts).attempt && attempts.length < 2) await runAttempt(run, 'RETRY');
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
    return { run, selected: selection.attempt, selectedReason: selection.reason, latest, selection: { ...selection, attempt: selection.attempt ?? latest } };
  });
  // A facet that never ran because its predecessor needs a clarification or failed is WITHHELD (named, not guessed); derived from the stored attempts so recovery and refresh agree with the first run.
  const withheldNow = withheldRuns(runs.map((run) => ({ key: run.key, facetId: run.clause.facetId, dependsOn: run.clause.dependsOn })), (key) => {
    const mine = attempts.filter((a) => a.componentKey === key); const latest = [...mine].sort((a, b) => b.number - a.number)[0];
    return latest ? componentStateOf(latest.status, true) : null;
  }, unresolvedFacetIds());
  const states = selections.map(({ run, selection }) => (selection.attempt ? componentStateOf(selection.attempt.status, true) : withheldNow.has(run.key) ? 'WITHHELD' as const : 'FAILED' as const));
  const decision = decideStatus(states);
  // FR-PER-15(f): for EVERY component, the selected attempt and selection reason when a genuinely selectable attempt exists (LOWEST_SUCCESSFUL,
  // EXPLICIT_REFRESH or ONLY_TERMINAL_LIMITED), and otherwise state PENDING with both left null. The latest attempt is kept separately as audit evidence, so a
  // component with only retryable-failed attempts is never recorded as "selected". Kept in the parent's internal state; the delivered envelope carries only
  // the components the caller may see (see `deliverableEvidence`).
  const selectionMap = selections.map(({ run, selected, selectedReason, latest }) => ({
    componentKey: run.key, operationId: run.clause.operationId,
    selectedAttemptId: selected?.executionId ?? null, selectedAttemptNumber: selected?.number ?? null, selectionReason: selected ? selectedReason : null,
    // A component with no selectable attempt reports the state of its latest attempt WITHOUT the retries-exhausted conversion: still running or retryable-failed is
    // PENDING, a clarification is CLARIFICATION, and none at all is PENDING.
    state: (selected ?? latest) ? componentStateOf((selected ?? latest)!.status) : withheldNow.has(run.key) ? 'WITHHELD' as const : componentStateOf('RUNNING'),
    latestAttemptId: latest?.executionId ?? null, latestAttemptNumber: latest?.number ?? null, latestAttemptStatus: latest?.status ?? null,
  }));
  // The envelope delivered to the homeowner: attempt and selection evidence of components whose section was redacted (or withheld) is left out; it stays in
  // the parent's internal state.
  const envelopeFor = (composite: CompositeResult | null, delivered: DeliveredComposite | null, unanswered: ReadonlyArray<{ clause: string; reasonCode: string; detail: string }>,
    options: { withheld?: boolean; issues?: string[]; clarification?: AskPresentationBlock[]; redacted?: ReadonlyArray<{ componentKey: string | null; executionId: string }> } = {}) => {
    const evidence = deliverableEvidence(attempts, selectionMap, options.redacted ?? []);
    return compositeEnvelope(composite, delivered, unanswered, evidence.attempts, options.withheld ?? false, options.issues ?? [], options.clarification ?? [], evidence.selection);
  };
  const finalizedEnvelope = async (
    status: AskOperationResult['status'],
    reasonCode: string | undefined,
    envelope: ReturnType<typeof compositeEnvelope>,
  ) => {
    if (!input.finalizeResult) return envelope;
    const finalized = await input.finalizeResult({
      status,
      ...(reasonCode ? { reasonCode } : {}),
      blocks: envelope.blocks,
      suggestions: envelope.suggestions,
    });
    return {
      ...envelope,
      blocks: finalized.blocks,
      suggestions: finalized.suggestions,
      suggestedNextActionsGoverned: finalized.suggestedNextActionsGoverned === true,
      ...(finalized.suggestedNextActionsStatus ? { suggestedNextActionsStatus: finalized.suggestedNextActionsStatus } : {}),
      suggestedNextActions: finalized.suggestedNextActions ?? [],
    };
  };
  const completedAt = now();
  const claimedVersion = requireVersion({ version: finalRow.assemblyVersion ?? null, attempts });

  // A component is still running (a live child another request owns): the parent stays non-terminal. It is never converted to a limitation; a later request
  // for the same parent recovers it once the child completes or is reclaimed.
  if (decision.kind === 'PENDING') {
    await db.askExecutionEvent.create({ data: { executionId: parent.id, eventType: 'COMPOSITE_PENDING', metadataJson: json({ components: runs.length }) } }).catch(() => undefined);
    return { row: finalRow, won: true };
  }

  let assembledState: { composite: CompositeResult; clarificationBlocks: AskPresentationBlock[] } | null = null;

  // FR-PER-13c/e: only the worker that wins the compare-and-set on the claimed version writes the composite; a loser reassembles against the new version.
  const persist = async (data: Record<string, unknown>): Promise<{ row: AskExecution; won: boolean }> => {
    // FR-PER-6: the COMPLETE assembled composite (every section the components produced, before the authorization gate) is the durable domain answer and lives
    // in the parent's internal state. The gate only ever shapes what is delivered, so an authorization that is restored later restores the section too.
    const internal = finalRow.parametersJson && typeof finalRow.parametersJson === 'object' && !Array.isArray(finalRow.parametersJson) ? finalRow.parametersJson as Record<string, unknown> : {};
    const internalComposition = (internal.composition && typeof internal.composition === 'object' ? internal.composition : {}) as Record<string, unknown>;
    const written = await db.askExecution.updateMany({
      where: { id: parent.id, assemblyVersion: claimedVersion },
      data: { ...data, parametersJson: json({ ...internal, composition: { ...internalComposition, selection: selectionMap, ...(assembledState ? { assembled: assembledState } : {}) } }), assemblyVersion: claimedVersion + 1 },
    });
    const won = written.count === 1;
    if (won) {
      askCompositionDurationSeconds.observe((Date.now() - startedAt) / 1000);
      const reason = String(data.reasonCode ?? '');
      askCompositionResultTotal.inc({ status: String(data.status ?? ''), coverage: reason === 'COMPOSITE_PARTIAL' || reason === 'COMPOSITE_NONE_ANSWERED' || reason === 'COMPOSITE_VALIDATION_FAILED' ? 'PARTIAL' : reason === 'ASK_COMPOSITE_NOT_AUTHORIZED' || reason === 'ASK_PROPERTY_NOT_FOUND' ? 'WITHHELD' : 'COMPLETE' });
    }
    return { row: (await db.askExecution.findUnique({ where: { id: parent.id } }))!, won };
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
    return persist({ status: source?.status ?? 'NEEDS_CLARIFICATION', reasonCode: source?.reasonCode ?? 'ASK_ROUTING_AMBIGUOUS', resultJson: source?.resultJson && typeof source.resultJson === 'object' && !Array.isArray(source.resultJson) ? { ...(source.resultJson as Record<string, unknown>), selection: deliverableEvidence(attempts, selectionMap, []).selection } : source?.resultJson ?? undefined, completedAt: null });
  }

  const outcomes: ComponentOutcome[] = selections.flatMap(({ run, selection }) => {
    const attempt = selection.attempt;
    const state = attempt ? componentStateOf(attempt.status, true) : 'FAILED';
    if (!attempt || (state !== 'ANSWERED' && state !== 'LIMITED')) return [];
    const row = childById.get(attempt.executionId);
    return [{ clause: run.clause.clause, operationId: run.clause.operationId, executionId: attempt.executionId, attempt: attempt.number, status: attempt.status, reasonCode: row?.reasonCode ?? undefined, blocks: blocksOf(row), quantities: quantitiesOf(row?.parametersJson), sources: sourcesOf(run.clause.operationId, row), componentKey: run.key, selectionReason: selection.reason }];
  });
  // An independent clarification keeps its own focused question beside the answered section; it is not reported as a generic failure.
  const clarificationBlocks: AskPresentationBlock[] = [];
  const notAnswered: Array<{ clause: string; reasonCode: string; detail: string; startAction?: Record<string, unknown> }> = selections.flatMap(({ run, selection }) => {
    const attempt = selection.attempt;
    const state = attempt ? componentStateOf(attempt.status, true) : 'FAILED';
    if (state === 'ANSWERED' || state === 'LIMITED') return [];
    if (!attempt && withheldNow.has(run.key)) return [{ clause: run.clause.clause, reasonCode: `WITHHELD_${withheldNow.get(run.key)}`, detail: withheldDetail(withheldNow.get(run.key)!) }];
    if (state === 'CLARIFICATION') {
      clarificationBlocks.push(...blocksOf(childById.get(attempt!.executionId)).slice(0, 1));
      return [{ clause: run.clause.clause, reasonCode: 'NEEDS_CLARIFICATION', detail: 'I need one more detail for this part — see the question below.' }];
    }
    return [{ clause: run.clause.clause, reasonCode: attempt?.status === 'FAILED_RETRYABLE' ? 'AskExecutionTimeoutError' : `COMPONENT_${attempt?.status ?? 'FAILED'}`, detail: 'This part could not be answered right now.' }];
  });
  // FR-DEC-4a: the parts that were never run are named beside the parts that were, with the reason, so nothing the homeowner asked is silently dropped.
  for (const part of input.deferred ?? storedDeferredOf(input.parent)) {
    // FR-FACET-9(b): a part that could be more than one thing is asked about right here, once, with its options, beside the parts that were answered.
    if (part.reason === 'NEEDS_CLARIFICATION' && part.options && part.options.length >= 2) {
      clarificationBlocks.push({
        type: 'SUMMARY', id: `composite-clarify-${clarificationBlocks.length + 1}`, title: 'Which did you mean?', body: `“${part.clause}” could mean more than one thing. Pick the one you want and I’ll answer it.`, tone: 'CAUTION',
        actions: part.options.slice(0, 3).map((option, index) => ({ id: `composite-clarify-option-${index + 1}`, label: option.label.slice(0, 160), message: part.clause.slice(0, 300), operationId: option.operationId, style: index === 0 ? 'PRIMARY' : 'SECONDARY' })),
      } as AskPresentationBlock);
      notAnswered.push({ clause: part.clause, reasonCode: 'NEEDS_CLARIFICATION', detail: 'I need one more detail for this part — see the question below.' });
      continue;
    }
    // FR-FACET-9(e): a part that makes or saves something is never started inside a composed answer; it gets its own control, which opens it as its own turn (with its own preview and confirmation), so the read parts are not held up.
    const startAction = part.reason === 'NOT_COMPOSABLE' && part.operationId
      ? { id: `composite-start-${notAnswered.length + 1}`, label: `Start: ${clarificationLabelFor(part.operationId)}`.slice(0, 160), message: part.clause.slice(0, 300), operationId: part.operationId, style: 'SECONDARY' }
      : undefined;
    notAnswered.push({ ...(startAction ? { startAction } : {}), clause: part.clause, reasonCode: `DEFERRED_${part.reason}`, detail: part.reason === 'OVER_LIMIT' ? 'I answer up to six parts at a time, so I stopped before this one. Ask it on its own.' : part.reason === 'NOT_COMPOSABLE' ? 'This part makes or saves a decision, so I answer it on its own. Ask it separately.' : 'I couldn’t match this part to something I can answer together with the others. Ask it on its own.' });
  }
  for (const entry of notAnswered) askCompositionUnansweredTotal.inc({ reason: entry.reasonCode === 'AskExecutionTimeoutError' ? 'timeout' : entry.reasonCode.startsWith('COMPONENT_') ? 'component_failed' : entry.reasonCode.startsWith('DEFERRED_') ? 'deferred' : 'needs_clarification' });
  if (notAnswered.some((entry) => entry.reasonCode === 'AskExecutionTimeoutError')) askCompositionTimeoutsTotal.inc();

  if (!outcomes.length) {
    const reasonCode = 'COMPOSITE_NONE_ANSWERED';
    const resultJson = await finalizedEnvelope('READY_WITH_LIMITATIONS', reasonCode, envelopeFor(null, null, notAnswered, { clarification: clarificationBlocks }));
    return persist({ status: 'READY_WITH_LIMITATIONS', reasonCode, completedAt, resultJson: json(resultJson) });
  }

  const composite = assembleComposite({ outcomes, dated: parseTargetDate(input.message) != null, notAnswered });
  assembledState = { composite, clarificationBlocks };
  if ((composite.basis?.contradictions.length ?? 0) > 0) askCompositionContradictionsTotal.inc();
  // The final authorization gate (§6.10), before the composite becomes visible.
  const gate = await applyAuthorizationGate(composite, await input.loadAuthorizationView());
  if (gate.kind === 'WITHHELD') {
    const reasonCode = gate.reason === 'PROPERTY_ACCESS_LOST' ? 'ASK_PROPERTY_NOT_FOUND' : 'ASK_COMPOSITE_NOT_AUTHORIZED';
    const resultJson = await finalizedEnvelope('UNAVAILABLE', reasonCode, envelopeFor(null, null, [], { withheld: true, redacted: composite.sections }));
    return persist({ status: 'UNAVAILABLE', reasonCode, completedAt, resultJson: json(resultJson) });
  }
  const visible = gate.composite;
  const issues = validateComposite(visible);
  if (issues.length) {
    // FR-TRU-3: one envelope on the same parent, the validated sections inside, no merged figure and no answer-first line.
    askCompositionValidatorFailuresTotal.inc();
    const plain: CompositeResult = { ...visible, answerFirst: null, basis: null, status: 'READY_WITH_LIMITATIONS', coverage: 'PARTIAL' };
    const reasonCode = 'COMPOSITE_VALIDATION_FAILED';
    const resultJson = await finalizedEnvelope('READY_WITH_LIMITATIONS', reasonCode, envelopeFor(plain, projectForDelivery(plain), [], { issues, redacted: redactedOf(composite, visible) }));
    return persist({ status: 'READY_WITH_LIMITATIONS', reasonCode, completedAt, resultJson: json(resultJson) });
  }
  const delivered = projectForDelivery(visible);
  const reasonCode = visible.coverage === 'PARTIAL' ? 'COMPOSITE_PARTIAL' : undefined;
  const resultJson = await finalizedEnvelope(visible.status, reasonCode, envelopeFor(visible, delivered, visible.notAnswered, { clarification: clarificationBlocks, redacted: redactedOf(composite, visible) }));
  return persist({ status: visible.status, reasonCode, completedAt, resultJson: json(resultJson) });
  };
  let last: { row: AskExecution; won: boolean } | null = null;
  for (let round = 0; round < MAX_CAS_RETRIES; round += 1) {
    last = await assembleOnce();
    if (last.won) return last.row;
  }
  return last!.row;
}

/** Sections the gate removed from what the caller may see. */
const redactedOf = (before: CompositeResult, after: CompositeResult) => before.sections.filter((section) => !after.sections.includes(section));

/**
 * FR-PER-6: the delivered envelope carries only the authorized projection. Attempt and selection evidence of a redacted component (its operation, component key
 * with the clause text, child execution ids, status and retry metadata) is left out; the complete evidence stays in the parent's internal state.
 */
export function deliverableEvidence<A extends { componentKey: string; executionId: string }, S extends { componentKey: string }>(
  attempts: readonly A[], selection: readonly S[], redacted: ReadonlyArray<{ componentKey: string | null; executionId: string }>,
): { attempts: A[]; selection: S[] } {
  const keys = new Set(redacted.map((section) => section.componentKey).filter((key): key is string => !!key));
  const ids = new Set(redacted.map((section) => section.executionId));
  return { attempts: attempts.filter((a) => !keys.has(a.componentKey) && !ids.has(a.executionId)), selection: selection.filter((entry) => !keys.has(entry.componentKey)) };
}

/** The component's declared source references, described by its OWN operation from the result it stored; null (undeclared) fails closed at the gate. */
const sourcesOf = (operationId: string, row?: AskExecution): CompositeSourceReference[] | null => {
  const contract = COMPOSABLE_SOURCE_AUTHORIZATION[operationId];
  if (!contract || !row) return null;
  const result = row.resultJson && typeof row.resultJson === 'object' && !Array.isArray(row.resultJson) ? row.resultJson as Record<string, unknown> : null;
  return contract.describeSources({ reasonCode: row.reasonCode, parameters: row.parametersJson, blocks: Array.isArray(result?.blocks) ? result!.blocks as unknown[] : [] });
};

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

/** The stored result of a composed parent: ordinary `blocks` (so every existing renderer works) plus the composite state that replay, refresh and the gate read. */
export function compositeEnvelope(
  composite: CompositeResult | null, delivered: DeliveredComposite | null, notAnswered: ReadonlyArray<{ clause: string; reasonCode: string; detail: string; startAction?: Record<string, unknown> }>,
  attempts: Attempt[], withheld = false, validationIssues: string[] = [], clarificationBlocks: AskPresentationBlock[] = [], selection: unknown[] = [],
) {
  const blocks: AskPresentationBlock[] = [];
  if (withheld) {
    blocks.push({ type: 'SUMMARY', id: 'composite-unavailable', title: 'This answer is no longer available', body: 'Your access to this home changed, so the answer is not shown.', tone: 'CAUTION', actions: [] } as AskPresentationBlock);
  }
  if (composite?.answerFirst) {
    const basisText = (composite.basis?.lines ?? []).map((line) => `${line.itemKey.charAt(0)}${line.itemKey.slice(1).toLowerCase()} replacement ${line.basisLabel}: ${line.minCents === line.maxCents ? money(line.minCents) : `${money(line.minCents)}–${money(line.maxCents)}`}.`).join(' ');
    const fallback = composite.status === 'ANSWERED'
      ? 'Both parts of your question are answered below.'
      : 'Both parts are addressed below, including the limits of what is recorded for this home.';
    blocks.push({ type: 'SUMMARY', id: 'composite-answer-first', title: composite.answerFirst, body: [basisText, ...(composite.basis?.notes ?? []), ...(composite.basis?.contradictions ?? [])].filter(Boolean).join(' ') || fallback, tone: composite.status === 'ANSWERED' ? 'DEFAULT' : 'CAUTION', actions: [] } as AskPresentationBlock);
  } else if (validationIssues.length) {
    blocks.push({ type: 'SUMMARY', id: 'composite-combined-unavailable', title: 'The combined view is unavailable', body: 'Each part is shown below as it was answered, without a combined summary.', tone: 'CAUTION', actions: [] } as AskPresentationBlock);
  }
  for (const section of delivered?.sections ?? []) blocks.push(...section.blocks);
  blocks.push(...clarificationBlocks);
  if (notAnswered.length) {
    // A part held back only because it waits on a clarification is part of that clarification, not a failure: no capability-discovery action.
    const onlyClarifying = notAnswered.every((n) => n.reasonCode === 'NEEDS_CLARIFICATION' || n.reasonCode === 'WITHHELD_WAITING_FOR_CLARIFICATION');
    // Composition FRD §10 step 4 and FR-ACT-4: when a part cannot be answered the response states the limitation plainly and exposes capability discovery.
    // Nothing is guessed from general knowledge, and no nearest operation is offered below the calibration floor.
    blocks.push({
      type: 'SUMMARY', id: 'composite-not-answered', title: onlyClarifying ? (notAnswered.length === 1 ? 'One part needs a detail' : 'These parts need a detail') : notAnswered.length === 1 ? 'One part could not be answered' : 'These parts could not be answered',
      body: notAnswered.map((n) => `“${n.clause}” — ${n.detail}`).join(' '), tone: 'CAUTION',
      actions: onlyClarifying ? [] : [...notAnswered.flatMap((n) => (n.startAction ? [n.startAction] : [])).slice(0, 2), { id: 'composite-explore-capabilities', label: 'See what Ask can do', interactionType: 'START_WORKFLOW', message: 'What can Ask help me with?', operationId: 'CAPABILITY_DISCOVERY', style: 'SECONDARY' }],
    } as AskPresentationBlock);
  }
  return {
    schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks, captureRequests: [], confirmation: null, clarification: null, suggestions: [] as string[], selection: json(selection),
    composite: composite ? { ...json(composite), attempts: json(attempts), validationIssues } : { notAnswered: json(notAnswered), attempts: json(attempts), validationIssues },
  };
}
