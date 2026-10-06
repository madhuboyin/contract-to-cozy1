// Worker gate for docs/architecture/ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md (slice 3a): the domain-events job must have a handler for EVERY DomainEventType
// (before this, an unhandled type was found only when an event of that type was processed), the new DIY_PROJECT_COMPLETED event must reach its handler
// through the injected dependency, and a terminal handler error must dead-letter at once.
const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { DomainEventType } = require('@prisma/client');
const { processDomainEventsJob, MAX_DOMAIN_EVENT_ATTEMPTS } = require('../../src/jobs/processDomainEvents.job.ts');
const { TerminalDomainEventError } = require('@worker-shared/services/domainEvents/terminalDomainEventError');

function harness(event, handlers = {}) {
  const writes = [];
  const noop = async () => ({});
  const deps = {
    prisma: {
      domainEvent: {
        findMany: async () => [event],
        updateMany: async (args) => { writes.push(args); return { count: 1 }; },
      },
      notification: { findFirst: async () => null },
      intelligenceRecomputeRun: {}, intelligenceRecomputeTarget: {},
    },
    notificationService: { create: async () => ({ id: 'n1' }) },
    refinanceTransitionAlert: noop, radarPropertyReconciliation: noop, recomputeRequested: noop, recomputeRetryRequested: noop, captureLinkReconcile: noop,
    askExtractionRequested: noop, radarNotificationMaterialize: noop, goalCandidateAttach: noop, captureNotification: noop, diyProjectCompleted: noop, diyTaskReconciliation: noop,
    ...handlers,
  };
  return { deps, writes, failure: () => writes.find((w) => ['FAILED', 'DEAD_LETTER'].includes(w.data?.status)), success: () => writes.find((w) => w.data?.status === 'PROCESSED') };
}
const event = (type, extra = {}) => ({ id: `ev-${type}`, type, status: 'PENDING', attempts: 0, availableAt: new Date(0), updatedAt: new Date(0), userId: 'u1', propertyId: 'prop-1', payload: {}, ...extra });

// KNOWN GAPS found by this test on October 6, 2026, NOT fixed by the DIY completion work (a separate decision for the owner of the feature):
// `FOLLOW_UP_DUE` is emitted by `src/runners/claimFollowUpDue.poller.ts` for every due claim, but this job has no case for it, so each such event fails,
// retries with backoff and dead-letters after 8 attempts. Listed here so the gate stays exhaustive without hiding it; when a handler is added the
// "still unhandled" assertion below fails and forces the entry to be removed.
const KNOWN_UNHANDLED = { FOLLOW_UP_DUE: 'emitted by claimFollowUpDue.poller.ts; no handler in processDomainEvents.job.ts, so events dead-letter' };

test('EXHAUSTIVE: every DomainEventType in the schema has a handler in the job (none falls through to "Unhandled DomainEvent type")', async () => {
  const types = Object.values(DomainEventType);
  assert.ok(types.includes('DIY_PROJECT_COMPLETED'), 'the worker Prisma client knows the new type (run `npm run prisma:generate` in apps/workers if not)');
  const unhandled = [];
  for (const type of types) {
    const h = harness(event(type));
    await processDomainEventsJob({ batchSize: 1 }, h.deps);
    const failed = h.failure();
    if (failed && /Unhandled DomainEvent type/.test(failed.data.lastError ?? '')) unhandled.push(type);
  }
  assert.deepEqual(unhandled.filter((type) => !(type in KNOWN_UNHANDLED)), [], `no handler for: ${unhandled.join(', ')}`);
  assert.deepEqual(unhandled.filter((type) => type in KNOWN_UNHANDLED).sort(), Object.keys(KNOWN_UNHANDLED).sort(), 'a known gap that now has a handler must be removed from KNOWN_UNHANDLED');
});

test('DIY_PROJECT_COMPLETED reaches the injected handler with the event id and payload, and its outcome is stored on the processed event', async () => {
  const seen = [];
  const payload = { projectId: 'p1', propertyId: 'prop-1', actorUserId: 'dana' };
  const h = harness(event('DIY_PROJECT_COMPLETED', { payload }), { diyProjectCompleted: async (input) => { seen.push(input); return { homeEvent: 'DONE', maintenance: 'NOT_LINKED' }; } });
  const result = await processDomainEventsJob({ batchSize: 1 }, h.deps);
  assert.equal(result.processed, 1);
  assert.deepEqual(seen, [{ id: 'ev-DIY_PROJECT_COMPLETED', payload }]);
  assert.deepEqual(h.success().data.payload.processingOutcome, { homeEvent: 'DONE', maintenance: 'NOT_LINKED' });
});

