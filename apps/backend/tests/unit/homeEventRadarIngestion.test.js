const assert = require('node:assert/strict');
const test = require('node:test');

require('ts-node/register/transpile-only');

const { createFakeQueue } = require('../../src/lib/queuePort');
const {
  canonicalLifecycleTransition,
  RadarEventIngestionService,
  RadarObservationConflictError,
  RadarObservationSourceError,
  RadarObservationStaleError,
  radarObservationFingerprint,
  stableRadarJson,
} = require('../../src/modules/homeEventRadar/services/radarEventIngestion.service');

function observation(overrides = {}) {
  return {
    schemaVersion: 1,
    sourceDefinitionId: 'source-1',
    providerEventId: 'provider-event-1',
    providerRevision: 'revision-1',
    sourceFamily: 'weather',
    eventType: 'weather',
    title: 'Severe weather alert',
    summary: 'Potentially damaging weather is expected near the property.',
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
    canonicalUrl: 'https://example.test/alerts/provider-event-1',
    deduplicationKeys: ['weather:08536:2026-07-26'],
    rawPayload: { provider: 'example', certainty: 'likely' },
    ...overrides,
  };
}

function createHarness() {
  const state = {
    events: [],
    revisions: [],
    eventCreates: 0,
    eventUpdates: 0,
    revisionCreates: 0,
    transactions: 0,
  };
  const source = {
    id: 'source-1',
    family: 'weather',
    sourceType: 'weather_provider',
    contractVersion: 1,
    supportedEventTypes: ['weather', 'freeze'],
  };
  const run = {
    id: 'run-1',
    sourceDefinitionId: 'source-1',
    status: 'started',
    correlationId: 'correlation-1',
  };
  const tx = {
    radarSourceDefinition: {
      findUnique: async ({ where }) => where.id === source.id ? source : null,
    },
    radarSourceRun: {
      findUnique: async ({ where }) => where.id === run.id ? run : null,
    },
    radarEvent: {
      findUnique: async ({ where }) => {
        if (where.id) return state.events.find((event) => event.id === where.id) ?? null;
        const identity = where.sourceDefinitionId_providerEventId;
        return state.events.find((event) =>
          event.sourceDefinitionId === identity.sourceDefinitionId &&
          event.providerEventId === identity.providerEventId
        ) ?? null;
      },
      create: async ({ data }) => {
        state.eventCreates += 1;
        const event = {
          id: `event-${state.eventCreates}`,
          createdAt: new Date('2026-07-26T12:00:00Z'),
          updatedAt: new Date('2026-07-26T12:00:00Z'),
          ...data,
        };
        state.events.push(event);
        return event;
      },
      update: async ({ where, data }) => {
        state.eventUpdates += 1;
        const event = state.events.find((candidate) => candidate.id === where.id);
        Object.assign(event, data, { updatedAt: new Date('2026-07-26T13:00:00Z') });
        return event;
      },
    },
    radarEventRevision: {
      findUnique: async ({ where }) => {
        const identity = where.radarEventId_revisionIdentity;
        return state.revisions.find((revision) =>
          revision.radarEventId === identity.radarEventId &&
          revision.revisionIdentity === identity.revisionIdentity
        ) ?? null;
      },
      create: async ({ data }) => {
        state.revisionCreates += 1;
        const revision = {
          id: `revision-${state.revisionCreates}`,
          createdAt: new Date('2026-07-26T12:00:00Z'),
          ...data,
        };
        state.revisions.push(revision);
        return revision;
      },
    },
  };
  const db = {
    $transaction: async (callback) => {
      state.transactions += 1;
      return callback(tx);
    },
  };
  const queue = createFakeQueue();
  return {
    state,
    source,
    run,
    db,
    queue,
    service: new RadarEventIngestionService(db, () => queue),
  };
}

const context = {
  sourceRunId: 'run-1',
  correlationId: 'correlation-1',
};

test('stable JSON and fingerprints ignore object key insertion order', () => {
  assert.equal(
    stableRadarJson({ z: 1, nested: { b: 2, a: 1 } }),
    '{"nested":{"a":1,"b":2},"z":1}',
  );
  assert.equal(
    radarObservationFingerprint(observation({ rawPayload: { a: 1, b: 2 } })),
    radarObservationFingerprint(observation({ rawPayload: { b: 2, a: 1 } })),
  );
});

test('creates an exact-source event, immutable revision, and deterministic match job', async () => {
  const harness = createHarness();
  const result = await harness.service.ingest(observation(), context);

  assert.equal(result.outcome, 'created');
  assert.equal(result.lifecycleStatus, 'active');
  assert.equal(harness.state.events.length, 1);
  assert.equal(harness.state.revisions.length, 1);
  assert.equal(harness.state.events[0].sourceDefinitionId, 'source-1');
  assert.equal(harness.state.events[0].providerEventId, 'provider-event-1');
  assert.equal(harness.state.events[0].severity, 'critical');
  assert.equal(harness.state.events[0].locationType, 'postal_code');
  assert.equal(harness.state.events[0].locationKey, 'US:08536');
  assert.equal(harness.state.revisions[0].revisionIdentity, 'provider:revision-1');
  assert.deepEqual(harness.state.revisions[0].rawPayloadJson, {
    certainty: 'likely',
    provider: 'example',
  });
  assert.equal(harness.queue.added.length, 1);
  assert.equal(harness.queue.added[0].opts.jobId, result.matchJobId);
  assert.equal(harness.queue.added[0].data.radarEventRevisionId, result.radarEventRevisionId);
});

