import {
  normalizeConfidenceRatio,
  type EnvelopeEntityRef,
} from '../../../productFramework/intelligence';
import type { EnvelopeAdapter } from '../envelopeAdapter.contract';
import { buildMappedItem, currentnessFromExpiry, descriptorFor, inventoryEntityRef } from './adapterSupport';

export type SignalEnvelopeRow = {
  id: string;
  propertyId: string;
  signalKey: string;
  homeItemId?: string | null;
  version: number;
  confidence?: number | null;
  sourceModel: string;
  sourceId: string;
  capturedAt: Date | string;
  validUntil?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  inventory?: { category: string; assetType?: string | null } | null;
};

export const signalEnvelopeAdapter: EnvelopeAdapter<SignalEnvelopeRow> = {
  descriptor: descriptorFor('Signal', {
    lineageDerivationVersion: 'signal-lineage-v1',
    revisionTokenAlgorithm: 'signal-version-updated-at-v1',
    freshnessPolicy: 'validUntil; missing expiry is UNKNOWN',
  }),
  map(row, context) {
    const now = new Date();
    const entityRef: EnvelopeEntityRef | undefined = row.homeItemId && row.inventory
      ? inventoryEntityRef({
          entityId: row.homeItemId,
          category: row.inventory.category,
          assetType: row.inventory.assetType,
        })
      : undefined;
    return buildMappedItem({
      producerModel: 'Signal',
      nativeSubtype: row.signalKey,
      sourceRecordId: row.id,
      nativeLineageId: `${row.propertyId}:${row.signalKey}:${row.sourceModel}:${row.sourceId}`,
      nativeRevisionToken: `${row.version}:${new Date(row.updatedAt).toISOString()}`,
      context,
      producer: row.sourceModel,
      generatedBy: 'DETERMINISTIC',
      method: 'shared-signal-projection',
      confidence: normalizeConfidenceRatio(row.confidence),
      severity: null,
      currentness: currentnessFromExpiry(row.validUntil, now),
      computedAt: row.capturedAt,
      staleAfter: row.validUntil ?? null,
      ttl: null,
      nativeStatus: null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(entityRef ? { entityRef } : {}),
    });
  },
};
