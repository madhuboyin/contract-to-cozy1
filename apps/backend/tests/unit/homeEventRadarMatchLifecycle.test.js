const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

const {
  detectRadarMaterialUpdate,
  evaluateRadarMatchLifecycle,
  evaluateRadarSourceFreshness,
  RADAR_MATCH_LIFECYCLE_VERSION,
} = require('../../src/modules/homeEventRadar/domain/radarMatchLifecycle');

const NOW = new Date('2026-07-26T12:00:00.000Z');

function event(overrides = {}) {
  return {
    status: 'active',
    startAt: '2026-07-26T10:00:00.000Z',
    endAt: '2026-07-26T18:00:00.000Z',
    observedAt: '2026-07-26T11:55:00.000Z',
    resolvedAt: null,
    expiredAt: null,
    retractedAt: null,
    updatedAt: '2026-07-26T11:55:00.000Z',
    sourceDefinition: {
      isEnabled: true,
      freshnessSeconds: 3_600,
      health: {
        status: 'healthy',
        lastSuccessAt: '2026-07-26T11:55:00.000Z',
        dataFreshThrough: '2026-07-26T11:50:00.000Z',
      },
    },
    sourceRun: {
      status: 'success',
      finishedAt: '2026-07-26T11:55:00.000Z',
      dataFreshThrough: '2026-07-26T11:50:00.000Z',
    },
    ...overrides,
  };
}

function revision(id, overrides = {}) {
  return {
    id,
    lifecycleStatus: 'active',
    eventType: 'hail',
    severity: 'high',
    effectiveAt: '2026-07-26T10:00:00.000Z',
    expiresAt: '2026-07-26T18:00:00.000Z',
    title: 'Hail warning',
    summary: 'Hail may affect the property.',
    geography: {
      type: 'postal_code',
      countryCode: 'US',
      postalCode: '08536',
    },
    ...overrides,
  };
}

function evaluate(overrides = {}) {
  return evaluateRadarMatchLifecycle({
    event: event(),
    geographicallyApplicable: true,
    existing: { exists: false },
    currentRevision: revision('revision-1'),
    previousRevision: null,
    ...overrides,
  }, NOW);
}

test('active, future, and terminal events map to homeowner lifecycle groups', () => {
  const active = evaluate();
  const upcoming = evaluate({
    event: event({
      startAt: '2026-07-27T10:00:00.000Z',
      endAt: '2026-07-27T18:00:00.000Z',
    }),
  });
  const ended = evaluate({
    event: event({
      status: 'resolved',
      resolvedAt: '2026-07-26T11:30:00.000Z',
    }),
  });

  assert.equal(active.version, RADAR_MATCH_LIFECYCLE_VERSION);
  assert.equal(active.status, 'now');
  assert.equal(active.isVisible, true);
  assert.equal(upcoming.status, 'upcoming');
  assert.equal(upcoming.isVisible, true);
  assert.equal(ended.status, 'recently_ended');
  assert.equal(ended.isVisible, true);
  assert.equal(
    ended.visibleUntil.toISOString(),
    '2026-07-29T11:30:00.000Z',
  );
});

test('terminal history becomes non-visible after the bounded 72-hour window', () => {
  const result = evaluate({
    event: event({
      status: 'expired',
      expiredAt: '2026-07-20T12:00:00.000Z',
    }),
  });
  assert.equal(result.status, 'recently_ended');
  assert.equal(result.isVisible, false);
  assert.equal(result.reasonCode, 'EVENT_EXPIRED');
});

test('geography loss hides the match immediately and records an explicit reason', () => {
  const result = evaluate({
    geographicallyApplicable: false,
    existing: {
      exists: true,
      visibleFrom: '2026-07-25T12:00:00.000Z',
    },
  });
  assert.equal(result.status, 'no_longer_applicable');
  assert.equal(result.reasonCode, 'GEOGRAPHY_NO_LONGER_APPLIES');
  assert.equal(result.isVisible, false);
  assert.equal(result.visibleUntil.toISOString(), NOW.toISOString());
  assert.equal(result.noLongerApplicableAt.toISOString(), NOW.toISOString());
  assert.equal(
    result.visibleFrom.toISOString(),
    '2026-07-25T12:00:00.000Z',
  );
});

