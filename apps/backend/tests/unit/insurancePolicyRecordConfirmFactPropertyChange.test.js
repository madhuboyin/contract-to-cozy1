const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Intelligence Functional Completeness FRD §8.7 (HI-DOC-005) —
// confirmPolicyFact now emits a PropertyChange (and, by extension,
// requests recomputation, since emitPropertyChangeWithTransaction does
// that internally) for either resolution choice. Rejecting keeps the prior
// canonical value but still clears CONFLICTED state, which must recompute.

let factForFind = null;

const txMock = {
  insurancePolicyFact: {
    findFirst: async () => factForFind,
    update: async (args) => ({ ...factForFind, ...args.data }),
    count: async ({ where }) => (where.confirmationStatus === 'PENDING' ? 0 : 1),
  },
  insurancePolicyTerm: { update: async () => ({}) },
  insurancePolicy: { update: async () => ({}) },
  coverageReview: { updateMany: async () => ({ count: 0 }) },
  auditLog: { create: async () => ({}) },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      $transaction: async (fn) => fn(txMock),
    },
  },
};

const propertyChangeCalls = [];
const propertyChangePath = require.resolve('../../src/propertyChanges/propertyChange.service.ts');
require.cache[propertyChangePath] = {
  id: propertyChangePath,
  filename: propertyChangePath,
  loaded: true,
  exports: {
    emitPropertyChangeWithTransaction: async (_tx, input) => {
      propertyChangeCalls.push(input);
      return { change: { id: `change-${propertyChangeCalls.length}`, ...input }, deduped: false };
    },
  },
};

const { confirmPolicyFact } = require('../../src/services/insurancePolicyRecord.service.ts');

function fact(overrides = {}) {
  return {
    id: 'fact-1',
    policyTermId: 'term-1',
    factKey: 'ANNUAL_PREMIUM',
    valueType: 'AMOUNT',
    amountValue: 2400,
    confirmationStatus: 'PENDING',
    policyTerm: { propertyId: 'property-1' },
    ...overrides,
  };
}

test('confirming a policy fact emits a PropertyChange referencing the policy and term', async () => {
  factForFind = fact();
  propertyChangeCalls.length = 0;

  await confirmPolicyFact({
    policyId: 'policy-1',
    factId: 'fact-1',
    homeownerProfileId: 'homeowner-1',
    userId: 'user-1',
    confirmationStatus: 'CONFIRMED',
  });

  assert.equal(propertyChangeCalls.length, 1);
  const call = propertyChangeCalls[0];
  assert.equal(call.propertyId, 'property-1');
  assert.equal(call.sourceType, 'DOCUMENT');
  assert.equal(call.sourceEntityId, 'fact-1');
  assert.equal(call.changeType, 'SOURCE_LIFECYCLE_CHANGED');
  assert.deepEqual(call.changedFactKeys, ['coverage.insurancePolicy.annual_premium']);
  assert.ok(call.canonicalReferences.some((ref) => ref.entityType === 'INSURANCE_POLICY' && ref.entityId === 'policy-1'));
  assert.ok(call.canonicalReferences.some((ref) => ref.entityType === 'INSURANCE_POLICY_TERM' && ref.entityId === 'term-1'));
});

test('rejecting a conflicting policy fact emits a lifecycle PropertyChange so consumers unblock', async () => {
  factForFind = fact();
  propertyChangeCalls.length = 0;

  await confirmPolicyFact({
    policyId: 'policy-1',
    factId: 'fact-1',
    homeownerProfileId: 'homeowner-1',
    userId: 'user-1',
    confirmationStatus: 'REJECTED',
  });

  assert.equal(propertyChangeCalls.length, 1);
  assert.equal(propertyChangeCalls[0].sourceRevision, 'REJECTED');
  assert.deepEqual(propertyChangeCalls[0].changedFactKeys, ['coverage.insurancePolicy.annual_premium']);
});
