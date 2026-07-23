// apps/workers/src/jobs/neighborhoodChangeNotification.job.ts
//
// Scheduled job: daily scan for new high-impact neighborhood events and
// notify affected property owners via IN_APP notification.
//
// Schedule: Daily 6:00 AM EST via worker.ts cron
//
// Suppression guardrails:
//   - Only events with impactScore >= NOTIFICATION_THRESHOLD (60)
//   - Only events linked to properties within the last 25h (cron jitter buffer)
//   - Skip stale events (freshness < FRESHNESS_THRESHOLD)
//   - Skip events with very low data confidence (PRELIMINARY with no dates/source)
//   - Deduplicated: one notification per property+event link
//   - Respects per-user notification preferences (emailEnabled)
//   - Noise cap (W3/neighborhood): multiple qualifying links for the same
//     property discovered in one run are combined into a single
//     notification instead of one per link — a burst of same-day nearby
//     events (several permit filings, a zoning change plus a development
//     announcement, etc) no longer floods the homeowner.

import { prisma } from '../lib/prisma';
import { NotificationService } from '@worker-shared/services/notification.service';
import { guidanceJourneyService } from '@worker-shared/services/guidanceEngine/guidanceJourney.service';
import { NEIGHBORHOOD_IMPACT_RULES } from '@worker-shared/neighborhoodIntelligence/impactRules';
import { haversineDistanceMiles, isValidLatLng } from '@worker-shared/neighborhoodIntelligence/geoUtils';
import { getPlanningContextEnvelope } from '@worker-shared/services/planningContext/context';
import { logger } from '../lib/logger';
import { neighborhoodChangeRadarUrl } from '../lib/deepLinks';

/**
 * Location relevance recheck before sending: geocoded distance within the
 * event-type radius when both sides have coordinates, otherwise city/state
 * co-location. Missing location on either side fails closed (no notification).
 */
function isEventStillRelevantToProperty(
  property: { city?: string | null; state?: string | null; latitude?: number | null; longitude?: number | null } | null,
  event: { eventType?: string | null; city?: string | null; state?: string | null; latitude?: number | null; longitude?: number | null } | null,
): boolean {
  if (!property || !event) return false;
  if (isValidLatLng(property.latitude, property.longitude) && isValidLatLng(event.latitude, event.longitude)) {
    const radiusMiles =
      NEIGHBORHOOD_IMPACT_RULES[event.eventType as keyof typeof NEIGHBORHOOD_IMPACT_RULES]?.defaultRadiusMiles ?? 2.0;
    return (
      haversineDistanceMiles(
        property.latitude as number,
        property.longitude as number,
        event.latitude as number,
        event.longitude as number,
      ) <= radiusMiles
    );
  }
  if (!property.city || !property.state || !event.city || !event.state) return false;
  return (
    property.city.toLowerCase() === event.city.toLowerCase() &&
    property.state.toLowerCase() === event.state.toLowerCase()
  );
}

const NOTIFICATION_THRESHOLD = 60;
// 25 hours: catch up on links created since yesterday's run plus 1h jitter
const LOOKBACK_MS = 25 * 60 * 60 * 1000;
// Minimum freshness score for notifiable events (0–1).
// Events below this threshold are stale and should not generate new notifications.
const FRESHNESS_THRESHOLD = 0.50;

const EVENT_TYPE_LABELS: Record<string, string> = {
  TRANSIT_PROJECT: 'Transit project',
  HIGHWAY_PROJECT: 'Highway project',
  COMMERCIAL_DEVELOPMENT: 'Commercial development',
  RESIDENTIAL_DEVELOPMENT: 'Residential development',
  INDUSTRIAL_PROJECT: 'Industrial project',
  WAREHOUSE_PROJECT: 'Warehouse project',
  ZONING_CHANGE: 'Zoning change',
  SCHOOL_RATING_CHANGE: 'School rating change',
  SCHOOL_BOUNDARY_CHANGE: 'School boundary change',
  FLOOD_MAP_UPDATE: 'Flood map update',
  UTILITY_INFRASTRUCTURE: 'Utility infrastructure change',
  PARK_DEVELOPMENT: 'Park development',
  LARGE_CONSTRUCTION: 'Large construction',
};

