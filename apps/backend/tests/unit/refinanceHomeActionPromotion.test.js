const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const {
  loadRefinanceOpportunityActions,
} = require('../../src/services/homeActionSourcePromotion.service.ts');
const {
  SAVE_OPTIMIZE_CAPABILITIES,
} = require('../../src/productFramework/capabilities/definitions/saveOptimize.ts');

const OPENED_AT = new Date('2026-07-20T12:00:00.000Z');
const EVALUATED_AT = new Date('2026-07-27T12:00:00.000Z');

function dbForState(overrides = {}) {
  const state = {
    id: 'radar-state-1',
    radarState: 'OPEN',
    lastOpenedAt: OPENED_AT,
    lastEvaluatedAt: EVALUATED_AT,
    updatedAt: EVALUATED_AT,
    lastRateSnapshot: {
      date: new Date('2026-07-24T00:00:00.000Z'),
      source: 'FREDDIE_MAC',
    },
    currentOpportunity: {
      id: 'opportunity-2',
      monthlySavings: 325.4,
      breakEvenMonths: 19,
      lifetimeSavings: 48_000,
      marketRate: 5.875,
      currentRate: 7.125,
      confidenceLevel: 'STRONG',
      evaluationDate: new Date('2026-07-27T00:00:00.000Z'),
      updatedAt: EVALUATED_AT,
    },
    ...overrides,
  };
  return {
    propertyRefinanceRadarState: {
      findUnique: async () => state,
    },
    propertyFinancingProfile: {
      findUnique: async () => ({
        mortgageStatus: 'HAS_MORTGAGE',
        currentMortgageBalanceCents: 280_000_00,
        interestRateBps: 713,
        remainingTermMonths: 312,
        mortgageBalanceAsOfDate: new Date('2026-07-15T00:00:00.000Z'),
      }),
    },
  };
}

test('reviewed refinance capability contract describes catalog discovery and event-owned Home promotion', () => {
  const capability = SAVE_OPTIMIZE_CAPABILITIES.find(
    (candidate) => candidate.id === 'mortgage-refinance-radar',
  );
  assert.ok(capability);
  assert.equal(capability.version, 2);
  assert.equal(capability.recommendation.mode, 'CATALOG_ONLY');
  assert.deepEqual(capability.recommendation.triggerFamilies, [
    'REFINANCE_OPPORTUNITY_OPENED',
    'REFINANCE_OPPORTUNITY_UPDATED',
    'REFINANCE_DATA_REQUIRED',
  ]);
  assert.equal(capability.lifecycle.completionKind, 'DECISION_RECORDED');
  assert.equal(capability.lifecycle.completionSignal, 'refinance_decision_recorded');
  assert.ok(capability.productFramework.livingHomeRecordReads.includes('financing-profile'));
  assert.ok(capability.productFramework.livingHomeRecordWrites.includes('refinance-decision'));
  assert.ok(capability.destination.acceptedContext.includes('HOME_ACTION'));
  assert.match(capability.productFramework.expectedTimeToValue, /Passive monitoring/);
});

test('OPEN produces one material-financial canonical Home Action', async () => {
  const actions = await loadRefinanceOpportunityActions('property-1', dbForState(), EVALUATED_AT);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].id, `refinance-opportunity:property-1:${OPENED_AT.getTime()}`);
  assert.equal(actions[0].lineageId, 'refinance-opportunity:property-1');
  assert.equal(actions[0].source.entityId, 'radar-state-1');
  assert.equal(actions[0].job, 'DECIDE');
  assert.equal(actions[0].governance.safetyTier, 'MATERIAL_FINANCIAL');
  assert.equal(actions[0].primaryCta.kind, 'REVIEW');
  assert.match(actions[0].whyItMatters, /\$325 per month/);
});

