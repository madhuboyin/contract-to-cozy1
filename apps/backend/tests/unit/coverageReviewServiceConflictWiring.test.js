const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Intelligence FRD §15 Phase 5 remediation item 3 (HI-DOC-004):
// getOrCreateCoverageReview must persist overallState: 'CONFLICTED' when
// coverageConflict.service.ts finds an unresolved policy fact conflict for
// the property's active policy — this is coverageReviewRules.ts's direct
// enforcement (it never goes through Property Context / evaluateFeatureContext
// at all, so this is a separate wiring point from coverageConflictFeatureGateEnforcement.test.js).

let pendingPolicyTerms = [];
let confirmedPolicyFacts = [];
const createdReviews = [];

function activeTerm(overrides = {}) {
  return {
    id: 'term-active-1',
    insurancePolicyId: 'policy-1',
    propertyId: 'property-1',
    verificationStatus: 'VERIFIED',
    termStart: new Date('2026-01-01T00:00:00.000Z'),
    termEnd: new Date('2027-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    insurancePolicy: { id: 'policy-1', carrierName: 'Acme Insurance', policyNumber: 'POL-1' },
    sourceDocument: null,
    facts: [
      { id: 'fact-1', factKey: 'ALL_PERIL_DEDUCTIBLE', valueType: 'AMOUNT', amountValue: 1000, textValue: null, booleanValue: null, confirmationStatus: 'CONFIRMED', updatedAt: new Date('2026-01-01T00:00:00.000Z'), sourceDocumentId: null, sourcePage: null, effectiveFrom: null, effectiveTo: null },
      { id: 'fact-2', factKey: 'DWELLING_LIMIT', valueType: 'AMOUNT', amountValue: 400000, textValue: null, booleanValue: null, confirmationStatus: 'CONFIRMED', updatedAt: new Date('2026-01-01T00:00:00.000Z'), sourceDocumentId: null, sourcePage: null, effectiveFrom: null, effectiveTo: null },
      { id: 'fact-3', factKey: 'LIABILITY_LIMIT', valueType: 'AMOUNT', amountValue: 300000, textValue: null, booleanValue: null, confirmationStatus: 'CONFIRMED', updatedAt: new Date('2026-01-01T00:00:00.000Z'), sourceDocumentId: null, sourcePage: null, effectiveFrom: null, effectiveTo: null },
      { id: 'fact-4', factKey: 'POLICY_FORM', valueType: 'TEXT', amountValue: null, textValue: 'HO-3', booleanValue: null, confirmationStatus: 'CONFIRMED', updatedAt: new Date('2026-01-01T00:00:00.000Z'), sourceDocumentId: null, sourcePage: null, effectiveFrom: null, effectiveTo: null },
    ],
    ...overrides,
  };
}

const prismaMock = {
  property: {
    findFirst: async () => ({ id: 'property-1', updatedAt: new Date('2026-08-01T00:00:00.000Z') }),
  },
  insurancePolicyTerm: {
    findFirst: async () => activeTerm(),
    findMany: async () => pendingPolicyTerms,
  },
  insurancePolicyFact: {
    findMany: async () => confirmedPolicyFacts,
  },
  coverageReview: {
    findFirst: async () => null,
    updateMany: async () => ({ count: 0 }),
    create: async (args) => {
      createdReviews.push(args.data);
      return { id: `review-${createdReviews.length}`, ...args.data };
    },
  },
  $transaction: async (fn) => fn(prismaMock),
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: prismaMock },
};

const { getOrCreateCoverageReview } = require('../../src/services/coverageReview.service.ts');

test('a property with an unresolved policy fact conflict persists overallState CONFLICTED', async () => {
  pendingPolicyTerms = [{
    id: 'term-pending-1',
    insurancePolicyId: 'policy-1',
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
    updatedAt: new Date('2026-08-20T00:00:00.000Z'),
    insurancePolicy: { id: 'policy-1', carrierName: 'Acme Insurance' },
    facts: [{
      id: 'fact-pending-1', factKey: 'ALL_PERIL_DEDUCTIBLE', valueType: 'AMOUNT',
      amountValue: 2500, textValue: null, booleanValue: null, jsonValue: null,
      confidence: 0.8, confirmedAt: null,
      createdAt: new Date('2026-08-20T00:00:00.000Z'), updatedAt: new Date('2026-08-20T00:00:00.000Z'),
    }],
  }];
  confirmedPolicyFacts = [{
    id: 'fact-1', factKey: 'ALL_PERIL_DEDUCTIBLE', valueType: 'AMOUNT',
    amountValue: 1000, textValue: null, booleanValue: null, jsonValue: null,
    confidence: 1, confirmedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    policyTerm: { insurancePolicyId: 'policy-1', termStart: new Date('2026-01-01T00:00:00.000Z'), createdAt: new Date('2026-01-01T00:00:00.000Z') },
  }];
  createdReviews.length = 0;

  const review = await getOrCreateCoverageReview('property-1', 'user-1', { evaluatedAt: new Date('2026-08-24T12:00:00.000Z') });

  assert.equal(review.overallState, 'CONFLICTED');
  assert.equal(review.scopeStatus, 'UNSUPPORTED');

  pendingPolicyTerms = [];
  confirmedPolicyFacts = [];
});

test('a property with no conflict persists the normal rule-evaluated overallState', async () => {
  pendingPolicyTerms = [];
  confirmedPolicyFacts = [];
  createdReviews.length = 0;

  const review = await getOrCreateCoverageReview('property-1', 'user-1', { evaluatedAt: new Date('2026-08-24T12:00:00.000Z') });

  assert.notEqual(review.overallState, 'CONFLICTED');
});
