const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { readDocumentsPage, ASK_RECORD_COLLECTION_READERS } = require('../../src/services/ask/askRecordCollections.service.ts');
const { ASK_RECORD_SECTION_REGISTRY } = require('../../src/services/ask/governance/askRecordSectionRegistry.ts');

const doc = (n, overrides = {}) => ({
  id: `doc-${String(n).padStart(3, '0')}`, source: 'HOME_RECORD', transitional: false, title: `Document ${n}`, kind: 'MANUAL', kindLabel: 'Manuals', description: null,
  addedAt: new Date(Date.UTC(2026, 9, 1, 12, 0, 0) - n * 3_600_000), updatedAt: new Date('2026-10-02T00:00:00Z'), verification: 'UNVERIFIED', verifiedAt: null,
  needsReview: false, expiry: null, lifecycle: 'ACTIVE', sensitivity: null, visibility: null, ...overrides,
});

// The canonical inventory is the visibility authority: it receives the caller's role and returns only what that role may see.
function fakeList(rows, calls = []) {
  return async (input) => {
    calls.push(input);
    const items = rows.filter((row) => !row.ownerOnly || input.role === 'OWNER');
    return { items, totals: { total: items.length, homeRecords: items.length, legacy: 0 } };
  };
}
const ctx = (role = 'OWNER') => ({ propertyId: 'p1', role });
const none = async () => [];

async function drain(list, query = {}, role = 'OWNER') {
  const ids = [];
  let cursor = null;
  let guard = 0;
  do {
    const page = await readDocumentsPage(ctx(role), { ...query, cursor }, list, none);
    ids.push(...page.rows.map((row) => row.id));
    cursor = page.nextCursor;
    assert.ok(++guard < 50);
  } while (cursor);
  return ids;
}

test('documents page newest first with the authoritative total and an explicit continuation', async () => {
  const rows = Array.from({ length: 60 }, (_, index) => doc(index + 1));
  const list = fakeList(rows);
  const first = await readDocumentsPage(ctx(), { limit: 25 }, list, none);
  assert.equal(first.total, 60);
  assert.equal(first.delivered, 25);
  assert.equal(first.truncated, true);
  assert.deepEqual(await drain(list, { limit: 25 }), rows.map((row) => row.id));
});

test('documents added at one instant are neither duplicated nor skipped across a page boundary', async () => {
  const same = new Date('2026-10-01T00:00:00Z');
  const ids = await drain(fakeList(Array.from({ length: 7 }, (_, index) => doc(index + 1, { addedAt: same }))), { limit: 3 });
  assert.equal(new Set(ids).size, 7);
});

test('the caller role reaches the canonical read, so an owner-only record is never listed, counted, or echoed to a viewer', async () => {
  const rows = [doc(1), doc(2, { ownerOnly: true, title: 'Sealed trust deed' }), doc(3)];
  const calls = [];
  const list = fakeList(rows, calls);
  const viewer = await readDocumentsPage(ctx('VIEWER'), { search: 'trust' }, list, none);
  assert.equal(viewer.total, 0);
  assert.deepEqual(viewer.rows, []);
  const viewerAll = await readDocumentsPage(ctx('VIEWER'), {}, list, none);
  assert.equal(viewerAll.total, 2);
  assert.equal(JSON.stringify(viewerAll).includes('Sealed trust deed'), false);
  assert.equal(calls.at(-1).role, 'VIEWER');
  const owner = await readDocumentsPage(ctx('OWNER'), { search: 'trust' }, list, none);
  assert.deepEqual(owner.rows.map((row) => row.title), ['Sealed trust deed']);
  // The same scope as the index count: both stores, including legacy documents attached to inventory items.
  assert.equal(calls.every((call) => call.includeLegacy === true && call.includeInventoryLinkedLegacy === true), true);
});

test('status, type, and search filters compose and narrow the total with the pages', async () => {
  const rows = [
    doc(1, { verification: 'VERIFIED', kind: 'CONTRACT', kindLabel: 'Contracts', title: 'Purchase contract' }),
    doc(2, { verification: 'PENDING', needsReview: true, kind: 'INSPECTION_REPORT', kindLabel: 'Inspection reports' }),
    doc(3, { verification: null, source: 'LEGACY_DOCUMENT', transitional: true, needsReview: null, kind: 'CONTRACT', kindLabel: 'Contracts', title: 'Old contract' }),
    doc(4, { verification: 'REJECTED' }),
  ];
  const list = fakeList(rows);
  assert.deepEqual((await readDocumentsPage(ctx(), { filters: { status: 'VERIFIED' } }, list, none)).rows.map((row) => row.id), ['doc-001']);
  assert.deepEqual((await readDocumentsPage(ctx(), { filters: { status: 'NEEDS_REVIEW' } }, list, none)).rows.map((row) => row.id), ['doc-002']);
  const contracts = await readDocumentsPage(ctx(), { filters: { kind: 'CONTRACT' } }, list, none);
  assert.deepEqual(contracts.rows.map((row) => [row.id, row.transitional, row.verification]), [['doc-001', false, 'VERIFIED'], ['doc-003', true, null]]);
  assert.deepEqual((await readDocumentsPage(ctx(), { filters: { kind: 'CONTRACT' }, search: 'OLD' }, list, none)).rows.map((row) => row.id), ['doc-003']);
  assert.deepEqual(contracts.query, { search: null, filters: { kind: 'CONTRACT' } });
  const options = Object.fromEntries(contracts.filterOptions.map((option) => [option.key, option.options.map((entry) => entry.value)]));
  assert.deepEqual(options.status, ['VERIFIED', 'PENDING', 'REJECTED', 'UNVERIFIED', 'NEEDS_REVIEW'].filter((value) => options.status.includes(value)));
  assert.deepEqual(options.kind, ['CONTRACT', 'INSPECTION_REPORT', 'MANUAL']);
});

