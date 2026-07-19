// apps/workers/tests/unit/registryHandlerParity.test.js
//
// WKR-006: registry/handler parity was previously advisory only — a
// mismatch between JOB_REGISTRY (apps/backend/src/config/workerJobRegistry.ts)
// and CRON_HANDLERS (apps/workers/src/worker.ts) logged a startup warning and
// nothing else, so drift could reach production undetected. This is an
// executable contract test for that parity.
//
// worker.ts has real side effects at module load (connects to Redis/Postgres,
// starts BullMQ workers, schedules cron jobs), so it must not be `require`d
// directly in a test — this parses it as text instead, the same technique
// already used by tests/unit/phase2HomeActions.test.js for the frontend
// route-audit script.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { JOB_REGISTRY } = require('../../../backend/src/config/workerJobRegistry.ts');

function extractCronHandlerKeys() {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/worker.ts'), 'utf8');
  const start = source.indexOf('const CRON_HANDLERS: Record<string, () => Promise<void>> = {');
  assert.notEqual(start, -1, 'Could not locate CRON_HANDLERS declaration in worker.ts');
  const end = source.indexOf('\n};', start);
  assert.notEqual(end, -1, 'Could not locate end of CRON_HANDLERS declaration in worker.ts');
  const block = source.slice(start, end);
  return [...block.matchAll(/^\s*'([a-z0-9-]+)':/gm)].map((m) => m[1]);
}

test('every JOB_REGISTRY cron entry has a CRON_HANDLERS entry and vice versa', () => {
  const registryCronKeys = new Set(
    JOB_REGISTRY.filter((j) => j.type === 'cron' && j.cronExpression).map((j) => j.key),
  );
  const handlerKeys = new Set(extractCronHandlerKeys());

  const missingHandler = [...registryCronKeys].filter((k) => !handlerKeys.has(k));
  const missingRegistry = [...handlerKeys].filter((k) => !registryCronKeys.has(k));

  assert.deepEqual(missingHandler, [], `Registry cron job(s) with no CRON_HANDLERS entry: ${missingHandler.join(', ')}`);
  assert.deepEqual(missingRegistry, [], `CRON_HANDLERS entry(ies) with no registry entry: ${missingRegistry.join(', ')}`);
});

test('every JOB_REGISTRY entry declares worker execution policy metadata', () => {
  for (const job of JOB_REGISTRY) {
    assert.ok(job.impact, `${job.key} is missing impact`);
    assert.ok(job.customerJob, `${job.key} is missing customerJob`);
    assert.equal(typeof job.defaultEnabledInBeta, 'boolean', `${job.key}.defaultEnabledInBeta must be boolean`);
    assert.equal(typeof job.supportsDryRun, 'boolean', `${job.key}.supportsDryRun must be boolean`);
    assert.equal(typeof job.supportsPropertyScope, 'boolean', `${job.key}.supportsPropertyScope must be boolean`);
  }
});

test('RUNNER_REGISTRY covers every runner file under src/runners', () => {
  const { RUNNER_REGISTRY } = require('../../../backend/src/config/workerJobRegistry.ts');
  const runnerDir = path.resolve(__dirname, '../../src/runners');
  const runnerFiles = fs.readdirSync(runnerDir).filter((f) => f.endsWith('.ts'));
  assert.equal(
    RUNNER_REGISTRY.length,
    runnerFiles.length,
    `RUNNER_REGISTRY has ${RUNNER_REGISTRY.length} entries but src/runners has ${runnerFiles.length} files: ${runnerFiles.join(', ')}`,
  );
  for (const runner of RUNNER_REGISTRY) {
    assert.ok(runner.impact, `${runner.key} is missing impact`);
    assert.ok(runner.customerJob, `${runner.key} is missing customerJob`);
  }
});
