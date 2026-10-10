// Explore with Cozy, Phase 3 (docs/product/ASK_COZY_LIGHTWEIGHT_CAPABILITY_DISCOVERY_IMPLEMENTATION_PLAN.md): one owning-domain indicator per
// topic, read from the service that owns the meaning. None of them substitutes an adjacent metric:
//   HOME_CARE    "N need attention"  the Home Actions attention section Concierge Home already reads, minus suppressed, completed,
//                                    unavailable, stale and watch-only/no-action items. Not a raw maintenance-task count.
//   DIY_PROJECTS "N active"          DIY projects in PLANNING or IN_PROGRESS. Contractor Project Tracker projects and closed DIY projects are out.
//   HOME_RECORD  "N% complete"       Property Context completeness (getContextCompleteness), the meaning PROPERTY_SUMMARY exposes. Not the
//                                    Suggested Next Actions actionable-profile completeness.
// A value that cannot be computed now (an error, no access) is omitted: the indicator is null and the topic and its starters are unaffected.
// Every value returned here was computed during this request, so its freshness is CURRENT; anything else is omitted rather than labelled.
import { logger } from '../../lib/logger';
import { getContextCompleteness } from '../../modules/propertyContext/application/getContextCompleteness';
import { getPropertyContext } from '../../modules/propertyContext/application/getPropertyContext';
import type { AskDiscoveryTopic, AskDiscoveryTopicId } from '../../productFramework/conciergeHome.contract';
import { diyService } from '../diy.service';
import { derivePriorityListItemState, mapConsumerPriorityCategory } from '../decisionPlatform/priorityListPolicy';
import { getSuppressedHomeActionIds } from '../decisionPlatform/homeActionUsefulnessFeedback.service';
import type { RankedHomeAction } from '../homeActions.service';
import { dashboardSectionRepresentativeActions, projectHomeActionDashboardSections } from '../homeActionDashboardProjection';
import { PROPERTY_RECORD_CONTEXT_SCOPES } from '../propertyRecordOverview.service';

export type AskDiscoveryIndicator = NonNullable<AskDiscoveryTopic['indicator']>;
export type AskDiscoveryIndicators = Record<AskDiscoveryTopicId, AskDiscoveryIndicator | null>;

export const HOME_CARE_INDICATOR_SOURCE = 'home-actions-attention-v1';
export const DIY_INDICATOR_SOURCE = 'diy-open-projects-v1';

/**
 * The attention section of the dashboard projection, uncapped (the dashboard shows three cards, the indicator states the real number),
 * with the coverage-correction collapse preserved so a group counts once. Pure over the feed and the fatigue-suppressed ids.
 */
export function countAttentionActions(actions: RankedHomeAction[], suppressedHomeActionIds: ReadonlySet<string> = new Set()): number {
  const sections = projectHomeActionDashboardSections(actions, Number.MAX_SAFE_INTEGER);
  return dashboardSectionRepresentativeActions(actions, sections.attention).filter((action) => {
    const state = derivePriorityListItemState(action, suppressedHomeActionIds.has(action.id));
    if (state.suppressed || state.completed || state.unavailable || state.stale) return false;
    const category = mapConsumerPriorityCategory(action);
    return category !== 'WATCH' && category !== 'NO_ACTION';
  }).length;
}

/** The attention actions the count above would consider, so the caller can look up fatigue suppression for exactly those. */
function attentionActionIds(actions: RankedHomeAction[]): string[] {
  const sections = projectHomeActionDashboardSections(actions, Number.MAX_SAFE_INTEGER);
  return dashboardSectionRepresentativeActions(actions, sections.attention).map((action) => action.id);
}

export interface AskDiscoveryIndicatorSources {
  /** Resolves to the Home Actions feed Concierge Home already fetched; rejecting omits only the Home care indicator. */
  feed: Promise<{ actions: RankedHomeAction[]; generatedAt: string }>;
}

export async function loadAskDiscoveryIndicators(
  input: { userId: string; propertyId: string } & AskDiscoveryIndicatorSources,
): Promise<AskDiscoveryIndicators> {
  const { userId, propertyId } = input;
  const omit = async (topic: AskDiscoveryTopicId, read: () => Promise<AskDiscoveryIndicator>): Promise<AskDiscoveryIndicator | null> => {
    try {
      return await read();
    } catch (error) {
      logger.warn({ err: error, propertyId, userId, topic }, 'Explore with Cozy indicator omitted');
      return null;
    }
  };
  const [homeCare, diy, homeRecord] = await Promise.all([
    omit('HOME_CARE', async () => {
      const feed = await input.feed;
      const ids = attentionActionIds(feed.actions);
      const suppressed = ids.length ? await getSuppressedHomeActionIds({ userId, propertyId, homeActionIds: ids }) : new Set<string>();
      return { label: 'need attention', value: countAttentionActions(feed.actions, suppressed), sourceVersion: `${HOME_CARE_INDICATOR_SOURCE}@${feed.generatedAt}`, freshness: 'CURRENT' as const };
    }),
    omit('DIY_PROJECTS', async () => ({
      label: 'active', value: await diyService.countActiveProjects(propertyId), sourceVersion: DIY_INDICATOR_SOURCE, freshness: 'CURRENT' as const,
    })),
    omit('HOME_RECORD', async () => {
      const snapshot = await getPropertyContext(propertyId, { userId }, { scopes: PROPERTY_RECORD_CONTEXT_SCOPES });
      const completeness = getContextCompleteness(snapshot);
      return { label: 'complete', value: `${completeness.completenessPercent}%`, sourceVersion: completeness.contextVersion, freshness: 'CURRENT' as const };
    }),
  ]);
  return { HOME_CARE: homeCare, DIY_PROJECTS: diy, HOME_RECORD: homeRecord };
}
