const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { PERSONALIZATION_DEFINITIONS } = require('../../src/modules/personalization/catalog/personalizationDefinitions.ts');
const { RecommendationGovernanceSchema } = require('../../src/productFramework/recommendationGovernance.contract.ts');
const { requiredRecommendationReviewRoles } = require('../../src/productFramework/recommendationLaunchGate.ts');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('every active catalog definition declares a valid Phase 4 safety tier and governance policy', () => {
  assert.equal(PERSONALIZATION_DEFINITIONS.length, 5);
  for (const definition of PERSONALIZATION_DEFINITIONS) {
    const parsed = RecommendationGovernanceSchema.parse(definition.governance);
    assert.equal(parsed.safetyTier, definition.safetyTier);
    assert.equal(parsed.policyVersion, 'phase4-v1');
  }
  const byCode = new Map(PERSONALIZATION_DEFINITIONS.map((definition) => [definition.code, definition]));
  assert.equal(byCode.get('hvac_filter_replacement_check_proof').safetyTier, 'LOW_CONSEQUENCE');
  assert.equal(byCode.get('aging_roof_condition_review').safetyTier, 'MATERIAL_FINANCIAL');
  assert.equal(byCode.get('smoke_co_detector_battery_check').safetyTier, 'SAFETY_EMERGENCY');
});

test('safety definitions require product, domain, trust, and legal review roles', () => {
  const safety = PERSONALIZATION_DEFINITIONS.find((definition) => definition.safetyTier === 'SAFETY_EMERGENCY');
  assert.deepEqual(requiredRecommendationReviewRoles(safety.governance), [
    'PRODUCT', 'DOMAIN', 'TRUST', 'LEGAL_COMPLIANCE',
  ]);
  assert.match(safety.governance.conservativeFallback, /Do not perform work/);
  assert.match(safety.governance.emergencyEscalation, /contact emergency services/);
});

test('Prisma persists typed trust tiers and role decisions without a Phase 4 migration script', () => {
  const schema = read('../../prisma/schema.prisma');
  assert.match(schema, /enum RecommendationSafetyTier/);
  assert.match(schema, /safetyTier\s+RecommendationSafetyTier/);
  assert.match(schema, /model RecommendationGovernanceReview/);
  assert.match(schema, /@@unique\(\[definitionId, role, policyVersion\]\)/);
  const migrationRoot = path.resolve(__dirname, '../../prisma/migrations');
  assert.deepEqual(fs.readdirSync(migrationRoot).filter((entry) => /phase.?4|trust.?governance/i.test(entry)), []);
});

test('admin trust queue blocks activation and exposes auditable role decisions', () => {
  const service = read('../../src/services/personalizationCatalogAdmin.service.ts');
  const controller = read('../../src/controllers/adminPersonalization.controller.ts');
  const routes = read('../../src/routes/adminPersonalization.routes.ts');
  const adminPage = read('../../../frontend/src/app/(dashboard)/dashboard/admin/personalization/page.tsx');
  for (const contract of [
    'GOVERNANCE_NOT_READY',
    'evaluateRecommendationLaunchReadiness',
    'recordRecommendationGovernanceReview',
  ]) assert.match(service, new RegExp(contract));
  assert.match(controller, /Tier-specific governance review is incomplete/);
  assert.match(routes, /governance-reviews/);
  assert.match(adminPage, /Trust review/);
  assert.match(adminPage, /REVIEW REQUIRED/);
  assert.match(adminPage, /Reject/);
});

test('generated personalization responses carry trust boundaries to homeowner surfaces', () => {
  const repository = read('../../src/modules/personalization/infrastructure/personalizationRepository.ts');
  const adapter = read('../../src/modules/personalization/adapters/recommendationPlacement.adapter.ts');
  const maintenance = read('../../../frontend/src/app/(dashboard)/dashboard/maintenance/PersonalizedMaintenanceSuggestions.tsx');
  const readOnly = read('../../../frontend/src/components/personalization/PersonalizedReadOnlySuggestions.tsx');
  assert.match(repository, /safetyTier: true/);
  assert.match(repository, /governancePolicyVersion: true/);
  assert.match(adapter, /professionalBoundary/);
  assert.match(adapter, /emergencyEscalation/);
  assert.match(maintenance, /professionalBoundary/);
  assert.match(readOnly, /safetyTier/);
});

test('canonical personalization bootstrap synchronizes Phase 4 trust metadata but never activates content', () => {
  const sql = read('../../prisma/seedPersonalization.sql');
  assert.match(sql, /"safetyTier"/);
  assert.match(sql, /"governancePolicyVersion"/);
  assert.match(sql, /SAFETY_EMERGENCY/);
  assert.match(sql, /MATERIAL_FINANCIAL/);
  assert.match(sql, /'DRAFT'/);
  assert.doesNotMatch(sql, /SET\s+status\s*=\s*'ACTIVE'/i);
});
