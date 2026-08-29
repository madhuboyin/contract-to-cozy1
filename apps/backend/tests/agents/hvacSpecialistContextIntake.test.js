const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Exercises the SUBMIT_CONTEXT intake mapping without the real InventoryService
// by stubbing the module the handler delegates to.
const Module = require('node:module');
const originalResolve = Module._resolveFilename;

const updateCalls = [];
require.cache[require.resolve('../../src/services/inventory.service.ts')] = {
  id: require.resolve('../../src/services/inventory.service.ts'),
  loaded: true,
  exports: {
    InventoryService: class {
      async updateItem(propertyId, itemId, patch) {
        updateCalls.push({ propertyId, itemId, patch });
        return { id: itemId, ...patch };
      }
    },
  },
};
void originalResolve;

const { applyHvacSpecialistContextIntake } = require('../../src/services/agents/hvacSpecialistContextIntake.ts');

test('maps install year, condition, and replacement cost into an InventoryService patch', async () => {
  updateCalls.length = 0;
  await applyHvacSpecialistContextIntake({
    propertyId: 'p1', principalUserId: 'u1', inventoryItemId: 'item-1',
    intake: { 'hvac.installDate': 2011, 'hvac.condition': 'FAIR', 'hvac.replacementCost': 8200 },
  });
  assert.equal(updateCalls.length, 1);
  assert.deepEqual(updateCalls[0].patch, {
    installedOn: '2011-01-01',
    condition: 'FAIR',
    replacementCostCents: 820_000,
  });
});

test('accepts a YYYY-MM install string and does nothing for an empty intake', async () => {
  updateCalls.length = 0;
  await applyHvacSpecialistContextIntake({
    propertyId: 'p1', principalUserId: 'u1', inventoryItemId: 'item-1',
    intake: { 'hvac.installDate': '2015-06' },
  });
  assert.equal(updateCalls[0].patch.installedOn, '2015-06-01');

  updateCalls.length = 0;
  await applyHvacSpecialistContextIntake({ propertyId: 'p1', principalUserId: 'u1', inventoryItemId: 'item-1', intake: {} });
  assert.equal(updateCalls.length, 0);
});

test('rejects an unknown intake key and an out-of-range value', async () => {
  await assert.rejects(applyHvacSpecialistContextIntake({
    propertyId: 'p1', principalUserId: 'u1', inventoryItemId: 'item-1',
    intake: { 'hvac.somethingElse': 1 },
  }));
  await assert.rejects(applyHvacSpecialistContextIntake({
    propertyId: 'p1', principalUserId: 'u1', inventoryItemId: 'item-1',
    intake: { 'hvac.replacementCost': -5 },
  }));
});
