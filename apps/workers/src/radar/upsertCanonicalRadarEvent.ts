import { prisma } from '../lib/prisma';
import type { CanonicalRadarSignal } from './radar.types';

/**
 * Upserts a CanonicalRadarSignal into RadarEvent, keyed on dedupeKey.
 * Shared by every radar ingestion job (dummy QA fixtures, real provider
 * integrations like tax assessment) so the write shape stays consistent.
 */
export async function upsertCanonicalRadarEvent(signal: CanonicalRadarSignal) {
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
