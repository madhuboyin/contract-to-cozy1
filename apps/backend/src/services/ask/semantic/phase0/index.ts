/**
 * Phase 0 — Baseline and Invariants Aggregator (ASK_COZY_CROSS_DOMAIN_SEMANTIC_ARCHITECTURE_FRD.md §18).
 *
 * Exposes all 9 Phase 0 baseline inventories, manifests, reconciliation reports,
 * seeded scenario families, containment regression cases, and mechanical completeness validators.
 */
import { ASK_OPERATION_DEFINITIONS } from '../../askOperationRegistry';
import {
  ASK_OPERATION_DOMAIN_OWNERSHIP,
  ASK_SEMANTIC_DOMAINS,
  ASK_SEMANTIC_ONTOLOGY_BASELINE_VERSION,
  buildSchemaCatalogueReconciliationReport,
  buildSemanticCapabilityInventory,
  buildSemanticEntityRegistry,
  buildSemanticFieldRegistry,
  validateSemanticOntologyBaseline,
} from './semanticOntologyBaseline';
import {
  ASK_SCALAR_FIELD_COALESCENCE_MANIFEST,
  ASK_SCALAR_FIELD_COALESCENCE_MANIFEST_VERSION,
  discoverCandidateDuplicateScalarFields,
  evaluateScalarFieldCoalescence,
  validateScalarFieldCoalescenceManifest,
} from './scalarFieldCoalescenceManifest';
import {
  ASK_RECOGNIZER_RETIREMENT_MANIFEST,
  ASK_RECOGNIZER_RETIREMENT_MANIFEST_VERSION,
  discoverLiveAskRecognizerSources,
  validateRecognizerRetirementManifest,
} from './recognizerRetirementManifest';
import {
  ASK_RELATION_GOVERNANCE_BASELINE_VERSION,
  ASK_RELATIONSHIP_STORAGE_ACCESS_SITES,
  ASK_SEMANTIC_PREDICATE_MEANING_MANIFEST,
  ASK_TRAVERSABLE_RELATION_PATH_MANIFEST,
  auditDualParentSchemaModels,
  buildRelationshipDuplicateDefinitionReport,
  discoverAskRelationStorageAccessFiles,
  validateRelationGovernanceBaseline,
} from './relationGovernanceBaseline';
import {
  ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES,
  ASK_PHASE0_CONTAINMENT_REGRESSION_CASES,
  ASK_SEEDED_PROPERTY_ARCHETYPES,
  ASK_SEEDED_SCENARIO_CATALOGUE_VERSION,
  evaluateSeededArchetypeFixtures,
  executeSeededFamilyAgainstFixtures,
  validateSeededScenarioCatalogue,
} from './seededScenarioCatalogue';

export * from './semanticOntologyBaseline';
export * from './scalarFieldCoalescenceManifest';
export * from './recognizerRetirementManifest';
export * from './relationGovernanceBaseline';
export * from './seededScenarioCatalogue';

export interface AskSemanticPhase0CompletenessProof {
  readonly discoveredRecognizerFilesCount: number;
  readonly inventoriedRecognizerFilesCount: number;
  readonly unaccountedRecognizerFiles: readonly string[];
  readonly discoveredRelationAccessFilesCount: number;
  readonly inventoriedRelationAccessFilesCount: number;
  readonly unaccountedRelationAccessFiles: readonly string[];
  readonly discoveredDuplicateScalarCandidatesCount: number;
  readonly unaccountedDuplicateScalarCandidates: readonly string[];
  readonly totalOperationsCount: number;
  readonly unmappedOperations: readonly string[];
  readonly archetypeFixtureVerificationPassedCount: number;
  readonly familyFixtureExecutionPassedCount: number;
}

