const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Item #19 (§5.15) Slice 1: snooze, reschedule, and defer as three genuinely
// distinct operations. Same test granularity as homeOperationsWriteApi.test.js
// (usecase level; the controller handlers are thin pass-throughs).

const workItems = new Map();
const workEvents = new Map();

function reset() {
  workItems.clear();
  workEvents.clear();
}

const prismaMock = {
  operationalWorkItem: {
    findUnique: async ({ where }) => workItems.get(where.id) ?? null,
    update: async ({ where, data }) => {
      const row = { ...workItems.get(where.id), ...data, updatedAt: new Date() };
      workItems.set(where.id, row);
      return row;
    },
  },
  operationalWorkEvent: {
    create: async ({ data }) => {
      const key = `${data.workItemId}:${data.idempotencyKey}`;
      if (workEvents.has(key)) { const err = new Error('dup event'); err.code = 'P2002'; throw err; }
      const row = { id: crypto.randomUUID(), createdAt: new Date(), ...data };
      workEvents.set(key, row);
      return row;
    },
    findUnique: async ({ where }) => {
      const k = where.workItemId_idempotencyKey;
      return workEvents.get(`${k.workItemId}:${k.idempotencyKey}`) ?? null;
    },
  },
  // No test fixture in this file seeds an OperationalWorkSource, so
  // assertDecisionLineageSatisfiedForAcceptance's lookup always misses —
  // that's the correct no-op default for these non-repair-replace items.
  operationalWorkSource: {
    findMany: async () => [],
  },
  replaceRepairAnalysis: {
    findUnique: async () => null,
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const { snoozeWorkItem } = require('../../src/modules/homeOperations/application/snoozeWorkItem.usecase.ts');
const { rescheduleWorkItem } = require('../../src/modules/homeOperations/application/rescheduleWorkItem.usecase.ts');
const { transitionWorkItem } = require('../../src/modules/homeOperations/application/transitionWorkItem.usecase.ts');

function seedWorkItem(overrides = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  const row = {
    id, propertyId: 'property-1', state: 'ACCEPTED', acceptanceState: 'ACCEPTED', disposition: null,
    dueWindowStart: null, dueAt: new Date('2026-08-01T00:00:00.000Z'), dueWindowEnd: null,
    snoozedUntil: null, deferredUntil: null, nextReviewAt: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides, id,
  };
  workItems.set(id, row);
  return row;
}

// ── Snooze ───────────────────────────────────────────────────────────────

test('snoozeWorkItem sets snoozedUntil and never touches state or due fields', async () => {
  reset();
  const item = seedWorkItem();
  const snoozedUntil = new Date('2026-08-15T00:00:00.000Z');

  const updated = await snoozeWorkItem({ workItemId: item.id, snoozedUntil, actorUserId: 'user-1', idempotencyKey: 'k1' });

  assert.equal(updated.snoozedUntil.getTime(), snoozedUntil.getTime());
  assert.equal(updated.state, 'ACCEPTED', 'snooze must not change state');
  assert.equal(updated.dueAt.getTime(), item.dueAt.getTime(), 'snooze must not change dueAt');
});

test('snoozeWorkItem clears an existing snooze when passed null', async () => {
  reset();
  const item = seedWorkItem({ snoozedUntil: new Date('2026-08-15T00:00:00.000Z') });

  const updated = await snoozeWorkItem({ workItemId: item.id, snoozedUntil: null, actorUserId: 'user-1', idempotencyKey: 'k1' });

  assert.equal(updated.snoozedUntil, null);
});

// ── Reschedule ───────────────────────────────────────────────────────────

test('rescheduleWorkItem overwrites dueAt, records the previous value, and does not change state', async () => {
  reset();
  const item = seedWorkItem({ dueAt: new Date('2026-08-01T00:00:00.000Z') });
  const newDueAt = new Date('2026-09-01T00:00:00.000Z');

  const updated = await rescheduleWorkItem({ workItemId: item.id, dueAt: newDueAt, actorUserId: 'user-1', idempotencyKey: 'k1' });

  assert.equal(updated.dueAt.getTime(), newDueAt.getTime());
  assert.equal(updated.state, 'ACCEPTED', 'reschedule must not change state');

  const event = [...workEvents.values()].find((e) => e.workItemId === item.id);
  assert.equal(event.eventType, 'WORK_RESCHEDULED');
  assert.equal(event.payload.previousDueAt, item.dueAt.toISOString());
  assert.equal(event.payload.newDueAt, newDueAt.toISOString());
});

test('rescheduleWorkItem only touches the fields explicitly provided', async () => {
  reset();
  const item = seedWorkItem({
    dueWindowStart: new Date('2026-07-25T00:00:00.000Z'),
    dueAt: new Date('2026-08-01T00:00:00.000Z'),
    dueWindowEnd: new Date('2026-08-08T00:00:00.000Z'),
  });

  const updated = await rescheduleWorkItem({ workItemId: item.id, dueAt: new Date('2026-09-01T00:00:00.000Z'), actorUserId: 'user-1', idempotencyKey: 'k1' });

  assert.equal(updated.dueWindowStart.getTime(), item.dueWindowStart.getTime(), 'dueWindowStart must be untouched when not provided');
  assert.equal(updated.dueWindowEnd.getTime(), item.dueWindowEnd.getTime(), 'dueWindowEnd must be untouched when not provided');
});

test('rescheduleWorkItem throws for a missing work item', async () => {
  reset();
  await assert.rejects(() => rescheduleWorkItem({ workItemId: 'does-not-exist', dueAt: new Date(), actorUserId: 'user-1', idempotencyKey: 'k1' }));
});

// ── Defer (via transitionWorkItem) ──────────────────────────────────────

test('transitioning to DEFERRED with a timestampValue makes deferredUntil a real future date, not "now"', async () => {
  reset();
  const item = seedWorkItem();
  const deferUntil = new Date('2026-09-15T00:00:00.000Z');

  const updated = await transitionWorkItem({
    workItemId: item.id, to: 'DEFERRED', actorType: 'USER', actorUserId: 'user-1', idempotencyKey: 'k1', timestampValue: deferUntil,
  });

  assert.equal(updated.deferredUntil.getTime(), deferUntil.getTime());
});

test('transitioning to DEFERRED without a timestampValue falls back to "now", same as before', async () => {
  reset();
  const item = seedWorkItem();
  const before = Date.now();

  const updated = await transitionWorkItem({ workItemId: item.id, to: 'DEFERRED', actorType: 'USER', actorUserId: 'user-1', idempotencyKey: 'k1' });

  assert.ok(updated.deferredUntil.getTime() >= before);
});

test('a timestampValue is ignored for a state whose timestamp field is not forward-looking (e.g. ACCEPTED)', async () => {
  reset();
  const item = seedWorkItem({ state: 'CANDIDATE', acceptanceState: 'PROPOSED' });
  const suppliedFutureDate = new Date('2099-01-01T00:00:00.000Z');

  const updated = await transitionWorkItem({
    workItemId: item.id, to: 'ACCEPTED', actorType: 'USER', actorUserId: 'user-1', idempotencyKey: 'k1', timestampValue: suppliedFutureDate,
  });

  assert.notEqual(updated.acceptedAt.getTime(), suppliedFutureDate.getTime(), 'acceptedAt is an as-of-now entry marker and must not honor a caller-supplied future date');
});

test('transitioning to BLOCKED with a timestampValue sets nextReviewAt to that future date', async () => {
  reset();
  const item = seedWorkItem();
  const reviewAt = new Date('2026-08-20T00:00:00.000Z');

  const updated = await transitionWorkItem({
    workItemId: item.id, to: 'BLOCKED', actorType: 'USER', actorUserId: 'user-1', idempotencyKey: 'k1', timestampValue: reviewAt,
  });

  assert.equal(updated.nextReviewAt.getTime(), reviewAt.getTime());
});