test('rows are shaped for display and carry the kind-level Ask question', async () => {
  const { rows } = await readDocumentsPage(ctx(), {}, fakeList([doc(1, { kind: 'INSPECTION_REPORT', kindLabel: 'Inspection reports', expiry: 'EXPIRING_SOON' })]), none);
  assert.deepEqual(rows[0], {
    id: 'doc-001', rowKind: 'DOCUMENT', title: 'Document 1', kind: 'INSPECTION_REPORT', kindLabel: 'Inspection reports', verification: 'UNVERIFIED', needsReview: false, expiry: 'EXPIRING_SOON', transitional: false,
    addedAt: doc(1).addedAt.toISOString(), updatedAt: '2026-10-02T00:00:00.000Z', askQuestion: 'Show me my inspection reports.',
  });
});

test('invalid queries are rejected, a failing canonical read is not swallowed into an empty list, and the paged flag matches the readers', async () => {
  for (const bad of [{ filters: { status: 'BROKEN' } }, { filters: { kind: 'bad kind' } }, { cursor: 'x' }, { limit: 0 }]) {
    await assert.rejects(() => readDocumentsPage(ctx(), bad, fakeList([]), none), (error) => error.code === 'ASK_INVALID_REQUEST', JSON.stringify(bad));
  }
  await assert.rejects(() => readDocumentsPage(ctx(), {}, async () => { throw new Error('store down'); }, none), /store down/);
  const paged = ASK_RECORD_SECTION_REGISTRY.filter((entry) => entry.pagedCollection).map((entry) => entry.id).sort();
  assert.deepEqual(paged, Object.keys(ASK_RECORD_COLLECTION_READERS).sort());
  assert.ok(paged.includes('documents'));
});

// ── extracted candidates (FR-REC-002: "documents and extracted candidates") ──────────────────────────────────────
const candidate = (kind, n, overrides = {}) => ({ id: `${n}`, kind, title: `${kind} ${n}`, description: `Candidate ${n}`, updatedAt: new Date(Date.UTC(2026, 9, 5) - n * 3_600_000), parentId: 'parent', ...overrides });

test('candidates awaiting review list first with an explicit state, then documents, and page together without collisions', async () => {
  const candidates = [candidate('MATERIAL_EXTRACTION_REVIEW', 1), candidate('INSPECTION_REPORT', 2), candidate('INSURANCE_POLICY_FACT', 3)];
  const list = fakeList(Array.from({ length: 4 }, (_, index) => doc(index + 1)));
  const load = async () => candidates;
  const first = await readDocumentsPage(ctx(), { limit: 2 }, list, load);
  assert.equal(first.total, 7);
  assert.deepEqual(first.rows.map((row) => [row.id, row.rowKind]), [['candidate:MATERIAL_EXTRACTION_REVIEW:1', 'EXTRACTED_CANDIDATE'], ['candidate:INSPECTION_REPORT:2', 'EXTRACTED_CANDIDATE']]);
  assert.equal(first.rows[0].needsReview, true);
  assert.equal(first.rows[0].verification, null);
  assert.equal(first.rows[0].askQuestion, 'Review pending document extractions.');
  const ids = [];
  let cursor = null;
  do {
    const page = await readDocumentsPage(ctx(), { limit: 2, cursor }, list, load);
    ids.push(...page.rows.map((row) => row.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 7);
  assert.equal(new Set(ids).size, 7);
  assert.deepEqual(ids.slice(0, 3).every((id) => id.startsWith('candidate:')), true);
  assert.deepEqual(ids.slice(3).every((id) => id.startsWith('doc-')), true);
});

test('the kind filter separates candidates from documents, and only the review status matches a candidate', async () => {
  const load = async () => [candidate('INSPECTION_REPORT', 1)];
  const list = fakeList([doc(1), doc(2, { needsReview: true })]);
  const read = (query) => readDocumentsPage(ctx(), query, list, load);
  assert.deepEqual((await read({ filters: { state: 'candidate' } })).rows.map((row) => row.rowKind), ['EXTRACTED_CANDIDATE']);
  assert.deepEqual((await read({ filters: { state: 'document' } })).rows.length, 2);
  assert.deepEqual((await read({ filters: { status: 'NEEDS_REVIEW' } })).rows.map((row) => row.id), ['candidate:INSPECTION_REPORT:1', 'doc-002']);
  assert.deepEqual((await read({ filters: { status: 'UNVERIFIED' } })).rows.map((row) => row.id), ['doc-001', 'doc-002']);
  assert.deepEqual((await read({ search: 'candidate 1' })).rows.map((row) => row.id), ['candidate:INSPECTION_REPORT:1']);
  const page = await read({});
  assert.deepEqual(page.filterOptions.find((filter) => filter.key === 'state').options.map((option) => option.value), ['document', 'candidate']);
  await assert.rejects(() => read({ filters: { state: 'nope' } }), (error) => error.code === 'ASK_INVALID_REQUEST');
  const none2 = await readDocumentsPage(ctx(), {}, list, none);
  assert.equal(none2.filterOptions.some((filter) => filter.key === 'state'), false, 'no candidates, no state filter');
});
