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

let repairEventIdCounter = 0;
function repairEvent(overrides = {}) {
  repairEventIdCounter += 1;
  return {
    id: `home-event-${repairEventIdCounter}`,
    inventoryItemId: 'item-1',
    type: 'REPAIR',
    occurredAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

test('two or more repair/maintenance events in the lookback window bumps priority to SOON and adds one evidence entry per contributing event', async () => {
  const eventA = repairEvent({ id: 'home-event-a', type: 'REPAIR', occurredAt: new Date('2026-06-01T00:00:00.000Z') });
  const eventB = repairEvent({ id: 'home-event-b', type: 'MAINTENANCE', occurredAt: new Date('2026-03-01T00:00:00.000Z') });
  const db = stubSources({
    analyses: [analysis()],
    repairEvents: [eventA, eventB],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  const [action] = actions;
  assert.equal(action.priority, 'SOON');
  assert.ok(action.whyItMatters.includes('2 logged repair or maintenance events'));
  // HI-CMP-003: one evidence entry per contributing HomeEvent (its own id
  // and observedAt), not an aggregate summary — base analysis evidence
  // plus one entry per event.
  assert.equal(action.evidence.length, 3, 'the base analysis evidence plus one entry per contributing event');
  const repairEvidence = action.evidence.find((entry) => entry.id === 'home-event-a');
  assert.ok(repairEvidence, 'the REPAIR event\'s own id must appear as its own evidence entry');
  assert.equal(repairEvidence.type, 'HOME_EVENT');
  assert.equal(repairEvidence.label, 'Repair logged');
  assert.equal(repairEvidence.observedAt, '2026-06-01T00:00:00.000Z');
  const maintenanceEvidence = action.evidence.find((entry) => entry.id === 'home-event-b');
  assert.ok(maintenanceEvidence, 'the MAINTENANCE event\'s own id must appear as its own evidence entry');
  assert.equal(maintenanceEvidence.label, 'Maintenance logged');
  assert.equal(maintenanceEvidence.observedAt, '2026-03-01T00:00:00.000Z');
  // Identity/decision-lineage fields must be untouched by enrichment.
  assert.equal(action.id, 'repair-replace:analysis-1');
  assert.equal(action.lineageId, 'repair-replace:item-1');
});

test('all contributing events remain in canonical evidence even for a long repair history', async () => {
  const events = Array.from({ length: 15 }, (_, index) => repairEvent({
    id: `home-event-${index}`,
    occurredAt: new Date(2026, 0, index + 1),
  }));
  const db = stubSources({ analyses: [analysis()], repairEvents: events });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.ok(actions[0].whyItMatters.includes('15 logged repair or maintenance events'));
  assert.equal(actions[0].evidence.length, 16, 'base analysis evidence plus every contributing event');
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
