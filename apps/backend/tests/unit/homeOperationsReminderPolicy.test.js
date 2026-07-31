const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  resolveReminderPolicy,
  DEFAULT_REMINDER_POLICY,
} = require('../../src/modules/homeOperations/domain/reminderPolicy.ts');

// Item #19 (§5.15) Slice 0: reminder urgency is a function of consequence
// (obligationType/safetyTier), not of cadence — this is why
// resolveReminderPolicy takes no recurrence/cadence input at all.

test('a routine obligation gets the default policy', () => {
  assert.deepEqual(resolveReminderPolicy('MAINTENANCE_TASK', 'LOW_CONSEQUENCE'), DEFAULT_REMINDER_POLICY);
  assert.deepEqual(resolveReminderPolicy('PROJECT_EXECUTION', 'MATERIAL_FINANCIAL'), DEFAULT_REMINDER_POLICY);
});

test('SAFETY_EMERGENCY always wins with an immediate, short-horizon policy regardless of obligation type', () => {
  const maintenance = resolveReminderPolicy('MAINTENANCE_TASK', 'SAFETY_EMERGENCY');
  const decision = resolveReminderPolicy('DECISION', 'SAFETY_EMERGENCY');

  for (const policy of [maintenance, decision]) {
    assert.equal(policy.materialDeadlineDays, 0);
    assert.equal(policy.horizonDays, 2);
    assert.ok(policy.horizonDays < DEFAULT_REMINDER_POLICY.horizonDays);
  }
});

test('DECISION obligations remind off nextReviewAt, since Guidance never gets a dueAt', () => {
  const policy = resolveReminderPolicy('DECISION', 'LOW_CONSEQUENCE');
  assert.equal(policy.remindOnNextReview, true);
  assert.equal(policy.materialDeadlineDays, DEFAULT_REMINDER_POLICY.materialDeadlineDays);
  assert.equal(policy.horizonDays, DEFAULT_REMINDER_POLICY.horizonDays);
});

test('SAFETY_EMERGENCY takes precedence over the DECISION remindOnNextReview flag', () => {
  const policy = resolveReminderPolicy('DECISION', 'SAFETY_EMERGENCY');
  assert.equal(policy.remindOnNextReview, false, 'the safety-emergency branch returns its own fixed policy shape, not a DECISION-flavored one');
});
