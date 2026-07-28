const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('renewal history exposes only observed terms with no unsupported savings or dead quote action', () => {
  const trend = source(
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/insurance-trend/InsuranceTrendClient.tsx',
  );

  for (const unsupportedClaim of [
    'Potential savings',
    '10–15%',
    'You may be paying',
    'Total paid',
    'Extra paid',
    'Your premium',
    'Compare Quotes',
    'href="#"',
  ]) {
    assert.equal(trend.includes(unsupportedClaim), false, unsupportedClaim);
  }

  assert.match(trend, /Observed confirmed annual premium/);
  assert.match(trend, /Modeled estimates are not included/);
  assert.match(trend, /does not predict future premiums/);
  assert.doesNotMatch(trend, /getInsuranceTrend|insuranceTrendApi/);
});

test('risk optimizer UI contains loss-prevention actions without fixed savings ranges', () => {
  const optimizer = source('../../../frontend/src/components/ai/RiskPremiumOptimizerPanel.tsx');

  assert.doesNotMatch(optimizer, /savingsLabel|Estimated savings range|Savings:/);
  assert.match(optimizer, /Risk reduction plan/);
  assert.match(optimizer, /premium eligibility or change must be confirmed by the carrier/);
});

test('coverage record UI does not present a missing heuristic gap as proof of coverage', () => {
  const workspace = source(
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/coverage-intelligence/CoverageIntelligenceToolClient.tsx',
  );
  const options = source(
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/coverage-options/CoverageOptionsClient.tsx',
  );
  const inventory = source(
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/coverage/CoverageClient.tsx',
  );

  assert.doesNotMatch(workspace, /CoverageIntelligencePanel|runCoverageAnalysis/);
  assert.match(options, /This does not confirm what an insurance policy covers/);
  assert.match(inventory, /This does not confirm what a policy covers/);
  assert.doesNotMatch(options, /proofType: 'coverage_gap_snapshot'/);
});

test('property coverage comparison keeps legacy verdict enums out of directive homeowner copy', () => {
  const intelligence = source(
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/coverage-intelligence/CoverageIntelligenceToolClient.tsx',
  );
  const service = source('../../src/services/coverageAnalysis.service.ts');

  for (const unsupportedClaim of [
    'Warranty is not worth it',
    'financially justified',
    'warranty saves',
    'Skip warranty',
    'Overall verdict',
    'Warranty verdict',
  ]) {
    assert.equal(intelligence.includes(unsupportedClaim), false, unsupportedClaim);
  }
  assert.doesNotMatch(service, /CoverageVerdict|overallVerdict|insuranceVerdict|warrantyVerdict/);
  assert.match(service, /scenarioState/);
});

test('secondary coverage surfaces use neutral record and scenario states', () => {
  const secondarySurfaces = [
    '../../../frontend/src/app/(dashboard)/dashboard/protect/RiskProtectionClient.tsx',
    '../../../frontend/src/components/guidance/CoverageCheckInline.tsx',
    '../../../frontend/src/lib/coverage/coverageInsights.ts',
  ].map(source).join('\n');

  for (const unsupportedClaim of [
    'Found savings',
    'Not worth it',
    'Coverage Fully Shielded',
    'matches local rebuild costs',
    'AI verdict',
    'Projected Savings',
    'Coverage is in good shape',
    'Coverage may be overpriced',
    'All systems protected',
  ]) {
    assert.equal(secondarySurfaces.includes(unsupportedClaim), false, unsupportedClaim);
  }
  assert.match(secondarySurfaces, /Policy record incomplete/);
  assert.match(secondarySurfaces, /without treating missing information as proof of protection/);
  assert.doesNotMatch(secondarySurfaces, /QUESTIONS_PRESENT/);
});

test('coverage guidance cannot complete from a generated review result', () => {
  const inline = source('../../../frontend/src/components/guidance/CoverageCheckInline.tsx');
  const controller = source('../../src/controllers/coverageAnalysis.controller.ts');
  const propertyRun = controller.slice(
    controller.indexOf('export async function runCoverageAnalysis'),
    controller.indexOf('export async function simulateCoverageAnalysis'),
  );
  const itemRun = controller.slice(
    controller.indexOf('export async function runItemCoverageAnalysis'),
    controller.indexOf('export async function simulateItemCoverageAnalysis'),
  );

  assert.doesNotMatch(inline, /completeGuidanceStep|handleMarkReviewed|coverageVerdict:/);
  assert.match(inline, /Open review and record decision/);
  assert.match(inline, /durable decision/);
  assert.doesNotMatch(propertyRun, /recordToolCompletion|status: 'COMPLETED'/);
  assert.doesNotMatch(itemRun, /recordToolCompletion|status: 'COMPLETED'/);
  assert.match(controller, /export async function recordCoverageComparisonDecision/);
  assert.match(controller, /completionKind: 'DECISION_RECORDED'/);
});

