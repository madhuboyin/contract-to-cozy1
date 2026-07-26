const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  configuredRadarPointDistanceMeters,
  explainRadarGeographicMatch,
  listMatchingPropertyIdsForEventPage,
  propertyWhereForRadarEvent,
  radarEventMatchesPropertyId,
  spatialMatchSpecForRadarEvent,
} = require('../../src/modules/homeEventRadar/services/radarMatchDiscovery.service');

test('canonical property and postal scopes map to exact property queries', () => {
  assert.deepEqual(
    propertyWhereForRadarEvent({
      locationType: 'property',
      locationKey: 'property:property-1',
    }),
    { id: 'property-1' },
  );
  assert.deepEqual(
    propertyWhereForRadarEvent({
      locationType: 'postal_code',
      locationKey: 'US:08536',
    }),
    {
      OR: [
        { normalizedZipCode: { startsWith: '08536' } },
        { zipCode: { startsWith: '08536' } },
      ],
    },
  );
  assert.deepEqual(
    propertyWhereForRadarEvent({
      locationType: 'city',
      locationKey: 'NJ:Plainsboro Township',
    }),
    {
      AND: [
        { city: { equals: 'Plainsboro Township', mode: 'insensitive' } },
        { state: { equals: 'NJ', mode: 'insensitive' } },
      ],
    },
  );
  assert.equal(
    propertyWhereForRadarEvent({ locationType: 'city', locationKey: 'Plainsboro Township' }),
    null,
  );
  assert.deepEqual(
    propertyWhereForRadarEvent({ locationType: 'county', locationKey: '34023' }),
    { countyFips: '34023' },
  );
  assert.equal(
    propertyWhereForRadarEvent({ locationType: 'county', locationKey: 'Middlesex' }),
    null,
  );
  assert.equal(
    propertyWhereForRadarEvent({
      locationType: 'polygon',
      locationKey: 'polygon:fingerprint',
    }),
    null,
  );
});

test('property discovery validates revision ownership and returns a resumable bounded page', async () => {
  const calls = [];
  const db = {
    radarEvent: {
      async findUnique() {
        return {
          id: 'event-1',
          status: 'active',
          locationType: 'postal_code',
          locationKey: 'US:08536',
        };
      },
    },
    radarEventRevision: {
      async findUnique() {
        return { radarEventId: 'event-1' };
      },
    },
    property: {
      async findMany(args) {
        calls.push(args);
        return [{ id: 'p-2' }, { id: 'p-3' }, { id: 'p-4' }];
      },
    },
  };

  const result = await listMatchingPropertyIdsForEventPage(
    'event-1',
    'revision-1',
    'p-1',
    2,
    db,
  );

  assert.deepEqual(result, {
    outcome: 'ready',
    propertyIds: ['p-2', 'p-3'],
    nextCursor: 'p-3',
  });
  assert.equal(calls[0].take, 3);
  assert.deepEqual(calls[0].where, {
    AND: [
      {
        OR: [
          { normalizedZipCode: { startsWith: '08536' } },
          { zipCode: { startsWith: '08536' } },
        ],
      },
      { id: { gt: 'p-1' } },
    ],
  });
  assert.deepEqual(calls[0].orderBy, { id: 'asc' });
});

test('missing, mismatched, archived, and unsupported scopes terminate without a property scan', async () => {
  let propertyReads = 0;
  const makeDb = (event, revision) => ({
    radarEvent: { async findUnique() { return event; } },
    radarEventRevision: { async findUnique() { return revision; } },
    property: { async findMany() { propertyReads += 1; return []; } },
  });

  const cases = [
    [null, { radarEventId: 'event-1' }, 'event_not_found'],
    [{ id: 'event-1', status: 'active', locationType: 'zip', locationKey: '08536' }, null, 'revision_not_found'],
    [{ id: 'event-1', status: 'active', locationType: 'zip', locationKey: '08536' }, { radarEventId: 'other' }, 'revision_mismatch'],
    [{ id: 'event-1', status: 'archived', locationType: 'zip', locationKey: '08536' }, { radarEventId: 'event-1' }, 'archived'],
    [{ id: 'event-1', status: 'active', locationType: 'polygon', locationKey: 'polygon:x' }, { radarEventId: 'event-1' }, 'unsupported_geography'],
  ];

  for (const [event, revision, outcome] of cases) {
    const result = await listMatchingPropertyIdsForEventPage(
      'event-1',
      'revision-1',
      undefined,
      100,
      makeDb(event, revision),
    );
    assert.equal(result.outcome, outcome);
  }
  assert.equal(propertyReads, 0);
});

