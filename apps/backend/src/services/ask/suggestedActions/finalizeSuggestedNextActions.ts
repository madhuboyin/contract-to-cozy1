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
import type { PolicyDiagnostics } from './suggestedNextActionPolicy';
import {
  resolveExactFourExemption, selectExactFourSuggestedNextActions, type ExactFourDiagnostics, type ExactFourInput,
} from './suggestedNextActionExactFourPolicy';
import { allowsOptionalResultEscapeRoutes, resolveSuggestedNextActionSlotClass, SUGGESTED_NEXT_ACTION_EXACT_FOUR_POLICY_VERSION, type LifecycleIdentity } from './suggestedNextActionExactFourRegistry';
import { recordExactFourDiagnostics } from './suggestedNextActionExactFourDiagnostics';
import {
  loadLifecycleState, offersFromExactFour, recordSuggestedActionOffers, type LifecycleState,
} from './askSuggestedActionLifecycle.service';
import { loadActionableProfileState } from './actionableCompletenessLoader';
import { SUGGESTED_NEXT_ACTION_BUDGET } from './suggestedNextActionRegistry';
import { SUGGESTED_NEXT_ACTION_PRODUCERS, type SuggestedNextActionProducer } from './suggestedNextActionProducers';
import { getSuggestedNextActionEntityValidator } from './suggestedNextActionEntityValidators';
import './entityValidators/registerAll';
import { collectPresentationIdentities, hasContextualPresentationActions } from './suggestedNextActionPresentationIdentities';
import { loadCurrentOutcomeKeyHashes } from './suggestedNextActionHistory';
import { systemSuggestedNextActionClock, type SuggestedNextActionClock } from './suggestedNextActionClock';
import { recordSuggestedActionImpressions, recordSuggestedActionSuppression } from './suggestedActionAnalytics';
import { loadUrgentHomeActionState } from './urgentWorkCandidates';
import { loadHomeOpportunityState } from './homeOpportunityCandidates';
import { loadActivePlanState } from './activePlanCandidates';
import { removeSelectedCapabilityDuplicates } from './capabilityRecommendationCandidates';
import { loadSuggestedActionSharedPropertyState } from './suggestedActionSharedPropertyState';

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
  /** Durable lifecycle (cooldowns, dismissals, completed outcomes, starter rotation) for this user and property; fails open with `ok: false`. */
  loadLifecycleState?: typeof loadLifecycleState;
  /** Persists what this answer offered (every offer; fails open). */
  recordOffers?: typeof recordSuggestedActionOffers;
  /** Actionable profile completeness, loaded ONLY when a nominated candidate can occupy a profile or opportunity slot. */
  loadActionableCompleteness?: (input: { userId: string; propertyId: string }) => Promise<{ fraction: number | null; audienceUncertain: boolean }>;
  /** Full actionable-profile state for the governed profile-gap producer. */
  loadActionableProfileState?: typeof loadActionableProfileState;
  /** Canonical Home Action NOW-bucket state for the governed urgent-work producer. */
  loadUrgentHomeActionState?: typeof loadUrgentHomeActionState;
  /** Approved O1-O3 why-now state from one authorized Property Context read. */
  loadHomeOpportunityState?: typeof loadHomeOpportunityState;
  /** Shared Property Context-backed profile/opportunity state; primarily injectable for environment-independent verification. */
  loadSharedPropertyState?: typeof loadSuggestedActionSharedPropertyState;
  /** Canonical cross-session active decision-thread state. */
  loadActivePlanState?: typeof loadActivePlanState;
  entityValidatorFor?: typeof getSuggestedNextActionEntityValidator;
  /** Monotonic ms clock for the pipeline budget. */
  nowMs?: () => number;
  recordImpressions?: typeof recordSuggestedActionImpressions;
  recordSuppression?: typeof recordSuggestedActionSuppression;
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
  /** The exact-four outcome (policy version, applicability, shortage and reasons); null when nothing was nominated or the context failed. */
  exactFour: ExactFourDiagnostics | null;
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
  const optionalEscapeRoutes = allowsOptionalResultEscapeRoutes(input.operationId, input.result.status);
  const contextualPresentationActions = hasContextualPresentationActions(input.result.blocks) && !optionalEscapeRoutes;
  const report: FinalizeSuggestedNextActionsReport = { mode, durationMs: 0, droppedProducers: [], diagnostics: null, exactFour: null, contextFailed: false };
  let sharedPropertyStatePromise: ReturnType<typeof loadSuggestedActionSharedPropertyState> | undefined;
  const sharedPropertyState = () => {
    if (!input.propertyId) throw new Error('Shared suggested-action property state requires a property.');
    return sharedPropertyStatePromise ??= (deps.loadSharedPropertyState ?? loadSuggestedActionSharedPropertyState)(
      { userId: input.userId, propertyId: input.propertyId },
      { now: () => clock.now() },
    );
  };
  let actionableProfileStatePromise: ReturnType<typeof loadActionableProfileState> | undefined;
  const resolvedActionableProfileLoader: typeof loadActionableProfileState = (loaderInput) => {
    if (!actionableProfileStatePromise) {
      actionableProfileStatePromise = deps.loadActionableProfileState
        ? deps.loadActionableProfileState(loaderInput)
        : sharedPropertyState().then((state) => state.profile);
    }
    return actionableProfileStatePromise;
  };
  const resolvedHomeOpportunityLoader: typeof loadHomeOpportunityState = deps.loadHomeOpportunityState
    ?? (() => sharedPropertyState().then((state) => state.opportunities));
  // The candidate field is internal: whatever happens below it is never persisted.
  const { suggestedNextActionCandidates: _internal, ...withoutCandidates } = input.result;
  const passthrough = (actions: SuggestedNextAction[]): AskOperationResult => ({
    ...withoutCandidates,
    // New results are typed-only. Historical stored results can still expose their legacy strings because the frontend
    // uses suggestedNextActionsGoverned to distinguish them, but carrying fresh raw strings forward would preserve the
    // duplicate, ungoverned producer surface Phase 5 removes.
    suggestions: [],
    suggestedNextActionsGoverned: true,
    suggestedNextActions: actions,
  });
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
    const elapsedMs = nowMs() - startedAt;
    if (elapsedMs > SUGGESTED_NEXT_ACTION_BUDGET.pipelineMs && !producer.essential) {
      report.droppedProducers.push({ producer: producer.id, reason: 'BUDGET' });
      askSuggestedActionsProducerFailuresTotal.inc({ producer: producer.id, reason: 'BUDGET' });
      continue;
    }
    try {
      const nomination = Promise.resolve(producer.nominate({
        result: input.result, executionId: input.executionId, sourceOperationId: input.operationId, propertyId: input.propertyId, message: input.message,
        userId: input.userId,
        loadActionableProfileState: resolvedActionableProfileLoader,
        loadUrgentHomeActionState: deps.loadUrgentHomeActionState ?? loadUrgentHomeActionState,
        loadHomeOpportunityState: resolvedHomeOpportunityLoader,
        loadActivePlanState: deps.loadActivePlanState ?? loadActivePlanState,
      }));
      if (producer.essential) {
        nominations.set(producer.id, await nomination);
      } else {
        const timeoutToken = Symbol('producer-budget');
        let timer: ReturnType<typeof setTimeout> | undefined;
        const remainingMs = Math.max(1, SUGGESTED_NEXT_ACTION_BUDGET.pipelineMs - elapsedMs);
        const timeout = new Promise<typeof timeoutToken>((resolve) => { timer = setTimeout(() => resolve(timeoutToken), remainingMs); timer.unref?.(); });
        const value = await Promise.race([nomination, timeout]);
        if (timer) clearTimeout(timer);
        if (value === timeoutToken) {
          // Keep the abandoned promise observed so a later rejection cannot become unhandled. Its result is intentionally ignored.
          void nomination.catch(() => undefined);
          report.droppedProducers.push({ producer: producer.id, reason: 'BUDGET' });
          askSuggestedActionsProducerFailuresTotal.inc({ producer: producer.id, reason: 'BUDGET' });
          continue;
        }
        nominations.set(producer.id, value);
      }
    } catch (error) {
      report.droppedProducers.push({ producer: producer.id, reason: 'ERROR' });
      askSuggestedActionsProducerFailuresTotal.inc({ producer: producer.id, reason: 'ERROR' });
      logger.warn({ err: error, producer: producer.id, executionId: input.executionId }, '[ask-suggested-actions] producer dropped');
    }
  }
  // Rich result controls are already the answer's contextual next actions. Keep any genuinely contextual compact nominations, but do
  // not manufacture a competing footer by padding it with generic starters (the source of the repeated four-chip row).
  if (contextualPresentationActions) {
    for (const [producerId, candidates] of nominations) {
      nominations.set(producerId, candidates.filter((candidate) => (candidate as { slotClass?: unknown } | null)?.slotClass !== 'CURATED_STARTER'));
    }
  }
  const nominated = [...nominations.values()].reduce((sum, list) => sum + list.length, 0);
  askSuggestedActionsCandidatesTotal.inc({ stage: 'nominated', mode }, nominated);
  // Nothing nominated: no reads, no ledger beyond an empty list. A property-scoped, ordinary (not recovery, not pending) turn that nominated
  // NOTHING (for example every starter producer dropped for budget) is still reported as the approved bounded shortage diagnostic, never silently.
  if (nominated === 0) {
    if (contextualPresentationActions) {
      report.exactFour = {
        policyVersion: SUGGESTED_NEXT_ACTION_EXACT_FOUR_POLICY_VERSION,
        applicability: 'EXEMPT',
        exemptReason: 'CONTEXTUAL_ACTIONS_IN_RESULT',
      };
      recordExactFourDiagnostics(report.exactFour);
      return finish(passthrough([]));
    }
    const pending = Boolean(input.result.clarification || input.result.confirmation
      || (!optionalEscapeRoutes && (input.result.captureRequests?.length ?? 0) > 0));
    if (mode === 'NORMAL' && input.propertyId && !pending) {
      const shortageReasons: Array<'NO_CANDIDATES' | 'PRODUCER_DROPPED'> = ['NO_CANDIDATES'];
      if (report.droppedProducers.length > 0) shortageReasons.push('PRODUCER_DROPPED');
      report.exactFour = {
        policyVersion: SUGGESTED_NEXT_ACTION_EXACT_FOUR_POLICY_VERSION, applicability: 'EXACT_FOUR', shortage: 4, shortageReasons, selectedBySlot: {},
        belowCompletenessThreshold: false, completenessUnknown: false, audienceUncertain: false, slotClassDenied: 0, signalClaimsDenied: 0,
        startersWithinRotationWindow: 0, opportunityReserved: false,
      };
      recordExactFourDiagnostics(report.exactFour);
    }
    return finish(passthrough([]));
  }

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
      // READY_WITH_LIMITATIONS capture prompts on the two registered read surfaces are optional CTAs. They do not become an active,
      // focus-owning interaction until the homeowner launches the capture operation; the footer remains an escape route meanwhile.
      pendingInteractionActive: Boolean(result.clarification || result.confirmation
        || (!optionalEscapeRoutes && (result.captureRequests?.length ?? 0) > 0)),
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

  // 3. Exact-four inputs (lifecycle, completeness) and the pure policy. Every extra read is lazy and fails open: a lifecycle or completeness
  // outage can never strip the row of actions, and is reported as a bounded diagnostic reason instead.
  const nominatedRaw = [...nominations.values()].flat() as Array<Record<string, any>>;
  const exemptReason = resolveExactFourExemption(eligibility, contextualPresentationActions);
  const upstreamShortageReasons: Array<'PRODUCER_DROPPED' | 'CONTEXT_FAILED'> = [];
  if (report.droppedProducers.length > 0) upstreamShortageReasons.push('PRODUCER_DROPPED');
  let lifecycle: LifecycleState | null = null;
  let actionableCompleteness: number | null = 1;
  let audienceUncertain = false;
  if (!exemptReason && input.propertyId) {
    const starterIdentities: LifecycleIdentity[] = nominatedRaw
      .filter((c) => c?.slotClass === 'CURATED_STARTER' && typeof c.operationId === 'string' && typeof c.outcomeKey === 'string')
      .map((c) => ({
        operationId: c.operationId, outcomeKey: c.outcomeKey,
        entityType: typeof c.entityContext?.entityType === 'string' ? c.entityContext.entityType : null,
        entityId: typeof c.entityContext?.entityId === 'string' ? c.entityContext.entityId : null,
      }));
    lifecycle = await (deps.loadLifecycleState ?? loadLifecycleState)({ userId: input.userId, propertyId: input.propertyId, now: clock.now(), rotationIdentities: starterIdentities });
    if (!lifecycle.ok) upstreamShortageReasons.push('CONTEXT_FAILED');
    // Completeness only changes the order of profile-first and opportunity slots, so it is loaded only when a nominated candidate could occupy one.
    const canUseProfileOrOpportunity = nominatedRaw.some((c) => {
      try {
        const slotClass = resolveSuggestedNextActionSlotClass({
          slotClass: c.slotClass, source: c.source, tier: c.tier, traits: { continuesPending: Boolean(c.traits?.continuesPending) }, entityContext: { entityId: c.entityContext?.entityId ?? null },
        });
        return slotClass === 'PROFILE_GAP' || slotClass === 'HOME_OPPORTUNITY' || slotClass === 'GOVERNED_CAPABILITY';
      } catch { return false; }
    });
    if (canUseProfileOrOpportunity) {
      try {
        const completeness = deps.loadActionableCompleteness
          ? await deps.loadActionableCompleteness({ userId: input.userId, propertyId: input.propertyId })
          : await resolvedActionableProfileLoader({ userId: input.userId, propertyId: input.propertyId });
        actionableCompleteness = completeness.fraction;
        audienceUncertain = completeness.audienceUncertain;
      } catch (error) {
        actionableCompleteness = null;
        logger.warn({ err: error, executionId: input.executionId }, '[ask-suggested-actions] actionable completeness failed; profile-first applies');
      }
    }
  }
  const exactFourInput: ExactFourInput = {
    nominations,
    eligibility,
    presentationIdentities: collectPresentationIdentities(input.result.blocks, input.propertyId),
    actionableCompleteness,
    audienceUncertain,
    cooldownLifecycleKeys: lifecycle?.cooldownKeys,
    completedLifecycleKeys: lifecycle?.completedKeys,
    starterLastOfferedAtMs: lifecycle?.lastOfferedAtMs,
    rotationNowMs: clock.now().getTime(),
    currentOperationId: input.operationId,
    contextualPresentationActions,
    upstreamShortageReasons,
  };
  const policy = selectExactFourSuggestedNextActions(exactFourInput);
  report.exactFour = policy.exactFour;
  recordExactFourDiagnostics(policy.exactFour);
  report.diagnostics = policy.diagnostics;
  askSuggestedActionsCandidatesTotal.inc({ stage: 'invalid', mode }, policy.diagnostics.invalidCandidates);
  askSuggestedActionsCandidatesTotal.inc({ stage: 'eligible', mode }, policy.diagnostics.eligible);
  askSuggestedActionsCandidatesTotal.inc({ stage: 'rejected', mode }, Object.values(policy.diagnostics.rejections).reduce((a, b) => a + b, 0));
  askSuggestedActionsCandidatesTotal.inc({ stage: 'selected', mode }, policy.selected.length);
  if (input.propertyId) (deps.recordSuppression ?? recordSuggestedActionSuppression)({
    userId: input.userId, propertyId: input.propertyId, executionId: input.executionId, rejections: policy.diagnostics.rejections,
  });
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
  if (input.propertyId) (deps.recordImpressions ?? recordSuggestedActionImpressions)({ userId: input.userId, propertyId: input.propertyId, executionId: input.executionId, actions });
  // 5. Persist what was offered (exact-four answers only; every offer, so selection, completion and starter rotation have a row). Fail open.
  if (policy.exactFour.applicability === 'EXACT_FOUR' && input.propertyId) {
    await (deps.recordOffers ?? recordSuggestedActionOffers)({ userId: input.userId, propertyId: input.propertyId, offers: offersFromExactFour(policy.selected, policy.evaluated), now });
  }
  let presented = passthrough(actions);
  // The compact action now owns this destination. Keeping the legacy handoff card would duplicate the same
  // registered operation on two surfaces and bypass the shared row's ordering/lifecycle semantics.
  if (actions.some((action) => action.provenance.source === 'SKILL_HANDOFF')) presented.skillHandoff = null;
  presented = removeSelectedCapabilityDuplicates(presented);
  return finish(presented);
}

export async function finalizeSuggestedNextActions(input: FinalizeSuggestedNextActionsInput, deps?: FinalizeSuggestedNextActionsDeps): Promise<AskOperationResult> {
  return (await finalizeSuggestedNextActionsWithReport(input, deps)).result;
}
