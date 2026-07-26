const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

const {
  compareRadarPriority,
  computeRadarPriority,
  radarPriorityBand,
  RADAR_PRIORITY_VERSION,
  RADAR_PRIORITY_WEIGHTS,
} = require('../../src/modules/homeEventRadar/domain/radarPriority');
const {
  radarPriorityDiagnosticsSchema,
} = require('../../src/modules/homeEventRadar/contracts/radar.contracts');

const NOW = new Date('2026-07-26T12:00:00.000Z');

function input(overrides = {}) {
  return {
    severity: 'critical',
    impactLevel: 'high',
    confidence: 'high',
    effectiveAt: '2026-07-26T15:00:00.000Z',
    expiresAt: '2026-07-27T15:00:00.000Z',
    lifecycleStatus: 'updated',
    isMaterialUpdate: true,
    materiallyUpdatedAt: '2026-07-26T11:30:00.000Z',
    hasActiveIncident: true,
    userState: 'new',
    ...overrides,
  };
}

function component(result, name) {
  return result.components.find((candidate) => candidate.name === name);
}

test('priority weights are fixed, bounded, and sum to one', () => {
  assert.deepEqual(RADAR_PRIORITY_WEIGHTS, {
    severity: 0.25,
    impact: 0.25,
    confidence: 0.15,
    timing: 0.15,
    materialUpdate: 0.05,
    activeIncident: 0.1,
    userState: 0.05,
  });
  assert.equal(
    Object.values(RADAR_PRIORITY_WEIGHTS).reduce((sum, value) => sum + value, 0),
    1,
  );
});

test('strong imminent evidence produces a deterministic bounded ordering score', () => {
  const first = computeRadarPriority(input(), NOW);
  const replay = computeRadarPriority(input(), NOW);

  assert.deepEqual(replay, first);
  assert.equal(first.version, RADAR_PRIORITY_VERSION);
  assert.equal(first.score, 96.5);
  assert.equal(first.band, 'urgent');
  assert.equal(first.orderingOnly, true);
  assert.equal(first.evaluatedAt, NOW.toISOString());
  assert.ok(first.components.every((entry) => entry.score >= 0 && entry.score <= 1));
});

test('priority bands use exact documented boundaries', () => {
  assert.equal(radarPriorityBand(100), 'urgent');
  assert.equal(radarPriorityBand(80), 'urgent');
  assert.equal(radarPriorityBand(79.999), 'high');
  assert.equal(radarPriorityBand(60), 'high');
  assert.equal(radarPriorityBand(59.999), 'medium');
  assert.equal(radarPriorityBand(35), 'medium');
  assert.equal(radarPriorityBand(34.999), 'low');
  assert.equal(radarPriorityBand(0), 'low');
});

test('time-to-onset increases only across bounded reviewed windows', () => {
  const scoreAtHours = (hours) => component(
    computeRadarPriority(
      input({
        effectiveAt: new Date(NOW.getTime() + hours * 3_600_000),
        isMaterialUpdate: false,
        hasActiveIncident: false,
      }),
      NOW,
    ),
    'timing',
  ).score;

  assert.deepEqual(
    [3, 12, 48, 120, 360, 1_000].map(scoreAtHours),
    [1, 0.9, 0.75, 0.55, 0.3, 0.15],
  );
});

test('active events decline as verified expiration approaches', () => {
  const scoreAtHours = (hours) => component(
    computeRadarPriority(
      input({
        effectiveAt: '2026-07-26T10:00:00.000Z',
        expiresAt: new Date(NOW.getTime() + hours * 3_600_000),
      }),
      NOW,
    ),
    'timing',
  ).score;

  assert.deepEqual([96, 48, 12, 3, 0].map(scoreAtHours), [0.75, 0.85, 0.65, 0.45, 0]);
});

test('terminal lifecycle can never receive a timing boost', () => {
  for (const lifecycleStatus of ['resolved', 'expired', 'retracted', 'archived']) {
    const result = computeRadarPriority(input({ lifecycleStatus }), NOW);
    assert.equal(component(result, 'timing').score, 0);
    assert.equal(component(result, 'timing').reasonCode, 'TIMING_TERMINAL');
  }
});

test('material updates and active incidents have independent hard caps', () => {
  const base = computeRadarPriority(
    input({ isMaterialUpdate: false, hasActiveIncident: false }),
    NOW,
  );
  const updated = computeRadarPriority(
    input({ isMaterialUpdate: true, hasActiveIncident: false }),
    NOW,
  );
  const incident = computeRadarPriority(
    input({ isMaterialUpdate: false, hasActiveIncident: true }),
    NOW,
  );
  assert.equal(updated.score - base.score, 5);
  assert.equal(incident.score - base.score, 10);
});

test('material-update boost decays completely after 72 hours', () => {
  const recent = computeRadarPriority(input({
    materiallyUpdatedAt: '2026-07-25T12:00:00.000Z',
  }), NOW);
  const aging = computeRadarPriority(input({
    materiallyUpdatedAt: '2026-07-24T12:00:00.000Z',
  }), NOW);
  const stale = computeRadarPriority(input({
    materiallyUpdatedAt: '2026-07-20T12:00:00.000Z',
  }), NOW);
  assert.equal(component(recent, 'materialUpdate').score, 1);
  assert.equal(component(aging, 'materialUpdate').score, 0.5);
  assert.equal(component(stale, 'materialUpdate').score, 0);
  assert.equal(
    component(stale, 'materialUpdate').reasonCode,
    'MATERIAL_UPDATE_STALE',
  );
});

