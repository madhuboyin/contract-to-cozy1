const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { getPromotedHomeActions } = require('../../src/services/homeActionSourcePromotion.service.ts');

const NOW = new Date('2026-08-23T12:00:00.000Z');

function stubSources({ analyses = [], repairEvents = [] } = {}) {
  return {
    guidanceJourney: {
      findMany: async (args) => (args?.where?.steps?.some?.toolKey === 'replace-repair' ? [] : []),
    },
    incident: { findMany: async () => [] },
    recallMatch: { findMany: async () => [] },
    coverageReview: { findMany: async () => [] },
    projectRecord: { findMany: async () => [] },
    seasonalChecklist: { findMany: async () => [] },
    personalizedRecommendation: { findMany: async () => [] },
    orchestrationActionEvent: { findMany: async () => [] },
    orchestrationActionSnooze: { findMany: async () => [] },
    replaceRepairAnalysis: { findMany: async () => analyses },
    homeEvent: {
      findMany: async ({ where }) => repairEvents.filter((event) =>
        where.inventoryItemId.in.includes(event.inventoryItemId)),
    },
  };
}

function analysis(overrides = {}) {
  return {
    id: 'analysis-1',
    propertyId: 'property-1',
    inventoryItemId: 'item-1',
    currentMarker: 'CURRENT',
    status: 'READY',
    verdict: 'REPAIR_AND_MONITOR',
    confidence: 'HIGH',
    impactLevel: 'MEDIUM',
    summary: 'This water heater shows minor wear.',
    computedAt: NOW,
    inventoryItem: { id: 'item-1', name: 'Water Heater' },
    ...overrides,
  };
}

function repairEvent(overrides = {}) {
  return { inventoryItemId: 'item-1', ...overrides };
}

test('two or more repair/maintenance events in the lookback window bumps priority to SOON and adds recurring-failure evidence', async () => {
  const db = stubSources({
    analyses: [analysis()],
    repairEvents: [repairEvent(), repairEvent()],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  const [action] = actions;
  assert.equal(action.priority, 'SOON');
  assert.ok(action.whyItMatters.includes('2 logged repair or maintenance events'));
  assert.equal(action.evidence.length, 2, 'the base analysis evidence plus the recurring-failure evidence');
  assert.ok(action.evidence.some((entry) => entry.label.includes('2 repair/maintenance events')));
  // Identity/decision-lineage fields must be untouched by enrichment.
  assert.equal(action.id, 'repair-replace:analysis-1');
  assert.equal(action.lineageId, 'repair-replace:item-1');
});

test('exactly one repair event does not count as a recurring pattern', async () => {
  const db = stubSources({
    analyses: [analysis()],
    repairEvents: [repairEvent()],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions[0].priority, 'PLAN');
  assert.equal(actions[0].evidence.length, 1);
  assert.ok(!actions[0].whyItMatters.includes('logged repair'));
});

test('no repair events at all leaves the base behavior unchanged', async () => {
  const db = stubSources({ analyses: [analysis()], repairEvents: [] });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions[0].priority, 'PLAN');
  assert.equal(actions[0].evidence.length, 1);
});

test('a REPLACE_NOW verdict stays SOON regardless of repair history, without duplicated evidence when there is no recurring pattern', async () => {
  const db = stubSources({
    analyses: [analysis({ verdict: 'REPLACE_NOW' })],
    repairEvents: [],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions[0].priority, 'SOON');
  assert.equal(actions[0].evidence.length, 1);
});

test('repair events on a different inventory item do not enrich this item\'s action', async () => {
  const db = stubSources({
    analyses: [analysis()],
    repairEvents: [repairEvent({ inventoryItemId: 'item-other' }), repairEvent({ inventoryItemId: 'item-other' })],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions[0].priority, 'PLAN');
  assert.equal(actions[0].evidence.length, 1);
});

test('a db stub without homeEvent does not throw and simply skips the enrichment', async () => {
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
    replaceRepairAnalysis: { findMany: async () => [analysis()] },
  };
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].priority, 'PLAN');
});
