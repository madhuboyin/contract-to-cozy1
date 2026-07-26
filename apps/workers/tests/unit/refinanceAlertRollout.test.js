const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  decideRefinanceAlertRollout,
  isRefinanceNotification,
} = require('../../src/lib/refinanceAlertRollout.ts');

test('refinance alert rollout defaults to an empty fail-closed allowlist', () => {
  assert.deepEqual(
    decideRefinanceAlertRollout('owner@example.com', {}),
    {
      allowed: false,
      mode: 'ALLOWLIST',
      reason: 'RECIPIENT_NOT_IN_COHORT',
    },
  );
});

test('allowlist matching is trimmed and case-insensitive', () => {
  const decision = decideRefinanceAlertRollout(
    'Owner@Example.com',
    {
      REFINANCE_ALERT_ROLLOUT_MODE: 'allowlist',
      REFINANCE_ALERT_RECIPIENT_EMAIL_ALLOWLIST:
        ' ops@example.com, owner@example.com ',
    },
  );
  assert.deepEqual(decision, {
    allowed: true,
    mode: 'ALLOWLIST',
    reason: null,
  });
});

test('GENERAL requires an explicit valid mode and invalid modes fail closed', () => {
  assert.equal(
    decideRefinanceAlertRollout(null, {
      REFINANCE_ALERT_ROLLOUT_MODE: 'GENERAL',
    }).allowed,
    true,
  );
  assert.deepEqual(
    decideRefinanceAlertRollout('owner@example.com', {
      REFINANCE_ALERT_ROLLOUT_MODE: 'beta-ish',
    }),
    {
      allowed: false,
      mode: 'INVALID',
      reason: 'INVALID_ROLLOUT_MODE',
    },
  );
});

test('refinance notifications are recognized by type or policy category', () => {
  assert.equal(
    isRefinanceNotification({ type: 'REFINANCE_OPPORTUNITY_OPENED' }),
    true,
  );
  assert.equal(
    isRefinanceNotification({
      type: 'GENERIC_UPDATE',
      metadata: { notificationPolicy: { category: 'REFINANCE' } },
    }),
    true,
  );
  assert.equal(
    isRefinanceNotification({
      type: 'BOOKING_CONFIRMED',
      metadata: { notificationPolicy: { category: 'WORKFLOW' } },
    }),
    false,
  );
});
