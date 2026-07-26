const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

const {
  RadarQueryService,
} = require('../../src/modules/homeEventRadar/services/radarQuery.service');
const {
  radarOverviewResponseSchema,
  radarFeedResponseSchema,
  radarDetailResponseSchema,
} = require('../../src/modules/homeEventRadar/contracts/radar.contracts');
const {
  listRadarEventsRequestSchema,
  listRadarStateViewRequestSchema,
} = require('../../src/validators/homeEventRadar.validators');

const NOW = new Date('2026-07-26T12:00:00.000Z');

function property(overrides = {}) {
  return {
    id: 'property-1',
    address: '94 Ashford Dr',
    city: 'Plainsboro',
    state: 'NJ',
    zipCode: '08536',
    normalizedZipCode: '08536',
    latitude: 40.33,
    longitude: -74.58,
    county: 'Middlesex',
    countyFips: '34023',
    geocodingStatus: 'VERIFIED',
    geographyVersion: 3,
    ...overrides,
  };
}

function coverageRow(status = 'covered', family = 'weather', overrides = {}) {
  return {
    id: `coverage-${family}`,
    propertyId: 'property-1',
    sourceDefinitionId: `source-${family}`,
    status,
    propertyGeographyVersion: 3,
    evaluatedAt: new Date('2026-07-26T11:55:00.000Z'),
    dataFreshThrough: new Date('2026-07-26T11:50:00.000Z'),
    detail: `${family} coverage ${status}`,
    sourceDefinition: {
      id: `source-${family}`,
      name: `${family} source`,
      family,
      provider: 'Test provider',
      isEnabled: true,
      health: {
        status: status === 'failed' ? 'failed' : 'healthy',
        lastSuccessAt: new Date('2026-07-26T11:45:00.000Z'),
        dataFreshThrough: new Date('2026-07-26T11:50:00.000Z'),
      },
    },
    ...overrides,
  };
}

function match(overrides = {}) {
  return {
    id: 'match-1',
    propertyId: 'property-1',
    impactLevel: 'watch',
    impactSummary: 'Protect outdoor equipment.',
    impactFactorsJson: { drivers: [{ code: 'WIND' }] },
    recommendedActionsJson: {
      actions: [{ code: 'SECURE', label: 'Secure loose items', priority: 'high' }],
    },
    matchedSystemsJson: {
      systems: [{ type: 'roof', relevance: 'high' }],
    },
    confidence: 'medium',
    priorityBand: 'low',
    priorityScore: 12.5,
    lifecycleStatus: 'now',
    sourceFreshnessStatus: 'fresh',
    sourceFreshnessReason: 'SOURCE_WITHIN_FRESHNESS_WINDOW',
    isMaterialUpdate: false,
    matchExplanationJson: null,
    states: [],
    radarEvent: {
      id: 'event-1',
      eventType: 'wind',
      title: 'Wind advisory',
      summary: 'Strong wind is expected.',
      severity: 'critical',
      sourceType: 'weather_provider',
      providerEventId: 'provider-event-1',
      providerRevision: 'revision-1',
      startAt: new Date('2026-07-26T14:00:00.000Z'),
      endAt: new Date('2026-07-26T20:00:00.000Z'),
      status: 'active',
      observedAt: new Date('2026-07-26T11:30:00.000Z'),
      canonicalUrl: 'https://example.test/event-1',
      locationType: 'zip',
      locationKey: '08536',
      sourceDefinition: {
        family: 'weather',
        name: 'NWS',
        provider: 'National Weather Service',
      },
      revisions: [{
        id: 'event-revision-1',
        revisionIdentity: 'revision-identity-1',
        providerRevision: 'revision-1',
        lifecycleStatus: 'updated',
        effectiveAt: new Date('2026-07-26T14:00:00.000Z'),
        expiresAt: new Date('2026-07-26T20:00:00.000Z'),
        observedAt: new Date('2026-07-26T11:30:00.000Z'),
        normalizedJson: {
          geography: { type: 'postal_code', countryCode: 'US', postalCode: '08536' },
        },
      }],
    },
    ...overrides,
  };
}

function serviceWith(overrides = {}) {
  const writes = [];
  const coverageRows = overrides.coverageRows ?? [coverageRow()];
  const matches = overrides.matches ?? [match()];
  const db = {
    property: {
      findUnique: async () => overrides.property ?? property(),
    },
    propertyRadarCoverage: {
      findMany: async () => coverageRows,
    },
    propertyRadarMatch: {
      findMany: async () => matches,
      findFirst: async () => matches[0] ?? null,
      count: async ({ where }) => {
        if (where.lifecycleStatus === 'now') return 4;
        if (where.lifecycleStatus === 'upcoming') return 2;
        if (where.lifecycleStatus === 'recently_ended') return 1;
        return overrides.totalCount ?? matches.length;
      },
      create: async (args) => writes.push(['match.create', args]),
      update: async (args) => writes.push(['match.update', args]),
    },
    propertyRadarState: {
      count: async ({ where }) => {
        if (where.state === 'saved') return 2;
        if (where.state === 'dismissed') return 1;
        if (where.state?.not === 'new') return 3;
        return 0;
      },
      upsert: async (args) => writes.push(['state.upsert', args]),
      create: async (args) => writes.push(['state.create', args]),
      update: async (args) => writes.push(['state.update', args]),
    },
    propertyRadarAction: {
      create: async (args) => writes.push(['action.create', args]),
    },
  };
  return {
    writes,
    db,
    service: new RadarQueryService({
      db,
      now: () => NOW,
      loadPropertyContext: async (propertyId) => ({
        propertyId,
        contextVersion: 'context-v3',
        decisions: { eventRadar: { status: 'APPLICABLE' } },
      }),
    }),
  };
}

