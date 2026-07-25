const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RefinanceConfidenceLevel,
  RefinanceRadarState,
} = require('@prisma/client');
const {
  buildRefinanceTransitionOutboxEvent,
  detectRefinanceTransition,
  domainEventTypeForRefinanceTransition,
} = require('../../dist/refinanceRadar/refinanceRadarTransition');

function opportunity(overrides = {}) {
  return {
    monthlySavings: 250,
    breakEvenMonths: 24,
    marketRatePct: 6.25,
    confidenceLevel: RefinanceConfidenceLevel.GOOD,
    ...overrides,
  };
}

test('detects OPEN and CLOSED only on effective state transitions', () => {
  const opened = detectRefinanceTransition({
    previousState: RefinanceRadarState.CLOSED,
    nextState: RefinanceRadarState.OPEN,
    previousOpportunity: null,
    nextOpportunity: opportunity(),
  });
  const closed = detectRefinanceTransition({
    previousState: RefinanceRadarState.OPEN,
    nextState: RefinanceRadarState.CLOSED,
    previousOpportunity: opportunity(),
    nextOpportunity: null,
  });

  assert.equal(opened.kind, 'OPEN');
  assert.equal(closed.kind, 'CLOSED');
  assert.equal(domainEventTypeForRefinanceTransition(opened.kind), 'REFINANCE_OPPORTUNITY_OPENED');
  assert.equal(domainEventTypeForRefinanceTransition(closed.kind), 'REFINANCE_OPPORTUNITY_CLOSED');
});

test('suppresses immaterial OPEN-to-OPEN movement', () => {
  const transition = detectRefinanceTransition({
    previousState: RefinanceRadarState.OPEN,
    nextState: RefinanceRadarState.OPEN,
    previousOpportunity: opportunity(),
    nextOpportunity: opportunity({
      monthlySavings: 260,
      breakEvenMonths: 26,
      marketRatePct: 6.2,
    }),
  });

  assert.equal(transition, null);
});

test('emits UPDATE with every material change reason', () => {
  const transition = detectRefinanceTransition({
    previousState: RefinanceRadarState.OPEN,
    nextState: RefinanceRadarState.OPEN,
    previousOpportunity: opportunity(),
    nextOpportunity: opportunity({
      monthlySavings: 325,
      breakEvenMonths: 17,
      marketRatePct: 6,
      confidenceLevel: RefinanceConfidenceLevel.STRONG,
    }),
  });

  assert.equal(transition.kind, 'UPDATE');
  assert.deepEqual(transition.materialChangeReasons, [
    'MONTHLY_SAVINGS_CHANGED',
    'BREAK_EVEN_CHANGED',
    'MARKET_RATE_CHANGED',
    'CONFIDENCE_CHANGED',
  ]);
  assert.equal(domainEventTypeForRefinanceTransition(transition.kind), 'REFINANCE_OPPORTUNITY_UPDATED');
});

test('does not emit for CLOSED-to-CLOSED monitoring evaluations', () => {
  const transition = detectRefinanceTransition({
    previousState: RefinanceRadarState.CLOSED,
    nextState: RefinanceRadarState.CLOSED,
    previousOpportunity: null,
    nextOpportunity: null,
  });

  assert.equal(transition, null);
});

test('builds a stable property/snapshot/transition outbox contract', () => {
  const transition = detectRefinanceTransition({
    previousState: RefinanceRadarState.CLOSED,
    nextState: RefinanceRadarState.OPEN,
    previousOpportunity: null,
    nextOpportunity: opportunity(),
  });
  const event = buildRefinanceTransitionOutboxEvent({
    propertyId: 'property-1',
    snapshotId: 'snapshot-1',
    opportunityId: 'opportunity-1',
    transition,
    occurredAt: new Date('2026-07-25T18:00:00.000Z'),
  });

  assert.equal(event.type, 'REFINANCE_OPPORTUNITY_OPENED');
  assert.equal(event.idempotencyKey, 'refinance:property-1:snapshot-1:open');
  assert.deepEqual(event.payload, {
    propertyId: 'property-1',
    previousState: RefinanceRadarState.CLOSED,
    nextState: RefinanceRadarState.OPEN,
    transitionType: 'OPEN',
    snapshotId: 'snapshot-1',
    opportunityId: 'opportunity-1',
    materialChangeReasons: ['OPPORTUNITY_THRESHOLD_MET'],
    occurredAt: '2026-07-25T18:00:00.000Z',
  });
});
