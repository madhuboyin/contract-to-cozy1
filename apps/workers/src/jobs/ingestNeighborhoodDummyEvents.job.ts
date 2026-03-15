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
//   NEIGHBORHOOD_DUMMY_TARGET_CITIES  — comma-separated "City:State" pairs
//                                       (e.g. "Atlanta:GA,Austin:TX").
//                                       Falls back to DEFAULT_TARGET_CITIES.
//   NEIGHBORHOOD_DUMMY_TARGET_PROPERTY_IDS — comma-separated property IDs;
//                                            when set, city filter is bypassed.
//   NEIGHBORHOOD_DUMMY_MAX_PROPERTIES — cap on how many properties to target.
//   NEIGHBORHOOD_DUMMY_FIXTURE_SET    — consumed by dummyNeighborhoodEvent.client.ts.

import { NeighborhoodPropertyMatchService } from '../../../backend/src/neighborhoodIntelligence/neighborhoodPropertyMatchService';
import { fetchDummyNeighborhoodEvents } from '../neighborhoodIntelligence/dummyNeighborhoodEvent.client';
import { prisma } from '../lib/prisma';
import type { DummyNeighborhoodRawEvent } from '../neighborhoodIntelligence/neighborhoodIntelligence.types';

const matchService = new NeighborhoodPropertyMatchService();

// Default cities used when NEIGHBORHOOD_DUMMY_TARGET_CITIES is not set.
// These must match the city+state of seed properties in the dev/QA database.
const DEFAULT_TARGET_CITIES: Array<{ city: string; state: string }> = [
  { city: 'Atlanta', state: 'GA' },
];

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

function parseTargetCities(): Array<{ city: string; state: string }> {
  const raw = (process.env.NEIGHBORHOOD_DUMMY_TARGET_CITIES ?? '').trim();
  if (!raw) return DEFAULT_TARGET_CITIES;

  const parsed = raw
    .split(',')
    .map((entry) => {
      const [city, state] = entry.split(':').map((s) => s.trim());
      return city && state ? { city, state } : null;
    })
    .filter((entry): entry is { city: string; state: string } => entry !== null);

  return parsed.length > 0 ? parsed : DEFAULT_TARGET_CITIES;
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

  const targetCities = parseTargetCities();
  const cityFilter = targetCities.map(({ city, state }) => ({
    city: { equals: city, mode: 'insensitive' as const },
    state: { equals: state, mode: 'insensitive' as const },
  }));

  return db.property.findMany({
    where: {
      AND: [
        { address: { not: '' } },
        { city: { not: '' } },
        { state: { not: '' } },
        { OR: cityFilter },
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
