const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const {
  ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES,
  ASK_OPERATION_DOMAIN_OWNERSHIP,
  ASK_CONTAINMENT_REGRESSION_CASES,
  ASK_RECOGNIZER_RETIREMENT_MANIFEST,
  ASK_RELATIONSHIP_STORAGE_ACCESS_SITES,
  ASK_SCALAR_FIELD_COALESCENCE_MANIFEST,
  ASK_SEEDED_PROPERTY_ARCHETYPES,
  ASK_SEMANTIC_DOMAINS,
  ASK_SEMANTIC_PREDICATE_MEANING_MANIFEST,
  ASK_TRAVERSABLE_RELATION_PATH_MANIFEST,
  auditDualParentSchemaModels,
  buildAskSemanticGovernanceBaselineSummary,
  buildRelationshipDuplicateDefinitionReport,
  buildSchemaCatalogueReconciliationReport,
  buildSemanticCapabilityInventory,
  buildSemanticEntityRegistry,
  buildSemanticFieldRegistry,
  discoverCandidateDuplicateScalarFields,
  discoverLiveAskRecognizerSources,
  discoverRepositoryRelationStorageAccessFiles,
  evaluateScalarFieldCoalescence,
  evaluateSeededArchetypeFixtures,
  scanTypeScriptRecognizerSignals,
  validateRecognizerRetirementManifest,
  validateRelationGovernanceBaseline,
  validateScalarFieldCoalescenceManifest,
  validateSeededScenarioCatalogue,
  validateSemanticOntologyBaseline,
  verifySeededFamilyFixtureReadiness,
} = require('../../src/services/ask/semantic/governance/index.ts');
const { parseDeterministicSemanticRequest } = require('../../src/services/ask/semantic/deterministicSemanticParser.ts');
const { classifyTransitionalWarrantyLinks } = require('../../src/services/ask/semantic/transitionalWarrantyRead.ts');
const { selectAndRenderAskRemoteFallbackClaims } = require('../../src/services/ask/askRemoteFallbackTypedClaims.ts');
const { DATA_POINT_CATALOGUE_VERSION, DATA_POINT_DEFINITIONS } = require('../../src/services/ask/dataPoint/dataPointCatalogue.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');

test('Phase 0 Bullet 1, 4 & 6: authoritative domain, entity, field, operation domain ownership, and schema reconciliation inventories validate without drift', () => {
  assert.deepEqual(validateSemanticOntologyBaseline(), []);

  const entities = buildSemanticEntityRegistry();
  const fields = buildSemanticFieldRegistry();
  const capabilities = buildSemanticCapabilityInventory();
  const reconciliation = buildSchemaCatalogueReconciliationReport();

  assert.equal(ASK_SEMANTIC_DOMAINS.length, 15, '14 §5 homeowner domains + 1 safety boundary domain');
  assert.equal(entities.length, 20, 'all 20 catalogued DataPointEntity models have FR-ONT-1 metadata');
  assert.equal(fields.length, DATA_POINT_DEFINITIONS.length);
  assert.equal(DATA_POINT_CATALOGUE_VERSION, 12);
  assert.equal(DATA_POINT_DEFINITIONS.length, 107);
  assert.equal(capabilities.length, Object.keys(ASK_OPERATION_DEFINITIONS).length);
  assert.equal(Object.keys(ASK_OPERATION_DOMAIN_OWNERSHIP).length, Object.keys(ASK_OPERATION_DEFINITIONS).length);
  assert.ok(reconciliation.totalPrismaModels >= 500);
  assert.ok(reconciliation.propertyFactsMappedToDataPoints.length > 0);
  assert.ok(reconciliation.propertyFactsUncoveredByDataPointCatalogue.length > 0);

  // Negative check (Finding #4): an unmapped operation must fail validation instead of falling back to domain.property_profile
  const unmappedIssues = validateSemanticOntologyBaseline({
    unmappedOperationIds: ['UNMAPPED_SYNTHETIC_OPERATION'],
  });
  assert.equal(unmappedIssues.length, 1);
  assert.match(unmappedIssues[0], /UNMAPPED_SYNTHETIC_OPERATION/);
});

