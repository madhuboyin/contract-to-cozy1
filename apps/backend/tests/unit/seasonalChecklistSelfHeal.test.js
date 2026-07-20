// apps/backend/tests/unit/seasonalChecklistSelfHeal.test.js
//
// W3 (maintenance/seasonal): SeasonalChecklistService.getSeasonalChecklist's
// read-time self-heal was broadened to also promote RECOMMENDED items with
// no linked PropertyMaintenanceTask (not just legacy ADDED-but-unlinked
// items), since every generated seasonal item is now a canonical task by
// default. autoPromotionSkipped must stop that self-heal from silently
// recreating a task a homeowner explicitly removed via "Remove".

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService({ items, addImpl }) {
  const addCalls = [];
  const integrationPath = require.resolve('../../src/services/seasonalChecklistIntegration.service.ts');
  require.cache[integrationPath] = {
    id: integrationPath,
    filename: integrationPath,
    loaded: true,
    exports: {
      addSeasonalTaskToMaintenance: async (userId, itemId) => {
        addCalls.push({ userId, itemId });
        if (addImpl) return addImpl(itemId);
        return { success: true };
      },
    },
  };

  let fetchCount = 0;
  const prismaMock = {
    seasonalChecklist: {
      findFirst: async () => {
        fetchCount += 1;
        return {
          id: 'checklist-1',
          status: 'PENDING',
          property: { id: 'property-1', name: null, address: '1 Main St', city: 'Springfield', state: 'IL' },
          items,
        };
      },
      // Exercised by syncSeasonalChecklistStatus, called unconditionally at
      // the end of getSeasonalChecklist — not under test here, just needs
      // to be a safe no-op.
      findUnique: async () => ({ id: 'checklist-1', status: 'PENDING', items: items.map((i) => ({ status: i.status })) }),
      update: async () => ({}),
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const servicePath = require.resolve('../../src/services/seasonalChecklist.service.ts');
  delete require.cache[servicePath];
  return {
    service: require(servicePath).SeasonalChecklistService,
    getAddCalls: () => addCalls,
    getFetchCount: () => fetchCount,
  };
}

function item(overrides = {}) {
  return {
    id: 'item-1',
    status: 'RECOMMENDED',
    priority: 'RECOMMENDED',
    autoPromotionSkipped: false,
    maintenanceTask: null,
    ...overrides,
  };
}

test('self-heals a RECOMMENDED item with no linked task (pre-existing checklist, never promoted)', async () => {
  const { service, getAddCalls, getFetchCount } = loadService({ items: [item()] });

  await service.getSeasonalChecklist('checklist-1', 'user-1');

  assert.equal(getAddCalls().length, 1);
  assert.equal(getAddCalls()[0].itemId, 'item-1');
  assert.equal(getFetchCount(), 2); // initial fetch + re-fetch after healing
});

test('self-heals a legacy ADDED item with no linked task', async () => {
  const { service, getAddCalls } = loadService({ items: [item({ status: 'ADDED' })] });

  await service.getSeasonalChecklist('checklist-1', 'user-1');

  assert.equal(getAddCalls().length, 1);
});

test('does NOT self-heal an item a homeowner explicitly removed (autoPromotionSkipped)', async () => {
  const { service, getAddCalls, getFetchCount } = loadService({
    items: [item({ autoPromotionSkipped: true })],
  });

  await service.getSeasonalChecklist('checklist-1', 'user-1');

  assert.equal(getAddCalls().length, 0);
  assert.equal(getFetchCount(), 1); // no re-fetch — nothing to heal
});

test('does not touch items that already have a linked task', async () => {
  const { service, getAddCalls } = loadService({
    items: [item({ status: 'ADDED', maintenanceTask: { id: 'task-1', status: 'PENDING' } })],
  });

  await service.getSeasonalChecklist('checklist-1', 'user-1');

  assert.equal(getAddCalls().length, 0);
});

test('does not touch DISMISSED or COMPLETED items even without a linked task', async () => {
  const { service, getAddCalls } = loadService({
    items: [item({ status: 'DISMISSED' }), item({ id: 'item-2', status: 'COMPLETED' })],
  });

  await service.getSeasonalChecklist('checklist-1', 'user-1');

  assert.equal(getAddCalls().length, 0);
});
