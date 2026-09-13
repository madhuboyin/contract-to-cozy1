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
//   `sourceContext` is real, separate follow-up work, not attempted in this
//   slice -- this module calls `getCapabilitySuggestions` without a
//   `sourceContext`, which gives broad, property-relevant ranking rather
//   than goal-scoped ranking. Left explicit, not silently dropped.
import { getCapabilitySuggestions } from '../capabilityRecommendation.service';
import { canonicalCapabilityRegistry, type CapabilitySuggestion } from '../../productFramework/capabilities';
import type { AskPresentationBlock } from '../../productFramework/ask/ask.contract';
import { ASK_OPERATION_CAPABILITY } from '../intelligence/capabilitySkillGuidanceBridge.registry';
import type { AskOperationId } from './askOperationRegistry';

// FRD §27's own cited convention ("max shown: reuse the existing max-5
// convention... askNotificationContinuation's resultJson.suggestions").
export const MAX_ASK_NEXT_ACTIONS = 5;

function readinessLabel(state: 'READY' | 'NEEDS_CONTEXT'): string {
  return state === 'READY' ? 'Ready for this home' : 'More home details will improve the result';
}

type AskNextActionCapability = Extract<AskPresentationBlock, { type: 'CAPABILITY_LIST' }>['capabilities'][number];

/**
 * The pure half of this module: given an already-fetched suggestion list
 * (from `getCapabilitySuggestions`, the one I/O call this module makes),
 * the just-answered operation's own capability id (if any --
 * GROUNDED_GUIDANCE and other operations with no `ASK_OPERATION_CAPABILITY`
 * entry pass `undefined`), and the set of capabilities owned by this
 * session's own last-5 completed turns (FRD §27's `askSuggestionPolicy.ts`
 * repeat-filter requirement, applied here to a structured capability list
 * rather than message strings -- see this file's header), excludes both
 * from the result and maps the rest onto the `CAPABILITY_LIST` block's
 * exact capability shape. `getCapabilitySuggestions` already excludes
 * `UNAVAILABLE` candidates and applies its own property-wide dismissal-
 * cooldown suppression/governance, so no further filtering happens here
 * beyond these two exclusions and the bound. Exported for direct unit
 * testing (pure, no I/O -- `canonicalCapabilityRegistry` is an in-memory
 * manifest lookup, not a DB call, so this remains synchronous and DB-free).
 */
export function selectAskNextActionCapabilities(
  suggestions: readonly CapabilitySuggestion[],
  currentCapabilityId: string | undefined,
  recentCompletedCapabilityIds: ReadonlySet<string> = new Set(),
): AskNextActionCapability[] {
  return suggestions
    .filter((suggestion) => suggestion.capabilityId !== currentCapabilityId && !recentCompletedCapabilityIds.has(suggestion.capabilityId))
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
}): Promise<AskPresentationBlock | null> {
  const currentCapabilityId = ASK_OPERATION_CAPABILITY[input.operationId];
  const response = await getCapabilitySuggestions({
    propertyId: input.propertyId,
    userId: input.userId,
    surface: 'RELATED',
    limit: MAX_ASK_NEXT_ACTIONS,
  });
  const capabilities = selectAskNextActionCapabilities(response.suggestions, currentCapabilityId, input.recentCompletedCapabilityIds);
  if (!capabilities.length) return null;
  return {
    type: 'CAPABILITY_LIST',
    id: 'ask-next-actions',
    title: 'What comes next',
    description: 'Ranked from this answer and your live capability registry.',
    capabilities,
  };
}
