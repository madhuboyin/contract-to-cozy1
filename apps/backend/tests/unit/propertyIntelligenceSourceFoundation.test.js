const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  deriveCoverageHealth,
} = require('../../src/propertyIntelligence/coverageHealth.ts');
const {
  haversineMiles,
  matchObservationToProperty,
} = require('../../src/propertyIntelligence/geoMatching.ts');
const {
  buildGeographicMatchAssessment,
} = require('../../src/propertyIntelligence/impactBoundaries.ts');
const {
  observationContentHash,
} = require('../../src/propertyIntelligence/observationIdentity.ts');
const {
  normalizedIntelligenceObservationSchema,
} = require('../../src/propertyIntelligence/propertyIntelligence.contracts.ts');
const {
  evaluateSourceActivation,
} = require('../../src/propertyIntelligence/sourceGovernance.ts');

const backendRoot = path.resolve(__dirname, '../..');
const read = (relativePath) =>
  fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');

function observation(overrides = {}) {
  return {
    externalId: 'record-1',
    observationType: 'HAIL_EVENT',
    lifecycleStatus: 'COMPLETED',
    observedAt: new Date('2026-07-01T12:00:00Z'),
    latitude: 40.7128,
    longitude: -74.006,
    geographyType: 'POINT_RADIUS',
    geographyKey: '40.7128,-74.006',
    matchRadiusMiles: 5,
    lastVerifiedAt: new Date('2026-07-29T12:00:00Z'),
    factualPayload: { severity: 'severe' },
    ...overrides,
  };
}

test('source activation fails closed until source, terms, environment, coverage, and QA are approved', () => {
  const source = {
    reviewedStatus: 'APPROVED',
    termsVersion: '2026-07',
    supportedObservationTypes: ['HAIL_EVENT'],
    enabledEnvironments: ['production'],
    pausedAt: null,
  };
  const unreviewedCoverage = [{
    status: 'CONFIGURED',
    geographyKey: 'NY',
    validThrough: null,
    qaReviewedAt: null,
  }];

  assert.deepEqual(
    evaluateSourceActivation(source, unreviewedCoverage, 'production')
      .reasonCodes,
    ['COVERAGE_QA_NOT_APPROVED'],
  );
  assert.equal(
    evaluateSourceActivation(
      source,
      [{ ...unreviewedCoverage[0], qaReviewedAt: new Date() }],
      'production',
    ).enabled,
    true,
  );
  assert.ok(
    evaluateSourceActivation(source, unreviewedCoverage, 'staging')
      .reasonCodes.includes('ENVIRONMENT_NOT_ENABLED'),
  );
});

test('coverage health exposes current, stale, unavailable, and not-configured states without an all-clear', () => {
  const now = new Date('2026-07-29T12:00:00Z');
  const base = {
    status: 'ACTIVE',
    checkedThrough: new Date('2026-07-29T11:30:00Z'),
    validFrom: null,
    validThrough: null,
    coverageLimitations: 'State records only.',
  };

  const current = deriveCoverageHealth({
    coverage: base,
    maxStalenessMinutes: 60,
    now,
  });
  assert.equal(current.state, 'CURRENT');
  assert.equal(current.comprehensive, false);
  assert.match(current.limitations.join(' '), /not a universal all-clear/i);

  assert.equal(deriveCoverageHealth({
    coverage: { ...base, checkedThrough: new Date('2026-07-28T00:00:00Z') },
    maxStalenessMinutes: 60,
    now,
  }).state, 'STALE');
  assert.equal(deriveCoverageHealth({
    coverage: { ...base, status: 'UNAVAILABLE' },
    maxStalenessMinutes: 60,
    now,
  }).state, 'UNAVAILABLE');
  assert.equal(deriveCoverageHealth({
    coverage: null,
    maxStalenessMinutes: 60,
    now,
  }).state, 'NOT_CONFIGURED');
});

