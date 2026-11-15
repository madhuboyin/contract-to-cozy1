/**
 * Phase 0 Bullet 2 (FR-ONT-2, §18 Phase 0, §19 Artifact #25, §22 Decision 7):
 * Canonical Semantic-Field & Duplicate/Legacy Scalar Field Coalescence Manifest.
 *
 * Inventories every duplicate, overlapping, or legacy scalar field group across
 * property-scoped Prisma models and classifies each group as either:
 *   1. CANONICAL_WITH_GOVERNED_COALESCENCE — one business meaning with an ordered
 *      coalescence rule when one storage column is blank/null, and an explicit
 *      CONFLICTED outcome with provenance when two populated columns disagree;
 *   2. INTENTIONALLY_DISTINCT_BUSINESS_MEANING — distinct domain concepts that
 *      must never be coalesced (for example Property.roofReplacementYear versus
 *      an InventoryItem roof component's installedOn date); or
 *   3. DISTINCT_PENDING_OWNER_DECISION_7 — fields that look similar (such as
 *      InventoryItem.brand versus InventoryItem.manufacturer) and remain separate
 *      until owner decision §22.7 explicitly approves equivalence.
 */
import { Prisma } from '@prisma/client';
import { DATA_POINT_DEFINITIONS } from '../../dataPoint/dataPointCatalogue';

export const ASK_SCALAR_FIELD_COALESCENCE_MANIFEST_VERSION = 'phase0-scalar-coalescence-1.1.0' as const;

export type ScalarFieldDuplicateClassification =
  | 'CANONICAL_WITH_GOVERNED_COALESCENCE'
  | 'INTENTIONALLY_DISTINCT_BUSINESS_MEANING'
  | 'DISTINCT_PENDING_OWNER_DECISION_7';

export type ScalarFieldConflictBehavior =
  | 'CONFLICTED_WITH_PROVENANCE'
  | 'NORMALIZED_DERIVED_FROM_AUTHORITATIVE'
  | 'UNIT_CONVERTED_EQUIVALENCE_OR_CONFLICT'
  | 'NEVER_COALESCE_SEPARATE_FIELDS';

export type ScalarFieldBackfillDisposition =
  | 'CONSOLIDATE_TO_AUTHORITATIVE_ON_WRITE'
  | 'DERIVED_NORMALIZATION_COLUMN'
  | 'KEEP_SEPARATE_SCHEMA_COLUMNS'
  | 'PENDING_OWNER_DECISION_7';

export interface ScalarFieldStorageMember {
  readonly model: string;
  readonly field: string;
  readonly prismaType: string;
  readonly role: 'AUTHORITATIVE' | 'LEGACY_ALIAS' | 'NORMALIZED_SHADOW' | 'DISTINCT_PEER';
  readonly canonicalDataPointId: string | null;
}

export interface ScalarFieldCoalescenceEntry {
  readonly semanticFieldGroupId: string;
  readonly domainId: string;
  readonly classification: ScalarFieldDuplicateClassification;
  readonly businessMeaningSummary: string;
  readonly authoritativeStorage: { readonly model: string; readonly field: string } | null;
  readonly storageMembers: readonly ScalarFieldStorageMember[];
  readonly orderedCoalescenceRule: readonly string[];
  readonly blankVersusNullPolicy: 'TRIM_EMPTY_STRING_AS_NULL';
  readonly conflictBehavior: ScalarFieldConflictBehavior;
  readonly writeTarget: string | null;
  readonly backfillDisposition: ScalarFieldBackfillDisposition;
  readonly provenancePreference: string;
  readonly ownerDecisionRef: string | null;
}