test('Phase 0 Bullet 2: duplicate/legacy scalar field coalescence manifest mechanically discovers DMMF candidates and enforces conflict semantics', () => {
  assert.deepEqual(validateScalarFieldCoalescenceManifest(), []);
  assert.equal(ASK_SCALAR_FIELD_COALESCENCE_MANIFEST.length, 17);

  const candidates = discoverCandidateDuplicateScalarFields();
  assert.ok(candidates.length >= 18, 'discovers shadow columns, cents/amount pairs, synonym stems, and cross-entity overlaps');

  // Negative check (Finding #3): an unaccounted candidate duplicate scalar pair must fail validation
  const missingPairIssues = validateScalarFieldCoalescenceManifest({
    extraCandidatePairs: [
      {
        left: 'InventoryItem.syntheticLegacyCode',
        right: 'InventoryItem.syntheticCanonicalCode',
        rule: 'INTRA_MODEL_SYNONYM_OR_STEM_OVERLAP',
      },
    ],
  });
  assert.equal(missingPairIssues.length, 1);
  assert.match(missingPairIssues[0], /InventoryItem\.syntheticLegacyCode/);

  // Coalesces when only legacy column is populated
  const legacyOnly = evaluateScalarFieldCoalescence('scalar_group.inventory_item.model_identity', {
    'InventoryItem.modelNumber': '   ',
    'InventoryItem.model': 'RF28R7351SR',
  });
  assert.equal(legacyOnly.state, 'POPULATED');
  assert.equal(legacyOnly.value, 'RF28R7351SR');
  assert.equal(legacyOnly.authoritativeSource, 'InventoryItem.model');

  // Emits CONFLICTED when both authoritative and legacy columns are non-empty and disagree
  const conflictedModel = evaluateScalarFieldCoalescence('scalar_group.inventory_item.model_identity', {
    'InventoryItem.modelNumber': 'RF28R7351SR',
    'InventoryItem.model': 'DW80R9950US',
  });
  assert.equal(conflictedModel.state, 'CONFLICTED');
  assert.equal(conflictedModel.value, null);
  assert.equal(conflictedModel.conflictingSources.length, 2);

  // Unit-converted equivalence for InsurancePolicy deductible (Decimal dollars vs Int cents)
  const matchingDeductible = evaluateScalarFieldCoalescence('scalar_group.insurance_policy.deductible', {
    'InsurancePolicy.deductibleAmount': '1500.00',
    'InsurancePolicy.deductibleCents': 150000,
  });
  assert.equal(matchingDeductible.state, 'POPULATED');
  assert.equal(matchingDeductible.value, '1500.00');

  const conflictingDeductible = evaluateScalarFieldCoalescence('scalar_group.insurance_policy.deductible', {
    'InsurancePolicy.deductibleAmount': '1500.00',
    'InsurancePolicy.deductibleCents': 250000,
  });
  assert.equal(conflictingDeductible.state, 'CONFLICTED');

  // Intentionally distinct fields (such as brand vs manufacturer, or property roof vs inventory item roof) never coalesce
  const brandVsManufacturer = evaluateScalarFieldCoalescence('scalar_group.inventory_item.brand_vs_manufacturer', {
    'InventoryItem.brand': 'Kenmore',
    'InventoryItem.manufacturer': 'Whirlpool',
  });
  assert.equal(brandVsManufacturer.state, 'SEPARATE_MEANINGS_NOT_COALESCED');

  const defaultDistinctGroups = ASK_SCALAR_FIELD_COALESCENCE_MANIFEST.filter(
    (entry) => entry.classification === 'DISTINCT_UNLESS_EQUIVALENCE_APPROVED',
  );
  assert.deepEqual(defaultDistinctGroups.map((entry) => entry.semanticFieldGroupId), [
    'scalar_group.inventory_item.brand_vs_manufacturer',
    'scalar_group.inventory_item.category_vs_asset_type',
    'scalar_group.cross_entity.lot_size',
    'scalar_group.maintenance_task.category_classification',
  ]);
  for (const entry of defaultDistinctGroups) {
    assert.deepEqual(entry.orderedCoalescenceRule, []);
    assert.equal(entry.conflictBehavior, 'NEVER_COALESCE_SEPARATE_FIELDS');
    assert.equal(entry.writeTarget, null);
    assert.equal(entry.backfillDisposition, 'KEEP_SEPARATE_SCHEMA_COLUMNS');
    assert.equal(evaluateScalarFieldCoalescence(entry.semanticFieldGroupId, {}).state, 'SEPARATE_MEANINGS_NOT_COALESCED');
  }

  const roofYearVsItem = evaluateScalarFieldCoalescence('scalar_group.cross_entity.roof_install_year', {
    'Property.roofReplacementYear': 2021,
    'InventoryItem.installedOn': '2018-06-01T00:00:00.000Z',
  });
  assert.equal(roofYearVsItem.state, 'SEPARATE_MEANINGS_NOT_COALESCED');
});

