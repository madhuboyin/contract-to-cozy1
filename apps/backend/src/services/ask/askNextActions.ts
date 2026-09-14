// Ask next actions reuse governed capability recommendations and canonical
// context capture. Turn topics and active goals promote relevant candidates.
import { getCapabilitySuggestions } from '../capabilityRecommendation.service';
import { canonicalCapabilityRegistry, type CapabilityExplicitSourceContext, type CapabilitySuggestion } from '../../productFramework/capabilities';
import type { AskCaptureRequest, AskPresentationBlock } from '../../productFramework/ask/ask.contract';
import { ASK_OPERATION_CAPABILITY } from '../intelligence/capabilitySkillGuidanceBridge.registry';
import type { AskOperationId } from './askOperationRegistry';
import { sellHoldRentDecisionFamilyAdapter } from '../decisionPlatform/domainSnapshotAdapters';
import { getCaptureDefinitionForFact, CONTEXT_CAPTURE_DEFINITIONS } from '../../modules/propertyContext/catalog/captureRegistry';
import { evaluateFeatureContext } from '../../modules/propertyContext/application/evaluateFeatureContext';
import { askTopicTokens } from './askPromptMinimization';
import { logger } from '../../lib/logger';

// Existing scalar capture payloads remain readable; new cards use canonical schemas.
export const NEXT_ACTION_MISSING_FACT_CAPTURE_KEY = 'NEXT_ACTION_MISSING_FACT';

export const NEXT_ACTION_FACT_QUESTIONS = Object.fromEntries(
  CONTEXT_CAPTURE_DEFINITIONS.filter((definition) => definition.mode === 'SCALAR')
    .flatMap((definition) => definition.factKeys.map((key) => [key, { question: definition.question, inputSchema: definition.inputSchema }]))
);

export const NEXT_ACTION_CONTEXT_PREFIX = 'NEXT_ACTION_CONTEXT:';
export const nextActionContextOperation = (factKey: string) => factKey.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();

export async function buildNextActionContextCapture(propertyId: string, userId: string, factKey: string): Promise<AskCaptureRequest | null> {
  const definition = getCaptureDefinitionForFact(factKey);
  if (!definition || definition.inputSchema.type === 'RELATIONAL_UPDATE') return null;
  const evaluation = await evaluateFeatureContext(propertyId, userId, {
    featureKey: 'ASK_NEXT_ACTION', operationKey: nextActionContextOperation(factKey),
  });
  const requirement = evaluation.requirements[0];
  if (!requirement) return null;
  return {
    requirementId: requirement.requirementId,
    captureKey: NEXT_ACTION_CONTEXT_PREFIX + factKey,
    classification: requirement.classification, state: requirement.state,
    title: requirement.capture.title, question: requirement.capture.question,
    helpText: requirement.capture.helpText ?? null,
    inputSchema: requirement.capture.inputSchema, currentAnswer: requirement.currentAnswer,
    allowNotSure: requirement.capture.allowNotSure, sensitivity: requirement.capture.sensitivity,
    destinationLabel: 'Saved to this property’s Home Record', confirmationText: null,
    expectedContextVersion: evaluation.contextVersion,
  };
}

// A lexical relevance signal supplements governed ranking for unclassified
// questions; it never manufactures eligibility or bypasses suppression.
export function conversationRelatedCapabilityIds(message: string, suggestions: readonly CapabilitySuggestion[]): ReadonlySet<string> {
  const question = askTopicTokens(message);
  return new Set(suggestions.filter((suggestion) => {
    const terms = askTopicTokens([suggestion.capabilityId, suggestion.label, suggestion.shortDescription, suggestion.expectedOutcome].join(' '));
    return [...question].some((token) => terms.has(token));
  }).map((suggestion) => suggestion.capabilityId));
}

function firstSupportedMissingFactKey(missingFactKeys: readonly string[]): string | null {
  return missingFactKeys.find((factKey) => factKey in NEXT_ACTION_FACT_QUESTIONS) ?? null;
}

