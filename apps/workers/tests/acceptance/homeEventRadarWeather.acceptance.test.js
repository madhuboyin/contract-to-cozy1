const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');
require('tsconfig-paths/register');

const {
  canonicalRadarObservationSchema,
} = require('../../../backend/src/modules/homeEventRadar/contracts');
const {
  canonicalLifecycleTransition,
} = require('../../../backend/src/modules/homeEventRadar/services/radarEventIngestion.service');
const {
  radarObservationFingerprint,
  radarRevisionIdentity,
} = require('../../../backend/src/modules/homeEventRadar/domain/radarObservationIdentity');
const {
  RadarIncidentPromotionService,
} = require('../../../backend/src/modules/homeEventRadar/services/radarIncidentPromotion.service');
const {
  evaluateRadarNotificationPolicy,
} = require('../../../backend/src/modules/homeEventRadar/domain/radarNotificationPolicy');
const {
  detectRadarMaterialUpdate,
} = require('../../../backend/src/modules/homeEventRadar/domain/radarMatchLifecycle');
const {
  freezeRadarAdapter,
} = require('../../src/radar/freezeRadarAdapter');
const {
  nwsRadarAdapter,
} = require('../../src/radar/nwsRadarAdapter');
const {
  NwsLifecycleConvergenceService,
} = require('../../src/radar/nwsLifecycleConvergence');
const {
  severeWeatherAlertsJob,
} = require('../../src/jobs/severeWeatherAlerts.job');

const NWS_SOURCE_ID = 'acceptance-nws-source';
const FREEZE_SOURCE_ID = 'acceptance-freeze-source';
const PROPERTY_ID = 'acceptance-property';

function nwsAlert(overrides = {}) {
  return {
    nwsAlertId: 'urn:oid:acceptance-storm',
    referencedAlertIds: [],
    hazardFamily: 'STORM',
    event: 'Severe Thunderstorm Watch',
    severity: 'Moderate',
    headline: 'Severe thunderstorms are possible.',
    description: 'Storms may produce damaging wind and hail.',
    instruction: 'Monitor official alerts.',
    sent: '2026-07-26T10:00:00Z',
    effective: '2026-07-26T10:00:00Z',
    onset: '2026-07-26T10:00:00Z',
    expires: '2026-07-26T18:00:00Z',
    ends: null,
    senderName: 'NWS Acceptance Office',
    status: 'Actual',
    messageType: 'Alert',
    urgency: 'Expected',
    certainty: 'Likely',
    canonicalUrl: 'https://api.weather.gov/alerts/urn:oid:acceptance-storm',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-74.70, 40.20],
        [-74.40, 40.20],
        [-74.40, 40.50],
        [-74.70, 40.50],
        [-74.70, 40.20],
      ]],
    },
    ...overrides,
  };
}

function freezeForecast(minimumFahrenheit, observedAt, overrides = {}) {
  return freezeRadarAdapter.normalize({
    propertyId: PROPERTY_ID,
    latitude: 40.33,
    longitude: -74.58,
    minimumFahrenheit,
    windowStart: observedAt,
    windowEnd: new Date(Date.parse(observedAt) + 36 * 60 * 60 * 1_000).toISOString(),
    sourceUrl: 'https://api.open-meteo.com/v1/forecast?latitude=40.33&longitude=-74.58',
    rawPayload: { minimumFahrenheit, fixture: true },
    ...overrides,
  }, {
    sourceDefinitionId: FREEZE_SOURCE_ID,
    observedAt,
  });
}

function normalizedWithoutRaw(observation) {
  const { rawPayload: _rawPayload, ...normalized } = observation;
  return normalized;
}

