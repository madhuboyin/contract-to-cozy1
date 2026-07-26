const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const { createFakeQueue } = require('../../src/lib/queuePort');
const {
  createRadarMatchContinuation,
  createRadarMatchPropertyScope,
  configuredRadarMatchPageSize,
  enqueueRadarMatchRoot,
  isRadarMatchEnabled,
  radarMatchJobPayloadSchema,
  RADAR_MATCH_ATTEMPTS,
  RADAR_MATCH_JOB_NAME,
} = require('../../src/modules/homeEventRadar/queues/radarMatch.queue');

function rootInput(overrides = {}) {
  return {
    radarEventId: 'event-1',
    radarEventRevisionId: 'event-revision-1',
    revisionIdentity: 'provider:revision-1',
    sourceDefinitionId: 'source-1',
    sourceRunId: 'run-1',
    lifecycleStatus: 'active',
    correlationId: 'correlation-1',
    providerEventId: 'provider-event-1',
    ...overrides,
  };
}

test('root match jobs are versioned, deterministic, bounded, and start a scan', async () => {
  const queue = createFakeQueue();
  const now = new Date('2026-07-26T15:00:00Z');

  const first = await enqueueRadarMatchRoot(queue, rootInput(), now);
  const duplicate = await enqueueRadarMatchRoot(queue, rootInput(), now);

  assert.equal(first, duplicate);
  assert.match(first, /^radar-match-[a-f0-9]{64}$/);
  assert.equal(queue.added[0].name, RADAR_MATCH_JOB_NAME);
  assert.equal(queue.added[0].data.payloadVersion, 1);
  assert.equal(queue.added[0].data.scopeType, 'scan');
  assert.equal(queue.added[0].data.pageSize, 100);
  assert.equal(queue.added[0].opts.attempts, RADAR_MATCH_ATTEMPTS);
  assert.deepEqual(queue.added[0].opts.backoff, {
    type: 'exponential',
    delay: 5_000,
    jitter: 0.2,
  });
});

test('continuation and property scopes have stable, non-overlapping identities', () => {
  const base = radarMatchJobPayloadSchema.parse({
    payloadVersion: 1,
    ...rootInput(),
    providerEventId: undefined,
    enqueuedAt: '2026-07-26T15:00:00Z',
    scopeType: 'scan',
    pageSize: 25,
  });
  const continuation = createRadarMatchContinuation(
    base,
    'property-25',
    new Date('2026-07-26T15:01:00Z'),
  );
  const property = createRadarMatchPropertyScope(
    base,
    'property-1',
    new Date('2026-07-26T15:01:00Z'),
  );

  assert.notEqual(continuation.jobId, property.jobId);
  assert.equal(continuation.data.afterPropertyId, 'property-25');
  assert.equal(continuation.data.pageSize, 25);
  assert.equal(property.data.propertyId, 'property-1');
  assert.equal(property.data.enqueuedAt, '2026-07-26T15:01:00.000Z');

  const otherEvent = createRadarMatchPropertyScope(
    { ...base, radarEventId: 'event-2', radarEventRevisionId: 'event-revision-2' },
    'property-1',
    new Date('2026-07-26T15:01:00Z'),
  );
  assert.notEqual(
    property.jobId,
    otherEvent.jobId,
    'provider revisions reused across events must not collide',
  );
});

test('match controls fail closed and configuration remains bounded', () => {
  assert.equal(isRadarMatchEnabled({}), true);
  assert.equal(isRadarMatchEnabled({ RADAR_MATCH_ENABLED: 'true' }), true);
  assert.equal(isRadarMatchEnabled({ RADAR_MATCH_ENABLED: 'false' }), false);
  assert.equal(isRadarMatchEnabled({ RADAR_MATCH_ENABLED: 'TRUE' }), false);
  assert.equal(configuredRadarMatchPageSize({}), 100);
  assert.equal(configuredRadarMatchPageSize({ RADAR_MATCH_PAGE_SIZE: '0' }), 1);
  assert.equal(configuredRadarMatchPageSize({ RADAR_MATCH_PAGE_SIZE: '250' }), 250);
  assert.equal(configuredRadarMatchPageSize({ RADAR_MATCH_PAGE_SIZE: '999' }), 500);
  assert.equal(configuredRadarMatchPageSize({ RADAR_MATCH_PAGE_SIZE: 'many' }), 100);
});
