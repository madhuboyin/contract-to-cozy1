// apps/workers/tests/unit/sharedDataBackfillJobDryRun.test.js
//
// W4 item 8: dry-run contract test. shared-data-backfill is the first job
// wired end-to-end for manual dry-run (registry supportsDryRun: true) — this
// asserts the actual contract: a dryRun request must reach the underlying
// service's dryRun flag unchanged, must never silently default to a real
// run, and the scheduled/no-opts call path (the daily cron tick) must still
// default to a real run so this feature can't accidentally turn the
// production sweep into a permanent no-op.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { runSharedDataBackfillJob } = require('../../src/jobs/sharedDataBackfill.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ summary }) {
  const calls = { runBackfillArgs: null };
  const deps = {
    sharedDataBackfillService: {
      runBackfill: async (args) => {
        calls.runBackfillArgs = args;
        return summary;
      },
    },
    logger: noopLogger,
  };
  return { deps, calls };
}

const BASE_SUMMARY = (dryRun) => ({
  dryRun,
  processedProperties: 3,
  skippedProperties: 1,
  erroredProperties: 0,
  totalPropertiesConsidered: 4,
});

test('dry run: opts.dryRun=true is passed through to the service unchanged', async () => {
  const { deps, calls } = fakeDeps({ summary: BASE_SUMMARY(true) });

  const result = await runSharedDataBackfillJob({ dryRun: true }, deps);

  assert.equal(calls.runBackfillArgs.dryRun, true);
  assert.equal(result.dryRun, true);
  // The contract: dry-run still reports what it would have done, it just
  // must not be silently swapped for a no-op zeroed-out result.
  assert.equal(result.processedProperties, 3);
});

test('no opts (the daily cron tick): defaults to a real run, not dry-run', async () => {
  const { deps, calls } = fakeDeps({ summary: BASE_SUMMARY(false) });

  const result = await runSharedDataBackfillJob(undefined, deps);

  assert.equal(calls.runBackfillArgs.dryRun, false);
  assert.equal(result.dryRun, false);
});

test('opts.dryRun=false is honored explicitly, not coerced to true', async () => {
  const { deps, calls } = fakeDeps({ summary: BASE_SUMMARY(false) });

  await runSharedDataBackfillJob({ dryRun: false }, deps);

  assert.equal(calls.runBackfillArgs.dryRun, false);
});

test('a non-boolean dryRun value (e.g. a stray truthy string from malformed job data) is normalized, not passed through raw', async () => {
  const { deps, calls } = fakeDeps({ summary: BASE_SUMMARY(false) });

  await runSharedDataBackfillJob({ dryRun: 'true' }, deps);

  assert.equal(calls.runBackfillArgs.dryRun, false);
});
