const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { readPermitsPage, readProjectsPage, readIncidentsClaimsPage, ASK_RECORD_COLLECTION_READERS } = require('../../src/services/ask/askRecordCollections.service.ts');
const { ASK_RECORD_SECTION_REGISTRY, validateAskRecordSectionRegistry } = require('../../src/services/ask/governance/askRecordSectionRegistry.ts');

async function drain(read, query = {}) {
  const ids = [];
  let cursor = null;
  let guard = 0;
  do {
    const page = await read({ ...query, cursor });
    ids.push(...page.rows.map((row) => row.id));
    cursor = page.nextCursor;
    assert.ok(++guard < 80);
  } while (cursor);
  return ids;
}

// ── permits ──────────────────────────────────────────────────────────────────────────────────────────────────────
const permit = (n, overrides = {}) => ({
  id: `per-${String(n).padStart(3, '0')}`, permitNumber: `P-${n}`, category: 'BUILDING', workTypes: [], description: null, status: 'ISSUED', reportedStatus: null, source: 'MANUAL_ENTRY',
  issueDate: new Date(Date.UTC(2026, 5, 1) - n * 86_400_000).toISOString(), finaledDate: undefined, expirationDate: undefined, contractorName: null, isVerified: false, hasOpenInspections: false, ...overrides,
});
const permits = (items, nextCursor) => async (propertyId, params) => { permits.calls.push({ propertyId, params }); return { items, nextCursor }; };
permits.calls = [];
const readPermits = (items, query = {}, nextCursor) => readPermitsPage('p1', query, permits(items, nextCursor));

test('permits list active first, then closed out, newest issue first, and page without repeats', async () => {
  const items = [...Array.from({ length: 40 }, (_, index) => permit(index + 1)), permit(90, { status: 'FINALED' }), permit(91, { status: 'EXPIRED' }), permit(92, { status: 'ISSUED', issueDate: undefined })];
  const first = await readPermits(items, { limit: 25 });
  assert.equal(first.total, 43);
  assert.equal(first.truncated, true);
  const read = (query) => readPermitsPage('p1', query, permits(items));
  const ids = await drain(read, { limit: 25 });
  assert.equal(ids.length, 43);
  assert.equal(new Set(ids).size, 43);
  assert.deepEqual(ids.slice(-3).sort(), ['per-090', 'per-091', 'per-092'].sort());
  assert.equal(ids.indexOf('per-092') < ids.indexOf('per-090'), true, 'an undated active permit still precedes closed ones');
  assert.equal(permits.calls.at(-1).params.limit, 500);
});

test('permits keep official and reported status apart and say so when the official status is not confirmed', async () => {
  const { rows } = await readPermits([
    permit(1, { status: 'UNKNOWN', reportedStatus: 'ISSUED_REPORTED' }),
    permit(2, { status: 'ISSUED', reportedStatus: 'ISSUED_REPORTED' }),
    permit(3, { status: 'FINALED', hasOpenInspections: true, permitNumber: null, category: 'ROOFING', workTypes: ['ROOF_REPLACEMENT'] }),
  ]);
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  assert.deepEqual([byId['per-001'].officialStatusLabel, byId['per-001'].reportedStatusLabel], ['Official status not confirmed', 'Issued']);
  assert.equal(byId['per-002'].reportedStatusLabel, null);
  assert.deepEqual([byId['per-003'].title, byId['per-003'].description, byId['per-003'].closed, byId['per-003'].hasOpenInspections], ['Roofing permit', 'roof replacement', true, true]);
});

test('permit filters compose, a source cap is disclosed, and bad filters are rejected', async () => {
  const items = [permit(1, { category: 'ELECTRICAL', contractorName: 'Volt Co' }), permit(2, { category: 'BUILDING', status: 'FINALED' }), permit(3, { category: 'BUILDING' })];
  assert.deepEqual((await readPermits(items, { filters: { category: 'BUILDING', status: 'ISSUED' } })).rows.map((row) => row.id), ['per-003']);
  assert.deepEqual((await readPermits(items, { search: 'volt' })).rows.map((row) => row.id), ['per-001']);
  assert.deepEqual((await readPermits(items, { search: 'p-2' })).rows.map((row) => row.id), ['per-002']);
  assert.equal((await readPermits(items)).notice, null);
  assert.match((await readPermits(items, {}, 'more')).notice, /first 500 permit records/);
  for (const bad of [{ filters: { status: 'NOPE' } }, { filters: { category: 'NOPE' } }, { cursor: 'x' }]) {
    await assert.rejects(() => readPermits(items, bad), (error) => error.code === 'ASK_INVALID_REQUEST', JSON.stringify(bad));
  }
});

