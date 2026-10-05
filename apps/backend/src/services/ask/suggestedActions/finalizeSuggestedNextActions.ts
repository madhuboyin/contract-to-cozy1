// Plan §7.4: the ONE persistence-boundary producer of compact typed actions. Every seam that persists an Ask result (normal read
// path, confirmation, clarification, and the recovery branches) calls this before writing `resultJson`, so no result can persist a
// newly produced compact action by bypassing the shared policy.
//
// Guarantees:
//  - zero overhead when nothing is nominated (no property/entity/health reads happen at all);
//  - all reads are batched into one EligibilityContext; there is no per-candidate query and no model call;
//  - a failing or over-budget producer is dropped and counted, never thrown: the safe answer ships with fewer actions;
//  - deterministic given (result, history, now): ids, order and expiry are reproducible under an injected clock.
import { logger } from '../../../lib/logger';
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { prisma } from '../../../lib/prisma';
import {
  askSuggestedActionsCandidatesTotal, askSuggestedActionsPipelineDurationSeconds, askSuggestedActionsProducerFailuresTotal,
} from '../../../lib/metrics';
import type { SuggestedNextAction } from '../../../productFramework/ask/ask.contract';
import { ASK_OPERATION_DEFINITIONS, getAskOperationDefinition, type AskOperationId, type AskOperationResult } from '../askOperationRegistry';
import { requiredAskTargetEntity } from '../askEntityResolution';
import { evaluateAskOperationAvailability } from '../support/answerGuards';
import { ensurePropertyAccess } from '../support/propertyContext';
import { suggestionKey } from '../askSuggestionPolicy';
import { materializeSuggestedNextAction } from './suggestedNextActionCandidate';
import {
  type EligibilityContext, type EntityRecordState, type SuggestedNextActionMode,
} from './suggestedNextActionEligibility';
import { selectSuggestedNextActions, type PolicyDiagnostics } from './suggestedNextActionPolicy';
import { SUGGESTED_NEXT_ACTION_BUDGET } from './suggestedNextActionRegistry';
import { SUGGESTED_NEXT_ACTION_PRODUCERS, type SuggestedNextActionProducer } from './suggestedNextActionProducers';
import { getSuggestedNextActionEntityValidator } from './suggestedNextActionEntityValidators';
import './entityValidators/registerAll';
import { collectPresentationIdentities } from './suggestedNextActionPresentationIdentities';
import { loadCurrentOutcomeKeyHashes } from './suggestedNextActionHistory';
import { systemSuggestedNextActionClock, type SuggestedNextActionClock } from './suggestedNextActionClock';

const RECOVERY_STATUSES: ReadonlySet<string> = new Set([
  'UNAVAILABLE', 'EXPIRED', 'CANCELLED', 'BLOCKED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'OUT_OF_SCOPE', 'NEEDS_PROPERTY', 'NOT_APPLICABLE',
]);

/** Emergency, restricted, unavailable, expired, cancelled and similar results keep only safe recovery actions (plan §6). */
export function resolveSuggestedNextActionMode(result: Pick<AskOperationResult, 'status' | 'blocks'>, operationId: string | null): SuggestedNextActionMode {
  if (RECOVERY_STATUSES.has(result.status)) return 'SAFE_RECOVERY_ONLY';
  const definition = operationId && operationId in ASK_OPERATION_DEFINITIONS ? getAskOperationDefinition(operationId as AskOperationId) : null;
  if (definition?.family === 'UNSAFE_OR_RESTRICTED') return 'SAFE_RECOVERY_ONLY';
  if (result.blocks.some((block) => block.type === 'BOUNDARY' && block.severity === 'EMERGENCY')) return 'SAFE_RECOVERY_ONLY';
  return 'NORMAL';
}

export interface FinalizeSuggestedNextActionsInput {
  result: AskOperationResult;
  executionId: string;
  userId: string;
  sessionId: string;
  /** The property this execution ran against. */
  propertyId: string | null;
  /** The operation that produced `result`, when one was resolved (clarification/recovery results may have none). */
  operationId: string | null;
  /** The message that triggered this result (suppressed as an already-asked prompt). */
  message: string;
  /**
   * Semantic-key hashes of outcomes this session already completed (incl. this turn's own selection). A loader is invoked only
   * once something has been nominated, so a result with no typed candidates costs no history read.
   */
  completedSemanticKeyHashes?: ReadonlySet<string> | (() => Promise<ReadonlySet<string>>);
  recentCompletedMessages?: readonly string[];
}

