const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Operations Slice 0: runJourneyCompletionHooks used to certify a
// journey's physical outcome (InventoryItem.condition write + VERIFIED_
// RESOLUTION HomeEvent) purely from "all required steps completed," with no
// check on whether any step evidence was actually tool/professional-sourced
// rather than the homeowner's own self-report. This asserts the new
// evidence-provenance gate: evidence-backed journeys still certify; purely
// self-reported journeys still complete, but record an honest, unverified
// MILESTONE event instead and never touch InventoryItem.condition.

function makeJourney(overrides = {}) {
  return {
    id: 'journey-1',
    propertyId: 'property-1',
    inventoryItemId: 'inventory-1',
    issueType: 'HVAC_FAILURE',
    isUserInitiated: true,
    derivedSnapshotJson: { latest: { replaceRepairVerdict: null } },
    ...overrides,
  };
}

let currentJourney = makeJourney();
let requiredSteps = [];
const inventoryUpdates = [];
const homeEventCreates = [];

const prismaMock = {
  guidanceJourney: { findUnique: async () => currentJourney },
  guidanceJourneyStep: { findMany: async () => requiredSteps },
  $transaction: async (fn) => fn({
    inventoryItem: { update: async (args) => { inventoryUpdates.push(args); return args; } },
    homeEvent: { create: async (args) => { homeEventCreates.push(args); return args; } },
  }),
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: prismaMock },
};

const { runJourneyCompletionHooks } = require('../../src/services/guidanceEngine/guidanceCompletionHooks.service.ts');

test('a journey with only self-reported (USER_INPUT) evidence does not certify the physical outcome', async () => {
  currentJourney = makeJourney();
  requiredSteps = [
    { evidences: [{ sourceType: 'USER_INPUT', status: 'CAPTURED' }] },
  ];
  inventoryUpdates.length = 0;
  homeEventCreates.length = 0;

  await runJourneyCompletionHooks('journey-1');

  assert.equal(inventoryUpdates.length, 0, 'must not write InventoryItem.condition without real evidence');
  assert.equal(homeEventCreates.length, 1);
  assert.equal(homeEventCreates[0].data.type, 'MILESTONE');
  assert.equal(homeEventCreates[0].data.sourceBadge, 'USER_REPORTED');
});

test('a journey with no evidence at all also does not certify', async () => {
  currentJourney = makeJourney();
  requiredSteps = [{ evidences: [] }];
  inventoryUpdates.length = 0;
  homeEventCreates.length = 0;

  await runJourneyCompletionHooks('journey-1');

  assert.equal(inventoryUpdates.length, 0);
  assert.equal(homeEventCreates[0].data.sourceBadge, 'USER_REPORTED');
});

test('a journey with tool-sourced evidence certifies the physical outcome as before', async () => {
  currentJourney = makeJourney();
  requiredSteps = [
    { evidences: [{ sourceType: 'INTERNAL_TOOL', status: 'CAPTURED' }] },
  ];
  inventoryUpdates.length = 0;
  homeEventCreates.length = 0;

  await runJourneyCompletionHooks('journey-1');

  assert.equal(inventoryUpdates.length, 1);
  assert.equal(inventoryUpdates[0].data.condition, 'GOOD');
  assert.equal(homeEventCreates[0].data.type, 'VERIFIED_RESOLUTION');
  assert.equal(homeEventCreates[0].data.sourceBadge, 'VERIFIED');
});

test('a journey with user-reported evidence that was independently VERIFIED still certifies', async () => {
  currentJourney = makeJourney();
  requiredSteps = [
    { evidences: [{ sourceType: 'USER_INPUT', status: 'VERIFIED' }] },
  ];
  inventoryUpdates.length = 0;
  homeEventCreates.length = 0;

  await runJourneyCompletionHooks('journey-1');

  assert.equal(inventoryUpdates.length, 1);
  assert.equal(homeEventCreates[0].data.sourceBadge, 'VERIFIED');
});

test('non-user-initiated journeys still short-circuit before any evidence check', async () => {
  currentJourney = makeJourney({ isUserInitiated: false });
  requiredSteps = [{ evidences: [{ sourceType: 'INTERNAL_TOOL', status: 'CAPTURED' }] }];
  inventoryUpdates.length = 0;
  homeEventCreates.length = 0;

  await runJourneyCompletionHooks('journey-1');

  assert.equal(inventoryUpdates.length, 0);
  assert.equal(homeEventCreates.length, 0);
});