// ── projects ─────────────────────────────────────────────────────────────────────────────────────────────────────
let cases = [];
const project = (n, overrides = {}) => ({
  id: `prj-${String(n).padStart(3, '0')}`, name: `Project ${n}`, projectType: 'KITCHEN_REMODEL', status: 'IN_PROGRESS', contractorName: 'BuildCo', fulfillmentMode: 'CONTRACTOR',
  currentContractAmountCents: 1_000_000, paidToDateCents: 250_000, expectedEndDate: new Date('2027-01-01T00:00:00Z'), warrantyExpiresAt: null,
  createdAt: new Date(Date.UTC(2026, 5, 1) - n * 86_400_000), _count: { milestones: 3, issues: 1 }, ...overrides,
});

test('projects list active, then completed, then cancelled, newest first inside each, and page completely', async () => {
  const rows = [...Array.from({ length: 30 }, (_, index) => project(index + 1)), project(50, { status: 'COMPLETED' }), project(51, { status: 'CANCELLED' }), project(52, { status: 'DISPUTED' })];
  const read = (query) => readProjectsPage('p1', query, async () => rows, async () => cases);
  const first = await read({ limit: 25 });
  assert.equal(first.total, 33);
  const ids = await drain(read, { limit: 25 });
  assert.equal(ids.length, 33);
  assert.equal(new Set(ids).size, 33);
  assert.deepEqual(ids.slice(-2), ['project:prj-050', 'project:prj-051']);
  assert.equal(ids.includes('project:prj-052') && ids.indexOf('project:prj-052') < ids.indexOf('project:prj-050'), true, 'disputed is still active');
});

test('project rows show recorded amounts; an unknown contract has no remaining balance; DIY is named; filters compose', async () => {
  const rows = [
    project(1, { currentContractAmountCents: 1_000_000, paidToDateCents: 250_000 }),
    project(2, { currentContractAmountCents: null, contractorName: null, fulfillmentMode: 'DIY', projectType: 'FLOORING', paidToDateCents: 5_000 }),
    project(3, { status: 'COMPLETED', warrantyExpiresAt: new Date('2028-05-01T00:00:00Z'), paidToDateCents: 1_000_000, currentContractAmountCents: 1_000_000 }),
    project(4, { contractorName: null, fulfillmentMode: 'CONTRACTOR' }),
  ];
  const read = (query) => readProjectsPage('p1', query, async () => rows, async () => cases);
  const page = await read({});
  const byId = Object.fromEntries(page.rows.map((row) => [row.id, row]));
  assert.deepEqual([byId['project:prj-001'].contractLabel, byId['project:prj-001'].paidLabel, byId['project:prj-001'].remainingLabel], ['$10,000', '$2,500', '$7,500']);
  assert.deepEqual([byId['project:prj-002'].contractLabel, byId['project:prj-002'].remainingLabel, byId['project:prj-002'].providerLabel, byId['project:prj-002'].typeLabel], [null, null, 'DIY / household', 'Flooring']);
  assert.equal(byId['project:prj-003'].remainingLabel, null);
  assert.equal(byId['project:prj-003'].warrantyExpiresAt, '2028-05-01T00:00:00.000Z');
  assert.equal(byId['project:prj-004'].providerLabel, null);
  assert.deepEqual((await read({ filters: { type: 'FLOORING' } })).rows.map((row) => row.id), ['project:prj-002']);
  assert.deepEqual((await read({ filters: { status: 'COMPLETED' } })).rows.map((row) => row.id), ['project:prj-003']);
  assert.deepEqual((await read({ search: 'diy' })).rows.map((row) => row.id), []);
  assert.deepEqual((await read({ search: 'project 4' })).rows.map((row) => row.id), ['project:prj-004']);
  for (const bad of [{ filters: { status: 'NOPE' } }, { filters: { type: 'NOPE' } }, { cursor: 'x' }]) {
    await assert.rejects(() => read(bad), (error) => error.code === 'ASK_INVALID_REQUEST', JSON.stringify(bad));
  }
});

