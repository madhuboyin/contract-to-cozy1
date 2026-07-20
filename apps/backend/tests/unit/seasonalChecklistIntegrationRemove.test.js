// apps/backend/tests/unit/seasonalChecklistIntegrationRemove.test.js
//
// W3 (maintenance/seasonal): removeSeasonalTaskFromMaintenance must mark
// autoPromotionSkipped so the broadened read-time self-heal
// (SeasonalChecklistService.getSeasonalChecklist) doesn't silently
// recreate a task the homeowner explicitly removed.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService({ seasonalItem, access = { role: 'OWNER' } }) {
  const itemUpdateCalls = [];
  const taskUpdateCalls = [];
  const prismaMock = {
    seasonalChecklistItem: {
      findUnique: async () => seasonalItem,
      update: async (args) => {
        itemUpdateCalls.push(args);
        return { id: seasonalItem.id, ...args.data };
      },
    },
    propertyMaintenanceTask: {
      update: async (args) => {
        taskUpdateCalls.push(args);
        return { id: args.where.id, ...args.data };
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const accessPath = require.resolve('../../src/services/propertyAccess.service.ts');
  require.cache[accessPath] = {
    id: accessPath,
    filename: accessPath,
    loaded: true,
    exports: {
      resolvePropertyAccess: async () => access,
      ROLE_RANK: { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 },
    },
  };

  const servicePath = require.resolve('../../src/services/seasonalChecklistIntegration.service.ts');
  delete require.cache[servicePath];
  return {
    ...require(servicePath),
    getItemUpdateCalls: () => itemUpdateCalls,
    getTaskUpdateCalls: () => taskUpdateCalls,
  };
}

test('removing a task sets autoPromotionSkipped so self-heal will not recreate it', async () => {
  const { removeSeasonalTaskFromMaintenance, getItemUpdateCalls, getTaskUpdateCalls } = loadService({
    seasonalItem: { id: 'item-1', propertyId: 'property-1', maintenanceTask: { id: 'task-1' } },
  });

  const result = await removeSeasonalTaskFromMaintenance('user-1', 'item-1');

  assert.equal(result.success, true);
  assert.equal(getItemUpdateCalls().length, 1);
  assert.deepEqual(getItemUpdateCalls()[0].data, {
    status: 'RECOMMENDED',
    addedAt: null,
    autoPromotionSkipped: true,
  });
  assert.equal(getTaskUpdateCalls().length, 1);
  assert.equal(getTaskUpdateCalls()[0].data.seasonalChecklistItemId, null);
});

test('no-ops when there is no linked task to remove', async () => {
  const { removeSeasonalTaskFromMaintenance, getItemUpdateCalls } = loadService({
    seasonalItem: { id: 'item-1', propertyId: 'property-1', maintenanceTask: null },
  });

  const result = await removeSeasonalTaskFromMaintenance('user-1', 'item-1');

  assert.equal(result.success, false);
  assert.equal(getItemUpdateCalls().length, 0);
});

test('denies removal for a viewer (below CONTRIBUTOR)', async () => {
  const { removeSeasonalTaskFromMaintenance } = loadService({
    seasonalItem: { id: 'item-1', propertyId: 'property-1', maintenanceTask: { id: 'task-1' } },
    access: { role: 'VIEWER' },
  });

  await assert.rejects(() => removeSeasonalTaskFromMaintenance('user-1', 'item-1'), /does not have access/);
});
