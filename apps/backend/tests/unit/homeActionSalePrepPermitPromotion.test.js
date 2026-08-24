const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { getPromotedHomeActions } = require('../../src/services/homeActionSourcePromotion.service.ts');

const NOW = new Date('2026-08-24T12:00:00.000Z');

function baseStubs(overrides = {}) {
  return {
    guidanceJourney: { findMany: async () => [] },
    incident: { findMany: async () => [] },
    recallMatch: { findMany: async () => [] },
    coverageReview: { findMany: async () => [] },
    projectRecord: { findMany: async () => [] },
    seasonalChecklist: { findMany: async () => [] },
    personalizedRecommendation: { findMany: async () => [] },
    orchestrationActionEvent: { findMany: async () => [] },
    orchestrationActionSnooze: { findMany: async () => [] },
    ...overrides,
  };
}

function baseSaleCase(overrides = {}) {
  return {
    id: 'sale-case-1',
    status: 'PREPARING',
    targetListDate: new Date('2026-10-01T00:00:00.000Z'),
    targetCloseDate: null,
    ...overrides,
  };
}

function permitReadinessItem(overrides = {}) {
  return {
    id: 'readiness-permit-1',
    sourceEntityType: 'PERMIT',
    title: 'Unverified permit: ELECTRICAL',
    detail: 'Panel upgrade permit on file but not yet verified.',
    category: 'PERMITS_DISCLOSURE',
    status: 'OPEN',
    dueAt: null,
    estimatedCostMinCents: null,
    estimatedCostMaxCents: null,
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

function unpermittedFlagReadinessItem(overrides = {}) {
  return permitReadinessItem({
    id: 'readiness-unpermitted-1',
    sourceEntityType: 'PERMIT_UNPERMITTED_FLAG',
    title: 'Possible unpermitted work: DECK',
    detail: 'No matching permit found for an observed deck addition (disclosure risk: MEDIUM)',
    ...overrides,
  });
}

function stubsWith({ saleCase, items }) {
  return baseStubs({
    propertySaleCase: { findUnique: async () => saleCase },
    saleReadinessItem: { findMany: async () => items },
  });
}

test('an unverified permit readiness item on an active sale case produces a SALE_PREP Home Action', async () => {
  const db = stubsWith({ saleCase: baseSaleCase(), items: [permitReadinessItem()] });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  const [action] = actions;
  assert.equal(action.source.kind, 'SALE_PREP');
  assert.equal(action.id, 'sale-prep:readiness-permit-1');
  assert.ok(action.signal.toLowerCase().includes('unverified permit'));
  assert.equal(action.governance.safetyTier, 'LOW_CONSEQUENCE');
});

test('an unpermitted-work flag readiness item on an active sale case produces a SALE_PREP Home Action', async () => {
  const db = stubsWith({ saleCase: baseSaleCase(), items: [unpermittedFlagReadinessItem()] });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].id, 'sale-prep:readiness-unpermitted-1');
  assert.ok(actions[0].signal.toLowerCase().includes('unpermitted work'));
});

test('no active sale case suppresses permit readiness items entirely (they stay Sale-Case-only, not a standing Home Action)', async () => {
  const db = stubsWith({ saleCase: null, items: [permitReadinessItem()] });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('a closed or cancelled sale case suppresses permit readiness items', async () => {
  const closed = await getPromotedHomeActions('property-1', stubsWith({
    saleCase: baseSaleCase({ status: 'CLOSED' }),
    items: [permitReadinessItem()],
  }), { evaluatedAt: NOW, includePersonalization: false });
  const cancelled = await getPromotedHomeActions('property-1', stubsWith({
    saleCase: baseSaleCase({ status: 'CANCELLED' }),
    items: [permitReadinessItem()],
  }), { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(closed.actions.length, 0);
  assert.equal(cancelled.actions.length, 0);
});

test('an already-resolved readiness item is not queried into a Home Action (status: OPEN is enforced at the query layer)', async () => {
  // The loader's own query filters status: 'OPEN' — a faithful stub for a
  // resolved item simply never returns it, same convention every other
  // producer's "no matching record" test in this suite uses.
  const db = stubsWith({ saleCase: baseSaleCase(), items: [] });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

// Regression: found while adding the PERMIT/PERMIT_UNPERMITTED_FLAG source
// types above. Every SALE_PREP_SELF_REPORT title is "<field>: <condition>"
// (always contains a colon), which made the keyFacts label swap from
// 'Item' to 'Current assessment' — silently failing
// homeActionPresentationRegistry.ts's SALE_PREPARATION requiredFactLabels
// check and suppressing every self-reported sale-prep Home Action from the
// Home feed. Fixed by keeping the label always 'Item' and folding the
// assessment into its value instead.
test('a self-reported sale-prep item (title always contains a colon) is not silently suppressed', async () => {
  const db = stubsWith({
    saleCase: baseSaleCase(),
    items: [{
      id: 'readiness-self-report-1',
      sourceEntityType: 'SALE_PREP_SELF_REPORT',
      title: 'Kitchen condition: Good',
      detail: 'Homeowner-reported condition.',
      category: 'PRESENTATION',
      status: 'OPEN',
      dueAt: null,
      estimatedCostMinCents: null,
      estimatedCostMaxCents: null,
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    }],
  });
  const { actions, diagnostics } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(diagnostics.suppressedCount, 0);
  assert.equal(actions.length, 1);
  assert.ok(actions[0].presentation.keyFacts.some((fact) => fact.label === 'Item' && fact.value.includes('Kitchen condition')));
});

test('permit-sourced items are still gated on an active sale case for every stage (LISTED, UNDER_CONTRACT)', async () => {
  const listed = await getPromotedHomeActions('property-1', stubsWith({
    saleCase: baseSaleCase({ status: 'LISTED' }),
    items: [permitReadinessItem()],
  }), { evaluatedAt: NOW, includePersonalization: false });
  const underContract = await getPromotedHomeActions('property-1', stubsWith({
    saleCase: baseSaleCase({ status: 'UNDER_CONTRACT', targetCloseDate: new Date('2026-09-15T00:00:00.000Z') }),
    items: [unpermittedFlagReadinessItem()],
  }), { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(listed.actions.length, 1);
  assert.equal(underContract.actions.length, 1);
});
