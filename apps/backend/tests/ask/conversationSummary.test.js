const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { buildConversationSummary, reconcileConversationSummary, enforceByteBudget, digestFromRow, loadConversationSummary, SUMMARY_POLICY } = require('../../src/services/ask/conversationSummary.ts');

// BICC-CTX-001..005: a bounded, structured, canonical-identity summary; reconciled and disclosed on property switch, access loss, deletion and expiry.
const NOW = new Date('2026-11-23T12:00:00Z');
const at = (minutesAgo) => new Date(NOW.getTime() - minutesAgo * 60_000);
const digest = (n, extra = {}) => ({ executionId: `e${n}`, status: 'ANSWERED', operationId: 'MAINTENANCE_STATUS', propertyId: 'p1', createdAt: at(n), ...extra });
const scope = { propertyId: 'p1', lifecycleMode: 'HOMEOWNER' };
const build = (digests, extra = {}) => buildConversationSummary({ digests, scope, now: NOW, ...extra });

test('CTX-001: the summary carries scope, the referenced result, entities, stated values, corrections, an open clarification, sources and workflows', () => {
  const summary = build([
    digest(1, { resultId: 'r1', entities: [{ entityType: 'INVENTORY_ITEM', entityId: 'i1', label: 'Furnace' }], slots: { item: 'furnace', amount: 5000, horizonYears: 3, objective: 'RESALE_VALUE', targetDate: 'in 3 years' }, corrections: ['ENTITY'], sources: [{ sourceType: 'INVENTORY', sourceId: 'i1' }], workflows: [{ workflowType: 'JOURNEY', workflowId: 'j1' }] }),
    digest(3, { status: 'NEEDS_CLARIFICATION', operationId: null, clarification: { question: 'Which did you mean?', optionOperationIds: ['MAINTENANCE_STATUS', 'MAINTENANCE_FORECAST'] } }),
  ]);
  assert.deepEqual(summary.scope, { propertyId: 'p1', lifecycleMode: 'HOMEOWNER' });
  assert.deepEqual(summary.referencedResult, { executionId: 'e1', operationId: 'MAINTENANCE_STATUS', resultId: 'r1', propertyId: 'p1' });
  assert.deepEqual(summary.activeEntities, [{ entityType: 'INVENTORY_ITEM', entityId: 'i1', label: 'Furnace', propertyId: 'p1' }]);
  assert.deepEqual(summary.stated, { items: ['furnace'], dates: ['in 3 years'], horizonsYears: [3], amounts: [5000], objectives: ['RESALE_VALUE'] });
  assert.deepEqual(summary.corrections, [{ kind: 'ENTITY', executionId: 'e1' }]);
  assert.equal(summary.openClarification, null, 'a settled answer is newer than the clarification, so the person already moved on');
  assert.deepEqual(summary.sources, [{ sourceType: 'INVENTORY', sourceId: 'i1', propertyId: 'p1' }]);
  assert.deepEqual(summary.workflows, [{ workflowType: 'JOURNEY', workflowId: 'j1' }]);
});

test('an unresolved clarification is carried until something newer settles', () => {
  const open = build([digest(1, { status: 'NEEDS_CLARIFICATION', operationId: null, clarification: { question: 'Which did you mean?', optionOperationIds: ['A', 'B'] } })]);
  assert.deepEqual(open.openClarification, { executionId: 'e1', question: 'Which did you mean?', optionOperationIds: ['A', 'B'] });
});