test('overview returns authoritative lifecycle/user counts and materialized coverage', async () => {
  const { service } = serviceWith({ totalCount: 10 });
  const overview = await service.getOverview('property-1', 'user-1');

  assert.equal(overview.monitoringState, 'ACTIVE');
  assert.equal(overview.lastSuccessfulCheckAt, '2026-07-26T11:45:00.000Z');
  assert.deepEqual(overview.counts, {
    active: 4,
    new: 7,
    upcoming: 2,
    recentlyEnded: 1,
    saved: 2,
    dismissed: 1,
  });
  assert.equal(overview.coverage[0].family, 'weather');
  assert.equal(overview.propertyContext.contextVersion, 'context-v3');
  assert.equal(radarOverviewResponseSchema.safeParse(overview).success, true);
});

test('monitoring state distinguishes setup, uncovered, partial, and degraded projections', async () => {
  const cases = [
    { expected: 'SETUP_NEEDED', property: property({ latitude: null, longitude: null, state: '', city: '', zipCode: '', normalizedZipCode: null, countyFips: null }), rows: [] },
    { expected: 'UNCOVERED', rows: [coverageRow('not_covered')] },
    { expected: 'PARTIAL', rows: [coverageRow('covered'), coverageRow('not_covered', 'tax')] },
    { expected: 'DEGRADED', rows: [coverageRow('covered'), coverageRow('stale', 'utility')] },
  ];

  for (const scenario of cases) {
    const { service } = serviceWith({
      property: scenario.property,
      coverageRows: scenario.rows,
    });
    const coverage = await service.getCoverage('property-1');
    assert.equal(coverage.monitoringState, scenario.expected);
  }
});

test('feed uses persisted priority and freshness and reports total independently of the page', async () => {
  const persisted = match();
  const { service } = serviceWith({
    matches: [persisted, match({ id: 'match-2' })],
    totalCount: 9,
  });
  const feed = await service.listFeed('property-1', 'user-1', { limit: 1 });

  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0].priorityScore, 12.5);
  assert.equal(feed.items[0].priorityBand, 'low');
  assert.equal(feed.items[0].severity, 'severe');
  assert.equal(feed.items[0].sourceFreshnessStatus, 'fresh');
  assert.equal(feed.totalCount, 9);
  assert.deepEqual(feed.pageInfo, { hasNextPage: true, endCursor: 'match-1' });
  assert.equal(feed.feedState, 'HAS_EVENTS');
  assert.equal(radarFeedResponseSchema.safeParse(feed).success, true);
});

test('detail is a pure persisted-projection read and exposes revision provenance', async () => {
  const { service, writes } = serviceWith();
  const detail = await service.getDetail('property-1', 'match-1', 'user-1');

  assert.equal(detail.userState, 'new');
  assert.equal(detail.geography.type, 'postal_code');
  assert.equal(detail.sourceEvidence.revisionIdentity, 'revision-identity-1');
  assert.equal(detail.recommendedActions[0].code, 'SECURE');
  assert.equal(detail.matchedSystems[0].type, 'roof');
  assert.deepEqual(writes, []);
  assert.equal(radarDetailResponseSchema.safeParse(detail).success, true);
});

test('state views apply server-side user-state predicates', async () => {
  let capturedWhere;
  const fixture = serviceWith();
  fixture.db.propertyRadarMatch.findMany = async ({ where }) => {
    capturedWhere = where;
    return [];
  };

  const result = await fixture.service.getStateView(
    'property-1',
    'user-1',
    'saved',
    { limit: 20 },
  );

  assert.deepEqual(capturedWhere.states, { some: { userId: 'user-1', state: 'saved' } });
  assert.equal(result.feedState, 'HAS_EVENTS');
});

test('canonical homeowner endpoints are wired without replacing legacy compatibility routes', () => {
  const routes = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/homeEventRadar.routes.ts'),
    'utf8',
  );
  for (const route of [
    '/radar/overview',
    '/radar/coverage',
    '/radar/counts',
    '/radar/events',
    '/radar/events/:matchId',
    '/radar/states/:state',
    '/radar/feed',
    '/radar/matches/:matchId',
  ]) {
    assert.match(routes, new RegExp(route.replace(/[/:]/g, '\\$&')));
  }

  const querySource = fs.readFileSync(
    path.resolve(__dirname, '../../src/modules/homeEventRadar/services/radarQuery.service.ts'),
    'utf8',
  );
  assert.doesNotMatch(querySource, /computeRadarPriority|evaluateRadarSourceFreshness|triggerMatching/);
  assert.doesNotMatch(querySource, /propertyRadarState\.(upsert|create|update)/);
  assert.doesNotMatch(querySource, /propertyRadarAction\.create/);
});

test('canonical list and state-view requests validate real query and path values', () => {
  assert.equal(listRadarEventsRequestSchema.safeParse({
    body: {},
    query: { limit: '20', state: 'saved' },
    params: { propertyId: 'property-1' },
  }).success, true);
  assert.equal(listRadarEventsRequestSchema.safeParse({
    body: {},
    query: { limit: '101' },
    params: { propertyId: 'property-1' },
  }).success, false);
  assert.equal(listRadarStateViewRequestSchema.safeParse({
    body: {},
    query: {},
    params: { propertyId: 'property-1', state: 'invented' },
  }).success, false);
});
