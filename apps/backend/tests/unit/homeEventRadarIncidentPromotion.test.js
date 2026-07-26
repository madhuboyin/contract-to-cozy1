const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

const {
  RadarIncidentPromotionService,
  radarIncidentConfidence,
  radarIncidentSignals,
  radarIncidentSeverity,
} = require('../../src/modules/homeEventRadar/services/radarIncidentPromotion.service');

function input(overrides = {}) {
  return {
    propertyId: 'property-1',
    event: {
      id: 'event-1',
      eventType: 'freeze',
      eventSubType: null,
      title: 'Freeze warning',
      severity: 'high',
      status: 'active',
      dedupeKey: 'source:weather:provider:event-1',
      sourceDefinitionId: 'source-1',
      sourceRunId: 'run-1',
      providerEventId: 'provider-event-1',
      providerRevision: 'provider-revision-1',
      canonicalUrl: 'https://api.weather.gov/alerts/provider-event-1',
      observedAt: new Date('2026-07-26T15:00:00Z'),
    },
    match: {
      id: 'match-1',
      impactLevel: 'high',
      impactSummary: 'Protect exposed plumbing.',
      matchScore: '0.9100',
      confidence: 'verified',
      confidenceScore: '0.9800',
      matcherVersion: 'rules-v1',
      propertyGeographyVersion: 3,
      matchExplanationJson: { reasons: ['exact property scope'] },
      impactFactorsJson: { drivers: [{ code: 'NO_SECONDARY_HEAT' }] },
    },
    revision: {
      radarEventRevisionId: 'revision-1',
      revisionIdentity: 'provider:provider-revision-1',
      sourceRunId: 'run-1',
      sourceDefinitionId: 'source-1',
      correlationId: 'correlation-1',
    },
    ...overrides,
  };
}

function harness(existing = null) {
  const calls = { lookup: [], upsert: [], setStatus: [] };
  const port = {
    async getIncidentByRadarMatchId(matchId) {
      calls.lookup.push(matchId);
      return existing;
    },
    async upsertIncident(value, signals) {
      calls.upsert.push({ value, signals });
      return { id: existing?.id ?? 'incident-1' };
    },
    async setStatus(id, status) {
      calls.setStatus.push({ id, status });
      return { id };
    },
  };
  return { service: new RadarIncidentPromotionService(port), calls };
}

test('creates one match-linked Incident with complete revision/source provenance', async () => {
  const { service, calls } = harness();
  const result = await service.project(input());

  assert.deepEqual(result, { outcome: 'created', incidentId: 'incident-1' });
  assert.deepEqual(calls.lookup, ['match-1']);
  assert.equal(calls.upsert.length, 1);
  const incident = calls.upsert[0].value;
  assert.equal(incident.propertyRadarMatchId, 'match-1');
  assert.equal(incident.sourceType, 'RADAR_EVENT');
  assert.equal(incident.typeKey, 'RADAR_FREEZE');
  assert.equal(incident.severity, 'CRITICAL');
  assert.equal(incident.confidence, 98);
  assert.equal(incident.fingerprint, 'property:property-1|RADAR_MATCH:match-1');
  assert.equal(incident.details.radarEventId, 'event-1');
  assert.equal(incident.details.radarEventRevisionId, 'revision-1');
  assert.equal(incident.details.sourceDefinitionId, 'source-1');
  assert.equal(incident.details.sourceRunId, 'run-1');
  assert.equal(incident.details.providerEventId, 'provider-event-1');
  assert.equal(incident.details.providerRevision, 'provider-revision-1');
  assert.equal(incident.details.matcherVersion, 'rules-v1');
  assert.equal(calls.upsert[0].signals.length, 1);
  assert.equal(calls.upsert[0].signals[0].signalType, 'WEATHER_FORECAST_MIN_TEMP');
  assert.equal(calls.upsert[0].signals[0].externalRef, 'provider:provider-revision-1');
});

