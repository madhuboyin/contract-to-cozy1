const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

require('ts-node/register');

const { withoutEquityDerivedFields } = require('../../src/controllers/financing.controller.ts');

const routes = readFileSync(join(__dirname, '../../src/routes/financing.routes.ts'), 'utf8');
const routeBlock = (method, path) => {
  const escaped = `/properties/:propertyId/financing/${path}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`router\\.${method}\\(\\s*'${escaped}'`).exec(routes);
  assert.ok(match, `${method} ${path} is registered`);
  const ends = [routes.indexOf('\n);', match.index), routes.indexOf('\nrouter.', match.index + 1)].filter((index) => index > 0);
  return routes.slice(match.index, Math.min(...ends));
};

test('every route that returns the persisted profile or the equity position built from its mortgage balance needs OWNER', () => {
  for (const [method, path] of [['get', 'profile'], ['put', 'profile'], ['get', 'profile/history'], ['get', 'equity'], ['post', 'equity/refresh'], ['get', 'equity/history']]) {
    assert.match(routeBlock(method, path), /requireHouseholdRole\('OWNER'\)/, `${method.toUpperCase()} ${path}`);
  }
});

test('scenarios and the calculator stay readable by household members, and creating or changing a scenario stays CONTRIBUTOR', () => {
  assert.doesNotMatch(routeBlock('get', 'scenarios'), /requireHouseholdRole\('OWNER'\)/);
  assert.doesNotMatch(routeBlock('post', 'calculate'), /requireHouseholdRole\('OWNER'\)/);
  assert.doesNotMatch(routeBlock('get', 'scenarios/:scenarioId'), /requireHouseholdRole\('OWNER'\)/);
  assert.match(routeBlock('post', 'scenarios'), /requireHouseholdRole\('CONTRIBUTOR'\)/);
});

const RESULTS = { projectCostCents: 4_000_000, helocEligible: true, helocCapacityCents: 9_000_000, homeEquityLoan: { monthlyPaymentCents: 50_000 } };
const SCENARIO = { id: 's1', title: 'Kitchen', equitySnapshotCents: 20_000_000, helocCapacitySnapshotCents: 9_000_000, resultsJson: RESULTS, rateSnapshotJson: { national: 7 } };

test('below OWNER the equity-derived HELOC and equity figures are removed from calculator results and scenarios; an owner gets them unchanged', () => {
  assert.equal(withoutEquityDerivedFields(RESULTS, 'OWNER'), RESULTS);
  assert.equal(withoutEquityDerivedFields(SCENARIO, 'OWNER'), SCENARIO);
  for (const role of ['VIEWER', 'CONTRIBUTOR', undefined]) {
    const results = withoutEquityDerivedFields(RESULTS, role);
    assert.equal('helocEligible' in results || 'helocCapacityCents' in results, false, String(role));
    assert.deepEqual([results.projectCostCents, results.homeEquityLoan.monthlyPaymentCents], [4_000_000, 50_000]);
    const scenario = withoutEquityDerivedFields(SCENARIO, role);
    assert.deepEqual([scenario.equitySnapshotCents, scenario.helocCapacitySnapshotCents], [null, null]);
    assert.equal('helocEligible' in scenario.resultsJson, false);
    assert.equal(scenario.title, 'Kitchen');
  }
  assert.equal(RESULTS.helocEligible, true, 'the source object is not mutated');
  assert.equal(withoutEquityDerivedFields(null, 'VIEWER'), null);
});