test('Phase 0 Bullet 3: recognizer and vocabulary retirement manifest (FR-ONT-8) mechanically scans all Ask recognizer files', () => {
  assert.deepEqual(validateRecognizerRetirementManifest(), []);
  assert.equal(ASK_RECOGNIZER_RETIREMENT_MANIFEST.length, 14);

  const discovered = discoverLiveAskRecognizerSources();
  assert.ok(discovered.length >= 230, 'mechanically discovers all regex and vocabulary-bearing Ask files');

  const dispositions = new Set(ASK_RECOGNIZER_RETIREMENT_MANIFEST.map((entry) => entry.disposition));
  assert.ok(dispositions.has('RETIRE_PHASE_2A'));
  assert.ok(dispositions.has('RETIRE_PHASE_2B'));
  assert.ok(dispositions.has('RETAIN_BOUNDARY_GUARDRAIL'));

  // Negative check (Finding #1): a newly added uninventoried recognizer file must fail validation
  const uninventoriedIssues = validateRecognizerRetirementManifest({
    extraDiscoveredFiles: ['src/services/ask/handlers/uninventoriedNewRegex.handler.ts'],
  });
  assert.equal(uninventoriedIssues.length, 1);
  assert.match(uninventoriedIssues[0], /uninventoriedNewRegex\.handler\.ts/);

  // AST scanner check: lowercase vocabulary arrays, switch dispatchers, and string predicates are detected
  const astSignals = scanTypeScriptRecognizerSignals(`
    const lowercaseCues = ['warranty', 'coverage'];
    export function matchIntent(input: string) {
      if (input.includes('policy')) return 'insurance';
      switch (input) { case 'claim': return 'claim'; default: return null; }
    }
  `);
  assert.ok(astSignals.totalSignals >= 3, 'AST scanner detects lowercase arrays, .includes predicates, and string switches');
});

