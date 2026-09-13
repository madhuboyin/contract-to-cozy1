// Ask Cozy Stage 3, Phase 4 (implementation plan §10; FRD §27 "Next Actions").
//
// A dedicated, deterministic next-action module -- moved OUT of the
// orchestrator per the FRD's own explicit requirement -- that replaces the
// narrow "related capabilities" append `executeOperation()` used to do
// inline (askOrchestrator.service.ts's own `currentCapabilityId`-gated
// block, pre-Phase-4). Deliberately reuses `getCapabilitySuggestions`
// (`capabilityRecommendation.service.ts`) -- the FULL candidate-generation
// → governance → suppression → `capabilityCandidateMatcher`/
// `capabilityRanking` (`baseScore`, `recommendation.triggerFamilies`) →
// explanation pipeline the FRD names -- rather than the lighter
// `resolveRelatedCapabilities` System A already wired into
// `capabilityResult()`'s own, separate CAPABILITY_DISCOVERY feature (left
// untouched: that is a deliberate, different UX for an explicit "what can
// help me" ask, not a next-action append).
//
// Corrections against the FRD's own text, verified against source before
// building this (same discipline as this program's Phase 0 corrections):
// - The FRD's "MISSING fact state" does not exist by that name anywhere in
//   this codebase. The real, already-computed distinction is
//   `CapabilitySuggestion.readiness.state: 'READY' | 'NEEDS_CONTEXT'`
//   (`capabilityExplanationBuilder.ts`) -- `getCapabilitySuggestions`
//   already excludes `UNAVAILABLE` candidates from its own output, so no
//   separate UNAVAILABLE-filtering step is needed here.
// - `CAPABILITY_SUGGESTION_SURFACES` includes a `'RELATED'` surface that is
//   declared in the enum/schema/route but has ZERO other callers anywhere
//   in the codebase today (verified by grep) -- adopted here rather than
//   adding a new `'ASK'` surface member, avoiding any change to the shared
//   surface enum, its Zod schema, or the standalone REST route that also
//   validates against it.
// - The FRD's "active DecisionThread" input is NOT `CapabilityRecommendationContext`'s
//   "journeys" source (`loadDefaultJourneys` reads `GuidanceJourney` rows,
//   a different model from `DecisionThread`) -- there is no existing
//   DecisionThread-aware `sourceContext` kind (`CAPABILITY_CONTEXT_SOURCE_KINDS`
//   has no `DECISION_THREAD` member). Wiring an active DecisionThread into
//   `sourceContext` remains real, separate follow-up work, not attempted
//   here. UPDATED (external review [P1]): this module now DOES derive a
//   `sourceContext` from `launchContext.actionId`/`journeyId` when present
//   (`deriveAskNextActionsSourceContext` below) -- HOME_ACTION/JOURNEY are
//   both real, already-supported `sourceContext` kinds, distinct from the
//   still-unsupported DECISION_THREAD case above.
//
// External review, second round: the sourceContext fix above only reaches
// turns launched from a Home Action or Journey card -- a plain typed
// question (no launchContext at all) still got fully property-wide
// ranking, so two unrelated questions about the same property ("Should I
// sell or rent?" vs. "What's my HVAC status?") produced near-identical
// next-action lists, contradicting FRD §27's "current request, current
// response... logical decision path" inputs. Threading the literal
// question/answer TEXT into `capabilityCandidateMatcher` was already
// scoped out above (no free-text scoring mechanism exists there, and
// building one is separate, much larger work). What FRD §27 actually asks
// this module to reuse is the matcher's existing STRUCTURED relationship
// data, not literal text -- and `currentCapabilityId` (derived from
// `ASK_OPERATION_CAPABILITY[operationId]`, already computed on every turn
// for exclusion) already names, in structured form, exactly what the
// current response was about, independent of whether a launchContext
// exists. `capability.recommendation.explicitRelatedCapabilityIds` is a
// real, populated, registry-validated relationship table (`RELATED_CAPABILITIES`,
// `capabilityDefinitionFactory.ts`; every id round-trips through
// `createToolCapabilityRegistry`'s own no-self-reference/no-unknown-id
// validation, `capabilityRegistry.ts:82-92`) -- the same data the matcher's
// own `COMPLETION_OUTPUT_RELATIONSHIP` match kind reads
// (`capabilityCandidateMatcher.ts:361-365`) and that the sibling "System A"
// related-capabilities feature (`capabilityRelatedResolver.ts`) also reads
// directly. Reusing it here (`explicitlyRelatedCapabilityIds` below) to
// stable-promote already-eligible, already-ranked suggestions that the
// just-answered capability explicitly names as related closes this for
// EVERY turn with an `ASK_OPERATION_CAPABILITY` entry, not only
// launch-context turns -- without inventing new free-text NLP scoring or a
// new `sourceContext` kind, and without touching the shared
// `capabilityRecommendation.service.ts` pipeline (this is a local,
// post-fetch reordering of an already-governed/ranked list, same
// `baseScore`-respecting order preserved within each partition). A turn
// whose operation has no `ASK_OPERATION_CAPABILITY` entry (GROUNDED_GUIDANCE)
// still falls back to unpromoted, property-wide ranking -- that residual
// case is a real, separate gap (no capability-of-record for that turn at
// all), not silently absorbed into this fix.
import { getCapabilitySuggestions } from '../capabilityRecommendation.service';
import { canonicalCapabilityRegistry, type CapabilityExplicitSourceContext, type CapabilitySuggestion } from '../../productFramework/capabilities';
import type { AskPresentationBlock } from '../../productFramework/ask/ask.contract';
import { ASK_OPERATION_CAPABILITY } from '../intelligence/capabilitySkillGuidanceBridge.registry';
import type { AskOperationId } from './askOperationRegistry';
import { sellHoldRentDecisionFamilyAdapter } from '../decisionPlatform/domainSnapshotAdapters';
import { logger } from '../../lib/logger';

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
// Left explicitly out of scope, not silently dropped: this closes the
// next-action-ranking half of "Extraction and next-action ranking also
// receive no active thread state" -- the EXTRACTION half (biasing what
// counts as a GOAL-shaped follow-up, or resolving a vague reply against the
// active thread without repeating the goal statement) is a materially
// different, larger change to the pre-filter/routing layer, not attempted
// here.
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
  const eligible = suggestions.filter((suggestion) => suggestion.capabilityId !== currentCapabilityId && !recentCompletedCapabilityIds.has(suggestion.capabilityId));
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
}): Promise<AskPresentationBlock | null> {
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
  const relatedCapabilityIds = new Set([...currentCapabilityRelatedIds, ...activeGoalRelatedIds]);
  const capabilities = selectAskNextActionCapabilities(
    response.suggestions,
    currentCapabilityId,
    input.recentCompletedCapabilityIds,
    relatedCapabilityIds,
  );
  if (!capabilities.length) return null;
  return {
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
  };
}