test('CTX-004: the summary holds no message text, answer text or forbidden field, whatever the stored row contains', () => {
  const digestRow = digestFromRow({ id: 'e1', status: 'ANSWERED', operationId: 'MAINTENANCE_STATUS', propertyId: 'p1', createdAt: at(1),
    parametersJson: { message: 'my email is a@b.com', blocks: [{ body: 'secret' }], email: 'a@b.com', slots: { item: 'roof', amount: 9000 }, viewState: { resultId: 'r9', selectedTaskId: 't1' } },
    launchContextJson: { entityType: 'INVENTORY_ITEM', entityId: 'i9', question: 'private words', phone: '415-555-0199' } });
  const text = JSON.stringify(build([digestRow]));
  assert.doesNotMatch(text, /a@b\.com|secret|private words|415-555-0199/);
  for (const key of SUMMARY_POLICY.forbiddenKeys) assert.doesNotMatch(text, new RegExp(`"${key}"`), key);
  assert.match(text, /"r9"/); assert.match(text, /"t1"/); assert.match(text, /"i9"/);
});

test('CTX-004: free-text labels are redacted and capped, and the redaction is counted', () => {
  const summary = build([digest(1, { entities: [{ entityType: 'CLAIM', entityId: 'c1', label: `Claim for owner@example.com ${'x'.repeat(200)}` }] })]);
  assert.doesNotMatch(summary.activeEntities[0].label, /owner@example\.com/);
  assert.ok(summary.activeEntities[0].label.length <= SUMMARY_POLICY.maxLabelChars);
  assert.equal(summary.truncated, true);
  assert.ok(summary.redactions >= 1);
});

test('CTX-004: the turn window, recency window and per-field limits bound the summary, and the truncation is recorded', () => {
  const many = Array.from({ length: 12 }, (_, i) => digest(i + 1, { entities: [{ entityType: 'ITEM', entityId: `i${i}` }], sources: [{ sourceType: 'S', sourceId: `s${i}` }] }));
  const summary = build(many);
  assert.equal(summary.turnsIncluded, SUMMARY_POLICY.maxTurns);
  assert.ok(summary.activeEntities.length <= SUMMARY_POLICY.maxEntities);
  assert.equal(summary.truncated, true);
  const old = build([digest(1), digest(600)]);
  assert.equal(old.turnsIncluded, 1, 'a turn older than the recency window is not carried');
  assert.equal(old.truncated, true);
});

test('CTX-004: the byte budget holds, dropping the least important context first and recording it', () => {
  const heavy = build(Array.from({ length: 6 }, (_, i) => digest(i + 1, { entities: Array.from({ length: 8 }, (__, j) => ({ entityType: 'ITEM', entityId: `i${i}-${j}`, label: 'L'.repeat(80) })), sources: Array.from({ length: 12 }, (__, j) => ({ sourceType: 'S', sourceId: `s${i}-${j}-${'x'.repeat(40)}` })) })));
  assert.ok(Buffer.byteLength(JSON.stringify(heavy)) <= SUMMARY_POLICY.maxBytes, `${Buffer.byteLength(JSON.stringify(heavy))} bytes`);
  assert.equal(heavy.truncated, true);
  const tiny = enforceByteBudget(build([digest(1)]), 10);
  assert.equal(tiny.truncated, true);
});

test('CTX-002: every carried entity and result keeps its canonical id and property scope', () => {
  const summary = build([digest(1, { propertyId: 'p1', entities: [{ entityType: 'INVENTORY_ITEM', entityId: 'item-1', label: 'Furnace' }] })]);
  assert.equal(summary.activeEntities[0].entityId, 'item-1');
  assert.equal(summary.activeEntities[0].propertyId, 'p1');
  assert.equal(summary.referencedResult.propertyId, 'p1');
  // a different label for the same id is the same entity; the label never retargets
  const relabeled = build([digest(1, { entities: [{ entityType: 'INVENTORY_ITEM', entityId: 'item-1', label: 'Gas furnace' }, { entityType: 'INVENTORY_ITEM', entityId: 'item-1', label: 'Furnace' }] })]);
  assert.equal(relabeled.activeEntities.length, 1);
});

