const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Appliance classification must survive edits (FRD v1.174): the Inventory drawer sends `tags: []` on every save, and a
// rename used to leave the type tag and source hash out of step with each other.

let existingItem = null;
let duplicateItem = null;
const lookups = [];
const updates = [];

const txMock = {
  inventoryItem: { update: async ({ where, data }) => { updates.push(data); return { id: where.id, propertyId: 'property-1', ...data }; } },
};
const prismaMock = {
  inventoryItem: {
    // The item lookup is by id; the duplicate check is by source hash. Keep them distinguishable.
    findFirst: async ({ where }) => { lookups.push(where); return where.id ? existingItem : duplicateItem; },
  },
  $transaction: async (callback) => callback(txMock),
};

function mockModule(relativePath, exports) {
  const modulePath = require.resolve(relativePath);
  require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
}
mockModule('../../src/lib/prisma.ts', { prisma: prismaMock });
mockModule('../../src/propertyChanges/propertyChange.service.ts', { emitPropertyChangeWithTransaction: async () => ({ change: { id: 'c1' }, deduped: false }) });
mockModule('../../src/services/analytics/index.ts', {
  analyticsEmitter: { track: () => undefined },
  AnalyticsEvent: { SYSTEM_ADDED: 'SYSTEM_ADDED', INVENTORY_ITEM_CREATED: 'INVENTORY_ITEM_CREATED' },
  AnalyticsModule: { PROPERTY: 'PROPERTY', INVENTORY: 'INVENTORY' },
  AnalyticsFeature: { PROPERTY_PROFILE: 'PROPERTY_PROFILE', INVENTORY_ITEM: 'INVENTORY_ITEM' },
});
mockModule('../../src/services/homeEvents/homeEvents.autogen.ts', { HomeEventsAutoGen: { onInventoryItemCreated: async () => undefined } });
mockModule('../../src/services/applianceOracle.service.ts', { applianceOracleService: { recalculateLifespan: async () => undefined } });
mockModule('../../src/services/maintenancePrediction.service.ts', { generateForecast: async () => undefined });
mockModule('../../src/services/JobQueue.service.ts', { __esModule: true, default: { enqueueHomeDigitalTwinRefresh: async () => undefined } });
mockModule('../../src/services/decisionPlatform/decisionThreadService.ts', { markThreadStaleOnFactCorrection: async () => undefined });

const { InventoryService } = require('../../src/services/inventory.service.ts');
const { classifiedApplianceType } = require('../../src/services/majorAppliance.util.ts');
const service = new InventoryService();

const PREFIX = 'property_appliance::';
const item = (overrides = {}) => ({ id: 'item-1', category: 'APPLIANCE', tags: [], sourceHash: null, name: 'Fridge', roomId: 'room-1', isVerified: false, ...overrides });
function reset(existing, duplicate = null) { existingItem = existing; duplicateItem = duplicate; lookups.length = 0; updates.length = 0; }
const lastUpdate = () => updates[updates.length - 1];
const duplicateLookups = () => lookups.filter((where) => 'sourceHash' in where);

test('classifiedApplianceType reads the durable hash first, the derived tag second, and never the name', () => {
  assert.equal(classifiedApplianceType({ sourceHash: `${PREFIX}FRIDGE`, tags: ['APPLIANCE_TYPE:FREEZER'] }), 'FRIDGE');
  assert.equal(classifiedApplianceType({ sourceHash: null, tags: ['PROPERTY_APPLIANCE', 'APPLIANCE_TYPE:WASHER'] }), 'WASHER');
  assert.equal(classifiedApplianceType({ sourceHash: `${PREFIX}`, tags: ['APPLIANCE_TYPE:DRYER'] }), 'DRYER', 'an empty hash suffix falls back to the tag');
  for (const empty of [{}, { sourceHash: null, tags: [] }, { sourceHash: 'other::x', tags: null }, { tags: ['APPLIANCE_TYPE:'] }]) assert.equal(classifiedApplianceType(empty), null);
});

test('editing a classified appliance with tags: [] keeps its identity tags and does not touch its source hash', async () => {
  reset(item({ sourceHash: `${PREFIX}FRIDGE`, tags: ['PROPERTY_APPLIANCE', 'APPLIANCE_TYPE:FRIDGE'] }));
  await service.updateItem('property-1', 'item-1', { notes: 'Filter changed', tags: [] });
  assert.deepEqual([...lastUpdate().tags].sort(), ['APPLIANCE_TYPE:FRIDGE', 'PROPERTY_APPLIANCE']);
  assert.equal('sourceHash' in lastUpdate(), false, 'an item that already owns its hash does not rewrite it');
  assert.equal(duplicateLookups().length, 0, 'an item cannot conflict with itself, so no duplicate lookup');
});

