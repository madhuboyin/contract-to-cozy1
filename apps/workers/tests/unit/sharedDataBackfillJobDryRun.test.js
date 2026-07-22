// apps/workers/tests/unit/sharedDataBackfillJobDryRun.test.js
//
// W4 item 8: dry-run contract test. shared-data-backfill is the first job
// wired end-to-end for manual dry-run (registry supportsDryRun: true) — this
// asserts the actual contract: a dryRun request must reach the underlying
// service's dryRun flag unchanged, must never silently default to a real
// run, and the scheduled/no-opts call path (the daily cron tick) must still
// default to a real run so this feature can't accidentally turn the
// production sweep into a permanent no-op.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadJob({ summary }) {
  const calls = { runBackfillArgs: null };
  const servicePath = require.resolve('../../../backend/src/services/sharedDataBackfill.service.ts');
  require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: {
      sharedDataBackfillService: {
        runBackfill: async (args) => {
          calls.runBackfillArgs = args;
          return summary;
        },
      },
    },
  };
  const jobPath = require.resolve('../../src/jobs/sharedDataBackfill.job.ts');
  delete require.cache[jobPath];
  return { ...require(jobPath), calls };
}

const BASE_SUMMARY = (dryRun) => ({
  dryRun,
  processedProperties: 3,
  skippedProperties: 1,
  erroredProperties: 0,
  totalPropertiesConsidered: 4,
});

test('dry run: opts.dryRun=true is passed through to the service unchanged', async () => {
  const { runSharedDataBackfillJob, calls } = loadJob({ summary: BASE_SUMMARY(true) });

  const result = await runSharedDataBackfillJob({ dryRun: true });

  assert.equal(calls.runBackfillArgs.dryRun, true);
  assert.equal(result.dryRun, true);
  // The contract: dry-run still reports what it would have done, it just
  // must not be silently swapped for a no-op zeroed-out result.
  assert.equal(result.processedProperties, 3);
});

test('no opts (the daily cron tick): defaults to a real run, not dry-run', async () => {
  const { runSharedDataBackfillJob, calls } = loadJob({ summary: BASE_SUMMARY(false) });

  const result = await runSharedDataBackfillJob();

  assert.equal(calls.runBackfillArgs.dryRun, false);
  assert.equal(result.dryRun, false);
});

test('opts.dryRun=false is honored explicitly, not coerced to true', async () => {
  const { runSharedDataBackfillJob, calls } = loadJob({ summary: BASE_SUMMARY(false) });

  await runSharedDataBackfillJob({ dryRun: false });

  assert.equal(calls.runBackfillArgs.dryRun, false);
});

test('a non-boolean dryRun value (e.g. a stray truthy string from malformed job data) is normalized, not passed through raw', async () => {
  const { runSharedDataBackfillJob, calls } = loadJob({ summary: BASE_SUMMARY(false) });

  await runSharedDataBackfillJob({ dryRun: 'true' });

  assert.equal(calls.runBackfillArgs.dryRun, false);
});
