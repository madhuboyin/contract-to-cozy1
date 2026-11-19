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
  assert.deepEqual([...result.actionsByRowId.keys()], ['ok', 'ok2']);
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
  assert.deepEqual(withAction.map((entry) => entry.title).sort(), ['Dryer', 'Washer']);
  for (const entry of withAction) {
    assert.equal(entry.entityType, 'INVENTORY_ITEM');
    assert.equal(entry.actions[0].id, 'record-warranty-item');
  }
  assert.ok(listItems(owner).some((entry) => entry.title === 'Dishwasher' && !entry.actions), 'an explicit "no coverage" item is not offered a conflicting record');
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
  assert.equal(listItems(owner).filter((entry) => entry.actions?.length).length, 7);
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
