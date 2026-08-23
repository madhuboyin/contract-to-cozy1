const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { getPromotedHomeActions } = require('../../src/services/homeActionSourcePromotion.service.ts');

const NOW = new Date('2026-08-23T12:00:00.000Z');

function daysFromNow(days) {
  return new Date(NOW.getTime() + days * 86_400_000);
}

// Minimal valid stub for every required HomeActionSourceDb table so other
// loaders in getPromotedHomeActions() produce no candidates and don't throw.
// warranty/insurancePolicy (the tables this slice adds) are supplied per-test.
function stubSources({ warranties = [], insurancePolicies = [] } = {}) {
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
    warranty: { findMany: async () => warranties },
    insurancePolicy: { findMany: async () => insurancePolicies },
  };
}

test('an expired warranty produces a SOON-priority COVERAGE Home Action', async () => {
  const db = stubSources({
    warranties: [{
      id: 'warranty-1', providerName: 'Acme Home Warranty', inventoryItemId: 'item-1',
      expiryDate: daysFromNow(-10), updatedAt: NOW,
    }],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  const [action] = actions;
  assert.equal(action.id, 'coverage-renewal:warranty:warranty-1');
  assert.equal(action.source.kind, 'COVERAGE');
  assert.equal(action.priority, 'SOON');
  assert.equal(action.governance.safetyTier, 'MATERIAL_FINANCIAL');
  assert.ok(action.signal.startsWith('EXPIRED:'));
  assert.deepEqual(action.feedbackControls, ['ACKNOWLEDGE', 'DEFER', 'SNOOZE', 'DISMISS', 'NOT_RELEVANT', 'CORRECT_FACT']);
  assert.equal(action.primaryCta.href, '/dashboard/properties/property-1/inventory?tab=coverage&highlight=item-1');
});

test('an insurance policy expiring within 90 days produces a PLAN-priority COVERAGE Home Action', async () => {
  const db = stubSources({
    insurancePolicies: [{
      id: 'policy-1', carrierName: 'State Farm', expiryDate: daysFromNow(30), updatedAt: NOW,
    }],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  const [action] = actions;
  assert.equal(action.id, 'coverage-renewal:insurance:policy-1');
  assert.equal(action.priority, 'PLAN');
  assert.ok(action.signal.startsWith('UPCOMING:'));
  assert.equal(action.primaryCta.href, '/dashboard/insurance?propertyId=property-1');
});

test('a renewal more than 90 days out is excluded', async () => {
  const db = stubSources({
    warranties: [{ id: 'warranty-2', providerName: 'Acme', inventoryItemId: null, expiryDate: daysFromNow(200), updatedAt: NOW }],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 0);
});

test('a record with no expiryDate is excluded', async () => {
  const db = stubSources({
    insurancePolicies: [{ id: 'policy-2', carrierName: 'Allstate', expiryDate: null, updatedAt: NOW }],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 0);
});

test('a db stub without warranty/insurancePolicy tables does not throw and yields no renewal actions', async () => {
  const db = {
    guidanceJourney: { findMany: async () => [] },
    incident: { findMany: async () => [] },
    recallMatch: { findMany: async () => [] },
    coverageReview: { findMany: async () => [] },
    projectRecord: { findMany: async () => [] },
    seasonalChecklist: { findMany: async () => [] },
    personalizedRecommendation: { findMany: async () => [] },
    orchestrationActionEvent: { findMany: async () => [] },
    orchestrationActionSnooze: { findMany: async () => [] },
  };
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 0);
});