export const ASK_SCALAR_FIELD_COALESCENCE_MANIFEST: readonly ScalarFieldCoalescenceEntry[] = Object.freeze([
  {
    semanticFieldGroupId: 'scalar_group.inventory_item.model_identity',
    domainId: 'domain.inventory',
    classification: 'CANONICAL_WITH_GOVERNED_COALESCENCE',
    businessMeaningSummary: 'Manufacturer model identifier of an inventory item, stored across canonical modelNumber, legacy model, and normalized lookup shadow modelNumberNorm.',
    authoritativeStorage: { model: 'InventoryItem', field: 'modelNumber' },
    storageMembers: [
      { model: 'InventoryItem', field: 'modelNumber', prismaType: 'String', role: 'AUTHORITATIVE', canonicalDataPointId: 'item.model' },
      { model: 'InventoryItem', field: 'model', prismaType: 'String', role: 'LEGACY_ALIAS', canonicalDataPointId: 'item.model' },
      { model: 'InventoryItem', field: 'modelNumberNorm', prismaType: 'String', role: 'NORMALIZED_SHADOW', canonicalDataPointId: null },
    ],
    orderedCoalescenceRule: ['InventoryItem.modelNumber', 'InventoryItem.model'],
    blankVersusNullPolicy: 'TRIM_EMPTY_STRING_AS_NULL',
    conflictBehavior: 'CONFLICTED_WITH_PROVENANCE',
    writeTarget: 'InventoryItem.modelNumber',
    backfillDisposition: 'CONSOLIDATE_TO_AUTHORITATIVE_ON_WRITE',
    provenancePreference: 'Prefer InventoryItem.modelNumber when InventoryItem.model is null/blank; if both are non-empty and case-insensitively unequal after trimming, emit CONFLICTED with both column values.',
    ownerDecisionRef: '§22.7',
  },
  {
    semanticFieldGroupId: 'scalar_group.inventory_item.serial_identity',
    domainId: 'domain.inventory',
    classification: 'CANONICAL_WITH_GOVERNED_COALESCENCE',
    businessMeaningSummary: 'Serial number of an inventory item, stored across canonical serialNumber and legacy serialNo.',
    authoritativeStorage: { model: 'InventoryItem', field: 'serialNumber' },
    storageMembers: [
      { model: 'InventoryItem', field: 'serialNumber', prismaType: 'String', role: 'AUTHORITATIVE', canonicalDataPointId: 'item.serial' },
      { model: 'InventoryItem', field: 'serialNo', prismaType: 'String', role: 'LEGACY_ALIAS', canonicalDataPointId: 'item.serial' },
    ],
    orderedCoalescenceRule: ['InventoryItem.serialNumber', 'InventoryItem.serialNo'],
    blankVersusNullPolicy: 'TRIM_EMPTY_STRING_AS_NULL',
    conflictBehavior: 'CONFLICTED_WITH_PROVENANCE',
    writeTarget: 'InventoryItem.serialNumber',
    backfillDisposition: 'CONSOLIDATE_TO_AUTHORITATIVE_ON_WRITE',
    provenancePreference: 'Prefer InventoryItem.serialNumber when InventoryItem.serialNo is null/blank; if both are non-empty and unequal after trimming, emit CONFLICTED.',
    ownerDecisionRef: '§22.7',
  },
  {
    semanticFieldGroupId: 'scalar_group.inventory_item.brand_vs_manufacturer',
    domainId: 'domain.inventory',
    classification: 'DISTINCT_PENDING_OWNER_DECISION_7',
    businessMeaningSummary: 'Consumer-facing product brand (item.brand) versus legal/OEM manufacturer name (item.manufacturer) and normalized manufacturerNorm.',
    authoritativeStorage: null,
    storageMembers: [
      { model: 'InventoryItem', field: 'brand', prismaType: 'String', role: 'DISTINCT_PEER', canonicalDataPointId: 'item.brand' },
      { model: 'InventoryItem', field: 'manufacturer', prismaType: 'String', role: 'DISTINCT_PEER', canonicalDataPointId: 'item.manufacturer' },
      { model: 'InventoryItem', field: 'manufacturerNorm', prismaType: 'String', role: 'NORMALIZED_SHADOW', canonicalDataPointId: null },
    ],
    orderedCoalescenceRule: [],
    blankVersusNullPolicy: 'TRIM_EMPTY_STRING_AS_NULL',
    conflictBehavior: 'NEVER_COALESCE_SEPARATE_FIELDS',
    writeTarget: null,
    backfillDisposition: 'PENDING_OWNER_DECISION_7',
    provenancePreference: 'FR-ONT-2 explicit rule: brand and manufacturer remain separate semantic fields (item.brand vs item.manufacturer) until business equivalence is explicitly approved under §22.7.',
    ownerDecisionRef: '§22.7',
  },
  {
    semanticFieldGroupId: 'scalar_group.inventory_item.category_vs_asset_type',
    domainId: 'domain.inventory',
    classification: 'DISTINCT_PENDING_OWNER_DECISION_7',
    businessMeaningSummary: 'Structured InventoryItemCategory enum (category) versus free-text/specialist assetType code on InventoryItem.',
    authoritativeStorage: { model: 'InventoryItem', field: 'category' },
    storageMembers: [
      { model: 'InventoryItem', field: 'category', prismaType: 'InventoryItemCategory', role: 'AUTHORITATIVE', canonicalDataPointId: 'item.category' },
      { model: 'InventoryItem', field: 'assetType', prismaType: 'String', role: 'DISTINCT_PEER', canonicalDataPointId: null },
    ],
    orderedCoalescenceRule: ['InventoryItem.category'],
    blankVersusNullPolicy: 'TRIM_EMPTY_STRING_AS_NULL',
    conflictBehavior: 'NEVER_COALESCE_SEPARATE_FIELDS',
    writeTarget: 'InventoryItem.category',
    backfillDisposition: 'PENDING_OWNER_DECISION_7',
    provenancePreference: 'Homeowner category queries read InventoryItem.category (enum); assetType is specialist subtype metadata and is not silently substituted for category.',
    ownerDecisionRef: '§22.7',
  },
  {
    semanticFieldGroupId: 'scalar_group.insurance_policy.deductible',
    domainId: 'domain.insurance_policies',
    classification: 'CANONICAL_WITH_GOVERNED_COALESCENCE',
    businessMeaningSummary: 'Insurance policy deductible represented as Decimal dollars (deductibleAmount) and integer cents (deductibleCents).',
    authoritativeStorage: { model: 'InsurancePolicy', field: 'deductibleAmount' },
    storageMembers: [
      { model: 'InsurancePolicy', field: 'deductibleAmount', prismaType: 'Decimal', role: 'AUTHORITATIVE', canonicalDataPointId: 'policy.deductible' },
      { model: 'InsurancePolicy', field: 'deductibleCents', prismaType: 'Int', role: 'LEGACY_ALIAS', canonicalDataPointId: 'policy.deductible' },
    ],
    orderedCoalescenceRule: ['InsurancePolicy.deductibleAmount', 'InsurancePolicy.deductibleCents'],
    blankVersusNullPolicy: 'TRIM_EMPTY_STRING_AS_NULL',
    conflictBehavior: 'UNIT_CONVERTED_EQUIVALENCE_OR_CONFLICT',
    writeTarget: 'InsurancePolicy.deductibleAmount',
    backfillDisposition: 'CONSOLIDATE_TO_AUTHORITATIVE_ON_WRITE',
    provenancePreference: 'Coalesce when only one representation is populated or when Math.round(Number(deductibleAmount) * 100) === deductibleCents; otherwise emit CONFLICTED.',
    ownerDecisionRef: '§22.7',
  },
  {
    semanticFieldGroupId: 'scalar_group.property.postal_code',
    domainId: 'domain.property_profile',
    classification: 'CANONICAL_WITH_GOVERNED_COALESCENCE',
    businessMeaningSummary: 'Property postal/ZIP code stored across homeowner-entered zipCode, normalizedZipCode, and geocoder-derived geocodedZipCode.',
    authoritativeStorage: { model: 'Property', field: 'zipCode' },
    storageMembers: [
      { model: 'Property', field: 'zipCode', prismaType: 'String', role: 'AUTHORITATIVE', canonicalDataPointId: 'home.zipCode' },
      { model: 'Property', field: 'normalizedZipCode', prismaType: 'String', role: 'NORMALIZED_SHADOW', canonicalDataPointId: null },
      { model: 'Property', field: 'geocodedZipCode', prismaType: 'String', role: 'NORMALIZED_SHADOW', canonicalDataPointId: null },
    ],
    orderedCoalescenceRule: ['Property.zipCode', 'Property.normalizedZipCode'],
    blankVersusNullPolicy: 'TRIM_EMPTY_STRING_AS_NULL',
    conflictBehavior: 'NORMALIZED_DERIVED_FROM_AUTHORITATIVE',
    writeTarget: 'Property.zipCode',
    backfillDisposition: 'DERIVED_NORMALIZATION_COLUMN',
    provenancePreference: 'Property.zipCode is authoritative for homeowner display; geocodedZipCode is geocoder metadata and never overrides a differing 5-digit Property.zipCode without flagging conflict.',
    ownerDecisionRef: null,
  },
  {
    semanticFieldGroupId: 'scalar_group.cross_entity.roof_install_year',
    domainId: 'domain.property_profile',
    classification: 'INTENTIONALLY_DISTINCT_BUSINESS_MEANING',
    businessMeaningSummary: 'Property-level roof replacement year (Property.roofReplacementYear) versus an inventoried roof/exterior component installation date (InventoryItem.installedOn).',
    authoritativeStorage: null,
    storageMembers: [
      { model: 'Property', field: 'roofReplacementYear', prismaType: 'Int', role: 'DISTINCT_PEER', canonicalDataPointId: 'home.roofReplacementYear' },
      { model: 'InventoryItem', field: 'installedOn', prismaType: 'DateTime', role: 'DISTINCT_PEER', canonicalDataPointId: 'item.installedOn' },
    ],
    orderedCoalescenceRule: [],
    blankVersusNullPolicy: 'TRIM_EMPTY_STRING_AS_NULL',
    conflictBehavior: 'NEVER_COALESCE_SEPARATE_FIELDS',
    writeTarget: null,
    backfillDisposition: 'KEEP_SEPARATE_SCHEMA_COLUMNS',
    provenancePreference: 'FR-ONT-2 explicit rule: a property roof replacement year (home.roofReplacementYear) and an inventoried roof component installation date (item.installedOn) represent distinct entities and must never silently coalesce.',
    ownerDecisionRef: 'FR-ONT-2',
  },
  {
    semanticFieldGroupId: 'scalar_group.cross_entity.major_system_install_year',
    domainId: 'domain.property_profile',
    classification: 'INTENTIONALLY_DISTINCT_BUSINESS_MEANING',
    businessMeaningSummary: 'Property-level system install years (Property.hvacInstallYear, Property.waterHeaterInstallYear) versus individual InventoryItem.installedOn records.',
    authoritativeStorage: null,
    storageMembers: [
      { model: 'Property', field: 'hvacInstallYear', prismaType: 'Int', role: 'DISTINCT_PEER', canonicalDataPointId: null },
      { model: 'Property', field: 'waterHeaterInstallYear', prismaType: 'Int', role: 'DISTINCT_PEER', canonicalDataPointId: null },
      { model: 'InventoryItem', field: 'installedOn', prismaType: 'DateTime', role: 'DISTINCT_PEER', canonicalDataPointId: 'item.installedOn' },
    ],
    orderedCoalescenceRule: [],
    blankVersusNullPolicy: 'TRIM_EMPTY_STRING_AS_NULL',
    conflictBehavior: 'NEVER_COALESCE_SEPARATE_FIELDS',
    writeTarget: null,
    backfillDisposition: 'KEEP_SEPARATE_SCHEMA_COLUMNS',
    provenancePreference: 'Property-level summary install years (used when no inventory item exists) are distinct from specific InventoryItem.installedOn timestamps.',
    ownerDecisionRef: '§22.7',
  },
  {
    semanticFieldGroupId: 'scalar_group.cross_entity.lot_size',
    domainId: 'domain.property_profile',
    classification: 'DISTINCT_PENDING_OWNER_DECISION_7',
    businessMeaningSummary: 'Property.lotSize (Float) versus PropertyExteriorProfile.lotSizeSqFt (Float, exposed in Property Context as exterior.lotSizeSqFt).',
    authoritativeStorage: { model: 'PropertyExteriorProfile', field: 'lotSizeSqFt' },
    storageMembers: [
      { model: 'PropertyExteriorProfile', field: 'lotSizeSqFt', prismaType: 'Float', role: 'AUTHORITATIVE', canonicalDataPointId: null },
      { model: 'Property', field: 'lotSize', prismaType: 'Float', role: 'LEGACY_ALIAS', canonicalDataPointId: null },
    ],
    orderedCoalescenceRule: ['PropertyExteriorProfile.lotSizeSqFt'],
    blankVersusNullPolicy: 'TRIM_EMPTY_STRING_AS_NULL',
    conflictBehavior: 'CONFLICTED_WITH_PROVENANCE',
    writeTarget: 'PropertyExteriorProfile.lotSizeSqFt',
    backfillDisposition: 'PENDING_OWNER_DECISION_7',
    provenancePreference: 'Property.lotSize lacks explicit units in legacy rows (acres vs sq ft), whereas PropertyExteriorProfile.lotSizeSqFt is explicitly square feet; never silently coalesce without unit verification.',
    ownerDecisionRef: '§22.7',
  },
  {
    semanticFieldGroupId: 'scalar_group.maintenance_task.category_classification',
    domainId: 'domain.maintenance',
    classification: 'DISTINCT_PENDING_OWNER_DECISION_7',
    businessMeaningSummary: 'PropertyMaintenanceTask classification fields: serviceCategory (ServiceCategory enum), category (String), and assetType (String).',
    authoritativeStorage: { model: 'PropertyMaintenanceTask', field: 'serviceCategory' },
    storageMembers: [
      { model: 'PropertyMaintenanceTask', field: 'serviceCategory', prismaType: 'ServiceCategory', role: 'AUTHORITATIVE', canonicalDataPointId: null },
      { model: 'PropertyMaintenanceTask', field: 'category', prismaType: 'String', role: 'LEGACY_ALIAS', canonicalDataPointId: null },
      { model: 'PropertyMaintenanceTask', field: 'assetType', prismaType: 'String', role: 'DISTINCT_PEER', canonicalDataPointId: null },
    ],
    orderedCoalescenceRule: ['PropertyMaintenanceTask.serviceCategory', 'PropertyMaintenanceTask.category'],
    blankVersusNullPolicy: 'TRIM_EMPTY_STRING_AS_NULL',
    conflictBehavior: 'CONFLICTED_WITH_PROVENANCE',
    writeTarget: 'PropertyMaintenanceTask.serviceCategory',
    backfillDisposition: 'PENDING_OWNER_DECISION_7',
    provenancePreference: 'Prefer structured ServiceCategory enum; if free-text category disagrees with serviceCategory, emit CONFLICTED until consolidated.',
    ownerDecisionRef: '§22.7',
  },
  {
    semanticFieldGroupId: 'scalar_group.cross_entity.target_closing_date',
    domainId: 'domain.buyer_journey',
    classification: 'INTENTIONALLY_DISTINCT_BUSINESS_MEANING',
    businessMeaningSummary: 'Buyer target closing date (HomeBuyerChecklist.targetCloseDate) versus Seller target closing date (PropertySaleCase.targetCloseDate).',
    authoritativeStorage: null,
    storageMembers: [
      { model: 'HomeBuyerChecklist', field: 'targetCloseDate', prismaType: 'DateTime', role: 'DISTINCT_PEER', canonicalDataPointId: 'buyer.targetCloseDate' },
      { model: 'PropertySaleCase', field: 'targetCloseDate', prismaType: 'DateTime', role: 'DISTINCT_PEER', canonicalDataPointId: 'saleCase.targetCloseDate' },
    ],
    orderedCoalescenceRule: [],
    blankVersusNullPolicy: 'TRIM_EMPTY_STRING_AS_NULL',
    conflictBehavior: 'NEVER_COALESCE_SEPARATE_FIELDS',
    writeTarget: null,
    backfillDisposition: 'KEEP_SEPARATE_SCHEMA_COLUMNS',
    provenancePreference: 'Acquisition closing date and sale closing date belong to distinct lifecycle cases. Fallback between them is permitted only when exactly one lifecycle case exists on the property and the receipt names the actual entity read.',
    ownerDecisionRef: null,
  },
  {
    semanticFieldGroupId: 'scalar_group.property.has_irrigation',
    domainId: 'domain.property_profile',
    classification: 'CANONICAL_WITH_GOVERNED_COALESCENCE',
    businessMeaningSummary: 'Property irrigation presence stored on both Property.hasIrrigation and PropertyExteriorProfile.hasIrrigation.',
    authoritativeStorage: { model: 'PropertyExteriorProfile', field: 'hasIrrigation' },
    storageMembers: [
      { model: 'PropertyExteriorProfile', field: 'hasIrrigation', prismaType: 'Boolean', role: 'AUTHORITATIVE', canonicalDataPointId: null },
      { model: 'Property', field: 'hasIrrigation', prismaType: 'Boolean', role: 'LEGACY_ALIAS', canonicalDataPointId: null },
    ],
    orderedCoalescenceRule: ['PropertyExteriorProfile.hasIrrigation', 'Property.hasIrrigation'],
    blankVersusNullPolicy: 'TRIM_EMPTY_STRING_AS_NULL',
    conflictBehavior: 'CONFLICTED_WITH_PROVENANCE',
    writeTarget: 'PropertyExteriorProfile.hasIrrigation',
    backfillDisposition: 'CONSOLIDATE_TO_AUTHORITATIVE_ON_WRITE',
    provenancePreference: 'Prefer PropertyExteriorProfile.hasIrrigation when populated; surface CONFLICTED if Property.hasIrrigation and PropertyExteriorProfile.hasIrrigation disagree.',
    ownerDecisionRef: null,
  },
  {
    semanticFieldGroupId: 'scalar_group.property.has_drainage_issues',
    domainId: 'domain.property_profile',
    classification: 'CANONICAL_WITH_GOVERNED_COALESCENCE',
    businessMeaningSummary: 'Property drainage-issue flag stored on both Property.hasDrainageIssues and PropertyExteriorProfile.hasDrainageIssues.',
    authoritativeStorage: { model: 'PropertyExteriorProfile', field: 'hasDrainageIssues' },
    storageMembers: [
      { model: 'PropertyExteriorProfile', field: 'hasDrainageIssues', prismaType: 'Boolean', role: 'AUTHORITATIVE', canonicalDataPointId: null },
      { model: 'Property', field: 'hasDrainageIssues', prismaType: 'Boolean', role: 'LEGACY_ALIAS', canonicalDataPointId: null },
    ],
    orderedCoalescenceRule: ['PropertyExteriorProfile.hasDrainageIssues', 'Property.hasDrainageIssues'],
    blankVersusNullPolicy: 'TRIM_EMPTY_STRING_AS_NULL',
    conflictBehavior: 'CONFLICTED_WITH_PROVENANCE',
    writeTarget: 'PropertyExteriorProfile.hasDrainageIssues',
    backfillDisposition: 'CONSOLIDATE_TO_AUTHORITATIVE_ON_WRITE',
    provenancePreference: 'Prefer PropertyExteriorProfile.hasDrainageIssues when populated; surface CONFLICTED if Property.hasDrainageIssues and PropertyExteriorProfile.hasDrainageIssues disagree.',
    ownerDecisionRef: null,
  },
  {
    semanticFieldGroupId: 'scalar_group.inventory_draft_item.brand_vs_manufacturer',
    domainId: 'domain.inventory',
    classification: 'INTENTIONALLY_DISTINCT_BUSINESS_MEANING',
    businessMeaningSummary: 'InventoryDraftItem.brand and InventoryDraftItem.manufacturer remain distinct business fields per FR-ONT-2.',
    authoritativeStorage: null,
    storageMembers: [
      { model: 'InventoryDraftItem', field: 'brand', prismaType: 'String', role: 'DISTINCT_PEER', canonicalDataPointId: null },
      { model: 'InventoryDraftItem', field: 'manufacturer', prismaType: 'String', role: 'DISTINCT_PEER', canonicalDataPointId: null },
    ],
    orderedCoalescenceRule: [],
    blankVersusNullPolicy: 'TRIM_EMPTY_STRING_AS_NULL',
    conflictBehavior: 'NEVER_COALESCE_SEPARATE_FIELDS',
    writeTarget: null,
    backfillDisposition: 'KEEP_SEPARATE_SCHEMA_COLUMNS',
    provenancePreference: 'Keep brand and manufacturer distinct on InventoryDraftItem.',
    ownerDecisionRef: null,
  },
  {
    semanticFieldGroupId: 'scalar_group.inventory_draft_item.model_vs_model_number',
    domainId: 'domain.inventory',
    classification: 'CANONICAL_WITH_GOVERNED_COALESCENCE',
    businessMeaningSummary: 'InventoryDraftItem.modelNumber and InventoryDraftItem.model represent the draft item model identifier.',
    authoritativeStorage: { model: 'InventoryDraftItem', field: 'modelNumber' },
    storageMembers: [
      { model: 'InventoryDraftItem', field: 'modelNumber', prismaType: 'String', role: 'AUTHORITATIVE', canonicalDataPointId: null },
      { model: 'InventoryDraftItem', field: 'model', prismaType: 'String', role: 'LEGACY_ALIAS', canonicalDataPointId: null },
    ],
    orderedCoalescenceRule: ['InventoryDraftItem.modelNumber', 'InventoryDraftItem.model'],
    blankVersusNullPolicy: 'TRIM_EMPTY_STRING_AS_NULL',
    conflictBehavior: 'CONFLICTED_WITH_PROVENANCE',
    writeTarget: 'InventoryDraftItem.modelNumber',
    backfillDisposition: 'CONSOLIDATE_TO_AUTHORITATIVE_ON_WRITE',
    provenancePreference: 'Prefer InventoryDraftItem.modelNumber; surface CONFLICTED if both populated and unequal.',
    ownerDecisionRef: null,
  },
  {
    semanticFieldGroupId: 'scalar_group.inventory_draft_item.serial_no_vs_serial_number',
    domainId: 'domain.inventory',
    classification: 'CANONICAL_WITH_GOVERNED_COALESCENCE',
    businessMeaningSummary: 'InventoryDraftItem.serialNumber and InventoryDraftItem.serialNo represent the draft item serial identifier.',
    authoritativeStorage: { model: 'InventoryDraftItem', field: 'serialNumber' },
    storageMembers: [
      { model: 'InventoryDraftItem', field: 'serialNumber', prismaType: 'String', role: 'AUTHORITATIVE', canonicalDataPointId: null },
      { model: 'InventoryDraftItem', field: 'serialNo', prismaType: 'String', role: 'LEGACY_ALIAS', canonicalDataPointId: null },
    ],
    orderedCoalescenceRule: ['InventoryDraftItem.serialNumber', 'InventoryDraftItem.serialNo'],
    blankVersusNullPolicy: 'TRIM_EMPTY_STRING_AS_NULL',
    conflictBehavior: 'CONFLICTED_WITH_PROVENANCE',
    writeTarget: 'InventoryDraftItem.serialNumber',
    backfillDisposition: 'CONSOLIDATE_TO_AUTHORITATIVE_ON_WRITE',
    provenancePreference: 'Prefer InventoryDraftItem.serialNumber; surface CONFLICTED if both populated and unequal.',
    ownerDecisionRef: null,
  },
  {
    semanticFieldGroupId: 'scalar_group.recall_product.brand_vs_manufacturer',
    domainId: 'domain.risks_recalls_inspections',
    classification: 'INTENTIONALLY_DISTINCT_BUSINESS_MEANING',
    businessMeaningSummary: 'RecallProduct.brand and RecallProduct.manufacturer remain distinct business fields per FR-ONT-2.',
    authoritativeStorage: null,
    storageMembers: [
      { model: 'RecallProduct', field: 'brand', prismaType: 'String', role: 'DISTINCT_PEER', canonicalDataPointId: null },
      { model: 'RecallProduct', field: 'manufacturer', prismaType: 'String', role: 'DISTINCT_PEER', canonicalDataPointId: null },
    ],
    orderedCoalescenceRule: [],
    blankVersusNullPolicy: 'TRIM_EMPTY_STRING_AS_NULL',
    conflictBehavior: 'NEVER_COALESCE_SEPARATE_FIELDS',
    writeTarget: null,
    backfillDisposition: 'KEEP_SEPARATE_SCHEMA_COLUMNS',
    provenancePreference: 'Keep brand and manufacturer distinct on RecallProduct.',
    ownerDecisionRef: null,
  },
] as const);

