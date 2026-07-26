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
const {
  decodeRadarFeedCursor,
} = require('../../src/modules/homeEventRadar/domain/radarFeedCursor');

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
    impactFactorsJson: {
      drivers: [{
        code: 'WIND',
        effect: 'increase',
        description: 'Strong wind can affect exposed roof components.',
      }],
      missingFacts: [{
        factKey: 'property.roofReplacementYear',
        reasonCode: 'ROOF_AGE_UNKNOWN',
      }],
    },
    recommendedActionsJson: {
      actions: [{
        code: 'SECURE_OUTDOOR_ITEMS',
        label: 'Secure loose items',
        priority: 'high',
      }],
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
    materialUpdatedAt: null,
    matchExplanationJson: null,
    matcherVersion: 'geo-v1',
    propertyGeographyVersion: 3,
    incident: null,
    taskLinks: [],
    states: [],
    feedback: [],
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
        createdAt: new Date('2026-07-26T11:31:00.000Z'),
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
  const matchFindCalls = [];
  const matchCountCalls = [];
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
      findMany: async (args) => {
        matchFindCalls.push(args);
        return matches;
      },
      findFirst: async () => matches[0] ?? null,
      count: async ({ where }) => {
        matchCountCalls.push(where);
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
    guidanceJourney: {
      findFirst: async () => overrides.guidance ?? null,
    },
  };
  return {
    writes,
    matchFindCalls,
    matchCountCalls,
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
  assert.equal(feed.pageInfo.hasNextPage, true);
  const cursor = decodeRadarFeedCursor(feed.pageInfo.endCursor, {
    propertyId: 'property-1',
    filterKey: JSON.stringify(feed.appliedFilters),
  });
  assert.deepEqual({
    lifecycleStatus: cursor.lifecycleStatus,
    priorityBand: cursor.priorityBand,
    priorityScore: cursor.priorityScore,
    effectiveAt: cursor.effectiveAt,
    id: cursor.id,
    snapshotAt: cursor.snapshotAt,
  }, {
    lifecycleStatus: 'now',
    priorityBand: 'low',
    priorityScore: '12.5',
    effectiveAt: '2026-07-26T14:00:00.000Z',
    id: 'match-1',
    snapshotAt: NOW.toISOString(),
  });
  assert.equal(feed.feedState, 'HAS_EVENTS');
  assert.equal(radarFeedResponseSchema.safeParse(feed).success, true);
});

test('filtered total is authoritative, page-independent, and cursor-bound to filters', async () => {
  const fixture = serviceWith({
    matches: [match(), match({ id: 'match-2' })],
    totalCount: 23,
  });
  const filters = {
    lifecycle: ['now', 'upcoming'],
    sourceFamily: ['weather'],
    severity: ['severe'],
    impact: ['low'],
    confidence: ['medium'],
    state: ['new', 'saved'],
    attention: ['updated'],
  };
  const feed = await fixture.service.listFeed(
    'property-1',
    'user-1',
    { limit: 1, ...filters },
  );

  assert.equal(feed.items.length, 1);
  assert.equal(feed.totalCount, 23);
  assert.deepEqual(feed.appliedFilters, filters);
  assert.deepEqual(fixture.matchFindCalls[0].where.AND[1], fixture.matchCountCalls[0].AND[1]);
  assert.deepEqual(fixture.matchCountCalls[0].AND[1].AND[0], {
    lifecycleStatus: { in: ['now', 'upcoming'] },
  });
  assert.equal(radarFeedResponseSchema.safeParse(feed).success, true);

  await assert.rejects(
    fixture.service.listFeed('property-1', 'user-1', {
      ...filters,
      severity: ['high'],
      cursor: feed.pageInfo.endCursor,
    }),
    (error) => error.code === 'RADAR_CURSOR_INVALID',
  );
});

test('detail is a pure persisted-projection read and exposes revision provenance', async () => {
  const { service, writes } = serviceWith();
  const detail = await service.getDetail('property-1', 'match-1', 'user-1');

  assert.equal(detail.userState, 'new');
  assert.equal(detail.geography.type, 'postal_code');
  assert.equal(detail.sourceEvidence.revisionIdentity, 'revision-identity-1');
  assert.equal(detail.revision.receivedAt, '2026-07-26T11:31:00.000Z');
  assert.equal(detail.recommendedActions[0].code, 'SECURE_OUTDOOR_ITEMS');
  assert.equal(detail.recommendedActions[0].registryVersion, 'radar-actions-v1');
  assert.equal(detail.recommendedActions[0].completionEvidence, 'user_attestation');
  assert.equal(detail.recommendedActions[0].safetyClassification, 'property_protection');
  assert.deepEqual(detail.recommendedActions[0].supportedTaskOperations, [
    'create_task',
    'create_reminder',
    'link_existing_task',
  ]);
  assert.equal(detail.recommendedActions[0].taskLink, null);
  assert.deepEqual(detail.recommendedActions[0].destination, {
    kind: 'informational',
    href: null,
  });
  assert.equal(detail.matchedSystems[0].type, 'roof');
  assert.equal(detail.missingFacts[0].factKey, 'property.roofReplacementYear');
  assert.equal(detail.propertyGeographyVersion, 3);
  assert.equal(detail.matcherVersion, 'geo-v1');
  assert.equal(detail.userFeedback, null);
  assert.deepEqual(writes, []);
  assert.equal(radarDetailResponseSchema.safeParse(detail).success, true);
});

