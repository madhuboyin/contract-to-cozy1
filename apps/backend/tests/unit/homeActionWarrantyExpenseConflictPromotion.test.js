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

function warranty(overrides = {}) {
  return {
    id: 'warranty-1',
    category: 'HVAC',
    providerName: 'CoolAir Warranty Co.',
    expiryDate: new Date('2027-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

function expense(overrides = {}) {
  return {
    id: 'expense-1',
    description: 'HVAC repair',
    category: 'REPAIR_SERVICE',
    amount: 450,
    transactionDate: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

test('two active warranties in the same category with different providers produce one conflict Home Action', async () => {
  const db = baseStubs({
    warranty: { findMany: async () => [warranty(), warranty({ id: 'warranty-2', providerName: 'Other Provider Inc.' })] },
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  const [action] = actions;
  assert.equal(action.source.kind, 'SYSTEM');
  assert.ok(action.id.startsWith('warranty-conflict:'));
  assert.equal(action.priority, 'SOON');
  assert.ok(action.signal.includes('hvac'));
  assert.equal(action.evidence.length, 2);
  assert.equal(action.primaryCta.href, '/dashboard/warranties');
});

test('two active warranties in the same category with the same provider but expiry dates far apart still conflict', async () => {
  const db = baseStubs({
    warranty: {
      findMany: async () => [
        warranty({ expiryDate: new Date('2027-01-01T00:00:00.000Z') }),
        warranty({ id: 'warranty-2', expiryDate: new Date('2026-09-01T00:00:00.000Z') }),
      ],
    },
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 1);
});

test('two active warranties in the same category with the same provider and close expiry dates do not conflict', async () => {
  const db = baseStubs({
    warranty: {
      findMany: async () => [
        warranty({ expiryDate: new Date('2027-01-01T00:00:00.000Z') }),
        warranty({ id: 'warranty-2', expiryDate: new Date('2027-01-10T00:00:00.000Z') }),
      ],
    },
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('a single warranty in a category never conflicts', async () => {
  const db = baseStubs({ warranty: { findMany: async () => [warranty()] } });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('two OTHER-category warranties never conflict, even with different providers', async () => {
  const db = baseStubs({
    warranty: {
      findMany: async () => [
        warranty({ category: 'OTHER' }),
        warranty({ id: 'warranty-2', category: 'OTHER', providerName: 'Different Co.' }),
      ],
    },
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('warranties in different categories never conflict with each other', async () => {
  const db = baseStubs({
    warranty: {
      findMany: async () => [
        warranty({ category: 'HVAC' }),
        warranty({ id: 'warranty-2', category: 'PLUMBING', providerName: 'Different Co.' }),
      ],
    },
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('two expenses with the same amount within the tolerance window are flagged as a likely duplicate', async () => {
  const db = baseStubs({
    expense: {
      findMany: async () => [
        expense(),
        expense({ id: 'expense-2', transactionDate: new Date('2026-08-02T00:00:00.000Z') }),
      ],
    },
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 1);
  assert.ok(actions[0].id.startsWith('expense-duplicate:'));
  assert.equal(actions[0].priority, 'PLAN');
  assert.equal(actions[0].primaryCta.href, '/dashboard/expenses');
});

test('two expenses with the same amount far outside the tolerance window are not flagged', async () => {
  const db = baseStubs({
    expense: {
      findMany: async () => [
        expense(),
        expense({ id: 'expense-2', transactionDate: new Date('2026-09-15T00:00:00.000Z') }),
      ],
    },
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('two expenses with different amounts close in time are not flagged, even though repeats in a category are normal', async () => {
  const db = baseStubs({
    expense: {
      findMany: async () => [
        expense({ amount: 450 }),
        expense({ id: 'expense-2', amount: 600, transactionDate: new Date('2026-08-02T00:00:00.000Z') }),
      ],
    },
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('a db stub without warranty/expense tables does not throw and yields no conflict actions', async () => {
  const db = baseStubs();
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

// HI-ATT-007 stable-version requirement.
test('sourceVersion for a warranty conflict changes when a member warranty is updated', async () => {
  const first = await getPromotedHomeActions('property-1', baseStubs({
    warranty: { findMany: async () => [warranty(), warranty({ id: 'warranty-2', providerName: 'Other Provider Inc.' })] },
  }), { evaluatedAt: NOW, includePersonalization: false });
  const second = await getPromotedHomeActions('property-1', baseStubs({
    warranty: { findMany: async () => [warranty(), warranty({ id: 'warranty-2', providerName: 'Other Provider Inc.', updatedAt: new Date('2026-08-15T00:00:00.000Z') })] },
  }), { evaluatedAt: NOW, includePersonalization: false });
  assert.notEqual(first.actions[0].source.version, second.actions[0].source.version);
});