export interface AskSemanticPhase0BaselineSummary {
  readonly schemaVersion: '1.1.0';
  readonly versions: {
    readonly ontologyBaseline: string;
    readonly scalarFieldCoalescence: string;
    readonly recognizerRetirement: string;
    readonly relationGovernance: string;
    readonly seededScenarioCatalogue: string;
  };
  readonly counts: {
    readonly domains: number;
    readonly cataloguedEntities: number;
    readonly cataloguedFields: number;
    readonly capabilitiesAndOperations: number;
    readonly scalarFieldCoalescenceGroups: number;
    readonly recognizerInventoryEntries: number;
    readonly totalInventoriedRecognizerItems: number;
    readonly semanticPredicatesWithMeaningTags: number;
    readonly relationshipStorageAccessSites: number;
    readonly directStorageSitesOutsideCanonicalAdapter: number;
    readonly traversableRelationPaths: number;
    readonly dualParentSchemaModels: number;
    readonly seededPropertyArchetypes: number;
    readonly independentSemanticFamilies: number;
    readonly containmentRegressionCases: number;
  };
  readonly completenessProof: AskSemanticPhase0CompletenessProof;
  readonly schemaReconciliation: ReturnType<typeof buildSchemaCatalogueReconciliationReport>;
  readonly relationshipDuplicateReport: ReturnType<typeof buildRelationshipDuplicateDefinitionReport>;
  readonly validatorIssues: {
    readonly ontologyBaseline: string[];
    readonly scalarFieldCoalescence: string[];
    readonly recognizerRetirement: string[];
    readonly relationGovernance: string[];
    readonly seededScenarioCatalogue: string[];
  };
  readonly exitCriteria: {
    readonly inventoriesGenerated: boolean;
    readonly contradictionsAndUncoveredDataExplicit: boolean;
    readonly noNinetyPercentCompletionClaim: true;
  };
}

