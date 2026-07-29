const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Home Operations Slice 7: Status Board stops running its own local
// top-priority logic and instead links to whatever OperationalWorkItem
// already tracks an inventory item's condition, distinguishes unknown vs
// monitored vs actionable explicitly, and refreshes after verified outcomes
// instead of waiting up to 24h.

const workItems = new Map();
const homeItems = new Map();
const homeItemStatuses = new Map();

function reset() {
  workItems.clear();
  homeItems.clear();
  homeItemStatuses.clear();
}

const prismaMock = {
  operationalWorkItem: {
    findMany: async ({ where }) => {
      return [...workItems.values()].filter((w) => {
        if (where.subjectType && w.subjectType !== where.subjectType) return false;
        if (where.subjectId && w.subjectId !== where.subjectId) return false;
        if (where.state?.not && w.state === where.state.not) return false;
        return true;
      });
    },
  },
  homeItem: {
    findUnique: async ({ where }) => {
      if (where.inventoryItemId) {
        return [...homeItems.values()].find((h) => h.inventoryItemId === where.inventoryItemId) ?? null;
      }
      return homeItems.get(where.id) ?? null;
    },
  },
  homeItemStatus: {
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const [id, row] of homeItemStatuses.entries()) {
        if (row.homeItemId !== where.homeItemId) continue;
        homeItemStatuses.set(id, { ...row, ...data });
        count += 1;
      }
      return { count };
    },
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const {
  computeDataStatus,
  invalidateStatusForInventoryItem,
} = require('../../src/services/homeStatusBoard.service.ts');
const { findActiveWorkItemsForSubject } = require('../../src/modules/homeOperations/infrastructure/workItemRepository.ts');

function seedWorkItem(overrides = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  const row = { id, subjectType: 'INVENTORY_ITEM', subjectId: 'inv-1', state: 'ACCEPTED', updatedAt: new Date(), ...overrides, id };
  workItems.set(id, row);
  return row;
}

// ---- findActiveWorkItemsForSubject ----

test('returns work items matching the subject, excluding CLOSED', async () => {
  reset();
  seedWorkItem({ id: 'wi-1', state: 'ACCEPTED' });
  seedWorkItem({ id: 'wi-2', state: 'CLOSED' });
  seedWorkItem({ id: 'wi-3', subjectId: 'inv-other', state: 'ACCEPTED' });

  const result = await findActiveWorkItemsForSubject('INVENTORY_ITEM', 'inv-1');

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'wi-1');
});

test('returns an empty array when nothing tracks this subject', async () => {
  reset();
  const result = await findActiveWorkItemsForSubject('INVENTORY_ITEM', 'inv-none');
  assert.deepEqual(result, []);
});

// ---- computeDataStatus (pure) ----

test('needsInstallDateForPrediction always maps to UNKNOWN regardless of condition', () => {
  assert.equal(computeDataStatus(true, 'GOOD'), 'UNKNOWN');
});

test('MONITOR condition (with data present) maps to MONITORED', () => {
  assert.equal(computeDataStatus(false, 'MONITOR'), 'MONITORED');
});

test('ACTION_NEEDED condition maps to ACTIONABLE', () => {
  assert.equal(computeDataStatus(false, 'ACTION_NEEDED'), 'ACTIONABLE');
});

test('plain GOOD with data present has no distinct dataStatus', () => {
  assert.equal(computeDataStatus(false, 'GOOD'), null);
});

// ---- invalidateStatusForInventoryItem ----

test('resets computedAt to null for the matching HomeItemStatus row', async () => {
  reset();
  homeItems.set('home-item-1', { id: 'home-item-1', propertyId: 'property-1', inventoryItemId: 'inv-1' });
  homeItemStatuses.set('status-1', { id: 'status-1', homeItemId: 'home-item-1', computedAt: new Date(), computedCondition: 'GOOD' });

  await invalidateStatusForInventoryItem('property-1', 'inv-1');

  assert.equal(homeItemStatuses.get('status-1').computedAt, null);
});

test('is a silent no-op when the inventory item has no Status Board row yet', async () => {
  reset();
  await assert.doesNotReject(invalidateStatusForInventoryItem('property-1', 'inv-does-not-exist'));
});

test('does not touch a HomeItem belonging to a different property', async () => {
  reset();
  homeItems.set('home-item-1', { id: 'home-item-1', propertyId: 'property-OTHER', inventoryItemId: 'inv-1' });
  homeItemStatuses.set('status-1', { id: 'status-1', homeItemId: 'home-item-1', computedAt: new Date() });

  await invalidateStatusForInventoryItem('property-1', 'inv-1');

  assert.notEqual(homeItemStatuses.get('status-1').computedAt, null);
});

test('a lookup failure does not throw (best-effort)', async () => {
  reset();
  const original = prismaMock.homeItem.findUnique;
  prismaMock.homeItem.findUnique = async () => { throw new Error('db unavailable'); };
  try {
    await assert.doesNotReject(invalidateStatusForInventoryItem('property-1', 'inv-1'));
  } finally {
    prismaMock.homeItem.findUnique = original;
  }
});