test('explicit user state is bounded and action state cannot create urgency', () => {
  const scores = Object.fromEntries(
    ['new', 'seen', 'saved', 'dismissed', 'acted_on'].map((userState) => [
      userState,
      computeRadarPriority(input({ userState }), NOW).score,
    ]),
  );
  assert.equal(scores.saved - scores.dismissed, 5);
  assert.ok(scores.saved > scores.new);
  assert.ok(scores.new > scores.seen);
  assert.ok(scores.seen > scores.acted_on);
  assert.ok(scores.acted_on > scores.dismissed);
});

test('unknown labels are conservative rather than amplified', () => {
  const result = computeRadarPriority(input({
    severity: 'mystery',
    impactLevel: 'mystery',
    confidence: null,
    effectiveAt: '2026-09-30T12:00:00.000Z',
    lifecycleStatus: 'active',
    isMaterialUpdate: false,
    hasActiveIncident: false,
    userState: 'dismissed',
  }), NOW);
  assert.equal(result.band, 'low');
  assert.ok(result.score < 15);
  assert.equal(component(result, 'severity').reasonCode, 'SEVERITY_UNKNOWN');
  assert.equal(component(result, 'impact').reasonCode, 'IMPACT_UNKNOWN');
  assert.equal(component(result, 'confidence').reasonCode, 'CONFIDENCE_UNKNOWN');
});

test('stable tie-breakers resolve equal scores without relying on input order', () => {
  const priority = computeRadarPriority(input(), NOW);
  const candidates = [
    {
      ...priority,
      effectiveAt: '2026-07-26T16:00:00.000Z',
      createdAt: '2026-07-26T11:00:00.000Z',
      matchId: 'match-b',
    },
    {
      ...priority,
      effectiveAt: '2026-07-26T15:00:00.000Z',
      createdAt: '2026-07-26T10:00:00.000Z',
      matchId: 'match-c',
    },
    {
      ...priority,
      effectiveAt: '2026-07-26T15:00:00.000Z',
      createdAt: '2026-07-26T11:00:00.000Z',
      matchId: 'match-a',
    },
    {
      ...priority,
      effectiveAt: '2026-07-26T15:00:00.000Z',
      createdAt: '2026-07-26T11:00:00.000Z',
      matchId: 'match-d',
    },
  ];
  assert.deepEqual(
    candidates.sort(compareRadarPriority).map((candidate) => candidate.matchId),
    ['match-d', 'match-a', 'match-c', 'match-b'],
  );
});

test('diagnostic contract accepts all bounded components', () => {
  const parsed = radarPriorityDiagnosticsSchema.parse(
    computeRadarPriority(input(), NOW),
  );
  assert.equal(parsed.components.length, 7);
  assert.equal(parsed.orderingOnly, true);
});

test('priority module is pure and rejects invalid evaluation clocks', () => {
  const source = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../src/modules/homeEventRadar/domain/radarPriority.ts',
    ),
    'utf8',
  );
  assert.doesNotMatch(source, /from ['"].*(prisma|service|repository|client)/i);
  assert.doesNotMatch(source, /\bprisma\b|\$queryRaw|findMany|findUnique/);
  assert.throws(
    () => computeRadarPriority(input(), new Date('invalid')),
    /evaluation time must be valid/,
  );
  assert.throws(
    () => computeRadarPriority(input({ effectiveAt: 'invalid' }), NOW),
    /effectiveAt must be valid/,
  );
});

test('matcher persists operational diagnostics after Incident projection', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/homeEventRadarMatcher.service.ts'),
    'utf8',
  );
  assert.match(source, /const incidentProjection = await radarIncidentPromotionService\.project/);
  assert.match(source, /computeRadarPriority\(/);
  assert.match(source, /priorityBand: priority\.band/);
  assert.match(source, /priorityScore: priority\.score\.toFixed\(3\)/);
  assert.match(source, /priorityDiagnosticsJson: priority/);
  assert.match(source, /priorityVersion: priority\.version/);
});

test('homeowner feed uses bounded priority without stale global signal boosts', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/homeEventRadar.service.ts'),
    'utf8',
  );
  assert.match(source, /computeRadarPriority\(/);
  assert.match(source, /compareRadarPriority\(/);
  assert.match(source, /priorityBand: priority\.band/);
  assert.doesNotMatch(source, /applyBoundedSignalPriorityBoost/);
  assert.doesNotMatch(source, /RISK_SPIKE|COST_ANOMALY|MAINT_ADHERENCE/);
  assert.doesNotMatch(source, /priorityDiagnosticsJson: match/);
  assert.doesNotMatch(source, /priorityScore: priority\.score/);
});

test('Prisma retains priority diagnostics and a property ordering index', () => {
  const schema = fs.readFileSync(
    path.resolve(__dirname, '../../prisma/schema.prisma'),
    'utf8',
  );
  assert.match(schema, /priorityBand\s+RadarPriorityBand\s+@default\(low\)/);
  assert.match(
    schema,
    /priorityScore\s+Decimal\s+@default\(0\) @db\.Decimal\(6, 3\)/,
  );
  assert.match(schema, /priorityDiagnosticsJson\s+Json\?/);
  assert.match(schema, /priorityVersion\s+String\?/);
  assert.match(schema, /priorityEvaluatedAt\s+DateTime\?/);
  assert.match(
    schema,
    /@@index\(\[propertyId, isVisible, priorityScore\(sort: Desc\), visibleFrom, createdAt\(sort: Desc\), id\]\)/,
  );
});
