const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Intelligence FRD §15 Phase 5 remediation item 3 (HI-DOC-004): proves
// the end-to-end claim that fixing coverageAssembler to report a real
// CONFLICTED state (tests/unit/phase3ContextAssemblers.test.js) actually
// blocks a real, already-adopted feature gate — CLAIMS: FILE_INSURANCE_CLAIM
// — with zero changes to evaluateFeatureContext.ts itself. That file's own
// existing, untouched logic (requirementState propagating a non-KNOWN fact
// state directly, and `conflict` mapping CONFLICTED -> readiness
// 'CONFLICT_REVIEW_REQUIRED' / canExecute:false) is what does the blocking;
// this test exercises it against a mocked Prisma with real conflicting rows.

let insurancePolicyRows = [];
let pendingPolicyTerms = [];
let confirmedPolicyFacts = [];

const prismaMock = {
  householdMember: {
    findUnique: async () => ({ role: 'OWNER', isPrimaryOwner: true }),
  },
  insurancePolicy: {
    findMany: async () => insurancePolicyRows,
  },
  warranty: {
    findMany: async () => [],
  },
  claim: {
    findMany: async () => [],
  },
  insurancePolicyTerm: {
    findMany: async () => pendingPolicyTerms,
  },
  insurancePolicyFact: {
    findMany: async () => confirmedPolicyFacts,
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: prismaMock },
};

const { evaluateFeatureContext } = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');

test('FILE_INSURANCE_CLAIM is CONFLICT_REVIEW_REQUIRED (and cannot execute) when a pending policy fact disagrees with a confirmed one', async () => {
  insurancePolicyRows = [];
  pendingPolicyTerms = [{
    id: 'term-pending-1',
    insurancePolicyId: 'policy-1',
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
    updatedAt: new Date('2026-08-20T00:00:00.000Z'),
    insurancePolicy: { id: 'policy-1', carrierName: 'Acme Insurance' },
    facts: [{
      id: 'fact-pending-1', factKey: 'ANNUAL_PREMIUM', valueType: 'AMOUNT',
      amountValue: 2400, textValue: null, booleanValue: null, jsonValue: null,
      confidence: 0.8, confirmedAt: null,
      createdAt: new Date('2026-08-20T00:00:00.000Z'), updatedAt: new Date('2026-08-20T00:00:00.000Z'),
    }],
  }];
  confirmedPolicyFacts = [{
    id: 'fact-confirmed-1', factKey: 'ANNUAL_PREMIUM', valueType: 'AMOUNT',
    amountValue: 1800, textValue: null, booleanValue: null, jsonValue: null,
    confidence: 1, confirmedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    policyTerm: { insurancePolicyId: 'policy-1', termStart: new Date('2026-01-01T00:00:00.000Z'), createdAt: new Date('2026-01-01T00:00:00.000Z') },
  }];

  const evaluation = await evaluateFeatureContext('property-1', 'user-1', {
    featureKey: 'CLAIMS',
    operationKey: 'FILE_INSURANCE_CLAIM',
  });

  assert.equal(evaluation.readiness, 'CONFLICT_REVIEW_REQUIRED');
  assert.equal(evaluation.canExecute, false);
  assert.equal(evaluation.requirements[0].state, 'CONFLICTED');

  pendingPolicyTerms = [];
  confirmedPolicyFacts = [];
});

test('FILE_INSURANCE_CLAIM without any conflict is NOT CONFLICT_REVIEW_REQUIRED (baseline: falls back to needing an active policy)', async () => {
  insurancePolicyRows = [];
  pendingPolicyTerms = [];
  confirmedPolicyFacts = [];

  const evaluation = await evaluateFeatureContext('property-1', 'user-1', {
    featureKey: 'CLAIMS',
    operationKey: 'FILE_INSURANCE_CLAIM',
  });

  assert.notEqual(evaluation.readiness, 'CONFLICT_REVIEW_REQUIRED');
  assert.notEqual(evaluation.requirements[0]?.state, 'CONFLICTED');
});
