const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  cascadeDeleteOwnedProperties,
  HouseholdOwnershipBlockedError,
} = require('../../src/services/accountDeletionCascade.service.ts');

function createTx({ homeownerProfile = null } = {}) {
  const calls = {
    sellerPrepPlanDeleteMany: [],
    sellerPrepLeadDeleteMany: [],
    feedbackDeleteMany: [],
    propertySaleCaseDeleteMany: [],
    homeownerProfileDelete: [],
    householdMemberDeleteMany: [],
  };

  const tx = {
    calls,
    homeownerProfile: {
      findUnique: async () => homeownerProfile,
      delete: async (args) => {
        calls.homeownerProfileDelete.push(args);
      },
    },
    sellerPrepPlan: {
      deleteMany: async (args) => {
        calls.sellerPrepPlanDeleteMany.push(args);
      },
    },
    sellerPrepLead: {
      deleteMany: async (args) => {
        calls.sellerPrepLeadDeleteMany.push(args);
      },
    },
    feedback: {
      deleteMany: async (args) => {
        calls.feedbackDeleteMany.push(args);
      },
    },
    propertySaleCase: {
      deleteMany: async (args) => {
        calls.propertySaleCaseDeleteMany.push(args);
      },
    },
    householdMember: {
      deleteMany: async (args) => {
        calls.householdMemberDeleteMany.push(args);
      },
    },
  };

  return tx;
}

test('no-op when the user has no HomeownerProfile', async () => {
  const tx = createTx({ homeownerProfile: null });
  await cascadeDeleteOwnedProperties(tx, 'user-1');

  assert.equal(tx.calls.homeownerProfileDelete.length, 0);
  assert.equal(tx.calls.householdMemberDeleteMany.length, 0);
});

test('blocks deletion when another household member is on an owned property', async () => {
  const tx = createTx({
    homeownerProfile: {
      properties: [
        {
          id: 'prop-1',
          name: 'Main House',
          householdMembers: [{ userId: 'user-1' }, { userId: 'other-user' }],
        },
      ],
    },
  });

  await assert.rejects(
    () => cascadeDeleteOwnedProperties(tx, 'user-1'),
    (err) => {
      assert.ok(err instanceof HouseholdOwnershipBlockedError);
      assert.deepEqual(err.properties, [{ id: 'prop-1', name: 'Main House' }]);
      return true;
    },
  );

  // Must not mutate anything once blocked.
  assert.equal(tx.calls.homeownerProfileDelete.length, 0);
  assert.equal(tx.calls.sellerPrepPlanDeleteMany.length, 0);
  assert.equal(tx.calls.householdMemberDeleteMany.length, 0);
});

test('does not block when the only household member is the owner themselves', async () => {
  const tx = createTx({
    homeownerProfile: {
      properties: [
        {
          id: 'prop-1',
          name: 'Main House',
          householdMembers: [{ userId: 'user-1' }],
        },
      ],
    },
  });

  await cascadeDeleteOwnedProperties(tx, 'user-1');

  assert.equal(tx.calls.sellerPrepPlanDeleteMany.length, 1);
  assert.deepEqual(tx.calls.sellerPrepPlanDeleteMany[0], { where: { propertyId: 'prop-1' } });
  assert.equal(tx.calls.sellerPrepLeadDeleteMany.length, 1);
  assert.equal(tx.calls.feedbackDeleteMany.length, 1);
  assert.equal(tx.calls.homeownerProfileDelete.length, 1);
  assert.deepEqual(tx.calls.homeownerProfileDelete[0], { where: { userId: 'user-1' } });
  assert.equal(tx.calls.householdMemberDeleteMany.length, 1);
  assert.deepEqual(tx.calls.householdMemberDeleteMany[0], { where: { userId: 'user-1' } });
});

test('cleans up orphan-risk tables for every owned property, not just the first', async () => {
  const tx = createTx({
    homeownerProfile: {
      properties: [
        { id: 'prop-1', name: 'Main House', householdMembers: [{ userId: 'user-1' }] },
        { id: 'prop-2', name: 'Rental', householdMembers: [] },
      ],
    },
  });

  await cascadeDeleteOwnedProperties(tx, 'user-1');

  assert.equal(tx.calls.sellerPrepPlanDeleteMany.length, 2);
  assert.deepEqual(
    tx.calls.sellerPrepPlanDeleteMany.map((c) => c.where.propertyId).sort(),
    ['prop-1', 'prop-2'],
  );
});
