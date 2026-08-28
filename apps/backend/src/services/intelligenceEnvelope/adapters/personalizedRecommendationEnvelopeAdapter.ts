import { normalizeConfidenceRatio } from '../../../productFramework/intelligence';
import type { EnvelopeAdapter } from '../envelopeAdapter.contract';
import { buildMappedItem, currentnessFromExpiry, descriptorFor } from './adapterSupport';

export type PersonalizedRecommendationEnvelopeRow = {
  id: string;
  propertyId: string;
  definitionCode: string;
  status: string;
  ruleVersion: number;
  contentVersion: number;
  confidence?: number | null;
  firstEligibleAt: Date | string;
  lastEvaluatedAt: Date | string;
  expiresAt?: Date | string | null;
};

export const personalizedRecommendationEnvelopeAdapter: EnvelopeAdapter<PersonalizedRecommendationEnvelopeRow> = {
  descriptor: descriptorFor('PersonalizedRecommendation', {
    lineageDerivationVersion: 'property-definition-v1',
    revisionTokenAlgorithm: 'rule-content-last-evaluated-v1',
    freshnessPolicy: 'expiresAt plus recommendation status',
  }),
  map(row, context) {
    const currentness = ['COMPLETED', 'DISMISSED', 'EXPIRED', 'SUPPRESSED'].includes(row.status)
      ? 'STALE' as const
      : currentnessFromExpiry(row.expiresAt, new Date());
    return buildMappedItem({
      producerModel: 'PersonalizedRecommendation',
      nativeSubtype: row.definitionCode,
      sourceRecordId: row.id,
      nativeLineageId: `${row.propertyId}:${row.definitionCode}`,
      nativeRevisionToken: `${row.ruleVersion}:${row.contentVersion}:${new Date(row.lastEvaluatedAt).toISOString()}`,
      context,
      producer: 'PersonalizationEngine',
      generatedBy: 'DETERMINISTIC',
      method: row.definitionCode,
      modelVersion: `${row.ruleVersion}.${row.contentVersion}`,
      confidence: normalizeConfidenceRatio(row.confidence),
      severity: null,
      currentness,
      computedAt: row.lastEvaluatedAt,
      staleAfter: row.expiresAt ?? null,
      ttl: null,
      nativeStatus: row.status,
      createdAt: row.firstEligibleAt,
      updatedAt: row.lastEvaluatedAt,
    });
  },
};
