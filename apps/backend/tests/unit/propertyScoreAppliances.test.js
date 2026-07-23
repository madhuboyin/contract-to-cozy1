const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { calculateHealthScore } = require('../../src/utils/propertyScore.util.ts');

function property(overrides = {}) {
  return {
    yearBuilt: null,
    dwellingType: 'UNKNOWN',
    roofType: null,
    heatingType: null,
    coolingType: null,
    waterHeaterType: null,
    occupantsCount: null,
    propertySize: null,
    hvacInstallYear: null,
    waterHeaterInstallYear: null,
    roofReplacementYear: null,
    hasSmokeDetectors: null,
    hasCoDetectors: null,
    hasSecuritySystem: null,
    hasFireExtinguisher: null,
    hasDrainageIssues: null,
    hasIrrigation: null,
    bonusMultiplier: 1,
    warranties: [],
    ...overrides,
  };
}

function applianceInsight(result) {
  return result.insights.find((insight) => insight.factor === 'Appliances');
}

test('missing optional household size does not create an actionable health insight', () => {
  const result = calculateHealthScore(property({
    propertySize: 1800,
    occupantsCount: null,
  }), 0);

  assert.equal(
    result.insights.some((insight) => insight.factor === 'Usage/Wear Factor'),
    false,
  );
});

test('legacy household size can still refine wear guidance when present', () => {
  const result = calculateHealthScore(property({
    propertySize: 1800,
    occupantsCount: 4,
  }), 0);

  const insight = result.insights.find((candidate) => candidate.factor === 'Usage/Wear Factor');
  assert.equal(insight?.status, 'High Density');
});

test('complete property appliance records produce a complete appliance factor', () => {
  const result = calculateHealthScore(property({
    majorAppliances: [
      { assetType: 'DISHWASHER', installationYear: 2016 },
      { assetType: 'REFRIGERATOR', installationYear: 2016 },
    ],
  }), 0);

  assert.equal(applianceInsight(result)?.status, 'Complete');
  assert.equal(applianceInsight(result).score, 5);
});

test('only APPLIANCE inventory records count toward appliance health', () => {
  const result = calculateHealthScore(property({
    inventoryItems: [
      { category: 'APPLIANCE', assetType: 'DISHWASHER', name: 'Dishwasher', installedOn: new Date('2016-01-01') },
      { category: 'HVAC', assetType: 'HVAC_FURNACE', name: 'HVAC Furnace', installedOn: new Date('2016-01-01') },
      { category: 'ROOF_EXTERIOR', assetType: 'ROOF_SHINGLE', name: 'Roof', installedOn: new Date('2016-01-01') },
    ],
    majorAppliances: [
      { assetType: 'DISHWASHER', installationYear: 2016 },
      { assetType: 'REFRIGERATOR', installationYear: 2016 },
      { assetType: 'OVEN_RANGE', installationYear: 2016 },
    ],
  }), 0);

  assert.equal(applianceInsight(result)?.status, 'Complete');
});

test('one complete canonical appliance record is sufficient for the appliance factor', () => {
  const result = calculateHealthScore(property({
    inventoryItems: [
      { category: 'APPLIANCE', assetType: 'DISHWASHER', name: 'Dishwasher', installedOn: new Date('2016-01-01') },
    ],
  }), 0);

  assert.equal(applianceInsight(result)?.status, 'Complete');
});

test('existing appliances with missing installation years produce a partial factor', () => {
  const result = calculateHealthScore(property({
    majorAppliances: [
      { assetType: 'DISHWASHER', installationYear: null },
      { assetType: 'REFRIGERATOR', installationYear: 2016 },
    ],
  }), 0);

  assert.equal(applianceInsight(result)?.status, 'Partial');
  assert.ok(applianceInsight(result).score > 0);
  assert.ok(applianceInsight(result).score < 5);
});
