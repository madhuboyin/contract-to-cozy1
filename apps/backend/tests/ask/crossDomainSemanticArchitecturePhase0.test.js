const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const {
  ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES,
  ASK_PHASE0_CONTAINMENT_REGRESSION_CASES,
  ASK_RECOGNIZER_RETIREMENT_MANIFEST,
  ASK_RELATIONSHIP_STORAGE_ACCESS_SITES,
  ASK_SCALAR_FIELD_COALESCENCE_MANIFEST,
  ASK_SEEDED_PROPERTY_ARCHETYPES,
  ASK_SEMANTIC_DOMAINS,
  ASK_SEMANTIC_PREDICATE_MEANING_MANIFEST,
  ASK_TRAVERSABLE_RELATION_PATH_MANIFEST,
  auditDualParentSchemaModels,
  buildAskSemanticPhase0BaselineSummary,
  buildRelationshipDuplicateDefinitionReport,
  buildSchemaCatalogueReconciliationReport,
  buildSemanticCapabilityInventory,
  buildSemanticEntityRegistry,
  buildSemanticFieldRegistry,
  evaluateScalarFieldCoalescence,
  validateRecognizerRetirementManifest,
  validateRelationGovernanceBaseline,
  validateScalarFieldCoalescenceManifest,
  validateSeededScenarioCatalogue,
  validateSemanticOntologyBaseline,
} = require('../../src/services/ask/semantic/phase0/index.ts');
const { parseDeterministicSemanticRequest } = require('../../src/services/ask/semantic/deterministicSemanticParser.ts');
const { classifyTransitionalWarrantyLinks } = require('../../src/services/ask/semantic/transitionalWarrantyRead.ts');
const { selectAndRenderAskRemoteFallbackClaims } = require('../../src/services/ask/askRemoteFallbackTypedClaims.ts');
const { DATA_POINT_CATALOGUE_VERSION, DATA_POINT_DEFINITIONS } = require('../../src/services/ask/dataPoint/dataPointCatalogue.ts');

test('Phase 0 Bullet 1 & 6: authoritative domain, entity, field, relation, capability, and schema reconciliation inventories validate without drift', () => {
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
  assert.ok(capabilities.length >= 124);
  assert.ok(reconciliation.totalPrismaModels >= 500);
  assert.ok(reconciliation.propertyFactsMappedToDataPoints.length > 0);
  assert.ok(reconciliation.propertyFactsUncoveredByDataPointCatalogue.length > 0);
});

test('Phase 0 Bullet 2: duplicate/legacy scalar field coalescence manifest validates against Prisma DMMF and enforces conflict semantics', () => {
  assert.deepEqual(validateScalarFieldCoalescenceManifest(), []);
  assert.ok(ASK_SCALAR_FIELD_COALESCENCE_MANIFEST.length >= 11);

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

  const roofYearVsItem = evaluateScalarFieldCoalescence('scalar_group.cross_entity.roof_install_year', {
    'Property.roofReplacementYear': 2021,
    'InventoryItem.installedOn': '2018-06-01T00:00:00.000Z',
  });
  assert.equal(roofYearVsItem.state, 'SEPARATE_MEANINGS_NOT_COALESCED');
});

test('Phase 0 Bullet 3: recognizer and vocabulary retirement manifest (FR-ONT-8) accounts for all pre-existing recognizers', () => {
  assert.deepEqual(validateRecognizerRetirementManifest(), []);
  assert.ok(ASK_RECOGNIZER_RETIREMENT_MANIFEST.length >= 11);

  const dispositions = new Set(ASK_RECOGNIZER_RETIREMENT_MANIFEST.map((entry) => entry.disposition));
  assert.ok(dispositions.has('RETAIN_SAFETY_BOUNDARY'));
  assert.ok(dispositions.has('MIGRATE_TO_TYPED_GRAMMAR'));
  assert.ok(dispositions.has('MIGRATE_TO_LEXICON'));
  assert.ok(dispositions.has('REPLACE_WITH_PROPERTY_RESOLUTION'));
  assert.ok(dispositions.has('RETIRE'));
});

test('Phase 0 Bullet 4 & 5: relationship meaning tags, duplicate-definition report, and traversable path bounds validate cleanly', () => {
  assert.deepEqual(validateRelationGovernanceBaseline(), []);

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

test('Phase 0 Bullet 8: seeded property archetypes and independent semantic families cover every §5 domain', () => {
  assert.deepEqual(validateSeededScenarioCatalogue(), []);
  assert.equal(ASK_SEEDED_PROPERTY_ARCHETYPES.length, 4);
  assert.ok(ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES.length >= 16);

  const nonBoundaryDomains = ASK_SEMANTIC_DOMAINS
    .filter((d) => d.domainId !== 'domain.safety_boundary')
    .map((d) => d.domainId);
  for (const domainId of nonBoundaryDomains) {
    assert.ok(
      ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES.some((f) => f.domainId === domainId),
      `Expected at least one independent semantic family for ${domainId}`,
    );
  }
});

test('Phase 0 Bullet 9 [CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF]: exact failure prompts and conflicting/fail-open paths are contained', async () => {
  assert.ok(ASK_PHASE0_CONTAINMENT_REGRESSION_CASES.every((c) => c.evidenceClassification === 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF'));

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

test('Phase 0 Exit Criteria: buildAskSemanticPhase0BaselineSummary reports all exit gates satisfied and makes no 90% completion claim', () => {
  const summary = buildAskSemanticPhase0BaselineSummary();
  assert.equal(summary.exitCriteria.inventoriesGenerated, true);
  assert.equal(summary.exitCriteria.contradictionsAndUncoveredDataExplicit, true);
  assert.equal(summary.exitCriteria.noNinetyPercentCompletionClaim, true);
});
