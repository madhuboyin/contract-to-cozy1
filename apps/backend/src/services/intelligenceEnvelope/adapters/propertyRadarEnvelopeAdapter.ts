import { normalizeConfidenceRatio } from '../../../productFramework/intelligence';
import type { EnvelopeAdapter } from '../envelopeAdapter.contract';
import type { EnvelopeCurrentness, EnvelopeSeverity } from '../intelligenceEnvelope.contract';
import { buildMappedItem, descriptorFor } from './adapterSupport';

function radarCurrentness(value: string): EnvelopeCurrentness {
  if (value === 'fresh') return 'CURRENT';
  if (value === 'stale') return 'STALE';
  return 'UNKNOWN';
}

function radarSeverity(value: string | null | undefined): EnvelopeSeverity | null {
  const normalized = value?.toUpperCase();
  if (normalized === 'CRITICAL' || normalized === 'HIGH' || normalized === 'MEDIUM' || normalized === 'LOW') {
    return normalized;
  }
  return normalized ? 'UNKNOWN' : null;
}

export type PropertyRadarMatchEnvelopeRow = {
  id: string;
  propertyId: string;
  radarEventId: string;
  eventType: string;
  provider: string;
  eventRevisionId?: string | null;
  eventObservedAt: Date | string;
  eventExpiresAt?: Date | string | null;
  impactLevel?: string | null;
  confidenceScore?: number | { toString(): string } | null;
  lifecycleStatus: string;
  sourceFreshnessStatus: string;
  matcherVersion?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export const propertyRadarMatchEnvelopeAdapter: EnvelopeAdapter<PropertyRadarMatchEnvelopeRow> = {
  descriptor: descriptorFor('PropertyRadarMatch', {
    lineageDerivationVersion: 'property-radar-event-v1',
    revisionTokenAlgorithm: 'event-revision-match-updated-at-v1',
    freshnessPolicy: 'property match sourceFreshnessStatus and event expiry',
  }),
  map(row, context) {
    const currentness = ['no_longer_applicable', 'expired'].includes(row.lifecycleStatus)
      ? 'STALE' as const
      : radarCurrentness(row.sourceFreshnessStatus);
    return buildMappedItem({
      producerModel: 'PropertyRadarMatch',
      nativeSubtype: row.eventType,
      sourceRecordId: row.id,
      nativeLineageId: `${row.propertyId}:${row.radarEventId}`,
      nativeRevisionToken: `${row.eventRevisionId ?? 'unknown'}:${new Date(row.updatedAt).toISOString()}`,
      context,
      producer: row.provider,
      generatedBy: 'EXTERNAL_INGEST',
      method: 'home-event-radar-match',
      ...(row.matcherVersion ? { modelVersion: row.matcherVersion } : {}),
      confidence: normalizeConfidenceRatio(row.confidenceScore?.toString()),
      severity: radarSeverity(row.impactLevel),
      currentness,
      computedAt: row.eventObservedAt,
      staleAfter: row.eventExpiresAt ?? null,
      ttl: null,
      nativeStatus: row.lifecycleStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  },
};

export type PropertyRadarCompoundInsightEnvelopeRow = {
  id: string;
  propertyId: string;
  ruleCode: string;
  ruleVersion: string;
  correlationKey: string;
  status: string;
  evaluatedAt: Date | string;
  resolvedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export const propertyRadarCompoundInsightEnvelopeAdapter: EnvelopeAdapter<PropertyRadarCompoundInsightEnvelopeRow> = {
  descriptor: descriptorFor('PropertyRadarCompoundInsight', {
    lineageDerivationVersion: 'compound-correlation-key-v1',
    revisionTokenAlgorithm: 'compound-rule-version-updated-at-v1',
    freshnessPolicy: 'active is CURRENT; resolved is STALE',
  }),
  map(row, context) {
    return buildMappedItem({
      producerModel: 'PropertyRadarCompoundInsight',
      nativeSubtype: row.ruleCode,
      sourceRecordId: row.id,
      nativeLineageId: row.correlationKey,
      nativeRevisionToken: `${row.ruleVersion}:${new Date(row.updatedAt).toISOString()}`,
      context,
      producer: 'HomeEventRadar',
      generatedBy: 'DETERMINISTIC',
      method: row.ruleCode,
      modelVersion: row.ruleVersion,
      confidence: null,
      severity: null,
      currentness: row.status === 'active' ? 'CURRENT' : 'STALE',
      computedAt: row.evaluatedAt,
      staleAfter: row.resolvedAt ?? null,
      ttl: null,
      nativeStatus: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  },
};
