// Ask Intelligence FRD §17/§21.2, Phase 9B. Pure, DB-free mapping from the
// existing governed Home Actions feed (homeActions.service.ts) to the
// versioned, explainable, channel-specific PRIORITY_LIST view. This module
// never re-ranks -- FRD §17.1 forbids materializing a second feed, so
// buildPriorityListView only annotates the feed's existing deterministic
// order (rankAndDeduplicateHomeActions' priority-bucket -> score -> id
// tie-break) with a consumer-facing category, comparative reason codes, and
// per-item state flags. Kept pure like homeChangeSummaryMapping.ts so it's
// unit-testable without a database.
//
// Bump PRIORITY_LIST_POLICY_VERSION whenever the category mapping, reason
// -code vocabulary, or truncation behavior below changes. Callers that
// cannot reproduce a requested policy version must fail visibly rather than
// silently reordering (FRD §21.2) -- this module has no notion of "requested
// version" itself; that check belongs to the Ask operation that persists and
// replays a PRIORITY_LIST block.

import type { RankedHomeAction } from '../homeActions.service';

export const PRIORITY_LIST_POLICY_VERSION = 'priority-list-policy-v1' as const;

export const CONSUMER_PRIORITY_CATEGORIES = ['DO_NOW', 'PLAN_SOON', 'WATCH', 'OPTIONAL', 'NO_ACTION'] as const;
export type ConsumerPriorityCategory = typeof CONSUMER_PRIORITY_CATEGORIES[number];

// FRD §17.3 output categories are a distinct, coarser vocabulary from the
// existing HOME_ACTION_PRIORITIES (NOW/SOON/PLAN/CONSIDER) -- this is the
// base mapping before the hard floors below apply.
const BASE_CATEGORY_BY_PRIORITY: Record<RankedHomeAction['priority'], ConsumerPriorityCategory> = {
  NOW: 'DO_NOW',
  SOON: 'PLAN_SOON',
  PLAN: 'WATCH',
  CONSIDER: 'OPTIONAL',
};

/**
 * FRD §17.2 hard floors and §17.3: "Engagement cannot override safety or
 * consent." A SAFETY_EMERGENCY item is always DO_NOW regardless of its
 * underlying priority bucket. A degraded recommendation response
 * (anything but AVAILABLE) never presents as a committed DO_NOW/PLAN_SOON
 * action, since no material action was actually approved for it -- it
 * downgrades to WATCH (or stays at its already-lower category).
 */
export function mapConsumerPriorityCategory(action: RankedHomeAction): ConsumerPriorityCategory {
  if (action.governance.safetyTier === 'SAFETY_EMERGENCY') return 'DO_NOW';
  const base = BASE_CATEGORY_BY_PRIORITY[action.priority];
  if (action.recommendationResponse.status !== 'AVAILABLE') {
    return base === 'DO_NOW' || base === 'PLAN_SOON' ? 'WATCH' : base;
  }
  return base;
}

export const COMPARATIVE_REASON_CODES = [
  'SAFETY_FLOOR',
  'HIGHER_CONSEQUENCE',
  'HIGHER_URGENCY',
  'HIGHER_CONFIDENCE',
  'HIGHER_HOUSEHOLD_RELEVANCE',
  'MORE_ACTIONABLE',
  'FEWER_MISSING_CONTEXT_ITEMS',
  'STABLE_TIE_BREAK',
] as const;
export type ComparativeReasonCode = typeof COMPARATIVE_REASON_CODES[number];

/**
 * FRD §21.2: "comparative reason codes sufficient to explain why each item
 * ranks above the following item." Derived from the same ranking.components
 * the existing free-text explanation already uses (scoreHomeAction), so this
 * never invents a new signal -- only relabels the existing ones as stable
 * codes instead of prose. `next` is the item immediately below in display
 * order, or null for the last visible item.
 */
export function comparativeReasonCodes(
  current: RankedHomeAction,
  next: RankedHomeAction | null,
): ComparativeReasonCode[] {
  if (!next) return [];
  if (current.governance.safetyTier === 'SAFETY_EMERGENCY' && next.governance.safetyTier !== 'SAFETY_EMERGENCY') {
    return ['SAFETY_FLOOR'];
  }
  const a = current.ranking.components;
  const b = next.ranking.components;
  const codes: ComparativeReasonCode[] = [];
  if (a.consequence > b.consequence) codes.push('HIGHER_CONSEQUENCE');
  if (a.urgency > b.urgency) codes.push('HIGHER_URGENCY');
  if (a.confidence > b.confidence) codes.push('HIGHER_CONFIDENCE');
  if (a.householdRelevance > b.householdRelevance) codes.push('HIGHER_HOUSEHOLD_RELEVANCE');
  if (a.actionability > b.actionability) codes.push('MORE_ACTIONABLE');
  if (a.missingContextPenalty < b.missingContextPenalty) codes.push('FEWER_MISSING_CONTEXT_ITEMS');
  return codes.length ? codes : ['STABLE_TIE_BREAK'];
}