class WeatherAcceptanceHarness {
  constructor() {
    this.events = new Map();
    this.revisions = new Map();
    this.matches = new Map();
    this.incidents = new Map();
    this.journeys = new Map();
    this.notificationDecisions = { eligible: 0, suppressed: 0, deduped: 0 };
    this.lastEligibleNotificationDecision = new Map();
    this.latenciesMs = [];
    this.incidentService = new RadarIncidentPromotionService({
      getIncidentByRadarMatchId: async (matchId) => this.incidents.get(matchId) ?? null,
      upsertIncident: async (input, signals = []) => {
        const existing = this.incidents.get(input.propertyRadarMatchId);
        const incident = existing ?? {
          id: `incident-${this.incidents.size + 1}`,
          propertyRadarMatchId: input.propertyRadarMatchId,
          status: 'ACTIVE',
        };
        incident.status = 'ACTIVE';
        incident.severity = input.severity;
        incident.signals = [...(incident.signals ?? []), ...signals];
        this.incidents.set(input.propertyRadarMatchId, incident);
        if (!existing) {
          this.journeys.set(incident.id, {
            id: `journey-${this.journeys.size + 1}`,
            incidentId: incident.id,
          });
        }
        return incident;
      },
      setStatus: async (id, status) => {
        const incident = [...this.incidents.values()].find((item) => item.id === id);
        if (!incident) throw new Error(`Unknown acceptance incident ${id}`);
        incident.status = status;
        return incident;
      },
    });
  }

  eventKey(observation) {
    return `${observation.sourceDefinitionId}|${observation.providerEventId}`;
  }

  eventCandidate(sourceDefinitionId, providerEventId) {
    const event = this.events.get(`${sourceDefinitionId}|${providerEventId}`);
    if (!event) return null;
    const revisions = this.revisions.get(event.id) ?? [];
    const latest = revisions[revisions.length - 1];
    return {
      id: event.id,
      providerEventId: event.observation.providerEventId,
      endAt: event.observation.expiresAt
        ? new Date(event.observation.expiresAt)
        : null,
      observedAt: new Date(event.observation.observedAt),
      revisions: latest ? [{
        normalizedJson: normalizedWithoutRaw(latest.observation),
        rawPayloadJson: latest.observation.rawPayload,
      }] : [],
    };
  }

  counts() {
    return {
      canonicalEvents: this.events.size,
      revisions: [...this.revisions.values()].reduce((sum, rows) => sum + rows.length, 0),
      propertyMatches: this.matches.size,
      incidents: this.incidents.size,
      journeys: this.journeys.size,
      notificationsEligible: this.notificationDecisions.eligible,
      notificationsSuppressed: this.notificationDecisions.suppressed,
      notificationsDeduped: this.notificationDecisions.deduped,
    };
  }