export type CandidateDuplicateDiscoveryRule =
  | 'NORMALIZED_OR_GEOCODED_SHADOW_COLUMN'
  | 'CENTS_VS_AMOUNT_MONETARY_PAIR'
  | 'INTRA_MODEL_SYNONYM_OR_STEM_OVERLAP'
  | 'PROPERTY_VS_EXTERIOR_PROFILE_OVERLAP'
  | 'CROSS_ENTITY_SYSTEM_INSTALL_YEAR_OVERLAP'
  | 'CROSS_LIFECYCLE_CLOSE_DATE_OVERLAP';

export interface CandidateDuplicateScalarPair {
  readonly left: string;
  readonly right: string;
  readonly rule: CandidateDuplicateDiscoveryRule;
}

const INTRA_MODEL_KNOWN_SYNONYM_STEMS: ReadonlyArray<readonly [string, string]> = Object.freeze([
  ['brand', 'manufacturer'],
  ['model', 'modelNumber'],
  ['serialNo', 'serialNumber'],
  ['category', 'assetType'],
  ['category', 'serviceCategory'],
  ['zip', 'zipCode'],
  ['postalCode', 'zipCode'],
  ['city', 'municipality'],
  ['state', 'stateCode'],
  ['amount', 'totalAmount'],
  ['cost', 'costCents'],
  ['price', 'priceCents'],
]);