const renovation = (n, overrides = {}) => ({
  id: `rc-${n}`, name: `Case ${n}`, objective: 'Open up the kitchen', caseType: 'REMODEL', lifecycle: 'SCOPE_DEFINITION', targetBudgetCents: 4_000_000, targetEndDate: new Date('2027-06-01T00:00:00Z'),
  updatedAt: new Date(Date.UTC(2026, 6, 1) - n * 86_400_000), ...overrides,
});

test('renovation cases list beside tracked projects with their own kind, stage, and target budget; the kind filter separates them', async () => {
  cases = [renovation(1), renovation(2, { lifecycle: 'VERIFIED_COMPLETE' }), renovation(3, { lifecycle: 'CANCELLED' }), renovation(4, { caseType: 'ENERGY_UPGRADE', targetBudgetCents: null, targetEndDate: null })];
  const rows = [project(1), project(2, { status: 'COMPLETED' })];
  const read = (query) => readProjectsPage('p1', query, async () => rows, async () => cases);
  try {
    const page = await read({});
    assert.equal(page.total, 6);
    assert.deepEqual(page.rows.map((row) => [row.id, row.kind]).filter(([, kind]) => kind === 'RENOVATION_CASE').map(([id]) => id).sort(), ['renovation:rc-1', 'renovation:rc-2', 'renovation:rc-3', 'renovation:rc-4']);
    const byId = Object.fromEntries(page.rows.map((row) => [row.id, row]));
    assert.deepEqual([byId['renovation:rc-1'].typeLabel, byId['renovation:rc-1'].statusLabel, byId['renovation:rc-1'].contractLabel, byId['renovation:rc-1'].paidLabel], ['Remodel', 'Scope Definition', '$40,000', null]);
    assert.deepEqual([byId['renovation:rc-1'].milestoneCount, byId['renovation:rc-1'].issueCount], [null, null]);
    assert.deepEqual([byId['renovation:rc-4'].contractLabel, byId['renovation:rc-4'].typeLabel], [null, 'Energy upgrade']);
    const order = page.rows.map((row) => row.id);
    assert.ok(order.indexOf('renovation:rc-3') > order.indexOf('renovation:rc-2') && order.indexOf('renovation:rc-2') > order.indexOf('renovation:rc-4'), 'active, then completed, then cancelled');
    assert.deepEqual((await read({ filters: { kind: 'RENOVATION_CASE' } })).rows.length, 4);
    assert.deepEqual((await read({ filters: { kind: 'PROJECT' } })).rows.map((row) => row.kind), ['PROJECT', 'PROJECT']);
    assert.deepEqual((await read({ filters: { status: 'VERIFIED_COMPLETE' } })).rows.map((row) => row.id), ['renovation:rc-2']);
    assert.deepEqual((await read({ filters: { type: 'ENERGY_UPGRADE' } })).rows.map((row) => row.id), ['renovation:rc-4']);
    assert.deepEqual((await read({ search: 'open up' })).rows.length, 4);
    assert.deepEqual(page.filterOptions.map((filter) => filter.key), ['kind', 'status', 'type']);
    await assert.rejects(() => read({ filters: { kind: 'NOPE' } }), (error) => error.code === 'ASK_INVALID_REQUEST');
    // Both kinds page together without a collision on the cursor.
    const ids = await drain(read, { limit: 2 });
    assert.equal(new Set(ids).size, 6);
  } finally { cases = []; }
});