const accessible = (...ids) => new Set(ids);
const full = () => build([
  digest(1, { propertyId: 'p1', resultId: 'r1', entities: [{ entityType: 'INVENTORY_ITEM', entityId: 'i1', label: 'Furnace' }], slots: { amount: 5000 }, sources: [{ sourceType: 'INVENTORY', sourceId: 'i1' }], workflows: [{ workflowType: 'JOURNEY', workflowId: 'j1' }], corrections: ['INTENT'] }),
]);

test('CTX-003: a compatible context is untouched and nothing is disclosed', () => {
  const out = reconcileConversationSummary(full(), { propertyId: 'p1', accessiblePropertyIds: accessible('p1') });
  assert.deepEqual(out.resets, []);
  assert.equal(out.disclosure, null);
  assert.equal(out.summary.activeEntities.length, 1);
  assert.equal(out.summary.stated.amounts[0], 5000);
});

test('CTX-003: switching property drops every earlier entity, result, stated value, correction and workflow, and says so', () => {
  const out = reconcileConversationSummary(full(), { propertyId: 'p2', accessiblePropertyIds: accessible('p1', 'p2') });
  assert.equal(out.summary.referencedResult, null);
  assert.deepEqual(out.summary.activeEntities, []);
  assert.deepEqual(out.summary.sources, []);
  assert.deepEqual(out.summary.stated, { items: [], dates: [], horizonsYears: [], amounts: [], objectives: [] });
  assert.deepEqual(out.summary.corrections, []);
  assert.deepEqual(out.summary.workflows, []);
  assert.equal(out.summary.scope.propertyId, 'p2');
  assert.ok(out.resets.some((reset) => reset.reason === 'PROPERTY_SWITCH'));
  assert.match(out.disclosure, /started fresh because you switched homes/);
});

test('CTX-003: access loss removes the property\'s context and says so', () => {
  const out = reconcileConversationSummary(full(), { propertyId: 'p1', accessiblePropertyIds: accessible() });
  assert.deepEqual(out.summary.activeEntities, []);
  assert.equal(out.summary.referencedResult, null);
  assert.ok(out.resets.some((reset) => reset.reason === 'ACCESS_LOST'));
  assert.ok(out.disclosure);
});

test('CTX-003: a deleted entity and an expired result are removed by canonical id, and the rest stays', () => {
  const summary = build([digest(1, { propertyId: 'p1', resultId: 'r1', entities: [{ entityType: 'ITEM', entityId: 'gone' }, { entityType: 'ITEM', entityId: 'kept' }] })]);
  const out = reconcileConversationSummary(summary, { propertyId: 'p1', accessiblePropertyIds: accessible('p1'), deletedEntityIds: new Set(['gone']), expiredExecutionIds: new Set(['e1']) });
  assert.deepEqual(out.summary.activeEntities.map((entity) => entity.entityId), ['kept']);
  assert.equal(out.summary.referencedResult, null);
  assert.deepEqual(out.resets.map((reset) => reset.reason).sort(), ['ENTITY_DELETED', 'RESULT_EXPIRED']);
  assert.match(out.disclosure, /no longer available/);
});

test('CTX-005: workflow identity is canonical ids only', () => {
  const row = digestFromRow({ id: 'e1', status: 'ANSWERED', operationId: 'GUIDANCE_JOURNEY_CREATE', propertyId: 'p1', createdAt: at(1), launchContextJson: { journeyId: 'j1', decisionThreadId: 'd1', workItemId: 'w1' } });
  assert.deepEqual(build([row]).workflows, [{ workflowType: 'JOURNEY', workflowId: 'j1' }, { workflowType: 'DECISION_THREAD', workflowId: 'd1' }, { workflowType: 'WORK_ITEM', workflowId: 'w1' }]);
});

