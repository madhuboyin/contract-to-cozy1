const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

const {
  computeRadarConfidence,
  RADAR_CONFIDENCE_VERSION,
  RADAR_CONFIDENCE_WEIGHTS,
} = require('../../src/modules/homeEventRadar/domain/radarConfidence');
const {
  radarMatchExplanationSchema,
} = require('../../src/modules/homeEventRadar/contracts/radar.contracts');

const NOW = new Date('2026-07-26T12:00:00.000Z');

function event(overrides = {}) {
  return {
    eventType: 'hail',
    locationType: 'property',
    locationKey: 'property:property-1',
    geoJson: null,
    observedAt: new Date('2026-07-26T11:55:00.000Z'),
    sourceDefinition: {
      isEnabled: true,
      freshnessSeconds: 1800,
      health: {
        status: 'healthy',
        lastSuccessAt: new Date('2026-07-26T11:58:00.000Z'),
        dataFreshThrough: new Date('2026-07-26T11:55:00.000Z'),
      },
    },
    sourceRun: {
      status: 'success',
      finishedAt: new Date('2026-07-26T11:58:00.000Z'),
      dataFreshThrough: new Date('2026-07-26T11:55:00.000Z'),
    },
    ...overrides,
  };
}

function impact(overrides = {}) {
  return {
    inputFacts: [
      { factKey: 'property.roofReplacementYear', state: 'known', value: 2005 },
      { factKey: 'responsibility.ROOF', state: 'known', value: 'OWNER' },
    ],
    missingFacts: [],
    drivers: [
      {
        code: 'OLDER_ROOF',
        factKeys: ['property.roofReplacementYear'],
      },
    ],
    ...overrides,
  };
}

function component(result, name) {
  return result.components.find((candidate) => candidate.name === name);
}

test('weights are fixed, bounded, and sum to one', () => {
  assert.deepEqual(RADAR_CONFIDENCE_WEIGHTS, {
    source: 0.25,
    geography: 0.25,
    freshness: 0.2,
    propertyCompleteness: 0.15,
    domainEvidence: 0.15,
  });
  assert.equal(
    Object.values(RADAR_CONFIDENCE_WEIGHTS).reduce((sum, value) => sum + value, 0),
    1,
  );
});

test('strong reviewed evidence produces a high, replay-stable result', () => {
  const first = computeRadarConfidence(event(), impact(), NOW);
  const replay = computeRadarConfidence(event(), impact(), NOW);

  assert.deepEqual(replay, first);
  assert.equal(first.version, RADAR_CONFIDENCE_VERSION);
  assert.equal(first.score, 0.9925);
  assert.equal(first.band, 'high');
  assert.deepEqual(first.missingFactReasons, []);
  assert.match(first.homeownerExplanation, /^Confidence is high/);
  assert.ok(first.components.every((entry) => entry.score >= 0 && entry.score <= 1));
  assert.equal(
    Number(
      first.components
        .reduce((sum, entry) => sum + entry.score * entry.weight, 0)
        .toFixed(4),
    ),
    first.score,
  );
});

test('broad stale unreviewed evidence stays low and explains why', () => {
  const result = computeRadarConfidence(
    event({
      eventType: 'other',
      locationType: 'state',
      observedAt: new Date('2026-07-20T00:00:00.000Z'),
      sourceDefinition: null,
      sourceRun: null,
    }),
    impact({
      inputFacts: [
        { factKey: 'property.hasDrainageIssues', state: 'unknown', value: null },
      ],
      missingFacts: [
        {
          factKey: 'property.hasDrainageIssues',
          reasonCode: 'DRAINAGE_ISSUES_UNKNOWN',
        },
      ],
      drivers: [],
    }),
    NOW,
  );

  assert.equal(result.band, 'low');
  assert.ok(result.score < 0.6);
  assert.ok(
    result.missingFactReasons.some(
      (reason) => reason.code === 'SOURCE_DEFINITION_UNKNOWN',
    ),
  );
  assert.ok(
    result.missingFactReasons.some(
      (reason) => reason.code === 'GEOGRAPHY_BROAD_SCOPE',
    ),
  );
  assert.ok(
    result.missingFactReasons.some(
      (reason) => reason.code === 'DRAINAGE_ISSUES_UNKNOWN',
    ),
  );
  assert.ok(
    result.missingFactReasons.some(
      (reason) => reason.code === 'DOMAIN_RULE_GENERIC',
    ),
  );
  assert.match(result.homeownerExplanation, /^Confidence is low/);
  assert.doesNotMatch(result.homeownerExplanation, /%|probability/i);
});

