// apps/workers/tests/unit/processDomainEventsJob.test.js
//
// W4 item 4: processDomainEventsJob (the real logic behind the
// domain-events-poller runner — the poller itself is a thin setInterval
// wrapper) had no dedicated test. Covers the atomic per-event claim,
// backoff-eligibility gating for FAILED events, the double idempotency
// layer (a findFirst pre-check in addition to NotificationService.create's
// own dedup), CLAIM_SUBMITTED/CLAIM_CLOSED handling, and that an unknown
// event type or a handler throw marks that one event FAILED without
// aborting the batch.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function eventFixture(overrides = {}) {
  return {
    id: 'event-1',
    type: 'CLAIM_SUBMITTED',
    status: 'PENDING',
    attempts: 0,
    updatedAt: new Date(),
    userId: 'user-1',
    propertyId: 'property-1',
    payload: { claimId: 'claim-1', providerName: 'Acme', claimNumber: 'C-1' },
    ...overrides,
  };
}

function loadJob({ pendingEvents, existingNotification = null, notificationCreateShouldFailFor = new Set(), lockShouldFail = false }) {
  const calls = { updates: [], creates: [], notificationFindFirstArgs: [] };

  const prismaMock = {
    domainEvent: {
      findMany: async () => pendingEvents,
      updateMany: async (args) => {
        calls.updates.push({ kind: 'claim', args });
        return { count: lockShouldFail ? 0 : 1 };
      },
      update: async (args) => {
        calls.updates.push({ kind: 'terminal', args });
        return { id: args.where.id, ...args.data };
      },
    },
    notification: {
      findFirst: async (args) => {
        calls.notificationFindFirstArgs.push(args);
        return existingNotification;
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const notificationServicePath = require.resolve('../../../backend/src/services/notification.service.ts');
  require.cache[notificationServicePath] = {
    id: notificationServicePath,
    filename: notificationServicePath,
    loaded: true,
    exports: {
      NotificationService: {
        create: async (input) => {
          calls.creates.push(input);
          if (notificationCreateShouldFailFor.has(input.entityId)) throw new Error(`create failed for ${input.entityId}`);
          return { id: `notification-${calls.creates.length}` };
        },
      },
    },
  };

  const jobPath = require.resolve('../../src/jobs/processDomainEvents.job.ts');
  delete require.cache[jobPath];
  return { ...require(jobPath), calls };
}

test('processes a CLAIM_SUBMITTED event: creates a notification and marks PROCESSED', async () => {
  const { processDomainEventsJob, calls } = loadJob({ pendingEvents: [eventFixture()] });

  const result = await processDomainEventsJob();

  assert.equal(result.processed, 1);
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.creates[0].type, 'CLAIM_SUBMITTED');
  assert.equal(calls.creates[0].category, 'WORKFLOW');
  assert.equal(calls.creates[0].urgency, 'MATERIAL');
  assert.equal(calls.creates[0].entityId, 'claim-1');
  const terminal = calls.updates.find((u) => u.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'PROCESSED');
});

test('processes a CLAIM_CLOSED event correctly', async () => {
  const { processDomainEventsJob, calls } = loadJob({
    pendingEvents: [eventFixture({ type: 'CLAIM_CLOSED', payload: { claimId: 'claim-1', status: 'SETTLED' } })],
  });

  await processDomainEventsJob();

  assert.equal(calls.creates[0].type, 'CLAIM_CLOSED');
  assert.equal(calls.creates[0].title, 'Claim closed');
});

test('idempotency: does not create a duplicate notification when one already exists for this domain event', async () => {
  const { processDomainEventsJob, calls } = loadJob({
    pendingEvents: [eventFixture()],
    existingNotification: { id: 'notification-existing' },
  });

  const result = await processDomainEventsJob();

  assert.equal(result.processed, 1, 'still counts as processed — the event itself completed successfully');
  assert.equal(calls.creates.length, 0, 'must not call NotificationService.create again');
});

test('an unknown event type marks that event FAILED without throwing out of the batch', async () => {
  const { processDomainEventsJob, calls } = loadJob({
    pendingEvents: [eventFixture({ id: 'event-1', type: 'SOMETHING_UNKNOWN' })],
  });

  const result = await processDomainEventsJob();

  assert.equal(result.processed, 0);
  const terminal = calls.updates.find((u) => u.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'FAILED');
  assert.match(terminal.args.data.lastError, /Unhandled DomainEvent type/);
});

test('one event failing does not abort processing for the rest of the batch', async () => {
  const { processDomainEventsJob, calls } = loadJob({
    pendingEvents: [
      eventFixture({ id: 'event-1', payload: { claimId: 'claim-1' } }),
      eventFixture({ id: 'event-2', payload: { claimId: 'claim-2' } }),
    ],
    notificationCreateShouldFailFor: new Set(['claim-1']),
  });

  const result = await processDomainEventsJob();

  assert.equal(result.processed, 1, 'only the successful one counts');
  const terminals = calls.updates.filter((u) => u.kind === 'terminal');
  assert.equal(terminals.length, 2, 'both events must reach a terminal update');
  assert.ok(terminals.some((t) => t.args.data.status === 'FAILED'));
  assert.ok(terminals.some((t) => t.args.data.status === 'PROCESSED'));
});

test('a FAILED event still within its backoff window is skipped, not retried', async () => {
  const { processDomainEventsJob, calls } = loadJob({
    pendingEvents: [
      eventFixture({ status: 'FAILED', attempts: 1, updatedAt: new Date() }), // 1-minute backoff, just failed — not eligible yet
    ],
  });

  const result = await processDomainEventsJob();

  assert.equal(result.processed, 0);
  assert.equal(calls.updates.filter((u) => u.kind === 'claim').length, 0, 'must not even attempt to claim it yet');
});

test('a FAILED event past its backoff window is retried', async () => {
  const { processDomainEventsJob } = loadJob({
    pendingEvents: [
      eventFixture({ status: 'FAILED', attempts: 1, updatedAt: new Date(Date.now() - 5 * 60 * 1000) }), // 5 min ago, 1-min backoff elapsed
    ],
  });

  const result = await processDomainEventsJob();

  assert.equal(result.processed, 1);
});

test('a lost claim race (another replica already locked it) is skipped without double-processing', async () => {
  const { processDomainEventsJob, calls } = loadJob({
    pendingEvents: [eventFixture()],
    lockShouldFail: true,
  });

  const result = await processDomainEventsJob();

  assert.equal(result.processed, 0);
  assert.equal(calls.creates.length, 0);
});

test('returns { processed: 0 } immediately when there are no pending events', async () => {
  const { processDomainEventsJob, calls } = loadJob({ pendingEvents: [] });

  const result = await processDomainEventsJob();

  assert.deepEqual(result, { processed: 0 });
  assert.equal(calls.updates.length, 0);
});