export async function neighborhoodChangeNotificationJob(): Promise<void> {
  const since = new Date(Date.now() - LOOKBACK_MS);

  logger.info(
    `[NEIGHBORHOOD-NOTIFY] Scanning for high-impact events linked since ${since.toISOString()}...`,
  );

  // Find all new high-impact property-event links
  const newLinks = await (prisma as any).propertyNeighborhoodEvent.findMany({
    where: {
      impactScore: { gte: NOTIFICATION_THRESHOLD },
      createdAt: { gte: since },
    },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          eventType: true,
          announcedDate: true,
          expectedEndDate: true,
          createdAt: true,
          sourceName: true,
          sourceUrl: true,
          description: true,
          city: true,
          state: true,
          latitude: true,
          longitude: true,
        },
      },
      property: {
        select: {
          id: true,
          address: true,
          city: true,
          state: true,
          latitude: true,
          longitude: true,
          homeownerProfile: {
            select: { userId: true, notificationPreferences: true },
          },
        },
      },
    },
  });

  if (newLinks.length === 0) {
    logger.info('[NEIGHBORHOOD-NOTIFY] No new high-impact events to notify about.');
    return;
  }

  logger.info(`[NEIGHBORHOOD-NOTIFY] Found ${newLinks.length} new high-impact link(s) to process.`);

  // Idempotency, pre-fetched once instead of one query per link: collect
  // every propertyNeighborhoodEvent id this job has already notified about,
  // across both the current array-metadata shape and the pre-batching
  // singular shape (for notifications created before this change).
  const alreadyNotifiedLinkIds = await collectAlreadyNotifiedLinkIds(
    Array.from(new Set(newLinks.map((l: any) => l.property?.homeownerProfile?.userId).filter(Boolean))) as string[],
  );

  let skipped = 0;
  let failed = 0;

  type EligibleLink = {
    linkId: string;
    eventId: string;
    eventTypeLabel: string;
    eventTitle: string;
    eventType: string | null;
    impactScore: number;
  };
  const eligibleByProperty = new Map<string, { userId: string; address: string; links: EligibleLink[] }>();

  for (const link of newLinks) {
    const userId: string | undefined = link.property?.homeownerProfile?.userId;
    if (!userId) {
      skipped++;
      continue;
    }

    const propertyId: string = link.propertyId;
    const eventId: string = link.eventId;
    const linkId: string = link.id;

    try {
      // Reuse the authoritative feature policy before applying the
      // event-specific distance check below. Notifications fail closed when
      // the property's location context is incomplete or conflicted.
      const planning = await getPlanningContextEnvelope(
        propertyId,
        userId,
        'NEIGHBORHOOD_RADAR',
      );
      if (planning.decision.status !== 'APPLICABLE') {
        logger.info(
          `[NEIGHBORHOOD-NOTIFY] Suppressed by Property Context policy: link=${linkId}` +
          ` property=${propertyId} status=${planning.decision.status}`,
        );
        skipped++;
        continue;
      }

      // --- Freshness suppression ---
      // Compute a simple freshness score inline to avoid importing backend modules.
      // Events older than ~18 months (or whose expected end is well in the past)
      // should not trigger new user notifications.
      const eventAnnouncedDate: Date | null = link.event?.announcedDate ?? null;
      const eventEndDate: Date | null = link.event?.expectedEndDate ?? null;
      const eventCreatedAt: Date = link.event?.createdAt ?? new Date();
      const freshnessScore = computeNotificationFreshness(
        eventCreatedAt,
        eventAnnouncedDate,
        eventEndDate,
      );

      if (freshnessScore < FRESHNESS_THRESHOLD) {
        logger.info(
          `[NEIGHBORHOOD-NOTIFY] Suppressed (stale event): link=${linkId} property=${propertyId}` +
          ` freshnessScore=${freshnessScore.toFixed(2)}`,
        );
        skipped++;
        continue;
      }

      // --- Location relevance recheck (Property Context) ---
      // The link was matched at ingest time; recheck the property's current
      // location before notifying in case the property moved since matching.
      const stillRelevant = isEventStillRelevantToProperty(link.property, link.event);
      if (!stillRelevant) {
        logger.info(
          `[NEIGHBORHOOD-NOTIFY] Suppressed (location no longer matches): link=${linkId} property=${propertyId}`,
        );
        skipped++;
        continue;
      }

      // Idempotency check: has a notification already been sent for this exact link?
      if (alreadyNotifiedLinkIds.has(linkId)) {
        skipped++;
        continue;
      }

      const impactScore: number = link.impactScore ?? 0;

      // Guidance-engine signal ingestion tracks the underlying event
      // regardless of how notifications get batched below — kept per-link.
      try {
        await guidanceJourneyService.ingestSignal({
          propertyId,
          signalIntentFamily: 'neighborhood_change_detected',
          issueDomain: 'NEIGHBORHOOD',
          decisionStage: 'AWARENESS',
          executionReadiness: 'TRACKING_ONLY',
          severity: impactScore >= 80 ? 'HIGH' : impactScore >= 60 ? 'MEDIUM' : 'LOW',
          severityScore: impactScore,
          confidenceScore: freshnessScore,
          sourceType: 'NEIGHBORHOOD',
          sourceFeatureKey: 'neighborhood-change-notification',
          sourceEntityType: 'NEIGHBORHOOD_EVENT',
          sourceEntityId: eventId,
          sourceProvenanceId: `property:${propertyId}|NEIGHBORHOOD_CHANGE|event:${eventId}`,
          payloadJson: {
            neighborhoodEventId: eventId,
            propertyNeighborhoodEventId: linkId,
            eventType: link.event?.eventType ?? null,
            impactScore,
          },
        });
      } catch (guidanceError) {
        logger.warn({ err: guidanceError }, '[GUIDANCE] neighborhood change signal ingest failed');
      }

      const group: { userId: string; address: string; links: EligibleLink[] } =
        eligibleByProperty.get(propertyId) ?? {
          userId,
          address: link.property?.address ?? 'your property',
          links: [],
        };
      group.links.push({
        linkId,
        eventId,
        eventTypeLabel: EVENT_TYPE_LABELS[link.event?.eventType as string] ?? 'Neighborhood change',
        eventTitle: link.event?.title ?? (EVENT_TYPE_LABELS[link.event?.eventType as string] ?? 'Neighborhood change'),
        eventType: link.event?.eventType ?? null,
        impactScore,
      });
      eligibleByProperty.set(propertyId, group);
    } catch (err: any) {
      logger.error(
        `[NEIGHBORHOOD-NOTIFY] Failed for link ${linkId} (property=${propertyId}):`,
        err?.message ?? err,
      );
      failed++;
    }
  }

  let notified = 0;
  let eventsNotified = 0;

  for (const [propertyId, group] of eligibleByProperty) {
    try {
      const { userId, address, links } = group;
      const actionUrl = neighborhoodChangeRadarUrl(propertyId);
      const maxImpactScore = Math.max(...links.map((l) => l.impactScore));

      const { title, message } =
        links.length === 1
          ? {
              title: buildNotificationTitle(links[0].eventType as string, links[0].impactScore),
              message: `${links[0].eventTitle} nearby may be relevant to ${address}. Tap to review the potential impact.`,
            }
          : {
              title: `${links.length} neighborhood changes detected nearby`,
              message:
                `${links.length} nearby updates — including ${links[0].eventTypeLabel.toLowerCase()}` +
                ` — may be relevant to ${address}. Tap to review the potential impact.`,
            };

      await NotificationService.create({
        userId,
        type: 'NEIGHBORHOOD_CHANGE_DETECTED',
        title,
        message,
        actionUrl,
        entityType: 'PROPERTY',
        entityId: propertyId,
        // W3 (neighborhood): was 'GENERAL' — MUTE_TYPE mutes by category
        // (notificationPreference.service.ts#recordNotificationOutcome), so
        // a homeowner muting neighborhood chatter would have silently
        // muted every other unrelated GENERAL-category notification for
        // that property too (reserve fund reminders, etc), and vice versa.
        // A dedicated category makes muting precise.
        category: 'NEIGHBORHOOD',
        urgency: 'ROUTINE',
        metadata: {
          propertyId,
          neighborhoodEventIds: links.map((l) => l.eventId),
          propertyNeighborhoodEventIds: links.map((l) => l.linkId),
          impactScore: maxImpactScore,
          eventTypes: links.map((l) => l.eventType),
        },
      });

      notified++;
      eventsNotified += links.length;
    } catch (err: any) {
      logger.error(`[NEIGHBORHOOD-NOTIFY] Failed to notify property ${propertyId}:`, err?.message ?? err);
      failed++;
    }
  }

  logger.info(
    `[NEIGHBORHOOD-NOTIFY] Done. notified=${notified} (${eventsNotified} event(s) batched) skipped=${skipped} failed=${failed}`,
  );
}

