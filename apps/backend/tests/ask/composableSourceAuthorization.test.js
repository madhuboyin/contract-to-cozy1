// Composition FRD FR-AUT-1: every composable operation owns a source-describe / source-authorize contract; the gate enforces it at assembly and replay, and
// anything undeclared, unknown or unverifiable fails closed.
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { COMPOSABLE_SOURCE_AUTHORIZATION: AUTH, sourceRef, withSources, listedItems, MAX_SOURCES_PER_SECTION } = require('../../src/services/ask/composition/sourceAuthorization.ts');
const { COMPOSABLE_READ_OPERATION_IDS, validateAskOperationDefinitions } = require('../../src/services/ask/askOperationRegistry.ts');
const C = require('../../src/services/ask/composition/compositeResult.ts');
const { replayComposite } = require('../../src/services/ask/composition/replayGate.ts');
const { runReadPurity, seedOwnedProperty } = require('../helpers/readPurityHarness.js');

const ctxWith = (present, calls = []) => ({ userId: 'u1', propertyId: 'p1', exists: async (model, where) => { calls.push({ model, where }); return typeof present === 'function' ? present(model, where) : present; } });
const timelineItem = (id, entityType = 'HOME_EVENT') => ({ id, title: 't', entityType, label: 't', date: '2026-01-01', datePrecision: 'DAY' });
const listBlock = (blockId, entityType, ids) => ({ type: 'GROUPED_LIST', id: blockId, title: 'x', filters: [], sections: [{ id: 's', title: 's', count: ids.length, items: ids.map((id) => ({ id, title: 't', entityType, meta: [] })) }], actions: [] });

// ---- admission ----------------------------------------------------------------------------------------------------------------------------------
test('admission: exactly the composable operations have a contract, each implementing describeSources and authorizeSources', () => {
  assert.deepEqual(Object.keys(AUTH).sort(), [...COMPOSABLE_READ_OPERATION_IDS].sort());
  for (const [operationId, contract] of Object.entries(AUTH)) {
    assert.equal(typeof contract.describeSources, 'function', operationId);
    assert.equal(typeof contract.authorizeSources, 'function', operationId);
  }
  assert.deepEqual(validateAskOperationDefinitions().filter((issue) => /source|FR-AUT/i.test(issue)), []);
});

test('admission: every composable handler declares its sources on a real path (empty home, and a data-backed reserve fund)', async () => {
  const MESSAGES = {
    ITEM_REPLACEMENT_COST: 'how much does a new roof cost', ITEM_RESERVE_ALLOCATION: 'how much of my reserve is set aside for the roof', INVENTORY_LOOKUP: 'how old is my roof',
    WARRANTY_LOOKUP: 'what warranties do I have', MAINTENANCE_BUDGET_FORECAST: 'what is my yearly maintenance budget', DO_NOTHING_SIMULATION: 'what happens if I do nothing',
    HOME_UPGRADE_SCENARIOS: 'show my saved upgrade scenarios', RECALL_REVIEW: 'are there any recalls on my appliances', HOME_TIMELINE_EVENTS: 'show my home timeline',
  };
  for (const [operationId, message] of Object.entries(MESSAGES)) {
    const run = await runReadPurity(operationId, message, { seed: seedOwnedProperty });
    assert.equal(run.error, null, `${operationId}: ${run.error && run.error.message}`);
    const described = AUTH[operationId].describeSources(run.result);
    assert.notEqual(described, null, `${operationId} left its sources undeclared (it would be redacted from every composite)`);
  }
  const withFund = (model, method) => {
    if (model === 'HomeReserveFund' && method === 'findUnique') return { id: 'f1', propertyId: 'p1', posture: 'MODERATE', currentBalanceCents: 500_000, lastRecalculatedAt: new Date('2026-11-01T00:00:00Z') };
    if (model === 'HomeReserveFundLineItem' && method === 'findMany') return [{ id: 'l1', status: 'ACTIVE', targetCostCents: 2_000_000, allocatedBalanceCents: 400_000, timelineItem: { category: 'ROOF', windowStart: new Date('2030-01-01'), inventoryItem: { name: 'Roof' } } }];
    return seedOwnedProperty(model, method);
  };
  const reserve = await runReadPurity('ITEM_RESERVE_ALLOCATION', 'how much of my reserve is set aside for the roof', { seed: withFund });
  const refs = AUTH.ITEM_RESERVE_ALLOCATION.describeSources(reserve.result);
  assert.deepEqual(refs.map((r) => `${r.sourceType}:${r.sourceId}`).sort(), ['HomeReserveFund:f1', 'HomeReserveFundLineItem:l1']);
});

