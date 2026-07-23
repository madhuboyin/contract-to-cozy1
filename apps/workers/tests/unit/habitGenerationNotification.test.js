// apps/workers/tests/unit/habitGenerationNotification.test.js
//
// W3 (home intelligence): PropertyHabit generation previously created zero
// notification and zero canonical Home Action promotion — a newly-generated
// high-priority habit (e.g. "test your CO detectors") was invisible unless
// the homeowner proactively visited the Home Habit Coach tool page. Full
// Home Action promotion is a larger cross-cutting change (deferred, same as
// the pre-existing PropertyMaintenanceTask gap); this covers the smaller,
// more urgent piece — a notification for safety/damage-prevention habits,
// batched one per property per run (same pattern as the neighborhood slice).
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { runHabitGenerationJob } = require('../../src/jobs/habitGeneration.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ properties, generationResultsByProperty }) {
  const createCalls = [];

  const deps = {
    prisma: {
      property: { findMany: async () => properties },
    },
    generateHabitsForProperty: async (propertyId) => generationResultsByProperty[propertyId] ?? { created: 0, skipped: 0, details: [] },
    notificationService: {
      create: async (input) => {
        createCalls.push(input);
        return { id: `notification-${createCalls.length}` };
      },
    },
    logger: noopLogger,
  };

  return { deps, getCreateCalls: () => createCalls };
}

function property(overrides = {}) {
  return {
    id: 'property-1',
    dwellingType: 'DETACHED_SINGLE_FAMILY',
    yearBuilt: 2010,
    state: 'NJ',
    heatingType: 'FORCED_AIR',
    coolingType: 'CENTRAL_AC',
    waterHeaterType: 'TANK',
    roofType: 'SHINGLE',
    hasSumpPumpBackup: false,
    hasFireExtinguisher: true,
    hasSmokeDetectors: true,
    hasCoDetectors: true,
    hasSecuritySystem: false,
    climateSetting: null,
    exteriorProfile: null,
    responsibilities: [],
    inventoryItems: [],
    homeownerProfile: { userId: 'user-1' },
    ...overrides,
  };
}

function created(templateKey, impactType, priorityScore = 70) {
  return { templateKey, action: 'created', impactType, priorityScore };
}
function skipped(templateKey) {
  return { templateKey, action: 'skipped', reason: 'targeting mismatch' };
}

test('notifies once when a safety-impact habit is newly created', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    properties: [property()],
    generationResultsByProperty: {
      'property-1': { created: 1, skipped: 0, details: [created('safety_co_detector_test', 'IMPROVE_SAFETY')] },
    },
  });

  await runHabitGenerationJob(undefined, deps);

  const calls = getCreateCalls();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].userId, 'user-1');
  assert.equal(calls[0].category, 'MAINTENANCE');
  assert.equal(calls[0].type, 'HOME_HABIT_GENERATED');
  assert.equal(calls[0].actionUrl, '/dashboard/properties/property-1/tools/home-habit-coach');
  assert.deepEqual(calls[0].metadata.templateKeys, ['safety_co_detector_test']);
});

test('does not notify for low-impact habits (efficiency/general upkeep)', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    properties: [property()],
    generationResultsByProperty: {
      'property-1': {
        created: 2,
        skipped: 0,
        details: [
          created('hvac_filter_check', 'IMPROVE_EFFICIENCY'),
          created('general_gutter_clean', 'GENERAL_UPKEEP'),
        ],
      },
    },
  });

  await runHabitGenerationJob(undefined, deps);

  assert.equal(getCreateCalls().length, 0);
});

test('batches multiple safety/damage-prevention habits into a single notification', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    properties: [property()],
    generationResultsByProperty: {
      'property-1': {
        created: 3,
        skipped: 0,
        details: [
          created('safety_co_detector_test', 'IMPROVE_SAFETY'),
          created('sump_pump_check', 'PREVENT_DAMAGE'),
          created('hvac_filter_check', 'IMPROVE_EFFICIENCY'),
        ],
      },
    },
  });

  await runHabitGenerationJob(undefined, deps);

  const calls = getCreateCalls();
  assert.equal(calls.length, 1, 'must send exactly one notification for the property, not one per habit');
  assert.match(calls[0].title, /2 new home care habits/);
  assert.deepEqual(calls[0].metadata.templateKeys.sort(), ['safety_co_detector_test', 'sump_pump_check'].sort());
});

test('does not notify when nothing was created (all skipped)', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    properties: [property()],
    generationResultsByProperty: {
      'property-1': { created: 0, skipped: 1, details: [skipped('safety_co_detector_test')] },
    },
  });

  await runHabitGenerationJob(undefined, deps);

  assert.equal(getCreateCalls().length, 0);
});

test('does not notify when the property has no homeowner', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    properties: [property({ homeownerProfile: null })],
    generationResultsByProperty: {
      'property-1': { created: 1, skipped: 0, details: [created('safety_co_detector_test', 'IMPROVE_SAFETY')] },
    },
  });

  await runHabitGenerationJob(undefined, deps);

  assert.equal(getCreateCalls().length, 0);
});

test('notifies each property independently', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    properties: [
      property({ id: 'property-1', homeownerProfile: { userId: 'user-1' } }),
      property({ id: 'property-2', homeownerProfile: { userId: 'user-2' } }),
    ],
    generationResultsByProperty: {
      'property-1': { created: 1, skipped: 0, details: [created('safety_co_detector_test', 'IMPROVE_SAFETY')] },
      'property-2': { created: 1, skipped: 0, details: [created('sump_pump_check', 'PREVENT_DAMAGE')] },
    },
  });

  await runHabitGenerationJob(undefined, deps);

  const calls = getCreateCalls();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.userId).sort(), ['user-1', 'user-2']);
});
