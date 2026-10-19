const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { matches, cmp } = require('./helpers/prismaWhereEval');
const {
  readTimelinePage, readMaintenanceHistoryPage, readInspectionsPage, ASK_RECORD_COLLECTION_READERS,
} = require('../../src/services/ask/askRecordCollections.service.ts');
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

// ── timeline ─────────────────────────────────────────────────────────────────────────────────────────────────────
const event = (n, overrides = {}) => ({
  id: `evt-${String(n).padStart(3, '0')}`, title: `Event ${n}`, summary: null, type: 'REPAIR', occurredAt: new Date(Date.UTC(2026, 5, 1) - n * 86_400_000), datePrecision: 'EXACT_DATE',
  dateRangeStart: null, dateRangeEnd: null, verificationStatus: 'UNVERIFIED', providerName: null, visibility: 'HOUSEHOLD', createdById: 'someone', ...overrides,
});
const timeline = (events, calls = []) => async (propertyId) => { calls.push({ propertyId }); return events; };
const tctx = (userId = 'u1') => ({ propertyId: 'p1', userId });

test('timeline pages newest first with a continuation and the same privacy rule as Ask: private events only for their recorder', async () => {
  const events = [...Array.from({ length: 60 }, (_, index) => event(index + 1)), event(100, { visibility: 'PRIVATE', createdById: 'other', title: 'Secret' }), event(101, { visibility: 'PRIVATE', createdById: 'u1', title: 'Mine' })];
  const list = timeline(events);
  const first = await readTimelinePage(tctx(), { limit: 25 }, list);
  assert.equal(first.total, 61);
  assert.equal(first.truncated, true);
  const ids = await drain((query) => readTimelinePage(tctx(), query, list), { limit: 25 });
  assert.equal(ids.length, 61);
  assert.equal(new Set(ids).size, 61);
  assert.equal(ids.includes('evt-100'), false);
  assert.equal(ids.includes('evt-101'), true);
  const asOther = await readTimelinePage(tctx('u2'), { search: 'secret' }, list);
  assert.equal(asOther.total, 0);
  assert.equal(JSON.stringify(await readTimelinePage(tctx('u2'), { limit: 50 }, list)).includes('Secret'), false);
});

test('timeline keeps recorded date precision and shows no invented day; unknown dates still list', async () => {
  const list = timeline([
    event(1, { datePrecision: 'MONTH' }),
    event(2, { datePrecision: 'RANGE', dateRangeStart: new Date('2020-01-01T00:00:00Z'), dateRangeEnd: new Date('2020-03-01T00:00:00Z') }),
    event(3, { datePrecision: 'UNKNOWN', occurredAt: new Date('invalid') }),
  ]);
  const { rows } = await readTimelinePage(tctx(), {}, list);
  assert.deepEqual(rows.map((row) => row.datePrecision).sort(), ['MONTH', 'RANGE', 'UNKNOWN']);
  assert.equal(rows.find((row) => row.datePrecision === 'RANGE').dateRangeEnd, '2020-03-01T00:00:00.000Z');
  assert.equal(rows.find((row) => row.datePrecision === 'UNKNOWN').occurredAt, '1970-01-01T00:00:00.000Z');
});

test('timeline filters compose, rows shorten long summaries, and a source that returned its 200-event limit is disclosed', async () => {
  const list = timeline([
    event(1, { type: 'INSPECTION', verificationStatus: 'EVIDENCE_VERIFIED', title: 'Annual inspection', summary: 'y'.repeat(300) }),
    event(2, { type: 'REPAIR', verificationStatus: 'HOMEOWNER_CONFIRMED', providerName: 'Fix It Co' }),
    event(3, { type: 'REPAIR' }),
  ]);
  assert.deepEqual((await readTimelinePage(tctx(), { filters: { type: 'REPAIR' } }, list)).rows.map((row) => row.id), ['evt-002', 'evt-003']);
  assert.deepEqual((await readTimelinePage(tctx(), { filters: { type: 'REPAIR', verification: 'HOMEOWNER_CONFIRMED' } }, list)).rows.map((row) => row.id), ['evt-002']);
  assert.deepEqual((await readTimelinePage(tctx(), { search: 'FIX IT' }, list)).rows.map((row) => row.id), ['evt-002']);
  const page = await readTimelinePage(tctx(), {}, list);
  assert.equal(page.rows.find((row) => row.id === 'evt-001').summary.length, 140);
  assert.equal(page.rows[0].verificationLabel, 'Evidence Verified');
  assert.equal(page.notice, null);
});

