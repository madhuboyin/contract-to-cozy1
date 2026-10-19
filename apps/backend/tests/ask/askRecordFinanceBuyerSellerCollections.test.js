const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { readFinancingScenariosPage, readBuyerRecordsPage, readSellerRecordsPage, ASK_RECORD_COLLECTION_READERS } = require('../../src/services/ask/askRecordCollections.service.ts');
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

// ── financing scenarios ──────────────────────────────────────────────────────────────────────────────────────────
const scenario = (n, overrides = {}) => ({ id: `fin-${String(n).padStart(3, '0')}`, title: `Scenario ${n}`, projectCostCents: 4_000_000 + n, status: 'SAVED', entryPoint: 'DIRECT', selectedOption: null, createdAt: new Date(Date.UTC(2026, 5, 1) - n * 86_400_000), propertyContextVersion: null, ...overrides });

test('financing scenarios page newest first, show the household figures, and never the profile, rate snapshot, or results', async () => {
  const rows = Array.from({ length: 40 }, (_, index) => scenario(index + 1));
  const read = (query) => readFinancingScenariosPage('p1', query, async () => rows);
  const first = await read({ limit: 25 });
  assert.equal(first.total, 40);
  assert.equal(first.truncated, true);
  assert.deepEqual(await drain(read, { limit: 25 }), rows.map((row) => row.id));
  assert.deepEqual(first.rows[0], { id: 'fin-001', title: 'Scenario 1', projectCostLabel: '$40,000', status: 'SAVED', statusLabel: 'Saved', selectedOptionLabel: null, entryPointLabel: 'Direct', createdAt: rows[0].createdAt.toISOString(), askQuestion: null });
  const picked = (await readFinancingScenariosPage('p1', {}, async () => [scenario(1, { selectedOption: 'HOME_EQUITY_LOAN', entryPoint: 'REPLACE_REPAIR', status: 'DRAFT' })])).rows[0];
  assert.deepEqual([picked.selectedOptionLabel, picked.entryPointLabel, picked.statusLabel], ['Home Equity Loan', 'Replace Repair', 'Draft']);
});

test('financing filters compose, scenarios at one instant are not skipped, and bad filters are rejected', async () => {
  const same = new Date('2026-05-01T00:00:00Z');
  const ties = Array.from({ length: 7 }, (_, index) => scenario(index + 1, { createdAt: same }));
  assert.equal(new Set(await drain((query) => readFinancingScenariosPage('p1', query, async () => ties), { limit: 3 })).size, 7);
  const rows = [scenario(1, { status: 'DRAFT', title: 'Roof loan' }), scenario(2, { status: 'SAVED', title: 'Kitchen' })];
  const read = (query) => readFinancingScenariosPage('p1', query, async () => rows);
  assert.deepEqual((await read({ filters: { status: 'DRAFT' } })).rows.map((row) => row.id), ['fin-001']);
  assert.deepEqual((await read({ search: 'KITCHEN' })).rows.map((row) => row.id), ['fin-002']);
  for (const bad of [{ filters: { status: 'ARCHIVED' } }, { cursor: 'x' }]) await assert.rejects(() => read(bad), (error) => error.code === 'ASK_INVALID_REQUEST', JSON.stringify(bad));
});

// ── buyer records ────────────────────────────────────────────────────────────────────────────────────────────────
const task = (n, overrides = {}) => ({ id: `task-${String(n).padStart(3, '0')}`, title: `Task ${n}`, description: null, status: 'PENDING', phase: 'DUE_DILIGENCE', sortOrder: n, required: false, blocking: false, dueAt: null, completedAt: null, ...overrides });
const tctx = { propertyId: 'p1', userId: 'u1' };

test('buyer tasks list in the plan order (phase, then sort order) and page completely, read through the service with the caller', async () => {
  const calls = [];
  const tasks = [...Array.from({ length: 30 }, (_, index) => task(index + 1)), task(90, { phase: 'EXPLORING', sortOrder: 5 }), task(91, { phase: 'MOVE_IN', sortOrder: 1 }), task(92, { phase: 'EXPLORING', sortOrder: 1 })];
  const load = async (userId, propertyId) => { calls.push({ userId, propertyId }); return tasks; };
  const read = (query) => readBuyerRecordsPage(tctx, query, load);
  const ids = await drain(read, { limit: 10 });
  assert.equal(ids.length, 33);
  assert.equal(new Set(ids).size, 33);
  assert.deepEqual(ids.slice(0, 2), ['task-092', 'task-090']);
  assert.equal(ids.at(-1), 'task-091');
  assert.deepEqual(calls[0], { userId: 'u1', propertyId: 'p1' });
});