// ── incidents and claims ─────────────────────────────────────────────────────────────────────────────────────────
const incident = (n, overrides = {}) => ({ id: `${n}`, propertyId: 'p1', title: `Incident ${n}`, summary: null, status: 'ACTIVE', severity: null, openedAt: new Date(Date.UTC(2026, 5, 1) - n * 86_400_000), resolvedAt: null, typeKey: 'WATER_LEAK', isSuppressed: false, ...overrides });
const claim = (n, overrides = {}) => ({ id: `${n}`, propertyId: 'p1', title: `Claim ${n}`, status: 'IN_PROGRESS', type: 'PROPERTY_DAMAGE', providerName: null, incidentAt: null, openedAt: new Date(Date.UTC(2026, 5, 1) - n * 86_400_000 - 43_200_000), closedAt: null, updatedAt: new Date('2026-10-01T00:00:00Z'), ...overrides });
function installIC(incidents, claims) {
  const args = { incident: [], claim: [] };
  prisma.incident = { findMany: async (a) => { args.incident.push(a); return incidents.filter((row) => row.propertyId === a.where.propertyId && row.isSuppressed === a.where.isSuppressed); } };
  prisma.claim = { findMany: async (a) => { args.claim.push(a); return claims.filter((row) => row.propertyId === a.where.propertyId); } };
  return args;
}
const readIC = (query) => readIncidentsClaimsPage('p1', query);

test('incidents and claims interleave newest first, exclude suppressed incidents, and page without collisions between the two tables', async () => {
  const args = installIC(
    [...Array.from({ length: 20 }, (_, index) => incident(index + 1)), incident(70, { isSuppressed: true })],
    [...Array.from({ length: 20 }, (_, index) => claim(index + 1)), claim(71, { propertyId: 'other' })],
  );
  const first = await readIC({ limit: 15 });
  assert.equal(first.total, 40);
  const ids = await drain(readIC, { limit: 15 });
  assert.equal(ids.length, 40);
  assert.equal(new Set(ids).size, 40, 'incident 1 and claim 1 share a table id but not a row key');
  assert.deepEqual(ids.slice(0, 4), ['incident:1', 'claim:1', 'incident:2', 'claim:2']);
  assert.equal(ids.includes('incident:70'), false);
  assert.equal(args.incident[0].where.isSuppressed, false);
});

test('kind and state filters use the same open and closed definitions as Ask, rows state their facts, and bad filters are rejected', async () => {
  installIC(
    [incident(1, { status: 'DETECTED' }), incident(2, { status: 'RESOLVED', resolvedAt: new Date('2026-05-01T00:00:00Z'), severity: 'HIGH', summary: 'Pipe burst' })],
    [claim(1, { status: 'SUBMITTED', providerName: 'Acme Mutual' }), claim(2, { status: 'CLOSED', closedAt: new Date('2026-04-01T00:00:00Z') })],
  );
  assert.deepEqual((await readIC({ filters: { state: 'open' } })).rows.map((row) => row.id), ['incident:1', 'claim:1']);
  assert.deepEqual((await readIC({ filters: { state: 'closed', kind: 'CLAIM' } })).rows.map((row) => row.id), ['claim:2']);
  assert.deepEqual((await readIC({ search: 'acme' })).rows.map((row) => row.id), ['claim:1']);
  const rows = Object.fromEntries((await readIC({})).rows.map((row) => [row.id, row]));
  assert.deepEqual([rows['incident:2'].statusLabel, rows['incident:2'].detailLabel, rows['incident:2'].summary, rows['incident:2'].open, rows['incident:2'].closedAt], ['resolved', 'high severity', 'Pipe burst', false, '2026-05-01T00:00:00.000Z']);
  assert.deepEqual([rows['claim:1'].detailLabel, rows['claim:1'].providerName, rows['claim:1'].kind], ['property damage', 'Acme Mutual', 'CLAIM']);
  for (const bad of [{ filters: { kind: 'OTHER' } }, { filters: { state: 'maybe' } }, { cursor: 'x' }]) {
    await assert.rejects(() => readIC(bad), (error) => error.code === 'ASK_INVALID_REQUEST', JSON.stringify(bad));
  }
});

test('registry flags and readers agree for these sections', () => {
  assert.deepEqual(validateAskRecordSectionRegistry(), []);
  for (const id of ['permits', 'projects-renovations', 'incidents-claims']) {
    const entry = ASK_RECORD_SECTION_REGISTRY.find((section) => section.id === id);
    assert.deepEqual([entry.pagedCollection, entry.collectionReader, typeof ASK_RECORD_COLLECTION_READERS[id]], [true, 'PAGED_COLLECTION', 'function'], id);
  }
});
