const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

require('ts-node/register');

// Home Intelligence Functional Completeness FRD §15 Phase 2 work item 7 —
// "add admin manual full refresh and failed-target retry."

test('admin intelligence-recompute routes require authenticate, MFA, ADMIN role, and the right capability per route', () => {
  const routeSource = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/adminIntelligenceRecompute.routes.ts'),
    'utf8',
  );
  assert.match(
    routeSource,
    /router\.use\('\/admin\/intelligence-recompute', authenticate, requireMfa, requireRole\(UserRole\.ADMIN\)\)/,
  );
  assert.match(routeSource, /'\/admin\/intelligence-recompute\/properties\/:propertyId\/refresh-state'/);
  assert.match(routeSource, /'\/admin\/intelligence-recompute\/properties\/:propertyId\/refresh'/);
  assert.match(routeSource, /'\/admin\/intelligence-recompute\/runs\/:runId\/targets\/:targetId\/retry'/);
  assert.match(routeSource, /requireCapability\('WORKER_JOB_VIEW'\)/);
  const triggerCount = (routeSource.match(/requireCapability\('WORKER_JOB_TRIGGER'\)/g) || []).length;
  assert.equal(triggerCount, 2, 'both the manual-refresh and retry routes must require WORKER_JOB_TRIGGER');
});

test('the router is registered in src/index.ts', () => {
  const indexSource = fs.readFileSync(path.resolve(__dirname, '../../src/index.ts'), 'utf8');
  assert.match(indexSource, /import adminIntelligenceRecomputeRoutes from '\.\/routes\/adminIntelligenceRecompute\.routes'/);
  assert.match(indexSource, /app\.use\('\/api', adminIntelligenceRecomputeRoutes\)/);
});

// --- service layer, against a fake prisma (same require.cache-override
// pattern as adminHomeOperations.test.js) ---

const properties = new Map();
const domainEvents = new Map();
const recomputeTargets = new Map();
const recomputeRuns = new Map();

const prismaMock = {
  property: {
    findUnique: async ({ where }) => properties.get(where.id) ?? null,
  },
  domainEvent: {
    findUnique: async ({ where }) => {
      if (where.idempotencyKey) {
        return [...domainEvents.values()].find((e) => e.idempotencyKey === where.idempotencyKey) ?? null;
      }
      return null;
    },
    create: async ({ data }) => {
      const row = { id: crypto.randomUUID(), status: 'PENDING', ...data };
      domainEvents.set(row.id, row);
      return row;
    },
  },
  intelligenceRecomputeTarget: {
    findUnique: async ({ where }) => recomputeTargets.get(where.id) ?? null,
  },
  intelligenceRecomputeRun: {
    findFirst: async ({ where }) => {
      const matches = [...recomputeRuns.values()].filter((r) => r.propertyId === where.propertyId);
      matches.sort((a, b) => b.requestedAt - a.requestedAt);
      return matches[0] ?? null;
    },
    findMany: async ({ where }) => {
      const matches = [...recomputeRuns.values()].filter((r) => r.propertyId === where.propertyId);
      matches.sort((a, b) => b.requestedAt - a.requestedAt);
      return matches.slice(0, 10);
    },
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const {
  triggerManualRefresh,
  retryFailedTarget,
  getAdminPropertyRefreshState,
  AdminIntelligenceRecomputeError,
} = require('../../src/services/adminIntelligenceRecompute.service.ts');

test('triggerManualRefresh emits a MANUAL_REFRESH recompute request for an existing property', async () => {
  properties.set('property-1', { id: 'property-1' });
  const result = await triggerManualRefresh('property-1');
  assert.equal(result.requested, true);
  const event = domainEvents.get(result.eventId);
  assert.equal(event.type, 'PROPERTY_INTELLIGENCE_RECOMPUTE_REQUESTED');
  assert.equal(event.payload.triggerType, 'MANUAL_REFRESH');
  assert.equal(event.payload.propertyId, 'property-1');
});

test('triggerManualRefresh throws a typed PROPERTY_NOT_FOUND error for a missing property', async () => {
  await assert.rejects(
    () => triggerManualRefresh('does-not-exist'),
    (err) => {
      assert.ok(err instanceof AdminIntelligenceRecomputeError);
      assert.equal(err.code, 'PROPERTY_NOT_FOUND');
      return true;
    },
  );
});

test('retryFailedTarget emits a retry request for a FAILED target', async () => {
  recomputeTargets.set('target-1', { id: 'target-1', recomputeRunId: 'run-1', status: 'FAILED', attempts: 2 });
  const result = await retryFailedTarget('run-1', 'target-1');
  assert.equal(result.requested, true);
  const event = domainEvents.get(result.eventId);
  assert.equal(event.type, 'PROPERTY_INTELLIGENCE_RECOMPUTE_RETRY_REQUESTED');
  assert.equal(event.payload.targetId, 'target-1');
  assert.equal(event.payload.recomputeRunId, 'run-1');
});

test('retryFailedTarget throws TARGET_NOT_FOUND for a target belonging to a different run', async () => {
  recomputeTargets.set('target-2', { id: 'target-2', recomputeRunId: 'run-1', status: 'FAILED', attempts: 0 });
  await assert.rejects(
    () => retryFailedTarget('wrong-run', 'target-2'),
    (err) => {
      assert.equal(err.code, 'TARGET_NOT_FOUND');
      return true;
    },
  );
});

test('retryFailedTarget throws TARGET_NOT_FAILED for a non-FAILED target', async () => {
  recomputeTargets.set('target-3', { id: 'target-3', recomputeRunId: 'run-1', status: 'SUCCEEDED', attempts: 1 });
  await assert.rejects(
    () => retryFailedTarget('run-1', 'target-3'),
    (err) => {
      assert.equal(err.code, 'TARGET_NOT_FAILED');
      return true;
    },
  );
});

test('getAdminPropertyRefreshState reports UNKNOWN with no runs, and the latest run\'s status once one exists', async () => {
  properties.set('property-2', { id: 'property-2' });
  const before = await getAdminPropertyRefreshState('property-2');
  assert.equal(before.state, 'UNKNOWN');
  assert.deepEqual(before.recentRuns, []);

  recomputeRuns.set('run-2', { id: 'run-2', propertyId: 'property-2', status: 'PARTIAL', requestedAt: new Date() });
  const after = await getAdminPropertyRefreshState('property-2');
  assert.equal(after.state, 'PARTIALLY_REFRESHED');
  assert.equal(after.recentRuns.length, 1);
});

test('getAdminPropertyRefreshState throws PROPERTY_NOT_FOUND for a missing property', async () => {
  await assert.rejects(
    () => getAdminPropertyRefreshState('does-not-exist'),
    (err) => {
      assert.equal(err.code, 'PROPERTY_NOT_FOUND');
      return true;
    },
  );
});
