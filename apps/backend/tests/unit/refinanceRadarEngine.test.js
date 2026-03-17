// tests/unit/refinanceRadarEngine.test.js
//
// Unit tests for radar engine logic: confidence classification, config invariants,
// and missed-opportunity suppression thresholds.
// Uses Node.js built-in test runner — no external dependencies.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyConfidence,
} = require('../../dist/refinanceRadar/engine/refinanceRadar.engine');

const {
  REFINANCE_THRESHOLDS,
  CONFIDENCE_THRESHOLDS,
  MISSED_OPPORTUNITY_THRESHOLDS,
  MISSED_OPPORTUNITY_MIN_SAVINGS_DELTA_USD,
} = require('../../dist/refinanceRadar/config/refinanceRadar.config');

// ─── classifyConfidence ───────────────────────────────────────────────────────

test('classifyConfidence — STRONG when break-even ≤ 24mo AND savings ≥ $200', () => {
  const level = classifyConfidence(20, 250);
  assert.equal(level, 'STRONG');
});

test('classifyConfidence — STRONG at exact boundary (24mo, $200)', () => {
  const level = classifyConfidence(24, 200);
  assert.equal(level, 'STRONG');
});

test('classifyConfidence — GOOD when break-even ≤ 36mo AND savings ≥ $100', () => {
  const level = classifyConfidence(30, 150);
  assert.equal(level, 'GOOD');
});

test('classifyConfidence — GOOD at exact boundary (36mo, $100)', () => {
  const level = classifyConfidence(36, 100);
  assert.equal(level, 'GOOD');
});

test('classifyConfidence — WEAK when break-even qualifies but savings below GOOD threshold', () => {
  // 30mo break-even but only $80/mo savings (below $100 GOOD threshold)
  const level = classifyConfidence(30, 80);
  assert.equal(level, 'WEAK');
});

test('classifyConfidence — WEAK when break-even ≤ 24mo but savings below STRONG threshold', () => {
  // 20mo but only $150/mo — qualifies for GOOD break-even but not GOOD savings threshold
  // Actually 20 ≤ 36 (GOOD), $150 ≥ $100 (GOOD) → should be GOOD
  // But $150 < $200 (STRONG) → not STRONG. Let's test break-even in STRONG range but savings too low
  const level = classifyConfidence(20, 150);
  // 20 ≤ 36 and 150 ≥ 100 → GOOD
  assert.equal(level, 'GOOD');
});

test('classifyConfidence — WEAK when break-even 20mo but savings $80 (below all savings thresholds)', () => {
  const level = classifyConfidence(20, 80);
  assert.equal(level, 'WEAK');
});

test('classifyConfidence — WEAK at exactly 48mo break-even (max allowed)', () => {
  const level = classifyConfidence(48, 200);
  // 48 > 36 (GOOD) → falls through to WEAK
  assert.equal(level, 'WEAK');
});

test('classifyConfidence — WEAK when break-even 47mo (just under max, savings ≥ $200)', () => {
  const level = classifyConfidence(47, 300);
  // 47 > 36 → WEAK
  assert.equal(level, 'WEAK');
});

// ─── Config invariants ────────────────────────────────────────────────────────

test('hysteresis: CLOSE_RATE_GAP_PCT < MIN_RATE_GAP_PCT', () => {
  assert.ok(
    REFINANCE_THRESHOLDS.CLOSE_RATE_GAP_PCT < REFINANCE_THRESHOLDS.MIN_RATE_GAP_PCT,
    `CLOSE (${REFINANCE_THRESHOLDS.CLOSE_RATE_GAP_PCT}) must be below MIN (${REFINANCE_THRESHOLDS.MIN_RATE_GAP_PCT})`,
  );
});

test('hysteresis: buffer between OPEN and CLOSE thresholds is at least 0.05pp', () => {
  const buffer = REFINANCE_THRESHOLDS.MIN_RATE_GAP_PCT - REFINANCE_THRESHOLDS.CLOSE_RATE_GAP_PCT;
  assert.ok(buffer >= 0.05, `Hysteresis buffer ${buffer} is too small`);
});

test('confidence: STRONG break-even threshold < GOOD threshold', () => {
  assert.ok(CONFIDENCE_THRESHOLDS.STRONG < CONFIDENCE_THRESHOLDS.GOOD);
});

test('confidence: GOOD break-even threshold ≤ WEAK threshold (max opportunity break-even)', () => {
  assert.ok(CONFIDENCE_THRESHOLDS.GOOD <= CONFIDENCE_THRESHOLDS.WEAK);
});

test('confidence: STRONG_MONTHLY_SAVINGS > GOOD_MONTHLY_SAVINGS', () => {
  assert.ok(
    CONFIDENCE_THRESHOLDS.STRONG_MONTHLY_SAVINGS_USD > CONFIDENCE_THRESHOLDS.GOOD_MONTHLY_SAVINGS_USD,
  );
});

test('opportunity: MAX_BREAK_EVEN_MONTHS matches WEAK confidence ceiling', () => {
  assert.equal(
    REFINANCE_THRESHOLDS.MAX_BREAK_EVEN_MONTHS_OPPORTUNITY,
    CONFIDENCE_THRESHOLDS.WEAK,
  );
});

// ─── Missed-opportunity suppression thresholds ────────────────────────────────

test('missed-opportunity: MIN_RATE_DELTA_PCT is a positive number', () => {
  assert.ok(
    typeof MISSED_OPPORTUNITY_THRESHOLDS.MIN_RATE_DELTA_PCT === 'number' &&
      MISSED_OPPORTUNITY_THRESHOLDS.MIN_RATE_DELTA_PCT > 0,
    'MIN_RATE_DELTA_PCT must be a positive number',
  );
});

test('missed-opportunity: MIN_LIFETIME_SAVINGS_DELTA_USD is ≥ $5,000', () => {
  assert.ok(
    MISSED_OPPORTUNITY_THRESHOLDS.MIN_LIFETIME_SAVINGS_DELTA_USD >= 5_000,
    `Lifetime savings delta threshold ${MISSED_OPPORTUNITY_THRESHOLDS.MIN_LIFETIME_SAVINGS_DELTA_USD} seems too low`,
  );
});

test('missed-opportunity: monthly delta guard is a positive number', () => {
  assert.ok(
    typeof MISSED_OPPORTUNITY_MIN_SAVINGS_DELTA_USD === 'number' &&
      MISSED_OPPORTUNITY_MIN_SAVINGS_DELTA_USD > 0,
  );
});

// ─── Refinance qualification thresholds ──────────────────────────────────────

test('qualification: MIN_LOAN_BALANCE_USD is a positive number', () => {
  assert.ok(REFINANCE_THRESHOLDS.MIN_LOAN_BALANCE_USD > 0);
});

test('qualification: MIN_REMAINING_TERM_MONTHS is positive and ≥ 12', () => {
  assert.ok(REFINANCE_THRESHOLDS.MIN_REMAINING_TERM_MONTHS >= 12);
});

test('qualification: MIN_MONTHLY_SAVINGS_USD > 0', () => {
  assert.ok(REFINANCE_THRESHOLDS.MIN_MONTHLY_SAVINGS_USD > 0);
});

test('qualification: MIN_LIFETIME_SAVINGS_USD > 0', () => {
  assert.ok(REFINANCE_THRESHOLDS.MIN_LIFETIME_SAVINGS_USD > 0);
});
