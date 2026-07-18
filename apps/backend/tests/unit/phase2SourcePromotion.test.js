const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { getPromotedHomeActions } = require('../../src/services/homeActionSourcePromotion.service.ts');

const NOW = new Date('2026-07-18T12:00:00.000Z');
const LATER = new Date('2026-08-18T12:00:00.000Z');

function stubSources({ terminalActionKey = null, snoozedActionKey = null } = {}) {
  return {
    guidanceJourney: { findMany: async () => [{
    id: 'journey-1', propertyId: 'property-1', inventoryItemId: 'item-1', primarySignalId: 'signal-1',
    journeyTypeKey: 'asset_lifecycle_resolution', issueType: 'Repair or replace HVAC', templateVersion: '2.1.0',
    status: 'ACTIVE', startedAt: NOW, createdAt: NOW, updatedAt: NOW, missingContextKeys: [],
    primarySignal: { id: 'signal-1', severity: 'HIGH', confidenceScore: 0.85, lastObservedAt: NOW },
    steps: [{ label: 'Compare repair and replacement', description: 'Review durable options.', status: 'PENDING', routePath: '/dashboard/properties/:propertyId/inventory/items/:itemId/replace-repair' }],
    }] },
    incident: { findMany: async () => [{
    id: 'incident-1', propertyId: 'property-1', fingerprint: 'freeze-1', severity: 'CRITICAL', confidence: 90,
    title: 'Freeze risk', summary: 'Pipes may freeze.', sourceType: 'WEATHER', status: 'ACTIVE',
    openedAt: NOW, expiredAt: LATER, createdAt: NOW, updatedAt: NOW, lastEvaluatedAt: NOW,
    actions: [{ status: 'PROPOSED', ctaLabel: 'Review freeze response', ctaUrl: '/dashboard/properties/property-1/incidents/incident-1' }],
    }] },
    recallMatch: { findMany: async () => [{
    id: 'match-1', recallId: 'recall-1', inventoryItemId: 'item-1', confidencePct: 88,
    createdAt: NOW, updatedAt: NOW, inventoryItem: { name: 'Dryer' },
    recall: { id: 'recall-1', title: 'Dryer fire recall', severity: 'CRITICAL', hazard: 'Fire hazard', summary: null,
      remedy: 'Stop use and contact the manufacturer', remedyUrl: 'https://example.com/remedy', source: 'CPSC',
      recalledAt: NOW, lastSeenAt: NOW, updatedAt: NOW },
    }] },
    coverageAnalysis: { findMany: async () => [{
    id: 'coverage-1', inventoryItemId: 'item-1', impactLevel: 'HIGH', overallVerdict: 'WORTH_IT',
    summary: 'Coverage may reduce material exposure.', strategicAdvice: 'Compare current terms before renewal.',
    confidence: 'HIGH', computedAt: NOW, createdAt: NOW, updatedAt: NOW, property: { state: 'NJ' },
    }] },
    projectRecord: { findMany: async () => [{
    id: 'project-1', name: 'Roof replacement', description: 'Replace aging roof', status: 'IN_PROGRESS',
    startDate: NOW, expectedEndDate: LATER, createdAt: NOW, updatedAt: NOW,
    milestones: [{ name: 'Complete installation' }], issues: [],
    }] },
    orchestrationActionEvent: { findMany: async () =>
      terminalActionKey ? [{ actionKey: terminalActionKey }] : [] },
    orchestrationActionSnooze: { findMany: async () =>
      snoozedActionKey ? [{ actionKey: snoozedActionKey }] : [] },
  };
}

test('promotes guidance, incident, recall, coverage, and project records into validating Home Actions', async () => {
  const result = await getPromotedHomeActions('property-1', stubSources());
  const actions = result.actions;
  assert.deepEqual(actions.map((action) => action.source.kind).sort(), [
    'COVERAGE', 'GUIDANCE', 'INCIDENT', 'PROJECT', 'RECALL',
  ]);
  assert.equal(actions.find((action) => action.source.kind === 'GUIDANCE').relatedJourneyId, 'journey-1');
  assert.equal(actions.find((action) => action.source.kind === 'INCIDENT').primaryCta.kind, 'ESCALATE');
  assert.equal(actions.find((action) => action.source.kind === 'COVERAGE').governance.jurisdictionCheck.status, 'VERIFIED');
});

test('honors terminal and active-snooze lifecycle suppression for promoted sources', async () => {
  const result = await getPromotedHomeActions('property-1', stubSources({
    terminalActionKey: 'guidance:journey-1',
    snoozedActionKey: 'project:project-1',
  }));
  const actions = result.actions;
  assert.equal(actions.some((action) => action.id === 'guidance:journey-1'), false);
  assert.equal(actions.some((action) => action.id === 'project:project-1'), false);
  assert.equal(actions.length, 3);
  assert.deepEqual(result.diagnostics, { candidateCount: 5, suppressedCount: 1, snoozedCount: 1 });
});
