// tests/unit/refinanceCalculation.test.js
//
// Unit tests for the pure refinance calculation engine.
// Uses Node.js built-in test runner — no external dependencies.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calcMonthlyPayment,
  calcTotalInterest,
  calcRefinanceScenario,
} = require('../../dist/refinanceRadar/engine/refinanceCalculation.engine');

// ─── Tolerance helper ─────────────────────────────────────────────────────────

function assertClose(actual, expected, tolerancePct = 0.01, msg) {
  const tol = Math.abs(expected) * tolerancePct || 0.01;
  assert.ok(
    Math.abs(actual - expected) <= tol,
    msg ?? `Expected ${actual} ≈ ${expected} (±${tol.toFixed(4)})`,
  );
}

// ─── calcMonthlyPayment ───────────────────────────────────────────────────────

test('calcMonthlyPayment — standard 30yr 6.25%', () => {
  // P=400,000 r=6.25/12/100 n=360
  // Known approximate: ~$2,462.87
  const payment = calcMonthlyPayment(400_000, 6.25, 360);
  assertClose(payment, 2462.87, 0.01, `payment=${payment}`);
});

test('calcMonthlyPayment — standard 15yr 5.75%', () => {
  // P=300,000 r=5.75/12/100 n=180
  // Known approximate: ~$2,490.40
  const payment = calcMonthlyPayment(300_000, 5.75, 180);
  assert.ok(payment > 2400 && payment < 2600, `payment=${payment} out of expected range`);
});

test('calcMonthlyPayment — zero rate returns principal / term', () => {
  const payment = calcMonthlyPayment(120_000, 0, 120);
  assertClose(payment, 1000, 0.001);
});

test('calcMonthlyPayment — zero principal returns 0', () => {
  assert.equal(calcMonthlyPayment(0, 6.5, 360), 0);
});

test('calcMonthlyPayment — negative principal returns 0', () => {
  assert.equal(calcMonthlyPayment(-50_000, 6.5, 360), 0);
});

test('calcMonthlyPayment — zero term returns 0', () => {
  assert.equal(calcMonthlyPayment(400_000, 6.5, 0), 0);
});

test('calcMonthlyPayment — negative term returns 0', () => {
  assert.equal(calcMonthlyPayment(400_000, 6.5, -12), 0);
});

test('calcMonthlyPayment — NaN principal returns 0', () => {
  assert.equal(calcMonthlyPayment(NaN, 6.5, 360), 0);
});

test('calcMonthlyPayment — Infinity rate returns 0 (negative guard)', () => {
  assert.equal(calcMonthlyPayment(400_000, Infinity, 360), 0);
});

test('calcMonthlyPayment — negative rate returns 0', () => {
  assert.equal(calcMonthlyPayment(400_000, -2, 360), 0);
});

// ─── calcTotalInterest ────────────────────────────────────────────────────────

test('calcTotalInterest — basic case', () => {
  // Payment 2462.87 × 360 = 887,032 − 400,000 principal ≈ 487,032
  const total = calcTotalInterest(2462.87, 360, 400_000);
  assertClose(total, 487_032, 0.02);
});

test('calcTotalInterest — clamped to 0 when payment × term < principal', () => {
  // Edge: should never be negative
  const total = calcTotalInterest(100, 10, 2_000_000);
  assert.equal(total, 0);
});

// ─── calcRefinanceScenario ────────────────────────────────────────────────────

test('calcRefinanceScenario — beneficial rate drop yields positive savings', () => {
  const result = calcRefinanceScenario({
    loanBalance: 350_000,
    currentRatePct: 7.0,
    remainingTermMonths: 300,
    targetRatePct: 5.5,
    targetTermMonths: 360,
  });

  assert.ok(result.monthlySavings > 0, `monthlySavings=${result.monthlySavings} should be positive`);
  assert.ok(result.breakEvenMonths !== null, 'breakEvenMonths should not be null');
  assert.ok(result.breakEvenMonths > 0, `breakEvenMonths=${result.breakEvenMonths} should be positive`);
  assert.ok(result.rateGapPct > 0, `rateGapPct=${result.rateGapPct} should be positive`);
  assertClose(result.rateGapPct, 1.5, 0.001);
});

test('calcRefinanceScenario — rate equal to current yields near-zero savings', () => {
  const result = calcRefinanceScenario({
    loanBalance: 300_000,
    currentRatePct: 6.5,
    remainingTermMonths: 300,
    targetRatePct: 6.5,
    targetTermMonths: 300,
  });

  assertClose(result.monthlySavings, 0, 0.001);
  assert.equal(result.breakEvenMonths, null, 'no break-even when savings=0');
  assertClose(result.rateGapPct, 0, 0.001);
});

test('calcRefinanceScenario — higher target rate (same term) yields negative monthly savings', () => {
  // Same term (360→360) so term extension cannot mask the rate increase
  const result = calcRefinanceScenario({
    loanBalance: 300_000,
    currentRatePct: 5.0,
    remainingTermMonths: 360,
    targetRatePct: 6.5,
    targetTermMonths: 360,
  });

  assert.ok(result.monthlySavings < 0, `monthlySavings should be negative, got ${result.monthlySavings}`);
  assert.equal(result.breakEvenMonths, null, 'no break-even when rate increases');
  assert.ok(result.rateGapPct < 0);
});

