const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const {
  ASK_SESSION_HISTORY_PAGE_SIZE,
  askHistoryAccessiblePropertyWhere,
  askSessionHistoryWhere,
  encodeAskSessionHistoryCursor,
  decodeAskSessionHistoryCursor,
} = require('../../src/services/ask/askSessionHistoryPagination.ts');
const { AskRecentSessionPageSchema, AskSessionSearchRequestSchema } = require('../../src/productFramework/ask/ask.contract.ts');

test('history pages are bounded and the keyset cursor round-trips exact identity', () => {
  assert.equal(ASK_SESSION_HISTORY_PAGE_SIZE, 20);
  const source = { lastActiveAt: new Date('2026-09-18T12:34:56.000Z'), id: 'session-42' };
  const encoded = encodeAskSessionHistoryCursor(source);
  assert.deepEqual(decodeAskSessionHistoryCursor(encoded), source);
  assert.equal(encoded.includes('session-42'), false);
});

test('malformed and non-canonical cursors fail closed', () => {
  for (const value of ['', '!', 'a'.repeat(513), Buffer.from('{}').toString('base64url'), Buffer.from('{"id":"x","lastActiveAt":"y"}').toString('base64url')]) {
    assert.equal(decodeAskSessionHistoryCursor(value), null);
  }
});

test('every history page keeps the user, property, retention and expiry boundaries', () => {
  const now = new Date('2026-09-18T12:00:00.000Z');
  const cursor = { lastActiveAt: new Date('2026-09-10T10:00:00.000Z'), id: 'session-42' };
  const where = askSessionHistoryWhere({ userId: 'owner-1', propertyId: 'home-1', now, retentionDays: 30, cursor });
  assert.equal(where.userId, 'owner-1');
  assert.equal(where.propertyId, 'home-1');
  assert.deepEqual(where.lastActiveAt, { gte: new Date('2026-08-19T12:00:00.000Z') });
  assert.deepEqual(where.OR, [{ expiresAt: null }, { expiresAt: { gt: now } }]);
  assert.deepEqual(where.executions, { some: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, every: { propertyId: 'home-1' } });
  assert.deepEqual(where.AND, [{ OR: [
    { lastActiveAt: { lt: cursor.lastActiveAt } },
    { lastActiveAt: cursor.lastActiveAt, id: { lt: cursor.id } },
  ] }]);
});

test('history page contract carries a continuation cursor or an explicit end', () => {
  assert.equal(AskRecentSessionPageSchema.safeParse({ items: [], nextCursor: null }).success, true);
  assert.equal(AskRecentSessionPageSchema.safeParse({ items: [], nextCursor: 'opaque' }).success, true);
  assert.equal(AskRecentSessionPageSchema.safeParse({ items: [] }).success, false);
});

test('search matches a title or retained, authorized homeowner question and stays cursor-bounded', () => {
  const now = new Date('2026-09-18T12:00:00.000Z');
  const where = askSessionHistoryWhere({
    userId: 'owner-1', propertyId: 'home-1', now, retentionDays: 30,
    cursor: { lastActiveAt: now, id: 'session-42' }, searchQuery: 'roof',
  });
  assert.equal(where.userId, 'owner-1');
  assert.equal(where.propertyId, 'home-1');
  assert.deepEqual(where.lastActiveAt, { gte: new Date('2026-08-19T12:00:00.000Z') });
  assert.deepEqual(where.AND, [
    { OR: [
      { title: { contains: 'roof', mode: 'insensitive' } },
      { executions: { some: {
        userId: 'owner-1', propertyId: 'home-1', createdAt: { gte: new Date('2026-08-19T12:00:00.000Z') },
        message: { contains: 'roof', mode: 'insensitive' },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      } } },
    ] },
    { OR: [{ lastActiveAt: { lt: now } }, { lastActiveAt: now, id: { lt: 'session-42' } }] },
  ]);
  assert.deepEqual(where.executions.every, { propertyId: 'home-1' });
});

test('conversation search request rejects empty and oversized terms or cursors', () => {
  assert.deepEqual(AskSessionSearchRequestSchema.parse({ propertyId: 'home-1', query: '  roof  ' }), { propertyId: 'home-1', query: 'roof' });
  assert.equal(AskSessionSearchRequestSchema.safeParse({ propertyId: 'home-1', query: '  ' }).success, false);
  assert.equal(AskSessionSearchRequestSchema.safeParse({ propertyId: 'home-1', query: 'a'.repeat(121) }).success, false);
  assert.equal(AskSessionSearchRequestSchema.safeParse({ propertyId: 'home-1', query: 'roof', cursor: '' }).success, false);
  assert.deepEqual(AskSessionSearchRequestSchema.parse({ scope: 'ALL_HOMES', query: 'roof' }), { scope: 'ALL_HOMES', query: 'roof' });
  assert.equal(AskSessionSearchRequestSchema.safeParse({ scope: 'ALL_HOMES', propertyId: 'home-1', query: 'roof' }).success, false);
});

test('all-home history excludes unscoped, inaccessible, and mixed-access sessions before pagination', () => {
  const now = new Date('2026-09-18T12:00:00.000Z');
  const where = askSessionHistoryWhere({
    userId: 'owner-1', accessiblePropertyIds: ['home-1', 'home-2'], now,
    retentionDays: 30, cursor: null, searchQuery: 'roof',
  });
  assert.equal(where.userId, 'owner-1');
  assert.deepEqual(where.propertyId, { in: ['home-1', 'home-2'] });
  assert.deepEqual(where.executions, {
    some: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    every: { propertyId: { in: ['home-1', 'home-2'] } },
  });
  assert.deepEqual(where.AND[0].OR[1].executions.some.propertyId, { in: ['home-1', 'home-2'] });
  assert.deepEqual(where.AND[0].OR[1].executions.some.createdAt, { gte: new Date('2026-08-19T12:00:00.000Z') });
  assert.deepEqual(askSessionHistoryWhere({ userId: 'owner-1', accessiblePropertyIds: [], now, retentionDays: 30, cursor: null }).propertyId, { in: [] });
  assert.deepEqual(askHistoryAccessiblePropertyWhere('owner-1'), {
    OR: [{ homeownerProfile: { userId: 'owner-1' } }, { householdMembers: { some: { userId: 'owner-1' } } }],
  });
});
