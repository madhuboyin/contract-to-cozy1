const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  RADAR_FEED_CURSOR_VERSION,
  buildRadarFeedCursorWhere,
  compareRadarFeedOrdering,
  decodeRadarFeedCursor,
  encodeRadarFeedCursor,
  isRadarFeedTupleAfter,
} = require('../../src/modules/homeEventRadar/domain/radarFeedCursor');
const {
  RadarQueryService,
} = require('../../src/modules/homeEventRadar/services/radarQuery.service');

const SNAPSHOT = '2026-07-26T12:00:00.000Z';
const EMPTY_FILTER_KEY = JSON.stringify({
  lifecycle: [],
  sourceFamily: [],
  severity: [],
  impact: [],
  confidence: [],
  state: [],
  attention: [],
});
const SCOPE = { propertyId: 'property-1', filterKey: EMPTY_FILTER_KEY };

function tuple(id, overrides = {}) {
  return {
    lifecycleStatus: 'now',
    priorityBand: 'high',
    priorityScore: '70.000',
    effectiveAt: '2026-07-26T10:00:00.000Z',
    id,
    ...overrides,
  };
}

test('cursor round-trips every ordering column, snapshot, and feed scope', () => {
  const ordering = tuple('match-9');
  const encoded = encodeRadarFeedCursor(ordering, SCOPE, SNAPSHOT);
  const decoded = decodeRadarFeedCursor(encoded, SCOPE);

  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decoded, {
    version: RADAR_FEED_CURSOR_VERSION,
    propertyId: 'property-1',
    filterKey: EMPTY_FILTER_KEY,
    snapshotAt: SNAPSHOT,
    ...ordering,
  });
});

test('cursor rejects malformed, unsupported, and cross-feed payloads', () => {
  const encoded = encodeRadarFeedCursor(tuple('match-9'), SCOPE, SNAPSHOT);
  assert.throws(
    () => decodeRadarFeedCursor(encoded, { propertyId: 'property-2', filterKey: EMPTY_FILTER_KEY }),
    /does not belong/,
  );
  assert.throws(
    () => decodeRadarFeedCursor(encoded, { propertyId: 'property-1', filterKey: '{"state":["saved"]}' }),
    /does not belong/,
  );
  assert.throws(() => decodeRadarFeedCursor('not-json', SCOPE), /payload is invalid/);

  const unsupported = Buffer.from(JSON.stringify({
    v: 99,
    r: 'property-1',
    q: EMPTY_FILTER_KEY,
    a: SNAPSHOT,
    l: 'now',
    b: 'high',
    p: '70',
    e: SNAPSHOT,
    i: 'match-1',
  })).toString('base64url');
  assert.throws(() => decodeRadarFeedCursor(unsupported, SCOPE), /version is unsupported/);
});

test('ordering is lifecycle, band, score, effective time, then ID', () => {
  const candidates = [
    tuple('recent', { lifecycleStatus: 'recently_ended', priorityBand: 'urgent', priorityScore: '99' }),
    tuple('upcoming', { lifecycleStatus: 'upcoming', priorityBand: 'urgent', priorityScore: '99' }),
    tuple('low-band', { priorityBand: 'medium', priorityScore: '99' }),
    tuple('low-score', { priorityScore: '65' }),
    tuple('older', { effectiveAt: '2026-07-26T09:00:00.000Z' }),
    tuple('id-a', { id: 'match-a' }),
    tuple('id-z', { id: 'match-z' }),
    tuple('urgent', { priorityBand: 'urgent', priorityScore: '80' }),
  ];

  assert.deepEqual(candidates.sort(compareRadarFeedOrdering).map((item) => item.id), [
    'urgent',
    'match-z',
    'match-a',
    'older',
    'low-score',
    'low-band',
    'upcoming',
    'recent',
  ]);
});

test('keyset boundary includes every lower tuple and excludes prior/equal tuples', () => {
  const cursor = tuple('match-m');
  const cases = [
    [tuple('higher-band', { priorityBand: 'urgent' }), false],
    [tuple('higher-score', { priorityScore: '71' }), false],
    [tuple('newer', { effectiveAt: '2026-07-26T11:00:00.000Z' }), false],
    [tuple('same-id', { id: 'match-m' }), false],
    [tuple('lower-id', { id: 'match-a' }), true],
    [tuple('older', { effectiveAt: '2026-07-26T09:00:00.000Z' }), true],
    [tuple('lower-score', { priorityScore: '69' }), true],
    [tuple('lower-band', { priorityBand: 'medium', priorityScore: '99' }), true],
    [tuple('upcoming', { lifecycleStatus: 'upcoming', priorityBand: 'urgent', priorityScore: '99' }), true],
  ];
  for (const [candidate, expected] of cases) {
    assert.equal(isRadarFeedTupleAfter(candidate, cursor), expected, candidate.id);
  }

  const where = buildRadarFeedCursorWhere({
    version: RADAR_FEED_CURSOR_VERSION,
    propertyId: 'property-1',
    filterKey: EMPTY_FILTER_KEY,
    snapshotAt: SNAPSHOT,
    ...cursor,
  });
  assert.equal(where.OR.length, 5);
  assert.deepEqual(where.OR[0], {
    lifecycleStatus: { in: ['upcoming', 'recently_ended'] },
  });
});

