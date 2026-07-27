const assert = require('node:assert/strict');
const test = require('node:test');

require('ts-node/register/transpile-only');

const {
  coverageEntryMatchesProperty,
  RadarSourceRegistryService,
  redactRadarSourceConfig,
  resolveRadarRuntimeEnvironment,
} = require('../../src/modules/homeEventRadar/services/radarSourceRegistry.service');
const {
  radarSourceRegistrationSchema,
} = require('../../src/modules/homeEventRadar/contracts');

function source(overrides = {}) {
  return {
    id: 'source-1',
    key: 'nws-alerts',
    family: 'weather',
    sourceType: 'weather_provider',
    name: 'NWS Alerts',
    provider: 'National Weather Service',
    adapterVersion: '1.0.0',
    contractVersion: 1,
    isEnabled: true,
    environments: ['production'],
    scheduleCron: '*/15 * * * *',
    freshnessSeconds: 1_800,
    supportedEventTypes: ['weather'],
    coverageDescription: 'US weather alert coverage',
    configJson: {},
    operationsPausedAt: null,
    operationsPausedBy: null,
    operationsPauseReason: null,
    health: {
      status: 'healthy',
      lastAttemptAt: new Date('2026-07-26T12:00:00Z'),
      lastSuccessAt: new Date('2026-07-26T12:00:00Z'),
      dataFreshThrough: new Date('2026-07-26T12:00:00Z'),
      consecutiveFailures: 0,
      message: null,
    },
    coverage: [],
    ...overrides,
  };
}

function coverage(overrides = {}) {
  return {
    id: 'coverage-1',
    coverageType: 'postal_code',
    countryCode: 'US',
    stateCode: null,
    cityName: null,
    countyFips: null,
    postalCode: '08536',
    centerLatitude: null,
    centerLongitude: null,
    radiusMeters: null,
    geometryGeoJson: null,
    validFrom: null,
    validUntil: null,
    ...overrides,
  };
}

test('redacts sensitive source configuration recursively', () => {
  assert.deepEqual(
    redactRadarSourceConfig({
      endpoint: 'https://example.test',
      apiKey: 'secret-value',
      nested: { bearer_token: 'token-value', timeoutMs: 5000 },
      headers: [{ Authorization: 'Bearer hidden' }],
    }),
    {
      endpoint: 'https://example.test',
      apiKey: '[REDACTED]',
      nested: { bearer_token: '[REDACTED]', timeoutMs: 5000 },
      headers: [{ Authorization: '[REDACTED]' }],
    },
  );
});

test('source registration rejects incomplete jurisdiction definitions', () => {
  const result = radarSourceRegistrationSchema.safeParse({
    key: 'tax-assessor',
    family: 'tax',
    sourceType: 'tax_assessor_feed',
    name: 'County assessor',
    provider: 'County',
    adapterVersion: '1.0.0',
    isEnabled: false,
    environments: ['production'],
    freshnessSeconds: 604800,
    supportedEventTypes: ['tax_reassessment'],
    coverageDescription: 'Configured counties',
    coverage: [{ coverageType: 'county', countryCode: 'US' }],
  });

  assert.equal(result.success, false);
  assert.match(result.error.issues[0].message, /countyFips is required/);
});

test('registration persists validated coverage but only returns redacted configuration', async () => {
  let upsertArgs;
  const db = {
    radarSourceDefinition: {
      upsert: async (args) => {
        upsertArgs = args;
        return source({
          configJson: { apiKey: 'do-not-return', endpoint: 'https://api.weather.gov' },
          coverage: [coverage()],
        });
      },
    },
  };
  const registry = new RadarSourceRegistryService(db);
  const registered = await registry.register({
    key: 'nws-alerts',
    family: 'weather',
    sourceType: 'weather_provider',
    name: 'NWS Alerts',
    provider: 'National Weather Service',
    adapterVersion: '1.0.0',
    isEnabled: true,
    environments: ['production'],
    scheduleCron: '*/15 * * * *',
    freshnessSeconds: 1800,
    supportedEventTypes: ['weather'],
    coverageDescription: 'United States',
    configJson: { apiKey: 'do-not-return', endpoint: 'https://api.weather.gov' },
    coverage: [{ coverageType: 'postal_code', countryCode: 'US', postalCode: '08536' }],
  });

  assert.equal(upsertArgs.create.health.create.status, 'unknown');
  assert.equal(upsertArgs.create.coverage.create[0].postalCode, '08536');
  assert.deepEqual(registered.safeConfig, {
    apiKey: '[REDACTED]',
    endpoint: 'https://api.weather.gov',
  });
  assert.equal(Object.hasOwn(registered, 'configJson'), false);
});

