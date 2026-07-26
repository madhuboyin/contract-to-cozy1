const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');
require('tsconfig-paths/register');

const { createFakeQueue } = require('../../../backend/src/lib/queuePort');
const {
  RADAR_MATCH_JOB_NAME,
} = require('../../../backend/src/modules/homeEventRadar/queues/radarMatch.queue');
const {
  isFinalRadarMatchAttempt,
  processRadarMatchJob,
  radarMatchConcurrency,
  radarMatchPageSize,
  RadarPropertyMatchError,
} = require('../../src/radar/radarMatchConsumer');

function scanJob(overrides = {}) {
  return {
    name: RADAR_MATCH_JOB_NAME,
    data: {
      payloadVersion: 1,
      radarEventId: 'event-1',
      radarEventRevisionId: 'revision-1',
      revisionIdentity: 'provider:revision-1',
      sourceDefinitionId: 'source-1',
      sourceRunId: 'run-1',
      lifecycleStatus: 'active',
      correlationId: 'correlation-1',
      enqueuedAt: '2026-07-26T15:00:00Z',
      scopeType: 'scan',
      pageSize: 2,
    },
    ...overrides,
  };
}

function deps(overrides = {}) {
  return {
    queue: createFakeQueue(),
    async listPage() {
      return {
        outcome: 'ready',
        propertyIds: ['property-1', 'property-2'],
        nextCursor: 'property-2',
      };
    },
    async matchProperties() {
      return { matched: 1, skipped: 0, failedPropertyIds: [] };
    },
    now: () => new Date('2026-07-26T15:00:05Z'),
    ...overrides,
  };
}

test('scan scope dispatches isolated property jobs and one resumable continuation', async () => {
  const d = deps();
  const result = await processRadarMatchJob(scanJob(), d);

  assert.deepEqual(result, {
    outcome: 'page_dispatched',
    dispatchedProperties: 2,
    continuationQueued: true,
    nextCursor: 'property-2',
  });
  assert.equal(d.queue.added.length, 3);
  assert.deepEqual(
    d.queue.added.map((item) => item.data.scopeType),
    ['property', 'property', 'scan'],
  );
  assert.deepEqual(
    d.queue.added.slice(0, 2).map((item) => item.data.propertyId),
    ['property-1', 'property-2'],
  );
  assert.equal(d.queue.added[2].data.afterPropertyId, 'property-2');
  assert.equal(new Set(d.queue.added.map((item) => item.opts.jobId)).size, 3);
});

test('replaying a scan produces the same child identities', async () => {
  const d = deps();
  await processRadarMatchJob(scanJob(), d);
  const firstIds = d.queue.added.map((item) => item.opts.jobId);
  await processRadarMatchJob(scanJob(), d);
  const replayIds = d.queue.added.slice(3).map((item) => item.opts.jobId);
  assert.deepEqual(replayIds, firstIds);
});

test('terminal scan outcomes do not enqueue work', async () => {
  const d = deps({
    async listPage() {
      return {
        outcome: 'unsupported_geography',
        propertyIds: [],
        nextCursor: null,
      };
    },
  });
  const result = await processRadarMatchJob(scanJob(), d);
  assert.equal(result.outcome, 'scan_terminal');
  assert.equal(result.reason, 'unsupported_geography');
  assert.equal(d.queue.added.length, 0);
});

test('property scope is independently matched and failures remain retryable', async () => {
  const propertyJob = scanJob({
    data: {
      ...scanJob().data,
      scopeType: 'property',
      pageSize: undefined,
      propertyId: 'property-1',
    },
  });
  const success = await processRadarMatchJob(propertyJob, deps());
  assert.equal(success.outcome, 'property_matched');

  await assert.rejects(
    () => processRadarMatchJob(propertyJob, deps({
      async matchProperties() {
        return { matched: 0, skipped: 1, failedPropertyIds: ['property-1'] };
      },
    })),
    RadarPropertyMatchError,
  );
});

test('configuration, attempts, payload names, and lifecycle wiring are bounded', () => {
  assert.equal(radarMatchConcurrency({}), 8);
  assert.equal(radarMatchConcurrency({ RADAR_MATCH_CONCURRENCY: '0' }), 1);
  assert.equal(radarMatchConcurrency({ RADAR_MATCH_CONCURRENCY: '20' }), 20);
  assert.equal(radarMatchConcurrency({ RADAR_MATCH_CONCURRENCY: '999' }), 40);
  assert.equal(radarMatchConcurrency({ RADAR_MATCH_CONCURRENCY: 'many' }), 8);
  assert.equal(radarMatchPageSize({ RADAR_MATCH_PAGE_SIZE: '250' }), 250);
  assert.equal(isFinalRadarMatchAttempt({ attemptsMade: 4, opts: { attempts: 5 } }), false);
  assert.equal(isFinalRadarMatchAttempt({ attemptsMade: 5, opts: { attempts: 5 } }), true);

  const worker = fs.readFileSync(path.resolve(__dirname, '../../src/worker.ts'), 'utf8');
  assert.match(worker, /new Worker<RadarMatchJobPayload>[\s\S]*RADAR_MATCH_QUEUE_NAME/);
  assert.match(worker, /radarMatchDeadLetterTotal\.inc/);
  assert.match(worker, /radarMatchRetriesTotal\.inc/);
  assert.match(worker, /registerShutdownHandler\('radarMatchWorker'/);
  assert.match(worker, /registerShutdownHandler\('radarMatchQueue'/);
});
