const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  NwsLifecycleConvergenceService,
} = require('../../src/radar/nwsLifecycleConvergence');

function normalized(overrides = {}) {
  return {
    schemaVersion: 1,
    sourceDefinitionId: 'nws-source-1',
    providerEventId: 'urn:oid:prior-alert',
    providerRevision: '2026-07-24T12:00:00.000Z',
    sourceFamily: 'weather',
    eventType: 'weather',
    title: 'Prior severe weather alert',
    summary: 'Prior alert summary.',
    severity: 'severe',
    lifecycleStatus: 'active',
    effectiveAt: '2026-07-24T12:00:00.000Z',
    expiresAt: '2026-07-26T13:00:00.000Z',
    observedAt: '2026-07-24T12:00:00.000Z',
    geography: {
      type: 'postal_code',
      countryCode: 'US',
      postalCode: '08536',
    },
    canonicalUrl: 'https://api.weather.gov/alerts/urn:oid:prior-alert',
    deduplicationKeys: ['nws:urn:oid:prior-alert'],
    ...overrides,
  };
}

function candidate(overrides = {}) {
  const evidence = normalized(overrides.normalized);
  return {
    id: 'radar-event-1',
    providerEventId: evidence.providerEventId,
    endAt: evidence.expiresAt ? new Date(evidence.expiresAt) : null,
    observedAt: new Date(evidence.observedAt),
    revisions: [{
      normalizedJson: evidence,
      rawPayloadJson: { nwsAlertId: evidence.providerEventId, original: true },
    }],
    ...overrides,
  };
}

function alert(overrides = {}) {
  return {
    nwsAlertId: 'urn:oid:new-alert',
    referencedAlertIds: ['urn:oid:prior-alert'],
    messageType: 'Update',
    ...overrides,
  };
}

function harness(candidates) {
  const calls = [];
  const db = {
    radarEvent: {
      async findMany(input) {
        calls.push(input);
        return candidates;
      },
    },
  };
  return {
    calls,
    service: new NwsLifecycleConvergenceService(db),
  };
}

const observedAt = new Date('2026-07-26T14:05:00.000Z');

test('NWS update explicitly resolves the referenced provider event with immutable evidence', async () => {
  const { service } = harness([candidate()]);
  const results = await service.buildObservations({
    sourceDefinitionId: 'nws-source-1',
    observedAt,
    currentAlerts: [alert()],
    allowStaleSafetyNet: false,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].reason, 'provider_clear');
  assert.equal(results[0].observation.lifecycleStatus, 'resolved');
  assert.equal(results[0].observation.providerEventId, 'urn:oid:prior-alert');
  assert.equal(
    results[0].observation.rawPayload.lifecycleEvidence.supersedingProviderEventId,
    'urn:oid:new-alert',
  );
  assert.deepEqual(results[0].observation.rawPayload.priorProviderPayload, {
    nwsAlertId: 'urn:oid:prior-alert',
    original: true,
  });
});

test('NWS cancellation retracts its referenced provider event', async () => {
  const { service } = harness([candidate()]);
  const [result] = await service.buildObservations({
    sourceDefinitionId: 'nws-source-1',
    observedAt,
    currentAlerts: [alert({ messageType: 'Cancel' })],
    allowStaleSafetyNet: false,
  });

  assert.equal(result.reason, 'provider_retraction');
  assert.equal(result.observation.lifecycleStatus, 'retracted');
});

test('authoritative provider end time expires an event without inferring from absence', async () => {
  const { service } = harness([candidate()]);
  const [result] = await service.buildObservations({
    sourceDefinitionId: 'nws-source-1',
    observedAt,
    currentAlerts: [],
    allowStaleSafetyNet: false,
  });

  assert.equal(result.reason, 'provider_expiration');
  assert.equal(result.observation.lifecycleStatus, 'expired');
});

test('stale no-end event expires only when the safety net is explicitly allowed', async () => {
  const stale = candidate({
    endAt: null,
    normalized: {
      expiresAt: null,
      observedAt: '2026-07-23T12:00:00.000Z',
    },
    observedAt: new Date('2026-07-23T12:00:00.000Z'),
  });
  const blocked = harness([stale]);
  assert.deepEqual(await blocked.service.buildObservations({
    sourceDefinitionId: 'nws-source-1',
    observedAt,
    currentAlerts: [],
    allowStaleSafetyNet: false,
  }), []);

  const allowed = harness([stale]);
  const [result] = await allowed.service.buildObservations({
    sourceDefinitionId: 'nws-source-1',
    observedAt,
    currentAlerts: [],
    allowStaleSafetyNet: true,
    staleAfterHours: 48,
  });
  assert.equal(result.reason, 'stale_safety_net');
  assert.equal(result.observation.lifecycleStatus, 'expired');
});

test('lifecycle revision identity is deterministic across replays', async () => {
  const first = harness([candidate()]);
  const second = harness([candidate()]);
  const input = {
    sourceDefinitionId: 'nws-source-1',
    observedAt,
    currentAlerts: [alert()],
    allowStaleSafetyNet: false,
  };
  const [a] = await first.service.buildObservations(input);
  const [b] = await second.service.buildObservations(input);
  assert.equal(a.observation.providerRevision, b.observation.providerRevision);
});