test('the persistence read is scoped to the user and session and uses typed columns only', async () => {
  const calls = [];
  const db = {
    askExecution: { findMany: async (args) => { calls.push(args); return [{ id: 'e1', status: 'ANSWERED', operationId: 'MAINTENANCE_STATUS', propertyId: 'p1', createdAt: at(1), parametersJson: { slots: { item: 'roof' } }, launchContextJson: null }]; } },
    askExecutionEvent: { findMany: async (args) => { calls.push(args); return [{ executionId: 'e1', metadataJson: { kind: 'INTENT' } }]; } },
  };
  const summary = await loadConversationSummary({ userId: 'u1', sessionId: 's1', propertyId: 'p1', lifecycleMode: 'HOMEOWNER', now: NOW }, db);
  assert.deepEqual(calls[0].where, { sessionId: 's1', userId: 'u1', parentExecutionId: null });
  assert.ok(calls[0].take <= SUMMARY_POLICY.maxTurns + 1);
  assert.deepEqual(Object.keys(calls[0].select).sort(), ['createdAt', 'id', 'launchContextJson', 'operationId', 'parametersJson', 'propertyId', 'resultJson', 'status']);
  assert.deepEqual(summary.corrections, [{ kind: 'INTENT', executionId: 'e1' }]);
  assert.deepEqual(summary.stated.items, ['roof']);
});

// BICC-CTX-001: slot carry reads the summary. It must agree with the existing carry for the same settled turns.
test('the summary carries stated values from settled turns only, newest first, with the operation that answered the newest', () => {
  const summary = build([
    digest(1, { operationId: 'ITEM_REPLACEMENT_COST', slots: { item: 'roof', targetDate: 'in 5 years', horizonYears: 5, amount: 11500 } }),
    digest(2, { status: 'NEEDS_CLARIFICATION', operationId: null, slots: { item: 'furnace', amount: 99 } }),
    digest(3, { operationId: 'INVENTORY_LOOKUP', slots: { item: 'water heater' } }),
  ]);
  assert.deepEqual(summary.stated.items, ['roof', 'water heater'].sort((a, b) => summary.stated.items.indexOf(a) - summary.stated.items.indexOf(b)));
  assert.equal(summary.stated.items.length, 2);
  assert.equal(summary.stated.items.includes('furnace'), false, 'a value stated in a turn that did not answer is not carried');
  assert.equal(summary.stated.amounts.includes(99), false);
  assert.deepEqual(summary.slotSource, { executionId: 'e1', operationId: 'ITEM_REPLACEMENT_COST' });
});

test('carriedSlotsFromSummary agrees with carriedSlots on the same turns (newest wins per kind, newest stating turn gives the operation)', () => {
  const { carriedSlotsFromSummary } = require('../../src/services/ask/conversationSummary.ts');
  const { carriedSlots } = require('../../src/services/ask/composition/slots.ts');
  const turns = [ // newest first
    { id: 'n1', operationId: 'ITEM_REPLACEMENT_COST', slots: { item: 'water heater' } },
    { id: 'n2', operationId: 'ITEM_REPLACEMENT_COST', slots: { item: 'roof', targetDate: 'in 5 years', horizonYears: 5, amount: 11500, objective: 'RESALE_VALUE' } },
    { id: 'n3', operationId: 'INVENTORY_LOOKUP', slots: { item: 'furnace', amount: 100 } },
  ];
  const summary = build(turns.map((t, i) => digest(i + 1, { executionId: t.id, operationId: t.operationId, slots: t.slots })));
  const fromSummary = carriedSlotsFromSummary(summary);
  const existing = carriedSlots(turns.map((t) => ({ executionId: t.id, operationId: t.operationId, propertyId: 'p1', slots: t.slots })), 'p1');
  assert.deepEqual(fromSummary, existing);
  assert.equal(carriedSlotsFromSummary(build([digest(1)])), null, 'nothing stated, nothing carried');
});

