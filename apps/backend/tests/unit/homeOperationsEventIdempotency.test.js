const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Slice 1: OperationalWorkEvent is idempotent on [workItemId, idempotencyKey]
// (schema.prisma @@unique). recordWorkEvent must treat a retried key as a
// no-op — returning the original event — rather than propagating the
// unique-constraint violation to the caller.

const workEvents = new Map();
let createCalls = 0;

const prismaMock = {
  operationalWorkEvent: {
    create: async ({ data }) => {
      createCalls += 1;
      const key = `${data.workItemId}:${data.idempotencyKey}`;
      if (workEvents.has(key)) {
        const err = new Error('Unique constraint failed on the fields: (`workItemId`,`idempotencyKey`)');
        err.code = 'P2002';
        throw err;
      }
      const row = { id: crypto.randomUUID(), createdAt: new Date(), occurredAt: data.occurredAt ?? new Date(), ...data };
      workEvents.set(key, row);
      return row;
    },
    findUnique: async ({ where }) => {
      const { workItemId, idempotencyKey } = where.workItemId_idempotencyKey;
      return workEvents.get(`${workItemId}:${idempotencyKey}`) ?? null;
    },
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: prismaMock },
};

const { recordWorkEvent } = require('../../src/modules/homeOperations/infrastructure/workItemRepository.ts');

test('a retried event with the same idempotency key is a no-op, not an error', async () => {
  workEvents.clear();
  createCalls = 0;

  const input = {
    workItemId: 'work-1',
    eventType: 'WORK_ACCEPTED',
    actorType: 'USER',
    actorUserId: 'user-1',
    idempotencyKey: 'accept:work-1',
    payload: { note: 'first attempt' },
  };

  const first = await recordWorkEvent(input);
  assert.equal(createCalls, 1);
  assert.equal(workEvents.size, 1);

  const retried = await recordWorkEvent({ ...input, payload: { note: 'retry after timeout, not a new event' } });

  assert.equal(createCalls, 1, 'a known retry must be detected before attempting another insert');
  assert.equal(workEvents.size, 1, 'no duplicate row should exist');
  assert.equal(retried.id, first.id, 'the retry must resolve to the original event, not throw');
  assert.equal(retried.payload.note, 'first attempt', 'the original event is untouched by the retried payload');
});

test('a retried event is a no-op inside a transaction client', async () => {
  workEvents.clear();
  createCalls = 0;

  const input = {
    workItemId: 'work-transactional',
    eventType: 'SOURCE_RECONCILED',
    actorType: 'SYSTEM',
    idempotencyKey: 'source-reconciled:MAINTENANCE:task-1:v1',
  };

  const first = await recordWorkEvent(input, prismaMock);
  const retried = await recordWorkEvent(input, prismaMock);

  assert.equal(createCalls, 1, 'the transaction client must not receive a duplicate insert');
  assert.equal(retried.id, first.id);
});

test('a genuinely different idempotency key on the same work item creates a second event', async () => {
  workEvents.clear();
  createCalls = 0;

  await recordWorkEvent({
    workItemId: 'work-1',
    eventType: 'WORK_ACCEPTED',
    actorType: 'USER',
    idempotencyKey: 'accept:work-1',
  });
  await recordWorkEvent({
    workItemId: 'work-1',
    eventType: 'WORK_SCHEDULED',
    actorType: 'USER',
    idempotencyKey: 'schedule:work-1',
  });

  assert.equal(workEvents.size, 2);
});

test('the same idempotency key on a different work item is a distinct event (scoped per work item)', async () => {
  workEvents.clear();

  await recordWorkEvent({ workItemId: 'work-1', eventType: 'WORK_ACCEPTED', actorType: 'USER', idempotencyKey: 'accept' });
  await recordWorkEvent({ workItemId: 'work-2', eventType: 'WORK_ACCEPTED', actorType: 'USER', idempotencyKey: 'accept' });

  assert.equal(workEvents.size, 2);
});
