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
  includePersonalization = false,
  personalizationContextVersion = 'context-v1',
  personalizationCode = 'hvac_filter_replacement_check_proof',
  personalizationSafetyTier = 'LOW_CONSEQUENCE',
  personalizationPolicyVersion = 'phase4-v1',
  personalizationExpiresAt = LATER,
  personalizationHeadline = 'Your HVAC filter may be due for a replacement check',
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
    personalizedRecommendation: { findMany: async () => includePersonalization ? [{
      id: 'personalization-1', propertyId: 'property-1', status: 'ACTIVE', score: 60,
      priorityBand: 'MEDIUM', confidence: 1, ruleVersion: 1, contentVersion: 2,
      firstEligibleAt: NOW, lastEvaluatedAt: NOW, expiresAt: personalizationExpiresAt,
      definition: {
        code: personalizationCode, category: 'low_cost_prevention', status: 'ACTIVE',
        safetyTier: personalizationSafetyTier, governancePolicyVersion: personalizationPolicyVersion,
      },
      evaluationRun: { resultJson: { contextVersion: personalizationContextVersion } },
      explanations: [{
        headline: personalizationHeadline,
        reasonCodes: [{ params: { message: 'The recorded HVAC service interval may have passed.' } }],
        evidenceJson: { contextVersion: personalizationContextVersion },
      }],
    }] : [] },
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

test('promotes an active reviewed personalization recommendation with its Property Context version', async () => {
  const result = await getPromotedHomeActions('property-1', stubSources({ includePersonalization: true }));
  const action = result.actions.find((candidate) => candidate.id === 'personalization:personalization-1');
  assert.ok(action);
  assert.equal(action.source.kind, 'PERSONALIZATION');
  assert.match(action.source.version, /^context-v1:r1:c2$/);
  assert.equal(action.primaryCta.label, 'Review recommendation');
  assert.equal(action.evidence[0].source, 'ContractToCozy reviewed personalization rule hvac_filter_replacement_check_proof');
  assert.equal(action.governance.safetyTier, 'LOW_CONSEQUENCE');
});

test('fails closed when personalization lacks a Property Context version or promotion is disabled', async () => {
  const missingVersion = await getPromotedHomeActions(
    'property-1',
    stubSources({ includePersonalization: true, personalizationContextVersion: null }),
  );
  assert.equal(missingVersion.actions.some((action) => action.source.kind === 'PERSONALIZATION'), false);

  const disabled = await getPromotedHomeActions(
    'property-1',
    stubSources({ includePersonalization: true }),
    { includePersonalization: false },
  );
  assert.equal(disabled.actions.some((action) => action.source.kind === 'PERSONALIZATION'), false);
});

test('fails closed for governance mismatch and expired personalization', async () => {
  const governanceMismatch = await getPromotedHomeActions(
    'property-1',
    stubSources({ includePersonalization: true, personalizationPolicyVersion: 'unreviewed-v2' }),
  );
  assert.equal(governanceMismatch.actions.some((action) => action.source.kind === 'PERSONALIZATION'), false);

  const expired = await getPromotedHomeActions(
    'property-1',
    stubSources({ includePersonalization: true, personalizationExpiresAt: new Date(Date.now() - 60_000) }),
  );
  assert.equal(expired.actions.some((action) => action.source.kind === 'PERSONALIZATION'), false);
});

test('safety personalization exposes escalation-only action controls', async () => {
  const result = await getPromotedHomeActions('property-1', stubSources({
    includePersonalization: true,
    personalizationCode: 'smoke_co_detector_battery_check',
    personalizationSafetyTier: 'SAFETY_EMERGENCY',
    personalizationHeadline: 'Check your smoke and carbon monoxide detector batteries',
  }));
  const action = result.actions.find((candidate) => candidate.source.kind === 'PERSONALIZATION');
  assert.ok(action);
  assert.equal(action.priority, 'NOW');
  assert.equal(action.primaryCta.kind, 'ESCALATE');
  assert.deepEqual(action.feedbackControls, ['COMPLETE', 'ALREADY_DONE', 'CORRECT_FACT']);
});

test('personalization Home Actions expose no household-profile data', async () => {
  const result = await getPromotedHomeActions('property-1', stubSources({ includePersonalization: true }));
  const action = result.actions.find((candidate) => candidate.source.kind === 'PERSONALIZATION');
  assert.ok(action);
  const exposed = JSON.stringify({ evidence: action.evidence, href: action.primaryCta.href, source: action.source });
  assert.doesNotMatch(exposed, /household|profileAnswer|consentVersion/i);
});

