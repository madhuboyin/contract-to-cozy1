// apps/workers/src/jobs/ingestNeighborhoodDummyEvents.job.ts
//
// Dummy neighborhood event ingest job for QA / E2E testing.
//
// Mirrors the pattern of ingestRadarSignals.job.ts and ingestHomeRiskEventsJob.
//
// Calls fetchDummyNeighborhoodEvents() → upserts NeighborhoodEvent records
// directly via Prisma (avoiding the express-dependent NeighborhoodIntelligenceService)
// → triggers property matching via NeighborhoodPropertyMatchService.
//
// Env vars consumed here:
//   NEIGHBORHOOD_DUMMY_TARGET_ZIPS    — comma-separated ZIP codes
//                                       (e.g. "08536,10019").
//                                       Falls back to DEFAULT_TARGET_ZIPS.
//   NEIGHBORHOOD_DUMMY_TARGET_PROPERTY_IDS — comma-separated property IDs;
//                                            when set, ZIP filter is bypassed.
//   NEIGHBORHOOD_DUMMY_MAX_PROPERTIES — cap on how many properties to target.
//   NEIGHBORHOOD_DUMMY_FIXTURE_SET    — consumed by dummyNeighborhoodEvent.client.ts.

import { NeighborhoodPropertyMatchService } from '../../../backend/src/neighborhoodIntelligence/neighborhoodPropertyMatchService';
import { fetchDummyNeighborhoodEvents } from '../neighborhoodIntelligence/dummyNeighborhoodEvent.client';
import { prisma } from '../lib/prisma';
import type { DummyNeighborhoodRawEvent } from '../neighborhoodIntelligence/neighborhoodIntelligence.types';

const matchService = new NeighborhoodPropertyMatchService();

// Default ZIP codes used when NEIGHBORHOOD_DUMMY_TARGET_ZIPS is not set.
// Same ZIPs used by Home Event Radar and Home Risk Replay dummy ingest.
const DEFAULT_TARGET_ZIPS: string[] = ['08536', '10019'];

type TargetProperty = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

// ---------------------------------------------------------------------------
// Config parsing
// ---------------------------------------------------------------------------

function parseTargetPropertyIds(): string[] {
  return (process.env.NEIGHBORHOOD_DUMMY_TARGET_PROPERTY_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTargetZips(): string[] {
  const raw = (process.env.NEIGHBORHOOD_DUMMY_TARGET_ZIPS ?? '').trim();
  if (!raw) return DEFAULT_TARGET_ZIPS;

  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : DEFAULT_TARGET_ZIPS;
}

function parseMaxProperties(): number | null {
  const raw = (process.env.NEIGHBORHOOD_DUMMY_MAX_PROPERTIES ?? '').trim();
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// ---------------------------------------------------------------------------
// Property loading
// ---------------------------------------------------------------------------

async function loadTargetProperties(): Promise<TargetProperty[]> {
  const ids = parseTargetPropertyIds();
  const maxProperties = parseMaxProperties();
  const db = prisma as any;

  if (ids.length > 0) {
    return db.property.findMany({
      where: { id: { in: ids } },
      select: { id: true, address: true, city: true, state: true, zipCode: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  const targetZips = parseTargetZips();

  return db.property.findMany({
    where: {
      AND: [
        { address: { not: '' } },
        { zipCode: { in: targetZips } },
      ],
    },
    select: { id: true, address: true, city: true, state: true, zipCode: true },
    orderBy: { createdAt: 'asc' },
    ...(maxProperties ? { take: maxProperties } : {}),
  });
}

// ---------------------------------------------------------------------------
// Event upsert (inline, avoids express-dependent NeighborhoodIntelligenceService)
// ---------------------------------------------------------------------------

async function upsertNeighborhoodEvent(event: DummyNeighborhoodRawEvent): Promise<string> {
  const db = prisma as any;

  // Dedup: match on sourceName + eventType + title (case-insensitive).
  // Mirrors strategy-1 in NeighborhoodEventIngestionService.findExistingEvent().
  const existing = await db.neighborhoodEvent.findFirst({
    where: {
      sourceName: event.sourceName,
      eventType: event.eventType,
      title: { equals: event.title, mode: 'insensitive' },
    },
    select: { id: true },
  });

  if (existing) {
    // Update mutable fields that may have changed between fixture runs.
    await db.neighborhoodEvent.update({
      where: { id: existing.id },
      data: {
        description: event.description ?? undefined,
        sourceUrl: event.sourceUrl ?? undefined,
        expectedStartDate: event.expectedStartDate ? new Date(event.expectedStartDate) : undefined,
        expectedEndDate: event.expectedEndDate ? new Date(event.expectedEndDate) : undefined,
      },
    });
    return existing.id;
  }

  const created = await db.neighborhoodEvent.create({
    data: {
      eventType: event.eventType,
      title: event.title,
      description: event.description ?? null,
      latitude: event.latitude,
      longitude: event.longitude,
      city: event.city,
      state: event.state,
      country: event.country,
      sourceName: event.sourceName,
      sourceUrl: event.sourceUrl ?? null,
      announcedDate: new Date(event.announcedDate),
      expectedStartDate: event.expectedStartDate ? new Date(event.expectedStartDate) : null,
      expectedEndDate: event.expectedEndDate ? new Date(event.expectedEndDate) : null,
    },
  });

  return created.id;
}

// ---------------------------------------------------------------------------
// Main job
// ---------------------------------------------------------------------------

export async function ingestNeighborhoodDummyEventsJob(): Promise<{
  targetProperties: number;
  rawEvents: number;
  upserted: number;
  matched: number;
  failed: number;
}> {
  const properties = await loadTargetProperties();

  if (properties.length === 0) {
    console.log('[NEIGHBORHOOD-DUMMY-INGEST] No eligible properties found. Skipping.');
    return { targetProperties: 0, rawEvents: 0, upserted: 0, matched: 0, failed: 0 };
  }

  const rawEvents = await fetchDummyNeighborhoodEvents(properties);

  let upserted = 0;
  let matched = 0;
  let failed = 0;

  for (const rawEvent of rawEvents) {
    try {
      const eventId = await upsertNeighborhoodEvent(rawEvent);
      upserted++;

      const result = await matchService.matchPropertiesForEvent(eventId);
      matched += result.matched;
    } catch (err: any) {
      console.error(
        `[NEIGHBORHOOD-DUMMY-INGEST] Failed for event "${rawEvent.title}":`,
        err?.message ?? err,
      );
      failed++;
    }
  }

  const result = { targetProperties: properties.length, rawEvents: rawEvents.length, upserted, matched, failed };
  console.log('[NEIGHBORHOOD-DUMMY-INGEST] result:', result);
  return result;
}
