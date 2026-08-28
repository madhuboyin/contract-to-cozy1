import {
  entityRefKey,
  normalizeConfidenceRatio,
  type EnvelopeEntityRef,
} from '../../../productFramework/intelligence';
import type { EnvelopeAdapter } from '../envelopeAdapter.contract';
import { getEnvelopeMapping } from '../envelopeMappingRegistry';
import { buildMappedItem, descriptorFor } from './adapterSupport';

export type RecommendationSnapshotEnvelopeRow = {
  id: string;
  propertyId: string;
  decisionThreadId?: string | null;
  recommendationOwner: string;
  recommendationDefinitionId: string;
  recommendationDefinitionVersion: string;
  scenarioId?: string | null;
  verdictCode: string;
  confidence?: number | null;
  generatedAt: Date | string;
  supersedesSnapshotId?: string | null;
  inputDigest: string;
  isCurrent: boolean;
  entityRef?: EnvelopeEntityRef;
};

export const recommendationSnapshotEnvelopeAdapter: EnvelopeAdapter<RecommendationSnapshotEnvelopeRow> = {
  descriptor: descriptorFor('RecommendationSnapshot', {
    lineageDerivationVersion: 'decision-thread-or-definition-scenario-v1',
    revisionTokenAlgorithm: 'snapshot-input-digest-v1',
    freshnessPolicy: 'immutable snapshot; currentness is resolved by owning DecisionThread query',
  }),
  map(row, context) {
    const mapping = getEnvelopeMapping('RecommendationSnapshot', row.recommendationDefinitionId);
    const propositionType = mapping?.propositionType;
    const lineageId = row.decisionThreadId
      ?? `${row.propertyId}:${row.recommendationDefinitionId}:${row.scenarioId ?? 'default'}`;
    return buildMappedItem({
      producerModel: 'RecommendationSnapshot',
      nativeSubtype: row.recommendationDefinitionId,
      sourceRecordId: row.id,
      nativeLineageId: lineageId,
      nativeRevisionToken: row.inputDigest,
      context,
      producer: row.recommendationOwner,
      generatedBy: 'DETERMINISTIC',
      method: row.recommendationDefinitionId,
      modelVersion: row.recommendationDefinitionVersion,
      confidence: normalizeConfidenceRatio(row.confidence),
      severity: null,
      currentness: row.isCurrent ? 'CURRENT' : 'STALE',
      computedAt: row.generatedAt,
      staleAfter: null,
      ttl: null,
      nativeStatus: null,
      createdAt: row.generatedAt,
      updatedAt: row.generatedAt,
      ...(row.entityRef ? { entityRef: row.entityRef } : {}),
      ...(propositionType ? {
        qualifiedClaim: {
          claimKey: {
            propertyId: row.propertyId,
            entityRef: row.entityRef ? entityRefKey(row.entityRef) : null,
            propositionType,
            assessmentHorizonVersion: row.scenarioId
              ? `${row.recommendationDefinitionVersion}:${row.scenarioId}`
              : row.recommendationDefinitionVersion,
          },
          verdict: row.verdictCode,
        },
      } : {}),
    });
  },
};