test('source freshness is independent from event lifecycle and never implies clear', () => {
  const stale = evaluate({
    event: event({
      observedAt: '2026-07-26T08:00:00.000Z',
      sourceDefinition: {
        isEnabled: true,
        freshnessSeconds: 3_600,
        health: {
          status: 'failed',
          lastSuccessAt: '2026-07-26T08:00:00.000Z',
          dataFreshThrough: '2026-07-26T08:00:00.000Z',
        },
      },
      sourceRun: null,
    }),
  });
  const recentFailure = evaluate({
    event: event({
      sourceDefinition: {
        isEnabled: true,
        freshnessSeconds: 3_600,
        health: {
          status: 'failed',
          lastSuccessAt: '2026-07-26T11:55:00.000Z',
          dataFreshThrough: '2026-07-26T11:50:00.000Z',
        },
      },
    }),
  });
  const unknown = evaluate({
    event: event({ sourceDefinition: null, sourceRun: null }),
  });

  assert.equal(stale.status, 'now');
  assert.equal(stale.sourceFreshnessStatus, 'stale');
  assert.equal(stale.sourceFreshnessReason, 'SOURCE_FRESHNESS_WINDOW_EXCEEDED');
  assert.equal(recentFailure.sourceFreshnessStatus, 'fresh');
  assert.equal(recentFailure.sourceFreshnessReason, 'SOURCE_LAST_SUCCESS_STILL_FRESH');
  assert.equal(unknown.sourceFreshnessStatus, 'unknown');
});

test('source freshness can be recomputed at read time without rematching', () => {
  const sourceEvent = event();
  assert.equal(
    evaluateRadarSourceFreshness(
      sourceEvent,
      new Date('2026-07-26T12:30:00.000Z'),
    ).status,
    'fresh',
  );
  assert.deepEqual(
    evaluateRadarSourceFreshness(
      sourceEvent,
      new Date('2026-07-26T14:00:00.000Z'),
    ),
    {
      status: 'stale',
      reason: 'SOURCE_FRESHNESS_WINDOW_EXCEEDED',
    },
  );
});

test('material changes are narrower than immutable revision changes', () => {
  const previous = revision('revision-1');
  const nonMaterial = detectRadarMaterialUpdate(
    previous,
    revision('revision-2', { lifecycleStatus: 'updated' }),
  );
  assert.deepEqual(nonMaterial, {
    isMaterialUpdate: false,
    reasonCodes: [],
  });

  const changed = detectRadarMaterialUpdate(previous, revision('revision-2', {
    lifecycleStatus: 'resolved',
    severity: 'critical',
    effectiveAt: '2026-07-26T09:00:00.000Z',
    expiresAt: '2026-07-27T00:00:00.000Z',
    title: 'Extreme hail warning',
    summary: 'Large hail is expected.',
    geography: {
      type: 'postal_code',
      countryCode: 'US',
      postalCode: '08540',
    },
  }));
  assert.equal(changed.isMaterialUpdate, true);
  assert.deepEqual(changed.reasonCodes, [
    'LIFECYCLE_CHANGED',
    'SEVERITY_CHANGED',
    'EFFECTIVE_TIME_CHANGED',
    'EXPIRATION_CHANGED',
    'TITLE_CHANGED',
    'SUMMARY_CHANGED',
    'GEOGRAPHY_CHANGED',
  ]);
});

test('a newly processed material revision records time and replay preserves it', () => {
  const current = revision('revision-2', { severity: 'critical' });
  const first = evaluate({
    existing: {
      exists: true,
      lastEventRevisionId: 'revision-1',
    },
    currentRevision: current,
    previousRevision: revision('revision-1'),
  });
  assert.equal(first.isMaterialUpdate, true);
  assert.deepEqual(first.materialReasonCodes, ['SEVERITY_CHANGED']);
  assert.equal(first.materialUpdatedAt.toISOString(), NOW.toISOString());

  const replay = evaluate({
    existing: {
      exists: true,
      lastEventRevisionId: 'revision-2',
      isMaterialUpdate: true,
      materialUpdatedAt: NOW,
    },
    currentRevision: current,
    previousRevision: current,
  });
  assert.equal(replay.isMaterialUpdate, true);
  assert.deepEqual(replay.materialReasonCodes, ['REVISION_ALREADY_EVALUATED']);
  assert.equal(replay.materialUpdatedAt.toISOString(), NOW.toISOString());
});