/**
 * Builds the "tell me about X" captureRequest FRD §27 asks for. Exported
 * for direct unit testing (pure, no I/O). `contextVersion` is the routed
 * turn's own execution's stored contextVersion -- submitNextActionMissingFactCapture
 * (askOrchestrator.service.ts) re-checks it at submit time, the same
 * staleness pattern every other capture branch in that file already uses.
 */
export function nextActionMissingFactCaptureRequest(factKey: string, contextVersion: string): AskCaptureRequest {
  const definition = NEXT_ACTION_FACT_QUESTIONS[factKey];
  return {
    requirementId: `next-action-fact-${factKey}`,
    captureKey: NEXT_ACTION_MISSING_FACT_CAPTURE_KEY,
    classification: 'ENHANCEMENT_ACCURACY',
    state: 'UNKNOWN',
    title: 'Improve this answer',
    question: definition.question,
    helpText: 'Answering helps Cozy give a more complete recommendation for this home.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'factKey', label: 'Fact', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: factKey, value: factKey }] } },
      { key: 'value', label: 'Answer', required: true, inputSchema: definition.inputSchema },
    ] },
    currentAnswer: { factKey },
    allowNotSure: true,
    sensitivity: 'STANDARD',
    destinationLabel: 'Saved to this property\'s Home Record',
    confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

// FRD §27's own cited convention ("max shown: reuse the existing max-5
// convention... askNotificationContinuation's resultJson.suggestions").
export const MAX_ASK_NEXT_ACTIONS = 5;

// External review [P2]: getCapabilitySuggestions was previously called with
// `limit: MAX_ASK_NEXT_ACTIONS` (5), and this module's own exclusions
// (current + recently-completed capabilities) are applied AFTER that fetch
// -- so if 5 or fewer of those 5 candidates survived exclusion, this module
// returned nothing or a short list even when real, eligible lower-ranked
// candidates existed beyond the old 5-item cutoff. Fetching
// CapabilityRecommendationContextSchema.limit's own hard ceiling
// (capabilityRecommendationContext.ts, `.max(10)`) instead gives exclusion
// real room to work with before the final MAX_ASK_NEXT_ACTIONS slice inside
// selectAskNextActionCapabilities.
const CAPABILITY_SUGGESTIONS_FETCH_LIMIT = 10;

function readinessLabel(state: 'READY' | 'NEEDS_CONTEXT'): string {
  return state === 'READY' ? 'Ready for this home' : 'More home details will improve the result';
}

type AskNextActionCapability = Extract<AskPresentationBlock, { type: 'CAPABILITY_LIST' }>['capabilities'][number];

/**
 * External review, second round: the structured, registry-validated
 * counterpart to `deriveAskNextActionsSourceContext` (see this file's
 * header) -- resolves the just-answered capability's own declared
 * `explicitRelatedCapabilityIds` so a plain typed question (no launch
 * context) can still promote genuinely on-topic suggestions. Returns an
 * empty set when the operation has no `ASK_OPERATION_CAPABILITY` entry, or
 * when that capability declares no related capabilities -- both real,
 * unpromoted fallback cases, not errors. Exported for direct unit testing
 * (pure, no I/O).
 */
export function explicitlyRelatedCapabilityIds(
  currentCapabilityId: string | undefined,
): ReadonlySet<string> {
  if (!currentCapabilityId) return new Set();
  const capability = canonicalCapabilityRegistry.getById(currentCapabilityId);
  return new Set(capability?.recommendation.explicitRelatedCapabilityIds ?? []);
}