test('material UPDATE keeps the action identity and advances its source version', async () => {
  const [before] = await loadRefinanceOpportunityActions(
    'property-1',
    dbForState({ updatedAt: EVALUATED_AT }),
    EVALUATED_AT,
  );
  const updatedAt = new Date('2026-07-28T12:00:00.000Z');
  const [after] = await loadRefinanceOpportunityActions(
    'property-1',
    dbForState({
      updatedAt,
      lastEvaluatedAt: updatedAt,
    }),
    updatedAt,
  );
  assert.equal(after.id, before.id);
  assert.equal(after.lineageId, before.lineageId);
  assert.equal(after.source.version, updatedAt.toISOString());
});

test('CLOSED and incomplete OPEN state remain out of canonical Home', async () => {
  const closed = await loadRefinanceOpportunityActions(
    'property-1',
    dbForState({ radarState: 'CLOSED', currentOpportunity: null }),
    EVALUATED_AT,
  );
  const incomplete = await loadRefinanceOpportunityActions(
    'property-1',
    dbForState({ currentOpportunity: null }),
    EVALUATED_AT,
  );
  assert.deepEqual(closed, []);
  assert.deepEqual(incomplete, []);
});

test('a later reopened window receives a new action id without changing its lineage', async () => {
  const [first] = await loadRefinanceOpportunityActions('property-1', dbForState(), EVALUATED_AT);
  const reopenedAt = new Date('2026-09-01T12:00:00.000Z');
  const [reopened] = await loadRefinanceOpportunityActions(
    'property-1',
    dbForState({ lastOpenedAt: reopenedAt }),
    EVALUATED_AT,
  );
  assert.notEqual(reopened.id, first.id);
  assert.equal(reopened.lineageId, first.lineageId);
});

test('OPEN fails closed when mortgage facts or market evidence are stale', async () => {
  const staleAt = new Date('2027-02-01T12:00:00.000Z');
  const stale = await loadRefinanceOpportunityActions(
    'property-1',
    dbForState(),
    staleAt,
  );
  assert.deepEqual(stale, []);

  const missingMortgageDb = dbForState();
  missingMortgageDb.propertyFinancingProfile.findUnique = async () => ({
    mortgageStatus: 'HAS_MORTGAGE',
    currentMortgageBalanceCents: null,
    interestRateBps: 713,
    remainingTermMonths: 312,
    mortgageBalanceAsOfDate: new Date('2026-07-15T00:00:00.000Z'),
  });
  const incomplete = await loadRefinanceOpportunityActions(
    'property-1',
    missingMortgageDb,
    EVALUATED_AT,
  );
  assert.deepEqual(incomplete, []);
});

test('a decision suppresses the current OPEN action and deferred review returns once due', async () => {
  const reviewAt = new Date('2026-08-01T12:00:00.000Z');
  const deferredDb = dbForState();
  deferredDb.refinanceDecision = {
    findFirst: async () => ({
      id: 'decision-1',
      status: 'DEFERRED',
      radarOpportunityId: 'opportunity-2',
      nextReviewAt: reviewAt,
      version: 1,
      updatedAt: EVALUATED_AT,
    }),
  };
  const beforeReview = await loadRefinanceOpportunityActions(
    'property-1',
    deferredDb,
    new Date('2026-07-30T12:00:00.000Z'),
  );
  assert.deepEqual(beforeReview, []);

  const due = await loadRefinanceOpportunityActions(
    'property-1',
    deferredDb,
    reviewAt,
  );
  assert.equal(due.length, 1);
  assert.equal(due[0].id, `refinance-decision-review:decision-1:${reviewAt.getTime()}`);
  assert.equal(due[0].timing.dueAt, reviewAt.toISOString());
  assert.match(due[0].recommendedAction, /Revisit/);

  deferredDb.refinanceDecision.findFirst = async () => ({
    id: 'decision-1',
    status: 'PROCEEDING',
    radarOpportunityId: 'opportunity-2',
    nextReviewAt: null,
    version: 2,
    updatedAt: EVALUATED_AT,
  });
  const proceeding = await loadRefinanceOpportunityActions(
    'property-1',
    deferredDb,
    reviewAt,
  );
  assert.deepEqual(proceeding, []);
});
