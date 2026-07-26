const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

require('ts-node/register/transpile-only');

const ROOT = path.resolve(__dirname, '../../../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const {
  canonicalRadarObservationSchema,
  normalizedGeographySchema,
  radarCoverageSchema,
  radarDetailResponseSchema,
} = require('../../src/modules/homeEventRadar/contracts');

test('canonical observation accepts a valid versioned provider observation', () => {
  const parsed = canonicalRadarObservationSchema.parse({
    schemaVersion: 1,
    sourceDefinitionId: 'nws-alerts',
    providerEventId: 'urn:oid:example-alert',
    providerRevision: '2026-07-26T14:00:00Z',
    sourceFamily: 'weather',
    eventType: 'severe_thunderstorm_warning',
    title: 'Severe thunderstorm warning',
    summary: 'A verified NWS warning intersects the property area.',
    severity: 'severe',
    lifecycleStatus: 'active',
    effectiveAt: '2026-07-26T14:00:00Z',
    expiresAt: '2026-07-26T16:00:00Z',
    observedAt: '2026-07-26T14:01:00Z',
    geography: {
      type: 'radius',
      center: { latitude: 40.35, longitude: -74.58 },
      radiusMeters: 15_000,
    },
    canonicalUrl: 'https://api.weather.gov/alerts/example',
    deduplicationKeys: ['nws:urn:oid:example-alert'],
    rawPayload: { provider: 'nws' },
  });

  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.geography.type, 'radius');
});

test('canonical contracts reject invalid geography and reversed event time', () => {
  assert.equal(
    normalizedGeographySchema.safeParse({
      type: 'point',
      point: { latitude: 120, longitude: -74.58 },
    }).success,
    false,
  );

  const result = canonicalRadarObservationSchema.safeParse({
    schemaVersion: 1,
    sourceDefinitionId: 'nws-alerts',
    providerEventId: 'example',
    sourceFamily: 'weather',
    eventType: 'freeze',
    title: 'Freeze risk',
    summary: 'Forecast minimum is below threshold.',
    severity: 'moderate',
    lifecycleStatus: 'active',
    effectiveAt: '2026-07-27T10:00:00Z',
    expiresAt: '2026-07-27T09:00:00Z',
    observedAt: '2026-07-27T08:00:00Z',
    geography: { type: 'postal_code', countryCode: 'us', postalCode: '08536' },
    rawPayload: {},
  });

  assert.equal(result.success, false);
  assert.match(result.error.issues[0].message, /cannot precede/);
});

test('coverage and detail contracts require explicit source and match semantics', () => {
  const coverage = {
    propertyId: 'property-1',
    overallStatus: 'partial',
    evaluatedAt: '2026-07-26T14:00:00Z',
    families: [{
      family: 'weather',
      status: 'covered',
      sourceDefinitionIds: ['nws-alerts'],
      detail: 'NWS alerts cover this coordinate.',
    }],
  };
  assert.equal(radarCoverageSchema.safeParse(coverage).success, true);

  const incompleteDetail = {
    id: 'event-1',
    propertyMatchId: 'match-1',
    eventType: 'freeze',
  };
  assert.equal(radarDetailResponseSchema.safeParse(incompleteDetail).success, false);
});

test('homeowner Radar routes expose property-scoped reads and state only', () => {
  const publicRoutes = read('apps/backend/src/routes/homeEventRadar.routes.ts');

  assert.doesNotMatch(publicRoutes, /['"]\/radar\/events/);
  assert.match(publicRoutes, /propertyAuthMiddleware/);
  assert.match(publicRoutes, /\/properties\/:propertyId\/radar\/feed/);
  assert.match(publicRoutes, /\/properties\/:propertyId\/radar\/matches\/:matchId/);
});

test('temporary Radar operations require the complete admin authorization chain and audit writes', () => {
  const adminRoutes = read('apps/backend/src/routes/homeEventRadarAdmin.routes.ts');
  const controller = read('apps/backend/src/controllers/homeEventRadar.controller.ts');

  assert.match(adminRoutes, /['"]\/admin\/radar['"]/);
  assert.match(adminRoutes, /authenticate[\s\S]*requireMfa[\s\S]*requireRole\(UserRole\.ADMIN\)/);
  assert.match(adminRoutes, /requireCapability\(['"]INTEGRATION_MANAGE['"]\)/);
  assert.match(controller, /recordAdminAction/);
  assert.match(controller, /RADAR_EVENT_MATCH_TRIGGER/);
});

test('worker safety policies remain fail-closed for dummy and unreviewed tax ingestion', () => {
  const worker = read('apps/workers/src/worker.ts');
  const configMap = read('infrastructure/kubernetes/base/configmap.yaml');

  assert.match(worker, /DUMMY_INGEST_ENV_FLAGS[\s\S]*RADAR_DUMMY_INGEST_ENABLED/);
  assert.match(worker, /NODE_ENV === 'production'[\s\S]*Refusing to start: dummy-ingest flags enabled in production/);
  assert.match(configMap, /WORKER_EXTERNAL_INGEST_ENABLED: "false"/);
  assert.doesNotMatch(configMap, /WORKER_JOB_TAX_ASSESSMENT_INGEST_ENABLED: "true"/);
});

test('weather lifecycle guards preserve unknown rather than projecting provider failures as clear', () => {
  const severeWeather = read('apps/workers/src/jobs/severeWeatherAlerts.job.ts');
  const freeze = read('apps/workers/src/jobs/freezeRiskIncidents.job.ts');

  assert.match(severeWeather, /fetchSucceeded === 0\) sourceRunStatus = 'failed'/);
  assert.match(severeWeather, /dataFreshThrough: fetchSucceeded > 0 \? startedAt : undefined/);
  assert.doesNotMatch(severeWeather, /setStatus|upsertIncident|ingestSignal/);
  assert.match(freeze, /if \(minF == null\) continue;[\s\S]*if \(minF >= 28\)[\s\S]*setStatus/);
});
