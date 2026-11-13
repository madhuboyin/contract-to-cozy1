// FR-FACET-9(d): the follow-up that answers an inline clarification is merged into the stored parent turn: the chosen operation runs for that part as one more component of the SAME parent, the facets waiting on it run,
// the answered components are not run again, and the part leaves the deferred list.
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path');
require('ts-node/register/transpile-only');
const { runComposedTurn, resumeClarifiedComposedTurn } = require('../../src/services/ask/composition/runComposedTurn.ts');
const { findPendingComposedParent } = require('../../src/services/ask/composition/resumeClarification.ts');
const { withheldRuns } = require('../../src/services/ask/composition/withholding.ts');

function fakeDb(rows = []) {
  const table = new Map(rows.map((r) => [r.id, { ...r }])); const events = [];
  const matches = (row, where) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'in' in v ? v.in.includes(row[k]) : row[k] === v));
  return { table, events, askExecution: {
    async findUnique({ where }) { const r = table.get(where.id); return r ? { ...r } : null; },
    async findMany({ where, take }) { return [...table.values()].filter((r) => matches(r, where)).slice(0, take ?? 100).map((r) => ({ ...r })); },
    async update({ where, data }) { const r = table.get(where.id); Object.assign(r, data); return { ...r }; },
    async updateMany({ where, data }) { const hit = [...table.values()].filter((r) => matches(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; },
  }, askExecutionEvent: { async create({ data }) { events.push(data); return data; } } };
}
const NOW = new Date('2026-11-10T12:00:00Z');
const parentRow = (extra = {}) => ({ id: 'parent-1', userId: 'u1', clientRequestId: 'req-1', sessionId: 's1', propertyId: 'p1', status: 'RECEIVED', parentRole: null, assemblyVersion: null, parametersJson: null, resultJson: null, reasonCode: null, expiresAt: new Date('2026-12-10T12:00:00Z'), createdAt: NOW, ...extra });
const summary = (id, title) => ({ type: 'SUMMARY', id, title, body: title, tone: 'DEFAULT', actions: [] });
function children(db) {
  const calls = []; let n = 0;
  const createChild = async (userId, request, role, internal) => {
    calls.push({ message: request.message, operationId: request.launchContext.operationId }); const id = `child-${++n}`;
    db.table.set(id, { id, userId, clientRequestId: request.clientRequestId, status: 'ANSWERED', parentExecutionId: internal.composition.parentExecutionId, parentRole: 'COMPONENT', reasonCode: null,
      resultJson: { blocks: [summary(`answer-${n}`, `Answer for ${request.message}`)] }, parametersJson: { quantities: [], sources: [{ sourceType: 'InventoryItem', sourceId: 'i1' }] }, expiresAt: internal.composition.expiresAt });
    return { executionId: id, status: 'ANSWERED' };
  };
  return { createChild, calls };
}
const allowAll = async () => ({ propertyAccess: true, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: () => true });
const base = (db, createChild) => ({ db, userId: 'u1', parent: db.table.get('parent-1'), message: 'a compound question', sessionId: 's1', propertyId: 'p1', createChild, loadAuthorizationView: allowAll, executionTimeoutMs: 30_000, now: () => NOW });
const A = { clause: 'How old is my roof?', operationId: 'INVENTORY_LOOKUP', confidence: 0.95, facetId: 'a' };
const WAITING = { clause: 'What is going on with the house?', operationId: 'DATA_POINT_READ', confidence: 0.95, facetId: 'dep', dependsOn: ['c1'] };
const ASK = { clause: 'What is the status of the thing?', reason: 'NEEDS_CLARIFICATION', operationId: null, facetId: 'c1', options: [{ operationId: 'INVENTORY_LOOKUP', label: 'Look up an item' }, { operationId: 'DATA_POINT_READ', label: 'Read a detail' }] };

async function firstTurn() {
  const db = fakeDb([parentRow()]); const kids = children(db);
  const parent = await runComposedTurn({ ...base(db, kids.createChild), clauses: [A, WAITING], deferred: [ASK] });
  return { db, kids, parent };
}

test('a facet that depends on a part waiting on a clarification is held back until the clarification is resolved', async () => {
  const held = withheldRuns([{ key: 'dep', facetId: 'dep', dependsOn: ['c1'] }], () => null, new Set(['c1']));
  assert.equal(held.get('dep'), 'WAITING_FOR_CLARIFICATION');
  assert.equal(withheldRuns([{ key: 'dep', facetId: 'dep', dependsOn: ['c1'] }], () => null).size, 0, 'once the part is no longer waiting nothing holds it back');
  const { kids, parent } = await firstTurn();
  assert.deepEqual(kids.calls.map((c) => c.message), [A.clause], 'only the independent part ran; the dependent waits');
  assert.equal(parent.status, 'READY_WITH_LIMITATIONS');
  const blocks = parent.resultJson.blocks;
  assert.ok(blocks.some((b) => b.id === 'composite-clarify-1')); assert.match(blocks.find((b) => b.id === 'composite-not-answered').body, /held it back instead of guessing/);
});
test('the finder matches only this user, session and property, a settled unexpired turn, and the exact clause and chosen operation', async () => {
  const { db } = await firstTurn();
  const find = (extra = {}) => findPendingComposedParent(db, { userId: 'u1', sessionId: 's1', propertyId: 'p1', message: ASK.clause, operationId: 'INVENTORY_LOOKUP', now: NOW, ...extra });
  assert.equal((await find())?.id, 'parent-1');
  assert.equal((await find({ message: '  what is the STATUS of the thing?  ' }))?.id, 'parent-1', 'matched on normalised text');
  assert.equal(await find({ operationId: 'WARRANTY_LOOKUP' }), null, 'an operation that was not offered');
  assert.equal(await find({ message: 'Something else?' }), null);
  assert.equal(await find({ userId: 'u2' }), null); assert.equal(await find({ sessionId: 's2' }), null); assert.equal(await find({ propertyId: 'p2' }), null);
  assert.equal(await find({ now: new Date('2027-01-01T00:00:00Z') }), null, 'an expired turn');
});
test('the follow-up is merged into the same parent: the chosen part and the facet waiting on it run, the answered part is not run again, and nothing is left pending', async () => {
  const { db, kids } = await firstTurn(); const callsBefore = kids.calls.length;
  const merged = await resumeClarifiedComposedTurn({ ...base(db, kids.createChild), parent: db.table.get('parent-1'), clause: ASK.clause, selectedOperationId: 'INVENTORY_LOOKUP' });
  assert.ok(merged); assert.equal(merged.id, 'parent-1', 'the same parent, not a new turn');
  const newCalls = kids.calls.slice(callsBefore);
  assert.deepEqual(newCalls.map((c) => c.message).sort(), [ASK.clause, WAITING.clause].sort());
  assert.equal(newCalls.find((c) => c.message === ASK.clause).operationId, 'INVENTORY_LOOKUP');
  assert.ok(!newCalls.some((c) => c.message === A.clause), 'the already answered part is not run again');
  assert.equal(merged.status, 'ANSWERED');
  const titles = merged.resultJson.blocks.map((b) => b.title);
  for (const clause of [A.clause, ASK.clause, WAITING.clause]) assert.ok(titles.includes(`Answer for ${clause}`), clause);
  assert.ok(!merged.resultJson.blocks.some((b) => b.id === 'composite-clarify-1' || b.id === 'composite-not-answered'));
  assert.equal(merged.parametersJson.composition.deferred, undefined); assert.equal(merged.parametersJson.composition.clauses.length, 3);
  assert.ok(db.events.some((e) => e.eventType === 'COMPOSED_TURN_CLARIFIED'));
});
test('a clarification is merged once: the same click again, a choice that was never offered, a running or an expired parent all fall back to the ordinary path', async () => {
  const { db, kids } = await firstTurn();
  const resume = (extra = {}) => resumeClarifiedComposedTurn({ ...base(db, kids.createChild), parent: db.table.get('parent-1'), clause: ASK.clause, selectedOperationId: 'INVENTORY_LOOKUP', ...extra });
  assert.equal(await resume({ selectedOperationId: 'WARRANTY_LOOKUP' }), null, 'not one of the offered options');
  assert.equal(await resume({ clause: 'Another question?' }), null);
  assert.equal(await resume({ now: () => new Date('2027-01-01T00:00:00Z') }), null, 'expired');
  db.table.get('parent-1').status = 'RUNNING'; assert.equal(await resume(), null, 'still running'); db.table.get('parent-1').status = 'READY_WITH_LIMITATIONS';
  assert.ok(await resume()); assert.equal(await resume(), null, 'already merged');
});
test('createAskExecution hands a matching click to the merge only for an ordinary typed-or-clicked turn of this session and answers with the merged composite', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/services/ask/execution/createAskExecution.ts'), 'utf8');
  assert.match(src, /!internal\.composition && executionPropertyId && input\.launchContext\?\.operationId && !input\.suggestedActionSelection && input\.launchContext\.surface !== 'ASK_COMPOSED_COMPONENT'/);
  assert.match(src, /findPendingComposedParent\(prisma as never, \{ userId, sessionId: session\.id, propertyId: executionPropertyId/);
  assert.match(src, /reasonCode: 'COMPOSED_CLARIFICATION_MERGED'/); assert.match(src, /continuesExecutionId: waiting\.id/);
  assert.ok(src.indexOf('findPendingComposedParent(prisma') < src.indexOf('let declinedComposition'), 'the merge is tried before a new composition is started');
});
