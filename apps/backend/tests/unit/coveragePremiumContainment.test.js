const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('insurance trend labels synthetic values as modeled and exposes no unsupported savings or dead quote action', () => {
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

  assert.match(trend, /Modeled home estimate/);
  assert.match(trend, /not a\s+quote, a coverage-equivalent comparison, or evidence of what you paid/);
  assert.match(trend, /licensed insurance\s+professional/);
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

test('quote lead capture is unavailable until governed handoff controls exist', () => {
  const route = source('../../src/routes/insuranceQuote.routes.ts');
  const inventory = source(
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/coverage/CoverageClient.tsx',
  );

  assert.match(route, /INSURANCE_QUOTE_HANDOFF_UNAVAILABLE/);
  assert.match(route, /res\.status\(503\)/);
  assert.doesNotMatch(route, /insuranceQuoteRequest\.create/);
  assert.doesNotMatch(inventory, /InsuranceQuoteModal|setQuoteOpen|>Quotes</);
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
