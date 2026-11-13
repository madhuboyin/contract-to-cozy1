// FR-UND-14: the two-stage availability expectation is summed over failure subsets F of {1..S}, per prompt and per facet, and the gate bound carries the uncertainty of its inputs.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const m = require('../../src/services/ask/modelRouting/availabilityModel.ts');
const close = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const B = m.AVAILABILITY_SCENARIOS.baseline;

test('optimistic is the FRD scenario (99.99 / 99.9 / 99.9), not certainty; subsets are 2^S and capped at 6 calls', () => {
  assert.deepEqual(m.AVAILABILITY_SCENARIOS.optimistic, { p: 0.9999, qd: 0.999, qt: 0.999 });
  assert.equal(m.failureSubsets(3).length, 8); assert.equal(m.failureSubsets(6).length, 64); assert.equal(m.failureSubsets(3)[0].size, 0); assert.equal(m.failureSubsets(3)[7].size, 3);
  assert.throws(() => m.failureSubsets(7), RangeError); assert.throws(() => m.routingSuccessProbability({ kind: 'TWO_STAGE', targetCalls: 7 }, B), RangeError);
  for (let S = 1; S <= 6; S += 1) close(m.failureSubsets(S).reduce((t, F) => t + m.failureSubsetProbability(S, 0.995, F.size), 0), 1);
});
test('the subset expectation matches the closed form when only "all calls succeeded" counts, and differs when a partial failure still honors part of the prompt', () => {
  const path = { kind: 'TWO_STAGE', targetCalls: 3 };
  const allOrNothing = m.expectedHonorOverSubsets(path, B, (F) => (F.size === 0 ? 0.95 : 0), 0);
  close(allOrNothing, m.routingSuccessProbability(path, B) * 0.95);
  close(m.expectedHonor(path, B, 0.95, 0.2), m.routingSuccessProbability(path, B) * 0.95 + (1 - m.routingSuccessProbability(path, B)) * 0.2);
  // a prompt of 3 facets, each honored independently: one failed call loses only that facet's share, so the subset expectation is higher than all-or-nothing
  const perFacet = m.expectedHonorOverSubsets(path, B, (F) => (3 - F.size) / 3, 0);
  assert.ok(perFacet > allOrNothing + 0.0001);
  // exact value: p [ qd * E[(3-K)/3] ] with K ~ Binomial(3, 1-qt)  =  p qd qt
  close(perFacet, B.p * B.qd * B.qt);
});
test('single call, no model, total target-stage outage, stage-one failure and a degraded-provider mixture', () => {
  close(m.expectedHonorOverSubsets({ kind: 'SINGLE_CALL' }, B, (F) => (F.size ? 0 : 1), 0), B.p * B.qt);
  close(m.expectedHonorOverSubsets({ kind: 'NO_MODEL' }, B, () => 0.7), 0.7);
  const path = { kind: 'TWO_STAGE', targetCalls: 2 };
  // only the total target outage (both calls fail) honors via a local fallback worth 0.5; stage one fails -> 0.1
  const e = m.expectedHonorOverSubsets(path, B, (F) => (F.size === 0 ? 1 : F.size === 2 ? 0.5 : 0.8), 0.1);
  close(e, B.p * ((1 - B.qd) * 0.1 + B.qd * (B.qt ** 2 * 1 + 2 * B.qt * (1 - B.qt) * 0.8 + (1 - B.qt) ** 2 * 0.5)) + (1 - B.p) * 0.1);
  const d = m.AVAILABILITY_SCENARIOS.degradedProvider; const plain = { p: d.p, qd: d.qd, qt: d.qt }; const deg = { p: d.p, qd: d.degraded.qd, qt: d.degraded.qt };
  const h = (F) => (F.size === 0 ? 1 : 0.4);
  close(m.expectedHonorOverSubsets(path, d, h, 0), 0.98 * m.expectedHonorOverSubsets(path, plain, h, 0) + 0.02 * m.expectedHonorOverSubsets(path, deg, h, 0));
});
test('facet-level expectations use the same subsets, so facets are scored end to end', () => {
  const path = { kind: 'TWO_STAGE', targetCalls: 2 };
  const [a, b] = m.expectedFacetHonors(path, B, 2, (facet, F) => (F.has(facet + 1) ? 0 : 1));
  close(a, B.p * B.qd * B.qt); close(b, a);
  assert.throws(() => m.expectedFacetHonors(path, B, 0, () => 1), RangeError);
});
test('the gate bound carries input uncertainty: pessimistic corner, and a refusal when the corner would not be a bound', () => {
  const path = { kind: 'TWO_STAGE', targetCalls: 2 };
  const interval = { p: [0.99, 0.9999], qd: [0.99, 0.999], qt: [0.98, 0.999] };
  const h = (F) => (F.size === 0 ? 0.95 : F.size === 1 ? 0.6 : 0.3);
  const lower = m.availabilityLowerBound(path, interval, h, 0.2);
  close(lower, m.expectedHonorOverSubsets(path, { p: 0.99, qd: 0.99, qt: 0.98 }, h, 0.2));
  for (const p of interval.p) for (const qd of interval.qd) for (const qt of interval.qt) assert.ok(m.expectedHonorOverSubsets(path, { p, qd, qt }, h, 0.2) >= lower - 1e-12, `${p} ${qd} ${qt}`);
  assert.throws(() => m.availabilityLowerBound(path, interval, (F) => (F.size === 1 ? 0.99 : 0.5), 0.2), /further failure raises/);
  assert.throws(() => m.availabilityLowerBound(path, interval, (F) => (F.size === 2 ? 0.05 : 0.9), 0.2), /less than the no-model fallback/);
  assert.throws(() => m.availabilityLowerBound(path, { ...interval, p: [0.9999, 0.99] }, h, 0.2), /reversed/);
});
