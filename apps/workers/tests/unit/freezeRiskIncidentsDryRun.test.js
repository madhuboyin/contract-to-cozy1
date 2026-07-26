const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

const { freezeRiskIncidentsJob } = require('../../src/jobs/freezeRiskIncidents.job.ts');

const noopLogger = {
  info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; },
};

function property(id) {
  return {
    id,
    zipCode: '08536',
    latitude: 40.33,
    longitude: -74.58,
  };
}

function fakeDeps({
  properties = [property('property-1')],
  minimumFahrenheit = 20,
  existingEvent = null,
} = {}) {
  const writes = { register: 0, begin: 0, complete: 0, ingest: 0 };
  const reads = [];
  return {
    writes,
    reads,
    deps: {
      registry: { async register() { writes.register += 1; } },
      runs: {
        async begin() { writes.begin += 1; },
        async complete() { writes.complete += 1; },
      },
      ingestion: { async ingest() { writes.ingest += 1; } },
      eventLookup: {
        async findUnique() { throw new Error('dry run must not use source ID lookup'); },
        async findFirst(query) {
          reads.push(query);
          return existingEvent;
        },
      },
      logger: noopLogger,
      iterateAllProperties: async function* () {
        for (const item of properties) yield item;
      },
      async getPropertyGeo(item) {
        return { lat: item.latitude, lon: item.longitude };
      },
      async getForecast(lat, lon, now) {
        return {
          status: 'ok',
          forecast: {
            latitude: lat,
            longitude: lon,
            minimumFahrenheit,
            windowStart: now.toISOString(),
            windowEnd: new Date(now.getTime() + 36 * 3_600_000).toISOString(),
            sourceUrl: 'https://api.open-meteo.com/v1/forecast',
            rawPayload: { samples: [] },
          },
        };
      },
      now: () => new Date('2026-07-26T14:05:00Z'),
      correlationId: () => 'unused',
      sleep: async () => {},
      env: { NODE_ENV: 'test' },
    },
  };
}

test('dry run counts a freeze event without source, run, ingestion, or projection writes', async () => {
  const { deps, writes } = fakeDeps();

  const result = await freezeRiskIncidentsJob({ dryRun: true }, deps);

  assert.equal(result.createdOrUpdated, 1);
  assert.equal(result.resolved, 0);
  assert.equal(result.sourceRunStatus, 'dry_run');
  assert.deepEqual(writes, { register: 0, begin: 0, complete: 0, ingest: 0 });
});

test('dry run finds the real source event before counting a warm resolution', async () => {
  const { deps, writes, reads } = fakeDeps({
    minimumFahrenheit: 35,
    existingEvent: { id: 'event-1', status: 'active' },
  });

  const result = await freezeRiskIncidentsJob({ dryRun: true }, deps);

  assert.equal(result.createdOrUpdated, 0);
  assert.equal(result.resolved, 1);
  assert.equal(reads[0].where.sourceDefinition.key, 'open-meteo-freeze-forecast');
  assert.equal(
    reads[0].where.providerEventId,
    'open-meteo:freeze-risk:property-1',
  );
  assert.deepEqual(writes, { register: 0, begin: 0, complete: 0, ingest: 0 });
});

test('a scoped dry run processes only the allowlisted property', async () => {
  const originalAllowlist = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'property-allowed';
  try {
    const { deps } = fakeDeps({
      properties: [property('property-allowed'), property('property-other')],
    });

    const result = await freezeRiskIncidentsJob(
      { dryRun: true, propertyId: 'property-allowed' },
      deps,
    );

    assert.equal(result.createdOrUpdated, 1);
    assert.match(result.smokeCorrelationId, /^smoke:freeze-risk-incidents:/);
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalAllowlist;
  }
});

test('a property outside the smoke allowlist is rejected before reads or writes', async () => {
  const originalAllowlist = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'some-other-property';
  try {
    const { deps, writes, reads } = fakeDeps();

    await assert.rejects(
      () => freezeRiskIncidentsJob(
        { dryRun: true, propertyId: 'property-not-allowed' },
        deps,
      ),
      /not in SMOKE_TEST_PROPERTY_ALLOWLIST/,
    );
    assert.deepEqual(writes, { register: 0, begin: 0, complete: 0, ingest: 0 });
    assert.equal(reads.length, 0);
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalAllowlist;
  }
});
