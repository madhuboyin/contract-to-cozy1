const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { inventoryItemToPersonalizationAssetFact } = require('../../src/modules/personalization/infrastructure/propertyTraitRepository.ts');

const serviced = new Date('2026-01-01T00:00:00.000Z');

test('normalizes UI Inventory records into the focused personalization asset families', () => {
  assert.deepEqual(
    inventoryItemToPersonalizationAssetFact({ name: 'Central system', category: 'HVAC', tags: [], lastServicedOn: serviced }),
    { assetType: 'HVAC', lastServiced: serviced },
  );
  assert.deepEqual(
    inventoryItemToPersonalizationAssetFact({ name: 'Smoke detector', category: 'SAFETY', tags: [], lastServicedOn: serviced }),
    { assetType: 'SMOKE_DETECTOR', lastServiced: serviced },
  );
  assert.deepEqual(
    inventoryItemToPersonalizationAssetFact({ name: 'Washer / Dryer', category: 'APPLIANCE', tags: [], lastServicedOn: serviced }),
    { assetType: 'DRYER', lastServiced: serviced },
  );
});

test('ignores unrelated inventory items', () => {
  assert.equal(
    inventoryItemToPersonalizationAssetFact({ name: 'Dining table', category: 'FURNITURE', tags: [], lastServicedOn: null }),
    null,
  );
});