export interface PriorityListItemState {
  suppressed: boolean;
  completed: boolean;
  unavailable: boolean;
  stale: boolean;
}

/**
 * The feed itself (filterGroundedHomeActions et al.) already excludes most
 * dismissed/superseded items before this module ever sees them -- these
 * flags cover the residual per-item states FRD §21.2 still requires be
 * disclosed for whatever remains eligible (e.g. an accepted-but-snoozed work
 * item, or a degraded recommendation response).
 *
 * `fatigueSuppressed` is the in-product fatigue/suppression signal (Phase
 * 9B): a user who rated this item "not useful" recently (see
 * homeActionUsefulnessFeedback.service.ts's cooldown window). Per FRD
 * §17.2 ("engagement cannot override safety or consent") this only ever
 * flags the item -- it never removes it from the list or from a DO_NOW
 * category.
 */
export function derivePriorityListItemState(action: RankedHomeAction, fatigueSuppressed = false): PriorityListItemState {
  return {
    suppressed: action.state === 'SNOOZED' || action.state === 'DEFERRED' || action.workItem?.state === 'DEFERRED' || fatigueSuppressed,
    completed: action.state === 'COMPLETED' || action.workItem?.state === 'VERIFIED' || action.workItem?.state === 'CLOSED',
    unavailable: action.recommendationResponse.status !== 'AVAILABLE',
    stale: action.evidence.some((item) => item.freshness === 'STALE'),
  };
}

export interface PriorityListItemView {
  homeActionId: string;
  title: string;
  consumerPriority: ConsumerPriorityCategory;
  comparativeReasonCodes: ComparativeReasonCode[];
  confidenceLabel: 'LOW' | 'MEDIUM' | 'HIGH';
  deadlineAt: string | null;
  dependencyRefs: string[];
  cta: { id: string; label: string; href: string; style: 'PRIMARY' | 'SECONDARY' | 'QUIET' } | null;
  watchState: string | null;
  suppressed: boolean;
  completed: boolean;
  unavailable: boolean;
  stale: boolean;
}

export interface PriorityListView {
  propertyId: string;
  rankingPolicyVersion: string;
  generatedAt: string;
  sourceFreshnessAt: string | null;
  items: PriorityListItemView[];
  truncated: boolean;
}

// FRD §17.2 "per-channel thresholds" -- how many ranked items a given
// surface is registered to display before truncating.
export const PRIORITY_LIST_CHANNEL_DISPLAY_LIMITS = {
  ASK: 8,
  CONCIERGE_HOME: 5,
} as const;
export type PriorityListChannel = keyof typeof PRIORITY_LIST_CHANNEL_DISPLAY_LIMITS;

export function buildPriorityListView(
  feed: { propertyId: string; generatedAt: string; actions: RankedHomeAction[] },
  channel: PriorityListChannel,
  options: { suppressedHomeActionIds?: ReadonlySet<string> } = {},
): PriorityListView {
  const displayLimit = PRIORITY_LIST_CHANNEL_DISPLAY_LIMITS[channel];
  const ordered = feed.actions;
  const visible = ordered.slice(0, displayLimit);

  const items = visible.map((action, index) => {
    const next = ordered[index + 1] ?? null;
    const state = derivePriorityListItemState(action, options.suppressedHomeActionIds?.has(action.id));
    const cta = !state.unavailable && action.primaryCta.href && action.primaryCta.label
      ? { id: action.id, label: action.primaryCta.label, href: action.primaryCta.href, style: 'PRIMARY' as const }
      : null;
    return {
      homeActionId: action.id,
      title: action.presentation?.headline ?? action.recommendedAction,
      consumerPriority: mapConsumerPriorityCategory(action),
      comparativeReasonCodes: comparativeReasonCodes(action, next),
      confidenceLabel: action.confidence.label,
      deadlineAt: action.timing.dueAt,
      dependencyRefs: action.relatedJourneyId ? [action.relatedJourneyId] : [],
      cta,
      watchState: cta ? null : action.recommendationResponse.safeNextAction,
      ...state,
    };
  });

  return {
    propertyId: feed.propertyId,
    rankingPolicyVersion: PRIORITY_LIST_POLICY_VERSION,
    generatedAt: new Date().toISOString(),
    sourceFreshnessAt: feed.generatedAt,
    items,
    truncated: ordered.length > displayLimit,
  };
}