/**
 * Every propertyNeighborhoodEvent id already covered by a prior
 * NEIGHBORHOOD_CHANGE_DETECTED notification for any of the given users —
 * checks both the batched array metadata shape and the pre-batching
 * singular shape, so notifications created before this change still count.
 */
async function collectAlreadyNotifiedLinkIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const existing = await (prisma as any).notification.findMany({
    where: {
      userId: { in: userIds },
      type: 'NEIGHBORHOOD_CHANGE_DETECTED',
      entityType: 'PROPERTY',
    },
    select: { metadata: true },
  });

  const ids = new Set<string>();
  for (const notification of existing) {
    const metadata = (notification.metadata ?? {}) as Record<string, unknown>;
    if (Array.isArray(metadata.propertyNeighborhoodEventIds)) {
      for (const id of metadata.propertyNeighborhoodEventIds) {
        if (typeof id === 'string') ids.add(id);
      }
    }
    if (typeof metadata.propertyNeighborhoodEventId === 'string') {
      ids.add(metadata.propertyNeighborhoodEventId);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute a freshness score inline (0–1) without importing backend modules.
 * Mirrors the logic in eventConfidence.ts#computeFreshnessScore.
 */
function computeNotificationFreshness(
  createdAt: Date,
  announcedDate: Date | null,
  expectedEndDate: Date | null,
): number {
  const now = Date.now();

  if (expectedEndDate && expectedEndDate.getTime() < now) {
    const monthsPastEnd = (now - expectedEndDate.getTime()) / (1000 * 60 * 60 * 24 * 30.5);
    if (monthsPastEnd > 18) return 0.20;
    if (monthsPastEnd > 12) return 0.35;
    if (monthsPastEnd > 6) return 0.50;
    return 0.65;
  }

  const refDate = announcedDate ?? createdAt;
  const ageMonths = (now - refDate.getTime()) / (1000 * 60 * 60 * 24 * 30.5);

  if (ageMonths < 3) return 1.00;
  if (ageMonths < 6) return 0.90;
  if (ageMonths < 12) return 0.80;
  if (ageMonths < 18) return 0.65;
  if (ageMonths < 24) return 0.50;
  if (ageMonths < 36) return 0.35;
  return 0.20;
}

/**
 * Build a context-aware, non-overclaiming notification title.
 */
function buildNotificationTitle(eventType: string, impactScore: number): string {
  const TITLE_MAP: Record<string, string> = {
    TRANSIT_PROJECT: 'Transit development detected nearby',
    HIGHWAY_PROJECT: 'Highway project detected nearby',
    COMMERCIAL_DEVELOPMENT: 'Commercial development nearby',
    RESIDENTIAL_DEVELOPMENT: 'Residential development nearby',
    INDUSTRIAL_PROJECT: 'Industrial activity detected nearby',
    WAREHOUSE_PROJECT: 'Warehouse project detected nearby',
    ZONING_CHANGE: 'Zoning change detected nearby',
    SCHOOL_RATING_CHANGE: 'Nearby school rating has changed',
    SCHOOL_BOUNDARY_CHANGE: 'School boundary change nearby',
    FLOOD_MAP_UPDATE: 'Flood map update may affect your property',
    UTILITY_INFRASTRUCTURE: 'Utility infrastructure change nearby',
    PARK_DEVELOPMENT: 'Park development detected nearby',
    LARGE_CONSTRUCTION: 'Large construction project nearby',
  };

  return TITLE_MAP[eventType] ?? 'Neighborhood change detected nearby';
}
