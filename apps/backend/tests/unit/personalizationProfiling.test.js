const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  isQuestionEligible,
  rankQuestions,
  isWithinWeeklyCap,
  computeNextEligibleAt,
  SKIP_COOLDOWN_DAYS,
  LATER_COOLDOWN_DAYS,
  WEEKLY_QUESTION_CAP,
} = require('../../src/modules/personalization/domain/profiling.ts');

const NOW = new Date('2026-07-13T00:00:00.000Z');

test('isQuestionEligible: eligible when never asked before', () => {
  assert.equal(isQuestionEligible({ id: 'q1', maxImpressions: 3 }, [], NOW), true);
});

test('isQuestionEligible: not eligible once already ANSWERED', () => {
  const priorAnswers = [{ questionId: 'q1', action: 'ANSWERED', nextEligibleAt: null }];
  assert.equal(isQuestionEligible({ id: 'q1', maxImpressions: 3 }, priorAnswers, NOW), false);
});

test('isQuestionEligible: not eligible once impression cap is reached', () => {
  const priorAnswers = [
    { questionId: 'q1', action: 'SKIPPED', nextEligibleAt: new Date(NOW.getTime() - 1000) },
    { questionId: 'q1', action: 'SKIPPED', nextEligibleAt: new Date(NOW.getTime() - 1000) },
  ];
  assert.equal(isQuestionEligible({ id: 'q1', maxImpressions: 2 }, priorAnswers, NOW), false);
});

test('isQuestionEligible: not eligible while a skip/snooze cooldown is still active', () => {
  const priorAnswers = [
    { questionId: 'q1', action: 'SNOOZED', nextEligibleAt: new Date(NOW.getTime() + 1000) },
  ];
  assert.equal(isQuestionEligible({ id: 'q1', maxImpressions: 5 }, priorAnswers, NOW), false);
});

test('isQuestionEligible: eligible again once the cooldown has expired', () => {
  const priorAnswers = [
    { questionId: 'q1', action: 'SNOOZED', nextEligibleAt: new Date(NOW.getTime() - 1000) },
  ];
  assert.equal(isQuestionEligible({ id: 'q1', maxImpressions: 5 }, priorAnswers, NOW), true);
});

test('rankQuestions: sorts by valueScore/effortScore descending', () => {
  const questions = [
    { id: 'low', valueScore: 2, effortScore: 2 }, // 1.0
    { id: 'high', valueScore: 10, effortScore: 1 }, // 10.0
    { id: 'mid', valueScore: 5, effortScore: 2 }, // 2.5
  ];
  const ranked = rankQuestions(questions);
  assert.deepEqual(ranked.map((q) => q.id), ['high', 'mid', 'low']);
});

test('rankQuestions: does not mutate the input array', () => {
  const questions = [
    { id: 'a', valueScore: 1, effortScore: 1 },
    { id: 'b', valueScore: 2, effortScore: 1 },
  ];
  const original = [...questions];
  rankQuestions(questions);
  assert.deepEqual(questions, original);
});

test('rankQuestions: guards against a zero/negative effortScore instead of dividing by zero', () => {
  const questions = [{ id: 'zero-effort', valueScore: 5, effortScore: 0 }];
  const ranked = rankQuestions(questions);
  assert.ok(Number.isFinite(ranked[0].valueScore / 0.01));
});

test('isWithinWeeklyCap: true when under the weekly cap', () => {
  assert.equal(WEEKLY_QUESTION_CAP, 2);
  assert.equal(isWithinWeeklyCap([], NOW), true);
  assert.equal(isWithinWeeklyCap([new Date(NOW.getTime() - 24 * 60 * 60 * 1000)], NOW), true);
});

test('isWithinWeeklyCap: false once the weekly cap is reached', () => {
  const timestamps = [
    new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000),
    new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000),
  ];
  assert.equal(isWithinWeeklyCap(timestamps, NOW), false);
});

test('isWithinWeeklyCap: timestamps older than 7 days do not count toward the cap', () => {
  const timestamps = [
    new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000),
    new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000),
  ];
  assert.equal(isWithinWeeklyCap(timestamps, NOW), true);
});

test('computeNextEligibleAt: SKIPPED sets a 90-day cooldown', () => {
  const result = computeNextEligibleAt('SKIPPED', NOW);
  assert.equal(result.getTime(), NOW.getTime() + SKIP_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
});

test('computeNextEligibleAt: SNOOZED sets a 14-day cooldown', () => {
  const result = computeNextEligibleAt('SNOOZED', NOW);
  assert.equal(result.getTime(), NOW.getTime() + LATER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
});

test('computeNextEligibleAt: ANSWERED never sets a cooldown (eligibility already excludes it)', () => {
  assert.equal(computeNextEligibleAt('ANSWERED', NOW), null);
});
