const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { buildHabitPropertyContext } = require('../../src/jobs/habitGeneration.job.ts');
const {
  evaluateHabitTemplateApplicability,
} = require('../../../backend/src/services/homeHabitCoach/applicabilityPolicy.ts');

const NOW = new Date('2026-04-15T12:00:00.000Z');

test('worker Habit Coach uses the shared policy with canonical responsibility', () => {
  const context = buildHabitPropertyContext({
    id: 'property-1',
    dwellingType: 'CONDO_UNIT',
    yearBuilt: 2018,
    state: 'NY',
    heatingType: 'FORCED_AIR',
    coolingType: 'CENTRAL_AC',
    waterHeaterType: 'TANK',
    roofType: 'SHINGLE',
    climateSetting: { climateRegion: 'COLD' },
    exteriorProfile: null,
    responsibilities: [{ scope: 'HVAC', party: 'ASSOCIATION' }],
    inventoryItems: [],
  }, NOW);
  const decision = evaluateHabitTemplateApplicability(context, {
    key: 'hvac_tune_up_spring',
    category: 'HVAC',
    impactType: 'PREVENT_DAMAGE',
    targetingRulesJson: { seasons: ['SPRING'], requiredCoolingTypes: ['CENTRAL_AC'] },
  }, NOW);
  assert.equal(decision.status, 'NOT_APPLICABLE');
  assert.deepEqual(decision.reasonCodes, ['ASSOCIATION_RESPONSIBLE']);
});

test('worker adapter preserves unknown safety presence', () => {
  const context = buildHabitPropertyContext({
    id: 'property-2',
    dwellingType: 'DETACHED_SINGLE_FAMILY',
    state: 'PA',
    responsibilities: [{ scope: 'COMMON_SAFETY', party: 'OWNER' }],
    inventoryItems: [],
  }, NOW);
  const decision = evaluateHabitTemplateApplicability(context, {
    key: 'safety_smoke_detector_test',
    category: 'SAFETY',
    impactType: 'IMPROVE_SAFETY',
    targetingRulesJson: null,
  }, NOW);
  assert.equal(decision.status, 'UNKNOWN');
  assert.ok(decision.missingFactKeys.includes('safety.hasSmokeDetectors'));
});
