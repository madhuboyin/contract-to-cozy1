const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runRadarAdapterConformance,
} = require('../../src/radar/adapterConformance');
const {
  nwsRadarAdapter,
} = require('../../src/radar/nwsRadarAdapter');

function alert(overrides = {}) {
  return {
    nwsAlertId: 'urn:oid:nws-adapter-alert',
    referencedAlertIds: ['urn:oid:prior-watch'],
    hazardFamily: 'FLOOD',
    event: 'Flash Flood Warning',
    severity: 'Extreme',
    headline: 'Flash Flood Warning issued. Move to higher ground.',
    description: 'Life-threatening flash flooding is occurring.',
    instruction: 'Move immediately to higher ground.',
    sent: '2026-07-26T09:55:00-04:00',
    effective: '2026-07-26T10:00:00-04:00',
    onset: '2026-07-26T10:00:00-04:00',
    expires: '2026-07-26T12:00:00-04:00',
    ends: null,
    senderName: 'NWS Mount Holly',
    status: 'Actual',
    messageType: 'Alert',
    urgency: 'Immediate',
    certainty: 'Observed',
    canonicalUrl: 'https://api.weather.gov/alerts/urn:oid:nws-adapter-alert',
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

function adapterCase(name, raw, contextOverrides = {}) {
  return {
    name,
    raw,
    context: {
      sourceDefinitionId: 'nws-source',
      observedAt: '2026-07-26T14:01:00Z',
      queryPoint: { latitude: 40.35, longitude: -74.58 },
      ...contextOverrides,
    },
  };
}

test('NWS adapter passes canonical conformance and preserves CAP evidence', async () => {
  const report = await runRadarAdapterConformance({
    adapterName: 'nws-active-alerts',
    adapter: nwsRadarAdapter,
    validCase: adapterCase('active flood warning', alert()),
    revisionCase: {
      initial: adapterCase('initial warning', alert()),
      revised: adapterCase('updated warning', alert({
        sent: '2026-07-26T10:25:00-04:00',
        messageType: 'Update',
        severity: 'Severe',
      })),
    },
    resolutionCase: adapterCase(
      'confirmed cleared alert',
      alert({ sent: '2026-07-26T12:05:00-04:00' }),
      { lifecycleStatus: 'resolved' },
    ),
    supersessionCase: {
      ...adapterCase('cancelled alert', alert({
        sent: '2026-07-26T10:30:00-04:00',
        messageType: 'Cancel',
      })),
      expectedStatus: 'retracted',
    },
    invalidCases: [
      adapterCase('missing alert ID', alert({ nwsAlertId: ' ' })),
      adapterCase('invalid effective date', alert({ effective: 'soon' })),
      adapterCase('unsafe canonical host', alert({
        canonicalUrl: 'https://localhost/alerts/private',
      })),
      adapterCase('invalid polygon', alert({
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-74.70, 40.20],
            [-74.40, 40.20],
            [-74.40, 40.50],
          ]],
        },
      })),
    ],
    allowedCanonicalUrlHosts: ['api.weather.gov'],
  });

  assert.equal(report.checks.length, 9);
  const observation = await nwsRadarAdapter.normalize(
    alert(),
    adapterCase('inspect', alert()).context,
  );
  assert.equal(observation.eventType, 'flood_risk');
  assert.equal(observation.severity, 'extreme');
  assert.equal(observation.effectiveAt, '2026-07-26T14:00:00.000Z');
  assert.equal(observation.expiresAt, '2026-07-26T16:00:00.000Z');
  assert.equal(observation.geography.type, 'polygon');
  assert.equal(observation.rawPayload.instruction, 'Move immediately to higher ground.');
  assert.deepEqual(observation.rawPayload.referencedAlertIds, ['urn:oid:prior-watch']);
  assert.equal(observation.rawPayload.urgency, 'Immediate');
  assert.equal(observation.rawPayload.certainty, 'Observed');
});

test('NWS adapter falls back to query point when CAP geometry is absent', async () => {
  const observation = await nwsRadarAdapter.normalize(
    alert({ geometry: null }),
    adapterCase('point fallback', alert()).context,
  );
  assert.deepEqual(observation.geography, {
    type: 'point',
    point: { latitude: 40.35, longitude: -74.58 },
  });
});

test('NWS adapter preserves MultiPolygon CAP geography', async () => {
  const multiPolygon = {
    type: 'MultiPolygon',
    coordinates: [[[
      [-74.70, 40.20],
      [-74.40, 40.20],
      [-74.40, 40.50],
      [-74.70, 40.50],
      [-74.70, 40.20],
    ]]],
  };
  const observation = await nwsRadarAdapter.normalize(
    alert({ geometry: multiPolygon }),
    adapterCase('multipolygon', alert()).context,
  );
  assert.deepEqual(observation.geography, {
    type: 'polygon',
    geoJson: multiPolygon,
  });
});

test('NWS adapter marks an observation expired when its authoritative end has passed', async () => {
  const observation = await nwsRadarAdapter.normalize(
    alert(),
    adapterCase('already ended', alert(), {
      observedAt: '2026-07-26T17:00:00Z',
    }).context,
  );
  assert.equal(observation.lifecycleStatus, 'expired');
});