test('timeline has no 200-event ceiling: 450 events page to the end without repeats or a notice, newest first', async () => {
  const events = Array.from({ length: 450 }, (_, index) => event(index + 1));
  const list = timeline(events);
  const first = await readTimelinePage(tctx(), { limit: 50 }, list);
  assert.equal(first.total, 450);
  assert.equal(first.notice, null);
  assert.equal(first.truncated, true);
  const ids = await drain((query) => readTimelinePage(tctx(), query, list), { limit: 50 });
  assert.equal(ids.length, 450);
  assert.equal(new Set(ids).size, 450);
  assert.deepEqual(ids, events.map((row) => row.id));
  const calls = [];
  await readTimelinePage(tctx(), {}, timeline([], calls));
  assert.deepEqual(calls[0], { propertyId: 'p1' });
});

// ── maintenance history ──────────────────────────────────────────────────────────────────────────────────────────
const task = (n, overrides = {}) => ({
  id: `task-${String(n).padStart(3, '0')}`, title: `Task ${n}`, description: null, category: 'HVAC', assetType: null, serviceCategory: null, season: null, status: 'COMPLETED', priority: 'MEDIUM', source: 'USER_CREATED',
  nextDueDate: null, lastCompletedDate: new Date(Date.UTC(2026, 5, 1) - n * 86_400_000), updatedAt: new Date('2026-10-01T00:00:00Z'), actualCost: null, estimatedCost: null, isRecurring: false, frequency: null, inventoryItem: null, room: null, ...overrides,
});
const tasks = (historical) => async () => ({ active: [], historical, totalTaskCount: historical.length, sourceVersion: 'v', newestObservedAt: null });

test('maintenance history lists only completed tasks, newest completion first, undated last, and never repeats across pages', async () => {
  const rows = [...Array.from({ length: 40 }, (_, index) => task(index + 1)), task(90, { lastCompletedDate: null }), task(91, { lastCompletedDate: null }), task(92, { status: 'CANCELLED' })];
  const load = tasks(rows);
  const first = await readMaintenanceHistoryPage(tctx(), { limit: 25 }, load);
  assert.equal(first.total, 42);
  assert.equal(first.truncated, true);
  const ids = await drain((query) => readMaintenanceHistoryPage(tctx(), query, load), { limit: 25 });
  assert.equal(ids.length, 42);
  assert.equal(new Set(ids).size, 42);
  assert.deepEqual(ids.slice(-2).sort(), ['task-090', 'task-091']);
  assert.equal(ids.includes('task-092'), false);
  const undated = (await readMaintenanceHistoryPage(tctx(), { limit: 50 }, load)).rows.find((row) => row.id === 'task-090');
  assert.equal(undated.completedOn, null);
});

test('maintenance history filters by completion year including undated, searches scope text, and shapes rows', async () => {
  const load = tasks([
    task(1, { lastCompletedDate: new Date('2026-03-01T12:00:00Z'), title: 'Replace filter', inventoryItem: { name: 'Furnace' }, actualCost: '125', isRecurring: true, frequency: 'QUARTERLY', source: 'ACTION_CENTER', priority: 'HIGH' }),
    task(2, { lastCompletedDate: new Date('2025-03-01T12:00:00Z'), room: { name: 'Garage' } }),
    task(3, { lastCompletedDate: null }),
  ]);
  const y2026 = await readMaintenanceHistoryPage(tctx(), { filters: { year: '2026' } }, load);
  assert.deepEqual(y2026.rows.map((row) => row.id), ['task-001']);
  assert.deepEqual(y2026.rows[0], { id: 'task-001', title: 'Replace filter', scope: y2026.rows[0].scope, completedOn: '2026-03-01T12:00:00.000Z', actualCost: '$125', source: 'action center', repeats: 'quarterly', priority: 'high', askQuestion: null });
  assert.ok(y2026.rows[0].scope.length > 0);
  assert.deepEqual((await readMaintenanceHistoryPage(tctx(), { filters: { year: 'undated' } }, load)).rows.map((row) => row.id), ['task-003']);
  assert.deepEqual((await readMaintenanceHistoryPage(tctx(), { search: 'garage' }, load)).rows.map((row) => row.id), ['task-002']);
  const options = (await readMaintenanceHistoryPage(tctx(), {}, load)).filterOptions[0].options.map((option) => option.value);
  assert.deepEqual(options, ['2026', '2025', 'undated']);
});

