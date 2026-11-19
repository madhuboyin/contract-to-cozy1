const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

// Actionable Result Enrichment FRD §2/§7: per-row eligibility, role, limits, and the semantic inventory presentation.
const rows = require('../../src/services/ask/actionEnrichment/actionEnrichmentRows');
const registry = require('../../src/services/ask/actionEnrichment/actionEnrichmentRegistry');
const { executeSemanticSlice } = require('../../src/services/ask/semantic/slice/sliceExecutor');
const { SLICE_SEEDED_PROPERTY_SNAPSHOT, SLICE_OWNER_AUTH } = require('../../src/services/ask/semantic/slice/index');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy');

const ABSENT = 'warranty:NO_LINK_RECORDED';
const row = (id, overrides = {}) => ({ id, entityType: 'INVENTORY_ITEM', states: [ABSENT], ...overrides });
const enrich = (inputRows, extra = {}) => rows.enrichRowActions({ sourceOperationId: 'DATA_POINT_READ', role: 'OWNER', rows: inputRows, ...extra });

test('an owner gets the governed action on a row whose state matches; a viewer gets none', () => {
  const owner = enrich([row('a')]);
  assert.deepEqual(owner.actionsByRowId.get('a').map((action) => [action.id, action.label, action.operationId, action.interactionType]),
    [['record-warranty-item', 'Record warranty', 'CAPTURE_WARRANTY_CONFIRM', 'MUTATE_RECORD']]);
  assert.equal(enrich([row('a')], { role: 'VIEWER' }).actionsByRowId.size, 0);
  assert.equal(enrich([row('a')], { role: 'EDITOR' }).actionsByRowId.size, 1, 'a contributor follows the destination floor');
});

test('eligibility is per row: a missing id/type or a non-matching state loses its action without affecting siblings', () => {
  const result = enrich([row('ok'), row('no-type', { entityType: null }), row('other-state', { states: ['warranty:UNKNOWN'] }), row('explicit', { states: ['warranty:EXPLICIT_NO_COVERAGE'] }), row('wrong-type', { entityType: 'WARRANTY' }), row('ok2')]);
  // An explicit "no coverage" row is eligible for its own reconciling action (never Record warranty); unknown and conflicted rows get none.
  assert.deepEqual([...result.actionsByRowId.keys()], ['ok', 'explicit', 'ok2']);
  assert.equal(result.actionsByRowId.get('explicit')[0].id, 'update-coverage-status-item');
});

test('only the registry source operation matters, and one action per row', () => {
  assert.equal(rows.enrichRowActions({ sourceOperationId: 'WARRANTY_LOOKUP', role: 'OWNER', rows: [row('a')] }).actionsByRowId.size, 0);
  assert.equal(enrich([row('a')]).actionsByRowId.get('a').length, 1);
});

test('the inline limit counts eligible rows only; past it a detail-hosting presentation keeps the action, others report overflow', () => {
  const many = [...Array(8).keys()].map((index) => row(`r${index}`));
  const mixed = [row('x', { states: [] }), ...many];
  const hosted = enrich(mixed, { presentation: 'INVENTORY_RESULT_LIST' });
  assert.equal(hosted.actionsByRowId.size, 8, 'detail-hosted: every eligible row keeps it');
  assert.equal(hosted.overflowCount, 0);
  const plain = enrich(mixed);
  assert.equal(plain.actionsByRowId.size, registry.ACTION_ENRICHMENT_MAX_INLINE_ROWS, 'the ineligible row did not use up a slot');
  assert.equal(plain.overflowCount, 3);
  assert.equal(registry.actionEnrichmentOverflowCopy(plain.overflowCount), '3 more matching items — narrow your question to act on them.');
});

