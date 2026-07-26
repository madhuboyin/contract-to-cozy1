const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runRadarAdapterConformance,
} = require('../../src/radar/adapterConformance');
const {
  FREEZE_THRESHOLD_F,
  freezeRadarAdapter,
} = require('../../src/radar/freezeRadarAdapter');

function forecast(overrides = {}) {
  return {
    propertyId: 'property-1',
    latitude: 40.33,
    longitude: -74.58,
    minimumFahrenheit: 20,
    windowStart: '2026-07-26T14:05:00Z',
    windowEnd: '2026-07-28T02:05:00Z',
    sourceUrl: 'https://api.open-meteo.com/v1/forecast?latitude=40.33&longitude=-74.58',
    rawPayload: {
      samples: [{ at: '2026-07-27T03:00:00Z', celsius: -6.7 }],
    },
    ...overrides,
  };
}

function adapterCase(name, raw, contextOverrides = {}) {
  return {
    name,
    raw,
    context: {
      sourceDefinitionId: 'freeze-source',
      observedAt: '2026-07-26T14:05:30Z',
      ...contextOverrides,
    },
  };
}

test('freeze adapter passes canonical conformance and preserves forecast evidence', async () => {
  const report = await runRadarAdapterConformance({
    adapterName: 'open-meteo-freeze-forecast',
    adapter: freezeRadarAdapter,
    validCase: adapterCase('active freeze forecast', forecast()),
    revisionCase: {
      initial: adapterCase('initial forecast', forecast()),
      revised: adapterCase('colder refresh', forecast({
        minimumFahrenheit: 12,
        rawPayload: {
          samples: [{ at: '2026-07-27T03:00:00Z', celsius: -11.1 }],
        },
      })),
    },
    resolutionCase: adapterCase(
      'verified warm forecast',
      forecast({ minimumFahrenheit: 35 }),
    ),
    supersessionCase: {
      ...adapterCase(
        'provider correction',
        forecast(),
        { lifecycleStatus: 'retracted' },
      ),
      expectedStatus: 'retracted',
    },
    invalidCases: [
      adapterCase('missing property ID', forecast({ propertyId: ' ' })),
      adapterCase('non-finite minimum', forecast({ minimumFahrenheit: Number.NaN })),
      adapterCase('invalid window start', forecast({ windowStart: 'later' })),
      adapterCase('unsafe canonical URL', forecast({
        sourceUrl: 'https://localhost/private',
      })),
    ],
    allowedCanonicalUrlHosts: ['api.open-meteo.com'],
  });

  assert.equal(report.checks.length, 9);
  const observation = await freezeRadarAdapter.normalize(
    forecast(),
    adapterCase('inspect', forecast()).context,
  );
  assert.equal(observation.providerEventId, 'open-meteo:freeze-risk:property-1');
  assert.equal(observation.eventType, 'freeze');
  assert.equal(observation.lifecycleStatus, 'active');
  assert.deepEqual(observation.geography, {
    type: 'property',
    propertyId: 'property-1',
  });
  assert.equal(observation.rawPayload.thresholdFahrenheit, FREEZE_THRESHOLD_F);
  assert.equal(observation.rawPayload.minimumFahrenheit, 20);
  assert.equal(observation.rawPayload.forecast.samples.length, 1);
});

test('threshold boundary resolves and severity becomes informational', async () => {
  const observation = await freezeRadarAdapter.normalize(
    forecast({ minimumFahrenheit: FREEZE_THRESHOLD_F }),
    adapterCase('threshold boundary', forecast()).context,
  );

  assert.equal(observation.lifecycleStatus, 'resolved');
  assert.equal(observation.severity, 'info');
});
