// BICC-BUY-002: the buyer's saved comparison (which homes, which things to compare). Prisma is replaced by a small in-memory fake; nothing here touches a database.
require('ts-node/register');
const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma } = require('../../src/lib/prisma.ts');
const { candidateComparisonStateService: svc, reconcileSavedComparison } = require('../../src/services/ask/buyer/candidateComparisonState.service.ts');
const { candidatePropertyService } = require('../../src/services/ask/buyer/candidateProperty.service.ts');
const { candidateHomesReviewResult } = require('../../src/services/ask/handlers/candidateHomes.handler.ts');

function fakeDb({ homes, state = null }) {
  const calls = [];
  const original = { cp: prisma.candidateProperty, cs: prisma.candidateComparisonState };
  const matches = (home, where) => home.userId === where.userId && (!where.status || home.status === where.status) && (!where.id?.in || where.id.in.includes(home.id));
  prisma.candidateProperty = { findMany: async ({ where }) => { calls.push(['findMany', where]); return homes.filter((h) => matches(h, where)).map((h) => ({ id: h.id })); } };
  const store = { row: state };
  prisma.candidateComparisonState = {
    findUnique: async ({ where }) => (store.row && store.row.userId === where.userId ? store.row : null),
    upsert: async ({ where, create, update }) => { calls.push(['upsert', where, create, update]); store.row = { ...(store.row ?? {}), ...create }; return store.row; },
    deleteMany: async ({ where }) => { calls.push(['deleteMany', where]); if (store.row?.userId === where.userId) store.row = null; return { count: 1 }; },
  };
  return { calls, store, restore() { prisma.candidateProperty = original.cp; prisma.candidateComparisonState = original.cs; } };
}
const H = (id, userId = 'u1', status = 'ACTIVE') => ({ id, userId, status });

test('reconcile drops ids that are no longer active homes and returns nothing below two homes', () => {
  assert.deepEqual(reconcileSavedComparison({ candidateIds: ['a', 'b', 'c'], dimensions: ['listPriceCents', 'bogus'] }, new Set(['a', 'c'])), { candidateIds: ['a', 'c'], dimensions: ['listPriceCents'] });
  assert.equal(reconcileSavedComparison({ candidateIds: ['a', 'b'], dimensions: [] }, new Set(['a'])), null);
  assert.equal(reconcileSavedComparison(null, new Set(['a'])), null);
});

test('save stores two to six of the caller\'s own active homes and known dimensions only', async () => {
  const db = fakeDb({ homes: [H('a'), H('b'), H('c')] });
  try {
    assert.deepEqual(await svc.save('u1', { candidateIds: ['a', 'b', 'a'], dimensions: ['listPriceCents'] }), { candidateIds: ['a', 'b'], dimensions: ['listPriceCents'] });
    assert.deepEqual(db.calls.find((c) => c[0] === 'upsert')[1], { userId: 'u1' }, 'always keyed by the caller');
    for (const bad of [{ candidateIds: ['a'], dimensions: [] }, { candidateIds: 'a', dimensions: [] }, { candidateIds: ['a', 'b'], dimensions: ['nope'] }, { candidateIds: ['a', 'b'], dimensions: 'x' }, { candidateIds: [1, 2], dimensions: [] }, { candidateIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], dimensions: [] }]) {
      await assert.rejects(() => svc.save('u1', bad), (e) => e.statusCode === 400 || e.status === 400, JSON.stringify(bad));
    }
  } finally { db.restore(); }
});

test('another person\'s home, a missing one and an archived one all fail the same way (not found), and nothing is saved', async () => {
  const db = fakeDb({ homes: [H('a'), H('x', 'someone-else'), H('arch', 'u1', 'ARCHIVED')] });
  try {
    for (const ids of [['a', 'x'], ['a', 'nope'], ['a', 'arch']]) {
      await assert.rejects(() => svc.save('u1', { candidateIds: ids, dimensions: [] }), (e) => e.code === 'CANDIDATE_NOT_FOUND', ids.join());
    }
    assert.equal(db.calls.filter((c) => c[0] === 'upsert').length, 0);
    assert.equal(db.store.row, null);
  } finally { db.restore(); }
});

test('get returns only still-active homes, is scoped to the caller, and clear removes it', async () => {
  const db = fakeDb({ homes: [H('a'), H('b'), H('c', 'u1', 'ARCHIVED')], state: { userId: 'u1', candidateIds: ['a', 'b', 'c'], dimensions: ['bedrooms'] } });
  try {
    assert.deepEqual(await svc.get('u1'), { candidateIds: ['a', 'b'], dimensions: ['bedrooms'] });
    assert.equal(await svc.get('u2'), null, 'another person sees nothing');
    await svc.clear('u1');
    assert.equal(await svc.get('u1'), null);
    assert.deepEqual(db.calls.find((c) => c[0] === 'deleteMany')[1], { userId: 'u1' });
  } finally { db.restore(); }
});

const home = (id, label, extra = {}) => ({ id, label, userId: 'u1', provenance: {}, ...extra });
const A = home('a', 'Maple St', { listPriceCents: 40000000, bedrooms: 3 });
const B = home('b', 'Oak Ave', { listPriceCents: 35000000, bedrooms: 2 });
const C = home('c', 'Pine Rd', { listPriceCents: 30000000, bedrooms: 4 });

async function withSaved(saved, run) {
  const origList = candidatePropertyService.list; const origGet = svc.get;
  candidatePropertyService.list = async () => [A, B, C];
  svc.get = async () => saved;
  try { await run(); } finally { candidatePropertyService.list = origList; svc.get = origGet; }
}
const columns = (result) => result.blocks.find((b) => b.id === 'candidate-homes-compare').columns.map((c) => c.label);
const rowLabels = (result) => result.blocks.find((b) => b.id === 'candidate-homes-compare').rows.map((r) => r.values.item);

test('the review uses the saved homes and saved things to compare, and says so', async () => {
  await withSaved({ candidateIds: ['a', 'c'], dimensions: ['bedrooms'] }, async () => {
    const result = await candidateHomesReviewResult('u1', 'compare my homes');
    assert.deepEqual(columns(result), ['Compare', 'Maple St', 'Pine Rd']);
    assert.deepEqual(rowLabels(result), ['Bedrooms']);
    assert.match(result.blocks[0].body, /saved comparison \(2 of 3 homes\)/);
  });
});

test('a question that names things still wins over the saved things; the saved homes still apply', async () => {
  await withSaved({ candidateIds: ['a', 'c'], dimensions: ['bedrooms'] }, async () => {
    const result = await candidateHomesReviewResult('u1', 'compare my homes by price');
    assert.deepEqual(rowLabels(result), ['List price']);
    assert.deepEqual(columns(result), ['Compare', 'Maple St', 'Pine Rd']);
  });
});

test('with no saved comparison, or one that no longer has two homes, every active home is compared as before', async () => {
  for (const saved of [null, { candidateIds: ['a'], dimensions: [] }]) {
    await withSaved(saved, async () => {
      const result = await candidateHomesReviewResult('u1', 'compare my homes');
      assert.deepEqual(columns(result), ['Compare', 'Maple St', 'Oak Ave', 'Pine Rd']);
      assert.doesNotMatch(result.blocks[0].body, /saved comparison/);
    });
  }
});