/** Injectable collaborators; production defaults read the database once and only when something was nominated. */
export interface FinalizeSuggestedNextActionsDeps {
  producers?: readonly SuggestedNextActionProducer[];
  clock?: SuggestedNextActionClock;
  /** Per-operation availability (health/authorization/audience reasons) for the property. */
  loadOperationAvailability?: (input: { userId: string; propertyId: string | null }) => Promise<EligibilityContext['operationAvailability']>;
  loadExecutionExpiresAt?: (executionId: string) => Promise<Date | null>;
  /** D-O11: semantic-key hashes of the verified launch outcome of this execution (empty for an ordinary typed question). */
  loadCurrentOutcomeKeyHashes?: (executionId: string) => Promise<ReadonlySet<string>>;
  entityValidatorFor?: typeof getSuggestedNextActionEntityValidator;
  /** Monotonic ms clock for the pipeline budget. */
  nowMs?: () => number;
}

async function defaultLoadOperationAvailability(input: { userId: string; propertyId: string | null }) {
  const propertyAccess = input.propertyId ? await ensurePropertyAccess(input.userId, input.propertyId) : null;
  return evaluateAskOperationAvailability({ propertyId: input.propertyId, propertyAccess, controls: readAskOperationalControls() });
}

async function defaultLoadExecutionExpiresAt(executionId: string): Promise<Date | null> {
  const row = await prisma.askExecution.findUnique({ where: { id: executionId }, select: { expiresAt: true } });
  return row?.expiresAt ?? null;
}

export interface FinalizeSuggestedNextActionsReport {
  mode: SuggestedNextActionMode;
  durationMs: number;
  droppedProducers: Array<{ producer: string; reason: 'ERROR' | 'BUDGET' }>;
  diagnostics: PolicyDiagnostics | null;
  contextFailed: boolean;
}

