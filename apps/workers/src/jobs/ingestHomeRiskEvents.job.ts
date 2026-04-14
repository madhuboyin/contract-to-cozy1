import { prisma } from '../lib/prisma';
import { fetchDummyHomeRiskEvents } from '../homeRiskReplay/dummyHomeRiskEvent.client';
import { normalizeDummyHomeRiskEvent } from '../homeRiskReplay/normalize';
import type { CanonicalHomeRiskEventSignal } from '../homeRiskReplay/homeRiskReplay.types';
import { logger } from '../lib/logger';

const DEFAULT_TARGET_ZIPS = ['08536', '10019'];

type TargetProperty = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

function parseTargetPropertyIds(): string[] {
  const raw = process.env.HOME_RISK_REPLAY_DUMMY_TARGET_PROPERTY_IDS ?? '';
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseTargetZips(): string[] {
  const raw = process.env.HOME_RISK_REPLAY_DUMMY_TARGET_ZIPS ?? DEFAULT_TARGET_ZIPS.join(',');
  const zips = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return zips.length > 0 ? zips : DEFAULT_TARGET_ZIPS;
}

function parseMaxProperties(): number | null {
  const raw = (process.env.HOME_RISK_REPLAY_DUMMY_MAX_PROPERTIES ?? '').trim();
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return parsed;
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

async function upsertCanonicalHomeRiskEvent(signal: CanonicalHomeRiskEventSignal) {
  const db = prisma as any;

  return db.homeRiskEvent.upsert({
    where: { dedupeKey: signal.dedupeKey },
    update: {
      title: signal.title,
      summary: signal.summary ?? null,
      severity: signal.severity,
      eventSubType: signal.eventSubType ?? null,
      endAt: signal.endAt ? new Date(signal.endAt) : null,
      payloadJson: signal.payloadJson ?? null,
      geoJson: signal.geoJson ?? null,
      locationType: signal.locationType,
      locationKey: signal.locationKey,
    },
    create: {
      eventType: signal.eventType,
      eventSubType: signal.eventSubType ?? null,
      title: signal.title,
      summary: signal.summary ?? null,
      severity: signal.severity,
      startAt: new Date(signal.startAt),
      endAt: signal.endAt ? new Date(signal.endAt) : null,
      locationType: signal.locationType,
      locationKey: signal.locationKey,
      geoJson: signal.geoJson ?? null,
      payloadJson: signal.payloadJson ?? null,
      dedupeKey: signal.dedupeKey,
    },
  });
}

export async function ingestHomeRiskEventsJob() {
  const properties = await loadTargetProperties();

  if (properties.length === 0) {
    logger.info('[HOME-RISK-INGEST] No eligible properties found. Skipping.');
    return {
      targetProperties: 0,
      rawSignals: 0,
      canonicalUpserts: 0,
    };
  }

  const rawSignals = await fetchDummyHomeRiskEvents(properties);
  let canonicalUpserts = 0;

  for (const rawSignal of rawSignals) {
    const canonical = normalizeDummyHomeRiskEvent(rawSignal);
    await upsertCanonicalHomeRiskEvent(canonical);
    canonicalUpserts += 1;
  }

  const result = {
    targetProperties: properties.length,
    rawSignals: rawSignals.length,
    canonicalUpserts,
  };

  logger.info('[HOME-RISK-INGEST] result:', result);
  return result;
}