// External review, Phase 6 (FRD §8.5/§21; implementation plan §12): an
// active long-lived goal thread never influenced next-action ranking at
// all -- `AskSession.activeDecisionThreadId` (the field
// `conversationalCapture.ts`'s `processGoalCandidate` writes) had zero
// readers anywhere in the backend, confirmed by grep before writing this.
// FRD §8.5's own scenario is explicit: "next-action scan biased toward the
// active thread surfaces Seller Prep/sell-hold-rent capabilities... without
// the homeowner needing to know either exists" -- and Phase 4's own header
// comment above already named this exact gap ("there is no existing
// DecisionThread-aware sourceContext kind... left as explicit, undone
// follow-up (candidate for Phase 6...)").
//
// Deliberately does NOT read `AskSession.activeDecisionThreadId` -- that
// field is session-scoped, and the acceptance criterion this fix serves
// ("resumes correctly across a new session") requires exactly the opposite:
// a brand-new session has no cached value yet, so relying on it would fail
// the one case this fix most needs to cover. Uses
// `sellHoldRentDecisionFamilyAdapter.selectThread` instead -- the SAME
// canonical, property-scoped `activeIdentityKey` lookup
// `createOrResumeThread` already resolves against
// (`snapshotDecisionFamilyAdapter.ts`), confirmed genuinely read-only (a
// `findMany` plus one freshness read, no writes) before reusing it here for
// a presentational ranking signal. Returns the sell-hold-rent goal's own
// directly-named related capabilities (not `explicitRelatedCapabilityIds`'s
// indirection -- `'sell-hold-rent'`'s own registry entry does not list
// `'seller-prep'` directly, but FRD §8.5 names both explicitly) whenever an
// active thread exists for this property, regardless of whether the
// just-answered operation had anything to do with selling -- an active
// long-lived goal is exactly the kind of standing context that should bias
// ranking on ANY turn, not only a sell/hold/rent-routed one.
//
const SELL_HOLD_RENT_GOAL_RELATED_CAPABILITY_IDS = ['sell-hold-rent', 'seller-prep'] as const;

async function activeSellHoldRentGoalRelatedCapabilityIds(propertyId: string): Promise<ReadonlySet<string>> {
  try {
    const selection = await sellHoldRentDecisionFamilyAdapter.selectThread(propertyId, propertyId);
    return selection.kind === 'UNIQUE' ? new Set(SELL_HOLD_RENT_GOAL_RELATED_CAPABILITY_IDS) : new Set();
  } catch (error) {
    // Never let this presentational ranking signal turn a successful answer
    // into a failure -- same fail-open convention as every other optional
    // signal buildAskNextActionsBlock reads.
    logger.warn({ error, propertyId }, '[ask-next-actions] active sell-hold-rent thread lookup failed');
    return new Set();
  }
}

/**
 * Stable-promotes suggestions the just-answered capability explicitly
 * names as related ahead of the rest, preserving each partition's incoming
 * (already `baseScore`-ranked) relative order. A no-op when
 * `relatedCapabilityIds` is empty, so callers with no structured turn
 * signal see unchanged, property-wide ordering.
 */
function prioritizeExplicitlyRelated<T extends { capabilityId: string }>(
  suggestions: readonly T[],
  relatedCapabilityIds: ReadonlySet<string>,
): T[] {
  if (relatedCapabilityIds.size === 0) return [...suggestions];
  const related: T[] = [];
  const rest: T[] = [];
  for (const suggestion of suggestions) {
    (relatedCapabilityIds.has(suggestion.capabilityId) ? related : rest).push(suggestion);
  }
  return [...related, ...rest];
}

/**
 * The pure half of this module: given an already-fetched suggestion list
 * (from `getCapabilitySuggestions`, the one I/O call this module makes),
 * the just-answered operation's own capability id (if any --
 * GROUNDED_GUIDANCE and other operations with no `ASK_OPERATION_CAPABILITY`
 * entry pass `undefined`), the set of capabilities owned by this session's
 * own last-5 completed turns (FRD §27's `askSuggestionPolicy.ts`
 * repeat-filter requirement, applied here to a structured capability list
 * rather than message strings -- see this file's header), and the current
 * capability's own explicitly-related capability ids (external review,
 * second round -- see this file's header and `explicitlyRelatedCapabilityIds`
 * above), excludes the first two from the result, promotes the third, and
 * maps what remains onto the `CAPABILITY_LIST` block's exact capability
 * shape. `getCapabilitySuggestions` already excludes `UNAVAILABLE`
 * candidates and applies its own property-wide dismissal-cooldown
 * suppression/governance, so no further filtering happens here beyond
 * these exclusions, the promotion, and the bound. Exported for direct unit
 * testing (pure, no I/O -- `canonicalCapabilityRegistry` is an in-memory
 * manifest lookup, not a DB call, so this remains synchronous and DB-free).
 */
