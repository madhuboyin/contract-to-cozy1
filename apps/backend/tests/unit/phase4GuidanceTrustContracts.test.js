const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  buildRecommendationResponseContract,
  resolveRecommendationResponseStatus,
} = require('../../src/productFramework/recommendationResponse.contract.ts');
const {
  DEFAULT_TEMPLATE,
  listGuidanceTemplates,
} = require('../../src/services/guidanceEngine/guidanceTemplateRegistry.ts');
const {
  listGuidanceSafetyClassifications,
} = require('../../src/services/guidanceEngine/guidanceGovernance.catalog.ts');
const {
  RecommendationGovernanceSchema,
} = require('../../src/productFramework/recommendationGovernance.contract.ts');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('every guidance template has an explicit schema-valid Phase 4 governance classification', () => {
  const templates = [...listGuidanceTemplates(), DEFAULT_TEMPLATE];
  const classifications = listGuidanceSafetyClassifications();
  assert.equal(templates.length, 26);
  assert.equal(Object.keys(classifications).length, templates.length);
  for (const template of templates) {
    const governance = RecommendationGovernanceSchema.parse(template.governance);
    assert.equal(governance.policyVersion, 'phase4-v1');
    assert.equal(governance.safetyTier, classifications[template.journeyTypeKey]);
  }
  assert.equal(classifications.recall_safety_resolution, 'SAFETY_EMERGENCY');
  assert.equal(classifications.coverage_gap_resolution, 'REGULATED_COVERAGE');
  assert.equal(classifications.asset_lifecycle_resolution, 'MATERIAL_FINANCIAL');
  assert.equal(classifications.cleaning_service_journey, 'LOW_CONSEQUENCE');
});

test('degraded recommendation responses always withhold material state changes', () => {
  for (const status of ['LOW_CONFIDENCE', 'DATA_UNAVAILABLE', 'UPSTREAM_FAILURE']) {
    const response = buildRecommendationResponseContract({
      status,
      safetyTier: 'MATERIAL_FINANCIAL',
      missingFacts: ['Current inspection evidence'],
    });
    assert.equal(response.materialActionAllowed, false);
    assert.ok(response.safeNextAction.length > 20);
  }
  assert.equal(resolveRecommendationResponseStatus({ confidence: null }), 'DATA_UNAVAILABLE');
  assert.equal(resolveRecommendationResponseStatus({ confidence: 0.4 }), 'LOW_CONFIDENCE');
  assert.equal(resolveRecommendationResponseStatus({ confidence: 0.9, upstreamFailed: true }), 'UPSTREAM_FAILURE');
  assert.equal(resolveRecommendationResponseStatus({ confidence: 0.9 }), 'AVAILABLE');
});

test('Prisma persists the reviewed governance snapshot on each guidance journey step', () => {
  const schema = read('../../prisma/schema.prisma');
  assert.match(schema, /model GuidanceJourneyStep[\s\S]*safetyTier\s+RecommendationSafetyTier/);
  assert.match(schema, /model GuidanceJourneyStep[\s\S]*governancePolicyVersion/);
  assert.match(schema, /model GuidanceJourneyStep[\s\S]*governanceJson\s+Json\?/);
  const resolver = read('../../src/services/guidanceEngine/guidanceStepResolver.service.ts');
  assert.match(resolver, /resolveGuidanceStepGovernance/);
  assert.match(resolver, /governanceJson: governance/);
  assert.match(resolver, /templateGovernance/);
});

test('guidance and personalization producers use the shared failure contract before material actions', () => {
  const mapper = read('../../src/services/guidanceEngine/guidanceMapper.ts');
  const promotion = read('../../src/services/homeActionSourcePromotion.service.ts');
  const placement = read('../../src/modules/personalization/adapters/recommendationPlacement.adapter.ts');
  const conversion = read('../../src/modules/personalization/application/convertRecommendationToMaintenanceTask.usecase.ts');
  const maintenance = read('../../../frontend/src/app/(dashboard)/dashboard/maintenance/PersonalizedMaintenanceSuggestions.tsx');
  assert.match(mapper, /recommendationResponse/);
  assert.match(promotion, /guidanceGovernance/);
  assert.doesNotMatch(promotion, /governance: lowConsequenceGovernance\(journey\.templateVersion/);
  assert.match(placement, /recommendationResponse\.materialActionAllowed/);
  assert.match(conversion, /RECOMMENDATION_NOT_ACTIONABLE/);
  assert.match(maintenance, /Recommendation withheld/);
});

test('Increment 2 does not introduce a Prisma migration script', () => {
  const migrationRoot = path.resolve(__dirname, '../../prisma/migrations');
  assert.deepEqual(
    fs.readdirSync(migrationRoot).filter((entry) => /phase.?4|guidance.?trust|recommendation.?response/i.test(entry)),
    [],
  );
});