// ---- describeSources ----------------------------------------------------------------------------------------------------------------------------
test('describeSources: explicit references are validated; a bad shape, a foreign type or too many fail closed (null)', () => {
  const d = AUTH.ITEM_RESERVE_ALLOCATION.describeSources;
  assert.deepEqual(d({ blocks: [], parameters: { sources: [sourceRef('HomeReserveFundLineItem', 'l1')] } }), [{ sourceType: 'HomeReserveFundLineItem', sourceId: 'l1' }]);
  assert.equal(d({ blocks: [], parameters: { sources: [{ sourceType: 'Warranty', sourceId: 'w1' }] } }), null, 'a type this operation did not declare');
  assert.equal(d({ blocks: [], parameters: { sources: [{ sourceType: 'HomeReserveFund' }] } }), null);
  assert.equal(d({ blocks: [], parameters: { sources: Array.from({ length: MAX_SOURCES_PER_SECTION + 1 }, (_, i) => sourceRef('HomeReserveFundLineItem', `l${i}`)) } }), null);
  assert.equal(d({ blocks: [] }), null, 'nothing declared is undeclared, not "no sources"');
  assert.deepEqual(d({ blocks: [], parameters: { sources: [] } }), [], 'an explicit empty list is a declaration');
});

test('describeSources: withSources deduplicates and stores ids only', () => {
  const out = withSources({ parameters: { quantities: [1] } }, [sourceRef('InventoryItem', 'a'), sourceRef('InventoryItem', 'a')]);
  assert.deepEqual(out.parameters, { quantities: [1], sources: [{ sourceType: 'InventoryItem', sourceId: 'a' }] });
});

test('describeSources: list-derived operations read the entity ids their own answer shows, and only an honest empty reason may describe nothing', () => {
  assert.deepEqual(AUTH.WARRANTY_LOOKUP.describeSources({ reasonCode: null, blocks: [listBlock('w', 'WARRANTY', ['w1', 'w2'])] }).map((r) => r.sourceId), ['w1', 'w2']);
  assert.equal(AUTH.WARRANTY_LOOKUP.describeSources({ reasonCode: null, blocks: [] }), null, 'no records and no empty-state reason: cannot be described');
  assert.deepEqual(AUTH.WARRANTY_LOOKUP.describeSources({ reasonCode: 'WARRANTY_NOT_RECORDED', blocks: [] }), []);
  assert.deepEqual(AUTH.RECALL_REVIEW.describeSources({ reasonCode: 'RECALL_MATCHES_FOUND', blocks: [listBlock('recall-review-matches', undefined, ['m1'])] }), [sourceRef('RecallMatch', 'm1')]);
  assert.equal(AUTH.RECALL_REVIEW.describeSources({ reasonCode: 'RECALL_MATCHES_FOUND', blocks: [listBlock('other', undefined, ['m1'])] }), null);
  const timeline = { type: 'TIMELINE', id: 'home-timeline-events', title: 't', items: [timelineItem('ev1'), timelineItem('synthetic-appliance-dishwasher')] };
  assert.deepEqual(AUTH.HOME_TIMELINE_EVENTS.describeSources({ reasonCode: 'HOME_TIMELINE_READY', blocks: [timeline] }), [sourceRef('HomeEvent', 'ev1'), sourceRef('Property', '')], 'a synthetic event is sourced to the property');
  const inventory = AUTH.INVENTORY_LOOKUP.describeSources({ reasonCode: null, blocks: [listBlock('i', 'INVENTORY_ITEM', ['i1']), listBlock('h', 'HOME_EVENT', ['ev9'])] });
  assert.deepEqual(inventory, [sourceRef('InventoryItem', 'i1'), sourceRef('HomeEvent', 'ev9')]);
  assert.deepEqual(AUTH.INVENTORY_LOOKUP.describeSources({ reasonCode: 'ANSWERED', parameters: { quantities: [{ key: 'item.replacementCost' }] }, blocks: [] }), [sourceRef('Property', '')], 'the profile-roof answer rests on the property profile');
  assert.equal(listedItems([{ type: 'SUMMARY', id: 's' }]).length, 0);
});

// ---- authorizeSources ---------------------------------------------------------------------------------------------------------------------------
test('authorizeSources: present records authorize; a missing record redacts its section; a missing property withholds the composite', async () => {
  const sources = [sourceRef('InventoryItem', 'i1'), sourceRef('HomeEvent', 'ev1')];
  assert.equal(await AUTH.INVENTORY_LOOKUP.authorizeSources(ctxWith(true), sources), 'AUTHORIZED');
  assert.equal(await AUTH.INVENTORY_LOOKUP.authorizeSources(ctxWith((model) => model !== 'HomeEvent'), sources), 'REDACT_SECTION');
  assert.equal(await AUTH.MAINTENANCE_BUDGET_FORECAST.authorizeSources(ctxWith(false), [sourceRef('Property', 'p1')]), 'WITHHOLD_COMPOSITE');
  assert.equal(await AUTH.WARRANTY_LOOKUP.authorizeSources(ctxWith(false), []), 'AUTHORIZED', 'a section that rests on no record has nothing to lose');
});

