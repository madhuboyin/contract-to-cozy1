import {
  IntelligenceEnvelopeItemSchema,
  deriveEnvelopeIdentity,
  type EnvelopeCurrentness,
  type EnvelopeProducerModel,
  type EnvelopeSeverity,
  type IntelligenceEnvelopeItem,
} from '../intelligenceEnvelope.contract';
import type {
  EnvelopeAdapterCapability,
  EnvelopeAdapterDescriptor,
  EnvelopeAdapterInputBase,
  EnvelopeAdapterResult,
} from '../envelopeAdapter.contract';
import { ENVELOPE_MAPPING_VERSION } from '../envelopeAdapter.contract';
import { ENVELOPE_MAPPINGS, getEnvelopeMapping } from '../envelopeMappingRegistry';
import type {
  EnvelopeEntityRef,
  InventoryItemCategory,
  QualifiedClaim,
} from '../../../productFramework/intelligence';
import {
  ASSET_KIND_REGISTRY,
  AssetKindSchema,
  INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION,
  InventoryItemCategorySchema,
} from '../../../productFramework/intelligence';

type DateValue = Date | string;

export function iso(value: DateValue): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function descriptorFor(
  producerModel: EnvelopeProducerModel,
  options: Pick<EnvelopeAdapterDescriptor, 'lineageDerivationVersion' | 'revisionTokenAlgorithm' | 'freshnessPolicy'>,
): EnvelopeAdapterDescriptor {
  const capabilities: EnvelopeAdapterCapability[] = ENVELOPE_MAPPINGS
    .filter((mapping) => mapping.producerModel === producerModel)
    .map(({ type, domain, nativeSubtype, propositionType }) => Object.freeze({
      type,
      domain,
      nativeSubtype,
      ...(propositionType ? { propositionType } : {}),
    }));
  return Object.freeze({
    producerModel,
    capabilities: Object.freeze(capabilities),
    domainTaxonomyVersion: INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION,
    mappingVersion: ENVELOPE_MAPPING_VERSION,
    ...options,
  });
}

export function inventoryEntityRef(input: {
  entityId: string;
  category: string;
  assetType?: string | null;
}): EnvelopeEntityRef {
  const assetCategory = InventoryItemCategorySchema.parse(input.category) as InventoryItemCategory;
  const parsedAssetKind = input.assetType ? AssetKindSchema.safeParse(input.assetType.toUpperCase()) : null;
  const assetKind = parsedAssetKind?.success
    && ASSET_KIND_REGISTRY[parsedAssetKind.data].category === assetCategory
      ? parsedAssetKind.data
      : undefined;
  return {
    entityType: 'INVENTORY_ITEM',
    entityId: input.entityId,
    assetCategory,
    ...(assetKind ? { assetKind } : {}),
  };
}

export function unmapped(
  producerModel: EnvelopeProducerModel,
  nativeSubtype: string,
): EnvelopeAdapterResult {
  return {
    diagnostic: {
      producerModel,
      code: 'UNMAPPED_NATIVE_VALUE',
      count: 1,
      nativeValue: nativeSubtype,
    },
  };
}

export function buildMappedItem(input: {
  producerModel: EnvelopeProducerModel;
  nativeSubtype: string;
  sourceRecordId: string;
  nativeLineageId: string;
  nativeRevisionToken: string;
  context: EnvelopeAdapterInputBase;
  producer: string;
  generatedBy: 'DETERMINISTIC' | 'LLM' | 'EXTERNAL_INGEST' | 'HYBRID';
  method: string;
  modelVersion?: string;
  confidence: number | null;
  severity: EnvelopeSeverity | null;
  currentness: EnvelopeCurrentness;
  computedAt: DateValue;
  staleAfter: DateValue | null;
  ttl: string | null;
  nativeStatus: string | null;
  createdAt: DateValue;
  updatedAt: DateValue;
  entityRef?: EnvelopeEntityRef;
  qualifiedClaim?: QualifiedClaim;
  relatedDomains?: IntelligenceEnvelopeItem['relatedDomains'];
}): EnvelopeAdapterResult {
  const mapping = getEnvelopeMapping(input.producerModel, input.nativeSubtype);
  if (!mapping) return unmapped(input.producerModel, input.nativeSubtype);
  const identity = deriveEnvelopeIdentity(input);
  const item = IntelligenceEnvelopeItemSchema.parse({
    ...identity,
    nativeRevisionToken: input.nativeRevisionToken,
    ...(input.qualifiedClaim ? { qualifiedClaim: input.qualifiedClaim } : {}),
    type: mapping.type,
    domain: mapping.domain,
    ...(input.relatedDomains?.length ? { relatedDomains: input.relatedDomains } : {}),
    domainTaxonomyVersion: INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION,
    subject: {
      propertyId: input.context.propertyId,
      ...(input.context.userId ? { userId: input.context.userId } : {}),
      ...(input.entityRef ? { entityRef: input.entityRef } : {}),
    },
    source: {
      producer: input.producer,
      sourceModel: input.producerModel,
      sourceRecordId: input.sourceRecordId,
    },
    provenance: {
      generatedBy: input.generatedBy,
      method: input.method,
      ...(input.modelVersion ? { modelVersion: input.modelVersion } : {}),
    },
    confidence: input.confidence,
    evidence: input.context.evidence,
    severity: input.severity,
    freshness: {
      computedAt: iso(input.computedAt),
      ttl: input.ttl,
      staleAfter: input.staleAfter ? iso(input.staleAfter) : null,
      currentness: input.currentness,
    },
    nativeStatus: input.nativeStatus,
    createdAt: iso(input.createdAt),
    updatedAt: iso(input.updatedAt),
  });
  return {
    item,
    capability: {
      type: mapping.type,
      domain: mapping.domain,
      nativeSubtype: mapping.nativeSubtype,
      ...(mapping.propositionType ? { propositionType: mapping.propositionType } : {}),
    },
  };
}

export function currentnessFromExpiry(expiry: DateValue | null | undefined, now: Date): EnvelopeCurrentness {
  if (!expiry) return 'UNKNOWN';
  return new Date(expiry).getTime() >= now.getTime() ? 'CURRENT' : 'STALE';
}

export function severityFromScore(score: number | null | undefined): EnvelopeSeverity | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (score >= 90) return 'CRITICAL';
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  if (score > 0) return 'LOW';
  return 'INFO';
}
