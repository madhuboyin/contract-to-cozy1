const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { createPropertyFact } = require('../../src/modules/propertyContext/index.ts');
const { evaluateFinancialContext } = require('../../src/services/financialContext/applicabilityPolicy.ts');
const { FINANCIAL_FEATURE_SCOPES } = require('../../src/services/financialContext/context.ts');

const NOW = new Date('2026-07-16T12:00:00.000Z');
const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

function snapshot(values) {
  return {
    propertyId: 'property-1',
    contextVersion: 'phase-5-ownership-costs',
    generatedAt: NOW.toISOString(),
    scopes: ['CORE', 'LOCATION', 'FINANCIAL'],
    facts: Object.fromEntries(Object.entries(values).map(([key, value]) => [
      key,
      createPropertyFact(key, value, undefined, NOW),
    ])),
    warnings: [],
  };
}

test('ownership cost tools require canonical occupancy and location context', () => {
  const incomplete = evaluateFinancialContext(snapshot({
    'core.propertyUse': 'PRIMARY_RESIDENCE',
  }));
  assert.equal(incomplete.ownershipCostModeling.status, 'UNKNOWN');
  assert.equal(incomplete.homeSavingsModeling.status, 'UNKNOWN');

  const complete = evaluateFinancialContext(snapshot({
    'core.propertyUse': 'PRIMARY_RESIDENCE',
    'core.occupancyStatus': 'OWNER_OCCUPIED',
    'core.dwellingType': 'SINGLE_FAMILY',
    'location.state': 'NJ',
    'location.zipCode': '07030',
  }));
  assert.equal(complete.doNothingModeling.status, 'APPLICABLE');
  assert.equal(complete.homeSavingsModeling.status, 'APPLICABLE');
  assert.equal(complete.budgetPlanning.status, 'APPLICABLE');
  assert.equal(complete.ownershipCostModeling.status, 'APPLICABLE');
});

test('each ownership-cost feature has a feature-specific context scope', () => {
  for (const feature of [
    'DO_NOTHING',
    'HOME_SAVINGS',
    'BUDGET_PLANNER',
    'OWNERSHIP_COSTS',
  ]) {
    assert.ok(FINANCIAL_FEATURE_SCOPES[feature].includes('CORE'), feature);
    assert.ok(FINANCIAL_FEATURE_SCOPES[feature].includes('FINANCIAL'), feature);
  }
});

test('persisted tools stamp context provenance and live tools disclose calculation mode', () => {
  const doNothing = read('../../src/services/doNothingSimulator.service.ts');
  assert.match(doNothing, /propertyContextVersion: financialContext\.contextVersion/);
  assert.match(doNothing, /scenarioOverridesPresent/);

  const homeSavings = read('../../src/services/homeSavings.service.ts');
  assert.match(homeSavings, /propertyContextVersion: financialContext\.contextVersion/);
  assert.match(homeSavings, /scenarioOverridesPresent/);

  for (const source of [
    '../../src/routes/budgetForecaster.routes.ts',
  ]) {
    const contents = read(source);
    assert.match(contents, /propertyContext/);
    assert.match(contents, /calculationContext/);
    assert.match(contents, /overrideFields/);
  }
});

test('downstream cost decisions retain canonical snapshot and forecast versions', () => {
  for (const source of [
    '../../src/services/breakEven.service.ts',
    '../../src/services/sellHoldRent.service.ts',
  ]) {
    const contents = read(source);
    assert.match(contents, /ownershipCostConsumerProjectionService/);
    assert.match(contents, /ownershipCostContext/);
    assert.match(contents, /calculationFingerprint/);
  }
});

test('ownership-cost interfaces surface Property Context reconciliation notices', () => {
  for (const source of [
    '../../../frontend/src/components/ai/DoNothingSimulatorPanel.tsx',
    '../../../frontend/src/components/ai/HomeSavingsCheckPanel.tsx',
    '../../../frontend/src/app/(dashboard)/dashboard/components/BudgetForecaster.tsx',
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/ownership-costs/OwnershipCostsClient.tsx',
  ]) {
    assert.match(read(source), /PropertyContextCapturePanel/, source);
  }
});
