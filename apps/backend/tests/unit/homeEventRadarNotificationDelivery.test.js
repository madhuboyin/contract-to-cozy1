const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  RadarNotificationDeliveryService,
} = require('../../src/modules/homeEventRadar/services/radarNotificationDelivery.service.ts');

function input(overrides = {}) {
  return {
    propertyId: 'property-1',
    decision: {
      id: 'decision-1',
      userId: 'user-1',
      notificationId: null,
      outcome: 'immediate',
      reasonCodes: ['ELIGIBLE_INITIAL_MATCH', 'USER_IMMEDIATE_MODE'],
      eligibleChannels: ['in_app', 'email', 'push'],
      deferredUntil: null,
      criticalOverrideApplied: false,
      policyVersion: 'radar-notification-policy-v1',
      evaluatedAt: new Date('2026-07-26T16:00:00.000Z'),
      evidenceJson: {
        sourceFamily: 'weather',
        normalized: { severity: 'high' },
      },
    },
    match: {
      id: 'match-1',
      impactLevel: 'high',
      impactSummary: 'Strong winds may damage exposed exterior components.',
      confidence: 'verified',
      lifecycleStatus: 'now',
    },
    event: {
      id: 'event-1',
      title: 'Severe Thunderstorm Warning',
      summary: 'A severe storm is approaching.',
      eventType: 'weather',
      severity: 'high',
      startAt: new Date('2026-07-26T15:00:00.000Z'),
      endAt: new Date('2026-07-26T20:00:00.000Z'),
      sourceDefinition: { key: 'nws-active-alerts', family: 'weather' },
    },
    revision: { id: 'revision-1' },
    ...overrides,
  };
}

function database() {
  const notifications = [];
  const links = [];
  return {
    notifications,
    links,
    db: {
      notification: {
        findUnique: async ({ where }) => notifications.find((row) =>
          (where.id && row.id === where.id)
          || (where.deduplicationKey && row.deduplicationKey === where.deduplicationKey)
        ) ?? null,
        create: async ({ data }) => {
          const row = {
            id: `notification-${notifications.length + 1}`,
            ...data,
            deliveries: data.deliveries.create,
          };
          notifications.push(row);
          return row;
        },
      },
      propertyRadarNotificationDecision: {
        updateMany: async ({ where, data }) => {
          links.push({ where, data });
          return { count: 1 };
        },
      },
    },
  };
}

test('eligible decision creates one canonical notification and exact delivery rows', async () => {
  const state = database();
  const service = new RadarNotificationDeliveryService(state.db);
  const result = await service.materialize(input());

  assert.deepEqual(result, {
    outcome: 'created',
    notificationId: 'notification-1',
  });
  assert.equal(state.notifications.length, 1);
  const notification = state.notifications[0];
  assert.equal(notification.deduplicationKey, 'home-event-radar:decision-1');
  assert.equal(notification.entityType, 'PROPERTY_RADAR_MATCH');
  assert.equal(
    notification.actionUrl,
    '/dashboard/properties/property-1/tools/home-event-radar?matchId=match-1&launchSurface=notification',
  );
  assert.deepEqual(
    notification.deliveries.map(({ channel, status }) => ({ channel, status })),
    [
      { channel: 'IN_APP', status: 'SENT' },
      { channel: 'EMAIL', status: 'PENDING' },
      { channel: 'PUSH', status: 'PENDING' },
    ],
  );
  assert.equal(notification.deliveries[0].sentAt.toISOString(), '2026-07-26T16:00:00.000Z');
  assert.equal(state.links[0].data.notificationId, 'notification-1');
});

test('materialization retries converge on the deterministic notification key', async () => {
  const state = database();
  const service = new RadarNotificationDeliveryService(state.db);
  assert.equal((await service.materialize(input())).outcome, 'created');
  assert.equal((await service.materialize(input())).outcome, 'deduped');
  assert.equal(state.notifications.length, 1);
  assert.equal(state.links.length, 2);
});

test('suppressed decisions never create notifications or delivery rows', async () => {
  const state = database();
  const service = new RadarNotificationDeliveryService(state.db);
  const request = input();
  request.decision.outcome = 'suppressed';
  request.decision.eligibleChannels = [];
  assert.deepEqual(await service.materialize(request), {
    outcome: 'suppressed',
    notificationId: null,
  });
  assert.equal(state.notifications.length, 0);
  assert.equal(state.links.length, 0);
});
