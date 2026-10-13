const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Register P1 "Sell / Hold / Rent": what-if assumptions typed in the conversation (FRD v1.321). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { parseSellHoldRentWhatIf: parse } = require('../../src/services/ask/support/sellHoldRentWhatIf.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { sellHoldRentWhatIfFromAnalyses } = require('../../src/services/ask/handlers/sellHoldRent.handler.ts');

test('an explicit hypothetical becomes decimal overrides, with rent as dollars a month and the shared terms read as in Break-Even', () => {
  assert.deepEqual(parse('What if I rent it for $3,200 and vacancy is 8%'), { monthlyRentNow: 3200, vacancyRate: 0.08 });
  assert.deepEqual(parse('What if appreciation is 4% and selling costs are 7%'), { appreciationRate: 0.04, sellingCostRate: 0.07 });
  assert.deepEqual(parse('Suppose management fees are 10% and rent growth is 3%'), { managementRate: 0.1, rentGrowthRate: 0.03 });
  assert.deepEqual(parse('what if my home is worth $600k and I rent it out for $3.5k a month'), { homeValueNow: 600000, monthlyRentNow: 3500 });
});

test('a rent figure is never read as the home value, and a bare question is not a what-if', () => {
  assert.equal(parse('What if I rent it for $3,200')?.homeValueNow, undefined);
  assert.equal(parse('Should I sell, hold, or rent this home?'), null);
  assert.equal(parse('what if vacancy is 80%'), null);
  assert.equal(parse('what if I rent it for $5'), null);
});

test('the what-if phrasings route to the sell, hold and rent analysis', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;
  for (const message of ['What if I rent it out for $3,200 and vacancy is 8%?', 'What if I sell the house and selling costs are 7%?', 'What if I rent it for $3,000 instead of selling?']) {
    assert.equal(route(message), 'SELL_HOLD_RENT_ANALYSIS', message);
  }
});

const analysis = (over = {}) => ({
  input: { years: 5 },
  recommendation: { winner: 'HOLD', confidence: 'HIGH', rationale: '' },
  current: { homeValueNow: 500000 },
  scenarios: {
    sell: { netProceeds: 300000, projectedSalePrice: 590000, sellingCosts: 35000 },
    hold: { net: 80000, appreciationGain: 90000, totalOwnershipCosts: 70000 },
    rent: { net: 60000, totalRentalIncome: 170000, rentalOverheads: { vacancyLoss: 10000, managementFees: 14000 } },
  },
  meta: { generatedAt: '2026-10-12T00:00:00.000Z', dataSources: ['Internal property profile'], notes: [], confidence: 'MEDIUM' },
  ...over,
});

test('the what-if answer shows the changed assumptions and both estimates, saves nothing and survives the answer-trust validator', () => {
  const scenario = analysis({ recommendation: { winner: 'RENT', confidence: 'MEDIUM', rationale: '' }, scenarios: { ...analysis().scenarios, rent: { ...analysis().scenarios.rent, net: 120000 } } });
  const result = sellHoldRentWhatIfFromAnalyses(analysis(), scenario, { monthlyRentNow: 3200, vacancyRate: 0.08 });
  assert.equal(result.reasonCode, 'SELL_HOLD_RENT_WHAT_IF');
  assert.match(result.blocks[0].body, /points to renting it out; the standard estimate points to holding/);
  assert.match(result.blocks[0].body, /Nothing was saved/);
  const assumptions = result.blocks.find((block) => block.id === 'sell-hold-rent-what-if-assumptions');
  assert.deepEqual(assumptions.rows.map((row) => row.values), [{ assumption: 'Monthly rent', value: '$3,200' }, { assumption: 'Vacancy', value: '8%' }]);
  const comparison = result.blocks.find((block) => block.id === 'sell-hold-rent-what-if-comparison');
  assert.deepEqual(comparison.rows[2].values, { measure: 'Rent: modeled net change', standard: '$60,000', whatIf: '$120,000' });
  const ids = result.blocks.map((block) => block.id);
  assert.equal(new Set(ids).size, ids.length);
  const evidence = { schemaVersion: '1.0', sources: [{ sourceId: 'sale-case.analysis', operationId: 'SELL_HOLD_RENT_ANALYSIS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-12T00:00:00.000Z' }] };
  const { result: validated } = validateAskAnswerTrust({
    question: 'What if I rent it for $3,200 and vacancy is 8%?', operationId: 'SELL_HOLD_RENT_ANALYSIS', result: { ...result, parameters: { answerTrustEvidence: evidence } }, propertyId: 'p1',
  });
  assert.deepEqual(validated.blocks.map((block) => block.id), ids);
});

test('the service applies ephemeral overrides without saving an assumption set or an analysis row', () => {
  const service = fs.readFileSync(path.resolve(__dirname, '../../src/services/sellHoldRent.service.ts'), 'utf8');
  assert.match(service, /persistOverrides: !input\.ephemeral/);
  assert.match(service, /isCanonicalRequest = \(Object\.keys\(input\)[\s\S]{0,120}input\[key\] === undefined/);
});