test('renaming a classified appliance never reclassifies it, even to a name that implies another type or one another item owns', async () => {
  reset(item({ sourceHash: `${PREFIX}FRIDGE`, tags: ['PROPERTY_APPLIANCE', 'APPLIANCE_TYPE:FRIDGE'] }), { id: 'other-item' });
  await service.updateItem('property-1', 'item-1', { name: 'Basement freezer', tags: [] });
  assert.equal(lastUpdate().name, 'Basement freezer');
  assert.ok(lastUpdate().tags.includes('APPLIANCE_TYPE:FRIDGE'));
  assert.ok(!lastUpdate().tags.includes('APPLIANCE_TYPE:FREEZER'), 'the name is the weakest evidence and must not change the type');
  assert.equal('sourceHash' in lastUpdate(), false);
  assert.equal(duplicateLookups().length, 0, 'previously this raised a false "a freezer already exists" conflict');
});

test('a classified appliance whose type tag was already erased is healed on its next edit, without needing a tag in the patch', async () => {
  reset(item({ sourceHash: `${PREFIX}FRIDGE`, tags: [] }));
  await service.updateItem('property-1', 'item-1', { notes: 'n' });
  assert.deepEqual([...lastUpdate().tags].sort(), ['APPLIANCE_TYPE:FRIDGE', 'PROPERTY_APPLIANCE']);
});

test('unrelated tags are preserved for a classified appliance', async () => {
  reset(item({ sourceHash: `${PREFIX}FRIDGE`, tags: ['PROPERTY_APPLIANCE', 'APPLIANCE_TYPE:FRIDGE', 'IMPORTED_BATCH_7'] }));
  await service.updateItem('property-1', 'item-1', { tags: [] });
  assert.ok(lastUpdate().tags.includes('IMPORTED_BATCH_7'));
});

test('an unclassified appliance is classified from its name, and the duplicate rule still applies to that first classification', async () => {
  reset(item({ name: 'Dishwasher' }));
  await service.updateItem('property-1', 'item-1', { notes: 'n' });
  assert.equal(lastUpdate().sourceHash, `${PREFIX}DISHWASHER`);
  assert.deepEqual([...lastUpdate().tags].sort(), ['APPLIANCE_TYPE:DISHWASHER', 'PROPERTY_APPLIANCE']);
  assert.equal(duplicateLookups().length, 1);

  reset(item({ name: 'Dishwasher' }), { id: 'other-item' });
  await assert.rejects(service.updateItem('property-1', 'item-1', { notes: 'n' }), (error) => error.code === 'APPLIANCE_ALREADY_EXISTS' && error.statusCode === 409);
  assert.equal(updates.length, 0, 'nothing is written when the classification would duplicate another item');
});

test('a tag-only classification is honoured over the name and completed with its hash, without adding a second type tag', async () => {
  reset(item({ name: 'Dryer', tags: ['PROPERTY_APPLIANCE', 'APPLIANCE_TYPE:WASHER'], sourceHash: null }));
  await service.updateItem('property-1', 'item-1', { notes: 'n', tags: [] });
  assert.equal(lastUpdate().sourceHash, `${PREFIX}WASHER`, 'the classification the item carries wins over what its name suggests');
  assert.deepEqual(lastUpdate().tags.filter((tag) => tag.startsWith('APPLIANCE_TYPE:')), ['APPLIANCE_TYPE:WASHER'], 'exactly one type tag, and it is the item\'s own');
  // With nothing to change in the tags, none are written at all.
  reset(item({ name: 'Dryer', tags: ['PROPERTY_APPLIANCE', 'APPLIANCE_TYPE:WASHER'], sourceHash: `${PREFIX}WASHER` }));
  await service.updateItem('property-1', 'item-1', { notes: 'n' });
  assert.equal('tags' in lastUpdate(), false);
});

test('non-appliance items are unaffected: an incoming tag list still replaces theirs, exactly as before', async () => {
  reset(item({ category: 'HVAC', name: 'Furnace', tags: ['SOME_TAG'], sourceHash: null }));
  await service.updateItem('property-1', 'item-1', { notes: 'n', tags: [] });
  assert.deepEqual(lastUpdate().tags, []);
  assert.equal('sourceHash' in lastUpdate(), false);
  assert.equal(duplicateLookups().length, 0);
});

test('an appliance with no classification and no type-bearing name is left alone', async () => {
  reset(item({ name: 'Mystery gadget' }));
  await service.updateItem('property-1', 'item-1', { notes: 'n', tags: [] });
  assert.deepEqual(lastUpdate().tags, []);
  assert.equal('sourceHash' in lastUpdate(), false);
});
