const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD IW-HIST-003, IW-HIST-006, IW-HIST-009..012, IW-HIST-014 (session lifecycle controls,
// FRD v1.71): rename, pin/unpin, archive/restore, and the pinned group and archived view in the history list.

const prismaModule = require('../../src/lib/prisma.ts');
const { askSessionHistoryWhere } = require('../../src/services/ask/askSessionHistoryPagination.ts');
const { AskSessionUpdateRequestSchema, AskRecentSessionSummarySchema, AskRecentSessionPageSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { updateAskSessionForUser, getRecentAskSessions } = require('../../src/services/ask/askOrchestrator.service.ts');

const NOW = new Date('2026-09-24T12:00:00.000Z');
const original = prismaModule.prisma;
test.afterEach(() => { prismaModule.prisma = original; });

test('the recent list leaves out archived and pinned conversations; pinned and archived lists are their own', () => {
  const base = { userId: 'owner-1', propertyId: 'home-1', now: NOW, retentionDays: 30, cursor: null };
  const recent = askSessionHistoryWhere(base);
  assert.equal(recent.archivedAt, null);
  assert.equal(recent.pinnedAt, null);
  const pinned = askSessionHistoryWhere({ ...base, list: 'PINNED' });
  assert.equal(pinned.archivedAt, null);
  assert.deepEqual(pinned.pinnedAt, { not: null });
  const archived = askSessionHistoryWhere({ ...base, list: 'ARCHIVED' });
  assert.deepEqual(archived.archivedAt, { not: null });
  assert.equal('pinnedAt' in archived, false);
  // Search spans every unarchived conversation, pinned or not.
  const search = askSessionHistoryWhere({ ...base, searchQuery: 'roof' });
  assert.equal(search.archivedAt, null);
  assert.equal('pinnedAt' in search, false);
  // Every list keeps the same user, property and retention boundaries.
  for (const where of [recent, pinned, archived, search]) {
    assert.equal(where.userId, 'owner-1');
    assert.equal(where.propertyId, 'home-1');
    assert.deepEqual(where.lastActiveAt, { gte: new Date('2026-08-25T12:00:00.000Z') });
  }
});

test('a session change is one of rename, pin or archive, and a title is never blank or oversized', () => {
  assert.deepEqual(AskSessionUpdateRequestSchema.parse({ title: '  Roof plan  ' }), { title: 'Roof plan' });
  assert.deepEqual(AskSessionUpdateRequestSchema.parse({ pinned: true }), { pinned: true });
  assert.deepEqual(AskSessionUpdateRequestSchema.parse({ archived: false }), { archived: false });
  for (const bad of [{}, { title: '   ' }, { title: 'a'.repeat(121) }, { title: 'x', pinned: true }, { pinned: 'yes' }, { deleted: true }]) {
    assert.equal(AskSessionUpdateRequestSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
  const summary = { sessionId: 's1', title: 'Roof', property: { id: 'h', label: 'Home' }, latestStatus: 'ANSWERED', latestExecutionId: 'e1', executionCount: 1, lastActiveAt: NOW.toISOString(), pinned: true, archived: false, titleSetByUser: true };
  assert.equal(AskRecentSessionSummarySchema.safeParse(summary).success, true);
  assert.equal(AskRecentSessionSummarySchema.safeParse({ ...summary, pinned: undefined }).success, false);
  assert.equal(AskRecentSessionPageSchema.safeParse({ items: [summary], nextCursor: null, pinned: [summary] }).success, true);
});

function fakeSessions({ session = { id: 's1', propertyId: 'home-1' }, member = true } = {}) {
  const calls = { find: [], update: [] };
  prismaModule.prisma = {
    askSession: {
      findFirst: async (query) => { calls.find.push(query); return session; },
      update: async (query) => {
        calls.update.push(query);
        return { id: 's1', title: query.data.title ?? 'Roof repair options', pinnedAt: query.data.pinnedAt ?? null, archivedAt: query.data.archivedAt ?? null, titleSetByUserAt: query.data.titleSetByUserAt ?? null };
      },
    },
    householdMember: { findUnique: async () => (member ? { role: 'OWNER', isPrimaryOwner: true } : null) },
    property: { findFirst: async () => null },
  };
  return calls;
}

test('rename marks a homeowner title; pin and unpin only move it; archive also unpins; restore brings it back', async () => {
  const calls = fakeSessions();
  const renamed = await updateAskSessionForUser('owner-1', 's1', { title: 'Roof plan' });
  assert.equal(calls.update[0].data.title, 'Roof plan');
  assert.ok(calls.update[0].data.titleSetByUserAt instanceof Date);
  assert.equal(renamed.titleSetByUser, true);
  await updateAskSessionForUser('owner-1', 's1', { pinned: true });
  assert.ok(calls.update[1].data.pinnedAt instanceof Date);
  await updateAskSessionForUser('owner-1', 's1', { pinned: false });
  assert.deepEqual(calls.update[2].data, { pinnedAt: null });
  const archived = await updateAskSessionForUser('owner-1', 's1', { archived: true });
  assert.ok(calls.update[3].data.archivedAt instanceof Date);
  assert.equal(calls.update[3].data.pinnedAt, null);
  assert.equal(archived.archived, true);
  await updateAskSessionForUser('owner-1', 's1', { archived: false });
  assert.deepEqual(calls.update[4].data, { archivedAt: null });
  // None of these touches retention, activity or the conversation's content.
  for (const { data } of calls.update) {
    for (const key of ['expiresAt', 'lastActiveAt', 'executions', 'propertyId', 'userId']) assert.equal(key in data, false, key);
  }
  // Only the homeowner's own, still-retained conversation is looked up.
  assert.equal(calls.find[0].where.userId, 'owner-1');
  assert.deepEqual(calls.find[0].where.OR[0], { expiresAt: null });
});

test('another user\'s, expired, or access-revoked conversation is simply not found, and nothing is written', async () => {
  let calls = fakeSessions({ session: null });
  await assert.rejects(updateAskSessionForUser('owner-1', 's1', { pinned: true }), { code: 'ASK_SESSION_NOT_FOUND' });
  assert.equal(calls.update.length, 0);
  calls = fakeSessions({ member: false });
  await assert.rejects(updateAskSessionForUser('owner-1', 's1', { title: 'Mine now' }), { code: 'ASK_SESSION_NOT_FOUND' });
  assert.equal(calls.update.length, 0);
});

function fakeHistory(rowsByList) {
  const queries = [];
  const row = (id, extra = {}) => ({
    id, propertyId: 'home-1', title: `Title ${id}`, lastActiveAt: NOW, titleSetByUserAt: null, pinnedAt: null, archivedAt: null,
    _count: { executions: 1 }, executions: [{ id: `e-${id}`, message: 'q', status: 'ANSWERED' }], ...extra,
  });
  prismaModule.prisma = {
    householdMember: { findUnique: async () => ({ role: 'OWNER', isPrimaryOwner: true }) },
    property: {
      findFirst: async () => ({ id: 'home-1', name: 'Main home', address: '1 Main St', city: 'Town', state: 'CA' }),
      findUnique: async () => ({ id: 'home-1', name: 'Main home', address: '1 Main St', city: 'Town', state: 'CA' }),
    },
    askSession: {
      findMany: async (query) => {
        queries.push(query);
        const kind = query.where.archivedAt ? 'ARCHIVED' : query.where.pinnedAt ? 'PINNED' : 'RECENT';
        return (rowsByList[kind] ?? []).map((id) => row(id, kind === 'PINNED' ? { pinnedAt: NOW } : kind === 'ARCHIVED' ? { archivedAt: NOW } : {}));
      },
    },
  };
  return queries;
}

test('the first recent page carries the pinned group; later pages, search and the archived view do not', async () => {
  let queries = fakeHistory({ RECENT: ['r1'], PINNED: ['p1'] });
  const first = await getRecentAskSessions('owner-1', 'home-1');
  assert.deepEqual(first.items.map((item) => [item.sessionId, item.pinned]), [['r1', false]]);
  assert.deepEqual(first.pinned.map((item) => [item.sessionId, item.pinned]), [['p1', true]]);
  assert.equal(queries.length, 2);
  queries = fakeHistory({ RECENT: ['r1'], PINNED: ['p1'] });
  const searched = await getRecentAskSessions('owner-1', 'home-1', undefined, 'roof');
  assert.equal('pinned' in searched, false);
  assert.equal(queries.length, 1);
  queries = fakeHistory({ ARCHIVED: ['a1'] });
  const archived = await getRecentAskSessions('owner-1', 'home-1', undefined, undefined, 'ARCHIVED');
  assert.deepEqual(archived.items.map((item) => [item.sessionId, item.archived]), [['a1', true]]);
  assert.equal('pinned' in archived, false);
  assert.deepEqual(queries[0].where.archivedAt, { not: null });
});