export async function finalizeSuggestedNextActionsWithReport(
  input: FinalizeSuggestedNextActionsInput,
  deps: FinalizeSuggestedNextActionsDeps = {},
): Promise<{ result: AskOperationResult; report: FinalizeSuggestedNextActionsReport }> {
  const nowMs = deps.nowMs ?? (() => Number(process.hrtime.bigint() / 1_000_000n));
  const startedAt = nowMs();
  const clock = deps.clock ?? systemSuggestedNextActionClock;
  const mode = resolveSuggestedNextActionMode(input.result, input.operationId);
  const report: FinalizeSuggestedNextActionsReport = { mode, durationMs: 0, droppedProducers: [], diagnostics: null, contextFailed: false };
  // The candidate field is internal: whatever happens below it is never persisted.
  const { suggestedNextActionCandidates: _internal, ...withoutCandidates } = input.result;
  const passthrough = (actions: SuggestedNextAction[]): AskOperationResult => ({ ...withoutCandidates, suggestedNextActions: actions });
  const finish = (result: AskOperationResult) => {
    report.durationMs = nowMs() - startedAt;
    askSuggestedActionsPipelineDurationSeconds.observe({ mode }, report.durationMs / 1000);
    return { result, report };
  };

  // 1. Nominations, each producer isolated and budget-checked (nonessential producers are the first to go).
  const producers = deps.producers ?? SUGGESTED_NEXT_ACTION_PRODUCERS;
  const nominations = new Map<string, readonly unknown[]>();
  const ordered = [...producers].sort((a, b) => Number(b.essential) - Number(a.essential));
  for (const producer of ordered) {
    if (nowMs() - startedAt > SUGGESTED_NEXT_ACTION_BUDGET.pipelineMs && !producer.essential) {
      report.droppedProducers.push({ producer: producer.id, reason: 'BUDGET' });
      askSuggestedActionsProducerFailuresTotal.inc({ producer: producer.id, reason: 'BUDGET' });
      continue;
    }
    try {
      nominations.set(producer.id, await producer.nominate({
        result: input.result, executionId: input.executionId, sourceOperationId: input.operationId, propertyId: input.propertyId, message: input.message,
      }));
    } catch (error) {
      report.droppedProducers.push({ producer: producer.id, reason: 'ERROR' });
      askSuggestedActionsProducerFailuresTotal.inc({ producer: producer.id, reason: 'ERROR' });
      logger.warn({ err: error, producer: producer.id, executionId: input.executionId }, '[ask-suggested-actions] producer dropped');
    }
  }
  const nominated = [...nominations.values()].reduce((sum, list) => sum + list.length, 0);
  askSuggestedActionsCandidatesTotal.inc({ stage: 'nominated', mode }, nominated);
  // Nothing nominated: no reads, no ledger beyond an empty list.
  if (nominated === 0) return finish(passthrough([]));

  // 2. One batched evaluation context. Any failure here ships the safe answer with no typed actions.
  let eligibility: EligibilityContext;
  try {
    const rawCandidates = [...nominations.values()].flat() as Array<{ entityContext?: { entityType?: unknown; entityId?: unknown } }>;
    const idsByType = new Map<string, Set<string>>();
    for (const candidate of rawCandidates) {
      const type = candidate?.entityContext?.entityType;
      const id = candidate?.entityContext?.entityId;
      if (typeof type === 'string' && typeof id === 'string') (idsByType.get(type) ?? idsByType.set(type, new Set()).get(type)!).add(id);
    }
    const [operationAvailability, entities, validatedEntityTypes] = await (async () => {
      const availability = await (deps.loadOperationAvailability ?? defaultLoadOperationAvailability)({ userId: input.userId, propertyId: input.propertyId });
      const entityMap = new Map<string, EntityRecordState>();
      const validated = new Set<string>();
      const validatorFor = deps.entityValidatorFor ?? getSuggestedNextActionEntityValidator;
      // One validator call per entity type, in parallel; a failed validator leaves its type unvalidated (fails closed).
      await Promise.all([...idsByType].map(async ([type, ids]) => {
        const validator = validatorFor(type);
        if (!validator) return;
        try {
          const records = await validator([...ids], { userId: input.userId, propertyId: input.propertyId });
          validated.add(type);
          for (const [id, state] of records) entityMap.set(`${type}:${id}`, state);
        } catch (error) {
          logger.warn({ err: error, entityType: type, executionId: input.executionId }, '[ask-suggested-actions] entity validator failed; type fails closed');
        }
      }));
      return [availability, entityMap, validated] as const;
    })();
    const result = input.result;
    eligibility = {
      mode,
      sourcePropertyId: input.propertyId,
      operationAvailability,
      operationRequiresProperty: (operationId) => operationId in ASK_OPERATION_DEFINITIONS && getAskOperationDefinition(operationId as AskOperationId).requiresProperty,
      operationTargetEntityType: (operationId) => (operationId in ASK_OPERATION_DEFINITIONS ? requiredAskTargetEntity(operationId as AskOperationId) : null),
      entities,
      validatedEntityTypes,
      pendingInteractionActive: Boolean(result.clarification || result.confirmation || (result.captureRequests?.length ?? 0) > 0),
      completedSemanticKeyHashes: typeof input.completedSemanticKeyHashes === 'function' ? await input.completedSemanticKeyHashes() : (input.completedSemanticKeyHashes ?? new Set()),
      askedMessageKeys: new Set([input.message, ...(input.recentCompletedMessages ?? [])].map(suggestionKey).filter(Boolean)),
      messageKey: suggestionKey,
      currentOutcomeKeyHashes: await (deps.loadCurrentOutcomeKeyHashes ?? loadCurrentOutcomeKeyHashes)(input.executionId),
    };
  } catch (error) {
    report.contextFailed = true;
    logger.warn({ err: error, executionId: input.executionId }, '[ask-suggested-actions] evaluation context failed; no typed actions');
    return finish(passthrough([]));
  }

  // 3. The pure policy.
  const policy = selectSuggestedNextActions({
    nominations,
    eligibility,
    presentationIdentities: collectPresentationIdentities(input.result.blocks, input.propertyId),
  });
  report.diagnostics = policy.diagnostics;
  askSuggestedActionsCandidatesTotal.inc({ stage: 'invalid', mode }, policy.diagnostics.invalidCandidates);
  askSuggestedActionsCandidatesTotal.inc({ stage: 'eligible', mode }, policy.diagnostics.eligible);
  askSuggestedActionsCandidatesTotal.inc({ stage: 'rejected', mode }, Object.values(policy.diagnostics.rejections).reduce((a, b) => a + b, 0));
  askSuggestedActionsCandidatesTotal.inc({ stage: 'selected', mode }, policy.selected.length);
  if (policy.selected.length === 0) return finish(passthrough([]));

  // 4. Materialize with deterministic ids, registry TTLs capped at the source execution expiry.
  let executionExpiresAt: Date | null = null;
  try {
    executionExpiresAt = await (deps.loadExecutionExpiresAt ?? defaultLoadExecutionExpiresAt)(input.executionId);
  } catch {
    // Selection re-applies the cap against the stored execution, so a missing value here only loses the early cap.
  }
  const now = clock.now();
  const actions = policy.selected.map((entry) => materializeSuggestedNextAction({
    candidate: entry.candidate, sourceExecutionId: input.executionId, now, executionExpiresAt, score: entry.score,
    mergedReasonCodes: entry.mergedReasonCodes,
    eligibility: { state: entry.verdict.state, reasonCodes: entry.verdict.reasonCodes, missingFactKeys: entry.verdict.missingFactKeys },
  }));
  return finish(passthrough(actions));
}

export async function finalizeSuggestedNextActions(input: FinalizeSuggestedNextActionsInput, deps?: FinalizeSuggestedNextActionsDeps): Promise<AskOperationResult> {
  return (await finalizeSuggestedNextActionsWithReport(input, deps)).result;
}