/**
 * Mechanically derives candidate duplicate/shadow/overlapping scalar field pairs
 * across ALL Prisma DMMF models (not just catalogued entities) and DATA_POINT_DEFINITIONS
 * so that omitted duplicate/legacy scalar pairs anywhere in the schema fail Phase 0 validation.
 */
export function discoverCandidateDuplicateScalarFields(): readonly CandidateDuplicateScalarPair[] {
  const modelsByName = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
  const targetModelNames = Prisma.dmmf.datamodel.models.map((model) => model.name);

  const pairs: CandidateDuplicateScalarPair[] = [];
  const seenKey = new Set<string>();
  const addPair = (left: string, right: string, rule: CandidateDuplicateDiscoveryRule): void => {
    const sorted = [left, right].sort();
    const key = `${sorted[0]}<->${sorted[1]}`;
    if (seenKey.has(key)) return;
    seenKey.add(key);
    pairs.push({ left, right, rule });
  };

  for (const modelName of targetModelNames) {
    const model = modelsByName.get(modelName);
    if (!model) continue;
    const scalarFields = model.fields
      .filter((f) => f.kind === 'scalar' || f.kind === 'enum')
      .map((f) => f.name);
    const scalarSet = new Set(scalarFields);

    // Rule 1: *Norm, normalized*, geocoded* shadow columns on the same model
    for (const fieldName of scalarFields) {
      if (fieldName.endsWith('Norm')) {
        const base = fieldName.slice(0, -4);
        if (scalarSet.has(base)) {
          addPair(`${modelName}.${base}`, `${modelName}.${fieldName}`, 'NORMALIZED_OR_GEOCODED_SHADOW_COLUMN');
        }
      } else {
        const prefixMatch = fieldName.match(/^(?:normalized|geocoded)([A-Z]\w*)$/);
        if (prefixMatch) {
          const rawCandidate = prefixMatch[1].charAt(0).toLowerCase() + prefixMatch[1].slice(1);
          if (scalarSet.has(rawCandidate)) {
            addPair(
              `${modelName}.${rawCandidate}`,
              `${modelName}.${fieldName}`,
              'NORMALIZED_OR_GEOCODED_SHADOW_COLUMN',
            );
          }
        }
      }
    }

    // Rule 2: *Cents vs *Amount monetary representation pairs on the same model
    for (const fieldName of scalarFields) {
      if (fieldName.endsWith('Cents')) {
        const stem = fieldName.slice(0, -5);
        const amountField = `${stem}Amount`;
        if (scalarSet.has(amountField)) {
          addPair(`${modelName}.${amountField}`, `${modelName}.${fieldName}`, 'CENTS_VS_AMOUNT_MONETARY_PAIR');
        }
      }
    }

    // Rule 3: Intra-model synonym/stem overlaps (brand/manufacturer, model/modelNumber, serialNo/serialNumber, category/assetType/serviceCategory)
    for (const [leftField, rightField] of INTRA_MODEL_KNOWN_SYNONYM_STEMS) {
      if (scalarSet.has(leftField) && scalarSet.has(rightField)) {
        addPair(
          `${modelName}.${leftField}`,
          `${modelName}.${rightField}`,
          'INTRA_MODEL_SYNONYM_OR_STEM_OVERLAP',
        );
      }
    }
  }

  // Rule 4: Property vs PropertyExteriorProfile overlapping scalar fields
  const propertyModel = modelsByName.get('Property');
  const exteriorModel = modelsByName.get('PropertyExteriorProfile');
  if (propertyModel && exteriorModel) {
    const ignoredCommon = new Set(['id', 'propertyId', 'createdAt', 'updatedAt']);
    const propScalars = propertyModel.fields
      .filter((f) => (f.kind === 'scalar' || f.kind === 'enum') && !ignoredCommon.has(f.name))
      .map((f) => f.name);
    const extScalars = exteriorModel.fields
      .filter((f) => (f.kind === 'scalar' || f.kind === 'enum') && !ignoredCommon.has(f.name))
      .map((f) => f.name);
    for (const pField of propScalars) {
      for (const eField of extScalars) {
        if (pField === eField || (pField === 'lotSize' && eField === 'lotSizeSqFt')) {
          addPair(
            `Property.${pField}`,
            `PropertyExteriorProfile.${eField}`,
            'PROPERTY_VS_EXTERIOR_PROFILE_OVERLAP',
          );
        }
      }
    }
  }

  // Rule 5: Property *InstallYear / *ReplacementYear vs InventoryItem.installedOn
  if (propertyModel && modelsByName.get('InventoryItem')) {
    for (const f of propertyModel.fields) {
      if ((f.kind === 'scalar' || f.kind === 'enum') && /(?:InstallYear|ReplacementYear)$/.test(f.name)) {
        addPair(
          `Property.${f.name}`,
          'InventoryItem.installedOn',
          'CROSS_ENTITY_SYSTEM_INSTALL_YEAR_OVERLAP',
        );
      }
    }
  }

  // Rule 6: Cross-lifecycle targetCloseDate in DATA_POINT_DEFINITIONS
  const closeDateDefs = DATA_POINT_DEFINITIONS.filter((d) => d.field === 'targetCloseDate');
  for (let i = 0; i < closeDateDefs.length; i += 1) {
    for (let j = i + 1; j < closeDateDefs.length; j += 1) {
      if (closeDateDefs[i].entity !== closeDateDefs[j].entity) {
        addPair(
          `${closeDateDefs[i].entity}.${closeDateDefs[i].field}`,
          `${closeDateDefs[j].entity}.${closeDateDefs[j].field}`,
          'CROSS_LIFECYCLE_CLOSE_DATE_OVERLAP',
        );
      }
    }
  }

  return Object.freeze(pairs);
}

