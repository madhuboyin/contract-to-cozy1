const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

const {
  NotificationCadence,
  NotificationSensitivity,
  RefinanceConfidenceLevel,
} = require('@prisma/client');
const {
  areRefinanceExternalAlertsEnabled,
  isRefinancePreferenceDeliveryEnabled,
  processRefinanceTransitionAlert,
  REFINANCE_EXTERNAL_ALERT_COOLDOWN_DAYS,
} = require('../../src/jobs/refinanceTransitionAlert.job.ts');

function context(overrides = {}) {
  return {
    propertyId: 'property-1',
    ownerUserId: 'owner-1',
    ownerEmail: 'owner@example.com',
    address: '94 Ashford Dr',
    confidenceLevel: RefinanceConfidenceLevel.STRONG,
    mortgageDataAsOf: '2026-07-20T00:00:00.000Z',
    marketDataAsOf: '2026-07-24T00:00:00.000Z',
    marketDataSource: 'FREDDIE_MAC_PMMS',
    preference: {
      homeEnabled: true,
      emailEnabled: true,
      pushEnabled: false,
      pushAvailable: true,
      hasActivePushSubscription: false,
      pushPublicKey: 'public-key',
      cadence: NotificationCadence.IMMEDIATE,
      sensitivity: NotificationSensitivity.CONSERVATIVE,
      quietStart: '21:00',
      quietEnd: '07:00',
      timezone: 'America/New_York',
      explicitEmailConsent: true,
      explicitPushConsent: false,
      externalDeliveryEnabled: false,
      pushDeliveryEnabled: false,
    },
    ...overrides,
  };
}

function deps(overrides = {}) {
  const calls = { creates: [], cooldownSince: null };
  return {
    calls,
    value: {
      deliveryEnabled: () => true,
      now: () => new Date('2026-07-25T12:00:00.000Z'),
      loadContext: async () => context(),
      hasRecentAlert: async (_userId, _propertyId, since) => {
        calls.cooldownSince = since;
        return false;
      },
      createNotification: async (input) => {
        calls.creates.push(input);
        return { id: 'notification-1' };
      },
      ...overrides,
    },
  };
}

const event = {
  domainEventId: 'event-1',
  propertyId: 'property-1',
  snapshotId: 'snapshot-1',
  transitionType: 'OPEN',
  materialChangeReasons: ['OPPORTUNITY_THRESHOLD_MET'],
};

test('refinance external alerts require both fail-closed feature flags', () => {
  assert.equal(areRefinanceExternalAlertsEnabled({}), false);
  assert.equal(areRefinanceExternalAlertsEnabled({
    REFINANCE_EXTERNAL_ALERTS_ENABLED: 'true',
    WORKER_OUTBOUND_NOTIFICATIONS_ENABLED: 'false',
  }), false);
  assert.equal(areRefinanceExternalAlertsEnabled({
    REFINANCE_EXTERNAL_ALERTS_ENABLED: 'true',
    WORKER_OUTBOUND_NOTIFICATIONS_ENABLED: 'true',
  }), true);
});

test('channel rollout must match the channel that received explicit consent', () => {
  const emailPreference = context().preference;
  assert.equal(
    isRefinancePreferenceDeliveryEnabled(emailPreference, {
      WORKER_OUTBOUND_NOTIFICATIONS_ENABLED: 'true',
      REFINANCE_PUSH_ALERTS_ENABLED: 'true',
      WEB_PUSH_DELIVERY_ENABLED: 'true',
      WEB_PUSH_VAPID_SUBJECT: 'mailto:operations@example.com',
      WEB_PUSH_VAPID_PUBLIC_KEY: 'public-key',
      WEB_PUSH_VAPID_PRIVATE_KEY: 'private-key',
    }),
    false,
  );
  assert.equal(
    isRefinancePreferenceDeliveryEnabled(
      {
        ...emailPreference,
        emailEnabled: false,
        explicitEmailConsent: false,
        pushEnabled: true,
        explicitPushConsent: true,
      },
      {
        WORKER_OUTBOUND_NOTIFICATIONS_ENABLED: 'true',
        REFINANCE_PUSH_ALERTS_ENABLED: 'true',
        WEB_PUSH_DELIVERY_ENABLED: 'true',
        WEB_PUSH_VAPID_SUBJECT: 'mailto:operations@example.com',
        WEB_PUSH_VAPID_PUBLIC_KEY: 'public-key',
        WEB_PUSH_VAPID_PRIVATE_KEY: 'private-key',
      },
    ),
    true,
  );
});