test('state precision can be medium with otherwise strong reviewed evidence', () => {
  const result = computeRadarConfidence(
    event({ locationType: 'state' }),
    impact({
      inputFacts: [
        { factKey: 'property.coolingType', state: 'known', value: 'CENTRAL_AC' },
        { factKey: 'property.hvacInstallYear', state: 'unknown', value: null },
      ],
      missingFacts: [
        {
          factKey: 'property.hvacInstallYear',
          reasonCode: 'HVAC_INSTALL_YEAR_UNKNOWN',
        },
      ],
      drivers: [],
    }),
    NOW,
  );
  assert.equal(result.band, 'medium');
  assert.ok(result.score >= 0.6 && result.score < 0.8);
});

test('radius confidence declines monotonically as geographic scope broadens', () => {
  const distances = [500, 5_000, 25_000, 100_000];
  const scores = distances.map((radiusMeters) => component(
    computeRadarConfidence(
      event({
        locationType: 'radius',
        geoJson: { type: 'Radius', center: [-74, 40], radiusMeters },
      }),
      impact(),
      NOW,
    ),
    'geography',
  ).score);
  assert.deepEqual(scores, [0.9, 0.8, 0.7, 0.55]);
});

test('canonical administrative level controls geographic precision', () => {
  const scoreFor = (level) => component(
    computeRadarConfidence(
      event({
        locationType: 'administrative_area',
        locationKey: `US:${level}:${level === 'city' ? 'NJ:Plainsboro' : '34023'}`,
      }),
      impact(),
      NOW,
    ),
    'geography',
  ).score;
  assert.equal(scoreFor('city'), 0.65);
  assert.equal(scoreFor('county'), 0.6);
  assert.equal(scoreFor('state'), 0.45);
});

test('freshness decays only across documented source-window boundaries', () => {
  const base = event({
    sourceDefinition: {
      isEnabled: true,
      freshnessSeconds: 3600,
      health: {
        status: 'healthy',
        lastSuccessAt: null,
        dataFreshThrough: null,
      },
    },
    sourceRun: null,
  });
  const atAge = (hours) => component(
    computeRadarConfidence(
      {
        ...base,
        observedAt: new Date(NOW.getTime() - hours * 3600 * 1000),
      },
      impact(),
      NOW,
    ),
    'freshness',
  ).score;

  assert.equal(atAge(1), 1);
  assert.equal(atAge(2), 0.8);
  assert.equal(atAge(4), 0.55);
  assert.equal(atAge(5), 0.25);
});

test('pure confidence module has no database or service dependency', () => {
  const source = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../src/modules/homeEventRadar/domain/radarConfidence.ts',
    ),
    'utf8',
  );
  assert.doesNotMatch(source, /from ['"].*(prisma|service|repository|client)/i);
  assert.doesNotMatch(source, /\bprisma\b|\$queryRaw|findMany|findUnique/);
  assert.throws(
    () => computeRadarConfidence(event(), impact(), new Date('invalid')),
    /evaluation time must be valid/,
  );
});

test('matcher persists confidence and combines all matcher versions', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/homeEventRadarMatcher.service.ts'),
    'utf8',
  );
  assert.match(source, /computeRadarConfidence\(/);
  assert.match(source, /confidence: confidence\.band/);
  assert.match(source, /confidenceScore: confidence\.score\.toFixed\(4\)/);
  assert.match(
    source,
    /geographicExplanation\.matcherVersion,\s*impact\.ruleVersion,\s*confidence\.version/s,
  );
});

test('homeowner feed and detail expose confidence band and calm explanation', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/homeEventRadar.service.ts'),
    'utf8',
  );
  assert.match(source, /confidence: match\.confidence \?\? null/);
  assert.match(source, /matchExplanation: match\.matchExplanationJson \?\? null/);
  assert.doesNotMatch(source, /probability of (?:loss|damage)/i);
});

test('detail contract accepts bounded confidence diagnostics', () => {
  const confidence = computeRadarConfidence(event(), impact(), NOW);
  const parsed = radarMatchExplanationSchema.parse({
    matcherVersion: `geography-v1+impact-v1+${confidence.version}`,
    matchedAt: NOW.toISOString(),
    matchType: 'property',
    confidence: confidence.band,
    confidenceVersion: confidence.version,
    confidenceScore: confidence.score,
    confidenceComponents: confidence.components,
    missingFactReasons: confidence.missingFactReasons,
    homeownerExplanation: confidence.homeownerExplanation,
    reasons: ['Event is scoped to the canonical property.'],
    propertyFactsUsed: ['property.id'],
  });
  assert.equal(parsed.confidence, 'high');
  assert.equal(parsed.confidenceComponents.length, 5);
});