export function buildAskSemanticPhase0BaselineSummary(): AskSemanticPhase0BaselineSummary {
  const entities = buildSemanticEntityRegistry();
  const fields = buildSemanticFieldRegistry();
  const capabilities = buildSemanticCapabilityInventory();
  const schemaReconciliation = buildSchemaCatalogueReconciliationReport();
  const relationshipDuplicateReport = buildRelationshipDuplicateDefinitionReport();

  const discoveredRecognizers = discoverLiveAskRecognizerSources();
  const inventoriedRecognizerSet = new Set(
    ASK_RECOGNIZER_RETIREMENT_MANIFEST.flatMap((entry) => entry.coveredSourceFiles),
  );
  const unaccountedRecognizerFiles = discoveredRecognizers
    .map((item) => item.relativeFilePath)
    .filter((filePath) => !inventoriedRecognizerSet.has(filePath));

  const discoveredRelationFiles = discoverAskRelationStorageAccessFiles();
  const inventoriedRelationSet = new Set(
    ASK_RELATIONSHIP_STORAGE_ACCESS_SITES.map((site) => site.relativeFilePath),
  );
  const unaccountedRelationAccessFiles = discoveredRelationFiles
    .map((item) => item.relativeFilePath)
    .filter((filePath) => !inventoriedRelationSet.has(filePath));

  const discoveredScalarCandidates = discoverCandidateDuplicateScalarFields();
  const groupMemberSets = ASK_SCALAR_FIELD_COALESCENCE_MANIFEST.map(
    (entry) => new Set(entry.storageMembers.map((m) => `${m.model}.${m.field}`)),
  );
  const unaccountedDuplicateScalarCandidates = discoveredScalarCandidates
    .filter((pair) => !groupMemberSets.some((set) => set.has(pair.left) && set.has(pair.right)))
    .map((pair) => `${pair.left}<->${pair.right}`);

  const allOperationIds = Object.keys(ASK_OPERATION_DEFINITIONS);
  const unmappedOperations = allOperationIds.filter(
    (opId) => !(opId in ASK_OPERATION_DOMAIN_OWNERSHIP),
  );

  const archetypeFixtureVerificationPassedCount = ASK_SEEDED_PROPERTY_ARCHETYPES.filter(
    (a) => evaluateSeededArchetypeFixtures(a.archetypeId).passed,
  ).length;
  const familyFixtureExecutionPassedCount = ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES.filter(
    (f) => executeSeededFamilyAgainstFixtures(f.familyId).passed,
  ).length;

  const completenessProof: AskSemanticPhase0CompletenessProof = {
    discoveredRecognizerFilesCount: discoveredRecognizers.length,
    inventoriedRecognizerFilesCount: inventoriedRecognizerSet.size,
    unaccountedRecognizerFiles,
    discoveredRelationAccessFilesCount: discoveredRelationFiles.length,
    inventoriedRelationAccessFilesCount: inventoriedRelationSet.size,
    unaccountedRelationAccessFiles,
    discoveredDuplicateScalarCandidatesCount: discoveredScalarCandidates.length,
    unaccountedDuplicateScalarCandidates,
    totalOperationsCount: allOperationIds.length,
    unmappedOperations,
    archetypeFixtureVerificationPassedCount,
    familyFixtureExecutionPassedCount,
  };

  const validatorIssues = {
    ontologyBaseline: validateSemanticOntologyBaseline(),
    scalarFieldCoalescence: validateScalarFieldCoalescenceManifest(),
    recognizerRetirement: validateRecognizerRetirementManifest(),
    relationGovernance: validateRelationGovernanceBaseline(),
    seededScenarioCatalogue: validateSeededScenarioCatalogue(),
  };

  const totalValidatorIssues = Object.values(validatorIssues).reduce((sum, list) => sum + list.length, 0);

  const inventoriesComplete =
    totalValidatorIssues === 0 &&
    unaccountedRecognizerFiles.length === 0 &&
    unaccountedRelationAccessFiles.length === 0 &&
    unaccountedDuplicateScalarCandidates.length === 0 &&
    unmappedOperations.length === 0 &&
    archetypeFixtureVerificationPassedCount === ASK_SEEDED_PROPERTY_ARCHETYPES.length &&
    familyFixtureExecutionPassedCount === ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES.length;

  const contradictionsComplete =
    unaccountedRelationAccessFiles.length === 0 &&
    unaccountedDuplicateScalarCandidates.length === 0 &&
    relationshipDuplicateReport.directStorageOutsideCanonicalAdapterCount > 0 &&
    schemaReconciliation.propertyFactsUncoveredByDataPointCatalogue.length > 0 &&
    schemaReconciliation.propertyFactCatalogCount ===
      schemaReconciliation.propertyFactsMappedToDataPoints.length +
        schemaReconciliation.propertyFactsUncoveredByDataPointCatalogue.length;

  return {
    schemaVersion: '1.1.0',
    versions: {
      ontologyBaseline: ASK_SEMANTIC_ONTOLOGY_BASELINE_VERSION,
      scalarFieldCoalescence: ASK_SCALAR_FIELD_COALESCENCE_MANIFEST_VERSION,
      recognizerRetirement: ASK_RECOGNIZER_RETIREMENT_MANIFEST_VERSION,
      relationGovernance: ASK_RELATION_GOVERNANCE_BASELINE_VERSION,
      seededScenarioCatalogue: ASK_SEEDED_SCENARIO_CATALOGUE_VERSION,
    },
    counts: {
      domains: ASK_SEMANTIC_DOMAINS.length,
      cataloguedEntities: entities.length,
      cataloguedFields: fields.length,
      capabilitiesAndOperations: capabilities.length,
      scalarFieldCoalescenceGroups: ASK_SCALAR_FIELD_COALESCENCE_MANIFEST.length,
      recognizerInventoryEntries: ASK_RECOGNIZER_RETIREMENT_MANIFEST.length,
      totalInventoriedRecognizerItems: ASK_RECOGNIZER_RETIREMENT_MANIFEST.reduce((sum, entry) => sum + entry.liveItemCount, 0),
      semanticPredicatesWithMeaningTags: ASK_SEMANTIC_PREDICATE_MEANING_MANIFEST.length,
      relationshipStorageAccessSites: ASK_RELATIONSHIP_STORAGE_ACCESS_SITES.length,
      directStorageSitesOutsideCanonicalAdapter: relationshipDuplicateReport.directStorageOutsideCanonicalAdapterCount,
      traversableRelationPaths: ASK_TRAVERSABLE_RELATION_PATH_MANIFEST.length,
      dualParentSchemaModels: relationshipDuplicateReport.dualParentModels.length,
      seededPropertyArchetypes: ASK_SEEDED_PROPERTY_ARCHETYPES.length,
      independentSemanticFamilies: ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES.length,
      containmentRegressionCases: ASK_PHASE0_CONTAINMENT_REGRESSION_CASES.length,
    },
    completenessProof,
    schemaReconciliation,
    relationshipDuplicateReport,
    validatorIssues,
    exitCriteria: {
      inventoriesGenerated: inventoriesComplete,
      contradictionsAndUncoveredDataExplicit: contradictionsComplete,
      noNinetyPercentCompletionClaim: true,
    },
  };
}
