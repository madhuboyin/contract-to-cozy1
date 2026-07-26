const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { severeWeatherAlertsJob } = require('../../src/jobs/severeWeatherAlerts.job.ts');

const noopLogger = {
  info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; },
};

function alert() {
  return {
    nwsAlertId: 'urn:oid:dry-run-alert',
    referencedAlertIds: [],
    hazardFamily: 'FLOOD',
    event: 'Flash Flood Warning',
    severity: 'Severe',
    headline: 'Flash Flood Warning issued.',
    description: 'Flooding is occurring.',
    instruction: 'Move to higher ground.',
    sent: '2026-07-26T13:55:00Z',
    effective: '2026-07-26T14:00:00Z',
    onset: '2026-07-26T14:00:00Z',
    expires: '2026-07-26T16:00:00Z',
    ends: null,
    senderName: 'NWS',
    status: 'Actual',
    messageType: 'Alert',
    urgency: 'Immediate',
    certainty: 'Observed',
    canonicalUrl: 'https://api.weather.gov/alerts/urn:oid:dry-run-alert',
    geometry: null,
  };
}

function deps(properties) {
  let registrations = 0;
  let begins = 0;
  let completions = 0;
  let ingestions = 0;
  return {
    port: {
      severeWeatherAlertService: {
        async getActiveAlerts(lat, lon, onOutcome) {
          onOutcome?.('ok');
          return [alert()];
        },
      },
      registry: {
        async register() {
          registrations += 1;
          return { id: 'source', key: 'nws-active-alerts' };
        },
      },
      runs: {
        async begin() {
          begins += 1;
          return { runnable: true, run: { id: 'run' } };
        },
        async complete() {
          completions += 1;
        },
      },
      ingestion: {
        async ingest() {
          ingestions += 1;
        },
      },
      logger: noopLogger,
      iterateAllProperties: async function* () {
        for (const property of properties) yield property;
      },
      getPropertyGeo: async (property) => ({
        lat: property.latitude,
        lon: property.longitude,
      }),
      now: () => new Date('2026-07-26T14:05:00Z'),
      correlationId: () => 'dry-correlation',
      env: { NODE_ENV: 'test' },
    },
    counts: () => ({ registrations, begins, completions, ingestions }),
  };
}

test('dry run fetches and validates canonical alerts without database or queue writes', async () => {
  const harness = deps([{
    id: 'property-1',
    zipCode: '08536',
    latitude: 40.33,
    longitude: -74.58,
  }]);

  const result = await severeWeatherAlertsJob({ dryRun: true }, harness.port);

  assert.equal(result.createdOrUpdated, 1);
  assert.equal(result.sourceRunStatus, 'dry_run');
  assert.deepEqual(harness.counts(), {
    registrations: 0,
    begins: 0,
    completions: 0,
    ingestions: 0,
  });
});

test('scoped execution processes only the requested allowlisted property', async () => {
  const original = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'property-allowed';
  try {
    const harness = deps([
      { id: 'property-allowed', zipCode: '08536', latitude: 40.33, longitude: -74.58 },
      { id: 'property-other', zipCode: '10019', latitude: 40.76, longitude: -73.98 },
    ]);
    const result = await severeWeatherAlertsJob(
      { dryRun: true, propertyId: 'property-allowed' },
      harness.port,
    );
    assert.equal(result.uniqueAlerts, 1);
    assert.match(result.smokeCorrelationId, /^smoke:severe-weather-alerts:/);
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = original;
  }
});

test('non-allowlisted scoped execution is rejected before fetching', async () => {
  const original = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'property-allowed';
  try {
    const harness = deps([]);
    await assert.rejects(
      () => severeWeatherAlertsJob(
        { dryRun: true, propertyId: 'property-denied' },
        harness.port,
      ),
      /not in SMOKE_TEST_PROPERTY_ALLOWLIST/,
    );
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = original;
  }
});
