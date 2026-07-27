const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

const {
  USGS_ADAPTER_VERSION,
  distanceMeters,
  parseUsgsGeoJson,
  usgsEarthquakeJob,
  usgsSourceRegistration,
} = require('../../src/jobs/usgsEarthquake.job');
const {
  usgsEarthquakeRadarAdapter,
  usgsMaterialityRadiusMeters,
} = require('../../src/radar/usgsEarthquakeRadarAdapter');

const NOW = new Date('2026-07-26T18:00:00.000Z');

function feature(overrides = {}) {
  const properties = {
    mag: 4.7,
    place: '8 km NE of Test City, New Jersey',
    time: NOW.getTime() - 10 * 60_000,
    updated: NOW.getTime() - 5 * 60_000,
    url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us-test-1',
    felt: 12,
    alert: null,
    status: 'reviewed',
    tsunami: 0,
    sig: 350,
    type: 'earthquake',
    ...(overrides.properties || {}),
  };
  return {
    type: 'Feature',
    id: overrides.id || 'us-test-1',
    properties,
    geometry: {
      type: 'Point',
      coordinates: overrides.coordinates || [-74.58, 40.35, 8.2],
    },
  };
}

function feed(features) {
  return {
    type: 'FeatureCollection',
    metadata: { generated: NOW.getTime(), count: features.length, status: 200 },
    features,
  };
}

test('USGS parser accepts real-time GeoJSON, ignores non-earthquakes, and rejects malformed records', () => {
  const parsed = parseUsgsGeoJson(feed([
    feature(),
    feature({ id: 'quarry-1', properties: { type: 'quarry blast' } }),
    { type: 'Feature', id: 'broken', properties: { type: 'earthquake' } },
  ]));

  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.ignored, 1);
  assert.equal(parsed.rejected, 1);
  assert.equal(parsed.generatedAt, NOW.toISOString());
  assert.equal(parsed.events[0].magnitude, 4.7);
  assert.equal(parsed.events[0].reviewStatus, 'reviewed');
  assert.equal(parseUsgsGeoJson({ features: [] }).valid, false);
});

test('USGS materiality combines magnitude with bounded distance bands', () => {
  assert.equal(usgsMaterialityRadiusMeters(2.4), null);
  assert.equal(usgsMaterialityRadiusMeters(2.5), 25_000);
  assert.equal(usgsMaterialityRadiusMeters(3.5), 75_000);
  assert.equal(usgsMaterialityRadiusMeters(4.5), 200_000);
  assert.equal(usgsMaterialityRadiusMeters(5.5), 500_000);
  assert.equal(usgsMaterialityRadiusMeters(6.5), 1_000_000);
  assert.ok(distanceMeters(
    { lat: 40.35, lon: -74.58 },
    { lat: 40.36, lon: -74.58 },
  ) > 1_000);
});

test('USGS adapter preserves provider identity, revisions, lifecycle, and non-alarmist copy', async () => {
  const event = parseUsgsGeoJson(feed([
    feature({ properties: { mag: 3.2, status: 'automatic' } }),
  ])).events[0];
  const observation = await usgsEarthquakeRadarAdapter.normalize(event, {
    sourceDefinitionId: 'source-1',
    observedAt: NOW.toISOString(),
  });

  assert.equal(observation.providerEventId, 'usgs:us-test-1');
  assert.equal(observation.providerRevision, event.updatedAt);
  assert.equal(observation.sourceFamily, 'disaster');
  assert.equal(observation.eventType, 'earthquake');
  assert.equal(observation.severity, 'info');
  assert.equal(observation.lifecycleStatus, 'active');
  assert.equal(observation.geography.radiusMeters, 25_000);
  assert.match(observation.summary, /awareness update, not a report of property damage/i);

  const deleted = await usgsEarthquakeRadarAdapter.normalize(
    { ...event, reviewStatus: 'deleted' },
    { sourceDefinitionId: 'source-1', observedAt: NOW.toISOString() },
  );
  assert.equal(deleted.lifecycleStatus, 'retracted');
  assert.equal(deleted.expiresAt, NOW.toISOString());

  assert.throws(
    () => usgsEarthquakeRadarAdapter.normalize(
      { ...event, magnitude: 2.4 },
      { sourceDefinitionId: 'source-1', observedAt: NOW.toISOString() },
    ),
    /below the reviewed materiality threshold/,
  );
});

