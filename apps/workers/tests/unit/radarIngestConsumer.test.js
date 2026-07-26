const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');
require('tsconfig-paths/register');

const {
  isFinalRadarIngestAttempt,
  processRadarIngestJob,
  radarIngestConcurrency,
  radarIngestErrorClass,
} = require('../../src/radar/radarIngestConsumer');
const {
  RADAR_INGEST_JOB_NAME,
} = require('../../../backend/src/modules/homeEventRadar/queues/radarIngest.queue');

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

function job(overrides = {}) {
  return {
    name: RADAR_INGEST_JOB_NAME,
    data: {
      payloadVersion: 1,
      observation: observation(),
      sourceRunId: 'run-1',
      correlationId: 'correlation-1',
      enqueuedAt: '2026-07-26T12:00:30Z',
    },
    ...overrides,
  };
}

test('consumer validates the durable payload and delegates idempotent ingestion', async () => {
  const calls = [];
  const result = await processRadarIngestJob(job(), {
    ingestion: {
      async ingest(inputObservation, context) {
        calls.push({ inputObservation, context });
        return {
          outcome: 'duplicate',
          radarEventId: 'event-1',
          radarEventRevisionId: 'revision-1',
          revisionIdentity: 'provider:revision-1',
          payloadFingerprint: 'fingerprint',
          lifecycleStatus: 'active',
          matchJobId: 'match-job-1',
        };
      },
    },
    now: () => new Date('2026-07-26T12:01:00Z'),
  });

  assert.equal(result.outcome, 'duplicate');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].inputObservation.providerEventId, 'provider-event-1');
  assert.deepEqual(calls[0].context, {
    sourceRunId: 'run-1',
    correlationId: 'correlation-1',
  });
});

test('consumer rejects unknown job names and malformed payloads before ingestion', async () => {
  let ingestions = 0;
  const deps = {
    ingestion: { async ingest() { ingestions += 1; } },
    now: () => new Date(),
  };

  await assert.rejects(
    () => processRadarIngestJob(job({ name: 'UNKNOWN' }), deps),
    /Unknown job name/,
  );
  await assert.rejects(
    () => processRadarIngestJob(job({
      data: { ...job().data, payloadVersion: 2 },
    }), deps),
    /payloadVersion/,
  );
  assert.equal(ingestions, 0);
});

test('concurrency is bounded and malformed configuration uses the safe default', () => {
  assert.equal(radarIngestConcurrency({}), 4);
  assert.equal(radarIngestConcurrency({ RADAR_INGEST_CONCURRENCY: '0' }), 1);
  assert.equal(radarIngestConcurrency({ RADAR_INGEST_CONCURRENCY: '8' }), 8);
  assert.equal(radarIngestConcurrency({ RADAR_INGEST_CONCURRENCY: '100' }), 20);
  assert.equal(radarIngestConcurrency({ RADAR_INGEST_CONCURRENCY: '4workers' }), 4);
  assert.equal(radarIngestConcurrency({ RADAR_INGEST_CONCURRENCY: 'nope' }), 4);
});

test('retry exhaustion and error classification remain bounded', () => {
  assert.equal(isFinalRadarIngestAttempt({ attemptsMade: 4, opts: { attempts: 5 } }), false);
  assert.equal(isFinalRadarIngestAttempt({ attemptsMade: 5, opts: { attempts: 5 } }), true);
  assert.equal(isFinalRadarIngestAttempt(undefined), true);
  assert.equal(radarIngestErrorClass(Object.assign(new Error(), { name: 'ZodError' })), 'validation');
  assert.equal(
    radarIngestErrorClass(Object.assign(new Error(), { name: 'RadarObservationSourceError' })),
    'source',
  );
  assert.equal(radarIngestErrorClass(new Error('unexpected')), 'unknown');
});

test('worker wiring retains final failures, emits metrics, and closes queue resources', () => {
  const worker = fs.readFileSync(
    path.resolve(__dirname, '../../src/worker.ts'),
    'utf8',
  );
  const dockerfile = fs.readFileSync(
    path.resolve(__dirname, '../../../../infrastructure/docker/workers/Dockerfile'),
    'utf8',
  );

  assert.match(worker, /new Worker<RadarIngestJobPayload>[\s\S]*RADAR_INGEST_QUEUE_NAME/);
  assert.match(worker, /isRadarIngestEnabled\(process\.env\)/);
  assert.match(worker, /radarIngestDeadLetterTotal\.inc/);
  assert.match(worker, /radarIngestRetriesTotal\.inc/);
  assert.match(worker, /retained_in_bullmq_failed_set/);
  assert.match(worker, /registerShutdownHandler\('radarIngestWorker'/);
  assert.match(worker, /registerShutdownHandler\('radarIngestQueue'/);
  assert.match(dockerfile, /radarIngest\.queue\.ts/);
});