test('snapshot concurrency fixture has no duplicate or skipped baseline records', () => {
  const baseline = [
    tuple('match-f', { priorityBand: 'urgent', priorityScore: '90' }),
    tuple('match-e', { priorityScore: '80' }),
    tuple('match-d', { priorityScore: '70' }),
    tuple('match-c', { priorityScore: '60' }),
    tuple('match-b', { lifecycleStatus: 'upcoming', priorityScore: '90' }),
    tuple('match-a', { lifecycleStatus: 'recently_ended', priorityScore: '90' }),
  ].map((ordering) => ({ ordering, createdAt: '2026-07-26T11:00:00.000Z' }));
  const sorted = [...baseline].sort((left, right) =>
    compareRadarFeedOrdering(left.ordering, right.ordering));
  const firstPage = sorted.slice(0, 3);
  const boundary = firstPage.at(-1).ordering;

  const concurrentBeforeBoundary = {
    ordering: tuple('match-new-before', { priorityBand: 'urgent', priorityScore: '95' }),
    createdAt: '2026-07-26T12:00:01.000Z',
  };
  const concurrentAfterBoundary = {
    ordering: tuple('match-new-after', { lifecycleStatus: 'upcoming', priorityScore: '20' }),
    createdAt: '2026-07-26T12:00:02.000Z',
  };
  const secondPage = [...baseline, concurrentBeforeBoundary, concurrentAfterBoundary]
    .filter((candidate) => candidate.createdAt <= SNAPSHOT)
    .filter((candidate) => isRadarFeedTupleAfter(candidate.ordering, boundary))
    .sort((left, right) => compareRadarFeedOrdering(left.ordering, right.ordering));

  const combinedIds = [...firstPage, ...secondPage].map((item) => item.ordering.id);
  assert.deepEqual(combinedIds, sorted.map((item) => item.ordering.id));
  assert.equal(new Set(combinedIds).size, baseline.length);
});

test('query service applies exact database ordering and reuses cursor snapshot', async () => {
  const calls = [];
  const firstMatch = {
    id: 'match-1',
    propertyId: 'property-1',
    lifecycleStatus: 'now',
    priorityBand: 'high',
    priorityScore: '70.000',
    radarEvent: {
      id: 'event-1',
      eventType: 'wind',
      title: 'Wind',
      summary: 'Wind',
      severity: 'high',
      sourceType: 'weather_provider',
      status: 'active',
      startAt: new Date('2026-07-26T10:00:00.000Z'),
      endAt: null,
      sourceDefinition: { family: 'weather', name: 'NWS', provider: 'NWS' },
      revisions: [],
    },
    impactLevel: 'moderate',
    confidence: 'high',
    sourceFreshnessStatus: 'fresh',
    sourceFreshnessReason: null,
    isMaterialUpdate: false,
    states: [],
  };
  const db = {
    property: { findUnique: async () => ({
      id: 'property-1',
      address: '1 Main St',
      city: 'Town',
      state: 'NJ',
      zipCode: '08536',
      normalizedZipCode: '08536',
      latitude: 40,
      longitude: -74,
      county: null,
      countyFips: null,
      geocodingStatus: 'VERIFIED',
      geographyVersion: 1,
    }) },
    propertyRadarCoverage: { findMany: async () => [] },
    propertyRadarMatch: {
      findMany: async (args) => {
        calls.push(args);
        return calls.length === 1 ? [firstMatch] : [];
      },
      count: async () => 1,
    },
    propertyRadarState: { count: async () => 0 },
  };
  const service = new RadarQueryService({ db, now: () => new Date(SNAPSHOT) });
  const first = await service.listFeed('property-1', 'user-1', { limit: 1 });
  assert.equal(first.pageInfo.hasNextPage, false);
  assert.ok(first.pageInfo.endCursor);
  await service.listFeed('property-1', 'user-1', {
    limit: 1,
    cursor: first.pageInfo.endCursor,
  });

  assert.deepEqual(calls[0].orderBy, [
    { lifecycleStatus: 'asc' },
    { priorityBand: 'desc' },
    { priorityScore: 'desc' },
    { radarEvent: { startAt: 'desc' } },
    { id: 'desc' },
  ]);
  assert.equal(calls[1].where.AND[0].createdAt.lte.toISOString(), SNAPSHOT);
  assert.ok(calls[1].where.AND[1].OR);
});

test('query service returns a stable client error for an invalid cursor', async () => {
  const service = new RadarQueryService({
    db: {
      property: {
        findUnique: async () => ({
          id: 'property-1',
          state: 'NJ',
          zipCode: '08536',
          normalizedZipCode: '08536',
          geographyVersion: 1,
        }),
      },
    },
  });

  await assert.rejects(
    service.listFeed('property-1', 'user-1', { cursor: 'not-json' }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, 'RADAR_CURSOR_INVALID');
      return true;
    },
  );
});
