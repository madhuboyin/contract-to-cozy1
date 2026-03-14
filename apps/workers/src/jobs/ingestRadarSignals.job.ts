import { prisma } from '../lib/prisma';
import { fetchDummyRadarSignals } from '../radar/dummyRadar.client';
import { normalizeDummyRadarSignal } from '../radar/normalize';
import type { CanonicalRadarSignal } from '../radar/radar.types';
import { runMatchingForEvent } from '../../../backend/src/services/homeEventRadarMatcher.service';

const DEFAULT_TARGET_ZIPS = ['08536', '10019'];

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

function parseTargetZips(): string[] {
  const raw = process.env.RADAR_DUMMY_TARGET_ZIPS ?? DEFAULT_TARGET_ZIPS.join(',');
  const zips = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return zips.length > 0 ? zips : DEFAULT_TARGET_ZIPS;
}

function parseMaxProperties(): number | null {
  const raw = (process.env.RADAR_DUMMY_MAX_PROPERTIES ?? '').trim();
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return parsed;
}

function resolveMatchPropertyIds(rawSignal: {
  geography: { type: string; key: string };
  raw: Record<string, unknown>;
}): string[] | null {
  const targetPropertyIds = rawSignal.raw?.targetPropertyIds;

  if (Array.isArray(targetPropertyIds)) {
    const ids = targetPropertyIds
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean);

    if (ids.length > 0) {
      return ids;
    }
  }

  if (rawSignal.geography.type === 'property' && rawSignal.geography.key.trim() !== '') {
    return [rawSignal.geography.key.trim()];
  }

  return null;
}

async function loadTargetProperties(): Promise<TargetProperty[]> {
  const ids = parseTargetPropertyIds();
  const targetZips = parseTargetZips();
  const maxProperties = parseMaxProperties();

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
      zipCode: { in: targetZips },
    },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
    },
    orderBy: { createdAt: 'asc' },
    ...(maxProperties ? { take: maxProperties } : {}),
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

    const matchResult = await runMatchingForEvent(event.id, resolveMatchPropertyIds(rawSignal));
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
