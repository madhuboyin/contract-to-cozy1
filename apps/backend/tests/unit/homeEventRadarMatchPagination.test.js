const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  listMatchingPropertyIdsForEventPage,
  propertyWhereForRadarEvent,
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
        { normalizedZipCode: '08536' },
        { zipCode: '08536' },
      ],
    },
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
          { normalizedZipCode: '08536' },
          { zipCode: '08536' },
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
