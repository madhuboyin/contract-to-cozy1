const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const {
  ASK_SESSION_HISTORY_PAGE_SIZE,
  askSessionHistoryWhere,
  encodeAskSessionHistoryCursor,
  decodeAskSessionHistoryCursor,
} = require('../../src/services/ask/askSessionHistoryPagination.ts');
const { AskRecentSessionPageSchema } = require('../../src/productFramework/ask/ask.contract.ts');

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
  assert.deepEqual(where.executions, { some: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } });
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