test('Phase 0 Bullet 4 & 5: relationship meaning tags, repository-scanned access sites, and traversable path bounds validate cleanly', () => {
  assert.deepEqual(validateRelationGovernanceBaseline(), []);

  const discoveredRelationFiles = discoverRepositoryRelationStorageAccessFiles();
  assert.ok(discoveredRelationFiles.length >= 80, 'scans all of src/ including out-of-tree services');
  assert.ok(
    discoveredRelationFiles.some((f) => !f.relativeFilePath.startsWith('src/services/ask/')),
    'discovers relation consumers outside src/services/ask/',
  );
  assert.ok(
    discoveredRelationFiles.some((f) => f.relativeFilePath.startsWith('src/services/ask/semantic/containment/')),
    'scans runtime semantic/ directories instead of skipping all semantic directories',
  );

  // Negative check (Finding #2): an unlisted out-of-tree relation storage access file must fail validation
  const unlistedSiteIssues = validateRelationGovernanceBaseline({
    extraDiscoveredRelationFiles: ['src/services/coverage/unlistedWarrantyConsumer.service.ts'],
  });
  assert.equal(unlistedSiteIssues.length, 1);
  assert.match(unlistedSiteIssues[0], /unlistedWarrantyConsumer\.service\.ts/);

  // Negative check: an already-registered file accessing a second uninventoried relationship must fail validation
  const unlistedPairIssues = validateRelationGovernanceBaseline({
    extraDiscoveredRelationAccessPairs: [
      {
        relativeFilePath: 'src/services/ask/handlers/warranties.handler.ts',
        semanticRelationId: 'relation.sale_case.readiness_item',
      },
    ],
  });
  assert.equal(unlistedPairIssues.length, 1);
  assert.match(unlistedPairIssues[0], /relation\.sale_case\.readiness_item/);

  const report = buildRelationshipDuplicateDefinitionReport();
  assert.equal(report.declaredPredicateCount, ASK_SEMANTIC_PREDICATE_MEANING_MANIFEST.length);
  assert.equal(report.storageAccessSiteCount, ASK_RELATIONSHIP_STORAGE_ACCESS_SITES.length);
  assert.ok(report.directStorageOutsideCanonicalAdapterCount > 0, 'explicitly flags legacy direct storage accesses outside canonical adapters');

  const dualParents = auditDualParentSchemaModels();
  assert.ok(dualParents.some((row) => row.model === 'Warranty'));
  assert.ok(dualParents.some((row) => row.model === 'InsurancePolicy'));
  assert.ok(dualParents.every((row) => row.requiredPolicy === 'INTERSECT_ALL_APPLICABLE_PARENTS'));

  const claimDocPath = ASK_TRAVERSABLE_RELATION_PATH_MANIFEST.find((p) => p.pathId === 'path.claim.claim_document');
  assert.ok(claimDocPath);
  assert.equal(claimDocPath.authorizationMode, 'INTERSECT_ALL_PARENTS');
  assert.ok(claimDocPath.auditFlags.includes('DUAL_PARENT_INTERSECTION_ENFORCED'));
});

test('Phase 0 Bullet 8: seeded property archetypes instantiate executable fixture records and verify all 16 cross-domain families', () => {
  assert.deepEqual(validateSeededScenarioCatalogue(), []);
  assert.equal(ASK_SEEDED_PROPERTY_ARCHETYPES.length, 4);
  assert.equal(ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES.length, 16);

  // Finding #6: execute concrete fixture evaluation on all 4 property archetypes
  const completeEval = evaluateSeededArchetypeFixtures('property.seeded.complete_single_family');
  assert.equal(completeEval.passed, true);
  assert.ok(completeEval.observedStates.includes('POPULATED'));
  assert.ok(completeEval.warrantyReadStates.includes('BOTH_CONSISTENT'));
  assert.ok(completeEval.warrantyReadStates.includes('EXPLICIT_NO_COVERAGE'));

  const missingUnknownEval = evaluateSeededArchetypeFixtures('property.seeded.missing_and_unknown_states');
  assert.equal(missingUnknownEval.passed, true);
  assert.ok(missingUnknownEval.observedStates.includes('EMPTY_OR_MISSING'));
  assert.ok(missingUnknownEval.observedStates.includes('UNKNOWN'));
  assert.ok(missingUnknownEval.warrantyReadStates.includes('UNKNOWN'));

  const conflictedEval = evaluateSeededArchetypeFixtures('property.seeded.conflicted_and_dual_parent_auth');
  assert.equal(conflictedEval.passed, true);
  assert.ok(conflictedEval.observedStates.includes('CONFLICTED'));
  assert.ok(conflictedEval.warrantyReadStates.includes('CONFLICTED_LINKS'));
  assert.equal(conflictedEval.scalarCoalescenceStates['ins-conflict-1:deductible'], 'CONFLICTED');
  assert.equal(conflictedEval.scalarCoalescenceStates['item-fridge-conflict-1:model_identity'], 'CONFLICTED');
  assert.deepEqual(conflictedEval.dualParentRestrictedClaimDocIdsForViewer, ['cdoc-restricted-1']);

  const lifecycleEval = evaluateSeededArchetypeFixtures('property.seeded.buyer_and_seller_lifecycle');
  assert.equal(lifecycleEval.passed, true);
  assert.ok(lifecycleEval.observedStates.includes('POPULATED'));

  // Verify Phase 0 fixture-readiness & data-state coverage across all 16 cross-domain families
  for (const family of ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES) {
    const readinessResult = verifySeededFamilyFixtureReadiness(family.familyId);
    assert.equal(readinessResult.passed, true, `Expected family ${family.familyId} to pass fixture readiness: ${readinessResult.issues.join('; ')}`);
  }
});

