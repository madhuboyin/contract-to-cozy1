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
} = require('../../../src/services/decisionPlatform/homeActionDecisionLineage.ts');

function fakeDb({ sources = [], analyses = {} } = {}) {
  return {
    operationalWorkSource: {
      findMany: async ({ where }) => sources.filter((s) => s.workItemId === where.workItemId && s.sourceType === where.sourceType),
    },
    replaceRepairAnalysis: {
      findUnique: async ({ where }) => analyses[where.id] ?? null,
    },
  };
}

test('a work item with no GUIDANCE source is a no-op', async () => {
  const db = fakeDb({ sources: [] });
  await assert.doesNotReject(assertDecisionLineageSatisfiedForAcceptance('property-1', 'work-1', db));
});

test('a GUIDANCE source whose sourceEntityId is not a ReplaceRepairAnalysis is a no-op (not a repair/replace obligation)', async () => {
  const db = fakeDb({
    sources: [{ workItemId: 'work-1', sourceType: 'GUIDANCE', sourceEntityId: 'journey-1' }],
    analyses: {},
  });
  await assert.doesNotReject(assertDecisionLineageSatisfiedForAcceptance('property-1', 'work-1', db));
});

// The LINKED/blocked branches (a GUIDANCE source that does resolve to a
// ReplaceRepairAnalysis) delegate to resolveHomeActionDecisionLineage,
// which queries the decision-family adapter against the real prisma
// client — not injectable through this function's `db` param — so that
// path needs a live DB and belongs in an integration test, not here.
