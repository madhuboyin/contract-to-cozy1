import { PrismaClient } from '@prisma/client';
import { fetchEventbriteEvents } from './eventbrite.provider';

const prisma = new PrismaClient();

/**
 * Cron-safe ingestion:
 * - Reads enabled cities from CityFeatureFlag
 * - Fetches external events
 * - Upserts into CommunityEvent
 * - Marks stale events inactive (optional cleanup)
 */
export async function fetchCommunityEventsCron() {
  console.log(`[${new Date().toISOString()}] [COMMUNITY] Ingestion started`);

  try {
    const enabledCities = await prisma.cityFeatureFlag.findMany({
      where: { eventsEnabled: true }
    });

    if (enabledCities.length === 0) {
      console.log('[COMMUNITY] No enabled cities. Skipping.');
      return;
    }

    let totalUpserted = 0;

    for (const c of enabledCities) {
      const radius = Number(process.env.EVENTS_RADIUS_MILES ?? 15);

      console.log(`[COMMUNITY] Fetching events for ${c.city}, ${c.state} radius=${radius}mi`);
      const external = await fetchEventbriteEvents(c.city, c.state, radius);

      for (const ev of external) {
        await prisma.communityEvent.upsert({
          where: {
            source_externalEventId: {
              source: 'eventbrite',
              externalEventId: ev.externalId
            }
          },
          update: {
            title: ev.title,
            description: ev.description ?? null,
            startTime: ev.startTime,
            endTime: ev.endTime ?? null,
            venueName: ev.venueName ?? null,
            city: c.city,
            state: c.state,
            externalUrl: ev.externalUrl,
            isActive: true,
            lastFetchedAt: new Date()
          },
          create: {
            source: 'eventbrite',
            externalEventId: ev.externalId,
            title: ev.title,
            description: ev.description ?? null,
            startTime: ev.startTime,
            endTime: ev.endTime ?? null,
            venueName: ev.venueName ?? null,
            city: c.city,
            state: c.state,
            externalUrl: ev.externalUrl,
            isActive: true,
            lastFetchedAt: new Date()
          }
        });

        totalUpserted += 1;
      }
    }

    // Optional cleanup: mark events inactive if not fetched recently
    const staleDays = Number(process.env.EVENTS_STALE_DAYS ?? 2);
    const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

    const stale = await prisma.communityEvent.updateMany({
      where: {
        source: 'eventbrite',
        lastFetchedAt: { lt: cutoff }
      },
      data: { isActive: false }
    });

    console.log(`[COMMUNITY] ✅ Ingestion completed. upserted=${totalUpserted} stale_inactivated=${stale.count}`);
  } catch (err) {
    console.error('[COMMUNITY] ❌ Ingestion failed:', err);
  }
}
