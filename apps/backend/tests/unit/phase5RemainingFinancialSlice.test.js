const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { createPropertyFact } = require('../../src/modules/propertyContext/index.ts');
const { evaluateFinancialContext } = require('../../src/services/financialContext/applicabilityPolicy.ts');
const { FINANCIAL_FEATURE_SCOPES } = require('../../src/services/financialContext/context.ts');

const NOW = new Date('2026-07-17T12:00:00.000Z');
const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

function snapshot(values) {
  return {
    propertyId: 'property-1',
    contextVersion: 'phase-5-remaining',
    generatedAt: NOW.toISOString(),
    scopes: ['CORE', 'LOCATION', 'FINANCIAL'],
    facts: Object.fromEntries(Object.entries(values).map(([key, value]) => [
      key,
      createPropertyFact(key, value, undefined, NOW),
    ])),
    warnings: [],
  };
}

test('remaining Phase 5 features declare feature-specific financial scopes', () => {
  for (const feature of [
    'BREAK_EVEN',
    'SELL_HOLD_RENT',
    'PROPERTY_TAX_VALUE',
    'TAX_APPEAL',
    'VALUE_TRACKER',
    'REFINANCE_RADAR',
    'FINANCING_CENTER',
    'HIDDEN_ASSETS',
  ]) {
    assert.ok(FINANCIAL_FEATURE_SCOPES[feature].includes('FINANCIAL'), feature);
  }
});

test('property benchmarks and program matching require canonical use and location', () => {
  const incomplete = evaluateFinancialContext(snapshot({
    'core.propertyUse': 'PRIMARY_RESIDENCE',
  }));
  assert.equal(incomplete.propertyBenchmarking.status, 'UNKNOWN');
  assert.equal(incomplete.hiddenAssetMatching.status, 'UNKNOWN');

  const complete = evaluateFinancialContext(snapshot({
    'core.propertyUse': 'PRIMARY_RESIDENCE',
    'core.occupancyStatus': 'OWNER_OCCUPIED',
    'core.dwellingType': 'SINGLE_FAMILY',
    'location.state': 'NJ',
    'location.zipCode': '07030',
  }));
  assert.equal(complete.propertyBenchmarking.status, 'APPLICABLE');
  assert.equal(complete.hiddenAssetMatching.status, 'APPLICABLE');
});

test('remaining financial controllers return context and explicit calculation modes', () => {
  for (const source of [
    '../../src/controllers/breakEven.controller.ts',
    '../../src/controllers/sellHoldRent.controller.ts',
    '../../src/controllers/propertyTax.controller.ts',
    '../../src/routes/taxAppeal.routes.ts',
    '../../src/controllers/valueIntelligence.controller.ts',
  ]) {
    const contents = read(source);
    assert.match(contents, /propertyContext/, source);
    assert.match(contents, /calculationContext/, source);
  }
});

test('hidden asset scans use canonical classifications and persist context provenance', () => {
  const service = read('../../src/services/hiddenAssets.service.ts');
  assert.match(service, /getFinancialContextDecisions/);
  assert.match(service, /propertyContextVersion: financialContext\.contextVersion/);

  const rules = read('../../src/services/hiddenAssets/ruleEngine.ts');
  assert.match(rules, /property\.dwellingType/);
  assert.match(rules, /property\.propertyUse/);
  assert.match(rules, /property\.occupancyStatus/);

  const worker = read('../../../workers/src/jobs/hiddenAssetRefresh.job.ts');
  assert.match(worker, /refreshMatchesInternal/);
});

test('refinance and financing persisted outputs carry generation context', () => {
  const refinance = read('../../src/refinanceRadar/refinanceRadar.service.ts');
  assert.match(refinance, /metadataJson: \{ propertyContextVersion \}/);
  assert.match(refinance, /propertyContextVersion: input\.propertyContextVersion/);

  const financing = read('../../src/services/financing.service.ts');
  assert.match(financing, /propertyContextVersion/);

  const schema = read('../../prisma/schema.prisma');
  assert.match(schema, /model EquityPosition[\s\S]*propertyContextVersion\s+String\?/);
  assert.match(schema, /model FinancingScenario[\s\S]*propertyContextVersion\s+String\?/);
  assert.match(schema, /model PropertyRefinanceRadarState[\s\S]*propertyContextVersion\s+String\?/);
  assert.match(schema, /model PropertyHiddenAssetMatch[\s\S]*propertyContextVersion String\?/);
  assert.match(schema, /model PropertyHiddenAssetScanRun[\s\S]*propertyContextVersion String\?/);
});

test('remaining Phase 5 interfaces surface reconciliation notices', () => {
  for (const source of [
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/break-even/BreakEvenClient.tsx',
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/sell-hold-rent/SellHoldRentClient.tsx',
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/property-tax/PropertyTaxClient.tsx',
    '../../../frontend/src/components/TaxAppealAssistant.tsx',
    '../../../frontend/src/app/(dashboard)/dashboard/components/EquityOverviewCard.tsx',
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/hidden-asset-finder/HiddenAssetFinderClient.tsx',
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/mortgage-refinance-radar/MortgageRefinanceRadarClient.tsx',
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/financing/FinancingToolClient.tsx',
  ]) {
    assert.match(read(source), /PropertyContextNotice/, source);
  }
});

test('value tracking prefers the canonical financing profile', () => {
  const value = read('../../src/services/valueIntelligence.service.ts');
  assert.match(value, /financingProfile.*purchasePriceCents/s);
  assert.match(value, /property\.financingProfile\?\.purchasePriceCents \?\?/);
});
