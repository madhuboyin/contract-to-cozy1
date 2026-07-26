const assert = require('node:assert/strict');
const test = require('node:test');

require('ts-node/register/transpile-only');

const {
  RadarSourceRunConflictError,
  RadarSourceRunService,
} = require('../../src/modules/homeEventRadar/services/radarSourceRun.service');
const {
  radarSourceRunCompletionSchema,
} = require('../../src/modules/homeEventRadar/contracts');

test('run completion contract distinguishes successful-empty and failed semantics', () => {
  assert.equal(
    radarSourceRunCompletionSchema.safeParse({
      status: 'successful_empty',
      observationsReceived: 0,
    }).success,
    true,
  );
  assert.equal(
    radarSourceRunCompletionSchema.safeParse({
      status: 'successful_empty',
      observationsReceived: 1,
    }).success,
    false,
  );
  assert.equal(
    radarSourceRunCompletionSchema.safeParse({
      status: 'failed',
    }).success,
    false,
  );
  assert.equal(
    radarSourceRunCompletionSchema.safeParse({
      status: 'success',
      observationsReceived: 0,
    }).success,
    false,
  );
  assert.equal(
    radarSourceRunCompletionSchema.safeParse({
      status: 'partial',
      observationsReceived: 1,
    }).success,
    false,
  );
});

test('zero configured coverage creates an explicit skipped run', async () => {
  let createdRun;
  const db = {
    radarSourceDefinition: {
      findUnique: async () => ({
        id: 'source-1',
        key: 'tax-assessment-ingest',
        provider: 'County',
        sourceType: 'tax_assessor_feed',
        adapterVersion: '1.0.0',
        isEnabled: true,
        environments: ['production'],
        coverage: [],
        health: null,
      }),
    },
    radarSourceRun: {
      upsert: async ({ create }) => {
        createdRun = create;
        return { id: 'run-1', ...create };
      },
    },
    radarSourceHealth: {
      upsert: async () => ({}),
    },
  };
  const registry = {
    executionDecision: () => ({ allowed: true, reason: 'policy allows execution' }),
  };
  const service = new RadarSourceRunService(db, registry);

  const result = await service.begin({
    sourceKey: 'tax-assessment-ingest',
    correlationId: 'correlation-1',
    startedAt: new Date('2026-07-26T12:00:00Z'),
  });

  assert.equal(result.runnable, false);
  assert.equal(result.reason, 'no configured source coverage');
  assert.equal(createdRun.status, 'skipped');
  assert.equal(createdRun.errorCode, 'NO_CONFIGURED_COVERAGE');
});

test('successful-empty is healthy while failures retain last verified success', () => {
  const service = new RadarSourceRunService({}, {});
  const previous = {
    status: 'healthy',
    lastSuccessAt: new Date('2026-07-26T10:00:00Z'),
    dataFreshThrough: new Date('2026-07-26T10:00:00Z'),
    consecutiveFailures: 0,
  };
  const successfulEmpty = radarSourceRunCompletionSchema.parse({
    status: 'successful_empty',
    finishedAt: new Date('2026-07-26T12:00:00Z'),
  });
  const failed = radarSourceRunCompletionSchema.parse({
    status: 'failed',
    finishedAt: new Date('2026-07-26T13:00:00Z'),
    errorMessage: 'Provider timeout',
  });

  assert.deepEqual(service.healthTransition(true, previous, successfulEmpty), {
    status: 'healthy',
    lastAttemptAt: new Date('2026-07-26T12:00:00Z'),
    lastSuccessAt: new Date('2026-07-26T12:00:00Z'),
    dataFreshThrough: new Date('2026-07-26T12:00:00Z'),
    consecutiveFailures: 0,
    message: 'Provider completed successfully with no observations',
  });
  assert.deepEqual(service.healthTransition(true, previous, failed), {
    status: 'failed',
    lastAttemptAt: new Date('2026-07-26T13:00:00Z'),
    lastSuccessAt: previous.lastSuccessAt,
    dataFreshThrough: previous.dataFreshThrough,
    consecutiveFailures: 1,
    message: 'Provider timeout',
  });
});

test('completion is idempotent for the same terminal status and rejects conflicts', async () => {
  let updates = 0;
  const terminalRun = {
    id: 'run-1',
    sourceDefinitionId: 'source-1',
    status: 'successful_empty',
    sourceDefinition: { isEnabled: true },
  };
  const tx = {
    radarSourceRun: {
      findUnique: async () => terminalRun,
      update: async () => {
        updates += 1;
      },
    },
    radarSourceHealth: {
      findUnique: async () => null,
      upsert: async () => ({}),
    },
  };
  const db = {
    $transaction: async (callback) => callback(tx),
  };
  const service = new RadarSourceRunService(db, {});

  const same = await service.complete('run-1', { status: 'successful_empty' });
  assert.equal(same, terminalRun);
  assert.equal(updates, 0);

  await assert.rejects(
    () => service.complete('run-1', {
      status: 'failed',
      errorMessage: 'late conflicting result',
    }),
    RadarSourceRunConflictError,
  );
});

test('completion preserves durable consumer event counters regardless of race ordering', async () => {
  let updateData;
  const tx = {
    radarSourceRun: {
      findUnique: async () => ({
        id: 'run-1',
        sourceDefinitionId: 'source-1',
        status: 'started',
        sourceDefinition: { isEnabled: true },
      }),
      update: async ({ data }) => {
        updateData = data;
        return { id: 'run-1', ...data };
      },
    },
    radarSourceHealth: {
      findUnique: async () => null,
      upsert: async () => ({}),
    },
  };
  const service = new RadarSourceRunService(
    { $transaction: async (callback) => callback(tx) },
    {},
  );

  await service.complete('run-1', {
    status: 'success',
    observationsReceived: 2,
    eventsCreated: 0,
    eventsUpdated: 0,
    eventsResolved: 0,
  });

  assert.deepEqual(updateData.eventsCreated, { increment: 0 });
  assert.deepEqual(updateData.eventsUpdated, { increment: 0 });
  assert.deepEqual(updateData.eventsResolved, { increment: 0 });
  assert.equal(updateData.observationsReceived, 2);
});
