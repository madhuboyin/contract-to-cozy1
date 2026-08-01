const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Item #24 (§15 "Admin tooling can inspect one work item's full source/
// execution/outcome graph"). Unlike the household-scoped detail route,
// this one is ADMIN-only and property-agnostic.

test('admin home-operations work-item route requires authenticate, MFA, ADMIN role, and PROPERTY_SUPPORT_VIEW', () => {
  const routeSource = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/adminHomeOperations.routes.ts'),
    'utf8',
  );
  assert.match(
    routeSource,
    /router\.use\('\/admin\/home-operations', authenticate, requireMfa, requireRole\(UserRole\.ADMIN\)\)/,
  );
  assert.match(routeSource, /'\/admin\/home-operations\/work-items\/:workItemId'/);
  assert.match(routeSource, /requireCapability\('PROPERTY_SUPPORT_VIEW'\)/);
  assert.match(routeSource, /getAdminWorkItemDetailHandler/);
});

const workItems = new Map();

const prismaMock = {
  operationalWorkItem: {
    findUnique: async ({ where }) => workItems.get(where.id) ?? null,
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const { getAdminWorkItemDetail, AdminHomeOperationsError } = require('../../src/services/adminHomeOperations.service.ts');

test('getAdminWorkItemDetail returns the full graph for an existing work item, regardless of household membership', async () => {
  workItems.set('wi-1', {
    id: 'wi-1',
    propertyId: 'property-1',
    state: 'ACCEPTED',
    sources: [{ id: 'src-1' }],
    executions: [{ id: 'exec-1' }],
    evidence: [{ id: 'ev-1' }],
    watchers: [{ id: 'watch-1' }],
    events: [{ id: 'event-1', eventType: 'WORK_ACCEPTED' }],
  });

  const detail = await getAdminWorkItemDetail('wi-1');
  assert.equal(detail.id, 'wi-1');
  assert.equal(detail.sources.length, 1);
  assert.equal(detail.executions.length, 1);
  assert.equal(detail.evidence.length, 1);
  assert.equal(detail.watchers.length, 1);
  assert.equal(detail.events.length, 1, 'the admin graph must include event history, unlike the household-facing getWorkItemGraph');
});

test('getAdminWorkItemDetail throws a typed WORK_ITEM_NOT_FOUND error for a missing id', async () => {
  await assert.rejects(
    () => getAdminWorkItemDetail('does-not-exist'),
    (err) => {
      assert.ok(err instanceof AdminHomeOperationsError);
      assert.equal(err.code, 'WORK_ITEM_NOT_FOUND');
      return true;
    },
  );
});
