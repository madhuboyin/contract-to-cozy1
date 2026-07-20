// apps/backend/tests/unit/homeReserveFundDisclaimer.test.js
//
// W3 (financial) — educational-estimate boundary: recommendedMonthlyContributionCents
// and currentShortfallCents are a single point estimate chosen from a cost
// range, not a guaranteed figure, but the reserve fund summary previously
// carried no disclaimer at all (unlike the refinance radar, which already
// has an equivalent REFINANCE_DISCLAIMER on every response).

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService({ fund }) {
  const calcServicePath = require.resolve('../../src/services/homeReserveFundCalculation.service.ts');
  require.cache[calcServicePath] = {
    id: calcServicePath,
    filename: calcServicePath,
    loaded: true,
    exports: { homeReserveFundCalculationService: { getOrCreateFund: async () => fund } },
  };

  const servicePath = require.resolve('../../src/services/homeReserveFund.service.ts');
  delete require.cache[servicePath];
  return require(servicePath);
}

function fund(overrides = {}) {
  return {
    id: 'fund-1',
    propertyId: 'property-1',
    posture: 'MODERATE',
    recommendedMonthlyContributionCents: 15000,
    currentShortfallCents: 200000,
    isActive: true,
    ...overrides,
  };
}

test('getSummary attaches an educational-estimate disclaimer', async () => {
  const { HomeReserveFundService, RESERVE_FUND_DISCLAIMER } = loadService({ fund: fund() });
  const service = new HomeReserveFundService();

  const result = await service.getSummary('property-1');

  assert.equal(typeof RESERVE_FUND_DISCLAIMER, 'string');
  assert.ok(RESERVE_FUND_DISCLAIMER.length > 20, 'disclaimer must be real text, not a placeholder');
  assert.equal(result.disclaimer, RESERVE_FUND_DISCLAIMER);
  // Original fund fields must still be present untouched.
  assert.equal(result.recommendedMonthlyContributionCents, 15000);
  assert.equal(result.currentShortfallCents, 200000);
});