export interface CoalescedScalarValueResult {
  readonly semanticFieldGroupId: string;
  readonly state: 'POPULATED' | 'MISSING' | 'CONFLICTED' | 'SEPARATE_MEANINGS_NOT_COALESCED';
  readonly value: unknown;
  readonly authoritativeSource: string | null;
  readonly conflictingSources: ReadonlyArray<{ readonly source: string; readonly value: unknown }>;
}

function normalizeBlankToNull(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  return value;
}

/**
 * Deterministic runtime evaluator for FR-ONT-2 scalar field coalescence.
 * Never silently prefers whichever duplicate column a reader happened to query:
 * non-empty conflicting values return state = 'CONFLICTED' with full provenance.
 */
export function evaluateScalarFieldCoalescence(
  semanticFieldGroupId: string,
  valuesByModelField: Readonly<Record<string, unknown>>,
): CoalescedScalarValueResult {
  const entry = ASK_SCALAR_FIELD_COALESCENCE_MANIFEST.find((item) => item.semanticFieldGroupId === semanticFieldGroupId);
  if (!entry) {
    throw new Error(`Unknown semanticFieldGroupId: ${semanticFieldGroupId}`);
  }
  if (entry.classification !== 'CANONICAL_WITH_GOVERNED_COALESCENCE') {
    return {
      semanticFieldGroupId,
      state: 'SEPARATE_MEANINGS_NOT_COALESCED',
      value: null,
      authoritativeSource: null,
      conflictingSources: [],
    };
  }

  const populated = entry.orderedCoalescenceRule
    .map((source) => ({ source, value: normalizeBlankToNull(valuesByModelField[source]) }))
    .filter((item) => item.value !== null);

  if (populated.length === 0) {
    return {
      semanticFieldGroupId,
      state: 'MISSING',
      value: null,
      authoritativeSource: null,
      conflictingSources: [],
    };
  }

  if (populated.length === 1) {
    return {
      semanticFieldGroupId,
      state: 'POPULATED',
      value: populated[0].value,
      authoritativeSource: populated[0].source,
      conflictingSources: [],
    };
  }

  if (entry.conflictBehavior === 'UNIT_CONVERTED_EQUIVALENCE_OR_CONFLICT') {
    const dollars = Number(populated[0].value);
    const cents = Number(populated[1].value);
    if (Number.isFinite(dollars) && Number.isFinite(cents) && Math.round(dollars * 100) === Math.round(cents)) {
      return {
        semanticFieldGroupId,
        state: 'POPULATED',
        value: populated[0].value,
        authoritativeSource: populated[0].source,
        conflictingSources: [],
      };
    }
    return {
      semanticFieldGroupId,
      state: 'CONFLICTED',
      value: null,
      authoritativeSource: null,
      conflictingSources: populated,
    };
  }

  const firstNormalized = String(populated[0].value).trim().toLocaleLowerCase('en-US');
  const allAgree = populated.every((item) => String(item.value).trim().toLocaleLowerCase('en-US') === firstNormalized);
  if (allAgree) {
    return {
      semanticFieldGroupId,
      state: 'POPULATED',
      value: populated[0].value,
      authoritativeSource: populated[0].source,
      conflictingSources: [],
    };
  }

  return {
    semanticFieldGroupId,
    state: 'CONFLICTED',
    value: null,
    authoritativeSource: null,
    conflictingSources: populated,
  };
}

