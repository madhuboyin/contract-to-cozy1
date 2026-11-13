// Owner reachability ratchet (reliability FRD FR-DATA-3): every catalogued data point has at least one generated owner phrasing that the real router and resolvers send to its read path, and the canonical query-shape
// questions plan to their shape. SYNTHETIC phrasings, offline: this guards alias/cue/routing mechanics against regression; it does not measure how real owners phrase things and says nothing about the 90% objective.
const test = require('node:test'); const assert = require('node:assert/strict');
const { measure } = require('../../scripts/lib/askOwnerReachability.js');
const m = measure();
test('no catalogued data point is unreachable, and every domain keeps its recorded reachable count (2026-11-13)', () => {
  assert.deepEqual(m.unreachable, [], 'every catalogued id has a phrasing that resolves to it');
  const reachable = Object.fromEntries([...m.byDomain.entries()].map(([d, v]) => [d, v.reachable]));
  const MIN = { 'appliances-inventory': 12, buyer: 11, claims: 16, 'documents-records': 8, insurance: 7, maintenance: 7, 'reserve-ownership-costs': 14, 'seller-prep': 13, warranties: 5 };
  for (const [domain, min] of Object.entries(MIN)) assert.ok((reachable[domain] ?? 0) >= min, `${domain}: ${reachable[domain]} < ${min}`);
  const resolvesOnly = [...m.byDomain.values()].reduce((s, v) => s + v.resolvesOnlyPoints, 0);
  assert.ok(resolvesOnly <= 2, `points answered only through another operation: ${resolvesOnly}`);
});
test('every canonical query-shape question plans to the intended shape for the five templates', () => {
  assert.deepEqual(m.queryRows.filter((r) => !r.ok).map((r) => r.message), []);
  const unrouted = m.queryRows.filter((r) => r.operation !== 'DATA_POINT_READ').map((r) => `${r.template}/${r.shape}`);
  // only plain lists and date filters owned by dedicated operations (warranty and coverage lookups, the maintenance status read) may stay with them
  for (const u of unrouted) assert.match(u, /^(warranties|policies|tasks)\/(LIST|FILTER)$/, `${u} must be owned by a dedicated operation`);
});

// ---- maintenance phrasing fixes (2026-11-13) ----
const { resolveDataPoint } = require('../../src/services/ask/dataPoint/dataPointCatalogue.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
test('maintenance: natural owner questions about a named task reach the data point; the status read keeps due date and status; a deadline monitor is not made from a detail question', () => {
  const route = (q) => resolveAskOperation(q).operationId;
  for (const q of ['What is the priority of my gutter cleaning task?', 'How much did the gutter cleaning task cost?', 'What is the estimated cost of my gutter cleaning task?', 'When did I last complete my gutter cleaning task?', 'Tell me the priority of my gutter cleaning task.', 'When is my gutter cleaning due?']) assert.equal(route(q), 'DATA_POINT_READ', q);
  assert.equal(resolveDataPoint('When is my gutter cleaning due?')?.id, 'task.nextDueDate', 'a due-date question needs no task word');
  // the "due" cue never claims another kind of record: those stay with their own routes (or the ratchets that own them)
  for (const q of ['When is my warranty due?', 'When is my insurance due?', 'when is my inspection contingency due', 'When is my buyer task due?']) assert.notEqual(resolveDataPoint(q)?.id, 'task.nextDueDate', q);
  assert.equal(route('What is the status of my gutter cleaning task?'), 'MAINTENANCE_STATUS', 'status and due date of a task stay with the maintenance status read');
  const d = m.byDomain.get('maintenance'); assert.ok(d.routed / d.phrasings >= 0.8, `maintenance phrasing honor ${d.routed}/${d.phrasings}`);
});