test('Phase 0 Bullet 9 [CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF]: exact failure prompts and conflicting/fail-open paths are contained', async () => {
  assert.ok(ASK_CONTAINMENT_REGRESSION_CASES.every((c) => c.evidenceClassification === 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF'));

  // 1. Warranty paraphrases including possessive determiners ("which of my appliances do not have a warranty")
  const prompts = [
    ["list down all items which don't have warranty", 'LIST', 'NEGATIVE'],
    ['provide details of all items without warranty', 'DETAIL', 'NEGATIVE'],
    ['how many appliances are not having warranty', 'COUNT', 'NEGATIVE'],
    ['which items are having warranty', 'LIST', 'POSITIVE'],
    ['which of my appliances do not have a warranty', 'LIST', 'NEGATIVE'],
  ];
  for (const [prompt, expectedProjection, expectedPolarity] of prompts) {
    const plan = parseDeterministicSemanticRequest(prompt);
    assert.equal(plan.outcome, 'MATCH', `expected MATCH for: ${prompt}`);
    assert.equal(plan.facets[0].projection, expectedProjection, `projection for: ${prompt}`);
    assert.equal(plan.facets[0].polarity, expectedPolarity, `polarity for: ${prompt}`);
    assert.deepEqual(plan.unresolvedSpans, [], `no unresolved spans for: ${prompt}`);
    assert.equal(plan.facets[0].confidenceSignals.grammarComplete, true, `grammarComplete for: ${prompt}`);
  }

  // 2. Conflicting legacy links are excluded from both confirmed-covered and confirmed-uncovered populations
  const covered = classifyTransitionalWarrantyLinks({
    inventoryItemId: 'item-covered',
    label: 'Dishwasher',
    propertyPlanWarrantyId: 'w-1',
    itemWarrantyIds: ['w-1'],
    coverageEvidenceStatus: 'VERIFIED',
  });
  const uncovered = classifyTransitionalWarrantyLinks({
    inventoryItemId: 'item-uncovered',
    label: 'Microwave',
    propertyPlanWarrantyId: null,
    itemWarrantyIds: [],
    coverageEvidenceStatus: 'VERIFIED',
  });
  const conflicted = classifyTransitionalWarrantyLinks({
    inventoryItemId: 'item-conflicted',
    label: 'Furnace',
    propertyPlanWarrantyId: 'w-a',
    itemWarrantyIds: ['w-b'],
    coverageEvidenceStatus: 'VERIFIED',
  });
  const unknown = classifyTransitionalWarrantyLinks({
    inventoryItemId: 'item-unknown',
    label: 'Water Heater',
    propertyPlanWarrantyId: null,
    itemWarrantyIds: [],
    coverageEvidenceStatus: 'NOT_SURE',
  });
  assert.equal(covered.state, 'BOTH_CONSISTENT');
  assert.equal(uncovered.state, 'NO_LINK_RECORDED');
  assert.equal(conflicted.state, 'CONFLICTED_LINKS');
  assert.equal(conflicted.reconciliationRequired, true);
  assert.equal(unknown.state, 'UNKNOWN');

  // 3. Remote fallback fails closed to [] when provider throws instead of returning top-6 arbitrary facts
  const fallbackOnFailure = await selectAndRenderAskRemoteFallbackClaims({
    question: 'Provide details of all items without warranty',
    facts: [
      { key: 'structure.roofType', value: 'ASPHALT_SHINGLE', source: 'USER_REPORTED', observedAt: null, confidence: 0.9 },
      { key: 'quote.repairCost', value: 2000, source: 'DOCUMENT', observedAt: null, confidence: 0.9 },
      { key: 'quote.replacementCost', value: 8000, source: 'DOCUMENT', observedAt: null, confidence: 0.9 },
    ],
    provider: {
      select: async () => {
        throw new Error('Simulated provider timeout / failure');
      },
    },
  });
  assert.deepEqual(fallbackOnFailure, [], 'provider error must fail closed with empty claim selection');

  // 4. Multi-entity cross-domain prompt is not coerced into single-entity warranty route
  const crossDomain = parseDeterministicSemanticRequest('what claims are still open and what documents are missing?');
  assert.equal(crossDomain.outcome, 'NONE_FITS');
  assert.deepEqual(crossDomain.facets, []);
});

test('Phase 0 Exit Criteria (Finding #5): buildAskSemanticGovernanceBaselineSummary mechanically proves completeness across all inventories and fixtures', () => {
  const summary = buildAskSemanticGovernanceBaselineSummary();
  assert.deepEqual(summary.completenessProof.unaccountedRecognizerFiles, []);
  assert.deepEqual(summary.completenessProof.unaccountedRelationAccessFiles, []);
  assert.deepEqual(summary.completenessProof.unaccountedRelationAccessPairs, []);
  assert.deepEqual(summary.completenessProof.unaccountedDuplicateScalarCandidates, []);
  assert.deepEqual(summary.completenessProof.unmappedOperations, []);
  assert.equal(
    summary.completenessProof.archetypeFixtureVerificationPassedCount,
    ASK_SEEDED_PROPERTY_ARCHETYPES.length,
  );
  assert.equal(
    summary.completenessProof.familyFixtureReadinessPassedCount,
    ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES.length,
  );
  assert.equal(summary.exitCriteria.inventoriesGenerated, true);
  assert.equal(summary.exitCriteria.contradictionsAndUncoveredDataExplicit, true);
  assert.equal(summary.exitCriteria.noNinetyPercentCompletionClaim, true);
});

test('a retired recognizer family stays retired: its tokens never reappear in source and its evidence is recorded (FR-ONT-8)', () => {
  const {
    ASK_RETIRED_RECOGNIZER_FAMILIES,
    validateRetiredRecognizerFamilies,
  } = require('../../src/services/ask/semantic/governance/recognizerRetirementManifest.ts');
  assert.ok(ASK_RETIRED_RECOGNIZER_FAMILIES.length >= 1);
  for (const family of ASK_RETIRED_RECOGNIZER_FAMILIES) {
    assert.ok(family.successor && family.parityEvidence && family.formerSources.length > 0 && family.forbiddenTokens.length > 0, family.familyId);
  }
  assert.deepEqual(validateRetiredRecognizerFamilies(), []);
  // The guard actually bites: pointed at a tree that still contains a forbidden token it reports it.
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-guard-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'reintroduced.ts'), "export const x = 'NO_WARRANTY';\n");
  const issues = validateRetiredRecognizerFamilies({ backendRoot: root });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /reintroduced\.ts/);
});