export interface ValidateScalarFieldCoalescenceOptions {
  readonly extraCandidatePairs?: readonly CandidateDuplicateScalarPair[];
}

/**
 * Validates that every storage member in ASK_SCALAR_FIELD_COALESCENCE_MANIFEST
 * exists on the current Prisma schema DMMF with the declared type AND that every
 * candidate duplicate/shadow/overlapping scalar pair discovered from Prisma DMMF
 * and DATA_POINT_DEFINITIONS is covered by a governed group in the manifest.
 */
export function validateScalarFieldCoalescenceManifest(
  options: ValidateScalarFieldCoalescenceOptions = {},
): string[] {
  const issues: string[] = [];
  const modelsByName = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
  const seenIds = new Set<string>();
  const groupMemberSets: Array<{ groupId: string; members: Set<string> }> = [];

  for (const entry of ASK_SCALAR_FIELD_COALESCENCE_MANIFEST) {
    if (seenIds.has(entry.semanticFieldGroupId)) {
      issues.push(`${entry.semanticFieldGroupId}: duplicate semanticFieldGroupId`);
    }
    seenIds.add(entry.semanticFieldGroupId);

    if (entry.storageMembers.length < 2) {
      issues.push(`${entry.semanticFieldGroupId}: must inventory at least two storage members`);
    }

    const memberSet = new Set<string>();
    for (const member of entry.storageMembers) {
      memberSet.add(`${member.model}.${member.field}`);
      const model = modelsByName.get(member.model);
      if (!model) {
        issues.push(`${entry.semanticFieldGroupId}: Prisma model ${member.model} does not exist`);
        continue;
      }
      const field = model.fields.find((candidate) => candidate.name === member.field);
      if (!field) {
        issues.push(`${entry.semanticFieldGroupId}: Prisma field ${member.model}.${member.field} does not exist`);
        continue;
      }
      if (field.type !== member.prismaType) {
        issues.push(`${entry.semanticFieldGroupId}: Prisma field ${member.model}.${member.field} has type ${field.type}, expected ${member.prismaType}`);
      }
    }
    groupMemberSets.push({ groupId: entry.semanticFieldGroupId, members: memberSet });

    if (entry.classification === 'CANONICAL_WITH_GOVERNED_COALESCENCE') {
      if (!entry.authoritativeStorage) {
        issues.push(`${entry.semanticFieldGroupId}: CANONICAL_WITH_GOVERNED_COALESCENCE requires authoritativeStorage`);
      }
      if (entry.orderedCoalescenceRule.length < 2) {
        issues.push(`${entry.semanticFieldGroupId}: CANONICAL_WITH_GOVERNED_COALESCENCE requires at least 2 orderedCoalescenceRule sources`);
      }
    }
  }

  const discoveredCandidates = [
    ...discoverCandidateDuplicateScalarFields(),
    ...(options.extraCandidatePairs ?? []),
  ];
  for (const candidate of discoveredCandidates) {
    const isCovered = groupMemberSets.some(
      (g) => g.members.has(candidate.left) && g.members.has(candidate.right),
    );
    if (!isCovered) {
      issues.push(
        `Unaccounted candidate duplicate scalar pair '${candidate.left}' <-> '${candidate.right}' (rule=${candidate.rule}) is missing from ASK_SCALAR_FIELD_COALESCENCE_MANIFEST.`,
      );
    }
  }

  return issues;
}