  async ingest(rawObservation, fixture) {
    const started = performance.now();
    const observation = canonicalRadarObservationSchema.parse(rawObservation);
    const key = this.eventKey(observation);
    let event = this.events.get(key);
    const fingerprint = radarObservationFingerprint(observation);
    const revisionIdentity = radarRevisionIdentity(observation, fingerprint);
    const revisions = event ? this.revisions.get(event.id) : [];
    const previousObservation = revisions?.[revisions.length - 1]?.observation ?? null;
    const duplicate = revisions?.find((revision) =>
      revision.revisionIdentity === revisionIdentity
    );
    if (duplicate) {
      assert.equal(
        duplicate.fingerprint,
        fingerprint,
        `${fixture.name}: a provider revision changed evidence`,
      );
    } else {
      const lifecycleStatus = canonicalLifecycleTransition(
        event?.observation.lifecycleStatus ?? null,
        observation.lifecycleStatus,
      );
      const persistedObservation = { ...observation, lifecycleStatus };
      if (!event) {
        event = {
          id: `event-${this.events.size + 1}`,
          observation: persistedObservation,
        };
        this.events.set(key, event);
        this.revisions.set(event.id, []);
      } else {
        event.observation = persistedObservation;
      }
      this.revisions.get(event.id).push({
        revisionIdentity,
        fingerprint,
        observation: persistedObservation,
      });
    }

    let match = this.matches.get(event.id);
    const isInitialMatch = !match;
    if (!match) {
      match = {
        id: `match-${this.matches.size + 1}`,
        eventId: event.id,
      };
      this.matches.set(event.id, match);
    }

    const result = await this.incidentService.project({
      propertyId: PROPERTY_ID,
      event: {
        id: event.id,
        eventType: event.observation.eventType,
        title: event.observation.title,
        severity: event.observation.severity,
        status: event.observation.lifecycleStatus,
        dedupeKey: key,
        sourceDefinitionId: event.observation.sourceDefinitionId,
        sourceRunId: fixture.sourceRunId,
        providerEventId: event.observation.providerEventId,
        providerRevision: event.observation.providerRevision ?? null,
        canonicalUrl: event.observation.canonicalUrl ?? null,
        observedAt: new Date(event.observation.observedAt),
      },
      match: {
        id: match.id,
        impactLevel: fixture.impactLevel,
        impactSummary: fixture.impactSummary ?? fixture.name,
        matchScore: fixture.matchScore ?? (
          fixture.impactLevel === 'high' ? '0.9000' :
          fixture.impactLevel === 'moderate' ? '0.6500' : '0.3000'
        ),
        confidence: fixture.confidence ?? 'verified',
        confidenceScore: fixture.confidenceScore ?? '0.9500',
      },
      revision: {
        radarEventRevisionId: `${event.id}:${revisionIdentity}`,
        revisionIdentity,
        sourceRunId: fixture.sourceRunId,
        sourceDefinitionId: event.observation.sourceDefinitionId,
        correlationId: `acceptance:${fixture.name}`,
      },
    });

    if (duplicate) {
      this.notificationDecisions.deduped += 1;
    } else {
      const material = !isInitialMatch && previousObservation
        ? detectRadarMaterialUpdate(
            {
              id: 'previous',
              lifecycleStatus: previousObservation.lifecycleStatus,
              eventType: previousObservation.eventType,
              severity: previousObservation.severity,
              effectiveAt: previousObservation.effectiveAt,
              expiresAt: previousObservation.expiresAt,
              title: previousObservation.title,
              summary: previousObservation.summary,
              geography: previousObservation.geography,
            },
            {
              id: revisionIdentity,
              lifecycleStatus: observation.lifecycleStatus,
              eventType: observation.eventType,
              severity: observation.severity,
              effectiveAt: observation.effectiveAt,
              expiresAt: observation.expiresAt,
              title: observation.title,
              summary: observation.summary,
              geography: observation.geography,
            },
          ).isMaterialUpdate
        : false;
      const decision = evaluateRadarNotificationPolicy({
        preference: {
          propertyId: PROPERTY_ID,
          userId: 'acceptance-user',
          isEnabled: true,
          enabledCategories: ['weather', 'air_quality', 'disaster', 'utility', 'tax', 'insurance', 'other'],
          channels: ['in_app'],
          minimumSeverity: 'moderate',
          minimumImpact: 'moderate',
          deliveryMode: 'immediate',
          criticalSafetyOverrideEnabled: false,
          quietHours: null,
          timezone: 'UTC',
          persisted: false,
          updatedAt: null,
        },
        availableChannels: ['in_app'],
        event: {
          sourceFamily: observation.sourceFamily,
          severity: observation.severity,
          impact: fixture.impactLevel,
          confidence: fixture.confidence ?? 'verified',
          lifecycleStatus: observation.lifecycleStatus,
          effectiveAt: observation.effectiveAt,
          expiresAt: observation.expiresAt,
          providerUrgency: observation.providerUrgency ?? null,
          certainty: observation.certainty ?? null,
          isSynthetic: false,
        },
        isInitialMatch,
        isMaterialRevision: material,
        previousDecision: this.lastEligibleNotificationDecision.get(match.id) ?? null,
        evaluatedAt: new Date(observation.observedAt),
      });
      if (decision.outcome === 'suppressed') {
        this.notificationDecisions.suppressed += 1;
      } else {
        this.notificationDecisions.eligible += 1;
        this.lastEligibleNotificationDecision.set(match.id, {
          outcome: decision.outcome,
          severity: decision.normalized.severity,
          impact: decision.normalized.impact,
          timing: decision.normalized.timing,
        });
      }
    }
    this.latenciesMs.push(performance.now() - started);
    return { event, match, result, duplicate: Boolean(duplicate) };
  }
}

