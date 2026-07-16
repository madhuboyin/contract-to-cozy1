const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { buildSeasonalPropertyContext } = require('../../src/jobs/seasonalChecklistGeneration.job.ts');
const {
  evaluateSeasonalTemplateApplicability,
} = require('../../../backend/src/services/seasonal/applicabilityPolicy.ts');

const NOW = new Date('2026-07-16T12:00:00.000Z');

test('worker adapter feeds canonical exterior and responsibility facts into the shared policy', () => {
  const context = buildSeasonalPropertyContext({
    id: 'property-1',
    roofType: 'SHINGLE',
    coolingType: 'CENTRAL_AC',
    hasSmokeDetectors: true,
    hasCoDetectors: true,
    exteriorProfile: {
      hasPrivateOutdoorSpace: true,
      outdoorSpaceTypes: ['PRIVATE_YARD'],
      hasLawn: true,
      hasTreesOrShrubs: false,
      hasDriveway: true,
      hasPoolOrSpa: false,
      hasIrrigation: false,
      hasOutdoorFaucets: true,
    },
    responsibilities: [{ scope: 'LANDSCAPING', party: 'ASSOCIATION' }],
    inventoryItems: [],
    maintenanceTasks: [],
  }, NOW);

  const decision = evaluateSeasonalTemplateApplicability(context, {
    taskKey: 'SPRING_LAWN_CARE_STARTUP',
    priority: 'OPTIONAL',
    requiredAssetCheck: 'has_lawn',
    requiredAssetType: null,
  }, NOW);

  assert.equal(decision.status, 'NOT_APPLICABLE');
  assert.deepEqual(decision.reasonCodes, ['ASSOCIATION_RESPONSIBLE']);
});

test('worker adapter preserves unknown instead of treating absent exterior profiles as false', () => {
  const context = buildSeasonalPropertyContext({
    id: 'property-2',
    roofType: 'UNKNOWN',
    coolingType: 'UNKNOWN',
    exteriorProfile: null,
    responsibilities: [],
    inventoryItems: [],
    maintenanceTasks: [],
  }, NOW);
  const decision = evaluateSeasonalTemplateApplicability(context, {
    taskKey: 'SUMMER_POOL_INSPECTION',
    priority: 'CRITICAL',
    requiredAssetCheck: 'has_pool',
    requiredAssetType: 'POOL',
  }, NOW);
  assert.equal(decision.status, 'UNKNOWN');
  assert.ok(decision.missingFactKeys.includes('exterior.hasPoolOrSpa'));
});