test('buyer rows state required, blocking, due, and completion; filters compose', async () => {
  const load = async () => [
    task(1, { status: 'BLOCKED', blocking: true, required: true, dueAt: new Date('2026-12-01T12:00:00Z'), description: 'Order the appraisal' }),
    task(2, { status: 'COMPLETED', completedAt: new Date('2026-09-01T12:00:00Z'), phase: 'OFFER_CONTRACT' }),
  ];
  const page = await readBuyerRecordsPage(tctx, {}, load);
  assert.deepEqual(page.rows.map((row) => row.id), ['task-002', 'task-001']);
  const blocked = page.rows.find((row) => row.id === 'task-001');
  assert.deepEqual([blocked.statusLabel, blocked.phaseLabel, blocked.blocking, blocked.required, blocked.dueAt], ['Blocked', 'Due Diligence', true, true, '2026-12-01T12:00:00.000Z']);
  assert.equal(page.freshAsOf, '2026-09-01T12:00:00.000Z');
  assert.deepEqual((await readBuyerRecordsPage(tctx, { filters: { status: 'BLOCKED' } }, load)).rows.map((row) => row.id), ['task-001']);
  assert.deepEqual((await readBuyerRecordsPage(tctx, { filters: { phase: 'OFFER_CONTRACT' }, search: 'task 2' }, load)).rows.map((row) => row.id), ['task-002']);
  assert.deepEqual((await readBuyerRecordsPage(tctx, { search: 'appraisal' }, load)).rows.map((row) => row.id), ['task-001']);
  for (const bad of [{ filters: { status: 'NOPE' } }, { filters: { phase: 'NOPE' } }, { cursor: 'x' }]) await assert.rejects(() => readBuyerRecordsPage(tctx, bad, load), (error) => error.code === 'ASK_INVALID_REQUEST', JSON.stringify(bad));
});

test('a home with no Buyer Plan reads as empty with a notice, and any other failure is not hidden as empty', async () => {
  const none = await readBuyerRecordsPage(tctx, {}, async () => { throw new Error('Buyer plan not found.'); });
  assert.deepEqual([none.total, none.rows, none.notice], [0, [], 'No Buyer Plan has been started for this home.']);
  const notPurchase = await readBuyerRecordsPage(tctx, {}, async () => { throw new Error('The buyer acquisition plan is only available for a purchase or recent-owner property context.'); });
  assert.match(notPurchase.notice, /applies to a purchase/);
  await assert.rejects(() => readBuyerRecordsPage(tctx, {}, async () => { throw new Error('database down'); }), /database down/);
  const { APIError } = require('../../src/middleware/error.middleware.ts');
  await assert.rejects(() => readBuyerRecordsPage(tctx, {}, async () => { throw new APIError('Property not found or user does not have access.', 404, 'PROPERTY_NOT_FOUND'); }), (error) => error.code === 'PROPERTY_NOT_FOUND');
});

// ── seller records ───────────────────────────────────────────────────────────────────────────────────────────────
const item = (n, overrides = {}) => ({ id: `sel-${String(n).padStart(3, '0')}`, saleCaseId: 'case-1', category: 'PRESENTATION', requirementClass: 'OPTIONAL_IMPROVEMENT', status: 'OPEN', title: `Item ${n}`, detail: null, dueAt: null, createdAt: new Date(Date.UTC(2026, 5, 1) + n * 86_400_000), estimatedCostMinCents: null, estimatedCostMaxCents: null, ...overrides });
function installSale(saleCase, rows) {
  const calls = { findMany: [], writes: 0 };
  prisma.propertySaleCase = { findUnique: async () => saleCase, update: async () => { calls.writes += 1; }, create: async () => { calls.writes += 1; } };
  prisma.saleReadinessItem = {
    findMany: async (args) => { calls.findMany.push(args); return rows.filter((row) => row.saleCaseId === args.where.saleCaseId); },
    create: async () => { calls.writes += 1; }, update: async () => { calls.writes += 1; }, upsert: async () => { calls.writes += 1; }, updateMany: async () => { calls.writes += 1; },
  };
  return calls;
}
const readSeller = (query) => readSellerRecordsPage('p1', query);

