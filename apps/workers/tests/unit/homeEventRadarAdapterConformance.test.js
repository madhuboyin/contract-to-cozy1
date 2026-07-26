const assert = require('node:assert/strict');
const test = require('node:test');

const {
  isSafeRadarCanonicalUrl,
  RadarAdapterConformanceError,
  runRadarAdapterConformance,
} = require('../../src/radar/adapterConformance');
const {
  canonicalDummyRadarAdapter,
} = require('../../src/radar/canonicalDummyRadarAdapter');

function signal(overrides = {}) {
  return {
    provider: 'weather_provider',
    providerEventId: 'fixture-weather-08536',
    signalType: 'freeze',
    headline: 'Fixture freeze warning',
    summary: 'Temperatures may fall below freezing.',
    severity: 'medium',
    startsAt: '2026-07-27T01:00:00-04:00',
    endsAt: '2026-07-27T08:00:00-04:00',
    geography: { type: 'zip', key: '08536' },
    raw: {
      providerRevision: 'revision-1',
      fixture: true,
    },
    ...overrides,
  };
}

function adapterCase(name, raw) {
  return {
    name,
    raw,
    context: {
      sourceDefinitionId: 'fixture-radar-source',
      observedAt: '2026-07-26T22:05:00-04:00',
      countryCode: 'US',
    },
  };
}

test('canonical dummy adapter passes the shared source-adapter conformance harness', async () => {
  const circularRaw = { providerRevision: 'circular-revision' };
  circularRaw.self = circularRaw;
  const report = await runRadarAdapterConformance({
    adapterName: 'canonical-dummy-radar',
    adapter: canonicalDummyRadarAdapter,
    validCase: adapterCase('valid fixture', signal()),
    revisionCase: {
      initial: adapterCase('initial', signal()),
      revised: adapterCase('provider update', signal({
        severity: 'critical',
        raw: { providerRevision: 'revision-2', fixture: true },
      })),
    },
    resolutionCase: adapterCase('resolved', signal({
      lifecycleStatus: 'resolved',
      raw: { providerRevision: 'revision-resolved', fixture: true },
    })),
    supersessionCase: {
      ...adapterCase('retracted superseded fixture', signal({
        lifecycleStatus: 'retracted',
        raw: { providerRevision: 'revision-retracted', fixture: true },
      })),
      expectedStatus: 'retracted',
    },
    invalidCases: [
      adapterCase('missing provider identity', signal({ providerEventId: ' ' })),
      adapterCase('invalid timestamp', signal({ startsAt: 'tomorrow-ish' })),
      adapterCase('unrepresentable polygon key', signal({
        geography: { type: 'polygon', key: 'not-geojson' },
      })),
      adapterCase('expiration before effective time', signal({
        endsAt: '2026-07-26T23:00:00-04:00',
      })),
      adapterCase('non-persistable circular evidence', signal({ raw: circularRaw })),
    ],
    allowedCanonicalUrlHosts: [],
  });

  assert.equal(report.adapterName, 'canonical-dummy-radar');
  assert.equal(report.checks.length, 10);

  const normalized = await canonicalDummyRadarAdapter.normalize(
    signal(),
    adapterCase('inspect', signal()).context,
  );
  assert.equal(normalized.effectiveAt, '2026-07-27T05:00:00.000Z');
  assert.equal(normalized.observedAt, '2026-07-27T02:05:00.000Z');
  assert.deepEqual(normalized.geography, {
    type: 'postal_code',
    countryCode: 'US',
    postalCode: '08536',
  });
  assert.equal(normalized.severity, 'moderate');
});

test('canonical source URL policy is HTTPS, public, credential-free, and exact-host allowlisted', () => {
  const allowed = ['api.weather.gov'];
  assert.equal(
    isSafeRadarCanonicalUrl('https://api.weather.gov/alerts/123', allowed),
    true,
  );
  assert.equal(
    isSafeRadarCanonicalUrl('http://api.weather.gov/alerts/123', allowed),
    false,
  );
  assert.equal(
    isSafeRadarCanonicalUrl('https://user:secret@api.weather.gov/alerts/123', allowed),
    false,
  );
  assert.equal(
    isSafeRadarCanonicalUrl('https://127.0.0.1/alerts/123', ['127.0.0.1']),
    false,
  );
  assert.equal(
    isSafeRadarCanonicalUrl('https://weather.gov.example.test/alerts/123', allowed),
    false,
  );
  assert.equal(
    isSafeRadarCanonicalUrl('https://api.weather.gov:8443/alerts/123', allowed),
    false,
  );
});

test('harness reports non-UTC timestamps and unsafe provider URLs with adapter context', async () => {
  const raw = signal();
  const context = adapterCase('bad', raw).context;
  const unsafeAdapter = {
    async normalize() {
      const normalized = await canonicalDummyRadarAdapter.normalize(raw, context);
      return {
        ...normalized,
        effectiveAt: '2026-07-27T01:00:00-04:00',
        canonicalUrl: 'http://localhost/provider-event',
      };
    },
  };

  await assert.rejects(
    () => runRadarAdapterConformance({
      adapterName: 'unsafe-test-adapter',
      adapter: unsafeAdapter,
      validCase: adapterCase('unsafe', raw),
      revisionCase: {
        initial: adapterCase('initial', raw),
        revised: adapterCase('revised', signal({
          raw: { providerRevision: 'revision-2' },
        })),
      },
      resolutionCase: adapterCase('resolved', signal({ lifecycleStatus: 'resolved' })),
      supersessionCase: {
        ...adapterCase('superseded', signal({ lifecycleStatus: 'retracted' })),
        expectedStatus: 'retracted',
      },
      invalidCases: [],
      allowedCanonicalUrlHosts: ['api.weather.gov'],
    }),
    (error) => {
      assert.ok(error instanceof RadarAdapterConformanceError);
      assert.match(error.message, /effectiveAt must be normalized to UTC/);
      return true;
    },
  );
});

test('harness requires adapters to reject declared invalid provider payloads', async () => {
  const permissiveAdapter = {
    normalize: canonicalDummyRadarAdapter.normalize,
  };

  await assert.rejects(
    () => runRadarAdapterConformance({
      adapterName: 'permissive-test-adapter',
      adapter: permissiveAdapter,
      validCase: adapterCase('valid', signal()),
      revisionCase: {
        initial: adapterCase('initial', signal()),
        revised: adapterCase('revised', signal({
          raw: { providerRevision: 'revision-2' },
        })),
      },
      resolutionCase: adapterCase('resolved', signal({ lifecycleStatus: 'resolved' })),
      supersessionCase: {
        ...adapterCase('superseded', signal({ lifecycleStatus: 'retracted' })),
        expectedStatus: 'retracted',
      },
      invalidCases: [adapterCase('mistakenly declared invalid', signal())],
      allowedCanonicalUrlHosts: [],
    }),
    (error) => {
      assert.ok(error instanceof RadarAdapterConformanceError);
      assert.match(error.message, /instead of rejecting invalid provider input/);
      return true;
    },
  );
});