async function runEmptyNwsProviderFixture(outcome) {
  const calls = { enqueued: 0, completion: null };
  const result = await severeWeatherAlertsJob(undefined, {
    severeWeatherAlertService: {
      async getActiveAlerts(_lat, _lon, onOutcome) {
        onOutcome(outcome);
        return [];
      },
    },
    registry: {
      async register() {
        return { id: NWS_SOURCE_ID, key: 'nws-active-alerts' };
      },
    },
    runs: {
      async begin() {
        return {
          runnable: true,
          run: { id: `empty-${outcome}-run`, correlationId: `empty-${outcome}` },
        };
      },
      async complete(_runId, completion) {
        calls.completion = completion;
        return completion;
      },
    },
    ingestQueue: {
      async enqueue() {
        calls.enqueued += 1;
        throw new Error('An empty provider fixture must not enqueue');
      },
    },
    lifecycle: { async buildObservations() { return []; } },
    logger: {
      info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; },
    },
    iterateAllProperties: async function* () {
      yield {
        id: PROPERTY_ID,
        zipCode: '08536',
        latitude: 40.33,
        longitude: -74.58,
      };
    },
    getPropertyGeo: async () => ({
      lat: 40.33,
      lon: -74.58,
      name: '08536',
    }),
    now: () => new Date('2026-07-26T20:00:00Z'),
    correlationId: () => `empty-${outcome}`,
    env: {
      NODE_ENV: 'test',
      WORKER_EXTERNAL_INGEST_ENABLED: 'true',
    },
  });
  return { result, calls };
}

