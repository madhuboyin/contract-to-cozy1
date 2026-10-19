const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { readHouseholdAccessPage, ASK_RECORD_COLLECTION_READERS } = require('../../src/services/ask/askRecordCollections.service.ts');
const { ASK_RECORD_SECTION_REGISTRY, recordSectionRoleFloor, evaluateRecordSectionApplicability, validateAskRecordSectionRegistry } = require('../../src/services/ask/governance/askRecordSectionRegistry.ts');

const member = (n, overrides = {}) => ({
  id: `mem-${String(n).padStart(3, '0')}`, propertyId: 'p1', userId: `user-${n}`, role: 'CONTRIBUTOR', isPrimaryOwner: false, displayName: null,
  joinedAt: new Date(Date.UTC(2026, 0, 1) + n * 86_400_000),
  user: { id: `user-${n}`, firstName: `First${n}`, lastName: `Last${n}`, email: `person${n}@secret.example`, avatar: 'https://img.example/a.png', lastLoginAt: new Date('2026-10-18T00:00:00Z') }, ...overrides,
});
const ctx = (userId = 'user-2') => ({ propertyId: 'p1', userId });
const listOf = (members, calls = []) => async (propertyId) => { calls.push(propertyId); return members; };

async function drain(read, query = {}) {
  const ids = [];
  let cursor = null;
  let guard = 0;
  do {
    const page = await read({ ...query, cursor });
    ids.push(...page.rows.map((row) => row.id));
    cursor = page.nextCursor;
    assert.ok(++guard < 40);
  } while (cursor);
  return ids;
}

test('the household section is readable by every household role and no role sees it restricted', () => {
  const section = ASK_RECORD_SECTION_REGISTRY.find((entry) => entry.id === 'household-access');
  assert.equal(recordSectionRoleFloor(section), 'VIEWER');
  for (const householdRole of ['VIEWER', 'CONTRIBUTOR', 'OWNER']) {
    for (const operatingMode of ['BUYING', 'OWNING', 'SELLING', 'UNKNOWN']) assert.equal(evaluateRecordSectionApplicability(section, { householdRole, operatingMode }), 'APPLICABLE', `${householdRole}/${operatingMode}`);
  }
  assert.deepEqual(section.commandOperationIds, [], 'no administrative command is attached to the read-only summary');
  assert.deepEqual([section.pagedCollection, section.collectionReader, typeof ASK_RECORD_COLLECTION_READERS['household-access']], [true, 'PAGED_COLLECTION', 'function']);
  assert.deepEqual(validateAskRecordSectionRegistry(), []);
});

test('members list the primary owner first, then by join date, with role labels and who is reading', async () => {
  const members = [member(3), member(1, { role: 'VIEWER' }), member(2, { role: 'OWNER', isPrimaryOwner: true }), member(4, { role: 'OWNER', joinedAt: new Date('2025-01-01T00:00:00Z') })];
  const page = await readHouseholdAccessPage(ctx('user-3'), {}, listOf(members));
  assert.equal(page.total, 4);
  assert.deepEqual(page.rows.map((row) => [row.id, row.roleLabel, row.isPrimaryOwner, row.isYou]), [
    ['mem-002', 'Owner', true, false], ['mem-004', 'Owner', false, false], ['mem-001', 'Viewer', false, false], ['mem-003', 'Contributor', false, true],
  ]);
});

test('no email, avatar, login time, or other account detail is ever returned', async () => {
  const page = await readHouseholdAccessPage(ctx(), {}, listOf([member(1), member(2)]));
  const json = JSON.stringify(page);
  assert.equal(/secret\.example|img\.example|lastLogin|2026-10-18|email|avatar/i.test(json), false);
  assert.deepEqual(Object.keys(page.rows[0]).sort(), ['askQuestion', 'id', 'isPrimaryOwner', 'isYou', 'joinedAt', 'name', 'role', 'roleLabel']);
});

test('the household display name wins over the account name, with a neutral fallback and no email-derived name', async () => {
  const page = await readHouseholdAccessPage(ctx(), {}, listOf([
    member(1, { displayName: '  Nana  ' }), member(2), member(3, { user: { firstName: null, lastName: null, email: 'only@secret.example' } }),
  ]));
  assert.deepEqual(page.rows.map((row) => row.name), ['Nana', 'First2 Last2', 'Household member']);
  assert.equal(JSON.stringify(page).includes('only@secret'), false);
});

test('role filter and name search compose, pages never repeat, and bad filters are rejected', async () => {
  const members = Array.from({ length: 30 }, (_, index) => member(index + 1, { role: index % 3 === 0 ? 'OWNER' : 'CONTRIBUTOR' }));
  const read = (query) => readHouseholdAccessPage(ctx(), query, listOf(members));
  assert.equal((await read({ limit: 7 })).truncated, true);
  const ids = await drain(read, { limit: 7 });
  assert.equal(ids.length, 30);
  assert.equal(new Set(ids).size, 30);
  assert.equal((await read({ filters: { role: 'OWNER' } })).total, 10);
  assert.deepEqual((await read({ search: 'first12 ' })).rows.map((row) => row.id), ['mem-012']);
  assert.deepEqual((await read({ filters: { role: 'OWNER' } })).query, { search: null, filters: { role: 'OWNER' } });
  for (const bad of [{ filters: { role: 'ADMIN' } }, { cursor: 'x' }]) await assert.rejects(() => read(bad), (error) => error.code === 'ASK_INVALID_REQUEST', JSON.stringify(bad));
});

test('the member list is read for the requested property only, and a service failure is not hidden as an empty household', async () => {
  const calls = [];
  await readHouseholdAccessPage(ctx(), {}, listOf([member(1)], calls));
  assert.deepEqual(calls, ['p1']);
  await assert.rejects(() => readHouseholdAccessPage(ctx(), {}, async () => { throw new Error('database down'); }), /database down/);
});