// ── the semantic inventory presentation ──────────────────────────────────────────────────────────────
const item = (id, name, extra = {}) => ({ ...SLICE_SEEDED_PROPERTY_SNAPSHOT.items[1], id, name, coverageEvidenceStatus: 'UNKNOWN', itemWarrantyIds: [], propertyPlanWarrantyId: null, condition: 'GOOD_CONDITION', ...extra });
const snapshotWith = (items) => ({ ...SLICE_SEEDED_PROPERTY_SNAPSHOT, items: [...SLICE_SEEDED_PROPERTY_SNAPSHOT.items, ...items] });
const ask = (snapshot, role) => executeSemanticSlice({ rawText: 'Which appliances have no warranty?', snapshot, auth: { ...SLICE_OWNER_AUTH, role } });
const listItems = (result) => result.operationResult.blocks.find((block) => block.type === 'GROUPED_LIST').sections.flatMap((section) => section.items);

test('"appliances with no warranty": only items with no recorded link get Record warranty; explicit-none and unknown items do not', () => {
  const snapshot = snapshotWith([item('n1', 'Washer'), item('n2', 'Dryer')]);
  const owner = ask(snapshot, 'OWNER');
  const withAction = listItems(owner).filter((entry) => entry.actions?.length);
  assert.deepEqual(withAction.filter((entry) => entry.actions[0].id === 'record-warranty-item').map((entry) => entry.title).sort(), ['Dryer', 'Washer']);
  for (const entry of withAction.filter((candidate) => candidate.title !== 'Dishwasher')) {
    assert.equal(entry.entityType, 'INVENTORY_ITEM');
    assert.equal(entry.actions[0].id, 'record-warranty-item');
  }
  // An explicit "no coverage" item is never offered Record warranty (it would contradict the statement); it gets the reconciling step instead.
  const explicit = listItems(owner).find((entry) => entry.title === 'Dishwasher');
  assert.ok(!explicit.actions || explicit.actions.every((action) => action.id !== 'record-warranty-item'));
  const viewer = ask(snapshot, 'VIEWER');
  assert.equal(listItems(viewer).filter((entry) => entry.actions?.length).length, 0, 'a viewer gets no write action');
});

