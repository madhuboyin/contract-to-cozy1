const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { clopperPearsonInterval, clopperPearsonUpperOneSided, clopperPearsonLowerOneSided, wilsonInterval, zeroFailureTrialsRequired, regularizedIncompleteBeta } = require('../../src/services/ask/semantic/evaluation/biccStatistics.ts');

const close = (actual, expected, tolerance = 1e-4) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test('zero-failure one-sided upper bound matches the closed form 1 - alpha^(1/n)', () => {
  for (const n of [30, 100, 300, 1000]) close(clopperPearsonUpperOneSided(0, n), 1 - Math.pow(0.05, 1 / n), 1e-9);
});

test('300 zero-failure trials bound the failure rate below 1%; 299 do not need to', () => {
  assert.ok(clopperPearsonUpperOneSided(0, 300) < 0.01);
  assert.equal(zeroFailureTrialsRequired(0.01), 299);
  assert.ok(clopperPearsonUpperOneSided(0, 298) >= 0.01);
});

test('two-sided Clopper-Pearson matches published values', () => {
  const half = clopperPearsonInterval(5, 10);
  close(half.lower, 0.18709); close(half.upper, 0.81291);
  const ninety = clopperPearsonInterval(297, 300);
  assert.ok(ninety.lower > 0.97 && ninety.lower < 0.98, `lower ${ninety.lower}`);
  assert.deepEqual([clopperPearsonInterval(0, 20).lower, clopperPearsonInterval(20, 20).upper], [0, 1]);
});

test('one-sided lower bound: 297 of 300 recall cannot demonstrate 99% (GATE-009 needs a sample large enough to claim it)', () => {
  assert.ok(clopperPearsonLowerOneSided(297, 300) < 0.99);
  assert.ok(clopperPearsonLowerOneSided(300, 300) > 0.99);
});

test('wilson interval is descriptive and agrees with the baseline script formula', () => {
  const interval = wilsonInterval(425, 708);
  // The Phase 0a baseline reports 425/708 as 60.0% (56.4-63.6%).
  assert.equal((interval.lower * 100).toFixed(1), '56.4'); assert.equal((interval.upper * 100).toFixed(1), '63.6');
});

test('incomplete beta is symmetric and validates counts', () => {
  close(regularizedIncompleteBeta(0.5, 3, 3), 0.5, 1e-12);
  assert.throws(() => clopperPearsonInterval(5, 4), RangeError);
  assert.equal(clopperPearsonInterval(0, 0).rate, null);
});
