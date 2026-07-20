// apps/workers/tests/unit/claimFollowUpDueTick.test.js
//
// W4 item 4: the claim-follow-up-due-poller runner had no dedicated test.
// Research found the per-claim emit loop had no error isolation — one
// claim's DomainEventsService.emit failure would abort the batch, delaying
// FOLLOW_UP_DUE events for every other due claim until the next poll
// interval. Fixed with per-claim try/catch (same pattern used elsewhere),
// and extracted a testable claimFollowUpDueTick(batchSize) function out of
// the never-resolving while(true) loop — same technique already used for
// reportExport.cleanup.ts/materialSpecExport.cleanup.ts.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function claimFixture(overrides = {}) {
  return {
    id: 'claim-1',
    propertyId: 'property-1',
    createdBy: 'user-1',
    nextFollowUpAt: new Date('2026-07-20T12:00:00Z'),
    status: 'OPEN',
    providerName: 'Acme Plumbing',
    claimNumber: 'C-1',
    ...overrides,
  };
}

function loadPoller({ claims, emitShouldFailFor = new Set() }) {
  const calls = { emitted: [] };

  const prismaMock = {
    claim: {
      findMany: async () => claims,
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const domainEventsPath = require.resolve('../../../backend/src/services/domainEvents/domainEvents.service.ts');
  require.cache[domainEventsPath] = {
    id: domainEventsPath,
    filename: domainEventsPath,
    loaded: true,
    exports: {
      DomainEventsService: {
        emit: async (event) => {
          calls.emitted.push(event);
          if (emitShouldFailFor.has(event.payload.claimId)) {
            throw new Error(`emit failed for ${event.payload.claimId}`);
          }
        },
      },
    },
  };

  const pollerPath = require.resolve('../../src/runners/claimFollowUpDue.poller.ts');
  delete require.cache[pollerPath];
  return { ...require(pollerPath), calls };
}

test('emits a FOLLOW_UP_DUE event for every due claim', async () => {
  const { claimFollowUpDueTick, calls } = loadPoller({
    claims: [claimFixture({ id: 'claim-1' }), claimFixture({ id: 'claim-2' })],
  });

  const result = await claimFollowUpDueTick(50);

  assert.deepEqual(result, { emitted: 2, failed: 0 });
  assert.equal(calls.emitted.length, 2);
  assert.equal(calls.emitted[0].type, 'FOLLOW_UP_DUE');
});

test('one claim failing does not prevent the rest from emitting', async () => {
  const { claimFollowUpDueTick, calls } = loadPoller({
    claims: [claimFixture({ id: 'claim-1' }), claimFixture({ id: 'claim-2' }), claimFixture({ id: 'claim-3' })],
    emitShouldFailFor: new Set(['claim-2']),
  });

  const result = await claimFollowUpDueTick(50);

  assert.equal(result.emitted, 2);
  assert.equal(result.failed, 1);
  assert.equal(calls.emitted.length, 3, 'must still attempt every claim, not stop at the failure');
});

test('idempotency key is derived from claim id and exact nextFollowUpAt timestamp', async () => {
  const dueAt = new Date('2026-07-20T12:00:00Z');
  const { claimFollowUpDueTick, calls } = loadPoller({
    claims: [claimFixture({ id: 'claim-1', nextFollowUpAt: dueAt })],
  });

  await claimFollowUpDueTick(50);

  assert.equal(calls.emitted[0].idempotencyKey, `claim:claim-1:followup_due:${dueAt.toISOString()}`);
});

test('returns zero counts cleanly when nothing is due', async () => {
  const { claimFollowUpDueTick, calls } = loadPoller({ claims: [] });

  const result = await claimFollowUpDueTick(50);

  assert.deepEqual(result, { emitted: 0, failed: 0 });
  assert.equal(calls.emitted.length, 0);
});
