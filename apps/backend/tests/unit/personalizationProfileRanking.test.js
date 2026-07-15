const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { rankRecommendationsForOwner } = require('../../src/modules/personalization/domain/profileRanking.ts');

function recommendation(code, score, firstEligibleAt) {
  return { definition: { code }, score, priorityBand: score >= 70 ? 'HIGH' : 'MEDIUM', firstEligibleAt };
}

const ITEMS = [
  recommendation('dryer_vent_cleaning_reminder', 70, '2026-01-01T00:00:00.000Z'),
  recommendation('aging_roof_condition_review', 64, '2026-01-02T00:00:00.000Z'),
  recommendation('hvac_filter_replacement_check_proof', 60, '2026-01-03T00:00:00.000Z'),
];

test('budget preference reorders routine options without lowering or overtaking the safety floor', () => {
  const ranked = rankRecommendationsForOwner(ITEMS, { agingInPlace: false, budgetSensitive: true });
  assert.deepEqual(ranked.map((entry) => entry.item.definition.code), [
    'dryer_vent_cleaning_reminder',
    'hvac_filter_replacement_check_proof',
    'aging_roof_condition_review',
  ]);
  assert.equal(ranked[0].score, 70);
  assert.equal(ranked[1].score, 66);
  assert.match(ranked[1].rankingReasons[0], /lower-cost options/);
});

test('long-term goal visibly prioritizes roof planning but remains below the safety band', () => {
  const ranked = rankRecommendationsForOwner(ITEMS, { agingInPlace: true, budgetSensitive: false });
  assert.deepEqual(ranked.map((entry) => entry.item.definition.code), [
    'dryer_vent_cleaning_reminder',
    'aging_roof_condition_review',
    'hvac_filter_replacement_check_proof',
  ]);
  assert.equal(ranked[1].score, 69);
  assert.equal(ranked[1].priorityBand, 'MEDIUM');
  assert.match(ranked[1].rankingReasons[0], /stay in this home long-term/);
});

test('no explicit preference preserves base scores and recommendation count', () => {
  const ranked = rankRecommendationsForOwner(ITEMS, { agingInPlace: null, budgetSensitive: null });
  assert.equal(ranked.length, ITEMS.length);
  assert.deepEqual(ranked.map((entry) => entry.score), [70, 64, 60]);
  assert.ok(ranked.every((entry) => entry.rankingReasons.length === 0));
});
