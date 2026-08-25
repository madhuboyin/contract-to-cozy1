const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

let findFirstResult = null;
let propertyChangeFailure = null;
const transactionCalls = [];
const propertyChangeCalls = [];
const mutationCalls = [];

const txMock = {
  inventoryItem: {
    create: async ({ data }) => {
      mutationCalls.push('create');
      return {
        id: 'item-created',
        sourceType: 'MANUAL',
        roomId: null,
        purchasedOn: null,
        purchaseCostCents: null,
        currency: 'USD',
        brand: null,
        model: null,
        upc: null,
        sku: null,
        ...data,
      };
    },
    update: async ({ where, data }) => {
      mutationCalls.push('update');
      return { id: where.id, propertyId: 'property-1', ...data };
    },
    delete: async ({ where }) => {
      mutationCalls.push('delete');
      return { id: where.id };
    },
  },
  document: {
    updateMany: async () => {
      mutationCalls.push('unlink-documents');
      return { count: 0 };
    },
  },
};

const prismaMock = {
  inventoryItem: {
    findFirst: async () => findFirstResult,
  },
  $transaction: async (callback) => {
    transactionCalls.push(callback);
    return callback(txMock);
  },
};

function mockModule(relativePath, exports) {
  const modulePath = require.resolve(relativePath);
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

mockModule('../../src/lib/prisma.ts', { prisma: prismaMock });
mockModule('../../src/propertyChanges/propertyChange.service.ts', {
  emitPropertyChangeWithTransaction: async (tx, input) => {
    assert.equal(tx, txMock, 'the PropertyChange must use the inventory mutation transaction');
    mutationCalls.push('emit-change');
    propertyChangeCalls.push(input);
    if (propertyChangeFailure) throw propertyChangeFailure;
    return { change: { id: `change-${propertyChangeCalls.length}`, ...input }, deduped: false };
  },
});
mockModule('../../src/services/analytics/index.ts', {
  analyticsEmitter: { track: () => undefined },
  AnalyticsEvent: { SYSTEM_ADDED: 'SYSTEM_ADDED', INVENTORY_ITEM_CREATED: 'INVENTORY_ITEM_CREATED' },
  AnalyticsModule: { PROPERTY: 'PROPERTY', INVENTORY: 'INVENTORY' },
  AnalyticsFeature: { PROPERTY_PROFILE: 'PROPERTY_PROFILE', INVENTORY_ITEM: 'INVENTORY_ITEM' },
});
mockModule('../../src/services/homeEvents/homeEvents.autogen.ts', {
  HomeEventsAutoGen: { onInventoryItemCreated: async () => undefined },
});
mockModule('../../src/services/applianceOracle.service.ts', {
  applianceOracleService: { recalculateLifespan: async () => undefined },
});
mockModule('../../src/services/maintenancePrediction.service.ts', {
  generateForecast: async () => undefined,
});
mockModule('../../src/services/JobQueue.service.ts', {
  __esModule: true,
  default: { enqueueHomeDigitalTwinRefresh: async () => undefined },
});
mockModule('../../src/services/decisionPlatform/decisionThreadService.ts', {
  markThreadStaleOnFactCorrection: async () => undefined,
});

const { InventoryService } = require('../../src/services/inventory.service.ts');
const service = new InventoryService();

function reset() {
  findFirstResult = null;
  propertyChangeFailure = null;
  transactionCalls.length = 0;
  propertyChangeCalls.length = 0;
  mutationCalls.length = 0;
}

function assertCanonicalInventoryChange(call, expected) {
  assert.equal(call.propertyId, 'property-1');
  assert.equal(call.sourceType, 'PROPERTY_FACT');
  assert.equal(call.sourceEntityId, expected.itemId);
  assert.match(call.sourceRevision, expected.revisionPattern);
  assert.equal(call.changeType, expected.changeType);
  assert.deepEqual(call.changedFactKeys, ['inventory.items']);
  assert.deepEqual(call.canonicalReferences, [
    { entityType: 'INVENTORY_ITEM', entityId: expected.itemId },
  ]);
  assert.equal(call.sourceHealth, 'CURRENT');
  assert.equal(call.signals.propertyEffectConfirmed, true);
}

test('createItem writes the item and durable recompute trigger in one transaction', async () => {
  reset();

  const item = await service.createItem('property-1', {
    name: 'Dining table',
    category: 'HVAC',
  }, 'user-1');

  assert.equal(item.id, 'item-created');
  assert.equal(transactionCalls.length, 1);
  assert.deepEqual(mutationCalls, ['create', 'emit-change']);
  assert.equal(propertyChangeCalls.length, 1);
  assertCanonicalInventoryChange(propertyChangeCalls[0], {
    itemId: 'item-created',
    revisionPattern: /^created:[0-9a-f-]{36}$/,
    changeType: 'SOURCE_RECORD_CREATED',
  });
  assert.equal(propertyChangeCalls[0].signals.lifecycleAdvanced, true);
});

test('updateItem writes the revised item and durable recompute trigger in one transaction', async () => {
  reset();
  findFirstResult = {
    id: 'item-1',
    category: 'HVAC',
    tags: [],
    sourceHash: null,
    name: 'Furnace',
    roomId: null,
    isVerified: false,
  };

  const item = await service.updateItem('property-1', 'item-1', { notes: 'Filter changed' });

  assert.equal(item.notes, 'Filter changed');
  assert.equal(transactionCalls.length, 1);
  assert.deepEqual(mutationCalls, ['update', 'emit-change']);
  assert.equal(propertyChangeCalls.length, 1);
  assertCanonicalInventoryChange(propertyChangeCalls[0], {
    itemId: 'item-1',
    revisionPattern: /^revised:[0-9a-f-]{36}$/,
    changeType: 'PROPERTY_FACT_CHANGED',
  });
  assert.equal(propertyChangeCalls[0].signals.lifecycleAdvanced, false);
});

test('deleteItem unlinks documents, deletes the item, and emits in one transaction', async () => {
  reset();
  findFirstResult = { id: 'item-1' };

  await service.deleteItem('property-1', 'item-1');

  assert.equal(transactionCalls.length, 1);
  assert.deepEqual(mutationCalls, ['unlink-documents', 'delete', 'emit-change']);
  assert.equal(propertyChangeCalls.length, 1);
  assertCanonicalInventoryChange(propertyChangeCalls[0], {
    itemId: 'item-1',
    revisionPattern: /^deleted:[0-9a-f-]{36}$/,
    changeType: 'SOURCE_LIFECYCLE_CHANGED',
  });
  assert.equal(propertyChangeCalls[0].signals.lifecycleAdvanced, true);
});

test('a PropertyChange failure rejects the inventory mutation transaction', async () => {
  reset();
  findFirstResult = {
    id: 'item-1',
    category: 'HVAC',
    tags: [],
    sourceHash: null,
    name: 'Furnace',
    roomId: null,
    isVerified: false,
  };
  propertyChangeFailure = new Error('outbox unavailable');

  await assert.rejects(
    service.updateItem('property-1', 'item-1', { notes: 'New note' }),
    /outbox unavailable/,
  );
  assert.deepEqual(mutationCalls, ['update', 'emit-change']);
});