export function selectAskNextActionCapabilities(
  suggestions: readonly CapabilitySuggestion[],
  currentCapabilityId: string | undefined,
  recentCompletedCapabilityIds: ReadonlySet<string> = new Set(),
  relatedCapabilityIds: ReadonlySet<string> = new Set(),
): AskNextActionCapability[] {
  const eligible = suggestions.filter((suggestion) => {
    if (suggestion.capabilityId === currentCapabilityId || recentCompletedCapabilityIds.has(suggestion.capabilityId)) return false;
    if (suggestion.readiness.state === 'READY') return true;
    return (suggestion.readiness.missingFactKeys ?? []).some((key) => {
      const capture = getCaptureDefinitionForFact(key);
      return capture && capture.inputSchema.type !== 'RELATIONAL_UPDATE';
    });
  });
  return prioritizeExplicitlyRelated(eligible, relatedCapabilityIds)
    .slice(0, MAX_ASK_NEXT_ACTIONS)
    .flatMap((suggestion) => {
      const capability = canonicalCapabilityRegistry.getById(suggestion.capabilityId);
      if (!capability) return [];
      return [{
        id: suggestion.capabilityId,
        label: suggestion.label,
        description: suggestion.shortDescription,
        expectedOutput: suggestion.expectedOutcome,
        href: suggestion.launch.href,
        readiness: suggestion.readiness.state,
        readinessLabel: readinessLabel(suggestion.readiness.state),
        readinessReasons: suggestion.readiness.explanations.slice(0, 5),
        releaseStage: capability.governance.releaseStage,
      }];
    });
}

