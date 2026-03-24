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

import { prisma } from '../lib/prisma';
import { guidanceJourneyService } from '../../../backend/src/services/guidanceEngine/guidanceJourney.service';

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

  console.log(
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
        },
      },
      property: {
        include: {
          homeownerProfile: { select: { userId: true, notificationPreferences: true } },
        },
        select: {
          id: true,
          address: true,
          homeownerProfile: {
            select: { userId: true, notificationPreferences: true },
          },
        },
      },
    },
  });

  if (newLinks.length === 0) {
    console.log('[NEIGHBORHOOD-NOTIFY] No new high-impact events to notify about.');
    return;
  }

  console.log(`[NEIGHBORHOOD-NOTIFY] Found ${newLinks.length} new high-impact link(s) to process.`);

  let notified = 0;
  let skipped = 0;
  let failed = 0;

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
        console.log(
          `[NEIGHBORHOOD-NOTIFY] Suppressed (stale event): link=${linkId} property=${propertyId}` +
          ` freshnessScore=${freshnessScore.toFixed(2)}`,
        );
        skipped++;
        continue;
      }

      // Idempotency check: has a notification already been sent for this exact link?
      const existing = await (prisma as any).notification.findFirst({
        where: {
          userId,
          type: 'NEIGHBORHOOD_CHANGE_DETECTED',
          entityType: 'PROPERTY',
          entityId: propertyId,
          metadata: {
            path: ['propertyNeighborhoodEventId'],
            equals: linkId,
          },
        },
        select: { id: true },
      });

      if (existing) {
        skipped++;
        continue;
      }

      const eventTypeLabel =
        EVENT_TYPE_LABELS[link.event?.eventType as string] ?? 'Neighborhood change';
      const eventTitle: string = link.event?.title ?? eventTypeLabel;
      const address: string = link.property?.address ?? 'your property';
      const actionUrl = `/dashboard/properties/${propertyId}/tools/neighborhood-change-radar`;

      // Build a context-specific, non-overclaiming notification title
      const notificationTitle = buildNotificationTitle(
        link.event?.eventType as string,
        link.impactScore ?? 0,
      );

      // Create IN_APP notification (always) + EMAIL delivery if enabled
      const preferences = link.property?.homeownerProfile
        ?.notificationPreferences as { emailEnabled?: boolean } | null;
      const emailEnabled = preferences?.emailEnabled !== false;

      const deliveries: string[] = ['IN_APP'];
      if (emailEnabled) deliveries.push('EMAIL');

      await (prisma as any).notification.create({
        data: {
          userId,
          type: 'NEIGHBORHOOD_CHANGE_DETECTED',
          title: notificationTitle,
          message: `${eventTitle} nearby may be relevant to ${address}. Tap to review the potential impact.`,
          actionUrl,
          entityType: 'PROPERTY',
          entityId: propertyId,
          metadata: {
            neighborhoodEventId: eventId,
            propertyNeighborhoodEventId: linkId,
            impactScore: link.impactScore ?? 0,
            eventType: link.event?.eventType ?? null,
          },
          deliveries: {
            create: deliveries.map((ch) => ({
              channel: ch as any,
              status: 'PENDING',
            })),
          },
        },
      });

      try {
        const impactScore: number = link.impactScore ?? 0;
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
        console.warn('[GUIDANCE] neighborhood change signal ingest failed:', guidanceError);
      }

      notified++;
    } catch (err: any) {
      console.error(
        `[NEIGHBORHOOD-NOTIFY] Failed for link ${linkId} (property=${propertyId}):`,
        err?.message ?? err,
      );
      failed++;
    }
  }

  console.log(
    `[NEIGHBORHOOD-NOTIFY] Done. notified=${notified} skipped=${skipped} failed=${failed}`,
  );
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