test('runtime environment and worker policy are fail-closed', () => {
  const registry = new RadarSourceRegistryService({});
  const productionSource = source();

  assert.equal(resolveRadarRuntimeEnvironment({ NODE_ENV: 'production' }), 'production');
  assert.deepEqual(
    registry.executionDecision(productionSource, 'scheduled', {
      NODE_ENV: 'production',
      WORKER_AUTOMATION_ENABLED: 'true',
      WORKER_EXTERNAL_INGEST_ENABLED: 'false',
    }),
    {
      allowed: false,
      reason: 'WORKER_EXTERNAL_INGEST_ENABLED=false (external provider: National Weather Service)',
    },
  );
  assert.equal(
    registry.executionDecision(productionSource, 'scheduled', {
      NODE_ENV: 'production',
      WORKER_JOB_NWS_ALERTS_ENABLED: 'true',
    }).allowed,
    true,
  );
  assert.equal(
    registry.executionDecision(
      { ...productionSource, environments: ['test'] },
      'scheduled',
      { NODE_ENV: 'production', WORKER_JOB_NWS_ALERTS_ENABLED: 'true' },
    ).allowed,
    false,
  );
  assert.deepEqual(
    registry.executionDecision(
      {
        ...productionSource,
        operationsPausedAt: new Date('2026-07-26T12:00:00Z'),
      },
      'manual',
      { NODE_ENV: 'production', WORKER_JOB_NWS_ALERTS_ENABLED: 'true' },
    ),
    { allowed: false, reason: 'source is paused by an operator' },
  );
});

test('coverage evaluation distinguishes covered, uncovered, and unknown geography', () => {
  const registry = new RadarSourceRegistryService({});
  const evaluatedAt = new Date('2026-07-26T12:10:00Z');
  const postalSource = source({ coverage: [coverage()] });

  assert.equal(
    registry.coverageDecision(
      postalSource,
      { id: 'property-1', zipCode: '08536', state: 'NJ' },
      evaluatedAt,
    ).status,
    'covered',
  );
  assert.equal(
    registry.coverageDecision(
      postalSource,
      { id: 'property-2', zipCode: '10001', state: 'NY' },
      evaluatedAt,
    ).status,
    'not_covered',
  );

  const radiusSource = source({
    coverage: [coverage({
      coverageType: 'radius',
      postalCode: null,
      centerLatitude: 40.35,
      centerLongitude: -74.58,
      radiusMeters: 10_000,
    })],
  });
  assert.equal(
    registry.coverageDecision(radiusSource, { id: 'property-3' }, evaluatedAt).status,
    'unknown',
  );
});

test('city coverage requires both normalized city and state', () => {
  const cityCoverage = coverage({
    coverageType: 'city',
    stateCode: 'NJ',
    cityName: 'Plainsboro Township',
    postalCode: null,
  });
  assert.equal(
    coverageEntryMatchesProperty(
      cityCoverage,
      { id: 'property-1', city: 'plainsboro township', state: 'nj' },
    ),
    true,
  );
  assert.equal(
    coverageEntryMatchesProperty(
      cityCoverage,
      { id: 'property-2', city: 'Plainsboro Township', state: 'PA' },
    ),
    false,
  );
});

test('radius and polygon coverage use property coordinates', () => {
  assert.equal(
    coverageEntryMatchesProperty(
      coverage({
        coverageType: 'radius',
        postalCode: null,
        centerLatitude: 40.35,
        centerLongitude: -74.58,
        radiusMeters: 5_000,
      }),
      { id: 'property-1', latitude: 40.36, longitude: -74.57 },
    ),
    true,
  );

  assert.equal(
    coverageEntryMatchesProperty(
      coverage({
        coverageType: 'polygon',
        postalCode: null,
        geometryGeoJson: {
          type: 'Polygon',
          coordinates: [[
            [-74.60, 40.34],
            [-74.55, 40.34],
            [-74.55, 40.38],
            [-74.60, 40.38],
            [-74.60, 40.34],
          ]],
        },
      }),
      { id: 'property-1', latitude: 40.36, longitude: -74.57 },
    ),
    true,
  );
});