function fakeDeps(fetchResult, propertyGeo = { lat: 40.35, lon: -74.58 }) {
  const calls = { register: [], begin: [], complete: [], enqueue: [], fetch: 0 };
  const deps = {
    registry: {
      async register(input) {
        calls.register.push(input);
        return { id: 'source-1', key: 'usgs-earthquakes' };
      },
    },
    runs: {
      async begin(input) {
        calls.begin.push(input);
        return { runnable: true, reason: 'source is runnable', run: { id: 'run-1' } };
      },
      async complete(runId, input) {
        calls.complete.push({ runId, input });
      },
    },
    ingestQueue: {
      async enqueue(input) {
        calls.enqueue.push(input);
      },
    },
    async *iterateAllProperties() {
      yield { id: 'property-1', zipCode: '08536' };
      yield { id: 'property-2', zipCode: '08536' };
    },
    async getPropertyGeo() {
      return propertyGeo;
    },
    async fetchFeed() {
      calls.fetch += 1;
      return fetchResult;
    },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    now: () => NOW,
    correlationId: () => 'correlation-1',
    env: { NODE_ENV: 'test', WORKER_JOB_USGS_EARTHQUAKES_ENABLED: 'true' },
  };
  return { calls, deps };
}

test('USGS job fetches once, filters by magnitude and property distance, and queues each event once', async () => {
  const parsed = parseUsgsGeoJson(feed([
    feature(),
    feature({ id: 'below', properties: { mag: 2.4 } }),
    feature({ id: 'distant', coordinates: [-118.24, 34.05, 10] }),
  ]));
  const { calls, deps } = fakeDeps({ status: 'ok', ...parsed });

  const result = await usgsEarthquakeJob(undefined, deps);

  assert.equal(result.sourceRunStatus, 'success');
  assert.equal(result.propertiesEvaluated, 2);
  assert.equal(result.providerEvents, 3);
  assert.equal(result.actionableEvents, 2);
  assert.equal(result.matchedEvents, 1);
  assert.equal(result.queued, 1);
  assert.equal(calls.fetch, 1);
  assert.equal(calls.enqueue.length, 1);
  assert.equal(calls.register[0].adapterVersion, USGS_ADAPTER_VERSION);
  assert.equal(calls.register[0].sourceType, 'seismic_provider');
  assert.equal(calls.complete[0].input.dataFreshThrough.toISOString(), NOW.toISOString());
});

test('USGS dry run makes no durable writes and provider failures do not mark data fresh', async () => {
  const parsed = parseUsgsGeoJson(feed([feature()]));
  const dry = fakeDeps({ status: 'ok', ...parsed });
  const dryResult = await usgsEarthquakeJob({ dryRun: true }, dry.deps);
  assert.equal(dryResult.sourceRunStatus, 'dry_run');
  assert.equal(dryResult.queued, 0);
  assert.equal(dry.calls.register.length, 0);
  assert.equal(dry.calls.complete.length, 0);
  assert.equal(dry.calls.enqueue.length, 0);

  const failed = fakeDeps({
    status: 'failed',
    events: [],
    rejected: 0,
    error: 'USGS HTTP 503',
  });
  const failedResult = await usgsEarthquakeJob(undefined, failed.deps);
  assert.equal(failedResult.sourceRunStatus, 'failed');
  assert.equal(failed.calls.complete[0].input.errorCode, 'USGS_FETCH_FAILED');
  assert.equal(failed.calls.complete[0].input.dataFreshThrough, undefined);
});

test('USGS registration is launch-closed through worker policy with reviewed US coverage', () => {
  const registration = usgsSourceRegistration({ NODE_ENV: 'production' });
  assert.deepEqual(registration.coverage, [{ coverageType: 'country', countryCode: 'US' }]);
  assert.equal(registration.sourceType, 'seismic_provider');
  assert.equal(registration.supportedEventTypes[0], 'earthquake');
  assert.equal(registration.configJson.minimumMagnitude, 2.5);
  assert.equal(registration.configJson.copyPolicy, 'observational-non-alarmist-v1');
});
