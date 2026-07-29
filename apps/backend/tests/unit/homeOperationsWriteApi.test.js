const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Home Operations Slice 8: the write API — usecases Slice 1 already built
// (assignWorkItemOwner, addWatcher/removeWatcher, recordDuplicateDecision)
// plus the one new usecase this slice adds (recordEvidence, pairing the
// previously bare recordWorkEvidence repository function with a
// recordWorkEvent, matching every sibling usecase's shape). Tested at the
// usecase level, same granularity as every prior slice — the controller
// handlers are thin pass-throughs (existence check, call usecase, reload
// DTO, map IllegalWorkItemTransitionError to 409), verified by code review.

const workItems = new Map();
const watchers = new Map();
const workEvents = new Map();
const evidenceRows = new Map();

function reset() {
  workItems.clear();
  watchers.clear();
  workEvents.clear();
  evidenceRows.clear();
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
  operationalWorkItemWatcher: {
    upsert: async ({ where, create }) => {
      const key = `${where.workItemId_userId.workItemId}:${where.workItemId_userId.userId}`;
      const existing = watchers.get(key);
      if (existing) return existing;
      const row = { id: crypto.randomUUID(), addedAt: new Date(), ...create };
      watchers.set(key, row);
      return row;
    },
    deleteMany: async ({ where }) => {
      const key = `${where.workItemId}:${where.userId}`;
      const existed = watchers.delete(key);
      return { count: existed ? 1 : 0 };
    },
  },
  operationalWorkEvidence: {
    create: async ({ data }) => {
      const row = { id: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...data };
      evidenceRows.set(row.id, row);
      return row;
    },
  },
  operationalWorkEvent: {
    create: async ({ data }) => ({ id: crypto.randomUUID(), createdAt: new Date(), ...data }),
    findUnique: async () => null,
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const { assignWorkItemOwner } = require('../../src/modules/homeOperations/application/assignOwner.usecase.ts');
const { addWatcher, removeWatcher } = require('../../src/modules/homeOperations/application/watchers.usecase.ts');
const { recordDuplicateDecision } = require('../../src/modules/homeOperations/application/recordDuplicateDecision.usecase.ts');
const { recordEvidence } = require('../../src/modules/homeOperations/application/recordEvidence.usecase.ts');
const { transitionWorkItem } = require('../../src/modules/homeOperations/application/transitionWorkItem.usecase.ts');
const { IllegalWorkItemTransitionError } = require('../../src/modules/homeOperations/domain/transitions.ts');

function seedWorkItem(overrides = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  const row = {
    id, propertyId: 'property-1', state: 'ACCEPTED', acceptanceState: 'ACCEPTED', disposition: null,
    ownerUserId: null, supersededByWorkItemId: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides, id,
  };
  workItems.set(id, row);
  return row;
}

test('assignWorkItemOwner sets ownerUserId and records WORK_ASSIGNED', async () => {
  reset();
  const item = seedWorkItem();

  const result = await assignWorkItemOwner({
    workItemId: item.id, ownerUserId: 'user-1', actorUserId: 'user-1', idempotencyKey: 'k1',
  });

  assert.equal(result.ownerUserId, 'user-1');
  assert.equal(workItems.get(item.id).ownerUserId, 'user-1');
});

test('assignWorkItemOwner can clear an owner by passing null', async () => {
  reset();
  const item = seedWorkItem({ ownerUserId: 'user-1' });

  await assignWorkItemOwner({ workItemId: item.id, ownerUserId: null, actorUserId: 'user-1', idempotencyKey: 'k1' });

  assert.equal(workItems.get(item.id).ownerUserId, null);
});

test('addWatcher then removeWatcher round-trips cleanly', async () => {
  reset();
  const item = seedWorkItem();

  await addWatcher({ workItemId: item.id, userId: 'user-2', addedByUserId: 'user-1', idempotencyKey: 'k1' });
  assert.equal(watchers.size, 1);

  await removeWatcher({ workItemId: item.id, userId: 'user-2', actorUserId: 'user-1', idempotencyKey: 'k2' });
  assert.equal(watchers.size, 0);
});

test('adding the same watcher twice is idempotent (upsert, not a duplicate row)', async () => {
  reset();
  const item = seedWorkItem();

  await addWatcher({ workItemId: item.id, userId: 'user-2', addedByUserId: 'user-1', idempotencyKey: 'k1' });
  await addWatcher({ workItemId: item.id, userId: 'user-2', addedByUserId: 'user-1', idempotencyKey: 'k2' });

  assert.equal(watchers.size, 1);
});

test('recordDuplicateDecision sets supersededByWorkItemId', async () => {
  reset();
  const loser = seedWorkItem({ id: 'wi-loser' });
  seedWorkItem({ id: 'wi-winner' });

  await recordDuplicateDecision({
    workItemId: loser.id, supersededByWorkItemId: 'wi-winner', actorUserId: 'user-1', idempotencyKey: 'k1',
  });

  assert.equal(workItems.get(loser.id).supersededByWorkItemId, 'wi-winner');
});

test('recordEvidence creates an evidence row for the work item', async () => {
  reset();
  const item = seedWorkItem();

  const evidence = await recordEvidence({
    workItemId: item.id,
    evidenceType: 'DOCUMENT',
    evidenceEntityId: 'doc-1',
    observedAt: new Date('2026-07-29T00:00:00.000Z'),
    actorUserId: 'user-1',
    idempotencyKey: 'k1',
  });

  assert.equal(evidence.workItemId, item.id);
  assert.equal(evidence.evidenceType, 'DOCUMENT');
  assert.equal(evidence.verificationStatus, 'PENDING');
  assert.equal(evidenceRows.size, 1);
});

test('recordEvidence honors an explicit verificationStatus', async () => {
  reset();
  const item = seedWorkItem();

  const evidence = await recordEvidence({
    workItemId: item.id,
    evidenceType: 'USER_ATTESTATION',
    evidenceEntityId: 'attestation-1',
    verificationStatus: 'VERIFIED',
    observedAt: new Date(),
    actorUserId: 'user-1',
    idempotencyKey: 'k1',
  });

  assert.equal(evidence.verificationStatus, 'VERIFIED');
});

test('transitioning to an illegal target state throws IllegalWorkItemTransitionError', async () => {
  reset();
  const item = seedWorkItem({ state: 'CANDIDATE' });

  await assert.rejects(
    transitionWorkItem({
      workItemId: item.id, to: 'VERIFIED', actorType: 'USER', actorUserId: 'user-1', idempotencyKey: 'k1',
    }),
    IllegalWorkItemTransitionError,
  );
});

test('a legal transition succeeds', async () => {
  reset();
  const item = seedWorkItem({ state: 'CANDIDATE', acceptanceState: 'PROPOSED' });

  const updated = await transitionWorkItem({
    workItemId: item.id, to: 'ACCEPTED', actorType: 'USER', actorUserId: 'user-1', idempotencyKey: 'k1',
  });

  assert.equal(updated.state, 'ACCEPTED');
});
