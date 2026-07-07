const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Stub the SSRF guard so this test doesn't depend on live DNS resolution —
// the guard itself has no dedicated test coverage here, this just isolates
// severeWeatherAlertService's own mapping/normalization logic.
const ssrfGuard = require('../../src/utils/ssrfGuard.ts');
const originalAssertSafeUrl = ssrfGuard.assertSafeUrl;
ssrfGuard.assertSafeUrl = async () => {};

const { severeWeatherAlertService } = require('../../src/services/severeWeatherAlert.service.ts');

function mockFetch(responseBody, status = 200) {
  global.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => responseBody,
    text: async () => JSON.stringify(responseBody),
  });
}

function alertFeature(overrides = {}) {
  return {
    id: 'https://api.weather.gov/alerts/urn:oid:test-alert-1',
    properties: {
      id: 'urn:oid:test-alert-1',
      event: 'Flash Flood Warning',
      severity: 'Severe',
      headline: 'Flash Flood Warning issued for the area.',
      description: 'Heavy rain has caused flooding.',
      instruction: 'Move to higher ground.',
      effective: '2026-07-06T12:00:00-04:00',
      expires: '2026-07-06T15:00:00-04:00',
      senderName: 'NWS Test Office',
      ...overrides,
    },
  };
}

test.after(() => {
  ssrfGuard.assertSafeUrl = originalAssertSafeUrl;
  delete global.fetch;
});

test('maps an in-scope NWS event to the correct hazard family', async () => {
  mockFetch({ features: [alertFeature()] });
  const alerts = await severeWeatherAlertService.getActiveAlerts(40.0, -75.0);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].hazardFamily, 'FLOOD');
  assert.equal(alerts[0].nwsAlertId, 'urn:oid:test-alert-1');
  assert.equal(alerts[0].event, 'Flash Flood Warning');
});

test('maps Watch-tier events to the same hazard family as their Warning counterpart', async () => {
  mockFetch({
    features: [
      alertFeature({ id: 'urn:oid:watch-1', event: 'Flood Watch' }),
      alertFeature({ id: 'urn:oid:watch-2', event: 'Severe Thunderstorm Watch' }),
      alertFeature({ id: 'urn:oid:watch-3', event: 'Winter Storm Watch' }),
    ],
  });
  const alerts = await severeWeatherAlertService.getActiveAlerts(40.0, -75.0);
  assert.equal(alerts.length, 3);
  assert.equal(alerts.find(a => a.event === 'Flood Watch').hazardFamily, 'FLOOD');
  assert.equal(alerts.find(a => a.event === 'Severe Thunderstorm Watch').hazardFamily, 'STORM');
  assert.equal(alerts.find(a => a.event === 'Winter Storm Watch').hazardFamily, 'SNOW');
});

test('maps hurricane/tropical/storm-surge events to the HURRICANE hazard family', async () => {
  mockFetch({
    features: [
      alertFeature({ id: 'urn:oid:h1', event: 'Hurricane Warning' }),
      alertFeature({ id: 'urn:oid:h2', event: 'Tropical Storm Watch' }),
      alertFeature({ id: 'urn:oid:h3', event: 'Storm Surge Warning' }),
    ],
  });
  const alerts = await severeWeatherAlertService.getActiveAlerts(40.0, -75.0);
  assert.equal(alerts.length, 3);
  for (const alert of alerts) {
    assert.equal(alert.hazardFamily, 'HURRICANE');
  }
});

test('maps fire-weather events to the WILDFIRE hazard family', async () => {
  mockFetch({
    features: [
      alertFeature({ id: 'urn:oid:f1', event: 'Red Flag Warning' }),
      alertFeature({ id: 'urn:oid:f2', event: 'Fire Weather Watch' }),
    ],
  });
  const alerts = await severeWeatherAlertService.getActiveAlerts(40.0, -75.0);
  assert.equal(alerts.length, 2);
  for (const alert of alerts) {
    assert.equal(alert.hazardFamily, 'WILDFIRE');
  }
});

test('ignores NWS event types outside the tracked hazard list', async () => {
  mockFetch({
    features: [alertFeature({ id: 'urn:oid:test-alert-2', event: 'Air Quality Alert' })],
  });
  const alerts = await severeWeatherAlertService.getActiveAlerts(40.0, -75.0);
  assert.equal(alerts.length, 0);
});

test('captures referencedAlertIds from properties.references', async () => {
  mockFetch({
    features: [
      alertFeature({
        references: [
          { identifier: 'urn:oid:prior-watch-1' },
          { identifier: 'urn:oid:prior-watch-2' },
        ],
      }),
    ],
  });
  const alerts = await severeWeatherAlertService.getActiveAlerts(40.0, -75.0);
  assert.deepEqual(alerts[0].referencedAlertIds, ['urn:oid:prior-watch-1', 'urn:oid:prior-watch-2']);
});

test('defaults referencedAlertIds to an empty array when references is absent', async () => {
  mockFetch({ features: [alertFeature()] });
  const alerts = await severeWeatherAlertService.getActiveAlerts(40.0, -75.0);
  assert.deepEqual(alerts[0].referencedAlertIds, []);
});

test('normalizes an unrecognized severity string to Unknown', async () => {
  mockFetch({ features: [alertFeature({ severity: 'SomethingNewFromNws' })] });
  const alerts = await severeWeatherAlertService.getActiveAlerts(40.0, -75.0);
  assert.equal(alerts[0].severity, 'Unknown');
});

test('returns [] (never throws) when the NWS API responds with a non-2xx status', async () => {
  mockFetch({ detail: 'boom' }, 500);
  const alerts = await severeWeatherAlertService.getActiveAlerts(40.0, -75.0);
  assert.deepEqual(alerts, []);
});

test('returns [] (never throws) when fetch itself rejects', async () => {
  global.fetch = async () => {
    throw new Error('network down');
  };
  const alerts = await severeWeatherAlertService.getActiveAlerts(40.0, -75.0);
  assert.deepEqual(alerts, []);
});

test('onOutcome fires "ok" on a successful fetch', async () => {
  mockFetch({ features: [alertFeature()] });
  let outcome;
  await severeWeatherAlertService.getActiveAlerts(40.0, -75.0, (o) => { outcome = o; });
  assert.equal(outcome, 'ok');
});

test('onOutcome fires "http_error" on a non-2xx response', async () => {
  mockFetch({ detail: 'boom' }, 500);
  let outcome;
  await severeWeatherAlertService.getActiveAlerts(40.0, -75.0, (o) => { outcome = o; });
  assert.equal(outcome, 'http_error');
});

test('onOutcome fires "error" when fetch itself rejects', async () => {
  global.fetch = async () => {
    throw new Error('network down');
  };
  let outcome;
  await severeWeatherAlertService.getActiveAlerts(40.0, -75.0, (o) => { outcome = o; });
  assert.equal(outcome, 'error');
});

test('returns [] for invalid lat/lon without calling fetch', async () => {
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({ features: [] }) };
  };
  const alerts = await severeWeatherAlertService.getActiveAlerts(NaN, -75.0);
  assert.deepEqual(alerts, []);
  assert.equal(fetchCalled, false);
});
