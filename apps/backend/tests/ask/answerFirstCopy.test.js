// The line under the answer-first sentence counts what was asked: one, two or up to six parts, and parts that were held back, asked about or not answered. "Both" is only said of exactly two answered parts.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { runComposedTurn, answerFirstFallback } = require('../../src/services/ask/composition/runComposedTurn.ts');

test('the copy follows the number of parts answered and the number that were not', () => {
  assert.equal(answerFirstFallback(1, 0, false), 'Your question is answered below.');
  assert.equal(answerFirstFallback(2, 0, false), 'Both parts of your question are answered below.');
  assert.equal(answerFirstFallback(3, 0, false), 'All 3 parts of your question are answered below.');
  assert.equal(answerFirstFallback(6, 0, false), 'All 6 parts of your question are answered below.');
  assert.equal(answerFirstFallback(1, 0, true), 'Your question is addressed below, including the limits of what is recorded for this home.');
  assert.equal(answerFirstFallback(2, 0, true), 'Both parts are addressed below, including the limits of what is recorded for this home.');
  assert.equal(answerFirstFallback(4, 0, true), 'All 4 parts are addressed below, including the limits of what is recorded for this home.');
  assert.equal(answerFirstFallback(2, 1, true), '2 of your 3 parts are addressed below, including the limits of what is recorded for this home. The rest is explained after them.');
  assert.equal(answerFirstFallback(1, 2, true), '1 of your 3 parts are addressed below, including the limits of what is recorded for this home. The rest are explained after it.');
  for (const [a, o, s] of [[1, 0, false], [3, 0, false], [2, 1, false], [5, 0, true]]) if (a !== 2 || o) assert.doesNotMatch(answerFirstFallback(a, o, s), /\bBoth\b/, `${a}/${o}/${s}`);
});

function fakeDb(rows) { const table = new Map(rows.map((r) => [r.id, { ...r }])); const events = [];
  const matches = (row, where) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'in' in v ? v.in.includes(row[k]) : row[k] === v));
  return { table, events, askExecution: { async findUnique({ where }) { const r = table.get(where.id); return r ? { ...r } : null; }, async findMany({ where }) { return [...table.values()].filter((r) => matches(r, where)).map((r) => ({ ...r })); }, async update({ where, data }) { const r = table.get(where.id); Object.assign(r, data); return { ...r }; }, async updateMany({ where, data }) { const hit = [...table.values()].filter((r) => matches(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; } }, askExecutionEvent: { async create({ data }) { events.push(data); return data; } } }; }
const NOW = new Date('2026-11-10T12:00:00Z');
async function compose(clauses, deferred = [], statusFor = () => 'ANSWERED') {
  const db = fakeDb([{ id: 'parent-1', userId: 'u1', clientRequestId: 'req-1', sessionId: 's1', propertyId: 'p1', status: 'RECEIVED', parentRole: null, assemblyVersion: null, parametersJson: null, resultJson: null, reasonCode: null, expiresAt: new Date('2026-12-10T12:00:00Z'), createdAt: NOW }]); let n = 0;
  const createChild = async (userId, request, role, internal) => { const status = statusFor(request.message); const id = `child-${++n}`; const ok = status === 'ANSWERED';
    db.table.set(id, { id, userId, clientRequestId: request.clientRequestId, status, parentExecutionId: internal.composition.parentExecutionId, parentRole: 'COMPONENT', reasonCode: null, resultJson: { blocks: [{ type: 'SUMMARY', id: ok ? `a${n}` : 'need', title: ok ? `Answer ${n}` : 'Which one?', body: 'x', tone: 'DEFAULT', actions: [] }] }, parametersJson: ok ? { quantities: [], sources: [{ sourceType: 'InventoryItem', sourceId: 'i1' }] } : null, expiresAt: internal.composition.expiresAt }); return { executionId: id, status }; };
  const parent = await runComposedTurn({ db, userId: 'u1', parent: db.table.get('parent-1'), message: 'q', sessionId: 's1', propertyId: 'p1', createChild, loadAuthorizationView: async () => ({ propertyAccess: true, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: () => true }), executionTimeoutMs: 30000, now: () => NOW, clauses, deferred });
  return parent.resultJson.blocks.find((b) => b.id === 'composite-answer-first')?.body;
}
const mk = (i, extra = {}) => ({ clause: `Clause ${i}?`, operationId: 'DATA_POINT_READ', confidence: 0.9, dataPointId: 'item.installedOn', entityRef: `thing${i}`, facetId: `f${i}`, ...extra });
test('a composed answer of one, two, three and five parts says so', async () => {
  assert.equal(await compose([mk(1)]), 'Your question is answered below.');
  assert.equal(await compose([mk(1), mk(2)]), 'Both parts of your question are answered below.');
  assert.equal(await compose([mk(1), mk(2), mk(3)]), 'All 3 parts of your question are answered below.');
  assert.equal(await compose([1, 2, 3, 4, 5].map((i) => mk(i))), 'All 5 parts of your question are answered below.');
});
test('when a part was held back or asked about, the line counts answered against asked', async () => {
  const deferred = [{ clause: 'What about the water heater situation?', reason: 'NEEDS_CLARIFICATION', operationId: null, options: [{ operationId: 'INVENTORY_LOOKUP', label: 'a' }, { operationId: 'DATA_POINT_READ', label: 'b' }] }];
  assert.match(await compose([mk(1), mk(2)], deferred), /^2 of your 3 parts are answered below\. The rest is explained after them\.$/);
  assert.match(await compose([mk(1), mk(2), mk(3, { dependsOn: ['f2'] })], [], (message) => (message === 'Clause 2?' ? 'NEEDS_CLARIFICATION' : 'ANSWERED')), /^1 of your 3 parts are answered below\. The rest are explained after it\.$|^2 of your 3 parts/);
});
