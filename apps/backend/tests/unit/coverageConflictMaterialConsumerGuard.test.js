const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { assertCoverageConflictFree } = require('../../src/services/coverageConflict.service.ts');

function dbWithPolicyConflict() {
  return {
    insurancePolicyTerm: {
      findMany: async () => [{
        id: 'term-new', insurancePolicyId: 'policy-conflicted', carrierName: 'Carrier',
        createdAt: new Date('2026-08-20'), updatedAt: new Date('2026-08-20'),
        insurancePolicy: { id: 'policy-conflicted', carrierName: 'Carrier' },
        facts: [{ id: 'pending', factKey: 'ANNUAL_PREMIUM', valueType: 'AMOUNT', amountValue: 2400, textValue: null, booleanValue: null, jsonValue: null, confidence: 0.8, confirmedAt: null, createdAt: new Date('2026-08-20'), updatedAt: new Date('2026-08-20') }],
      }],
    },
    insurancePolicyFact: {
      findMany: async () => [{
        id: 'confirmed', factKey: 'ANNUAL_PREMIUM', valueType: 'AMOUNT', amountValue: 1800, textValue: null, booleanValue: null, jsonValue: null, confidence: 1, confirmedAt: new Date('2026-01-01'), createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
        policyTerm: { insurancePolicyId: 'policy-conflicted', termStart: new Date('2026-01-01'), createdAt: new Date('2026-01-01') },
      }],
    },
  };
}

test('aggregate material consumers fail closed with affected ids and a resolution path', async () => {
  await assert.rejects(
    assertCoverageConflictFree('property-1', dbWithPolicyConflict(), { requireAllInsurancePolicies: true }),
    (error) => {
      assert.equal(error.code, 'COVERAGE_CONFLICT_REVIEW_REQUIRED');
      assert.deepEqual(error.details.policyIds, ['policy-conflicted']);
      assert.match(error.details.resolutionPath, /resolveConflict=1/);
      return true;
    },
  );
});

test('a selected clean policy is not blocked by another policy conflict', async () => {
  await assert.doesNotReject(
    assertCoverageConflictFree('property-1', dbWithPolicyConflict(), { insurancePolicyId: 'policy-clean' }),
  );
});