test('same revision and payload is a no-op but safely retries the same match job', async () => {
  const harness = createHarness();
  const first = await harness.service.ingest(observation(), context);
  const duplicate = await harness.service.ingest(observation({
    // A replay in a later run has new receipt provenance but identical provider
    // revision material and must remain idempotent.
    observedAt: '2026-07-26T12:30:00Z',
  }), context);

  assert.equal(duplicate.outcome, 'duplicate');
  assert.equal(harness.state.eventCreates, 1);
  assert.equal(harness.state.eventUpdates, 0);
  assert.equal(harness.state.revisionCreates, 1);
  assert.equal(harness.queue.added.length, 2);
  assert.equal(harness.queue.added[0].opts.jobId, first.matchJobId);
  assert.equal(harness.queue.added[1].opts.jobId, first.matchJobId);
});

test('same provider revision with changed evidence is rejected as an idempotency conflict', async () => {
  const harness = createHarness();
  await harness.service.ingest(observation(), context);

  await assert.rejects(
    () => harness.service.ingest(observation({
      rawPayload: { provider: 'example', certainty: 'observed' },
    }), context),
    RadarObservationConflictError,
  );
  assert.equal(harness.state.revisionCreates, 1);
  assert.equal(harness.queue.added.length, 1);
});

test('a material active revision becomes updated and terminal events cannot reopen', async () => {
  const harness = createHarness();
  await harness.service.ingest(observation(), context);
  const updated = await harness.service.ingest(observation({
    providerRevision: 'revision-2',
    severity: 'extreme',
    observedAt: '2026-07-26T12:05:00Z',
    rawPayload: { provider: 'example', certainty: 'observed' },
  }), context);
  const resolved = await harness.service.ingest(observation({
    providerRevision: 'revision-3',
    lifecycleStatus: 'resolved',
    observedAt: '2026-07-26T13:00:00Z',
    rawPayload: { provider: 'example', status: 'ended' },
  }), context);

  assert.equal(updated.lifecycleStatus, 'updated');
  assert.equal(resolved.lifecycleStatus, 'resolved');
  assert.equal(harness.state.events[0].resolvedAt.toISOString(), '2026-07-26T13:00:00.000Z');
  await assert.rejects(
    () => harness.service.ingest(observation({
      providerRevision: 'revision-4',
      observedAt: '2026-07-26T14:00:00Z',
      rawPayload: { provider: 'example', status: 'reopened' },
    }), context),
    RadarObservationConflictError,
  );
});

test('rejects stale revisions and source/run provenance mismatches', async () => {
  const harness = createHarness();
  await harness.service.ingest(observation(), context);

  await assert.rejects(
    () => harness.service.ingest(observation({
      providerRevision: 'revision-stale',
      observedAt: '2026-07-26T11:00:00Z',
    }), context),
    RadarObservationStaleError,
  );
  await assert.rejects(
    () => harness.service.ingest(observation({ sourceFamily: 'tax' }), context),
    RadarObservationSourceError,
  );
  await assert.rejects(
    () => harness.service.ingest(observation(), {
      sourceRunId: 'run-1',
      correlationId: 'wrong-correlation',
    }),
    RadarObservationSourceError,
  );
});

test('batch ingestion isolates every observation in its own transaction', async () => {
  const harness = createHarness();
  const results = await harness.service.ingestMany([
    observation(),
    observation({ providerEventId: '', providerRevision: 'bad-revision' }),
    observation({
      providerEventId: 'provider-event-2',
      providerRevision: 'revision-1',
      observedAt: '2026-07-26T12:10:00Z',
    }),
  ], context);

  assert.deepEqual(results.map((item) => item.accepted), [true, false, true]);
  assert.equal(harness.state.transactions, 2);
  assert.equal(harness.state.events.length, 2);
  assert.equal(harness.queue.added.length, 2);
});

test('a queue failure is recoverable by retrying the idempotent observation', async () => {
  const harness = createHarness();
  let fail = true;
  const recoveringQueue = {
    added: [],
    async add(name, data, opts) {
      if (fail) {
        fail = false;
        throw new Error('Redis temporarily unavailable');
      }
      this.added.push({ name, data, opts });
      return { id: opts.jobId };
    },
    async getJob() {
      return undefined;
    },
  };
  const service = new RadarEventIngestionService(
    harness.db,
    () => recoveringQueue,
  );

  await assert.rejects(() => service.ingest(observation(), context), /Redis temporarily unavailable/);
  const retry = await service.ingest(observation(), context);
  assert.equal(retry.outcome, 'duplicate');
  assert.equal(recoveringQueue.added.length, 1);
});

test('lifecycle helper rejects terminal transition changes', () => {
  assert.equal(canonicalLifecycleTransition('active', 'active'), 'updated');
  assert.equal(canonicalLifecycleTransition('updated', 'expired'), 'expired');
  assert.throws(
    () => canonicalLifecycleTransition('retracted', 'resolved'),
    RadarObservationConflictError,
  );
});
