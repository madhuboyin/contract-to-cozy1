const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { readCoveragePoliciesPage, ASK_RECORD_COLLECTION_READERS } = require('../../src/services/ask/askRecordCollections.service.ts');
const { ASK_RECORD_SECTION_REGISTRY, recordSectionRoleFloor, evaluateRecordSectionApplicability, validateAskRecordSectionRegistry } = require('../../src/services/ask/governance/askRecordSectionRegistry.ts');

const NOW = new Date('2026-10-19T12:00:00Z');
const day = (offset) => new Date(NOW.getTime() + offset * 86_400_000);
const policy = (n, overrides = {}) => ({
  id: `pol-${String(n).padStart(3, '0')}`, propertyId: 'p1', carrierName: `Carrier ${n}`, coverageType: 'Homeowner', isVerified: false, lastVerifiedAt: null,
  startDate: day(-200), expiryDate: day(160), policyNumber: 'SECRET-123', premiumAmount: 1800, deductibleAmount: 2500, ...overrides,
});
function install(rows) {
  const state = { args: [] };
  prisma.insurancePolicy = { findMany: async (args) => { state.args.push(args); return rows.filter((row) => row.propertyId === args.where.propertyId); } };
  return state;
}
const read = (query = {}) => readCoveragePoliciesPage('p1', query, NOW);

test('the coverage section keeps the VIEWER floor and every household role is admitted, none shown as restricted', () => {
  const section = ASK_RECORD_SECTION_REGISTRY.find((entry) => entry.id === 'coverage');
  assert.equal(recordSectionRoleFloor(section), 'VIEWER');
  for (const householdRole of ['VIEWER', 'CONTRIBUTOR', 'OWNER']) {
    for (const operatingMode of ['BUYING', 'OWNING', 'SELLING']) assert.equal(evaluateRecordSectionApplicability(section, { householdRole, operatingMode }), 'APPLICABLE', `${householdRole}/${operatingMode}`);
  }
  // No section carries its own floor or a primary-homeowner rule: every floor is derived from the section's read operations.
  assert.equal(ASK_RECORD_SECTION_REGISTRY.every((entry) => !('roleFloor' in entry) && !('primaryOwnerOnly' in entry)), true);
  assert.deepEqual([...new Set(ASK_RECORD_SECTION_REGISTRY.map((entry) => recordSectionRoleFloor(entry)))].sort(), ['VIEWER']);
  assert.deepEqual(validateAskRecordSectionRegistry(), []);
  assert.equal(section.pagedCollection && section.collectionReader === 'PAGED_COLLECTION' && typeof ASK_RECORD_COLLECTION_READERS.coverage === 'function', true);
});

test('policies list active first, then dates needing review, starting later, and expired most-recent-first, with the governed status', async () => {
  install([
    policy(1, { expiryDate: day(300) }), policy(2, { expiryDate: day(40) }),
    policy(3, { startDate: day(-400), expiryDate: day(-10) }), policy(4, { startDate: day(-600), expiryDate: day(-200) }),
    policy(5, { startDate: day(30), expiryDate: day(400) }), policy(6, { startDate: null, expiryDate: null }), policy(7, { propertyId: 'other' }),
  ]);
  const page = await read();
  assert.equal(page.total, 6);
  assert.deepEqual(page.rows.map((row) => [row.id, row.status]), [['pol-002', 'ACTIVE'], ['pol-001', 'ACTIVE'], ['pol-006', 'NEEDS_REVIEW'], ['pol-005', 'STARTS_LATER'], ['pol-003', 'EXPIRED'], ['pol-004', 'EXPIRED']]);
  assert.equal(page.rows[0].statusLabel, 'Active');
});

test('policy numbers, premiums, and deductibles are never selected or returned', async () => {
  const state = install([policy(1)]);
  const page = await read();
  const select = state.args[0].select;
  assert.equal(['policyNumber', 'premiumAmount', 'deductibleAmount', 'coverageJson', 'deductibleCents', 'personalPropertyLimitCents'].some((field) => field in select), false);
  const json = JSON.stringify(page);
  assert.equal(/SECRET-123|1800|2500/.test(json), false);
  assert.deepEqual(Object.keys(page.rows[0]).sort(), ['askQuestion', 'carrierName', 'coverageType', 'expiryDate', 'id', 'lastVerifiedAt', 'startDate', 'status', 'statusLabel', 'verified']);
  assert.equal(state.args[0].where.propertyId, 'p1');
});

test('policies page without repeats, including undated policies, and filters compose', async () => {
  const rows = [...Array.from({ length: 30 }, (_, index) => policy(index + 1, { expiryDate: day(100 + (index % 5)) })), policy(80, { startDate: null, expiryDate: null }), policy(81, { startDate: null, expiryDate: null }), policy(82, { startDate: null, expiryDate: null })];
  install(rows);
  const ids = [];
  let cursor = null;
  let guard = 0;
  do {
    const page = await read({ limit: 7, cursor });
    ids.push(...page.rows.map((row) => row.id));
    cursor = page.nextCursor;
    assert.ok(++guard < 20);
  } while (cursor);
  assert.equal(ids.length, 33);
  assert.equal(new Set(ids).size, 33);

  install([policy(1, { coverageType: 'Flood', carrierName: 'Wave Mutual' }), policy(2, { coverageType: 'Homeowner', expiryDate: day(-30), startDate: day(-400) }), policy(3, { coverageType: 'Homeowner' })]);
  assert.deepEqual((await read({ filters: { coverageType: 'Homeowner', status: 'ACTIVE' } })).rows.map((row) => row.id), ['pol-003']);
  assert.deepEqual((await read({ search: 'wave' })).rows.map((row) => row.id), ['pol-001']);
  const options = Object.fromEntries((await read()).filterOptions.map((option) => [option.key, option.options.map((entry) => entry.value)]));
  assert.deepEqual(options, { status: ['ACTIVE', 'EXPIRED'], coverageType: ['Flood', 'Homeowner'] });
  for (const bad of [{ filters: { status: 'NOPE' } }, { cursor: 'x' }, { filters: { coverageType: 'x'.repeat(61) } }]) {
    await assert.rejects(() => read(bad), (error) => error.code === 'ASK_INVALID_REQUEST', JSON.stringify(bad));
  }
});
