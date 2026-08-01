const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Item #22 (Slice 8: "batch scheduling for low-risk routine work").
// batchTransitionWorkItems composes the already-tested transitionWorkItem/
// rescheduleWorkItem usecases per item, with server-side safetyTier/state
// eligibility gating and per-item (not all-or-nothing) error tolerance.

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
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const { batchTransitionWorkItems } = require('../../src/modules/homeOperations/application/batchTransitionWorkItems.usecase.ts');

function seedWorkItem(overrides = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  const row = {
    id, propertyId: 'property-1', state: 'CANDIDATE', acceptanceState: 'PROPOSED', disposition: null,
    safetyTier: 'LOW_CONSEQUENCE', priority: 'PLAN',
    dueWindowStart: null, dueAt: null, dueWindowEnd: null,
    snoozedUntil: null, deferredUntil: null, nextReviewAt: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides, id,
  };
  workItems.set(id, row);
  return row;
}

test('batch-accepts every eligible CANDIDATE/LOW_CONSEQUENCE item in the array', async () => {
  reset();
  const a = seedWorkItem();
  const b = seedWorkItem();

  const results = await batchTransitionWorkItems({
    propertyId: 'property-1', workItemIds: [a.id, b.id], actorUserId: 'user-1',
  });

  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.success));
  assert.equal(workItems.get(a.id).state, 'ACCEPTED');
  assert.equal(workItems.get(b.id).state, 'ACCEPTED');
});

test('rejects a non-LOW_CONSEQUENCE item without touching its state, but still processes the rest', async () => {
  reset();
  const safe = seedWorkItem();
  const emergency = seedWorkItem({ safetyTier: 'SAFETY_EMERGENCY' });

  const results = await batchTransitionWorkItems({
    propertyId: 'property-1', workItemIds: [safe.id, emergency.id], actorUserId: 'user-1',
  });

  const safeResult = results.find((r) => r.workItemId === safe.id);
  const emergencyResult = results.find((r) => r.workItemId === emergency.id);
  assert.equal(safeResult.success, true);
  assert.equal(workItems.get(safe.id).state, 'ACCEPTED');
  assert.equal(emergencyResult.success, false);
  assert.match(emergencyResult.message, /safetyTier/);
  assert.equal(workItems.get(emergency.id).state, 'CANDIDATE', 'an ineligible item must not be silently accepted anyway');
});

test('rejects an item that is not CANDIDATE, without affecting other items in the batch', async () => {
  reset();
  const candidate = seedWorkItem();
  const alreadyAccepted = seedWorkItem({ state: 'ACCEPTED', acceptanceState: 'ACCEPTED' });

  const results = await batchTransitionWorkItems({
    propertyId: 'property-1', workItemIds: [candidate.id, alreadyAccepted.id], actorUserId: 'user-1',
  });

  assert.equal(results.find((r) => r.workItemId === candidate.id).success, true);
  const rejected = results.find((r) => r.workItemId === alreadyAccepted.id);
  assert.equal(rejected.success, false);
  assert.match(rejected.message, /CANDIDATE/);
  assert.equal(workItems.get(alreadyAccepted.id).state, 'ACCEPTED', 'unaffected -- still whatever state it started in');
});

test('rejects an id that does not belong to the given property', async () => {
  reset();
  const otherProperty = seedWorkItem({ propertyId: 'property-2' });

  const results = await batchTransitionWorkItems({
    propertyId: 'property-1', workItemIds: [otherProperty.id], actorUserId: 'user-1',
  });

  assert.equal(results[0].success, false);
  assert.match(results[0].message, /not found/i);
});

test('rejects a missing work item id', async () => {
  reset();
  const results = await batchTransitionWorkItems({
    propertyId: 'property-1', workItemIds: ['does-not-exist'], actorUserId: 'user-1',
  });
  assert.equal(results[0].success, false);
});

test('applies a shared due date to every accepted item when due fields are provided', async () => {
  reset();
  const a = seedWorkItem();
  const b = seedWorkItem();
  const sharedDueAt = new Date('2026-09-01T00:00:00.000Z');

  const results = await batchTransitionWorkItems({
    propertyId: 'property-1', workItemIds: [a.id, b.id], actorUserId: 'user-1', dueAt: sharedDueAt,
  });

  assert.ok(results.every((r) => r.success));
  assert.equal(workItems.get(a.id).dueAt.getTime(), sharedDueAt.getTime());
  assert.equal(workItems.get(b.id).dueAt.getTime(), sharedDueAt.getTime());
});

test('leaves due fields untouched when none are provided', async () => {
  reset();
  const original = new Date('2026-08-01T00:00:00.000Z');
  const a = seedWorkItem({ dueAt: original });

  await batchTransitionWorkItems({ propertyId: 'property-1', workItemIds: [a.id], actorUserId: 'user-1' });

  assert.equal(workItems.get(a.id).dueAt.getTime(), original.getTime());
});
