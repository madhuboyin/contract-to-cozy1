// apps/backend/tests/unit/propertyMaintenanceTaskFromSeasonalItem.test.js
//
// W3 (maintenance/seasonal): createFromSeasonalItemInternal is the shared
// core behind both the user-facing "Add to Checklist" click
// (createFromSeasonalItem, which layers an ownership check on top) and the
// new generation-time auto-promotion in seasonalChecklistGeneration.job.ts.
// It must not require an acting user — the generation job runs as a
// system process with no one to check ownership against.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService({ seasonalItem, existingCreateShouldFail = false }) {
  const createCalls = [];
  const itemUpdateCalls = [];
  const prismaMock = {
    seasonalChecklistItem: {
      findUnique: async () => seasonalItem,
      update: async (args) => {
        itemUpdateCalls.push(args);
        return { id: seasonalItem.id, ...args.data };
      },
    },
    propertyMaintenanceTask: {
      create: async (args) => {
        createCalls.push(args);
        if (existingCreateShouldFail) throw new Error('db unavailable');
        return { id: 'task-1', ...args.data };
      },
    },
    serviceCategoryConfig: {
      findUnique: async () => null, // no config configured -> validateServiceCategory rejects, code falls back to null
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const servicePath = require.resolve('../../src/services/PropertyMaintenanceTask.service.ts');
  delete require.cache[servicePath];
  return {
    service: require(servicePath).PropertyMaintenanceTaskService,
    getCreateCalls: () => createCalls,
    getItemUpdateCalls: () => itemUpdateCalls,
  };
}

function seasonalItem(overrides = {}) {
  return {
    id: 'item-1',
    propertyId: 'property-1',
    title: 'Clean gutters',
    description: 'Clear debris before fall storms',
    priority: 'CRITICAL',
    recommendedDate: new Date('2026-09-01T00:00:00.000Z'),
    seasonalTaskTemplate: { serviceCategory: null },
    seasonalChecklist: { season: 'FALL' },
    maintenanceTask: null,
    ...overrides,
  };
}

test('creates a canonical PropertyMaintenanceTask with no acting user required', async () => {
  const { service, getCreateCalls, getItemUpdateCalls } = loadService({ seasonalItem: seasonalItem() });

  const task = await service.createFromSeasonalItemInternal('property-1', 'item-1');

  assert.equal(task.id, 'task-1');
  const call = getCreateCalls()[0].data;
  assert.equal(call.propertyId, 'property-1');
  assert.equal(call.source, 'SEASONAL');
  assert.equal(call.isSeasonal, true);
  assert.equal(call.seasonalChecklistItemId, 'item-1');

  // Marks the item ADDED and clears any prior explicit-removal marker.
  assert.equal(getItemUpdateCalls().length, 1);
  assert.equal(getItemUpdateCalls()[0].data.status, 'ADDED');
  assert.equal(getItemUpdateCalls()[0].data.autoPromotionSkipped, false);
});

test('rejects if the seasonal item does not belong to the given property', async () => {
  const { service } = loadService({ seasonalItem: seasonalItem({ propertyId: 'other-property' }) });

  await assert.rejects(
    () => service.createFromSeasonalItemInternal('property-1', 'item-1'),
    /does not belong to this property/,
  );
});

test('rejects if a task already exists for this seasonal item (idempotency guard)', async () => {
  const { service, getCreateCalls } = loadService({
    seasonalItem: seasonalItem({ maintenanceTask: { id: 'existing-task' } }),
  });

  await assert.rejects(
    () => service.createFromSeasonalItemInternal('property-1', 'item-1'),
    /Task already created/,
  );
  assert.equal(getCreateCalls().length, 0);
});

test('propagates a database failure instead of silently swallowing it', async () => {
  const { service } = loadService({ seasonalItem: seasonalItem(), existingCreateShouldFail: true });

  await assert.rejects(() => service.createFromSeasonalItemInternal('property-1', 'item-1'), /db unavailable/);
});
