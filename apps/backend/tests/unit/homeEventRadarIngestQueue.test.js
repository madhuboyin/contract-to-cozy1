const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const { createFakeQueue } = require('../../src/lib/queuePort');
const {
  RADAR_INGEST_ATTEMPTS,
  RADAR_INGEST_JOB_NAME,
  RadarIngestDisabledError,
  RadarIngestPayloadTooLargeError,
  RadarIngestQueueService,
} = require('../../src/modules/homeEventRadar/queues/radarIngest.queue');

function observation(overrides = {}) {
  return {
    schemaVersion: 1,
    sourceDefinitionId: 'source-1',
    providerEventId: 'provider-event-1',
    providerRevision: 'revision-1',
    sourceFamily: 'weather',
    eventType: 'weather',
    title: 'Severe weather alert',
    summary: 'Potentially damaging weather is expected.',
    severity: 'severe',
    lifecycleStatus: 'active',
    effectiveAt: '2026-07-26T12:00:00Z',
    expiresAt: '2026-07-26T18:00:00Z',
    observedAt: '2026-07-26T11:55:00Z',
    geography: {
      type: 'postal_code',
      countryCode: 'US',
      postalCode: '08536',
    },
    canonicalUrl: 'https://api.weather.gov/alerts/provider-event-1',
    deduplicationKeys: ['weather:08536:2026-07-26'],
    rawPayload: { provider: 'example' },
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    observation: observation(),
    sourceRunId: 'run-1',
    correlationId: 'correlation-1',
    ...overrides,
  };
}

test('canonical enqueue uses deterministic same-run identity and bounded retry policy', async () => {
  const queue = createFakeQueue();
  const service = new RadarIngestQueueService(
    () => queue,
    () => new Date('2026-07-26T12:01:00Z'),
    {},
  );

  const first = await service.enqueue(input());
  const duplicate = await service.enqueue(input());
  const replay = await service.enqueue(input({ sourceRunId: 'run-2' }));

  assert.equal(first.jobId, duplicate.jobId);
  assert.notEqual(first.jobId, replay.jobId);
  assert.match(first.jobId, /^radar-ingest-[a-f0-9]{64}$/);
  assert.equal(queue.added[0].name, RADAR_INGEST_JOB_NAME);
  assert.equal(queue.added[0].opts.attempts, RADAR_INGEST_ATTEMPTS);
  assert.deepEqual(queue.added[0].opts.backoff, {
    type: 'exponential',
    delay: 5_000,
    jitter: 0.2,
  });
  assert.equal(queue.added[0].data.payloadVersion, 1);
  assert.equal(queue.added[0].data.enqueuedAt, '2026-07-26T12:01:00.000Z');
});

test('enqueue validates provenance and canonical observation before touching Redis', async () => {
  const queue = createFakeQueue();
  const service = new RadarIngestQueueService(() => queue, () => new Date(), {});

  await assert.rejects(
    () => service.enqueue(input({ sourceRunId: ' ' })),
    /sourceRunId/,
  );
  await assert.rejects(
    () => service.enqueue(input({
      observation: observation({ providerEventId: '' }),
    })),
    /providerEventId/,
  );
  assert.equal(queue.added.length, 0);
});

test('oversized raw evidence is rejected before queueing', async () => {
  const queue = createFakeQueue();
  const service = new RadarIngestQueueService(() => queue, () => new Date(), {});

  await assert.rejects(
    () => service.enqueue(input({
      observation: observation({ rawPayload: { body: 'x'.repeat(600 * 1024) } }),
    })),
    RadarIngestPayloadTooLargeError,
  );
  assert.equal(queue.added.length, 0);
});

test('global ingestion kill switch fails closed before validation or queue access', async () => {
  for (const configuredValue of ['false', 'TRUE', 'enabled']) {
    const queue = createFakeQueue();
    const service = new RadarIngestQueueService(
      () => queue,
      () => new Date(),
      { RADAR_INGEST_ENABLED: configuredValue },
    );

    await assert.rejects(() => service.enqueue(input()), RadarIngestDisabledError);
    assert.equal(queue.added.length, 0);
  }
});