test('ungrounded coverage advisor and legacy output contract are removed', () => {
  const service = source('../../src/services/coverageAnalysis.service.ts');
  const schema = source('../../prisma/schema.prisma');
  const advisorPath = path.resolve(__dirname, '../../src/services/coverageAdvisor.service.ts');

  assert.equal(fs.existsSync(advisorPath), false);
  assert.doesNotMatch(service, /coverageAdvisorService|generateStrategicAdvice/);
  assert.doesNotMatch(
    service,
    /strategicAdvice|overallVerdict|insuranceVerdict|warrantyVerdict|insuranceResult|addOnRecommendations/,
  );
  assert.match(service, /scenarioState/);
  assert.match(service, /scenarioInputs/);
  assert.match(schema, /analysisKind\s+String\s+@default\("UNCLASSIFIED_LEGACY_ANALYSIS"\)/);
  assert.match(schema, /reviewState\s+String\s+@default\("POLICY_RECORD_INCOMPLETE"\)/);
  assert.match(schema, /scenarioState\s+String\s+@default\("INSUFFICIENT_DATA"\)/);
});

test('synthetic insurance history service and downstream consumers are removed', () => {
  const syntheticPath = path.resolve(__dirname, '../../src/services/insuranceCostTrend.service.ts');
  const consumers = [
    '../../src/services/costExplainer.service.ts',
    '../../src/services/trueCostOwnership.service.ts',
    '../../src/services/costVolatility.service.ts',
  ].map(source).join('\n');

  assert.equal(fs.existsSync(syntheticPath), false);
  assert.doesNotMatch(consumers, /InsuranceCostTrendService|insuranceCostTrend\.service/);
  assert.match(consumers, /getObservedInsurancePremiumHistory/);
});

test('downstream coverage contracts do not interpret scenario verdicts as coverage truth', () => {
  const derived = source('../../src/services/guidanceEngine/guidanceDerivedData.service.ts');
  const financial = source('../../src/services/guidanceEngine/guidanceFinancialContext.service.ts');
  const signal = source('../../src/services/signal.service.ts');
  const backfill = source('../../src/services/sharedDataBackfill.service.ts');
  const resolution = source('../../src/services/resolutionCenter.service.ts');

  assert.match(derived, /coverageReviewState/);
  assert.doesNotMatch(derived, /coverageOverallVerdict|insuranceVerdict|warrantyVerdict/);
  assert.doesNotMatch(financial, /coverageOverallVerdict|insuranceVerdict/);
  assert.doesNotMatch(signal, /gaps\.length > 0 \? 'SITUATIONAL' : 'NOT_WORTH_IT'/);
  assert.doesNotMatch(backfill, /gaps\.length > 0 \? 'SITUATIONAL' : 'NOT_WORTH_IT'/);
  assert.doesNotMatch(resolution, /savedAnalysis\.warrantyVerdict|savedAnalysis\.overallVerdict/);
});

test('item protection UI keeps internal verdicts out of homeowner-facing directive copy', () => {
  const itemCoverage = source(
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/items/[itemId]/coverage/ItemGetCoverageClient.tsx',
  );

  for (const unsupportedClaim of [
    'Coverage is worth getting',
    "Coverage isn't worth it",
    'Coverage pays off',
    'Annual savings',
    'Why we recommend this',
    'Self-insure:',
  ]) {
    assert.equal(itemCoverage.includes(unsupportedClaim), false, unsupportedClaim);
  }
  assert.match(itemCoverage, /scenario math, not guaranteed savings/);
  assert.match(itemCoverage, /does not tell you whether to buy or decline a contract/);
  assert.match(itemCoverage, /Inputs behind this comparison/);
});

test('quote lead capture is replaced by a governed, fail-closed handoff', () => {
  const route = source('../../src/routes/insuranceQuote.routes.ts');
  const service = source('../../src/services/insuranceHandoff.service.ts');
  const inventory = source(
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/coverage/CoverageClient.tsx',
  );

  assert.match(route, /insurance-handoff\/readiness/);
  assert.match(route, /dataSharing: z\.literal\(true\)/);
  assert.match(service, /INSURANCE_HANDOFF_UNAVAILABLE/);
  assert.match(service, /evaluateRecipientEligibility/);
  assert.match(service, /supportedJurisdictions/);
  assert.doesNotMatch(route, /insuranceQuoteRequest\.create/);
  assert.doesNotMatch(inventory, /InsuranceQuoteModal|setQuoteOpen|>Quotes</);
  const client = source('../../../frontend/src/lib/api/insuranceHandoffApi.ts');
  assert.doesNotMatch(client, /response\.data\.data/);
});

test('coverage capability family has one beta, catalog-only definition and does not claim jurisdiction verification', () => {
  const definitions = source('../../src/productFramework/capabilities/definitions/saveOptimize.ts');
  const promotion = source('../../src/services/homeActionSourcePromotion.service.ts');

  const definition = definitions
    .split('\n')
    .find((line) => line.includes("['coverage-intelligence'"));
  assert.ok(definition);
  assert.match(definition, /Coverage & Premium Review/);
  assert.match(definition, /'BETA', 'REGULATED_COVERAGE', 'CATALOG_ONLY'/);
  for (const retiredCapabilityId of [
    'coverage-options',
    'insurance-trend',
    'risk-premium-optimizer',
  ]) {
    assert.doesNotMatch(definitions, new RegExp(`\\['${retiredCapabilityId}'`));
  }

  const coveragePromotion = promotion.slice(
    promotion.indexOf('async function loadCoverageActions'),
    promotion.indexOf('async function loadPersonalizationActions'),
  );
  assert.match(coveragePromotion, /status: 'UNKNOWN'/);
  assert.doesNotMatch(coveragePromotion, /status: 'VERIFIED'/);
});