test('point, radius, and polygon discovery use bounded indexed PostGIS queries', async () => {
  const calls = [];
  const makeDb = (event, rows) => ({
    radarEvent: { async findUnique() { return event; } },
    radarEventRevision: { async findUnique() { return { radarEventId: 'event-1' }; } },
    async $queryRawUnsafe(...args) {
      calls.push(args);
      return rows;
    },
  });

  const point = await listMatchingPropertyIdsForEventPage(
    'event-1',
    'revision-1',
    undefined,
    2,
    makeDb({
      id: 'event-1',
      status: 'active',
      locationType: 'point',
      locationKey: 'point:40,-74',
      geoJson: { type: 'Point', coordinates: [-74, 40] },
    }, [{ id: 'p-1' }, { id: 'p-2' }, { id: 'p-3' }]),
  );
  assert.deepEqual(point, {
    outcome: 'ready',
    propertyIds: ['p-1', 'p-2'],
    nextCursor: 'p-2',
  });
  assert.match(calls[0][0], /ST_DWithin/);
  assert.match(calls[0][0], /ORDER BY p\."id" ASC/);
  assert.deepEqual(calls[0].slice(1), [-74, 40, 1000, null, 3]);

  const polygon = await listMatchingPropertyIdsForEventPage(
    'event-1',
    'revision-1',
    'p-1',
    10,
    makeDb({
      id: 'event-1',
      status: 'active',
      locationType: 'polygon',
      locationKey: 'polygon:x',
      geoJson: {
        type: 'Polygon',
        coordinates: [[[-75, 39], [-73, 39], [-73, 41], [-75, 39]]],
      },
    }, [{ id: 'p-2' }]),
  );
  assert.equal(polygon.outcome, 'ready');
  assert.deepEqual(polygon.propertyIds, ['p-2']);
  assert.match(calls[1][0], /ST_Covers/);
  assert.equal(calls[1][2], 'p-1');
  assert.equal(calls[1][3], 11);
});

test('spatial specifications reject malformed evidence and bound point configuration', () => {
  assert.equal(configuredRadarPointDistanceMeters({}), 1000);
  assert.equal(configuredRadarPointDistanceMeters({ RADAR_POINT_MATCH_DISTANCE_METERS: '' }), 1000);
  assert.equal(configuredRadarPointDistanceMeters({ RADAR_POINT_MATCH_DISTANCE_METERS: '0' }), 1);
  assert.equal(
    configuredRadarPointDistanceMeters({ RADAR_POINT_MATCH_DISTANCE_METERS: '999999' }),
    100000,
  );
  assert.deepEqual(
    spatialMatchSpecForRadarEvent({
      locationType: 'radius',
      geoJson: { type: 'Radius', center: [-74, 40], radiusMeters: 2500 },
    }),
    { kind: 'distance', longitude: -74, latitude: 40, distanceMeters: 2500 },
  );
  assert.equal(
    spatialMatchSpecForRadarEvent({
      locationType: 'point',
      geoJson: { type: 'Point', coordinates: [999, 40] },
    }),
    null,
  );
});

test('property-scope revalidation and explanations use canonical property geography', async () => {
  const rawCalls = [];
  const event = {
    locationType: 'polygon',
    locationKey: 'polygon:x',
    geoJson: {
      type: 'Polygon',
      coordinates: [[[-75, 39], [-73, 39], [-73, 41], [-75, 39]]],
    },
  };
  assert.equal(
    await radarEventMatchesPropertyId(event, 'p-1', {
      async $queryRawUnsafe(...args) {
        rawCalls.push(args);
        return [{ id: 'p-1' }];
      },
    }),
    true,
  );
  assert.match(rawCalls[0][0], /p\."id" = \$2/);
  assert.equal(rawCalls[0][2], 'p-1');

  assert.deepEqual(
    explainRadarGeographicMatch(
      event,
      {
        id: 'p-1',
        city: 'Plainsboro',
        state: 'NJ',
        zipCode: '08536',
        countyFips: '34023',
        latitude: 40,
        longitude: -74,
      },
      new Date('2026-07-26T12:00:00.000Z'),
    ),
    {
      matcherVersion: 'geography-v1',
      matchedAt: '2026-07-26T12:00:00.000Z',
      matchType: 'polygon',
      confidence: 'high',
      reasons: [
        "The property's canonical point is inside or on the boundary of the event polygon.",
      ],
      propertyFactsUsed: ['property.locationPoint'],
    },
  );
});