// Minimal shape of `CreateAskExecutionRequest['launchContext']`
// (ask.contract.ts) this module actually needs -- kept narrow and
// structural rather than importing the full request schema type, matching
// this file's existing minimal-import style. The caller's fuller object is
// structurally compatible.
export interface AskNextActionsLaunchContext {
  actionId?: string | null;
  journeyId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/**
 * External review [P1]: `getCapabilitySuggestions` was previously called
 * with no `sourceContext` at all, so ranking was always broad/property-wide
 * regardless of what the just-answered turn was actually about -- "Should I
 * sell or rent?" and "What's my HVAC status?" against the same property
 * produced near-identical next-action candidates, contradicting FRD §27's
 * contextual-next-steps requirement. `getCapabilitySuggestions`'s one real,
 * already-registered scoping mechanism is `sourceContext`
 * (HOME_ACTION/JOURNEY/PROJECT/...,`capabilityRecommendationContext.ts`) --
 * askOrchestrator.service.ts's own `continuity` object (built from this
 * exact launchContext, in `executeOperation`'s `finalize` closure) already
 * proves `launchContext.actionId`/`journeyId` are real, populated signals
 * for a meaningful fraction of turns: any Ask session launched from a Home
 * Action or Journey card carries one. This closes the "decision path" half
 * of the review's finding. It deliberately does NOT thread the literal
 * question/answer text into ranking -- no existing mechanism in
 * `capabilityCandidateMatcher.ts` scores free text, and building that is
 * separate, larger work, not attempted here. When neither signal is present
 * (a plain typed question with no launch context), this returns `null` and
 * ranking falls back to the prior property-wide behavior, unchanged.
 */
export function deriveAskNextActionsSourceContext(
  launchContext: AskNextActionsLaunchContext | null | undefined,
): CapabilityExplicitSourceContext | null {
  if (launchContext?.actionId) {
    return {
      kind: 'HOME_ACTION',
      id: launchContext.actionId,
      entityType: launchContext.entityType ?? null,
      entityId: launchContext.entityId ?? null,
    };
  }
  if (launchContext?.journeyId) {
    return { kind: 'JOURNEY', id: launchContext.journeyId };
  }
  return null;
}

export interface AskNextActionsResult {
  block: AskPresentationBlock | null;
  // External review, 2026-09-13 (FRD §27's "tell me about X" requirement --
  // see NEXT_ACTION_FACT_QUESTIONS's own header comment above). Bounded to
  // at most one: the top-level response's own captureRequests array is
  // capped at 3 for the whole turn, and this module only ever runs when
  // that array is already empty (askOrchestrator.service.ts's own gate) --
  // offering more than one here would spend that shared budget on
  // next-actions alone rather than leaving room for whatever the routed
  // operation itself needs on a later turn.
  captureRequests: AskCaptureRequest[];
}

/**
 * Builds one `CAPABILITY_LIST` block of deterministic, ranked next-action
 * candidates for the property just answered against -- or `null` when
 * nothing qualifies (no candidates, or the only candidate is the
 * just-answered operation's own capability). Never throws: any failure
 * inside `getCapabilitySuggestions` (a source load failing closed, a
 * governance/suppression error) propagates to the caller exactly like
 * every other optional-continuity block this orchestrator already builds
 * this way (`executeOperation`'s own surrounding try/catch), so a next-
 * actions failure never turns a successful primary answer into one.
 */
export async function buildAskNextActionsBlock(input: {
  propertyId: string;
  userId: string;
  operationId: AskOperationId;
  recentCompletedCapabilityIds?: ReadonlySet<string>;
  launchContext?: AskNextActionsLaunchContext | null;
  // External review, 2026-09-13: the routed turn's own contextVersion, used
  // only to stamp the "tell me about X" captureRequest's expectedContextVersion
  // -- submitNextActionMissingFactCapture (askOrchestrator.service.ts)
  // re-checks it against the execution's own stored value at submit time.
  // Optional (a turn with no contextVersion simply never gets this prompt,
  // same as any other capture requirement that needs one to guard staleness).
  contextVersion?: string | null;
  message?: string;
}): Promise<AskNextActionsResult> {
  const currentCapabilityId = ASK_OPERATION_CAPABILITY[input.operationId];
  const sourceContext = deriveAskNextActionsSourceContext(input.launchContext);
  const [response, currentCapabilityRelatedIds, activeGoalRelatedIds] = await Promise.all([
    getCapabilitySuggestions({
      propertyId: input.propertyId,
      userId: input.userId,
      surface: 'RELATED',
      limit: CAPABILITY_SUGGESTIONS_FETCH_LIMIT,
      sourceContext,
    }),
    Promise.resolve(explicitlyRelatedCapabilityIds(currentCapabilityId)),
    activeSellHoldRentGoalRelatedCapabilityIds(input.propertyId),
  ]);
  const relatedCapabilityIds = new Set([...currentCapabilityRelatedIds, ...activeGoalRelatedIds, ...conversationRelatedCapabilityIds(input.message ?? '', response.suggestions)]);
  const capabilities = selectAskNextActionCapabilities(
    response.suggestions,
    currentCapabilityId,
    input.recentCompletedCapabilityIds,
    relatedCapabilityIds,
  );
  if (!capabilities.length) return { block: null, captureRequests: [] };

  const captureRequests: AskCaptureRequest[] = [];
  {
    const suggestionsById = new Map(response.suggestions.map((suggestion) => [suggestion.capabilityId, suggestion]));
    for (const capability of capabilities) {
      if (capability.readiness !== 'NEEDS_CONTEXT') continue;
      for (const factKey of suggestionsById.get(capability.id)?.readiness.missingFactKeys ?? []) {
        const request = await buildNextActionContextCapture(input.propertyId, input.userId, factKey);
        if (request) { captureRequests.push(request); break; }
      }
      if (captureRequests.length) break;
    }
  }

  return {
    block: {
      type: 'CAPABILITY_LIST',
      id: 'ask-next-actions',
      title: 'What comes next',
      // External review [P1]: this previously said "Ranked from this answer"
      // unconditionally, which overstated the behavior even before that fix
      // (no answer content ever fed ranking). External review, second round:
      // widened to also cover the explicit-related-capability promotion
      // above, which is genuinely "ranked for what you just did" even with
      // no launch context. Phase 6 review: also true whenever an active
      // long-lived goal thread biased the ranking, independent of the
      // just-answered operation.
      description: (sourceContext || relatedCapabilityIds.size > 0)
        ? 'Ranked for what you just did, from your live capability registry.'
        : 'From your live capability registry, prioritized for this property.',
      capabilities,
    },
    captureRequests,
  };
}
