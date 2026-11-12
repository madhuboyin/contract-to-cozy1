const test = require('node:test'); const assert = require('node:assert/strict');
const { wilson, zeroFailureSampleSize, minSampleForLowerBound, familyCounts, clusterBootstrapLowerBound, gate } = require('../../scripts/lib/askGateStats.js');
test('wilson matches known values and rejects bad counts', () => {
  const w = wilson(60, 60, 1.644854); assert.ok(Math.abs(w.lo - 0.9604) < 0.01, `${w.lo}`);
  assert.throws(() => wilson(5, 4), RangeError);
});
test('the FRD sample sizes: 381 / 189 / 35 zero-failure families for 1% / 2% / 10% bounds; 35 / 53 / 69 for a 90% lower bound with 0 / 1 / 2 failures', () => {
  assert.equal(zeroFailureSampleSize(0.01), 381); assert.equal(zeroFailureSampleSize(0.02), 189); assert.equal(zeroFailureSampleSize(0.1), 35);
  assert.equal(minSampleForLowerBound(0.9, 0), 35); assert.equal(minSampleForLowerBound(0.9, 1), 53); assert.equal(minSampleForLowerBound(0.9, 2), 69);
});
test('family counts and the gate carry their evidence', () => {
  const rows = [{ f: 'a', ok: true }, { f: 'a', ok: false }, { f: 'b', ok: true }];
  assert.deepEqual(familyCounts(rows, (r) => r.f, (r) => r.ok), [{ family: 'a', honored: 1, total: 2 }, { family: 'b', honored: 1, total: 1 }]);
  const g = gate({ honored: 94, total: 100 }); assert.equal(g.pass, false); assert.equal(gate({ honored: 99, total: 100 }).pass, true);
});
test('cluster bootstrap is reproducible, below the mean, and widens with fewer families', () => {
  const fam = (n, v) => Array.from({ length: n }, (_, i) => ({ family: `f${i}`, values: [v + (i % 3 === 0 ? -0.2 : 0.02), v] }));
  const a = clusterBootstrapLowerBound(fam(60, 0.95)); const b = clusterBootstrapLowerBound(fam(60, 0.95));
  assert.deepEqual(a, b); assert.ok(a.lower < a.mean);
  assert.ok(clusterBootstrapLowerBound(fam(8, 0.95)).lower < a.lower);
});
