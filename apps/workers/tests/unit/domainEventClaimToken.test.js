// apps/workers/tests/unit/domainEventClaimToken.test.js
//
// Ask Cozy Stage 3, Phase 2 (implementation plan §8; FRD §22). Built ahead
// of any real caller (Phase 3's extraction job), matching this file's own
// established mocking pattern (see cronLease.test.js) for a small, isolated
// CAS-style utility.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadClaimToken({ updateManyImpl } = {}) {
  const calls = { updateMany: [] };
  const txMock = {
    domainEvent: {
      updateMany: async (args) => {
        calls.updateMany.push(args);
        if (updateManyImpl) return updateManyImpl(args);
        return { count: 0 };
      },
    },
  };

  const modulePath = require.resolve('../../src/lib/domainEventClaimToken.ts');
  delete require.cache[modulePath];
  return { ...require(modulePath), txMock, calls };
}

test('verifyDomainEventClaimToken resolves when the row still shows this attempt\'s claimed attempts value', async () => {
  const { verifyDomainEventClaimToken, txMock, calls } = loadClaimToken({
    updateManyImpl: () => ({ count: 1 }),
  });

  await assert.doesNotReject(verifyDomainEventClaimToken(txMock, 'event-1', 3));

  assert.equal(calls.updateMany.length, 1);
  assert.deepEqual(calls.updateMany[0].where, { id: 'event-1', attempts: 3 });
  // Must be a real write (not a true no-op the database could elide),
  // so the conditional check is actually enforced, not just read.
  assert.ok('processingStartedAt' in calls.updateMany[0].data);
});

test('verifyDomainEventClaimToken throws DomainEventClaimLostError when a later attempt has already reclaimed the lease (attempts has moved on)', async () => {
  const { verifyDomainEventClaimToken, DomainEventClaimLostError, txMock } = loadClaimToken({
    updateManyImpl: () => ({ count: 0 }),
  });

  await assert.rejects(
    verifyDomainEventClaimToken(txMock, 'event-1', 3),
    (error) => {
      assert.ok(error instanceof DomainEventClaimLostError);
      assert.equal(error.domainEventId, 'event-1');
      assert.equal(error.claimedAttempts, 3);
      return true;
    },
  );
});

test('verifyDomainEventClaimToken is keyed on both id and attempts together -- a matching id with a stale attempts value must not pass', async () => {
  // Simulates real conditional-update semantics: the mock only returns
  // count: 1 when BOTH the where clause's id and attempts match what a
  // real WHERE id = ? AND attempts = ? would require against the row's
  // actual current state (attempts already moved from 3 to 4 -- reclaimed
  // by a later attempt since this one's own claim).
  const currentRowState = { id: 'event-1', attempts: 4 };
  const { verifyDomainEventClaimToken, DomainEventClaimLostError, txMock } = loadClaimToken({
    updateManyImpl: (args) => (
      args.where.id === currentRowState.id && args.where.attempts === currentRowState.attempts
        ? { count: 1 }
        : { count: 0 }
    ),
  });

  await assert.rejects(
    verifyDomainEventClaimToken(txMock, 'event-1', 3),
    DomainEventClaimLostError,
  );
});