test('suppresses before loading financial context while delivery is disabled', async () => {
  let loaded = false;
  const { value, calls } = deps({
    deliveryEnabled: () => false,
    loadContext: async () => {
      loaded = true;
      return context();
    },
  });
  const result = await processRefinanceTransitionAlert(event, value);
  assert.deepEqual(result, { status: 'SUPPRESSED', reason: 'DELIVERY_DISABLED' });
  assert.equal(loaded, false);
  assert.equal(calls.creates.length, 0);
});

test('suppresses an otherwise eligible recipient outside the rollout cohort', async () => {
  const { value, calls } = deps({
    recipientRollout: () => ({
      allowed: false,
      mode: 'ALLOWLIST',
      reason: 'RECIPIENT_NOT_IN_COHORT',
    }),
  });
  const result = await processRefinanceTransitionAlert(event, value);
  assert.deepEqual(result, {
    status: 'SUPPRESSED',
    reason: 'RECIPIENT_NOT_IN_COHORT',
  });
  assert.equal(calls.creates.length, 0);
});

test('creates a consented, current, high-confidence OPEN alert without financial values in metadata', async () => {
  const { value, calls } = deps();
  const result = await processRefinanceTransitionAlert(event, value);

  assert.deepEqual(result, { status: 'CREATED', reason: null });
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.creates[0].category, 'REFINANCE');
  assert.equal(calls.creates[0].transportEnabled, true);
  assert.equal(calls.creates[0].metadata.domainEventId, 'event-1');
  assert.equal('monthlySavings' in calls.creates[0].metadata, false);
  assert.equal('loanBalance' in calls.creates[0].metadata, false);
  assert.equal(
    calls.cooldownSince.toISOString(),
    new Date(
      new Date('2026-07-25T12:00:00.000Z').getTime() -
        REFINANCE_EXTERNAL_ALERT_COOLDOWN_DAYS * 86400000,
    ).toISOString(),
  );
});

test('suppresses alert when explicit email consent is absent', async () => {
  const { value, calls } = deps({
    loadContext: async () => context({
      preference: {
        ...context().preference,
        emailEnabled: false,
        cadence: NotificationCadence.MUTED,
        explicitEmailConsent: false,
      },
    }),
  });
  const result = await processRefinanceTransitionAlert(event, value);
  assert.deepEqual(result, { status: 'SUPPRESSED', reason: 'NO_EXPLICIT_CONSENT' });
  assert.equal(calls.creates.length, 0);
});

test('reports central notification-policy suppression without retrying the event', async () => {
  const { value } = deps({ createNotification: async () => null });
  assert.deepEqual(
    await processRefinanceTransitionAlert(event, value),
    { status: 'SUPPRESSED', reason: 'NOTIFICATION_POLICY' },
  );
});

test('suppresses stale mortgage inputs and active 30-day cooldowns', async () => {
  const stale = deps({
    loadContext: async () => context({
      mortgageDataAsOf: '2025-01-01T00:00:00.000Z',
    }),
  });
  assert.deepEqual(
    await processRefinanceTransitionAlert(event, stale.value),
    { status: 'SUPPRESSED', reason: 'INPUTS_NOT_CURRENT' },
  );

  const cooldown = deps({ hasRecentAlert: async () => true });
  assert.deepEqual(
    await processRefinanceTransitionAlert(event, cooldown.value),
    { status: 'SUPPRESSED', reason: 'COOLDOWN_ACTIVE' },
  );
  assert.equal(cooldown.calls.creates.length, 0);
});

test('materially improved UPDATE bypasses cooldown and exposes a preference path', async () => {
  const setup = deps({
    hasRecentAlert: async () => true,
  });
  const result = await processRefinanceTransitionAlert({
    ...event,
    transitionType: 'UPDATE',
    materialChangeReasons: ['MONTHLY_SAVINGS_CHANGED', 'MONTHLY_SAVINGS_IMPROVED'],
  }, setup.value);

  assert.equal(result.status, 'CREATED');
  assert.match(
    setup.calls.creates[0].metadata.preferenceUrl,
    /#refinance-alert-preferences$/,
  );
});