test('updates the same open match linkage without creating a second identity', async () => {
  const { service, calls } = harness({ id: 'incident-existing', status: 'ACTIVE' });
  const result = await service.project(input());

  assert.deepEqual(result, { outcome: 'updated', incidentId: 'incident-existing' });
  assert.equal(calls.upsert.length, 1);
  assert.equal(calls.upsert[0].value.propertyRadarMatchId, 'match-1');
  assert.equal(calls.setStatus.length, 0);
});

test('terminal Radar lifecycle resolves or expires only through IncidentService.setStatus', async () => {
  for (const [eventStatus, incidentStatus, expectedOutcome] of [
    ['resolved', 'RESOLVED', 'resolved'],
    ['retracted', 'RESOLVED', 'resolved'],
    ['expired', 'EXPIRED', 'expired'],
  ]) {
    const { service, calls } = harness({ id: 'incident-existing', status: 'ACTIVE' });
    const result = await service.project(input({
      event: { ...input().event, status: eventStatus },
    }));
    assert.deepEqual(result, {
      outcome: expectedOutcome,
      incidentId: 'incident-existing',
    });
    assert.deepEqual(calls.setStatus, [{
      id: 'incident-existing',
      status: incidentStatus,
    }]);
    assert.equal(calls.upsert.length, 0);
  }
});

test('impact downgrade resolves an existing Incident and does not create a low-impact one', async () => {
  const existingHarness = harness({ id: 'incident-existing', status: 'ACTIVE' });
  const resolved = await existingHarness.service.project(input({
    match: { ...input().match, impactLevel: 'watch' },
  }));
  assert.deepEqual(resolved, { outcome: 'resolved', incidentId: 'incident-existing' });
  assert.deepEqual(existingHarness.calls.setStatus, [{
    id: 'incident-existing',
    status: 'RESOLVED',
  }]);

  const emptyHarness = harness();
  const ignored = await emptyHarness.service.project(input({
    match: { ...input().match, impactLevel: 'none' },
  }));
  assert.deepEqual(ignored, { outcome: 'not_promotable', incidentId: null });
  assert.equal(emptyHarness.calls.upsert.length, 0);
});

test('match no longer applicable resolves its linked Incident without changing the event', async () => {
  const existingHarness = harness({ id: 'incident-existing', status: 'ACTIVE' });
  const resolved = await existingHarness.service.project(input({
    match: {
      ...input().match,
      lifecycleStatus: 'no_longer_applicable',
    },
  }));
  assert.deepEqual(resolved, {
    outcome: 'resolved',
    incidentId: 'incident-existing',
  });
  assert.deepEqual(existingHarness.calls.setStatus, [{
    id: 'incident-existing',
    status: 'RESOLVED',
  }]);
  assert.equal(existingHarness.calls.upsert.length, 0);

  const emptyHarness = harness();
  const ignored = await emptyHarness.service.project(input({
    match: {
      ...input().match,
      lifecycleStatus: 'no_longer_applicable',
    },
  }));
  assert.deepEqual(ignored, {
    outcome: 'not_promotable',
    incidentId: null,
  });
});

test('explicit low confidence remains awareness-only and resolves a prior projection', async () => {
  const lowConfidenceInput = input({
    match: {
      ...input().match,
      confidence: 'low',
      confidenceScore: '0.3500',
    },
  });
  const emptyHarness = harness();
  const ignored = await emptyHarness.service.project(lowConfidenceInput);
  assert.deepEqual(ignored, { outcome: 'not_promotable', incidentId: null });
  assert.equal(emptyHarness.calls.upsert.length, 0);

  const existingHarness = harness({ id: 'incident-existing', status: 'ACTIVE' });
  const resolved = await existingHarness.service.project(lowConfidenceInput);
  assert.deepEqual(resolved, { outcome: 'resolved', incidentId: 'incident-existing' });
  assert.deepEqual(existingHarness.calls.setStatus, [{
    id: 'incident-existing',
    status: 'RESOLVED',
  }]);
});

