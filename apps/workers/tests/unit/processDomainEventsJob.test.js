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
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  MAX_DOMAIN_EVENT_ATTEMPTS,
  processDomainEventsJob,
} = require('../../src/jobs/processDomainEvents.job.ts');

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

function fakeDeps({ pendingEvents, existingNotification = null, notificationCreateShouldFailFor = new Set(), lockShouldFail = false }) {
  const calls = { updates: [], creates: [], notificationFindFirstArgs: [], refinanceAlerts: [] };

  const deps = {
    prisma: {
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
    },
    notificationService: {
      create: async (input) => {
        calls.creates.push(input);
        if (notificationCreateShouldFailFor.has(input.entityId)) throw new Error(`create failed for ${input.entityId}`);
        return { id: `notification-${calls.creates.length}` };
      },
    },
    refinanceTransitionAlert: async (input) => {
      calls.refinanceAlerts.push(input);
      return { status: 'SUPPRESSED', reason: 'DELIVERY_DISABLED' };
    },
  };
  return { deps, calls };
}

test('processes a CLAIM_SUBMITTED event: creates a notification and marks PROCESSED', async () => {
  const { deps, calls } = fakeDeps({ pendingEvents: [eventFixture()] });

  const result = await processDomainEventsJob(undefined, deps);

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
  const { deps, calls } = fakeDeps({
    pendingEvents: [eventFixture({ type: 'CLAIM_CLOSED', payload: { claimId: 'claim-1', status: 'SETTLED' } })],
  });

  await processDomainEventsJob(undefined, deps);

  assert.equal(calls.creates[0].type, 'CLAIM_CLOSED');
  assert.equal(calls.creates[0].title, 'Claim closed');
});

for (const [type, transitionType] of [
  ['REFINANCE_OPPORTUNITY_OPENED', 'OPEN'],
  ['REFINANCE_OPPORTUNITY_UPDATED', 'UPDATE'],
  ['REFINANCE_OPPORTUNITY_CLOSED', 'CLOSED'],
]) {
  test(`acknowledges a valid ${type} event with the expected alert behavior`, async () => {
    const { deps, calls } = fakeDeps({
      pendingEvents: [
        eventFixture({
          type,
          payload: { propertyId: 'property-1', snapshotId: 'snapshot-1', transitionType },
        }),
      ],
    });

    const result = await processDomainEventsJob(undefined, deps);

    assert.equal(result.processed, 1);
    assert.equal(calls.creates.length, 0);
    assert.equal(calls.refinanceAlerts.length, transitionType === 'CLOSED' ? 0 : 1);
    const terminal = calls.updates.find((update) => update.kind === 'terminal');
    assert.equal(terminal.args.data.status, 'PROCESSED');
  });
}

test('acknowledges a valid REFINANCE_DATA_REQUIRED event without external delivery', async () => {
  const { deps, calls } = fakeDeps({
    pendingEvents: [
      eventFixture({
        type: 'REFINANCE_DATA_REQUIRED',
        payload: {
          propertyId: 'property-1',
          snapshotId: 'snapshot-1',
          transitionType: 'DATA_REQUIRED',
          missingFields: ['interestRate'],
        },
      }),
    ],
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 1);
  assert.equal(calls.creates.length, 0);
  const terminal = calls.updates.find((update) => update.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'PROCESSED');
});

test('a malformed refinance transition is retried as FAILED', async () => {
  const { deps, calls } = fakeDeps({
    pendingEvents: [
      eventFixture({
        type: 'REFINANCE_OPPORTUNITY_OPENED',
        payload: { propertyId: 'property-1', snapshotId: 'snapshot-1', transitionType: 'CLOSED' },
      }),
    ],
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.failed, 1);
  const terminal = calls.updates.find((update) => update.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'FAILED');
  assert.match(terminal.args.data.lastError, /transition mismatch/);
});

test('idempotency: does not create a duplicate notification when one already exists for this domain event', async () => {
  const { deps, calls } = fakeDeps({
    pendingEvents: [eventFixture()],
    existingNotification: { id: 'notification-existing' },
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 1, 'still counts as processed — the event itself completed successfully');
  assert.equal(calls.creates.length, 0, 'must not call NotificationService.create again');
});

test('an unknown event type marks that event FAILED without throwing out of the batch', async () => {
  const { deps, calls } = fakeDeps({
    pendingEvents: [eventFixture({ id: 'event-1', type: 'SOMETHING_UNKNOWN' })],
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 0);
  const terminal = calls.updates.find((u) => u.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'FAILED');
  assert.match(terminal.args.data.lastError, /Unhandled DomainEvent type/);
});

test('one event failing does not abort processing for the rest of the batch', async () => {
  const { deps, calls } = fakeDeps({
    pendingEvents: [
      eventFixture({ id: 'event-1', payload: { claimId: 'claim-1' } }),
      eventFixture({ id: 'event-2', payload: { claimId: 'claim-2' } }),
    ],
    notificationCreateShouldFailFor: new Set(['claim-1']),
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 1, 'only the successful one counts');
  const terminals = calls.updates.filter((u) => u.kind === 'terminal');
  assert.equal(terminals.length, 2, 'both events must reach a terminal update');
  assert.ok(terminals.some((t) => t.args.data.status === 'FAILED'));
  assert.ok(terminals.some((t) => t.args.data.status === 'PROCESSED'));
});

test('a FAILED event still within its backoff window is skipped, not retried', async () => {
  const { deps, calls } = fakeDeps({
    pendingEvents: [
      eventFixture({ status: 'FAILED', attempts: 1, updatedAt: new Date() }), // 1-minute backoff, just failed — not eligible yet
    ],
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 0);
  assert.equal(calls.updates.filter((u) => u.kind === 'claim').length, 0, 'must not even attempt to claim it yet');
});

test('a FAILED event past its backoff window is retried', async () => {
  const { deps } = fakeDeps({
    pendingEvents: [
      eventFixture({ status: 'FAILED', attempts: 1, updatedAt: new Date(Date.now() - 5 * 60 * 1000) }), // 5 min ago, 1-min backoff elapsed
    ],
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 1);
});

test('moves a repeatedly failing event to DEAD_LETTER after the final attempt', async () => {
  const { deps, calls } = fakeDeps({
    pendingEvents: [
      eventFixture({
        type: 'SOMETHING_UNKNOWN',
        attempts: MAX_DOMAIN_EVENT_ATTEMPTS - 1,
      }),
    ],
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.deadLettered, 1);
  const terminal = calls.updates.find((update) => update.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'DEAD_LETTER');
});

test('a lost claim race (another replica already locked it) is skipped without double-processing', async () => {
  const { deps, calls } = fakeDeps({
    pendingEvents: [eventFixture()],
    lockShouldFail: true,
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 0);
  assert.equal(calls.creates.length, 0);
});

test('returns { processed: 0 } immediately when there are no pending events', async () => {
  const { deps, calls } = fakeDeps({ pendingEvents: [] });

  const result = await processDomainEventsJob(undefined, deps);

  assert.deepEqual(result, { processed: 0 });
  assert.equal(calls.updates.length, 0);
});
