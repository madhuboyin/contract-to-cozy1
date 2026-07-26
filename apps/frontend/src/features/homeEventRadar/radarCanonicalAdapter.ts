import type {
  RadarCanonicalFeedItem,
  RadarFeedItem,
  RadarImpactLevel,
  RadarSeverity,
} from '@/types';

function legacySeverity(severity: RadarCanonicalFeedItem['severity']): RadarSeverity {
  if (severity === 'moderate') return 'medium';
  if (severity === 'severe' || severity === 'extreme') return 'critical';
  return severity;
}

function legacyImpact(impact: RadarCanonicalFeedItem['impact']): RadarImpactLevel {
  if (impact === 'low') return 'watch';
  if (impact === 'critical') return 'high';
  return impact;
}

/**
 * Temporary compatibility projection for the legacy detail sheet.
 * The feed card consumes the canonical DTO as of HER-404; HER-405 removes this
 * final projection when detail moves to the canonical endpoint.
 */
export function toLegacyRadarFeedItem(
  item: RadarCanonicalFeedItem,
  propertyId: string,
): RadarFeedItem {
  return {
    propertyRadarMatchId: item.propertyMatchId,
    radarEventId: item.eventId,
    propertyId,
    eventType: item.eventType,
    eventSubType: null,
    title: item.title,
    summary: item.summary,
    severity: legacySeverity(item.severity),
    startAt: item.effectiveAt,
    endAt: item.expiresAt,
    lifecycleStatus: item.lifecycleStatus,
    timingGroup: item.matchLifecycleStatus,
    impactLevel: legacyImpact(item.impact),
    impactSummary: null,
    priorityBand: item.priorityBand,
    matchLifecycleStatus: item.matchLifecycleStatus,
    sourceFreshnessStatus: item.sourceFreshnessStatus,
    isSourceStale: item.isSourceStale,
    isMaterialUpdate: item.isMaterialUpdate,
    isVisible: true,
    state: item.userState,
    createdAt: item.effectiveAt,
  };
}