test('HER-302 promotion boundary requires medium confidence', async () => {
  const belowBoundary = harness();
  const ignored = await belowBoundary.service.project(input({
    match: {
      ...input().match,
      confidence: 'low',
      confidenceScore: '0.5999',
    },
  }));
  assert.deepEqual(ignored, { outcome: 'not_promotable', incidentId: null });
  assert.equal(belowBoundary.calls.upsert.length, 0);

  const atBoundary = harness();
  const promoted = await atBoundary.service.project(input({
    match: {
      ...input().match,
      confidence: 'medium',
      confidenceScore: '0.6000',
    },
  }));
  assert.deepEqual(promoted, { outcome: 'created', incidentId: 'incident-1' });
  assert.equal(atBoundary.calls.upsert.length, 1);
});

test('closed Incidents are never reopened by a delayed active revision', async () => {
  const { service, calls } = harness({ id: 'incident-existing', status: 'RESOLVED' });
  const result = await service.project(input());
  assert.deepEqual(result, {
    outcome: 'terminal_incident_unchanged',
    incidentId: 'incident-existing',
  });
  assert.equal(calls.upsert.length, 0);
  assert.equal(calls.setStatus.length, 0);
});

test('projection failures propagate so the durable property scope can retry', async () => {
  const service = new RadarIncidentPromotionService({
    async getIncidentByRadarMatchId() {
      return null;
    },
    async upsertIncident() {
      throw new Error('incident database unavailable');
    },
    async setStatus() {
      throw new Error('unexpected setStatus call');
    },
  });

  await assert.rejects(
    () => service.project(input()),
    /incident database unavailable/,
  );
});

test('impact and explicit confidence map conservatively without inventing unknown confidence', () => {
  assert.equal(radarIncidentSeverity('high', 'verified'), 'CRITICAL');
  assert.equal(radarIncidentSeverity('high', 'low'), 'WARNING');
  assert.equal(radarIncidentSeverity('moderate', null), 'WARNING');
  assert.equal(radarIncidentConfidence('verified', null), 100);
  assert.equal(radarIncidentConfidence('low', null), 35);
  assert.equal(radarIncidentConfidence(null, null), null);
  assert.equal(radarIncidentConfidence(null, '0.7340'), 73.4);
});

test('weather promotion carries authoritative revision evidence while non-weather does not', () => {
  const weatherSignals = radarIncidentSignals(input(), 98);
  assert.equal(weatherSignals.length, 1);
  assert.equal(weatherSignals[0].signalType, 'WEATHER_FORECAST_MIN_TEMP');
  assert.equal(weatherSignals[0].confidence, 98);
  assert.equal(weatherSignals[0].payload.radarEventId, 'event-1');
  assert.equal(weatherSignals[0].payload.radarEventRevisionId, 'revision-1');

  assert.deepEqual(radarIncidentSignals(input({
    event: { ...input().event, eventType: 'tax_reassessment' },
  }), 90), []);
  assert.deepEqual(radarIncidentSignals(input({
    event: {
      ...input().event,
      eventType: 'weather',
      providerEventId: 'unreviewed-provider-event',
      canonicalUrl: 'https://weather.example.test/event',
    },
  }), 90), []);
});

test('matcher delegates to the dedicated bridge and Guidance remains Incident-owned', () => {
  const matcher = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/homeEventRadarMatcher.service.ts'),
    'utf8',
  );
  const bridge = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../src/modules/homeEventRadar/services/radarIncidentPromotion.service.ts',
    ),
    'utf8',
  );
  const incidentService = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/incidents/incident.service.ts'),
    'utf8',
  );

  assert.match(matcher, /radarIncidentPromotionService\.project/);
  assert.doesNotMatch(matcher, /IncidentService|guidanceJourneyService|ingestSignal/);
  assert.doesNotMatch(bridge, /guidanceJourneyService|ingestSignal/);
  assert.match(incidentService, /propertyRadarMatchId: input\.propertyRadarMatchId \?\? null/);
  assert.match(incidentService, /dedupeKey: `incident:\$\{incident\.id\}`/);
  assert.match(incidentService, /RADAR_WEATHER_EVENT_INTENT/);
});
