const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Intelligence Functional Completeness FRD Phase 3 review finding 4,
// delivery step 5 (server-side commitment-boundary enforcement). Pure
// dependency-injection coverage against an in-memory fake db, mirroring the
// pattern in bookingWorkReconciliation.test.js — the LINKED/blocked branches
// this delegates to are already covered by resolveHomeActionDecisionLineage's
// own governance tests and require a live decision-family adapter query
// (real prisma), so they're out of scope for a fake-db unit test.

const {
  assertDecisionLineageSatisfiedForAcceptance,
  resolveWorkItemDecisionFamilyRefs,
} = require('../../../src/services/decisionPlatform/homeActionDecisionLineage.ts');

function fakeDb({ sources = [], analyses = {}, coverageReviews = {} } = {}) {
  return {
    operationalWorkSource: {
      findMany: async ({ where }) => sources.filter((s) =>
        s.workItemId === where.workItemId &&
        (where.active === undefined || s.active === where.active) &&
        where.sourceType.in.includes(s.sourceType)),
    },
    replaceRepairAnalysis: {
      findFirst: async ({ where }) => {
        const analysis = analyses[where.id] ?? null;
        return analysis?.propertyId === where.propertyId ? analysis : null;
      },
    },
    coverageReview: {
      findFirst: async ({ where }) => {
        const review = coverageReviews[where.id] ?? null;
        return review?.propertyId === where.propertyId ? { questions: review.questions } : null;
      },
    },
  };
}

test('a work item with no GUIDANCE source is a no-op', async () => {
  const db = fakeDb({ sources: [] });
  await assert.doesNotReject(assertDecisionLineageSatisfiedForAcceptance('property-1', 'work-1', db));
});

test('a GUIDANCE source whose sourceEntityId is not a ReplaceRepairAnalysis is a no-op (not a repair/replace obligation)', async () => {
  const db = fakeDb({
    sources: [{ workItemId: 'work-1', sourceType: 'GUIDANCE', sourceEntityId: 'journey-1', active: true }],
    analyses: {},
  });
  await assert.doesNotReject(assertDecisionLineageSatisfiedForAcceptance('property-1', 'work-1', db));
});

test('repair/replace and coverage sources resolve to their registered decision families', async () => {
  const db = fakeDb({
    sources: [
      { workItemId: 'work-1', sourceType: 'GUIDANCE', sourceEntityId: 'analysis-1', active: true },
      { workItemId: 'work-1', sourceType: 'COVERAGE', sourceEntityId: 'review-1', active: true },
    ],
    analyses: { 'analysis-1': { propertyId: 'property-1', inventoryItemId: 'hvac-1', inventoryItem: { category: 'HVAC' } } },
    coverageReviews: {
      'review-1': { propertyId: 'property-1', questions: [{ questionKey: 'coverage-question-1' }] },
    },
  });

  assert.deepEqual(await resolveWorkItemDecisionFamilyRefs('property-1', 'work-1', db), [
    { decisionDefinitionId: 'HVAC_REPAIR_REPLACE', primaryEntityId: 'hvac-1', sourceLabel: 'repair/replace' },
    { decisionDefinitionId: 'COVERAGE_QUESTION', primaryEntityId: 'coverage-question-1', sourceLabel: 'coverage' },
  ]);
});

// C2C Intelligence & Agentic Evolution Phase 4A (architecture §12.7):
// category-aware ingress — a non-HVAC ReplaceRepairAnalysis work-item
// source resolves to APPLIANCE_REPAIR_REPLACE, not the HVAC family.
test('a non-HVAC repair/replace source resolves to the APPLIANCE_REPAIR_REPLACE family', async () => {
  const db = fakeDb({
    sources: [{ workItemId: 'work-1', sourceType: 'GUIDANCE', sourceEntityId: 'analysis-2', active: true }],
    analyses: { 'analysis-2': { propertyId: 'property-1', inventoryItemId: 'fridge-1', inventoryItem: { category: 'APPLIANCE' } } },
  });

  assert.deepEqual(await resolveWorkItemDecisionFamilyRefs('property-1', 'work-1', db), [
    { decisionDefinitionId: 'APPLIANCE_REPAIR_REPLACE', primaryEntityId: 'fridge-1', sourceLabel: 'repair/replace' },
  ]);
});

test('a CoverageReview source with no current primary question fails closed', async () => {
  const db = fakeDb({
    sources: [{ workItemId: 'work-1', sourceType: 'COVERAGE', sourceEntityId: 'review-1', active: true }],
    coverageReviews: { 'review-1': { propertyId: 'property-1', questions: [] } },
  });
  await assert.rejects(
    resolveWorkItemDecisionFamilyRefs('property-1', 'work-1', db),
    /no longer has a current primary question/i,
  );
});

test('a non-review COVERAGE source remains outside decision lineage', async () => {
  const db = fakeDb({
    sources: [{ workItemId: 'work-1', sourceType: 'COVERAGE', sourceEntityId: 'warranty-1', active: true }],
  });
  assert.deepEqual(await resolveWorkItemDecisionFamilyRefs('property-1', 'work-1', db), []);
});

// The LINKED/blocked branches (a GUIDANCE source that does resolve to a
// ReplaceRepairAnalysis) delegate to resolveHomeActionDecisionLineage,
// which queries the decision-family adapter against the real prisma
// client — not injectable through this function's `db` param — so that
// path needs a live DB and belongs in an integration test, not here.