test('a retryable handler error leaves the event FAILED with backoff and its message; it is not dead-lettered early', async () => {
  const h = harness(event('DIY_PROJECT_COMPLETED'), { diyProjectCompleted: async () => { throw new Error('MAINTENANCE:UNEXPECTED: db blip'); } });
  const result = await processDomainEventsJob({ batchSize: 1 }, h.deps);
  assert.deepEqual([result.failed, result.deadLettered], [1, 0]);
  assert.equal(h.failure().data.status, 'FAILED');
  assert.match(h.failure().data.lastError, /db blip/);
  assert.ok(h.failure().data.availableAt > new Date(), 'scheduled for a later retry');
});

test('a TERMINAL handler error (an integrity failure) dead-letters at once, on the first attempt', async () => {
  const h = harness(event('DIY_PROJECT_COMPLETED'), { diyProjectCompleted: async () => { throw new TerminalDomainEventError('INTEGRITY_CROSS_PROPERTY', 'The linked maintenance task belongs to a different property than the DIY project.'); } });
  const result = await processDomainEventsJob({ batchSize: 1 }, h.deps);
  assert.deepEqual([result.failed, result.deadLettered], [0, 1]);
  assert.equal(h.failure().data.status, 'DEAD_LETTER');
  assert.ok(1 < MAX_DOMAIN_EVENT_ATTEMPTS, 'it did not wait for the attempt limit');
  assert.match(h.failure().data.lastError, /different property/);
});

test('a terminal error is recognized by its flag, so a second copy of the class (the worker alias) still counts', async () => {
  const lookalike = Object.assign(new Error('terminal elsewhere'), { terminal: true });
  const h = harness(event('DIY_PROJECT_COMPLETED'), { diyProjectCompleted: async () => { throw lookalike; } });
  await processDomainEventsJob({ batchSize: 1 }, h.deps);
  assert.equal(h.failure().data.status, 'DEAD_LETTER');
});

test('DIY_TASK_COMPLETED_RECONCILE reaches the injected reconciliation handler with the event id and payload, and its per-project outcomes are stored on the processed event', async () => {
  const seen = [];
  const payload = { taskId: 't1', propertyId: 'prop-1', occurrenceId: 'o1', actorUserId: 'dana', projectIds: ['pA'] };
  const outcome = { result: 'APPLIED', projectOutcomes: { pA: 'HIRED_OUT' } };
  const h = harness(event('DIY_TASK_COMPLETED_RECONCILE', { payload }), { diyTaskReconciliation: async (input) => { seen.push(input); return outcome; } });
  const result = await processDomainEventsJob({ batchSize: 1 }, h.deps);
  assert.equal(result.processed, 1);
  assert.deepEqual(seen, [{ id: 'ev-DIY_TASK_COMPLETED_RECONCILE', payload }]);
  assert.deepEqual(h.success().data.payload.processingOutcome, outcome);
});

test('a TERMINAL reconciliation error (a task on another property) dead-letters at once; a retryable one is FAILED with backoff', async () => {
  const terminal = harness(event('DIY_TASK_COMPLETED_RECONCILE'), { diyTaskReconciliation: async () => { throw new TerminalDomainEventError('INTEGRITY_CROSS_PROPERTY', 'belongs to a different property'); } });
  await processDomainEventsJob({ batchSize: 1 }, terminal.deps);
  assert.equal(terminal.failure().data.status, 'DEAD_LETTER');
  const retryable = harness(event('DIY_TASK_COMPLETED_RECONCILE'), { diyTaskReconciliation: async () => { throw new Error('PROJECT pB: boom'); } });
  await processDomainEventsJob({ batchSize: 1 }, retryable.deps);
  assert.equal(retryable.failure().data.status, 'FAILED');
  assert.match(retryable.failure().data.lastError, /pB: boom/);
});
