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
//   still-unsupported DECISION_THREAD case above. A turn with neither
//   signal (a plain typed question) still gets broad, property-relevant
//   ranking, not goal-scoped -- that residual gap is what remains open.
import { getCapabilitySuggestions } from '../capabilityRecommendation.service';
import { canonicalCapabilityRegistry, type CapabilityExplicitSourceContext, type CapabilitySuggestion } from '../../productFramework/capabilities';
import type { AskPresentationBlock } from '../../productFramework/ask/ask.contract';
import { ASK_OPERATION_CAPABILITY } from '../intelligence/capabilitySkillGuidanceBridge.registry';
import type { AskOperationId } from './askOperationRegistry';

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
  const response = await getCapabilitySuggestions({
    propertyId: input.propertyId,
    userId: input.userId,
    surface: 'RELATED',
    limit: CAPABILITY_SUGGESTIONS_FETCH_LIMIT,
    sourceContext,
  });
  const capabilities = selectAskNextActionCapabilities(response.suggestions, currentCapabilityId, input.recentCompletedCapabilityIds);
  if (!capabilities.length) return null;
  return {
    type: 'CAPABILITY_LIST',
    id: 'ask-next-actions',
    title: 'What comes next',
    // External review [P1]: this previously said "Ranked from this answer"
    // unconditionally, which overstated the behavior even before this fix
    // (no answer content ever fed ranking) -- now genuinely true only when
    // a real sourceContext was derived from the launch context above.
    description: sourceContext
      ? 'Ranked for what you just did, from your live capability registry.'
      : 'From your live capability registry, prioritized for this property.',
    capabilities,
  };
}
