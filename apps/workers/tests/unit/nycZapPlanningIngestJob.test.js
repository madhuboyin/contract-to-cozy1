const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

const {
  runNycZapPlanningIngestJob,
} = require('../../src/jobs/nycZapPlanningIngest.job.ts');

function fixtureConfig(enabled = true) {
  return {
    enabled,
    environment: 'production',
    reviewedBy: enabled ? 'reviewer' : null,
    reviewReference: enabled ? 'review-1' : null,
    counties: ['NEW YORK COUNTY'],
  };
}

test('disabled pilot performs no provider or persistence work', async () => {
  let createdAdapter = false;
  const result = await runNycZapPlanningIngestJob({}, {
    readConfig: () => fixtureConfig(false),
    activate: async () => { throw new Error('must not activate'); },
    createAdapter: () => {
      createdAdapter = true;
      throw new Error('must not fetch');
    },
    ingest: async () => { throw new Error('must not ingest'); },
    lastCheckedThrough: async () => null,
    correlationId: () => 'correlation',
  });
  assert.equal(result.skipped, 1);
  assert.equal(createdAdapter, false);
});

test('dry run fetches reviewed scope without activating or persisting', async () => {
  const result = await runNycZapPlanningIngestJob({ dryRun: true }, {
    readConfig: () => fixtureConfig(),
    activate: async () => { throw new Error('must not activate'); },
    createAdapter: () => ({
      fetch: async () => ({
        checkedThrough: new Date('2026-07-30T12:00:00.000Z'),
        observations: [{ externalId: 'one' }],
      }),
    }),
    ingest: async () => { throw new Error('must not ingest'); },
    lastCheckedThrough: async () => null,
    correlationId: () => 'correlation',
  });
  assert.equal(result.examined, 1);
  assert.equal(result.skipped, 1);
  assert.match(result.reason, /without persistence/);
});

test('live run activates the reviewed pilot before canonical ingestion', async () => {
  const calls = [];
  const checkedThrough = new Date('2026-07-30T12:00:00.000Z');
  const result = await runNycZapPlanningIngestJob({}, {
    readConfig: () => fixtureConfig(),
    activate: async (config) => {
      calls.push(['activate', config.reviewReference]);
      return { activated: true };
    },
    createAdapter: () => ({
      fetch: async ({ environment }) => {
        calls.push(['fetch', environment]);
        return {
          checkedThrough,
          observations: [{ externalId: 'one' }, { externalId: 'two' }],
        };
      },
    }),
    ingest: async (input) => {
      calls.push(['ingest', input.sourceKey, input.correlationId]);
      return {
        runId: 'run-1',
        accepted: 2,
        rejected: 0,
        unchanged: 1,
        revisions: 0,
        matches: 1,
        checkedThrough,
      };
    },
    lastCheckedThrough: async () => null,
    correlationId: () => 'nyc-zap-smoke',
  });

  assert.deepEqual(calls, [
    ['fetch', 'production'],
    ['activate', 'review-1'],
    ['ingest', 'nyc-dcp-zap-projects', 'nyc-zap-smoke'],
  ]);
  assert.equal(result.examined, 2);
  assert.equal(result.created, 1);
  assert.equal(result.refreshed, 1);
  assert.equal(result.smokeCorrelationId, 'nyc-zap-smoke');
});