// ── inspections ──────────────────────────────────────────────────────────────────────────────────────────────────
const report = (n, overrides = {}) => ({
  id: `rep-${String(n).padStart(3, '0')}`, propertyId: 'p1', reportType: 'GENERAL', inspectionDate: new Date(Date.UTC(2026, 5, 1) - n * 86_400_000), inspectorName: null, inspectorCompany: null,
  status: 'CONFIRMED', totalFindings: 3, openFindings: 1, safetyFindings: 0, majorFindings: 1, ...overrides,
});
function installReports(rows) {
  const state = { args: [] };
  prisma.inspectionReport = {
    findMany: async (args) => { state.args.push(args); return rows.filter((row) => matches(row, args.where)).sort((a, b) => cmp(b.inspectionDate, a.inspectionDate) || cmp(b.id, a.id)).slice(0, args.take); },
    count: async ({ where }) => rows.filter((row) => matches(row, where)).length,
    findFirst: async ({ where }) => rows.filter((row) => matches(row, where)).sort((a, b) => cmp(b.inspectionDate, a.inspectionDate))[0] ?? null,
    groupBy: async ({ by, where }) => [...new Set(rows.filter((row) => matches(row, where)).map((row) => row[by[0]]))].sort().map((value) => ({ [by[0]]: value })),
  };
  return state;
}

test('inspections page newest first without archived reports, with filters, search, and counts', async () => {
  installReports([
    ...Array.from({ length: 30 }, (_, index) => report(index + 1)),
    report(40, { status: 'ARCHIVED' }), report(41, { propertyId: 'other' }),
    report(50, { reportType: 'ROOF', status: 'REVIEW_PENDING', inspectorName: 'Sam Lee', inspectorCompany: 'RoofRight' }),
  ]);
  const read = (query) => readInspectionsPage('p1', query);
  const first = await read({ limit: 25 });
  assert.equal(first.total, 31);
  assert.equal(first.truncated, true);
  const ids = await drain(read, { limit: 25 });
  assert.equal(ids.length, 31);
  assert.equal(ids.includes('rep-040'), false);
  assert.equal(first.freshAsOf, report(1).inspectionDate.toISOString());
  const roofs = await read({ filters: { type: 'ROOF' } });
  assert.deepEqual(roofs.rows.map((row) => [row.id, row.reportTypeLabel, row.statusLabel, row.inspector]), [['rep-050', 'Roof inspection', 'Waiting for your review', 'Sam Lee, RoofRight']]);
  assert.deepEqual((await read({ search: 'roofright' })).rows.map((row) => row.id), ['rep-050']);
  assert.deepEqual((await read({ filters: { status: 'REVIEW_PENDING' } })).rows.map((row) => row.id), ['rep-050']);
  assert.deepEqual(first.filterOptions.map((option) => option.key), ['status', 'type']);
  assert.equal(first.rows[0].totalFindings, 3);
});

test('inspections at one inspection date are neither duplicated nor skipped, and bad filters are rejected', async () => {
  const same = new Date('2026-05-01T00:00:00Z');
  installReports(Array.from({ length: 7 }, (_, index) => report(index + 1, { inspectionDate: same })));
  const ids = await drain((query) => readInspectionsPage('p1', query), { limit: 3 });
  assert.equal(new Set(ids).size, 7);
  for (const bad of [{ filters: { type: 'NOPE' } }, { filters: { status: 'ARCHIVED' } }, { cursor: 'x' }]) {
    await assert.rejects(() => readInspectionsPage('p1', bad), (error) => error.code === 'ASK_INVALID_REQUEST', JSON.stringify(bad));
  }
});

test('the registry flags, readers, and index-count rule agree for the history sections', () => {
  assert.deepEqual(validateAskRecordSectionRegistry(), []);
  for (const id of ['timeline', 'maintenance-history', 'inspections']) {
    const entry = ASK_RECORD_SECTION_REGISTRY.find((section) => section.id === id);
    assert.equal(entry.pagedCollection, true, id);
    assert.equal(entry.collectionReader, 'PAGED_COLLECTION', id);
    assert.equal(typeof ASK_RECORD_COLLECTION_READERS[id], 'function', id);
  }
  const broken = { ...ASK_RECORD_SECTION_REGISTRY[0], id: 'rooms', collectionReader: 'PAGED_COLLECTION', pagedCollection: false };
  assert.match(validateAskRecordSectionRegistry([broken]).join('\n'), /not flagged paged/);
});