test('HER-206 weather fixtures preserve exact end-to-end lineage and notification decisions', async () => {
  const harness = new WeatherAcceptanceHarness();
  const nwsContext = (observedAt, lifecycleStatus) => ({
    sourceDefinitionId: NWS_SOURCE_ID,
    observedAt,
    queryPoint: { latitude: 40.33, longitude: -74.58 },
    ...(lifecycleStatus ? { lifecycleStatus } : {}),
  });

  const watch = nwsAlert();
  await harness.ingest(
    nwsRadarAdapter.normalize(watch, nwsContext('2026-07-26T10:01:00Z')),
    { name: 'watch', sourceRunId: 'nws-run-1', impactLevel: 'watch' },
  );

  const warning = nwsAlert({
    event: 'Severe Thunderstorm Warning',
    headline: 'Severe thunderstorm warning issued.',
    severity: 'Severe',
    messageType: 'Update',
    sent: '2026-07-26T11:00:00Z',
    urgency: 'Immediate',
    certainty: 'Observed',
  });
  await harness.ingest(
    nwsRadarAdapter.normalize(warning, nwsContext('2026-07-26T11:01:00Z')),
    { name: 'warning', sourceRunId: 'nws-run-2', impactLevel: 'moderate' },
  );

  const escalation = nwsAlert({
    event: 'Particularly Dangerous Severe Thunderstorm Warning',
    headline: 'Destructive winds are occurring.',
    severity: 'Extreme',
    messageType: 'Update',
    sent: '2026-07-26T12:00:00Z',
    urgency: 'Immediate',
    certainty: 'Observed',
  });
  await harness.ingest(
    nwsRadarAdapter.normalize(escalation, nwsContext('2026-07-26T12:01:00Z')),
    { name: 'alert escalation', sourceRunId: 'nws-run-3', impactLevel: 'high' },
  );

  const extended = nwsAlert({
    event: escalation.event,
    headline: escalation.headline,
    severity: escalation.severity,
    messageType: 'Update',
    sent: '2026-07-26T13:00:00Z',
    expires: '2026-07-26T22:00:00Z',
    urgency: escalation.urgency,
    certainty: escalation.certainty,
  });
  const extendedObservation = nwsRadarAdapter.normalize(
    extended,
    nwsContext('2026-07-26T13:01:00Z'),
  );
  await harness.ingest(
    extendedObservation,
    { name: 'extended expiration', sourceRunId: 'nws-run-4', impactLevel: 'high' },
  );
  const replay = await harness.ingest(
    { ...extendedObservation, observedAt: '2026-07-26T13:30:00Z' },
    { name: 'duplicate extended expiration', sourceRunId: 'nws-run-5', impactLevel: 'high' },
  );
  assert.equal(replay.duplicate, true);

  const superseding = nwsAlert({
    nwsAlertId: 'urn:oid:acceptance-destructive-warning',
    referencedAlertIds: [watch.nwsAlertId],
    event: 'Destructive Severe Thunderstorm Warning',
    headline: 'A destructive storm warning supersedes the prior alert.',
    severity: 'Extreme',
    messageType: 'Update',
    sent: '2026-07-26T14:00:00Z',
    expires: '2026-07-26T22:00:00Z',
    urgency: 'Immediate',
    certainty: 'Observed',
    canonicalUrl: 'https://api.weather.gov/alerts/urn:oid:acceptance-destructive-warning',
  });
  await harness.ingest(
    nwsRadarAdapter.normalize(superseding, nwsContext('2026-07-26T14:01:00Z')),
    { name: 'superseded alert', sourceRunId: 'nws-run-6', impactLevel: 'high' },
  );
  const lifecycle = new NwsLifecycleConvergenceService({
    radarEvent: {
      async findMany() {
        return [harness.eventCandidate(NWS_SOURCE_ID, watch.nwsAlertId)];
      },
    },
  });
  const closures = await lifecycle.buildObservations({
    sourceDefinitionId: NWS_SOURCE_ID,
    observedAt: new Date('2026-07-26T14:01:00Z'),
    currentAlerts: [superseding],
    allowStaleSafetyNet: true,
  });
  assert.equal(closures.length, 1);
  assert.equal(closures[0].reason, 'provider_clear');
  await harness.ingest(
    closures[0].observation,
    { name: 'supersession clear', sourceRunId: 'nws-run-6', impactLevel: 'high' },
  );

  const resolved = nwsRadarAdapter.normalize({
    ...superseding,
    referencedAlertIds: [],
    sent: '2026-07-26T15:00:00Z',
  }, nwsContext('2026-07-26T15:01:00Z', 'resolved'));
  await harness.ingest(
    resolved,
    { name: 'resolved alert', sourceRunId: 'nws-run-7', impactLevel: 'high' },
  );

  const beforeEmptyRuns = harness.counts();
  const failedEmpty = await runEmptyNwsProviderFixture('timeout');
  assert.equal(failedEmpty.result.sourceRunStatus, 'failed');
  assert.equal(failedEmpty.calls.enqueued, 0);
  assert.equal(failedEmpty.calls.completion.dataFreshThrough, undefined);
  assert.deepEqual(harness.counts(), beforeEmptyRuns);

  const successfulEmpty = await runEmptyNwsProviderFixture('ok');
  assert.equal(successfulEmpty.result.sourceRunStatus, 'successful_empty');
  assert.equal(successfulEmpty.calls.enqueued, 0);
  assert.ok(successfulEmpty.calls.completion.dataFreshThrough instanceof Date);
  assert.deepEqual(harness.counts(), beforeEmptyRuns);

  await harness.ingest(
    freezeForecast(18, '2026-07-27T00:00:00Z'),
    { name: 'freeze starts', sourceRunId: 'freeze-run-1', impactLevel: 'high' },
  );
  await harness.ingest(
    freezeForecast(12, '2026-07-27T06:00:00Z'),
    { name: 'freeze continues', sourceRunId: 'freeze-run-2', impactLevel: 'high' },
  );
  await harness.ingest(
    freezeForecast(35, '2026-07-27T12:00:00Z'),
    { name: 'freeze ends', sourceRunId: 'freeze-run-3', impactLevel: 'high' },
  );

  assert.deepEqual(harness.counts(), {
    canonicalEvents: 3,
    revisions: 10,
    propertyMatches: 3,
    incidents: 3,
    journeys: 3,
    notificationsEligible: 5,
    notificationsSuppressed: 5,
    notificationsDeduped: 1,
  });
  assert.equal(new Set([...harness.incidents.values()].map((item) => item.id)).size, 3);
  assert.equal(new Set([...harness.journeys.values()].map((item) => item.incidentId)).size, 3);
  assert.equal(
    [...harness.incidents.values()].filter((item) =>
      item.status === 'RESOLVED' || item.status === 'EXPIRED'
    ).length,
    3,
  );

  const sortedLatency = [...harness.latenciesMs].sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(sortedLatency.length * 0.95) - 1);
  assert.ok(
    sortedLatency[p95Index] < 5_000,
    `Representative in-process fixture p95 was ${sortedLatency[p95Index]}ms`,
  );
});

test('HER-206 phase gate keeps provider jobs projection-free', () => {
  for (const relativePath of [
    '../../src/jobs/severeWeatherAlerts.job.ts',
    '../../src/jobs/freezeRiskIncidents.job.ts',
  ]) {
    const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
    assert.doesNotMatch(source, /IncidentService|upsertIncident|guidanceJourneyService|ingestSignal/);
    assert.match(source, /ingestQueue\.enqueue/);
  }
});
