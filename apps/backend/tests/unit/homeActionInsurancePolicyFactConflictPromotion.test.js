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

function pendingFact(overrides = {}) {
  return {
    id: 'fact-pending-premium',
    factKey: 'ANNUAL_PREMIUM',
    valueType: 'AMOUNT',
    amountValue: 2400,
    textValue: null,
    booleanValue: null,
    jsonValue: null,
    confidence: 0.8,
    confirmationStatus: 'PENDING',
    confirmedAt: null,
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
    updatedAt: new Date('2026-08-20T00:00:00.000Z'),
    ...overrides,
  };
}

function pendingTerm(overrides = {}) {
  return {
    id: 'term-pending-1',
    insurancePolicyId: 'policy-1',
    propertyId: 'property-1',
    status: 'PENDING_CONFIRMATION',
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
    updatedAt: new Date('2026-08-20T00:00:00.000Z'),
    insurancePolicy: { id: 'policy-1', carrierName: 'Acme Insurance' },
    facts: [pendingFact()],
    ...overrides,
  };
}

function confirmedFact(overrides = {}) {
  return {
    id: 'fact-confirmed-premium',
    factKey: 'ANNUAL_PREMIUM',
    valueType: 'AMOUNT',
    amountValue: 1800,
    textValue: null,
    booleanValue: null,
    jsonValue: null,
    confidence: 1,
    confirmationStatus: 'CONFIRMED',
    confirmedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    policyTerm: { insurancePolicyId: 'policy-1', termStart: new Date('2026-01-01T00:00:00.000Z'), createdAt: new Date('2026-01-01T00:00:00.000Z') },
    ...overrides,
  };
}

function stubsWith({ pendingTerms = [], confirmedFacts = [] }) {
  return baseStubs({
    insurancePolicyTerm: { findMany: async () => pendingTerms },
    insurancePolicyFact: { findMany: async () => confirmedFacts },
  });
}

test('a pending fact that differs from a confirmed value on another term produces a conflict Home Action', async () => {
  const db = stubsWith({ pendingTerms: [pendingTerm()], confirmedFacts: [confirmedFact()] });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  const [action] = actions;
  assert.equal(action.source.kind, 'SYSTEM');
  assert.equal(action.id, 'insurance-fact-conflict:term-pending-1');
  assert.equal(action.priority, 'SOON');
  assert.ok(action.signal.includes('Acme Insurance'));
  assert.ok(action.whyItMatters.includes('Annual premium'));
  assert.equal(action.evidence.length, 2, 'one entry for the new extraction, one for the confirmed value');
  assert.equal(action.primaryCta.kind, 'CORRECT_FACT');
});

test('a pending fact that matches the confirmed value produces no conflict', async () => {
  const db = stubsWith({
    pendingTerms: [pendingTerm({ facts: [pendingFact({ amountValue: 1800 })] })],
    confirmedFacts: [confirmedFact({ amountValue: 1800 })],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('a pending fact with no prior confirmed value for that factKey produces no conflict', async () => {
  const db = stubsWith({ pendingTerms: [pendingTerm()], confirmedFacts: [] });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('multiple conflicting facts on the same term are aggregated into one Home Action', async () => {
  const db = stubsWith({
    pendingTerms: [pendingTerm({
      facts: [
        pendingFact(),
        pendingFact({ id: 'fact-pending-deductible', factKey: 'ALL_PERIL_DEDUCTIBLE', amountValue: 2500 }),
      ],
    })],
    confirmedFacts: [
      confirmedFact(),
      confirmedFact({ id: 'fact-confirmed-deductible', factKey: 'ALL_PERIL_DEDUCTIBLE', amountValue: 1000 }),
    ],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].evidence.length, 4);
  assert.ok(actions[0].whyItMatters.includes('Annual premium'));
  assert.ok(actions[0].whyItMatters.includes('Deductible'));
});

test('a confirmed fact from a different policy does not conflict', async () => {
  const db = stubsWith({
    pendingTerms: [pendingTerm()],
    confirmedFacts: [confirmedFact({ policyTerm: { insurancePolicyId: 'policy-other', termStart: new Date('2026-01-01T00:00:00.000Z'), createdAt: new Date('2026-01-01T00:00:00.000Z') } })],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('when multiple confirmed values exist for the same factKey, the most recent term wins', async () => {
  const db = stubsWith({
    pendingTerms: [pendingTerm()],
    confirmedFacts: [
      confirmedFact({ id: 'older', amountValue: 1800, policyTerm: { insurancePolicyId: 'policy-1', termStart: new Date('2025-01-01T00:00:00.000Z'), createdAt: new Date('2025-01-01T00:00:00.000Z') } }),
      confirmedFact({ id: 'newer', amountValue: 2400, policyTerm: { insurancePolicyId: 'policy-1', termStart: new Date('2026-01-01T00:00:00.000Z'), createdAt: new Date('2026-01-01T00:00:00.000Z') } }),
    ],
  });
  // pendingFact() defaults to amountValue 2400 — matches the newer confirmed value, so no conflict.
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('no pending terms produces no actions, and no throw', async () => {
  const db = stubsWith({ pendingTerms: [], confirmedFacts: [confirmedFact()] });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('a db stub without insurancePolicyTerm/Fact tables does not throw and yields no conflict actions', async () => {
  const db = baseStubs();
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

// HI-ATT-007 stable-version requirement.
test('sourceVersion is deterministic and changes when the pending term is updated', async () => {
  const first = await getPromotedHomeActions('property-1', stubsWith({ pendingTerms: [pendingTerm()], confirmedFacts: [confirmedFact()] }), { evaluatedAt: NOW, includePersonalization: false });
  const second = await getPromotedHomeActions('property-1', stubsWith({ pendingTerms: [pendingTerm()], confirmedFacts: [confirmedFact()] }), { evaluatedAt: new Date('2026-09-01T00:00:00.000Z'), includePersonalization: false });
  assert.equal(first.actions[0].source.version, second.actions[0].source.version);

  const third = await getPromotedHomeActions('property-1', stubsWith({
    pendingTerms: [pendingTerm({ updatedAt: new Date('2026-08-21T00:00:00.000Z') })],
    confirmedFacts: [confirmedFact()],
  }), { evaluatedAt: NOW, includePersonalization: false });
  assert.notEqual(first.actions[0].source.version, third.actions[0].source.version);
});