test('seller items list open first by due date, then pursued, waived, resolved, and page without repeats; the read never writes', async () => {
  const rows = [
    ...Array.from({ length: 30 }, (_, index) => item(index + 1)),
    item(90, { status: 'RESOLVED' }), item(91, { status: 'WAIVED' }), item(92, { status: 'PURSUING' }), item(93, { dueAt: new Date('2026-07-01T00:00:00Z') }), item(94, { saleCaseId: 'other-case' }),
  ];
  const calls = installSale({ id: 'case-1' }, rows);
  const ids = await drain(readSeller, { limit: 12 });
  assert.equal(ids.length, 34);
  assert.equal(new Set(ids).size, 34);
  assert.equal(ids[0], 'sel-093', 'the dated open item sorts before undated open items');
  assert.deepEqual(ids.slice(-3), ['sel-092', 'sel-091', 'sel-090']);
  assert.equal(calls.writes, 0);
  assert.equal(calls.findMany.every((args) => args.where.saleCaseId === 'case-1'), true);
});

test('seller rows state category, requirement, status, cost range; the persisted-items disclosure and the no-case state are explicit', async () => {
  installSale({ id: 'case-1' }, [item(1, { category: 'SAFETY_STRUCTURAL', requirementClass: 'MATERIAL_BLOCKER', detail: 'Rail is loose', estimatedCostMinCents: 50_000, estimatedCostMaxCents: 120_000, dueAt: new Date('2026-12-01T12:00:00Z') })]);
  const page = await readSeller({});
  assert.deepEqual(page.rows[0], { id: 'sel-001', title: 'Item 1', detail: 'Rail is loose', category: 'SAFETY_STRUCTURAL', categoryLabel: 'Safety Structural', requirementLabel: 'Material Blocker', status: 'OPEN', statusLabel: 'Open', dueAt: '2026-12-01T12:00:00.000Z', costRangeLabel: '$500 to $1,200', askQuestion: null });
  assert.match(page.notice, /as last refreshed/);
  installSale(null, []);
  const none = await readSeller({});
  assert.deepEqual([none.total, none.rows, none.notice], [0, [], 'No sale case has been started for this home.']);
});

test('seller filters compose and bad filters are rejected; the registry flags and readers agree for the remaining sections', async () => {
  installSale({ id: 'case-1' }, [item(1, { category: 'PRESENTATION' }), item(2, { category: 'SAFETY_STRUCTURAL', status: 'WAIVED' }), item(3, { category: 'SAFETY_STRUCTURAL', title: 'Fix railing' })]);
  assert.deepEqual((await readSeller({ filters: { category: 'SAFETY_STRUCTURAL', status: 'OPEN' } })).rows.map((row) => row.id), ['sel-003']);
  assert.deepEqual((await readSeller({ search: 'RAILING' })).rows.map((row) => row.id), ['sel-003']);
  for (const bad of [{ filters: { status: 'NOPE' } }, { filters: { category: 'NOPE' } }, { cursor: 'x' }]) await assert.rejects(() => readSeller(bad), (error) => error.code === 'ASK_INVALID_REQUEST', JSON.stringify(bad));
  assert.deepEqual(validateAskRecordSectionRegistry(), []);
  for (const id of ['financing-ownership', 'buyer-records', 'seller-records']) {
    const entry = ASK_RECORD_SECTION_REGISTRY.find((section) => section.id === id);
    assert.deepEqual([entry.pagedCollection, entry.collectionReader, typeof ASK_RECORD_COLLECTION_READERS[id]], [true, 'PAGED_COLLECTION', 'function'], id);
  }
  // Only the governed facts section is not a paged collection: it stays the completeness view.
  assert.deepEqual(ASK_RECORD_SECTION_REGISTRY.filter((entry) => !entry.pagedCollection).map((entry) => entry.id), ['property-facts']);
});