test('calcRefinanceScenario — break-even = ceil(closingCost / monthlySavings)', () => {
  // Use explicit closing cost so we can verify the math exactly
  const closingCostUsd = 8_000;
  const result = calcRefinanceScenario({
    loanBalance: 400_000,
    currentRatePct: 7.0,
    remainingTermMonths: 360,
    targetRatePct: 5.5,
    targetTermMonths: 360,
    closingCostUsd,
  });

  assert.ok(result.breakEvenMonths !== null);
  assert.equal(result.breakEvenMonths, Math.ceil(closingCostUsd / result.monthlySavings));
});

test('calcRefinanceScenario — lifetime savings are net of closing costs', () => {
  const result = calcRefinanceScenario({
    loanBalance: 400_000,
    currentRatePct: 7.0,
    remainingTermMonths: 360,
    targetRatePct: 5.5,
    targetTermMonths: 360,
    closingCostUsd: 10_000,
  });

  const interestSaved = result.totalInterestRemainingCurrent - result.totalInterestNewLoan;
  assertClose(result.lifetimeSavings, interestSaved - 10_000, 0.001);
});

test('calcRefinanceScenario — explicit closingCostUsd overrides default', () => {
  const withDefault = calcRefinanceScenario({
    loanBalance: 400_000,
    currentRatePct: 7.0,
    remainingTermMonths: 360,
    targetRatePct: 5.5,
    targetTermMonths: 360,
  });
  const withExplicit = calcRefinanceScenario({
    loanBalance: 400_000,
    currentRatePct: 7.0,
    remainingTermMonths: 360,
    targetRatePct: 5.5,
    targetTermMonths: 360,
    closingCostUsd: 5_000,
  });

  // Default is 2.5% of 400k = $10,000
  assertClose(withDefault.effectiveClosingCostUsd, 10_000, 0.001);
  assertClose(withExplicit.effectiveClosingCostUsd, 5_000, 0.001);
  // Lower closing cost → shorter break-even
  assert.ok(withExplicit.breakEvenMonths < withDefault.breakEvenMonths);
});

test('calcRefinanceScenario — closingCostPct overrides default', () => {
  const result = calcRefinanceScenario({
    loanBalance: 400_000,
    currentRatePct: 7.0,
    remainingTermMonths: 360,
    targetRatePct: 5.5,
    targetTermMonths: 360,
    closingCostPct: 0.03, // 3% = $12,000
  });
  assertClose(result.effectiveClosingCostUsd, 12_000, 0.001);
});

test('calcRefinanceScenario — closingCostPct clamped at 10%', () => {
  const result = calcRefinanceScenario({
    loanBalance: 100_000,
    currentRatePct: 7.0,
    remainingTermMonths: 360,
    targetRatePct: 5.5,
    targetTermMonths: 360,
    closingCostPct: 0.50, // 50% — should be clamped to 10%
  });
  assertClose(result.effectiveClosingCostUsd, 10_000, 0.001);
});

test('calcRefinanceScenario — term shortening may have negative monthly savings but positive lifetime', () => {
  // 30yr → 15yr: higher monthly but far less total interest
  const result = calcRefinanceScenario({
    loanBalance: 300_000,
    currentRatePct: 7.0,
    remainingTermMonths: 360,
    targetRatePct: 6.25,
    targetTermMonths: 180,
  });

  // Monthly payment on 15yr is usually higher
  assert.ok(result.monthlySavings < 0, `term shortening should increase monthly payment`);
  assert.equal(result.breakEvenMonths, null, 'no break-even when monthly savings negative');
  // But total interest difference should be large (15yr pays far less interest)
  assert.ok(result.totalInterestRemainingCurrent > result.totalInterestNewLoan,
    'remaining interest on 30yr should exceed full interest on 15yr');
  assert.ok(result.payoffDeltaMonths < 0, 'payoffDelta should be negative (pay off sooner)');
  assertClose(result.payoffDeltaMonths, -180, 0.001);
});

test('calcRefinanceScenario — payoffDeltaMonths is 0 when terms match', () => {
  const result = calcRefinanceScenario({
    loanBalance: 300_000,
    currentRatePct: 7.0,
    remainingTermMonths: 360,
    targetRatePct: 5.5,
    targetTermMonths: 360,
  });
  assert.equal(result.payoffDeltaMonths, 0);
});

test('calcRefinanceScenario — currentMonthlyPayment override respected', () => {
  // Provide an explicit current payment higher than amortized
  const result = calcRefinanceScenario({
    loanBalance: 300_000,
    currentRatePct: 7.0,
    remainingTermMonths: 360,
    currentMonthlyPayment: 3_000, // manually provided
    targetRatePct: 5.5,
    targetTermMonths: 360,
  });
  assertClose(result.currentMonthlyPayment, 3_000, 0.001);
});

test('calcRefinanceScenario — rate clamped at 30% ceiling', () => {
  // 100% rate should behave same as 30% (clamped)
  const r100 = calcRefinanceScenario({
    loanBalance: 100_000,
    currentRatePct: 100,
    remainingTermMonths: 360,
    targetRatePct: 5.5,
    targetTermMonths: 360,
  });
  const r30 = calcRefinanceScenario({
    loanBalance: 100_000,
    currentRatePct: 30,
    remainingTermMonths: 360,
    targetRatePct: 5.5,
    targetTermMonths: 360,
  });
  assertClose(r100.currentMonthlyPayment, r30.currentMonthlyPayment, 0.001);
});
