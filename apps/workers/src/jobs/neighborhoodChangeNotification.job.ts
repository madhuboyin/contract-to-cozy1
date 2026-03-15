// apps/workers/src/jobs/neighborhoodChangeNotification.job.ts
//
// Scheduled job: daily scan for new high-impact neighborhood events and
// notify affected property owners via IN_APP notification.
//
// Schedule: Daily 6:00 AM EST via worker.ts cron
//
// Guardrails:
//   - Only events with impactScore >= NOTIFICATION_THRESHOLD (60)
//   - Only events linked to properties within the last 25h (cron jitter buffer)
//   - Deduplicated: one notification per property+event link
//   - Respects per-user notification preferences (emailEnabled)

import { prisma } from '../lib/prisma';

const NOTIFICATION_THRESHOLD = 60;
// 25 hours: catch up on links created since yesterday's run plus 1h jitter
const LOOKBACK_MS = 25 * 60 * 60 * 1000;

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
        select: { id: true, title: true, eventType: true },
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
          title: 'Neighborhood Change Detected',
          message: `${eventTitle} nearby may affect ${address}. Tap to see the full impact.`,
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
