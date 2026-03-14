import { prisma } from '../lib/prisma';
import { fetchDummyRadarSignals } from '../radar/dummyRadar.client';
import { normalizeDummyRadarSignal } from '../radar/normalize';
import type { CanonicalRadarSignal } from '../radar/radar.types';
import { runMatchingForEvent } from '../../../backend/src/services/homeEventRadarMatcher.service';

const DEFAULT_MAX_PROPERTIES = 3;

type TargetProperty = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

function parseTargetPropertyIds(): string[] {
  const raw = process.env.RADAR_DUMMY_TARGET_PROPERTY_IDS ?? '';
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function loadTargetProperties(): Promise<TargetProperty[]> {
  const ids = parseTargetPropertyIds();
  const maxProperties = Math.max(
    1,
    Number.parseInt(process.env.RADAR_DUMMY_MAX_PROPERTIES || '', 10) || DEFAULT_MAX_PROPERTIES
  );

  if (ids.length > 0) {
    return prisma.property.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  return prisma.property.findMany({
    where: {
      address: { not: '' },
      city: { not: '' },
      state: { not: '' },
      zipCode: { not: '' },
    },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
    },
    orderBy: { createdAt: 'asc' },
    take: maxProperties,
  });
}

async function upsertCanonicalRadarEvent(signal: CanonicalRadarSignal) {
  const canonical = signal;
  const db = prisma as any;

  return db.radarEvent.upsert({
    where: { dedupeKey: canonical.dedupeKey },
    update: {
      title: canonical.title,
      summary: canonical.summary ?? null,
      severity: canonical.severity,
      sourceRef: canonical.sourceRef ?? null,
      endAt: canonical.endAt ? new Date(canonical.endAt) : null,
      payloadJson: canonical.payloadJson ?? null,
      status: canonical.status,
    },
    create: {
      eventType: canonical.eventType,
      eventSubType: canonical.eventSubType ?? null,
      title: canonical.title,
      summary: canonical.summary ?? null,
      sourceType: canonical.sourceType,
      sourceRef: canonical.sourceRef ?? null,
      severity: canonical.severity,
      startAt: new Date(canonical.startAt),
      endAt: canonical.endAt ? new Date(canonical.endAt) : null,
      locationType: canonical.locationType,
      locationKey: canonical.locationKey,
      geoJson: canonical.geoJson ?? null,
      payloadJson: canonical.payloadJson ?? null,
      dedupeKey: canonical.dedupeKey,
      status: canonical.status,
    },
  });
}

export async function ingestRadarSignalsJob() {
  const properties = await loadTargetProperties();

  if (properties.length === 0) {
    console.log('[RADAR-DUMMY-INGEST] No eligible properties found. Skipping.');
    return {
      targetProperties: 0,
      rawSignals: 0,
      canonicalUpserts: 0,
      matched: 0,
      skipped: 0,
    };
  }

  const rawSignals = await fetchDummyRadarSignals(properties);

  let canonicalUpserts = 0;
  let matched = 0;
  let skipped = 0;

  for (const rawSignal of rawSignals) {
    const canonical = normalizeDummyRadarSignal(rawSignal);
    const event = await upsertCanonicalRadarEvent(canonical);
    canonicalUpserts += 1;

    const matchResult = await runMatchingForEvent(event.id, [rawSignal.geography.key]);
    matched += matchResult.matched;
    skipped += matchResult.skipped;
  }

  const result = {
    targetProperties: properties.length,
    rawSignals: rawSignals.length,
    canonicalUpserts,
    matched,
    skipped,
  };

  console.log('[RADAR-DUMMY-INGEST] result:', result);
  return result;
}
