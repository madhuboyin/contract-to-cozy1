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
