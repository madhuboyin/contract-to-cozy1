const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  applyBoundedSignalPriorityBoost,
} = require('../../src/services/signalPriorityBoost.service.ts');

test('applyBoundedSignalPriorityBoost does not clamp when boost is below cap', () => {
  const result = applyBoundedSignalPriorityBoost({
    baseScore: 4,
    additiveBoost: 1,
    maxMultiplier: 1.5,
  });

  assert.equal(result.score, 5);
  assert.equal(result.wasClamped, false);
  assert.equal(result.maxAllowedScore, 6);
  assert.equal(result.appliedBoost, 1);
});

test('applyBoundedSignalPriorityBoost clamps total score at 1.5x base', () => {
  const result = applyBoundedSignalPriorityBoost({
    baseScore: 4,
    additiveBoost: 4,
    maxMultiplier: 1.5,
  });

  assert.equal(result.score, 6);
  assert.equal(result.wasClamped, true);
  assert.equal(result.maxAllowedScore, 6);
  assert.equal(result.appliedBoost, 2);
});

