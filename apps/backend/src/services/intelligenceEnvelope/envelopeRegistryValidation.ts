import {
  ASSET_KIND_REGISTRY,
  INVENTORY_ITEM_CATEGORIES,
  INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION,
  SHARED_SIGNAL_KEYS,
} from '../../productFramework/intelligence';
import { InventoryItemCategory } from '@prisma/client';
import { RISK_ASSET_CONFIG } from '../../config/risk-constants';
import { RADAR_COMPOUND_RULE_CODES } from '../../modules/homeEventRadar/domain/radarCompoundRules';
import { PERSONALIZATION_DEFINITIONS } from '../../modules/personalization/catalog/personalizationDefinitions';
import { DECISION_DEFINITIONS } from '../decisionPlatform/decisionDefinitionRegistry';
import { ENVELOPE_ADAPTERS } from './envelopeAdapterRegistry';
import { ENVELOPE_MAPPING_VERSION } from './envelopeAdapter.contract';
import { ENVELOPE_MAPPINGS } from './envelopeMappingRegistry';
import { ENVELOPE_PRODUCER_MODELS } from './intelligenceEnvelope.contract';

function missingValues(expected: readonly string[], actual: Set<string>): string[] {
  return expected.filter((value) => !actual.has(value));
}

export function validateEnvelopeRegistry(): string[] {
  const issues: string[] = [];
  const adapterOwners = new Set<string>();
  const mappingKeys = new Set<string>();

  for (const adapter of ENVELOPE_ADAPTERS) {
    const { descriptor } = adapter;
    if (adapterOwners.has(descriptor.producerModel)) {
      issues.push(`${descriptor.producerModel}: duplicate adapter ownership`);
    }
    adapterOwners.add(descriptor.producerModel);
    if (descriptor.domainTaxonomyVersion !== INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION) {
      issues.push(`${descriptor.producerModel}: domain taxonomy version mismatch`);
    }
    if (descriptor.mappingVersion !== ENVELOPE_MAPPING_VERSION) {
      issues.push(`${descriptor.producerModel}: mapping version mismatch`);
    }
    if (descriptor.capabilities.length === 0) {
      issues.push(`${descriptor.producerModel}: no declared capabilities`);
    }
    for (const capability of descriptor.capabilities) {
      const key = `${descriptor.producerModel}:${capability.nativeSubtype}`;
      if (mappingKeys.has(key)) issues.push(`${key}: duplicate capability ownership`);
      mappingKeys.add(key);
      const mapping = ENVELOPE_MAPPINGS.find((candidate) =>
        candidate.producerModel === descriptor.producerModel
        && candidate.nativeSubtype === capability.nativeSubtype);
      if (!mapping) issues.push(`${key}: descriptor capability has no mapping`);
      else if (mapping.type !== capability.type || mapping.domain !== capability.domain) {
        issues.push(`${key}: descriptor/mapping tuple mismatch`);
      }
    }
  }

  for (const producerModel of ENVELOPE_PRODUCER_MODELS) {
    if (!adapterOwners.has(producerModel)) issues.push(`${producerModel}: missing adapter`);
  }
  for (const mapping of ENVELOPE_MAPPINGS) {
    const key = `${mapping.producerModel}:${mapping.nativeSubtype}`;
    if (!mappingKeys.has(key)) issues.push(`${key}: mapping is not declared by its adapter`);
  }

  const nativeSubtypesFor = (producer: string) => new Set(
    ENVELOPE_MAPPINGS.filter((mapping) => mapping.producerModel === producer).map((mapping) => mapping.nativeSubtype),
  );
  for (const value of missingValues(SHARED_SIGNAL_KEYS, nativeSubtypesFor('Signal'))) {
    issues.push(`Signal:${value}: missing native subtype mapping`);
  }
  for (const value of missingValues(Object.keys(DECISION_DEFINITIONS), nativeSubtypesFor('RecommendationSnapshot'))) {
    issues.push(`RecommendationSnapshot:${value}: missing native subtype mapping`);
  }
  for (const value of missingValues(PERSONALIZATION_DEFINITIONS.map(({ code }) => code), nativeSubtypesFor('PersonalizedRecommendation'))) {
    issues.push(`PersonalizedRecommendation:${value}: missing native subtype mapping`);
  }
  for (const value of missingValues(RADAR_COMPOUND_RULE_CODES, nativeSubtypesFor('PropertyRadarCompoundInsight'))) {
    issues.push(`PropertyRadarCompoundInsight:${value}: missing native subtype mapping`);
  }
  const registeredAssetKinds = new Set(Object.keys(ASSET_KIND_REGISTRY));
  for (const value of missingValues(RISK_ASSET_CONFIG.map(({ systemType }) => systemType), registeredAssetKinds)) {
    issues.push(`AssetKind:${value}: risk configuration value is not registered`);
  }
  for (const value of missingValues(Object.keys(ASSET_KIND_REGISTRY), new Set(RISK_ASSET_CONFIG.map(({ systemType }) => systemType)))) {
    issues.push(`AssetKind:${value}: registry value has no risk configuration`);
  }
  const prismaInventoryCategories = new Set(Object.values(InventoryItemCategory));
  for (const value of missingValues(INVENTORY_ITEM_CATEGORIES, prismaInventoryCategories)) {
    issues.push(`InventoryItemCategory:${value}: missing from Prisma enum`);
  }
  for (const value of missingValues(Object.values(InventoryItemCategory), new Set(INVENTORY_ITEM_CATEGORIES))) {
    issues.push(`InventoryItemCategory:${value}: missing from intelligence contract`);
  }
  return issues;
}

export function certifyObservedEnvelopeCapabilities(
  observations: ReadonlyArray<{ producerModel: string; nativeSubtype: string }>,
): string[] {
  const declared = new Set(
    ENVELOPE_MAPPINGS.map(({ producerModel, nativeSubtype }) => `${producerModel}:${nativeSubtype}`),
  );
  return observations
    .map(({ producerModel, nativeSubtype }) => `${producerModel}:${nativeSubtype}`)
    .filter((key, index, all) => !declared.has(key) && all.indexOf(key) === index)
    .map((key) => `${key}: observed capability is not declared`);
}

export function assertEnvelopeRegistryValid(): void {
  const issues = validateEnvelopeRegistry();
  if (issues.length) throw new Error(`Envelope registry validation failed:\n${issues.join('\n')}`);
}
