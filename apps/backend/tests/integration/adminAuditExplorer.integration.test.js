const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createHarness() {
  const state = {
    logs: [
      { id: 'a-1', userId: 'admin-1', action: 'GRANT_CAPABILITY', entityType: 'ADMIN_CAPABILITY_GRANT', entityId: 'g-1', requestId: 'r-1', createdAt: new Date('2026-07-01T10:00:00Z') },
      { id: 'a-2', userId: 'admin-1', action: 'ADMIN_REVOKE_USER_SESSIONS', entityType: 'USER', entityId: 'user-1', requestId: 'r-2', createdAt: new Date('2026-07-02T10:00:00Z') },
      { id: 'a-3', userId: 'admin-2', action: 'ADMIN_CHANGE_USER_STATUS', entityType: 'USER', entityId: 'user-2', requestId: 'r-3', createdAt: new Date('2026-07-03T10:00:00Z') },
    ],
  };

  const prisma = {
    auditLog: {
      findMany: async ({ where, orderBy, take }) => {
        let results = state.logs.filter((log) => {
          if (where.userId && log.userId !== where.userId) return false;
          if (where.entityType && log.entityType !== where.entityType) return false;
          if (where.entityId && log.entityId !== where.entityId) return false;
          if (where.action && log.action !== where.action) return false;
          if (where.requestId && log.requestId !== where.requestId) return false;
          if (where.createdAt?.gte && log.createdAt < where.createdAt.gte) return false;
          if (where.createdAt?.lte && log.createdAt > where.createdAt.lte) return false;
          if (where.createdAt?.lt && !(log.createdAt < where.createdAt.lt)) return false;
          return true;
        });
        if (orderBy?.createdAt === 'desc') results = [...results].sort((a, b) => b.createdAt - a.createdAt);
        if (take) results = results.slice(0, take);
        return results.map((r) => ({ ...r }));
      },
    },
  };

  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma } };

  const servicePath = require.resolve('../../src/services/adminAuditExplorer.service.ts');
  delete require.cache[servicePath];
  const { queryAuditLog } = require('../../src/services/adminAuditExplorer.service.ts');

  return { state, queryAuditLog };
}

test('queryAuditLog with no filters returns everything, newest first', async () => {
  const { queryAuditLog } = createHarness();
  const result = await queryAuditLog({});
  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].id, 'a-3');
  assert.equal(result.nextCursor, null);
});

test('queryAuditLog filters by actorId and entityType', async () => {
  const { queryAuditLog } = createHarness();
  const result = await queryAuditLog({ actorId: 'admin-1', entityType: 'USER' });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, 'a-2');
});

test('queryAuditLog filters by date range', async () => {
  const { queryAuditLog } = createHarness();
  const result = await queryAuditLog({ from: new Date('2026-07-02T00:00:00Z'), to: new Date('2026-07-02T23:59:59Z') });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, 'a-2');
});

test('queryAuditLog paginates with a limit and returns a cursor when the page is full', async () => {
  const { queryAuditLog } = createHarness();
  const page1 = await queryAuditLog({ limit: 2 });
  assert.equal(page1.items.length, 2);
  assert.ok(page1.nextCursor instanceof Date);

  const page2 = await queryAuditLog({ limit: 2, before: page1.nextCursor });
  assert.equal(page2.items.length, 1);
  assert.equal(page2.items[0].id, 'a-1');
  assert.equal(page2.nextCursor, null);
});
