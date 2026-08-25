const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Home Intelligence Functional Completeness FRD Phase 7 (HI-SRC-002).

test('admin source-health route requires authenticate, MFA, ADMIN role, and WORKER_JOB_VIEW', () => {
  const routeSource = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/adminSourceHealth.routes.ts'),
    'utf8',
  );
  assert.match(
    routeSource,
    /router\.use\('\/admin\/source-health', authenticate, requireMfa, requireRole\(UserRole\.ADMIN\)\)/,
  );
  assert.match(routeSource, /router\.get\('\/admin\/source-health', requireCapability\('WORKER_JOB_VIEW'\), getSourceHealthHandler\)/);
});

test('the router is registered in src/index.ts', () => {
  const indexSource = fs.readFileSync(path.resolve(__dirname, '../../src/index.ts'), 'utf8');
  assert.match(indexSource, /import adminSourceHealthRoutes from '\.\/routes\/adminSourceHealth\.routes'/);
  assert.match(indexSource, /app\.use\('\/api', adminSourceHealthRoutes\)/);
});

// --- service layer, against a fake prisma (same require.cache-override
// pattern as adminIntelligenceRecompute.test.js) ---

const prismaMock = {
  radarSourceDefinition: {
    findMany: async ({ where }) => {
      assert.deepEqual(where, { isEnabled: true });
      return [
        { key: 'noaa-alerts', name: 'NOAA Alerts', health: { status: 'healthy', lastSuccessAt: new Date('2026-08-24T00:00:00Z'), lastAttemptAt: new Date('2026-08-24T00:00:00Z'), consecutiveFailures: 0, message: null } },
        { key: 'utility-outage-feed', name: 'Utility Outage Feed', health: { status: 'failed', lastSuccessAt: null, lastAttemptAt: new Date('2026-08-24T00:00:00Z'), consecutiveFailures: 5, message: 'connection refused' } },
        { key: 'never-polled-source', name: 'Never Polled Source', health: null },
      ];
    },
  },
  servicePriceBenchmarkSource: {
    findMany: async ({ where }) => {
      assert.deepEqual(where, { isActive: true });
      return [
        { sourceKey: 'hcp-index', name: 'HomeAdvisor Cost Index', health: { status: 'HEALTHY', lastHealthyAt: new Date('2026-08-24T00:00:00Z'), checkedAt: new Date('2026-08-24T00:00:00Z'), consecutiveFailures: 0 } },
      ];
    },
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const { getUnifiedSourceHealth } = require('../../src/services/intelligence/sourceHealthProjection.service.ts');

test('getUnifiedSourceHealth combines both domain health stores into one sorted, normalized list', async () => {
  const sources = await getUnifiedSourceHealth();
  assert.equal(sources.length, 4);
  // sorted by domain then sourceKey: HOME_EVENT_RADAR entries first
  assert.deepEqual(sources.map((s) => s.sourceKey), ['never-polled-source', 'noaa-alerts', 'utility-outage-feed', 'hcp-index']);
  const outage = sources.find((s) => s.sourceKey === 'utility-outage-feed');
  assert.equal(outage.status, 'UNHEALTHY');
  assert.equal(outage.consecutiveFailures, 5);
  const neverPolled = sources.find((s) => s.sourceKey === 'never-polled-source');
  assert.equal(neverPolled.status, 'UNKNOWN');
  const benchmark = sources.find((s) => s.sourceKey === 'hcp-index');
  assert.equal(benchmark.domain, 'SERVICE_PRICE_BENCHMARK');
  assert.equal(benchmark.status, 'HEALTHY');
});
