const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  buildRadarFeedFilterWhere,
  normalizeRadarFeedFilters,
  radarFeedFilterKey,
} = require('../../src/modules/homeEventRadar/domain/radarFeedFilters');
const {
  listRadarEventsQuerySchema,
} = require('../../src/validators/homeEventRadar.validators');

test('filter query accepts repeated and comma-separated canonical values', () => {
  const parsed = listRadarEventsQuerySchema.parse({
    lifecycle: ['upcoming', 'now,recently_ended'],
    sourceFamily: 'weather,utility',
    severity: ['moderate', 'severe'],
    impact: 'low,high',
    confidence: 'medium,verified',
    state: 'new,saved',
    attention: 'new,updated',
    limit: '25',
  });

  assert.deepEqual(parsed, {
    lifecycle: ['upcoming', 'now', 'recently_ended'],
    sourceFamily: ['weather', 'utility'],
    severity: ['moderate', 'severe'],
    impact: ['low', 'high'],
    confidence: ['medium', 'verified'],
    state: ['new', 'saved'],
    attention: ['new', 'updated'],
    limit: 25,
  });
  assert.equal(listRadarEventsQuerySchema.safeParse({ severity: 'critical' }).success, false);
  assert.equal(listRadarEventsQuerySchema.safeParse({ impact: 'watch' }).success, false);
  assert.equal(listRadarEventsQuerySchema.safeParse({ lifecycle: 'archived' }).success, false);
});

test('normalization deduplicates filters into canonical order and a stable scope key', () => {
  const first = normalizeRadarFeedFilters({
    lifecycle: ['recently_ended', 'now', 'now'],
    sourceFamily: ['utility', 'weather'],
    severity: ['severe', 'low'],
    state: ['saved', 'new'],
  });
  const replay = normalizeRadarFeedFilters({
    state: ['new', 'saved'],
    severity: ['low', 'severe'],
    sourceFamily: ['weather', 'utility'],
    lifecycle: ['now', 'recently_ended'],
  });

  assert.deepEqual(first, replay);
  assert.deepEqual(first, {
    lifecycle: ['now', 'recently_ended'],
    sourceFamily: ['weather', 'utility'],
    severity: ['low', 'severe'],
    impact: [],
    confidence: [],
    state: ['new', 'saved'],
    attention: [],
  });
  assert.equal(radarFeedFilterKey(first), radarFeedFilterKey(replay));
});

test('all filters map to persisted Prisma fields before pagination and counting', () => {
  const filters = normalizeRadarFeedFilters({
    lifecycle: ['now', 'upcoming'],
    sourceFamily: ['weather', 'other'],
    severity: ['moderate', 'severe'],
    impact: ['low', 'high'],
    confidence: ['medium', 'verified'],
    state: ['new', 'saved'],
    attention: ['updated'],
  });
  const where = buildRadarFeedFilterWhere('user-1', filters);

  assert.deepEqual(where.AND[0], { lifecycleStatus: { in: ['now', 'upcoming'] } });
  assert.deepEqual(where.AND[1], { impactLevel: { in: ['watch', 'high'] } });
  assert.deepEqual(where.AND[2], { confidence: { in: ['medium', 'verified'] } });
  assert.deepEqual(where.AND[3], {
    radarEvent: {
      is: {
        severity: { in: ['medium', 'critical'] },
        OR: [
          { sourceDefinition: { is: { family: { in: ['weather', 'other'] } } } },
          { sourceDefinition: { is: null } },
        ],
      },
    },
  });
  assert.deepEqual(where.AND[4], {
    OR: [
      {
        OR: [
          { states: { none: { userId: 'user-1' } } },
          { states: { some: { userId: 'user-1', state: 'new' } } },
        ],
      },
      { states: { some: { userId: 'user-1', state: { in: ['saved'] } } } },
    ],
  });
  assert.deepEqual(where.AND[5], { isMaterialUpdate: true });
});

test('new and updated attention filters use authoritative persisted projections', () => {
  const onlyNew = buildRadarFeedFilterWhere(
    'user-1',
    normalizeRadarFeedFilters({ attention: ['new'] }),
  );
  assert.deepEqual(onlyNew, {
    OR: [
      { states: { none: { userId: 'user-1' } } },
      { states: { some: { userId: 'user-1', state: 'new' } } },
    ],
  });

  const onlyUpdated = buildRadarFeedFilterWhere(
    'user-1',
    normalizeRadarFeedFilters({ attention: ['updated'] }),
  );
  assert.deepEqual(onlyUpdated, { isMaterialUpdate: true });

  const either = buildRadarFeedFilterWhere(
    'user-1',
    normalizeRadarFeedFilters({ attention: ['updated', 'new'] }),
  );
  assert.equal(either.OR[1].isMaterialUpdate, true);
  assert.ok(either.OR[0].OR);
});