test('authorizeSources: the checks are the live rules (private events only to their author, retired reserve lines, open recalls, same property)', async () => {
  const calls = [];
  await AUTH.INVENTORY_LOOKUP.authorizeSources(ctxWith(true, calls), [sourceRef('HomeEvent', 'ev1')]);
  assert.deepEqual(calls[0].where, { id: 'ev1', propertyId: 'p1', isCurrent: true, deletedAt: null, OR: [{ visibility: { not: 'PRIVATE' } }, { createdById: 'u1' }] });
  const reserve = []; await AUTH.ITEM_RESERVE_ALLOCATION.authorizeSources(ctxWith(true, reserve), [sourceRef('HomeReserveFundLineItem', 'l1')]);
  assert.deepEqual(reserve[0].where, { id: 'l1', status: 'ACTIVE', fund: { propertyId: 'p1' } });
  const recall = []; await AUTH.RECALL_REVIEW.authorizeSources(ctxWith(true, recall), [sourceRef('RecallMatch', 'm1')]);
  assert.deepEqual(recall[0].where, { id: 'm1', propertyId: 'p1', status: { in: ['OPEN', 'NEEDS_CONFIRMATION'] } });
  const warranty = []; await AUTH.WARRANTY_LOOKUP.authorizeSources(ctxWith(true, warranty), [sourceRef('Warranty', 'w1')]);
  assert.deepEqual(warranty[0].where, { id: 'w1', propertyId: 'p1' }, 'a record of another property can never satisfy the check');
  const property = []; await AUTH.MAINTENANCE_BUDGET_FORECAST.authorizeSources(ctxWith(true, property), [sourceRef('Property', 'someone-elses')]);
  assert.deepEqual(property[0].where, { id: 'p1' }, 'a Property reference always means the requested property');
});

test('authorizeSources: fails closed on a foreign type and on an unverifiable lookup', async () => {
  assert.equal(await AUTH.WARRANTY_LOOKUP.authorizeSources(ctxWith(true), [sourceRef('InventoryItem', 'i1')]), 'REDACT_SECTION');
  const throwing = { userId: 'u1', propertyId: 'p1', exists: async () => { throw new Error('db down'); } };
  assert.equal(await AUTH.WARRANTY_LOOKUP.authorizeSources(throwing, [sourceRef('Warranty', 'w1')]), 'REDACT_SECTION');
});

// ---- the gate ------------------------------------------------------------------------------------------------------------------------------------
const summary = (id, title) => ({ type: 'SUMMARY', id, title, body: title, tone: 'DEFAULT', actions: [] });
const cost = (basis, min, max) => ({ key: 'item.replacementCost', itemKey: 'ROOF', basis, minCents: min, maxCents: max });
const outcomes = (sources = {}) => [
  { clause: 'How old is my roof?', operationId: 'INVENTORY_LOOKUP', executionId: 'e1', attempt: 1, status: 'ANSWERED', blocks: [summary('inv', 'Your roof is about 7 years old')], quantities: [cost('TODAY', 800_000, 1_500_000)], sources: sources.INVENTORY_LOOKUP === undefined ? [sourceRef('InventoryItem', 'i1')] : sources.INVENTORY_LOOKUP },
  { clause: 'What would a new roof cost?', operationId: 'ITEM_REPLACEMENT_COST', executionId: 'e2', attempt: 1, status: 'ANSWERED', blocks: [summary('cost', 'A new Roof is about $11,500 in today’s dollars')], quantities: [cost('TODAY', 800_000, 1_500_000)], sources: sources.ITEM_REPLACEMENT_COST === undefined ? [sourceRef('HomeCapitalTimelineItem', 't1')] : sources.ITEM_REPLACEMENT_COST },
];
const view = (verdicts) => ({ propertyAccess: true, isOperationAuthorized: () => true, authorizeSources: async (op) => verdicts[op] ?? 'AUTHORIZED' });

