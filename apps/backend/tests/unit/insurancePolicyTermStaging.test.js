const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// A term is identified by its policy AND the record it was read from. Before: any existing term with no source was returned for the policy, so a second
// declarations page for the same policy staged nothing and the homeowner was shown the first page's facts as if they were the new ones.

const prismaModule = require('../../src/lib/prisma.ts');
const { stageExtractedPolicyTerm } = require('../../src/services/insurancePolicyRecord.service.ts');

const original = prismaModule.prisma;
test.afterEach(() => { prismaModule.prisma = original; });

function fakeDb() {
  const db = { policies: [], terms: [], reviewsStaled: 0, audits: 0 };
  const tx = {
    property: { findFirst: async () => ({ id: 'p1' }) },
    insurancePolicy: {
      findMany: async ({ where }) => db.policies.filter((p) => p.policyNumber === where.policyNumber && p.propertyId === where.propertyId),
      create: async ({ data }) => { const row = { id: `pol-${db.policies.length + 1}`, ...data }; db.policies.push(row); return row; },
    },
    insurancePolicyTerm: {
      findFirst: async ({ where }) => db.terms.find((t) => t.insurancePolicyId === where.insurancePolicyId && t.sourceDocumentId === where.sourceDocumentId) ?? null,
      create: async ({ data }) => { const { facts, ...rest } = data; const row = { id: `term-${db.terms.length + 1}`, ...rest, facts: facts.create }; db.terms.push(row); return row; },
    },
    coverageReview: { updateMany: async () => { db.reviewsStaled += 1; } },
    auditLog: { create: async () => { db.audits += 1; } },
  };
  prismaModule.prisma = { $transaction: async (fn) => fn(tx) };
  return db;
}
const input = (over = {}) => ({ homeownerProfileId: 'hp-1', userId: 'u1', propertyId: 'p1', carrierName: 'State Farm', policyNumber: 'SF-123456', deductibleAmount: 2500, sourceDocumentId: 'rec-1', ...over });

test('the first declarations page creates the policy and a term carrying its source, with the facts pending', async () => {
  const db = fakeDb();
  const { term } = await stageExtractedPolicyTerm(input());
  assert.equal(db.policies.length, 1);
  assert.equal(term.sourceDocumentId, 'rec-1');
  assert.ok(term.facts.length > 0 && term.facts.every((fact) => fact.confirmationStatus === 'PENDING' && fact.sourceDocumentId === 'rec-1'));
});

test('retrying the same upload reuses its own term and stages nothing twice', async () => {
  const db = fakeDb();
  const first = await stageExtractedPolicyTerm(input());
  const again = await stageExtractedPolicyTerm(input());
  assert.equal(db.terms.length, 1);
  assert.equal(again.term.id, first.term.id);
});

test('a later declarations page for the same policy stages a term of its own, with its own facts, and marks the earlier review stale', async () => {
  const db = fakeDb();
  const first = await stageExtractedPolicyTerm(input());
  const second = await stageExtractedPolicyTerm(input({ sourceDocumentId: 'rec-2', deductibleAmount: 5000 }));
  assert.equal(db.policies.length, 1, 'the policy is the same one');
  assert.equal(db.terms.length, 2);
  assert.notEqual(second.term.id, first.term.id);
  assert.equal(second.term.sourceDocumentId, 'rec-2');
  assert.equal(second.term.facts.find((fact) => fact.factKey === 'ALL_PERIL_DEDUCTIBLE').amountValue, 5000, 'the new page\'s value, not the older one\'s');
  assert.equal(db.reviewsStaled, 2);
});

test('the same policy number from another carrier is a different policy; a differently written carrier name is the same one', async () => {
  const db = fakeDb();
  const first = await stageExtractedPolicyTerm(input({ carrierName: 'State Farm' }));
  const reworded = await stageExtractedPolicyTerm(input({ carrierName: 'STATE FARM Insurance Co.', sourceDocumentId: 'rec-2' }));
  assert.equal(db.policies.length, 1, 'a reworded carrier name is not a new policy');
  assert.equal(reworded.policy.id, first.policy.id);
  const other = await stageExtractedPolicyTerm(input({ carrierName: 'Allstate', sourceDocumentId: 'rec-3' }));
  assert.equal(db.policies.length, 2, 'the same number from another carrier must not attach to the first policy');
  assert.notEqual(other.policy.id, first.policy.id);
  assert.equal(other.policy.carrierName, 'Allstate');
});

test('normalizeCarrierName ignores case, punctuation and corporate suffixes only', () => {
  const { normalizeCarrierName } = require('../../src/services/insurancePolicyRecord.service.ts');
  assert.equal(normalizeCarrierName('State Farm'), normalizeCarrierName('state-farm Insurance Company'));
  assert.notEqual(normalizeCarrierName('State Farm'), normalizeCarrierName('Farmers'));
  assert.notEqual(normalizeCarrierName('Liberty Mutual'), normalizeCarrierName('Liberty Mutual Auto'));
});
