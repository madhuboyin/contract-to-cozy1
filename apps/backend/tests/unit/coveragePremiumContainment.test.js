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
  const intelligence = source('../../../frontend/src/components/ai/CoverageIntelligencePanel.tsx');
  const options = source(
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/coverage-options/CoverageOptionsClient.tsx',
  );
  const inventory = source(
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/coverage/CoverageClient.tsx',
  );

  assert.match(intelligence, /This does not confirm coverage/);
  assert.match(intelligence, /controlling policy language or a licensed insurance professional/);
  assert.match(options, /This does not confirm what an insurance policy covers/);
  assert.match(inventory, /This does not confirm what a policy covers/);
  assert.doesNotMatch(options, /proofType: 'coverage_gap_snapshot'/);
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
