const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { getPromotedHomeActions } = require('../../src/services/homeActionSourcePromotion.service.ts');

const NOW = new Date('2026-07-18T12:00:00.000Z');
const LATER = new Date('2026-08-18T12:00:00.000Z');

function stubSources({
  terminalActionKey = null,
  snoozedActionKey = null,
  guidanceConfidence = 0.85,
  includeWeatherGuidance = false,
} = {}) {
  const guidanceJourneys = [{
    id: 'journey-1', propertyId: 'property-1', inventoryItemId: 'item-1', primarySignalId: 'signal-1',
    journeyTypeKey: 'asset_lifecycle_resolution', issueDomain: 'MAINTENANCE', issueType: 'Repair or replace HVAC', templateVersion: '2.1.0',
    status: 'ACTIVE', startedAt: NOW, createdAt: NOW, updatedAt: NOW, missingContextKeys: [],
    primarySignal: { id: 'signal-1', severity: 'HIGH', confidenceScore: guidanceConfidence, lastObservedAt: NOW },
    steps: [{ label: 'Compare repair and replacement', description: 'Review durable options.', status: 'PENDING', routePath: '/dashboard/properties/:propertyId/inventory/items/:itemId/replace-repair' }],
  }];
  if (includeWeatherGuidance) guidanceJourneys.push({
    id: 'journey-weather', propertyId: 'property-1', inventoryItemId: null, primarySignalId: 'signal-weather',
    journeyTypeKey: 'flood_risk', issueDomain: 'WEATHER', issueType: 'Flood preparation', templateVersion: '2.1.0',
    status: 'ACTIVE', startedAt: NOW, createdAt: NOW, updatedAt: NOW, missingContextKeys: [],
    primarySignal: {
      id: 'signal-weather', severity: 'HIGH', confidenceScore: 0.7, lastObservedAt: NOW,
      sourceEntityType: 'INCIDENT', sourceEntityId: 'incident-1',
    },
    steps: [{ label: 'Review flood preparation', description: 'Prepare for the active alert.', status: 'PENDING', routePath: '/dashboard/properties/:propertyId/incidents' }],
  });
  return {
    guidanceJourney: { findMany: async () => guidanceJourneys },
    incident: { findMany: async () => [{
    id: 'incident-1', propertyId: 'property-1', fingerprint: 'freeze-1', severity: 'CRITICAL', confidence: 90,
    title: 'Freeze risk', summary: 'Pipes may freeze.', sourceType: 'WEATHER', status: 'ACTIVE',
    openedAt: NOW, expiredAt: LATER, createdAt: NOW, updatedAt: NOW, lastEvaluatedAt: NOW,
    details: { senderName: 'NWS Mount Holly NJ', expires: LATER.toISOString(), instruction: 'Protect exposed pipes before temperatures fall.' },
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
    seasonalChecklist: { findMany: async () => [{
      id: 'seasonal-1', propertyId: 'property-1', season: 'SUMMER', year: 2026,
      status: 'IN_PROGRESS', totalTasks: 3, tasksCompleted: 0,
      seasonStartDate: NOW, seasonEndDate: LATER, createdAt: NOW, updatedAt: NOW,
      items: [
        { id: 'seasonal-item-1', title: 'Test the sump pump', priority: 'CRITICAL', status: 'ADDED', snoozedUntil: null, recommendedDate: NOW, updatedAt: NOW },
        { id: 'seasonal-item-2', title: 'Clean the outdoor condenser', priority: 'RECOMMENDED', status: 'ADDED', snoozedUntil: null, recommendedDate: NOW, updatedAt: NOW },
        { id: 'seasonal-item-3', title: 'Inspect exterior drainage', priority: 'RECOMMENDED', status: 'ADDED', snoozedUntil: null, recommendedDate: NOW, updatedAt: NOW },
      ],
    }] },
    orchestrationActionEvent: { findMany: async () =>
      terminalActionKey ? [{ actionKey: terminalActionKey }] : [] },
    orchestrationActionSnooze: { findMany: async () =>
      snoozedActionKey ? [{ actionKey: snoozedActionKey }] : [] },
  };
}

test('promotes guidance, incident, recall, coverage, project, and seasonal records into validating Home Actions', async () => {
  const result = await getPromotedHomeActions('property-1', stubSources());
  const actions = result.actions;
  assert.deepEqual(actions.map((action) => action.source.kind).sort(), [
    'COVERAGE', 'GUIDANCE', 'INCIDENT', 'MAINTENANCE', 'PROJECT', 'RECALL',
  ]);
  assert.equal(actions.find((action) => action.source.kind === 'GUIDANCE').relatedJourneyId, 'journey-1');
  assert.equal(actions.find((action) => action.source.kind === 'INCIDENT').primaryCta.kind, 'ESCALATE');
  assert.equal(actions.find((action) => action.id === 'seasonal-checklist:seasonal-1').primaryCta.label, 'View seasonal checklist');
  assert.equal(actions.find((action) => action.source.kind === 'COVERAGE').governance.jurisdictionCheck.status, 'VERIFIED');
});

test('keeps the active weather incident and suppresses its duplicate guidance journey', async () => {
  const result = await getPromotedHomeActions('property-1', stubSources({ includeWeatherGuidance: true }));
  const weather = result.actions.find((action) => action.id === 'incident:incident-1');
  assert.ok(weather);
  assert.equal(weather.priority, 'NOW');
  assert.equal(weather.recommendedAction, 'Review Freeze risk safety guidance');
  assert.equal(weather.evidence[0].source, 'National Weather Service — NWS Mount Holly NJ');
  assert.equal(weather.timing.windowEnd, LATER.toISOString());
  assert.equal(result.actions.some((action) => action.id === 'guidance:journey-weather'), false);
});

test('normalizes legacy guidance percentages before trust evaluation and Home Action validation', async () => {
  const result = await getPromotedHomeActions('property-1', stubSources({ guidanceConfidence: 40 }));
  const guidance = result.actions.find((action) => action.source.kind === 'GUIDANCE');
  assert.equal(guidance.evidence[0].confidence, 0.4);
  assert.equal(guidance.confidence.score, 0.4);
  assert.equal(guidance.confidence.label, 'LOW');
  assert.equal(guidance.recommendationResponse.status, 'LOW_CONFIDENCE');
});

test('honors terminal and active-snooze lifecycle suppression for promoted sources', async () => {
  const result = await getPromotedHomeActions('property-1', stubSources({
    terminalActionKey: 'guidance:journey-1',
    snoozedActionKey: 'project:project-1',
  }));
  const actions = result.actions;
  assert.equal(actions.some((action) => action.id === 'guidance:journey-1'), false);
  assert.equal(actions.some((action) => action.id === 'project:project-1'), false);
  assert.equal(actions.length, 4);
  assert.deepEqual(result.diagnostics, { candidateCount: 6, suppressedCount: 1, snoozedCount: 1 });
});
