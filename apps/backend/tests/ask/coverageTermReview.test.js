const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'x';
require('ts-node/register');

// The coverage term review (continuation FRD section 39): an append-only record that a person reviewed THESE current terms; opening the tool proves nothing.
const { prisma } = require('../../src/lib/prisma.ts');
const ops = require('../../src/services/coverageTermReviewOperations.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');

let policies; let warranties; let reviews; let reports; let step; let saved; let rec;
const stepRow = (over = {}) => ({ id: 's1', stepKey: 'review_current_policy_context', toolKey: 'coverage-intelligence', status: 'PENDING', journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: null, primarySignal: null }, ...over });
test.beforeEach(() => {
  policies = [{ id: 'pol1', carrierName: 'Acme', policyNumber: '1', coverageType: 'Homeowner', startDate: new Date('2026-01-01'), expiryDate: new Date('2099-01-01'), deductibleCents: 100000, updatedAt: new Date('2026-02-01') }];
  warranties = [{ id: 'w1', providerName: 'Shield', inventoryItemId: 'item-1', startDate: new Date('2026-01-01'), expiryDate: new Date('2099-01-01'), updatedAt: new Date('2026-02-01') }];
  reviews = []; reports = []; step = stepRow();
  saved = ['insurancePolicy', 'warranty', 'coverageTermReview', 'guidanceSignal', 'guidanceJourney', 'guidanceJourneyEvent', 'guidanceStepEvidence', 'guidanceJourneyStep'].map((n) => [n, prisma[n]]);
  rec = guidanceJourneyService.recordToolCompletion;
  prisma.insurancePolicy = { findMany: async () => policies };
  prisma.warranty = { findMany: async () => warranties };
  prisma.coverageTermReview = {
    findFirst: async ({ where }) => reviews.find((r) => r.termKind === where.termKind && r.termFingerprint === where.termFingerprint && r.reviewedByUserId === where.reviewedByUserId && r.stepId === where.stepId) ?? null,
    create: async ({ data }) => { const row = { id: `r${reviews.length + 1}`, reviewedAt: new Date(), ...data }; reviews.push(row); return row; },
  };
  prisma.guidanceSignal = {}; prisma.guidanceJourney = {}; prisma.guidanceJourneyEvent = {}; prisma.guidanceStepEvidence = {};
  prisma.guidanceJourneyStep = { findFirst: async () => step };
  guidanceJourneyService.recordToolCompletion = async (p) => { reports.push(p); return {}; };
});
test.afterEach(() => { for (const [n, m] of saved) prisma[n] = m; guidanceJourneyService.recordToolCompletion = rec; });

test('reviewing with no current term is refused: there is nothing to review', async () => {
  policies = [];
  await assert.rejects(ops.reviewCoverageTermsWithEffects('p1', 'u1', 'POLICY'), (e) => e.code === 'COVERAGE_TERMS_NONE');
  assert.equal(reviews.length, 0);
});

test('a review without a step is saved and reports nothing', async () => {
  const out = await ops.reviewCoverageTermsWithEffects('p1', 'u1', 'POLICY');
  assert.equal(reviews.length, 1);
  assert.deepEqual([out.guidanceReported, reports.length], [null, 0]);
});

test('from the exact step, it reports a typed proof naming the reviewed terms', async () => {
  const out = await ops.reviewCoverageTermsWithEffects('p1', 'u1', 'POLICY', { guidanceStepId: 's1' });
  assert.equal(out.guidanceReported, true);
  const done = reports[0];
  assert.deepEqual([done.stepKey, done.sourceEntityType, done.status, done.producedData.proofType, done.producedData.termCount], ['review_current_policy_context', 'COVERAGE_TERM_REVIEW', 'COMPLETED', 'coverage_term_review', 1]);
  assert.equal(reviews[0].journeyId, 'j1');
});

test('a changed term needs a new review: a stale fingerprint is refused', async () => {
  const before = await ops.currentCoverageTerms('p1', 'POLICY', null);
  policies[0].deductibleCents = 250000; policies[0].updatedAt = new Date('2026-03-01');
  await assert.rejects(ops.reviewCoverageTermsWithEffects('p1', 'u1', 'POLICY', { expectedFingerprint: before.fingerprint }), (e) => e.code === 'COVERAGE_TERMS_CHANGED');
  assert.equal(reviews.length, 0);
});

test('the warranty step does not accept a policy review, and a journey about another item reports nothing', async () => {
  const wrongKind = await ops.reviewCoverageTermsWithEffects('p1', 'u1', 'WARRANTY', { guidanceStepId: 's1' });
  assert.deepEqual([wrongKind.guidanceReported, wrongKind.guidanceRefusal, reports.length], [false, 'WRONG_STEP', 0]);
  step = stepRow({ stepKey: 'review_current_warranty_context', journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: 'item-2', primarySignal: null } });
  const out = await ops.reviewCoverageTermsWithEffects('p1', 'u1', 'WARRANTY', { guidanceStepId: 's1', inventoryItemId: 'item-1' });
  // the scope comes from the journey (item-2), never the caller
  assert.equal(out.guidanceReported, true);
  assert.equal(reports[0].inventoryItemId, 'item-2');
  assert.equal(reviews[1].inventoryItemId, 'item-2');
});

test('a closed or completed step is never reported to, but the review is saved', async () => {
  step = stepRow({ status: 'COMPLETED' });
  const out = await ops.reviewCoverageTermsWithEffects('p1', 'u1', 'POLICY', { guidanceStepId: 's1' });
  assert.deepEqual([out.guidanceReported, out.guidanceRefusal, reports.length, reviews.length], [false, 'STEP_DONE', 0, 1]);
});
