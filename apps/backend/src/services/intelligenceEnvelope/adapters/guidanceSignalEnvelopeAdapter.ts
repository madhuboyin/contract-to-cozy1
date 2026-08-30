import {
  normalizeConfidenceRatio,
  type EnvelopeEntityRef,
} from '../../../productFramework/intelligence';
import type { EnvelopeAdapter } from '../envelopeAdapter.contract';
import {
  buildMappedItem,
  currentnessFromExpiry,
  descriptorFor,
  inventoryEntityRef,
  severityFromScore,
} from './adapterSupport';

export type GuidanceSignalEnvelopeRow = {
  id: string;
  propertyId: string;
  inventoryItemId?: string | null;
  issueDomain: string;
  status: string;
  severityScore?: number | null;
  confidenceScore?: number | { toString(): string } | null;
  sourceType?: string | null;
  sourceFeatureKey?: string | null;
  lastObservedAt: Date | string;
  expiresAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  inventoryItem?: { category: string; assetType?: string | null } | null;
};

export const guidanceSignalEnvelopeAdapter: EnvelopeAdapter<GuidanceSignalEnvelopeRow> = {
  descriptor: descriptorFor('GuidanceSignal', {
    lineageDerivationVersion: 'guidance-signal-id-v1',
    revisionTokenAlgorithm: 'guidance-updated-at-v1',
    freshnessPolicy: 'expiresAt plus native status',
  }),
  map(row, context) {
    const entityRef: EnvelopeEntityRef | undefined = row.inventoryItemId && row.inventoryItem
      ? inventoryEntityRef({
          entityId: row.inventoryItemId,
          category: row.inventoryItem.category,
          assetType: row.inventoryItem.assetType,
        })
      : undefined;
    const statusCurrentness = ['RESOLVED', 'ARCHIVED', 'SUPPRESSED'].includes(row.status)
      ? 'STALE' as const
      : currentnessFromExpiry(row.expiresAt, new Date());
    return buildMappedItem({
      producerModel: 'GuidanceSignal',
      nativeSubtype: row.issueDomain,
      sourceRecordId: row.id,
      nativeLineageId: row.id,
      nativeRevisionToken: new Date(row.updatedAt).toISOString(),
      context,
      producer: row.sourceType ?? 'GuidanceEngine',
      generatedBy: 'DETERMINISTIC',
      method: row.sourceFeatureKey ?? 'guidance-signal',
      confidence: normalizeConfidenceRatio(row.confidenceScore?.toString()),
      severity: severityFromScore(row.severityScore),
      currentness: statusCurrentness,
      computedAt: row.lastObservedAt,
      staleAfter: row.expiresAt ?? null,
      ttl: null,
      nativeStatus: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(entityRef ? { entityRef } : {}),
    });
  },
};
