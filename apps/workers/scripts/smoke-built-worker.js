#!/usr/bin/env node
// Boot/import smoke test for the BUILT worker (docs/architecture/ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md section 6, the worker gate). Run it after the
// production-style build, in the same order the Dockerfile uses:
//   (cd apps/backend && npm run build)
//   (cd apps/workers && node scripts/build-worker-backend-overrides.js ../backend/dist ./stubs && npx tsc --project tsconfig.docker.json && npx tsc-alias -p tsconfig.docker.json)
//   (cd apps/workers && node scripts/smoke-built-worker.js)
// It links @worker-shared to backend/dist the way the image does (and removes the link again if it made it), imports the built domain-events job, checks
// the production stubs are in effect, and pushes a DIY_PROJECT_COMPLETED event with a malformed payload through the DEFAULT handler path, which must
// dead-letter at once. It needs no database and no network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://x@127.0.0.1:1/scratch_smoke';
process.env.NODE_ENV = 'production';

const workersRoot = path.resolve(__dirname, '..');
const link = path.join(workersRoot, 'node_modules/@worker-shared');
const backendDist = path.resolve(workersRoot, '../backend/dist');
const builtJob = path.join(workersRoot, 'dist/jobs/processDomainEvents.job.js');
for (const required of [backendDist, builtJob]) if (!fs.existsSync(required)) { console.error(`SMOKE FAILED: ${required} does not exist; build first (see the header).`); process.exit(1); }

let linked = false;
if (!fs.existsSync(link)) { fs.symlinkSync(backendDist, link); linked = true; }
const cleanup = () => { if (linked) { try { fs.unlinkSync(link); } catch { /* already gone */ } } };

(async () => {
  const resolved = require.resolve('@worker-shared/services/diy/diyCompletionEffectsAdapters', { paths: [workersRoot] });
  assert.ok(resolved.includes('/backend/dist/'), resolved);
  const notification = fs.readFileSync(require.resolve('@worker-shared/services/notification.service', { paths: [workersRoot] }), 'utf8');
  assert.ok(notification.includes('workerPersisted'), 'the worker notification override is in effect (the production stubs are applied)');
  const job = require(builtJob);
  const writes = [];
  const event = { id: 'ev-smoke', type: 'DIY_PROJECT_COMPLETED', status: 'PENDING', attempts: 0, availableAt: new Date(0), updatedAt: new Date(0), payload: { projectId: '' } };
  const deps = {
    prisma: { domainEvent: { findMany: async () => [event], updateMany: async (args) => { writes.push(args); return { count: 1 }; } }, notification: {}, intelligenceRecomputeRun: {}, intelligenceRecomputeTarget: {} },
    notificationService: { create: async () => ({}) },
  };
  const result = await job.processDomainEventsJob({ batchSize: 1 }, deps);
  const failure = writes.find((write) => ['FAILED', 'DEAD_LETTER'].includes(write.data?.status));
  assert.deepEqual([result.failed, result.deadLettered], [0, 1]);
  assert.match(failure.data.lastError, /missing required fields/);
  console.log('SMOKE OK: the built worker job imports, the production stubs are applied, and the default DIY handler path dead-letters a malformed event at once.');
  cleanup();
  process.exit(0);
})().catch((error) => { console.error('SMOKE FAILED', error); cleanup(); process.exit(1); });
