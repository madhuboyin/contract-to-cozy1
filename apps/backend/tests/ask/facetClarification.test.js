// FR-FACET-9: independent facets answer while an uncertain facet is asked about inline; the facets that depend on an unresolved facet are withheld with a reason (never run on a guess); a part that writes is offered its own
// control instead of running inside the composed answer.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { runComposedTurn } = require('../../src/services/ask/composition/runComposedTurn.ts');
const { decideStatus } = require('../../src/services/ask/composition/compositeResult.ts');
const { withheldRuns } = require('../../src/services/ask/composition/withholding.ts');
const { decomposeForComposition } = require('../../src/services/ask/composition/decompose.ts');

function fakeDb(rows = []) {
  const table = new Map(rows.map((r) => [r.id, { ...r }])); const events = [];
  const matches = (row, where) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'in' in v ? v.in.includes(row[k]) : row[k] === v));
  return { table, events, askExecution: {
    async findUnique({ where }) { const r = table.get(where.id); return r ? { ...r } : null; },
    async findMany({ where }) { return [...table.values()].filter((r) => matches(r, where)).map((r) => ({ ...r })); },
    async update({ where, data }) { const r = table.get(where.id); Object.assign(r, data); return { ...r }; },
    async updateMany({ where, data }) { const hit = [...table.values()].filter((r) => matches(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; },
  }, askExecutionEvent: { async create({ data }) { events.push(data); return data; } } };
}
const NOW = new Date('2026-11-10T12:00:00Z');
const parentRow = () => ({ id: 'parent-1', userId: 'u1', clientRequestId: 'req-1', sessionId: 's1', propertyId: 'p1', status: 'RECEIVED', assemblyVersion: null, parametersJson: null, resultJson: null, reasonCode: null, expiresAt: new Date('2026-12-10T12:00:00Z'), createdAt: NOW });
const summary = (id, title) => ({ type: 'SUMMARY', id, title, body: title, tone: 'DEFAULT', actions: [] });
// each facet's own answer; `script(facetKey)` can turn one into a clarification or a failure
function children(db, script = () => null) {
  const calls = []; let n = 0;
  const createChild = async (userId, request, role, internal) => {
    const operationId = request.launchContext.operationId; calls.push(request.message);
    const status = script(request.message) ?? 'ANSWERED'; const id = `child-${++n}`;
    const answered = status === 'ANSWERED';
    db.table.set(id, { id, userId, clientRequestId: request.clientRequestId, status, parentExecutionId: internal.composition.parentExecutionId, parentRole: 'COMPONENT', reasonCode: null,
      resultJson: { blocks: answered ? [summary(`answer-${n}`, `Answer for ${request.message}`)] : [summary('need-detail', `Which one for ${request.message}?`)] }, parametersJson: answered ? { quantities: [], sources: [{ sourceType: 'InventoryItem', sourceId: 'i1' }] } : null, expiresAt: internal.composition.expiresAt });
    return { executionId: id, status };
  };
  return { createChild, calls };
}
const allowAll = async () => ({ propertyAccess: true, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: () => true });
const run = (db, createChild, clauses, extra = {}) => runComposedTurn({ db, userId: 'u1', parent: db.table.get('parent-1'), message: 'a compound question', sessionId: 's1', propertyId: 'p1', clauses, createChild, loadAuthorizationView: allowAll, executionTimeoutMs: 30_000, now: () => NOW, ...extra });
const A = { clause: 'How old is my roof?', operationId: 'INVENTORY_LOOKUP', confidence: 0.95, facetId: 'a' };
const B = { clause: 'What would a new one cost?', operationId: 'ITEM_REPLACEMENT_COST', confidence: 0.95, facetId: 'b', dependsOn: ['a'] };
const C = { clause: 'When does my policy expire?', operationId: 'DATA_POINT_READ', confidence: 0.95, facetId: 'c' };
const D = { clause: 'And how much per month to save for it?', operationId: 'CAPITAL_ITEM_FUNDING_GOAL', confidence: 0.95, facetId: 'd', dependsOn: ['b'] };

test('the status decision: an answered facet is delivered beside a clarification; nothing answered asks it alone', () => {
  assert.equal(decideStatus(['CLARIFICATION', 'ANSWERED']).kind, 'COMPOSITE');
  assert.equal(decideStatus(['CLARIFICATION', 'WITHHELD', 'ANSWERED']).kind, 'COMPOSITE');
  assert.deepEqual(decideStatus(['CLARIFICATION', 'WITHHELD']), { kind: 'CLARIFY_ALONE', clauseIndex: 0 });
  assert.deepEqual(decideStatus(['CLARIFICATION', 'FAILED']), { kind: 'CLARIFY_ALONE', clauseIndex: 0 });
  assert.equal(decideStatus(['WITHHELD', 'FAILED']).kind, 'NONE_ANSWERED');
  assert.equal(decideStatus(['ANSWERED', 'WITHHELD']).coverage, 'PARTIAL');
});
test('withholding is transitive and only for a facet that has not run', () => {
  const runs = [{ key: 'a', facetId: 'a' }, { key: 'b', facetId: 'b', dependsOn: ['a'] }, { key: 'c', facetId: 'c' }, { key: 'd', facetId: 'd', dependsOn: ['b'] }];
  const held = withheldRuns(runs, (key) => ({ a: 'CLARIFICATION', c: 'ANSWERED' }[key] ?? null));
  assert.deepEqual([...held.entries()].sort(), [['b', 'WAITING_FOR_CLARIFICATION'], ['d', 'WAITING_FOR_CLARIFICATION']]);
  assert.equal(withheldRuns(runs, (key) => ({ a: 'FAILED' }[key] ?? null)).get('b'), 'PREDECESSOR_FAILED');
  assert.equal(withheldRuns(runs, (key) => ({ a: 'ANSWERED' }[key] ?? null)).size, 0, 'a resolved predecessor holds nothing back');
  assert.equal(withheldRuns(runs, (key) => ({ a: 'CLARIFICATION', b: 'ANSWERED' }[key] ?? null)).has('b'), false, 'a facet that already ran is never withheld');
});
test('a dependent of a facet that needs a clarification is never run: the independent facet answers, the question is asked, the dependent (and its dependent) are named as held back', async () => {
  const db = fakeDb([parentRow()]); const { createChild, calls } = children(db, (message) => (message === A.clause ? 'NEEDS_CLARIFICATION' : null));
  const parent = await run(db, createChild, [A, B, C, D]);
  assert.deepEqual(calls.sort(), [A.clause, C.clause].sort(), 'only the clarifying facet and the independent one ran');
  assert.equal(parent.status, 'READY_WITH_LIMITATIONS'); const blocks = parent.resultJson.blocks;
  assert.ok(blocks.some((b) => b.title === `Answer for ${C.clause}`), 'the independent facet is answered');
  assert.ok(blocks.some((b) => b.id === 'need-detail'), 'the clarification question is shown inline');
  const note = blocks.find((b) => b.id === 'composite-not-answered');
  assert.match(note.body, new RegExp(B.clause.replace('?', '\\?'))); assert.match(note.body, new RegExp(D.clause.replace('?', '\\?')));
  assert.match(note.body, /held it back instead of guessing/); assert.deepEqual(note.actions, [], 'a clarification is not a failure');
  const states = Object.fromEntries(parent.resultJson.selection.map((s) => [s.operationId, s.state]));
  assert.equal(states.ITEM_REPLACEMENT_COST, 'WITHHELD'); assert.equal(states.CAPITAL_ITEM_FUNDING_GOAL, 'WITHHELD'); assert.equal(states.DATA_POINT_READ, 'ANSWERED');
});
test('when nothing independent answered, the clarification is asked alone and the dependent is not run', async () => {
  const db = fakeDb([parentRow()]); const { createChild, calls } = children(db, () => 'NEEDS_CLARIFICATION');
  const parent = await run(db, createChild, [A, B]);
  assert.deepEqual(calls, [A.clause]); assert.equal(parent.status, 'NEEDS_CLARIFICATION');
});
test('a dependent of a facet that failed is held back with its own reason', async () => {
  const db = fakeDb([parentRow()]); const { createChild, calls } = children(db, (message) => (message === A.clause ? 'FAILED_TERMINAL' : null));
  const parent = await run(db, createChild, [A, B, C]);
  assert.ok(!calls.includes(B.clause)); const note = parent.resultJson.blocks.find((b) => b.id === 'composite-not-answered');
  assert.match(note.body, /could not be answered right now, so I held it back/);
});
test('an uncertain part is asked about inline with its options, beside the answered parts, and is not reported as a failure', async () => {
  const db = fakeDb([parentRow()]); const { createChild } = children(db);
  const deferred = [{ clause: 'What is going on with the house?', reason: 'NEEDS_CLARIFICATION', operationId: null, options: [{ operationId: 'HOME_ACTIONS', label: 'See what needs attention' }, { operationId: 'HOME_CHANGE_SUMMARY', label: 'See what changed lately' }] }];
  const parent = await run(db, createChild, [A, C], { deferred }); const blocks = parent.resultJson.blocks;
  const ask = blocks.find((b) => b.id === 'composite-clarify-1');
  assert.ok(ask); assert.deepEqual(ask.actions.map((a) => [a.operationId, a.message]), [['HOME_ACTIONS', 'What is going on with the house?'], ['HOME_CHANGE_SUMMARY', 'What is going on with the house?']]);
  const note = blocks.find((b) => b.id === 'composite-not-answered'); assert.equal(note.title, 'One part needs a detail'); assert.deepEqual(note.actions, []);
  assert.ok(blocks.some((b) => b.title === `Answer for ${A.clause}`));
});
test('a part that writes is not run inside the composed answer; it gets its own start control, beside capability discovery', async () => {
  const db = fakeDb([parentRow()]); const { createChild, calls } = children(db);
  const deferred = [{ clause: 'Add a task to clean the gutters?', reason: 'NOT_COMPOSABLE', operationId: 'MAINTENANCE_TASK_CREATE' }];
  const parent = await run(db, createChild, [A, C], { deferred });
  assert.ok(!calls.includes('Add a task to clean the gutters?'), 'the write is never started here');
  const note = parent.resultJson.blocks.find((b) => b.id === 'composite-not-answered');
  const start = note.actions.find((a) => a.operationId === 'MAINTENANCE_TASK_CREATE');
  assert.ok(start && /^Start: /.test(start.label) && start.message === 'Add a task to clean the gutters?');
  assert.ok(note.actions.some((a) => a.operationId === 'CAPABILITY_DISCOVERY'));
  assert.ok(!JSON.stringify(parent.resultJson.blocks.filter((b) => b.id.startsWith('s'))).includes('MAINTENANCE_TASK_CREATE'), 'no write offer inside a delivered section');
});
test('deterministic decomposition turns an ambiguous part into an inline clarification with at least two read options', () => {
  const outcome = decomposeForComposition('how old is my roof, what would a new one cost, and what about the water heater situation', {});
  assert.equal(outcome.kind, 'COMPOSE');
  const part = outcome.deferred.find((d) => d.reason === 'NEEDS_CLARIFICATION');
  assert.ok(part && part.options.length >= 2 && part.options.length <= 3);
  assert.ok(new Set(part.options.map((o) => o.operationId)).size === part.options.length);
  // an option must be something the composed answer can run once it is chosen: a candidate that is not a composable read is never offered
  const { getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
  for (const option of part.options) assert.equal(getAskOperationDefinition(option.operationId).composableRead, true, option.operationId);
  // an ambiguous part whose candidates cannot run inside a composed answer is not asked about inline (it is named as not answered, as before)
  const unrunnable = decomposeForComposition('how old is my roof, what would a new one cost, and what is going on with the house', {});
  assert.ok(!(unrunnable.deferred ?? []).some((d) => d.reason === 'NEEDS_CLARIFICATION'));
});