test('does not promote a weather incident after its authoritative alert expiry', async () => {
  const db = stubSources();
  const originalFindMany = db.incident.findMany;
  db.incident.findMany = async () => {
    const incidents = await originalFindMany();
    return incidents.map((incident) => ({
      ...incident,
      details: { ...incident.details, expires: new Date(Date.now() - 60_000).toISOString() },
    }));
  };

  const result = await getPromotedHomeActions('property-1', db);
  assert.equal(result.actions.some((action) => action.id === 'incident:incident-1'), false);
});

test('skips an empty seasonal record and promotes the active actionable checklist', async () => {
  const db = stubSources();
  const currentStart = new Date(Date.now() - 2 * 86_400_000);
  const currentEnd = new Date(Date.now() + 20 * 86_400_000);
  const upcomingStart = new Date(Date.now() + 30 * 86_400_000);
  const upcomingEnd = new Date(Date.now() + 90 * 86_400_000);
  db.seasonalChecklist.findMany = async () => [
    {
      id: 'seasonal-empty', propertyId: 'property-1', season: 'SPRING', year: 2026,
      status: 'IN_PROGRESS', totalTasks: 2, tasksCompleted: 2,
      seasonStartDate: currentStart, seasonEndDate: currentEnd, createdAt: currentStart, updatedAt: NOW,
      items: [
        { id: 'seasonal-empty-1', title: 'Completed task', priority: 'RECOMMENDED', status: 'COMPLETED', snoozedUntil: null, recommendedDate: currentStart, updatedAt: NOW },
        { id: 'seasonal-empty-2', title: 'Dismissed task', priority: 'OPTIONAL', status: 'DISMISSED', snoozedUntil: null, recommendedDate: currentStart, updatedAt: NOW },
      ],
    },
    {
      id: 'seasonal-upcoming', propertyId: 'property-1', season: 'FALL', year: 2026,
      status: 'PENDING', totalTasks: 1, tasksCompleted: 0,
      seasonStartDate: upcomingStart, seasonEndDate: upcomingEnd, createdAt: NOW, updatedAt: NOW,
      items: [
        { id: 'seasonal-upcoming-1', title: 'Service the heating system', priority: 'CRITICAL', status: 'RECOMMENDED', snoozedUntil: null, recommendedDate: upcomingStart, updatedAt: NOW },
      ],
    },
  ];

  const result = await getPromotedHomeActions('property-1', db);
  assert.equal(result.actions.some((action) => action.id === 'seasonal-checklist:seasonal-empty'), false);
  assert.ok(result.actions.find((action) => action.id === 'seasonal-checklist:seasonal-upcoming'));
});

test('prefers an active seasonal checklist over an earlier actionable upcoming record', async () => {
  const db = stubSources();
  const now = Date.now();
  const upcoming = {
    id: 'seasonal-upcoming', propertyId: 'property-1', season: 'FALL', year: 2026,
    status: 'PENDING', totalTasks: 1, tasksCompleted: 0,
    seasonStartDate: new Date(now + 10 * 86_400_000), seasonEndDate: new Date(now + 70 * 86_400_000), createdAt: NOW, updatedAt: NOW,
    items: [{ id: 'upcoming-item', title: 'Prepare for fall', priority: 'RECOMMENDED', status: 'RECOMMENDED', snoozedUntil: null, recommendedDate: NOW, updatedAt: NOW }],
  };
  const active = {
    id: 'seasonal-active', propertyId: 'property-1', season: 'SUMMER', year: 2026,
    status: 'IN_PROGRESS', totalTasks: 1, tasksCompleted: 0,
    seasonStartDate: new Date(now - 10 * 86_400_000), seasonEndDate: new Date(now + 20 * 86_400_000), createdAt: NOW, updatedAt: NOW,
    items: [{ id: 'active-item', title: 'Complete summer maintenance', priority: 'RECOMMENDED', status: 'ADDED', snoozedUntil: null, recommendedDate: NOW, updatedAt: NOW }],
  };
  // Deliberately return the upcoming record first to prove selection is not
  // dependent on database ordering.
  db.seasonalChecklist.findMany = async () => [upcoming, active];

  const result = await getPromotedHomeActions('property-1', db);
  assert.ok(result.actions.find((action) => action.id === 'seasonal-checklist:seasonal-active'));
  assert.equal(result.actions.some((action) => action.id === 'seasonal-checklist:seasonal-upcoming'), false);
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