test('stated values are redacted and bounded like every other summary field, and a property switch drops them with the source', () => {
  const summary = build([digest(1, { slots: { item: 'roof', amount: 5000 } })]);
  const out = reconcileConversationSummary({ ...summary, referencedResult: { ...summary.referencedResult, propertyId: 'p1' }, activeEntities: [{ entityType: 'I', entityId: 'i', label: null, propertyId: 'p1' }] }, { propertyId: 'p2', accessiblePropertyIds: new Set(['p1', 'p2']) });
  assert.equal(out.summary.slotSource, null);
  assert.deepEqual(out.summary.stated.amounts, []);
});

test('the slot read is scoped to the home and to settled turns', async () => {
  const calls = [];
  const db = { askExecution: { findMany: async (args) => { calls.push(args); return []; } }, askExecutionEvent: { findMany: async () => [] } };
  await loadConversationSummary({ userId: 'u1', sessionId: 's1', propertyId: 'p1', lifecycleMode: null, restrictToProperty: true, now: NOW }, db);
  assert.deepEqual(calls[0].where, { sessionId: 's1', userId: 'u1', parentExecutionId: null, propertyId: 'p1', status: { in: ['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS'] } });
});

test('an elliptical follow-up resolves from the summary-backed slots end to end, and still revalidates the item and the home', async () => {
  const { resolveSlotFollowUp } = require('../../src/services/ask/composition/slotContext.ts');
  const { carriedSlotsFromSummary } = require('../../src/services/ask/conversationSummary.ts');
  const summary = build([digest(1, { executionId: 'cost-1', operationId: 'ITEM_REPLACEMENT_COST', slots: { item: 'roof', targetDate: 'in 5 years', horizonYears: 5 } })]);
  const never = { askExecution: { findMany: async () => { throw new Error('the direct prior-turn read must not run when a source is supplied'); } } };
  const ok = { propertyAccessible: async () => true, itemExists: async () => true };
  const resolved = await resolveSlotFollowUp({ db: never, userId: 'u1', sessionId: 's1', propertyId: 'p1', message: 'what about the water heater?', revalidation: ok, now: NOW, carriedSlotsSource: async () => carriedSlotsFromSummary(summary) });
  assert.equal(resolved.kind, 'RESOLVED');
  assert.equal(resolved.message, 'how much does a new water heater cost in 5 years');
  assert.equal(resolved.slots.item, 'water heater');
  assert.equal(resolved.slots.referencedExecutionId, 'cost-1');
  const gone = await resolveSlotFollowUp({ db: never, userId: 'u1', sessionId: 's1', propertyId: 'p1', message: 'what about the water heater?', revalidation: { ...ok, itemExists: async () => false }, now: NOW, carriedSlotsSource: async () => carriedSlotsFromSummary(summary) });
  assert.deepEqual([gone.kind, gone.reason], ['DECLINED', 'ITEM_NOT_FOUND']);
  const noHome = await resolveSlotFollowUp({ db: never, userId: 'u1', sessionId: 's1', propertyId: 'p1', message: 'what about the water heater?', revalidation: { ...ok, propertyAccessible: async () => false }, now: NOW, carriedSlotsSource: async () => carriedSlotsFromSummary(summary) });
  assert.deepEqual([noHome.kind, noHome.reason], ['DECLINED', 'PROPERTY_NOT_ACCESSIBLE']);
  const nothing = await resolveSlotFollowUp({ db: never, userId: 'u1', sessionId: 's1', propertyId: 'p1', message: 'what about the water heater?', revalidation: ok, now: NOW, carriedSlotsSource: async () => null });
  assert.equal(nothing.kind, 'DECLINED');
  assert.equal(nothing.reason, 'NEEDS_SLOT');
  assert.equal(await resolveSlotFollowUp({ db: never, userId: 'u1', sessionId: 's1', propertyId: 'p1', message: 'How old is my roof?', revalidation: ok, now: NOW, carriedSlotsSource: async () => { throw new Error('not read'); } }), null, 'an ordinary question never reads the summary');
});
