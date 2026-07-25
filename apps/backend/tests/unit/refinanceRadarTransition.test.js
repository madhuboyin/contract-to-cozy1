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
  mapRefinanceTransitionDomainEvent,
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
    'MONTHLY_SAVINGS_IMPROVED',
    'BREAK_EVEN_CHANGED',
    'BREAK_EVEN_IMPROVED',
    'MARKET_RATE_CHANGED',
    'MARKET_RATE_IMPROVED',
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

test('maps a durable domain event into the public transition contract', () => {
  const transition = mapRefinanceTransitionDomainEvent({
    id: 'event-1',
    type: 'REFINANCE_OPPORTUNITY_UPDATED',
    payload: {
      previousState: 'OPEN',
      nextState: 'OPEN',
      snapshotId: 'snapshot-1',
      opportunityId: 'opportunity-1',
      materialChangeReasons: ['MONTHLY_SAVINGS_CHANGED', 42],
      occurredAt: '2026-07-25T18:00:00.000Z',
    },
    createdAt: new Date('2026-07-25T18:01:00.000Z'),
  });

  assert.deepEqual(transition, {
    id: 'event-1',
    transitionType: 'UPDATE',
    previousState: RefinanceRadarState.OPEN,
    nextState: RefinanceRadarState.OPEN,
    snapshotId: 'snapshot-1',
    opportunityId: 'opportunity-1',
    materialChangeReasons: ['MONTHLY_SAVINGS_CHANGED'],
    occurredAt: '2026-07-25T18:00:00.000Z',
  });
});

test('rejects malformed or unrelated domain events from transition history', () => {
  assert.equal(
    mapRefinanceTransitionDomainEvent({
      id: 'event-1',
      type: 'CLAIM_CLOSED',
      payload: { snapshotId: 'snapshot-1' },
      createdAt: new Date(),
    }),
    null,
  );
  assert.equal(
    mapRefinanceTransitionDomainEvent({
      id: 'event-2',
      type: 'REFINANCE_OPPORTUNITY_OPENED',
      payload: {},
      createdAt: new Date(),
    }),
    null,
  );
});
