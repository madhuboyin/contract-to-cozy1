import { normalizeConfidenceRatio } from '../../../productFramework/intelligence';
import type { EnvelopeAdapter } from '../envelopeAdapter.contract';
import { buildMappedItem, currentnessFromExpiry, descriptorFor } from './adapterSupport';

export type IntelligenceObservationEnvelopeRow = {
  id: string;
  propertyId: string;
  observationType: string;
  lifecycleStatus: string;
  externalId: string;
  revision: number;
  contentHash: string;
  sourceId: string;
  sourceRunId: string;
  observedAt?: Date | string | null;
  effectiveTo?: Date | string | null;
  lastVerifiedAt: Date | string;
  sourceUrl?: string | null;
  matchConfidence?: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export const intelligenceObservationEnvelopeAdapter: EnvelopeAdapter<IntelligenceObservationEnvelopeRow> = {
  descriptor: descriptorFor('IntelligenceObservation', {
    lineageDerivationVersion: 'source-external-id-v1',
    revisionTokenAlgorithm: 'observation-revision-content-hash-v1',
    freshnessPolicy: 'effectiveTo plus lifecycle status',
  }),
  map(row, context) {
    const currentness = ['STALE', 'CANCELLED'].includes(row.lifecycleStatus)
      ? 'STALE' as const
      : currentnessFromExpiry(row.effectiveTo, new Date());
    return buildMappedItem({
      producerModel: 'IntelligenceObservation',
      nativeSubtype: row.observationType,
      sourceRecordId: row.id,
      nativeLineageId: `${row.sourceId}:${row.externalId}`,
      nativeRevisionToken: `${row.revision}:${row.contentHash}`,
      context,
      producer: row.sourceId,
      generatedBy: 'EXTERNAL_INGEST',
      method: 'property-intelligence-ingest',
      modelVersion: row.sourceRunId,
      confidence: normalizeConfidenceRatio(row.matchConfidence),
      severity: null,
      currentness,
      computedAt: row.lastVerifiedAt,
      staleAfter: row.effectiveTo ?? null,
      ttl: null,
      nativeStatus: row.lifecycleStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  },
};