test('the enriched answer survives schema validation and trust validation for an owner', () => {
  const owner = ask(snapshotWith([item('n1', 'Washer')]), 'OWNER');
  for (const block of owner.operationResult.blocks) assert.ok(AskPresentationBlockSchema.safeParse(block).success, `${block.type} block is schema-valid`);
  const action = listItems(owner).find((entry) => entry.actions?.length).actions[0];
  assert.equal(isAskActionApplicable({ action, operationId: 'DATA_POINT_READ', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true);
  assert.equal(isAskActionApplicable({ action, operationId: 'DATA_POINT_READ', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), false, 'trust validation also strips it for a viewer');
});

test('seven qualifying items keep the action on every row (the inventory list hosts overflow in its detail) with no overflow note', () => {
  const owner = ask(snapshotWith([...Array(7).keys()].map((index) => item(`n${index}`, `Appliance ${index}`))), 'OWNER');
  // 7 added items plus the seeded explicit-no-coverage Dishwasher, which now carries Update coverage status.
  assert.equal(listItems(owner).filter((entry) => entry.actions?.length).length, 8);
  assert.ok(!owner.operationResult.blocks.find((block) => block.type === 'GROUPED_LIST').description.includes('narrow your question'));
});

// ── Review replacement: a READ action on aging appliances ───────────────────────────────────────────
const askAge = (rawText, role, snapshot = SLICE_SEEDED_PROPERTY_SNAPSHOT) => executeSemanticSlice({ rawText, snapshot, auth: { ...SLICE_OWNER_AUTH, role } });

test('"older than 10 years": the aging appliance gets Review replacement, naming it, for a viewer too (it is a read)', () => {
  for (const role of ['VIEWER', 'OWNER']) {
    const result = askAge('Which appliances are older than 10 years?', role);
    const entries = listItems(result);
    assert.deepEqual(entries.map((entry) => entry.title), ['Furnace']);
    const [action] = entries[0].actions;
    assert.deepEqual([action.id, action.label, action.operationId, action.interactionType, action.message],
      ['review-replacement-item', 'Review replacement', 'ITEM_REPAIR_REPLACE_VERDICT', 'CONVERSATION_CONTINUE', 'Should I repair or replace Furnace?']);
    assert.equal(entries[0].entityType, 'INVENTORY_ITEM');
    for (const block of result.operationResult.blocks) assert.ok(AskPresentationBlockSchema.safeParse(block).success);
    assert.equal(isAskActionApplicable({ action, operationId: 'DATA_POINT_READ', householdRole: role, authoritativeSourceAvailable: true }), true);
  }
});

test('"not older than 10 years" is a different question: no aging action on those rows', () => {
  assert.equal(listItems(askAge('Which appliances are not older than 10 years?', 'OWNER')).filter((entry) => entry.actions?.length).length, 0);
});

test('a name that does not fit is shortened inside the action message bound, and a row with no name gets no named action', () => {
  const long = rows.enrichRowActions({ sourceOperationId: 'DATA_POINT_READ', role: 'VIEWER', rows: [{ id: 'a', label: 'X'.repeat(500), entityType: 'INVENTORY_ITEM', states: ['age:OLDER_THAN_ASKED'] }] });
  assert.ok(long.actionsByRowId.get('a')[0].message.length <= 300);
  const unnamed = rows.enrichRowActions({ sourceOperationId: 'DATA_POINT_READ', role: 'VIEWER', rows: [{ id: 'a', entityType: 'INVENTORY_ITEM', states: ['age:OLDER_THAN_ASKED'] }] });
  assert.equal(unnamed.actionsByRowId.size, 0);
});

test('one action per row: an aging appliance with no warranty link gets Record warranty (first declared), not both', () => {
  const result = rows.enrichRowActions({ sourceOperationId: 'DATA_POINT_READ', role: 'OWNER', rows: [{ id: 'a', label: 'Old Washer', entityType: 'INVENTORY_ITEM', states: ['age:OLDER_THAN_ASKED', 'warranty:NO_LINK_RECORDED'] }] });
  assert.deepEqual(result.actionsByRowId.get('a').map((action) => action.id), ['record-warranty-item']);
  // A viewer cannot record, so the aging read action is the one offered.
  const viewer = rows.enrichRowActions({ sourceOperationId: 'DATA_POINT_READ', role: 'VIEWER', rows: [{ id: 'a', label: 'Old Washer', entityType: 'INVENTORY_ITEM', states: ['age:OLDER_THAN_ASKED', 'warranty:NO_LINK_RECORDED'] }] });
  assert.deepEqual(viewer.actionsByRowId.get('a').map((action) => action.id), ['review-replacement-item']);
});

// ── maintenance tasks: Complete (primary) + Reschedule (additive) on open tasks ───────────────────────
const taskAsk = (role, rawText = 'show maintenance tasks') => executeSemanticSlice({ rawText, snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT, auth: { ...SLICE_OWNER_AUTH, role } });

test('an open maintenance task gets Complete then Reschedule; a completed task and a viewer get none', () => {
  const owner = taskAsk('OWNER');
  assert.equal(owner.status, 'ANSWERED');
  const byId = new Map(listItems(owner).map((entry) => [entry.id, entry]));
  const open = byId.get('maint-furnace-filter');
  assert.equal(open.entityType, 'MAINTENANCE_TASK');
  assert.deepEqual(open.actions.map((action) => [action.id, action.operationId, action.interactionType, action.message]), [
    ['complete-maintenance-task', 'MAINTENANCE_TASK_COMPLETE', 'MUTATE_RECORD', 'Complete this maintenance task.'],
    ['reschedule-maintenance-task', 'MAINTENANCE_TASK_UPDATE', 'MUTATE_RECORD', 'Reschedule this maintenance task.'],
  ]);
  assert.ok(byId.get('maint-water-heater-flush').actions?.length === 2, 'a pending task is open too');
  assert.equal(byId.get('maint-fridge-coils').actions, undefined, 'a completed task has nothing to complete or reschedule');
  const viewer = taskAsk('VIEWER');
  assert.equal(listItems(viewer).filter((entry) => entry.actions?.length).length, 0, 'a viewer gets no write action');
});

test('the maintenance answer survives schema and trust validation for an owner; a viewer is stripped', () => {
  const owner = taskAsk('OWNER');
  for (const block of owner.operationResult.blocks) assert.ok(AskPresentationBlockSchema.safeParse(block).success, `${block.type} block is schema-valid`);
  const actions = listItems(owner).find((entry) => entry.id === 'maint-furnace-filter').actions;
  for (const action of actions) {
    assert.equal(isAskActionApplicable({ action, operationId: 'DATA_POINT_READ', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true, action.id);
    assert.equal(isAskActionApplicable({ action, operationId: 'DATA_POINT_READ', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), false, action.id);
  }
});

test('an additive row never makes a row eligible and does not take an extra inline slot', () => {
  const task = (id, states) => ({ id, label: `Task ${id}`, entityType: 'MAINTENANCE_TASK', states });
  const result = enrich([task('a', ['maintenance:OPEN']), task('b', [])], { presentation: 'MAINTENANCE_RESULT_LIST' });
  assert.deepEqual(result.actionsByRowId.get('a').map((action) => action.id), ['complete-maintenance-task', 'reschedule-maintenance-task']);
  assert.equal(result.actionsByRowId.has('b'), false);
  const onlyAdditive = registry.ACTION_ENRICHMENT_REGISTRY.filter((entry) => entry.additive);
  assert.equal(enrich([task('a', ['maintenance:OPEN'])], { entries: onlyAdditive }).actionsByRowId.size, 0);
  const many = Array.from({ length: 7 }, (_, index) => task(`t${index}`, ['maintenance:OPEN']));
  assert.equal(enrich(many).actionsByRowId.size, registry.ACTION_ENRICHMENT_MAX_INLINE_ROWS, 'two actions on a row still count as one eligible row');
});

// ── inventory: Add missing details (last primary; never displaces Record warranty / Review replacement) ──
test('a row with missing brand/model/serial gets Add missing details for a contributor; a viewer and a complete row get none', () => {
  const missing = { id: 'a', label: 'Washer', entityType: 'INVENTORY_ITEM', states: ['details:MISSING'] };
  const owner = enrich([missing, { ...missing, id: 'b', states: [] }]);
  assert.deepEqual(owner.actionsByRowId.get('a').map((action) => [action.id, action.operationId, action.interactionType]), [['complete-missing-details-item', 'INVENTORY_ITEM_CORRECT', 'MUTATE_RECORD']]);
  assert.equal(owner.actionsByRowId.has('b'), false);
  assert.equal(enrich([missing], { role: 'VIEWER' }).actionsByRowId.size, 0);
  // The message is the one the inline detail's own action sends, so the destination handler recognises it.
  assert.match(owner.actionsByRowId.get('a')[0].message, /\b(?:complete|add|update|fill in)\b.{0,35}\bmissing details\b/i);
  // Record warranty and Review replacement keep priority on the same row.
  const both = enrich([{ ...missing, states: ['details:MISSING', 'warranty:NO_LINK_RECORDED'] }]);
  assert.deepEqual(both.actionsByRowId.get('a').map((action) => action.id), ['record-warranty-item']);
});

// ── shared "missing correctable fields" judgement + the widened semantic gate ──────────────────────────
const { missingCorrectableFields } = require('../../src/services/ask/support/inventoryMissingFields');

test('the shared judgement covers exactly the four correctable fields, in a fixed order; documents and coverage are not part of it', () => {
  assert.deepEqual(missingCorrectableFields({}), ['purchasedOn', 'brand', 'model', 'serialNo']);
  assert.deepEqual(missingCorrectableFields({ manufacturer: 'Bosch', modelNumber: 'X', serialNumber: 'S' }), ['purchasedOn']);
  assert.deepEqual(missingCorrectableFields({ brand: 'B', model: 'M', serialNo: 'S', purchasedOn: '2020-01-01' }), []);
});

test('a plain inventory list (no warranty or age in the question) offers Add missing details only on rows missing a correctable field, never for a viewer or a count', () => {
  const complete = item('c1', 'Complete Dryer', { brand: 'B', modelNumber: 'M', serialNumber: 'S', purchasedOn: '2020-01-01' });
  const noPurchase = item('c2', 'Undated Washer', { brand: 'B', modelNumber: 'M', serialNumber: 'S', purchasedOn: null });
  const snapshot = { ...SLICE_SEEDED_PROPERTY_SNAPSHOT, items: [complete, noPurchase] };
  const run = (rawText, role) => executeSemanticSlice({ rawText, snapshot, auth: { ...SLICE_OWNER_AUTH, role } });
  const owner = run('List my appliances', 'OWNER');
  const flagged = listItems(owner).filter((entry) => entry.actions?.some((action) => action.id === 'complete-missing-details-item'));
  assert.deepEqual(flagged.map((entry) => entry.title), ['Undated Washer']);
  assert.equal(listItems(run('List my appliances', 'VIEWER')).some((entry) => entry.actions?.length), false);
  const count = run('How many appliances do I have?', 'OWNER');
  assert.equal(count.operationResult.blocks.some((block) => block.type === 'GROUPED_LIST' && block.sections.some((section) => section.items.some((entry) => entry.actions?.length))), false);
});

test('an explicit no-coverage row gets Update coverage status (COVERAGE_COMMAND, item launch), never Record warranty; a viewer gets none', () => {
  const r = { id: 'a', label: 'Dishwasher', entityType: 'INVENTORY_ITEM', states: ['warranty:EXPLICIT_NO_COVERAGE', 'details:MISSING'] };
  const owner = enrich([r]);
  assert.deepEqual(owner.actionsByRowId.get('a').map((action) => [action.id, action.operationId, action.interactionType]), [['update-coverage-status-item', 'COVERAGE_COMMAND', 'MUTATE_RECORD']]);
  assert.equal(enrich([r], { role: 'VIEWER' }).actionsByRowId.size, 0);
});

test('contract: explicit no coverage -> confirmed CLEAR_NO_COVERAGE -> no link recorded -> Record warranty is offered', () => {
  const { classifyTransitionalWarrantyLinks } = require('../../src/services/ask/semantic/transitionalWarrantyRead');
  const input = { inventoryItemId: 'item-1', label: 'Dishwasher', propertyPlanWarrantyId: null, itemWarrantyIds: [] };
  const toRow = (read) => ({ id: read.inventoryItemId, label: read.label, entityType: 'INVENTORY_ITEM', states: [`warranty:${read.state}`] });
  const before = classifyTransitionalWarrantyLinks({ ...input, coverageEvidenceStatus: 'NONE' });
  assert.equal(before.state, 'EXPLICIT_NO_COVERAGE');
  assert.deepEqual(enrich([toRow(before)]).actionsByRowId.get('item-1').map((a) => a.id), ['update-coverage-status-item']);
  // The confirmed transition writes NONE -> UNKNOWN (guarded updateMany, covered in coverageCommands.test.js); the item then reads as unrecorded.
  const after = classifyTransitionalWarrantyLinks({ ...input, coverageEvidenceStatus: 'UNKNOWN' });
  assert.equal(after.state, 'NO_LINK_RECORDED');
  assert.deepEqual(enrich([toRow(after)]).actionsByRowId.get('item-1').map((a) => a.id), ['record-warranty-item']);
});
