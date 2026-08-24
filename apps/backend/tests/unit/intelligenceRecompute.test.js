const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// intelligenceRecompute.service.ts's functions all take `db` (and, for the
// domain-event-emitting functions, `emit`) as explicit parameters — never
// the global prisma/DomainEventsService imports directly — so this is pure
// dependency injection against in-memory fakes, following the same
// convention as bookingWorkReconciliation.test.js.

function makeFakeDb() {
  const runs = new Map(); // key: id
  const runsByIdempotencyKey = new Map();
  const targets = new Map(); // key: id
  const targetsByUniqueKey = new Map(); // key: `${recomputeRunId}:${consumerKey}:${targetKey}`
  const currentness = new Map();

  const db = {
    __store: { runs, targets, currentness },
    intelligenceConsumerCurrentness: {
      upsert: async ({ where, create, update }) => {
        const keyParts = where.propertyId_consumerKey_targetKey;
        const key = `${keyParts.propertyId}:${keyParts.consumerKey}:${keyParts.targetKey}`;
        const row = currentness.has(key) ? { ...currentness.get(key), ...update } : { ...create };
        currentness.set(key, row);
        return row;
      },
      findMany: async ({ where }) => [...currentness.values()].filter((row) => row.propertyId === where.propertyId),
    },
    intelligenceRecomputeRun: {
      findUnique: async ({ where }) => {
        if (where.idempotencyKey) return runsByIdempotencyKey.get(where.idempotencyKey) ?? null;
        return runs.get(where.id) ?? null;
      },
      findFirst: async ({ where, orderBy }) => {
        let matches = [...runs.values()].filter((r) => !where?.propertyId || r.propertyId === where.propertyId);
        if (orderBy?.requestedAt === 'desc') matches = matches.sort((a, b) => b.requestedAt - a.requestedAt);
        return matches[0] ?? null;
      },
      findMany: async ({ where, orderBy, take, include }) => {
        let matches = [...runs.values()].filter((r) => !where?.propertyId || r.propertyId === where.propertyId);
        if (orderBy?.requestedAt === 'desc') matches = matches.sort((a, b) => b.requestedAt - a.requestedAt);
        if (typeof take === 'number') matches = matches.slice(0, take);
        if (include?.targets) {
          matches = matches.map((run) => ({ ...run, targets: [...targets.values()].filter((t) => t.recomputeRunId === run.id) }));
        }
        return matches;
      },
      create: async ({ data }) => {
        if (runsByIdempotencyKey.has(data.idempotencyKey)) {
          const err = new Error('Unique constraint failed on idempotencyKey');
          err.code = 'P2002';
          throw err;
        }
        const row = {
          id: crypto.randomUUID(),
          requestedAt: new Date(),
          startedAt: null,
          completedAt: null,
          errorSummary: null,
          ...data,
        };
        runs.set(row.id, row);
        runsByIdempotencyKey.set(row.idempotencyKey, row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = runs.get(where.id);
        const updated = { ...row, ...data };
        runs.set(where.id, updated);
        runsByIdempotencyKey.set(updated.idempotencyKey, updated);
        return updated;
      },
      updateMany: async ({ where, data }) => {
        const matchesClause = (row, clause) => {
          if (clause.status && row.status !== clause.status) return false;
          if (clause.startedAt?.lt && !(row.startedAt && row.startedAt < clause.startedAt.lt)) return false;
          return true;
        };
        const row = runs.get(where.id);
        if (!row) return { count: 0 };
        const orMatches = !where.OR || where.OR.some((clause) => matchesClause(row, clause));
        if (!orMatches) return { count: 0 };
        runs.set(where.id, { ...row, ...data });
        runsByIdempotencyKey.set(row.idempotencyKey, { ...row, ...data });
        return { count: 1 };
      },
    },
    intelligenceRecomputeTarget: {
      upsert: async ({ where, create, update }) => {
        const { recomputeRunId, consumerKey, targetKey } = where.recomputeRunId_consumerKey_targetKey;
        const key = `${recomputeRunId}:${consumerKey}:${targetKey}`;
        const existingId = targetsByUniqueKey.get(key);
        if (existingId) {
          const existing = targets.get(existingId);
          const updated = { ...existing, ...update };
          targets.set(existingId, updated);
          return updated;
        }
        const row = {
          id: crypto.randomUUID(),
          attempts: 0,
          status: 'PENDING',
          lastError: null,
          inputVersion: null,
          outputVersion: null,
          startedAt: null,
          completedAt: null,
          ...create,
        };
        targets.set(row.id, row);
        targetsByUniqueKey.set(key, row.id);
        return row;
      },
      updateMany: async ({ where, data }) => {
        const row = targets.get(where.id);
        if (!row) return { count: 0 };
        const matchesClause = (clause) => {
          if (clause.status?.in && !clause.status.in.includes(row.status)) return false;
          if (clause.status && typeof clause.status === 'string' && row.status !== clause.status) return false;
          if (clause.startedAt?.lt && !(row.startedAt && row.startedAt < clause.startedAt.lt)) return false;
          return true;
        };
        const matched = where.OR ? where.OR.some(matchesClause) : matchesClause(where);
        if (!matched) return { count: 0 };
        const updated = { ...row, ...data };
        if (data.attempts?.increment) updated.attempts = row.attempts + data.attempts.increment;
        targets.set(row.id, updated);
        return { count: 1 };
      },
      update: async ({ where, data }) => {
        const row = targets.get(where.id);
        const updated = { ...row, ...data };
        targets.set(where.id, updated);
        return updated;
      },
      findUnique: async ({ where }) => targets.get(where.id) ?? null,
      findMany: async ({ where }) => [...targets.values()].filter((t) => t.recomputeRunId === where.recomputeRunId),
    },
  };

  return db;
}

function collectEmittedEvents() {
  const events = [];
  const emit = async (input) => {
    const idempotencyKey = input.idempotencyKey ?? null;
    if (idempotencyKey && events.some((e) => e.idempotencyKey === idempotencyKey)) {
      return events.find((e) => e.idempotencyKey === idempotencyKey);
    }
    const row = { id: crypto.randomUUID(), ...input };
    events.push(row);
    return row;
  };
  return { events, emit };
}

function staticConsumer(overrides = {}) {
  return {
    consumerKey: 'test.static',
    version: 'v1',
    resolutionMode: 'STATIC',
    relevantFactKeys: ['fact.a'],
    relevantSourceEntityTypes: [],
    outputOwner: 'test',
    timeoutMs: 1000,
    retryPolicy: { maxAttempts: 2, backoffMs: 1000 },
    failureBehavior: 'MARK_STALE',
    recompute: async () => {},
    ...overrides,
  };
}

function dynamicConsumer(overrides = {}) {
  return {
    consumerKey: 'test.dynamic',
    version: 'v1',
    resolutionMode: 'DYNAMIC',
    relevantFactKeys: ['fact.b'],
    relevantSourceEntityTypes: [],
    outputOwner: 'test',
    timeoutMs: 1000,
    retryPolicy: { maxAttempts: 2, backoffMs: 1000 },
    failureBehavior: 'MARK_UNAVAILABLE',
    resolveTargets: async () => ({
      targets: [
        { targetKey: 'Snapshot:1', targetType: 'Snapshot', targetId: '1', targetVersion: null },
        { targetKey: 'Snapshot:2', targetType: 'Snapshot', targetId: '2', targetVersion: null },
      ],
      nextCursor: null,
    }),
    recompute: async () => {},
    ...overrides,
  };
}

const {
  computeRecomputeIdempotencyKey,
  requestRecompute,
  resolveApplicableConsumers,
  createOrClaimRecomputeRun,
  materializeTargets,
  processTarget,
  requestTargetRetry,
  deriveRunStatus,
  updateRunStatusFromTargets,
  processRecomputeRequestedEvent,
  processRecomputeRetryRequestedEvent,
  getPropertyRefreshState,
} = require('../../src/services/intelligenceRecompute/intelligenceRecompute.service.ts');

function trigger(overrides = {}) {
  const base = {
    propertyId: 'property-1',
    triggerType: 'PROPERTY_FACT_CHANGED',
    triggerEntityType: 'Property',
    triggerEntityId: 'property-1',
    changedFactKeys: ['fact.a'],
    requestedContextVersion: 'ctx-1',
  };
  const merged = { ...base, ...overrides };
  return { ...merged, idempotencyKey: computeRecomputeIdempotencyKey(merged) };
}

// --- requestRecompute / computeRecomputeIdempotencyKey ---

test('requestRecompute emits a PROPERTY_INTELLIGENCE_RECOMPUTE_REQUESTED event with a deterministic idempotency key', async () => {
  const { events, emit } = collectEmittedEvents();
  await requestRecompute(
    { propertyId: 'property-1', triggerType: 'PROPERTY_FACT_CHANGED', triggerEntityType: 'Property', triggerEntityId: 'property-1', changedFactKeys: ['fact.a'], requestedContextVersion: 'ctx-1' },
    emit,
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'PROPERTY_INTELLIGENCE_RECOMPUTE_REQUESTED');
  assert.equal(events[0].idempotencyKey, 'recompute:PROPERTY_FACT_CHANGED:Property:property-1:property-1:ctx-1');
});

test('requesting the same trigger twice converges on the same idempotency key (no duplicate event)', async () => {
  const { events, emit } = collectEmittedEvents();
  const input = { propertyId: 'property-1', triggerType: 'PROPERTY_FACT_CHANGED', triggerEntityType: 'Property', triggerEntityId: 'property-1', changedFactKeys: ['fact.a'], requestedContextVersion: 'ctx-1' };
  await requestRecompute(input, emit);
  await requestRecompute(input, emit);
  assert.equal(events.length, 1);
});

// --- resolveApplicableConsumers ---

test('resolveApplicableConsumers matches on relevantFactKeys intersection', () => {
  const registry = [staticConsumer({ consumerKey: 'a', relevantFactKeys: ['fact.a'] }), staticConsumer({ consumerKey: 'b', relevantFactKeys: ['fact.z'] })];
  const matched = resolveApplicableConsumers(registry, { triggerType: 'PROPERTY_FACT_CHANGED', changedFactKeys: ['fact.a'] });
  assert.deepEqual(matched.map((c) => c.consumerKey), ['a']);
});

test('resolveApplicableConsumers matches on relevantSourceEntityTypes intersection', () => {
  const registry = [staticConsumer({ consumerKey: 'a', relevantFactKeys: [], relevantSourceEntityTypes: ['Booking'] })];
  const matched = resolveApplicableConsumers(registry, { triggerType: 'SOURCE_RECORD_CHANGED', changedFactKeys: [], sourceEntityTypes: ['Booking'] });
  assert.deepEqual(matched.map((c) => c.consumerKey), ['a']);
});

test('resolveApplicableConsumers returns every entry for MANUAL_REFRESH regardless of changed facts', () => {
  const registry = [staticConsumer({ consumerKey: 'a', relevantFactKeys: ['fact.a'] }), staticConsumer({ consumerKey: 'b', relevantFactKeys: ['fact.z'] })];
  const matched = resolveApplicableConsumers(registry, { triggerType: 'MANUAL_REFRESH', changedFactKeys: [] });
  assert.equal(matched.length, 2);
});

// --- createOrClaimRecomputeRun ---

test('createOrClaimRecomputeRun creates a PENDING run on first call and returns the same run on retry', async () => {
  const db = makeFakeDb();
  const t = trigger();
  const run1 = await createOrClaimRecomputeRun(db, t);
  const run2 = await createOrClaimRecomputeRun(db, t);
  assert.equal(run1.id, run2.id);
  assert.equal(run1.status, 'PENDING');
});

// --- materializeTargets ---

test('materializeTargets creates one PROPERTY target for a STATIC consumer and one per handle for a DYNAMIC consumer', async () => {
  const db = makeFakeDb();
  const run = await createOrClaimRecomputeRun(db, trigger());
  const targets = await materializeTargets(db, { id: run.id, propertyId: run.propertyId, changedFactKeys: ['fact.a'] }, [staticConsumer(), dynamicConsumer()]);
  assert.equal(targets.length, 3);
  const staticTarget = targets.find((t) => t.consumerKey === 'test.static');
  assert.equal(staticTarget.targetKey, 'PROPERTY');
  const dynamicTargets = targets.filter((t) => t.consumerKey === 'test.dynamic');
  assert.deepEqual(dynamicTargets.map((t) => t.targetKey).sort(), ['Snapshot:1', 'Snapshot:2']);
});

test('materializeTargets passes triggerType/triggerEntityType/triggerEntityId through to a DYNAMIC consumer\'s resolveTargets', async () => {
  const db = makeFakeDb();
  const run = await createOrClaimRecomputeRun(db, trigger());
  let received = null;
  const consumer = dynamicConsumer({
    resolveTargets: async (input) => { received = input; return { targets: [], nextCursor: null }; },
  });
  await materializeTargets(
    db,
    { id: run.id, propertyId: run.propertyId, changedFactKeys: ['fact.a'], triggerType: 'SOURCE_RECORD_CHANGED', triggerEntityType: 'Incident', triggerEntityId: 'incident-9' },
    [consumer],
  );
  assert.equal(received.triggerType, 'SOURCE_RECORD_CHANGED');
  assert.equal(received.triggerEntityType, 'Incident');
  assert.equal(received.triggerEntityId, 'incident-9');
  assert.deepEqual(received.changedFactKeys, ['fact.a']);
});

// Finding (Phase 2 follow-up review): manual full refresh has no single
// changed entity, but a DYNAMIC resolver with no visibility into triggerType
// could only ever run its entity-specific query — silently under-resolving
// on MANUAL_REFRESH. triggerType is now threaded through so a resolver can
// branch.
test('materializeTargets passes triggerType through as MANUAL_REFRESH so a DYNAMIC resolver can implement full-refresh behavior', async () => {
  const db = makeFakeDb();
  const run = await createOrClaimRecomputeRun(db, trigger({ triggerType: 'MANUAL_REFRESH' }));
  let received = null;
  const consumer = dynamicConsumer({
    resolveTargets: async (input) => {
      received = input;
      return {
        targets: input.triggerType === 'MANUAL_REFRESH'
          ? [{ targetKey: 'a', targetType: 'X', targetId: 'a', targetVersion: null }, { targetKey: 'b', targetType: 'X', targetId: 'b', targetVersion: null }]
          : [],
        nextCursor: null,
      };
    },
  });
  const handles = await materializeTargets(
    db,
    { id: run.id, propertyId: run.propertyId, changedFactKeys: [], triggerType: 'MANUAL_REFRESH', triggerEntityType: 'Property', triggerEntityId: run.propertyId },
    [consumer],
  );
  assert.equal(received.triggerType, 'MANUAL_REFRESH');
  assert.equal(handles.length, 2, 'a MANUAL_REFRESH-aware resolver can return every relevant target, not just an entity-matched subset');
});

test('materializeTargets pages through a DYNAMIC resolver and deduplicates target keys across pages', async () => {
  const db = makeFakeDb();
  const run = await createOrClaimRecomputeRun(db, trigger());
  const cursors = [];
  const consumer = dynamicConsumer({
    resolveTargets: async (input) => {
      cursors.push(input.cursor);
      assert.equal(input.pageSize, 100);
      return input.cursor === null
        ? { targets: [{ targetKey: 'a', targetType: 'X', targetId: 'a', targetVersion: null }], nextCursor: 'page-2' }
        : { targets: [{ targetKey: 'a', targetType: 'X', targetId: 'a', targetVersion: null }, { targetKey: 'b', targetType: 'X', targetId: 'b', targetVersion: null }], nextCursor: null };
    },
  });
  const targets = await materializeTargets(
    db,
    { id: run.id, propertyId: run.propertyId, changedFactKeys: ['fact.b'], triggerType: 'PROPERTY_FACT_CHANGED', triggerEntityType: 'Property', triggerEntityId: run.propertyId },
    [consumer],
  );
  assert.deepEqual(cursors, [null, 'page-2']);
  assert.deepEqual(targets.map((target) => target.targetKey).sort(), ['a', 'b']);
});

test('materializeTargets rejects a repeated DYNAMIC pagination cursor', async () => {
  const db = makeFakeDb();
  const run = await createOrClaimRecomputeRun(db, trigger());
  const consumer = dynamicConsumer({
    resolveTargets: async () => ({ targets: [], nextCursor: 'same-cursor' }),
  });
  await assert.rejects(
    () => materializeTargets(
      db,
      { id: run.id, propertyId: run.propertyId, changedFactKeys: ['fact.b'], triggerType: 'PROPERTY_FACT_CHANGED', triggerEntityType: 'Property', triggerEntityId: run.propertyId },
      [consumer],
    ),
    /repeated pagination cursor/,
  );
});

test('materializeTargets is idempotent — re-materializing the same run/consumer/target does not duplicate or reset', async () => {
  const db = makeFakeDb();
  const run = await createOrClaimRecomputeRun(db, trigger());
  const first = await materializeTargets(db, { id: run.id, propertyId: run.propertyId, changedFactKeys: ['fact.a'] }, [staticConsumer()]);
  await db.intelligenceRecomputeTarget.update({ where: { id: first[0].id }, data: { status: 'SUCCEEDED' } });
  const second = await materializeTargets(db, { id: run.id, propertyId: run.propertyId, changedFactKeys: ['fact.a'] }, [staticConsumer()]);
  assert.equal(second.length, 1);
  assert.equal(second[0].id, first[0].id);
  assert.equal(second[0].status, 'SUCCEEDED', 're-materialization must not reset an already-processed target');
});

// --- processTarget ---

test('processTarget marks a target SUCCEEDED when the consumer recompute handler resolves', async () => {
  const db = makeFakeDb();
  const run = await createOrClaimRecomputeRun(db, trigger());
  const [target] = await materializeTargets(db, { id: run.id, propertyId: run.propertyId, changedFactKeys: ['fact.a'] }, [staticConsumer()]);
  const outcome = await processTarget(db, run.propertyId, target, staticConsumer());
  assert.equal(outcome, 'SUCCEEDED');
  assert.equal(db.__store.targets.get(target.id).status, 'SUCCEEDED');
});

test('processTarget marks a target FAILED and records lastError when the consumer recompute handler rejects', async () => {
  const db = makeFakeDb();
  const run = await createOrClaimRecomputeRun(db, trigger());
  const failing = staticConsumer({ recompute: async () => { throw new Error('boom'); } });
  const [target] = await materializeTargets(db, { id: run.id, propertyId: run.propertyId, changedFactKeys: ['fact.a'] }, [failing]);
  const outcome = await processTarget(db, run.propertyId, target, failing);
  assert.equal(outcome, 'FAILED');
  const stored = db.__store.targets.get(target.id);
  assert.equal(stored.status, 'FAILED');
  assert.equal(stored.lastError, 'boom');
});

test('processTarget times out a consumer that exceeds its declared timeoutMs', async () => {
  const db = makeFakeDb();
  const run = await createOrClaimRecomputeRun(db, trigger());
  const slow = staticConsumer({ timeoutMs: 20, recompute: () => new Promise((resolve) => setTimeout(resolve, 200)) });
  const [target] = await materializeTargets(db, { id: run.id, propertyId: run.propertyId, changedFactKeys: ['fact.a'] }, [slow]);
  const outcome = await processTarget(db, run.propertyId, target, slow);
  assert.equal(outcome, 'FAILED');
  assert.match(db.__store.targets.get(target.id).lastError, /timed out/);
});

test('processTarget does not reclaim an already-PROCESSING target', async () => {
  const db = makeFakeDb();
  const run = await createOrClaimRecomputeRun(db, trigger());
  const [target] = await materializeTargets(db, { id: run.id, propertyId: run.propertyId, changedFactKeys: ['fact.a'] }, [staticConsumer()]);
  await db.intelligenceRecomputeTarget.update({ where: { id: target.id }, data: { status: 'PROCESSING' } });
  const outcome = await processTarget(db, run.propertyId, target, staticConsumer());
  assert.equal(outcome, 'NOT_CLAIMED');
});

// Finding (Phase 2 follow-up review): a crashed process leaves a target
// claimed PROCESSING forever — withTimeout only bounds an in-process await,
// not a dead process. A target still PROCESSING well past a generous
// multiple of the consumer's own timeoutMs must be reclaimable.
test('processTarget reclaims a target stuck PROCESSING well past the consumer\'s timeoutMs (crash recovery)', async () => {
  const db = makeFakeDb();
  const run = await createOrClaimRecomputeRun(db, trigger());
  const [target] = await materializeTargets(db, { id: run.id, propertyId: run.propertyId, changedFactKeys: ['fact.a'] }, [staticConsumer()]);
  const longAgo = new Date(Date.now() - 10 * 60_000); // 10 minutes ago; default consumer timeoutMs is 1000ms
  await db.intelligenceRecomputeTarget.update({ where: { id: target.id }, data: { status: 'PROCESSING', startedAt: longAgo } });
  const outcome = await processTarget(db, run.propertyId, target, staticConsumer());
  assert.equal(outcome, 'SUCCEEDED', 'a target stuck PROCESSING from a crashed process must be reclaimable, not stuck forever');
});

// --- deriveRunStatus ---

test('deriveRunStatus: all SUCCEEDED -> SUCCEEDED', () => {
  const registry = [staticConsumer()];
  const status = deriveRunStatus([{ status: 'SUCCEEDED', consumerKey: 'test.static', attempts: 1 }], registry);
  assert.equal(status, 'SUCCEEDED');
});

test('deriveRunStatus: any PENDING/PROCESSING -> PROCESSING', () => {
  const registry = [staticConsumer()];
  const status = deriveRunStatus([{ status: 'SUCCEEDED', consumerKey: 'test.static', attempts: 1 }, { status: 'PENDING', consumerKey: 'test.static', attempts: 0 }], registry);
  assert.equal(status, 'PROCESSING');
});

test('deriveRunStatus: a FAILED target with retries remaining counts as in-flight, not terminal', () => {
  const registry = [staticConsumer({ retryPolicy: { maxAttempts: 3, backoffMs: 1000 } })];
  const status = deriveRunStatus([{ status: 'FAILED', consumerKey: 'test.static', attempts: 1 }], registry);
  assert.equal(status, 'PROCESSING');
});

test('deriveRunStatus: mix of SUCCEEDED and retry-exhausted FAILED -> PARTIAL', () => {
  const registry = [staticConsumer({ consumerKey: 'a', retryPolicy: { maxAttempts: 1, backoffMs: 1000 } }), staticConsumer({ consumerKey: 'b' })];
  const status = deriveRunStatus(
    [{ status: 'SUCCEEDED', consumerKey: 'b', attempts: 1 }, { status: 'FAILED', consumerKey: 'a', attempts: 1 }],
    registry,
  );
  assert.equal(status, 'PARTIAL');
});

test('deriveRunStatus: every target retry-exhausted FAILED, zero succeeded -> FAILED', () => {
  const registry = [staticConsumer({ retryPolicy: { maxAttempts: 1, backoffMs: 1000 } })];
  const status = deriveRunStatus([{ status: 'FAILED', consumerKey: 'test.static', attempts: 1 }], registry);
  assert.equal(status, 'FAILED');
});

test('deriveRunStatus: zero targets -> SUCCEEDED (no applicable consumers)', () => {
  const status = deriveRunStatus([], []);
  assert.equal(status, 'SUCCEEDED');
});

// --- requestTargetRetry ---

test('requestTargetRetry emits a per-attempt idempotency key so successive failures each get a fresh retry event', async () => {
  const { events, emit } = collectEmittedEvents();
  await requestTargetRetry({ recomputeRunId: 'run-1', targetId: 'target-1', attempts: 1 }, emit);
  await requestTargetRetry({ recomputeRunId: 'run-1', targetId: 'target-1', attempts: 2 }, emit);
  assert.equal(events.length, 2);
  assert.equal(events[0].idempotencyKey, 'recompute-retry:target-1:1:automatic');
  assert.equal(events[1].idempotencyKey, 'recompute-retry:target-1:2:automatic');
});

// --- processRecomputeRequestedEvent (end-to-end orchestration) ---

test('processRecomputeRequestedEvent: happy path resolves consumers, materializes targets, processes them, and rolls the run up to SUCCEEDED', async () => {
  const db = makeFakeDb();
  const { emit } = collectEmittedEvents();
  const registry = [staticConsumer()];
  const run = await processRecomputeRequestedEvent(db, trigger(), registry, emit);
  assert.equal(run.status, 'SUCCEEDED');
  assert.ok(run.completedAt);
  const targets = await db.intelligenceRecomputeTarget.findMany({ where: { recomputeRunId: run.id } });
  assert.equal(targets.length, 1);
  assert.equal(targets[0].status, 'SUCCEEDED');
});

test('processRecomputeRequestedEvent: a consumer that only declares relevantSourceEntityTypes is matched via the trigger\'s own entity type', async () => {
  const db = makeFakeDb();
  const { emit } = collectEmittedEvents();
  const registry = [staticConsumer({ consumerKey: 'entity-type-only', relevantFactKeys: [], relevantSourceEntityTypes: ['Incident'] })];
  const run = await processRecomputeRequestedEvent(db, trigger({ triggerEntityType: 'Incident', changedFactKeys: ['unrelated.fact'] }), registry, emit);
  const targets = await db.intelligenceRecomputeTarget.findMany({ where: { recomputeRunId: run.id } });
  assert.equal(targets.length, 1, 'relevantSourceEntityTypes-only consumer must be selected once triggerEntityType is threaded into resolveApplicableConsumers');
});

test('processRecomputeRequestedEvent: a trigger matching zero consumers still produces a SUCCEEDED run with zero targets', async () => {
  const db = makeFakeDb();
  const { emit } = collectEmittedEvents();
  const run = await processRecomputeRequestedEvent(db, trigger({ changedFactKeys: ['fact.unrelated'] }), [staticConsumer()], emit);
  assert.equal(run.status, 'SUCCEEDED');
});

test('processRecomputeRequestedEvent: a redelivered (already-processed) event does not reprocess', async () => {
  const db = makeFakeDb();
  const { emit } = collectEmittedEvents();
  const registry = [staticConsumer()];
  const t = trigger();
  const run1 = await processRecomputeRequestedEvent(db, t, registry, emit);
  const targetsBefore = await db.intelligenceRecomputeTarget.findMany({ where: { recomputeRunId: run1.id } });
  const run2 = await processRecomputeRequestedEvent(db, t, registry, emit);
  const targetsAfter = await db.intelligenceRecomputeTarget.findMany({ where: { recomputeRunId: run2.id } });
  assert.equal(run1.id, run2.id);
  assert.equal(targetsBefore.length, targetsAfter.length);
});

// Finding (Phase 2 follow-up review): a crash between marking the run
// PROCESSING and it reaching a terminal status previously left it stuck
// forever — a retry delivery would see status !== 'PENDING' and bail
// immediately, and nothing would ever reclaim it.
test('processRecomputeRequestedEvent: a run stuck PROCESSING from a crashed delivery is reclaimed and completed by a later delivery', async () => {
  const db = makeFakeDb();
  const { emit } = collectEmittedEvents();
  const registry = [staticConsumer()];
  const t = trigger();
  const run = await createOrClaimRecomputeRun(db, t);
  await db.intelligenceRecomputeRun.update({
    where: { id: run.id },
    data: { status: 'PROCESSING', startedAt: new Date(Date.now() - 60 * 60_000) }, // 1 hour ago
  });

  const result = await processRecomputeRequestedEvent(db, t, registry, emit);
  assert.equal(result.status, 'SUCCEEDED', 'the stale run must be reclaimed and actually processed to completion, not left stuck');
  const targets = await db.intelligenceRecomputeTarget.findMany({ where: { recomputeRunId: run.id } });
  assert.equal(targets.length, 1);
  assert.equal(targets[0].status, 'SUCCEEDED');
});

test('processRecomputeRequestedEvent: a run PROCESSING for only a short time is left alone (not stale yet)', async () => {
  const db = makeFakeDb();
  const { emit } = collectEmittedEvents();
  const registry = [staticConsumer()];
  const t = trigger();
  const run = await createOrClaimRecomputeRun(db, t);
  await db.intelligenceRecomputeRun.update({
    where: { id: run.id },
    data: { status: 'PROCESSING', startedAt: new Date() },
  });

  const result = await processRecomputeRequestedEvent(db, t, registry, emit);
  assert.equal(result.status, 'PROCESSING', 'a freshly in-flight run must not be reclaimed out from under its real owner');
  const targets = await db.intelligenceRecomputeTarget.findMany({ where: { recomputeRunId: run.id } });
  assert.equal(targets.length, 0, 'no processing should have happened for the not-yet-stale run');
});

test('processRecomputeRequestedEvent: a failing consumer with retry budget remaining leaves the run PROCESSING and emits a retry request', async () => {
  const db = makeFakeDb();
  const { events, emit } = collectEmittedEvents();
  const failing = staticConsumer({ retryPolicy: { maxAttempts: 2, backoffMs: 1000 }, recompute: async () => { throw new Error('boom'); } });
  const run = await processRecomputeRequestedEvent(db, trigger(), [failing], emit);
  assert.equal(run.status, 'PROCESSING');
  const retryEvents = events.filter((e) => e.type === 'PROPERTY_INTELLIGENCE_RECOMPUTE_RETRY_REQUESTED');
  assert.equal(retryEvents.length, 1);
  assert.equal(retryEvents[0].payload.recomputeRunId, run.id);
});

test('processRecomputeRequestedEvent: a failing consumer with retry budget exhausted (maxAttempts=1) rolls the run to FAILED and emits no retry', async () => {
  const db = makeFakeDb();
  const { events, emit } = collectEmittedEvents();
  const failing = staticConsumer({ retryPolicy: { maxAttempts: 1, backoffMs: 1000 }, recompute: async () => { throw new Error('boom'); } });
  const run = await processRecomputeRequestedEvent(db, trigger(), [failing], emit);
  assert.equal(run.status, 'FAILED');
  assert.equal(events.filter((e) => e.type === 'PROPERTY_INTELLIGENCE_RECOMPUTE_RETRY_REQUESTED').length, 0);
});

// Finding (Phase 2 follow-up review): every consumer declares
// failureBehavior, but nothing read it — a permanently-failed target's
// declared MARK_STALE/MARK_UNAVAILABLE policy never actually ran.
test('processRecomputeRequestedEvent: onPermanentFailure fires once retry budget is exhausted, with the failureBehavior and target handle', async () => {
  const db = makeFakeDb();
  const { emit } = collectEmittedEvents();
  let received = null;
  const failing = staticConsumer({
    retryPolicy: { maxAttempts: 1, backoffMs: 1000 },
    failureBehavior: 'MARK_STALE',
    recompute: async () => { throw new Error('boom'); },
    onPermanentFailure: async (input) => { received = input; },
  });
  await processRecomputeRequestedEvent(db, trigger(), [failing], emit);
  assert.ok(received, 'onPermanentFailure must be called once the target is permanently FAILED');
  assert.equal(received.failureBehavior, 'MARK_STALE');
  assert.equal(received.propertyId, 'property-1');
  assert.equal(received.target.targetKey, 'PROPERTY');
});

test('processRecomputeRequestedEvent: onPermanentFailure does NOT fire while retry budget still remains', async () => {
  const db = makeFakeDb();
  const { emit } = collectEmittedEvents();
  let calls = 0;
  const failing = staticConsumer({
    retryPolicy: { maxAttempts: 3, backoffMs: 1000 },
    recompute: async () => { throw new Error('boom'); },
    onPermanentFailure: async () => { calls += 1; },
  });
  await processRecomputeRequestedEvent(db, trigger(), [failing], emit);
  assert.equal(calls, 0, 'a target still eligible for retry has not permanently failed yet');
});

test('processRecomputeRequestedEvent: a throwing onPermanentFailure handler does not affect the target\'s already-FAILED status', async () => {
  const db = makeFakeDb();
  const { emit } = collectEmittedEvents();
  const failing = staticConsumer({
    retryPolicy: { maxAttempts: 1, backoffMs: 1000 },
    recompute: async () => { throw new Error('boom'); },
    onPermanentFailure: async () => { throw new Error('handler itself broke'); },
  });
  const run = await processRecomputeRequestedEvent(db, trigger(), [failing], emit);
  assert.equal(run.status, 'FAILED', 'onPermanentFailure failing must not mask the real target outcome');
});

test('processRecomputeRequestedEvent: one failing and one succeeding consumer (both retry-exhausted/terminal) rolls the run to PARTIAL', async () => {
  const db = makeFakeDb();
  const { emit } = collectEmittedEvents();
  const failing = staticConsumer({ consumerKey: 'test.failing', relevantFactKeys: ['fact.a'], retryPolicy: { maxAttempts: 1, backoffMs: 1000 }, recompute: async () => { throw new Error('boom'); } });
  const succeeding = staticConsumer({ consumerKey: 'test.succeeding', relevantFactKeys: ['fact.a'] });
  const run = await processRecomputeRequestedEvent(db, trigger(), [failing, succeeding], emit);
  assert.equal(run.status, 'PARTIAL');
});

// --- processRecomputeRetryRequestedEvent ---

test('processRecomputeRetryRequestedEvent: retrying a target that now succeeds moves the run from PARTIAL to SUCCEEDED', async () => {
  const db = makeFakeDb();
  const { emit } = collectEmittedEvents();
  let shouldFail = true;
  const flaky = staticConsumer({ retryPolicy: { maxAttempts: 2, backoffMs: 1000 }, recompute: async () => { if (shouldFail) throw new Error('boom'); } });
  const inFlightRun = await processRecomputeRequestedEvent(db, trigger(), [flaky], emit);
  assert.equal(inFlightRun.status, 'PROCESSING');

  const [target] = await db.intelligenceRecomputeTarget.findMany({ where: { recomputeRunId: inFlightRun.id } });
  shouldFail = false;
  const retriedRun = await processRecomputeRetryRequestedEvent(db, { recomputeRunId: inFlightRun.id, targetId: target.id }, [flaky], emit);
  assert.equal(retriedRun.status, 'SUCCEEDED');
});

test('processRecomputeRetryRequestedEvent: throws on an unknown target/run pair rather than silently no-oping', async () => {
  const db = makeFakeDb();
  const { emit } = collectEmittedEvents();
  await assert.rejects(() => processRecomputeRetryRequestedEvent(db, { recomputeRunId: 'no-such-run', targetId: 'no-such-target' }, [staticConsumer()], emit), /unknown target/);
});

// --- getPropertyRefreshState ---

test('getPropertyRefreshState: UNKNOWN for a property with no recompute runs', async () => {
  const db = makeFakeDb();
  const state = await getPropertyRefreshState(db, 'property-nonexistent');
  assert.equal(state, 'UNKNOWN');
});

test('getPropertyRefreshState reflects the most recently requested run\'s status', async () => {
  const db = makeFakeDb();
  const { emit } = collectEmittedEvents();
  await processRecomputeRequestedEvent(db, trigger(), [staticConsumer()], emit);
  const state = await getPropertyRefreshState(db, 'property-1');
  assert.equal(state, 'CURRENT');
});

// Finding (Phase 2 follow-up review): trusting only the latest RUN's own
// rolled-up status is wrong — a later run triggered by an unrelated fact
// change can resolve a completely different subset of consumers, succeed,
// and mask an earlier run's still-permanently-failed consumer.
test('getPropertyRefreshState is not masked by a later, unrelated run that succeeds for a different consumer', async () => {
  const db = makeFakeDb();
  const { emit } = collectEmittedEvents();
  const failingCoverage = staticConsumer({
    consumerKey: 'test.coverage', relevantFactKeys: ['fact.coverage'],
    retryPolicy: { maxAttempts: 1, backoffMs: 1000 },
    recompute: async () => { throw new Error('coverage boom'); },
  });
  const okPersonalization = staticConsumer({ consumerKey: 'test.personalization', relevantFactKeys: ['fact.personalization'] });
  const registry = [failingCoverage, okPersonalization];

  // Run 1: triggered by a fact only coverage cares about — permanently fails.
  await processRecomputeRequestedEvent(db, trigger({ changedFactKeys: ['fact.coverage'], requestedContextVersion: 'v1' }), registry, emit);
  // Run 2: triggered by an unrelated fact only personalization cares about — succeeds cleanly.
  await processRecomputeRequestedEvent(db, trigger({ changedFactKeys: ['fact.personalization'], requestedContextVersion: 'v2' }), registry, emit);

  const state = await getPropertyRefreshState(db, 'property-1', registry);
  // Genuinely PARTIALLY_REFRESHED, not CURRENT: one consumer (personalization)
  // is current, another (coverage) is permanently failed — the point of this
  // test is that it is NOT simply "CURRENT" (which run 2 alone would report).
  assert.equal(state, 'PARTIALLY_REFRESHED', 'coverage\'s permanent failure in run 1 must not be masked by run 2 succeeding for an unrelated consumer');
});

test('getPropertyRefreshState reports CURRENT once a previously-failed consumer later succeeds', async () => {
  const db = makeFakeDb();
  const { emit } = collectEmittedEvents();
  let shouldFail = true;
  const flaky = staticConsumer({
    retryPolicy: { maxAttempts: 1, backoffMs: 1000 },
    recompute: async () => { if (shouldFail) throw new Error('boom'); },
  });
  await processRecomputeRequestedEvent(db, trigger({ requestedContextVersion: 'v1' }), [flaky], emit);
  assert.equal(await getPropertyRefreshState(db, 'property-1', [flaky]), 'DEGRADED');

  // A real gap, not an arbitrary test delay: aggregation orders targets by
  // requestedAt/createdAt (millisecond resolution, no monotonic sequence
  // column) — two runs genuinely tied at the same millisecond have no
  // reliable tiebreak. In production, distinct runs are triggered by
  // distinct real-world domain events processed by a worker, not
  // back-to-back synchronous calls, so this reflects realistic separation
  // rather than papering over the assertion below.
  await new Promise((resolve) => setTimeout(resolve, 2));

  shouldFail = false;
  await processRecomputeRequestedEvent(db, trigger({ requestedContextVersion: 'v2' }), [flaky], emit);
  assert.equal(await getPropertyRefreshState(db, 'property-1', [flaky]), 'CURRENT', 'the same consumer\'s later success must supersede its earlier failure');
});
