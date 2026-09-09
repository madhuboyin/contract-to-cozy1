const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

const {
  DEFAULT_PROPERTY_ENRICHMENT_CONCURRENCY,
  RetryablePropertyEnrichmentError,
  processPropertyEnrichmentJob,
  propertyEnrichmentConcurrency,
} = require('../../src/jobs/propertyEnrichment.job.ts');

function job(overrides = {}) {
  return {
    id: 'rentcast-property-1-1-v1',
    data: {
      propertyId: 'property-1',
      provider: 'RENTCAST',
      addressVersion: 1,
      contractVersion: 1,
    },
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  };
}

test('processor passes BullMQ attempt context and returns terminal outcomes', async () => {
  const calls = [];
  const recorded = [];
  const result = await processPropertyEnrichmentJob(job({ attemptsMade: 1 }), {
    service: {
      async enrich(payload, execution) {
        calls.push({ payload, execution });
        return { kind: 'COMPLETED', status: 'MATCHED', changedFactKeys: [], protectedFactKeys: [] };
      },
    },
    recordResult: (outcome) => recorded.push(outcome),
  });

  assert.equal(result.status, 'MATCHED');
  assert.deepEqual(calls[0].execution, { attemptNumber: 2, maxAttempts: 3 });
  assert.deepEqual(recorded, [result]);
});

test('retryable service outcomes reject so BullMQ applies exponential backoff', async () => {
  await assert.rejects(
    () => processPropertyEnrichmentJob(job(), {
      service: { async enrich() { return { kind: 'RETRYABLE', code: 'TIMEOUT' }; } },
      recordResult() {},
    }),
    (error) => error instanceof RetryablePropertyEnrichmentError && error.code === 'TIMEOUT',
  );
});

test('processor never tells the service to exceed three attempts', async () => {
  let execution;
  await processPropertyEnrichmentJob(job({ opts: { attempts: 9 } }), {
    service: {
      async enrich(_payload, context) {
        execution = context;
        return { kind: 'STALE' };
      },
    },
    recordResult() {},
  });
  assert.equal(execution.maxAttempts, 3);
});

test('worker concurrency defaults to four and accepts only bounded integers', () => {
  assert.equal(propertyEnrichmentConcurrency({}), DEFAULT_PROPERTY_ENRICHMENT_CONCURRENCY);
  assert.equal(propertyEnrichmentConcurrency({ RENTCAST_WORKER_CONCURRENCY: '7' }), 7);
  assert.equal(propertyEnrichmentConcurrency({ RENTCAST_WORKER_CONCURRENCY: '0' }), 4);
  assert.equal(propertyEnrichmentConcurrency({ RENTCAST_WORKER_CONCURRENCY: '11' }), 4);
  assert.equal(propertyEnrichmentConcurrency({ RENTCAST_WORKER_CONCURRENCY: '2.5' }), 4);
});