test('detail projects a durable maintenance-task link onto its reviewed action', async () => {
  const linkedMatch = match({
    taskLinks: [{
      id: 'link-1',
      propertyRadarMatchId: 'match-1',
      actionCode: 'SECURE_OUTDOOR_ITEMS',
      linkType: 'create_reminder',
      dueDateSource: 'event_effective',
      dueAt: new Date('2026-07-26T14:00:00.000Z'),
      createdAt: new Date('2026-07-26T12:00:00.000Z'),
      updatedAt: new Date('2026-07-26T12:00:00.000Z'),
      maintenanceTask: {
        id: 'task-1',
        propertyId: 'property-1',
        title: 'Reminder: Secure loose items',
        status: 'PENDING',
        nextDueDate: new Date('2026-07-26T14:00:00.000Z'),
        assignedToUserId: 'user-1',
      },
    }],
  });
  const { service } = serviceWith({ matches: [linkedMatch] });

  const detail = await service.getDetail('property-1', 'match-1', 'user-1');

  assert.equal(detail.recommendedActions[0].taskLink.task.id, 'task-1');
  assert.equal(detail.recommendedActions[0].taskLink.operation, 'create_reminder');
  assert.match(
    detail.recommendedActions[0].taskLink.task.href,
    /radarMatchId=match-1/,
  );
  assert.equal(radarDetailResponseSchema.safeParse(detail).success, true);
});

test('detail omits unreviewed action codes instead of projecting persisted links', async () => {
  const unsafeMatch = match({
    recommendedActionsJson: {
      actions: [{
        code: 'UNREVIEWED_ACTION',
        label: 'Open unreviewed destination',
        priority: 'high',
        href: 'javascript:alert(1)',
        destination: { kind: 'external', href: 'https://untrusted.example' },
      }],
    },
  });
  const { service } = serviceWith({ matches: [unsafeMatch] });
  const detail = await service.getDetail('property-1', 'match-1', 'user-1');

  assert.deepEqual(detail.recommendedActions, []);
  assert.equal(radarDetailResponseSchema.safeParse(detail).success, true);
});

test('detail projects only the current homeowner feedback contract', async () => {
  const feedback = {
    id: 'feedback-1',
    userId: 'user-1',
    feedbackType: 'wrong_location',
    note: 'The provider area is across the county line.',
    metadataJson: { internal: 'must not leak' },
    createdAt: new Date('2026-07-26T11:50:00.000Z'),
    updatedAt: new Date('2026-07-26T11:55:00.000Z'),
  };
  const { service } = serviceWith({
    matches: [match({ feedback: [feedback] })],
  });

  const detail = await service.getDetail('property-1', 'match-1', 'user-1');

  assert.deepEqual(detail.userFeedback, {
    feedbackType: 'wrong_location',
    comment: 'The provider area is across the county line.',
    createdAt: '2026-07-26T11:50:00.000Z',
    updatedAt: '2026-07-26T11:55:00.000Z',
  });
  assert.equal(radarDetailResponseSchema.safeParse(detail).success, true);
});

test('detail projects related Incident and Guidance without mutating either system', async () => {
  const linked = match({
    incident: {
      id: 'incident-1',
      status: 'ACTIVE',
      title: 'Wind preparation',
      summary: 'Prepare exposed areas.',
      updatedAt: new Date('2026-07-26T11:40:00.000Z'),
    },
  });
  const { service, writes } = serviceWith({
    matches: [linked],
    guidance: {
      id: 'journey-1',
      status: 'ACTIVE',
      currentStepKey: 'secure-outdoor-items',
      updatedAt: new Date('2026-07-26T11:42:00.000Z'),
    },
  });

  const detail = await service.getDetail('property-1', 'match-1', 'user-1');

  assert.equal(detail.relatedIncident.id, 'incident-1');
  assert.equal(detail.relatedGuidance.id, 'journey-1');
  assert.match(detail.relatedIncident.href, /incidents\/incident-1$/);
  assert.match(detail.relatedGuidance.href, /journeyId=journey-1$/);
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

  assert.deepEqual(capturedWhere.AND[1].states, {
    some: { userId: 'user-1', state: { in: ['saved'] } },
  });
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
    '/radar/events/:matchId/state',
    '/radar/events/:matchId/feedback',
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
  assert.equal(listRadarEventsRequestSchema.safeParse({
    body: {},
    query: { cursor: 'not a base64url cursor' },
    params: { propertyId: 'property-1' },
  }).success, false);
});