test('point matches use actual haversine distance and reject points outside the sourced radius', () => {
  const nearbyProperty = {
    latitude: 40.7306,
    longitude: -73.9866,
    zipCode: '10003',
    county: 'New York',
    state: 'NY',
  };
  const distance = haversineMiles(
    40.7128,
    -74.006,
    nearbyProperty.latitude,
    nearbyProperty.longitude,
  );
  assert.ok(distance > 1 && distance < 2);

  const match = matchObservationToProperty(observation(), nearbyProperty);
  assert.equal(match.matchMethod, 'EXACT_POINT_DISTANCE');
  assert.equal(match.distanceMiles, distance);

  assert.equal(
    matchObservationToProperty(
      observation({ matchRadiusMiles: 0.25 }),
      nearbyProperty,
    ),
    null,
  );
});

test('coarse geography matches never fabricate a distance', () => {
  const property = {
    latitude: null,
    longitude: null,
    zipCode: '10003',
    county: 'New York',
    state: 'NY',
  };
  const match = matchObservationToProperty(
    observation({
      geographyType: 'COUNTY',
      geographyKey: 'New York',
      latitude: null,
      longitude: null,
      matchRadiusMiles: null,
    }),
    property,
  );
  assert.equal(match.matchMethod, 'COUNTY');
  assert.equal(match.geographicPrecision, 'COUNTY');
  assert.equal(match.distanceMiles, null);
  assert.match(match.matchedGeography, /^County /);
});

test('normalized observations require complete point-radius geometry', () => {
  const result = normalizedIntelligenceObservationSchema.safeParse(
    observation({ longitude: null }),
  );
  assert.equal(result.success, false);
});

test('canonical content hashes are stable across key order and change with source facts', () => {
  const left = observationContentHash({
    lifecycleStatus: 'ACTIVE',
    factualPayload: { laneCount: 2, phase: 'construction' },
  });
  const reordered = observationContentHash({
    factualPayload: { phase: 'construction', laneCount: 2 },
    lifecycleStatus: 'ACTIVE',
  });
  const revised = observationContentHash({
    factualPayload: { phase: 'completed', laneCount: 2 },
    lifecycleStatus: 'COMPLETED',
  });
  assert.equal(left, reordered);
  assert.notEqual(left, revised);
});

test('impact boundary preserves geographic fact without claiming home damage or value effect', () => {
  const assessment = buildGeographicMatchAssessment('HAIL_EVENT', {
    matchMethod: 'ZIP',
    distanceMiles: null,
    geographicPrecision: 'ZIP',
    matchConfidence: 0.8,
    matchedGeography: 'ZIP 10003',
  });
  assert.equal(assessment.relevance, 'UNKNOWN');
  assert.equal(assessment.materiality, 'INFORMATIONAL');
  assert.deepEqual(assessment.affectedEntities, []);
  assert.ok(assessment.missingFacts.includes('PROPERTY_EFFECT_EVIDENCE'));
  assert.match(assessment.boundedExplanation, /does not confirm an effect/i);
});

test('schema and routes expose the complete source foundation without migrations or compatibility tables', () => {
  const schema = read('prisma/schema.prisma');
  const routes = read('src/propertyIntelligence/propertyIntelligence.routes.ts');
  const service = read('src/propertyIntelligence/propertyIntelligence.service.ts');

  for (const model of [
    'IntelligenceSource',
    'IntelligenceSourceCoverage',
    'IntelligenceSourceRun',
    'IntelligenceObservation',
    'PropertyObservationMatch',
    'PropertyImpactAssessment',
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(schema, /qaReviewedAt\s+DateTime\?/);
  assert.match(schema, /supersedesObservationId\s+String\?/);
  assert.match(routes, /properties\/:propertyId\/intelligence\/coverage/);
  assert.match(routes, /admin\/property-intelligence\/sources/);
  assert.match(routes, /requireCapability\('INTEGRATION_MANAGE'\)/);
  assert.match(service, /SOURCE_ACTIVATION_REJECTED/);
  assert.match(service, /contentHash/);
});