test('initial matches and missing baselines never manufacture material updates', () => {
  const initial = evaluate();
  const missing = evaluate({
    existing: {
      exists: true,
      lastEventRevisionId: null,
    },
    currentRevision: revision('revision-2', { severity: 'critical' }),
    previousRevision: null,
  });
  assert.equal(initial.isMaterialUpdate, false);
  assert.deepEqual(initial.materialReasonCodes, ['INITIAL_MATCH']);
  assert.equal(missing.isMaterialUpdate, false);
  assert.deepEqual(missing.materialReasonCodes, ['MATERIAL_BASELINE_UNKNOWN']);
});

test('pure lifecycle module has no database or service dependency', () => {
  const source = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../src/modules/homeEventRadar/domain/radarMatchLifecycle.ts',
    ),
    'utf8',
  );
  assert.doesNotMatch(source, /from ['"].*(prisma|service|repository|client)/i);
  assert.doesNotMatch(source, /\bprisma\b|\$queryRaw|findMany|findUnique/);
  assert.throws(
    () => evaluateRadarMatchLifecycle({
      event: event(),
      geographicallyApplicable: true,
      existing: { exists: false },
    }, new Date('invalid')),
    /evaluation time must be valid/,
  );
});

test('matcher owns persisted lifecycle, stale markers, and inapplicability closure', () => {
  const matcher = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/homeEventRadarMatcher.service.ts'),
    'utf8',
  );
  const bridge = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../src/modules/homeEventRadar/services/radarIncidentPromotion.service.ts',
    ),
    'utf8',
  );
  assert.match(matcher, /evaluateRadarMatchLifecycle\(/);
  assert.match(matcher, /lifecycleStatus: lifecycle\.status/);
  assert.match(matcher, /sourceFreshnessStatus: lifecycle\.sourceFreshnessStatus/);
  assert.match(matcher, /lastEventRevisionId: currentRevision\?\.id/);
  assert.match(matcher, /if \(!geographicallyApplicable\)/);
  assert.match(matcher, /lifecycleStatus: 'no_longer_applicable'/);
  assert.match(bridge, /input\.match\.lifecycleStatus === 'no_longer_applicable'/);
});

test('durable discovery unions current candidates with prior matches', () => {
  const source = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../src/modules/homeEventRadar/services/radarMatchDiscovery.service.ts',
    ),
    'utf8',
  );
  assert.match(source, /radarMatches:\s*\{\s*some:\s*\{\s*radarEventId: eventId/s);
  assert.match(source, /currentlyEligible, previouslyMatched/);
  assert.match(source, /mergePropertyIdPages/);
  assert.match(source, /TERMINAL_EVENT_STATUSES/);
});

test('homeowner serializers expose lifecycle and stale marker without raw internals', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/homeEventRadar.service.ts'),
    'utf8',
  );
  assert.match(source, /matchLifecycleStatus: match\.lifecycleStatus/);
  assert.match(source, /evaluateRadarSourceFreshness\(/);
  assert.match(source, /isSourceStale: match\.sourceFreshnessStatus === 'stale'/);
  assert.match(source, /isMaterialUpdate: match\.isMaterialUpdate/);
  assert.doesNotMatch(source, /materialReasonCodes: match/);
});

test('Prisma stores explicit lifecycle and revision lineage without a migration', () => {
  const schema = fs.readFileSync(
    path.resolve(__dirname, '../../prisma/schema.prisma'),
    'utf8',
  );
  assert.match(schema, /lifecycleStatus\s+RadarMatchLifecycleStatus\s+@default\(now\)/);
  assert.match(schema, /sourceFreshnessStatus\s+RadarSourceFreshnessStatus\s+@default\(unknown\)/);
  assert.match(schema, /isMaterialUpdate\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /lastEventRevisionId\s+String\?/);
  assert.match(schema, /noLongerApplicableAt\s+DateTime\?/);
  assert.match(schema, /@@index\(\[propertyId, lifecycleStatus, isVisible\]\)/);
});
