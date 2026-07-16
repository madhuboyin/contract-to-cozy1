const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { createPropertyFact } = require('../../src/modules/propertyContext/index.ts');
const {
  evaluateHabitTemplateApplicability,
} = require('../../src/services/homeHabitCoach/applicabilityPolicy.ts');

const NOW = new Date('2026-04-15T12:00:00.000Z');

function snapshot(values) {
  return {
    propertyId: 'property-1',
    contextVersion: 'test',
    generatedAt: NOW.toISOString(),
    scopes: [],
    facts: Object.fromEntries(Object.entries(values).map(([key, value]) => [
      key,
      createPropertyFact(key, value, undefined, NOW),
    ])),
    warnings: [],
  };
}

function template(overrides = {}) {
  return {
    key: 'general_monthly_walkthrough',
    category: 'GENERAL',
    impactType: 'GENERAL_UPKEEP',
    targetingRulesJson: null,
    ...overrides,
  };
}

test('required cooling type is unknown when canonical cooling context is missing', () => {
  const decision = evaluateHabitTemplateApplicability(
    snapshot({ 'systems.coolingType': null }),
    template({
      key: 'hvac_tune_up_spring',
      category: 'HVAC',
      targetingRulesJson: { seasons: ['SPRING'], requiredCoolingTypes: ['CENTRAL_AC'] },
    }),
    NOW,
  );
  assert.equal(decision.status, 'UNKNOWN');
  assert.deepEqual(decision.missingFactKeys, ['systems.coolingType']);
});

test('known cooling mismatch suppresses a targeted HVAC habit', () => {
  const decision = evaluateHabitTemplateApplicability(
    snapshot({ 'systems.coolingType': 'NONE' }),
    template({
      key: 'hvac_tune_up_spring',
      category: 'HVAC',
      targetingRulesJson: { seasons: ['SPRING'], requiredCoolingTypes: ['CENTRAL_AC'] },
    }),
    NOW,
  );
  assert.equal(decision.status, 'NOT_APPLICABLE');
  assert.deepEqual(decision.reasonCodes, ['COOLING_TYPE_MISMATCH']);
});

test('association-managed HVAC suppresses an otherwise applicable habit', () => {
  const decision = evaluateHabitTemplateApplicability(
    snapshot({
      'systems.coolingType': 'CENTRAL_AC',
      'responsibility.hvac': 'ASSOCIATION',
    }),
    template({
      key: 'hvac_tune_up_spring',
      category: 'HVAC',
      targetingRulesJson: { seasons: ['SPRING'], requiredCoolingTypes: ['CENTRAL_AC'] },
    }),
    NOW,
  );
  assert.equal(decision.status, 'NOT_APPLICABLE');
  assert.deepEqual(decision.reasonCodes, ['ASSOCIATION_RESPONSIBLE']);
});

test('safety equipment presence is first-class unknown rather than an automatic match', () => {
  const unknown = evaluateHabitTemplateApplicability(
    snapshot({ 'safety.hasSmokeDetectors': null }),
    template({ key: 'safety_smoke_detector_test', category: 'SAFETY', impactType: 'IMPROVE_SAFETY' }),
    NOW,
  );
  const absent = evaluateHabitTemplateApplicability(
    snapshot({ 'safety.hasSmokeDetectors': false }),
    template({ key: 'safety_smoke_detector_test', category: 'SAFETY', impactType: 'IMPROVE_SAFETY' }),
    NOW,
  );
  assert.equal(unknown.status, 'UNKNOWN');
  assert.equal(absent.status, 'NOT_APPLICABLE');
});

test('general habits remain applicable without optional household facts', () => {
  const decision = evaluateHabitTemplateApplicability(snapshot({}), template(), NOW);
  assert.equal(decision.status, 'APPLICABLE');
  assert.deepEqual(decision.usedFactKeys, []);
});

test('legacy property-type targeting maps to the canonical dwelling taxonomy', () => {
  const decision = evaluateHabitTemplateApplicability(
    snapshot({ 'core.dwellingType': 'CONDO_UNIT' }),
    template({ targetingRulesJson: { propertyTypes: ['CONDO'] } }),
    NOW,
  );
  assert.equal(decision.status, 'APPLICABLE');
  assert.deepEqual(decision.usedFactKeys, ['core.dwellingType']);
});

test('habit generation consumes the context contract and shared policy', () => {
  const engine = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/homeHabitCoach/habitGenerationEngine.ts'),
    'utf8',
  );
  const service = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/homeHabitCoach/homeHabitCoachService.ts'),
    'utf8',
  );
  assert.match(engine, /evaluateHabitTemplateApplicability/);
  assert.match(engine, /propertyContext: PropertyContextSnapshot/);
  assert.doesNotMatch(engine, /prisma\.property\.findUnique/);
  assert.match(service, /getPropertyContext/);
});