test('gate: a section whose source record is gone is redacted and the answer-first line, basis, status and coverage are recomputed', async () => {
  const composite = C.assembleComposite({ outcomes: outcomes(), dated: false });
  const out = await C.applyAuthorizationGate(composite, view({ ITEM_REPLACEMENT_COST: 'REDACT_SECTION' }));
  assert.equal(out.kind, 'DELIVER');
  assert.deepEqual(out.redacted, ['ITEM_REPLACEMENT_COST']);
  assert.equal(out.composite.sections.length, 1);
  assert.equal(out.composite.coverage, 'PARTIAL');
  assert.equal(out.composite.status, 'READY_WITH_LIMITATIONS');
  assert.doesNotMatch(String(out.composite.answerFirst), /11,500/);
  assert.equal(out.composite.basis, null, 'no basis line survives for a figure that was redacted');
  assert.equal(out.composite.notAnswered[0].reasonCode, 'NOT_AUTHORIZED');
});

test('gate: a section with undeclared sources fails closed even when its operation is eligible', async () => {
  const composite = C.assembleComposite({ outcomes: outcomes({ ITEM_REPLACEMENT_COST: null }), dated: false });
  const out = await C.applyAuthorizationGate(composite, view({}));
  assert.deepEqual(out.redacted, ['ITEM_REPLACEMENT_COST']);
});

test('gate: WITHHOLD_COMPOSITE (the property record is gone) withholds everything; every section redacted withholds too', async () => {
  const composite = C.assembleComposite({ outcomes: outcomes(), dated: false });
  assert.deepEqual(await C.applyAuthorizationGate(composite, view({ INVENTORY_LOOKUP: 'WITHHOLD_COMPOSITE' })), { kind: 'WITHHELD', reason: 'SOURCE_WITHHELD' });
  assert.deepEqual(await C.applyAuthorizationGate(composite, view({ INVENTORY_LOOKUP: 'REDACT_SECTION', ITEM_REPLACEMENT_COST: 'REDACT_SECTION' })), { kind: 'WITHHELD', reason: 'NO_SECTION_AUTHORIZED' });
});

test('replay: a record deleted or made private after assembly is redacted from the stored composite on the next read', async () => {
  const composite = C.assembleComposite({ outcomes: outcomes(), dated: false });
  const stored = { composite: { ...JSON.parse(JSON.stringify(composite)), attempts: [], validationIssues: [] }, blocks: [] };
  assert.deepEqual(stored.composite.sections.map((s) => s.sources.length), [1, 1], 'sources are stored with each section, ids only');
  assert.ok(!JSON.stringify(stored.composite.sections.map((s) => s.sources)).includes('7 years'), 'no record content in the references');
  const row = { resultJson: stored };
  const redacted = await replayComposite(row, view({ INVENTORY_LOOKUP: 'REDACT_SECTION' }));
  assert.equal(redacted.kind, 'DELIVER');
  assert.ok(!JSON.stringify(redacted.delivered.blocks).includes('7 years old'));
  assert.ok(JSON.stringify(redacted.delivered.blocks).includes('11,500'));
  assert.deepEqual(await replayComposite(row, view({ INVENTORY_LOOKUP: 'WITHHOLD_COMPOSITE' })), { kind: 'WITHHELD' });
  assert.equal((await replayComposite(row, view({}))).kind, 'DELIVER', 'with nothing changed the full projection is delivered');
});

// ---- capped aggregates: every contributing record is declared, not only the rows shown ----
test('FR-AUT-1: a warranty answer declares every recorded warranty, not only the rows it shows; over the bound fails closed', () => {
  const { warrantiesFromRecords } = require('../../src/services/ask/handlers/warranties.handler.ts');
  const NOW = new Date('2026-11-10T12:00:00Z');
  const make = (n) => Array.from({ length: n }, (_, i) => ({ id: `w${i}`, propertyId: 'p1', providerName: `P${i}`, category: 'APPLIANCE', coverageDetails: 'x', startDate: new Date('2025-01-01'), expiryDate: new Date('2027-01-01'), updatedAt: NOW, inventoryItem: null, documents: [] }));
  const ask = (records, message) => warrantiesFromRecords({ message, propertyId: 'p1', records, canWrite: false, ownedIds: new Set(), now: NOW });
  // A filter that matches only some (here: none) still states counts and chips built from every recorded warranty.
  const filtered = ask(make(30), 'which of my warranties have expired');
  assert.ok(listedItems(filtered.blocks).filter((item) => item.entityType === 'WARRANTY').length < 30, 'the filtered answer shows fewer rows than records');
  assert.equal(AUTH.WARRANTY_LOOKUP.describeSources(filtered).length, 30, 'yet every recorded warranty is a declared source');
  assert.equal(AUTH.WARRANTY_LOOKUP.describeSources(ask(make(50), 'What warranties do I have?')).length, 50);
  assert.equal(AUTH.WARRANTY_LOOKUP.describeSources(ask(make(51), 'What warranties do I have?')), null, 'over the bound fails closed rather than truncating silently');
});
