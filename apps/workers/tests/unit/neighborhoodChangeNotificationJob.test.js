// apps/workers/tests/unit/neighborhoodChangeNotificationJob.test.js
//
// W3 (neighborhood):
//   1. Category bleed fix — notifications now use the dedicated NEIGHBORHOOD
//      category instead of GENERAL, so muting neighborhood chatter
//      (notificationPreference.service.ts MUTE_TYPE) doesn't silently mute
//      every other GENERAL-category notification for the property too.
//   2. Noise cap — multiple qualifying property-event links discovered for
//      the same property in one run are combined into a single notification
//      instead of one per link, and idempotency is checked against a
//      pre-fetched set (covering both the batched array metadata shape and
//      the pre-batching singular shape) instead of one DB query per link.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadJob({ links, existingNotifications = [], planningApplicable = true }) {
  const createCalls = [];

  const prismaMock = {
    propertyNeighborhoodEvent: {
      findMany: async () => links,
    },
    notification: {
      findMany: async () => existingNotifications,
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const notificationServicePath = require.resolve('../../../backend/src/services/notification.service.ts');
  require.cache[notificationServicePath] = {
    id: notificationServicePath,
    filename: notificationServicePath,
    loaded: true,
    exports: {
      NotificationService: {
        create: async (input) => {
          createCalls.push(input);
          return { id: `notification-${createCalls.length}` };
        },
      },
    },
  };

  const guidancePath = require.resolve('../../../backend/src/services/guidanceEngine/guidanceJourney.service.ts');
  require.cache[guidancePath] = {
    id: guidancePath,
    filename: guidancePath,
    loaded: true,
    exports: { guidanceJourneyService: { ingestSignal: async () => {} } },
  };

  const planningContextPath = require.resolve('../../../backend/src/services/planningContext/context.ts');
  require.cache[planningContextPath] = {
    id: planningContextPath,
    filename: planningContextPath,
    loaded: true,
    exports: {
      getPlanningContextEnvelope: async () => ({
        decision: { status: planningApplicable ? 'APPLICABLE' : 'NOT_APPLICABLE' },
      }),
    },
  };

  const jobPath = require.resolve('../../src/jobs/neighborhoodChangeNotification.job.ts');
  delete require.cache[jobPath];
  return { job: require(jobPath), getCreateCalls: () => createCalls };
}

function property(overrides = {}) {
  return {
    id: 'property-1',
    address: '1 Main St',
    city: 'Plainsboro',
    state: 'NJ',
    latitude: 40.33,
    longitude: -74.58,
    homeownerProfile: { userId: 'user-1' },
    ...overrides,
  };
}

function event(overrides = {}) {
  const announcedDate = new Date();
  return {
    id: 'event-1',
    title: 'New transit line announced',
    eventType: 'TRANSIT_PROJECT',
    announcedDate,
    expectedEndDate: null,
    createdAt: announcedDate,
    city: 'Plainsboro',
    state: 'NJ',
    latitude: 40.33,
    longitude: -74.58,
    ...overrides,
  };
}

function link(overrides = {}) {
  return {
    id: `link-${Math.random().toString(36).slice(2)}`,
    propertyId: 'property-1',
    eventId: 'event-1',
    impactScore: 75,
    property: property(),
    event: event(),
    ...overrides,
  };
}

test('single qualifying link sends one notification with the dedicated NEIGHBORHOOD category', async () => {
  const { job, getCreateCalls } = loadJob({ links: [link()] });

  await job.neighborhoodChangeNotificationJob();

  const calls = getCreateCalls();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].category, 'NEIGHBORHOOD');
  assert.equal(calls[0].userId, 'user-1');
  assert.equal(calls[0].metadata.propertyNeighborhoodEventIds.length, 1);
});

test('multiple qualifying links for the same property are batched into one notification', async () => {
  const links = [
    link({ id: 'link-a', eventId: 'event-a', event: event({ id: 'event-a', eventType: 'TRANSIT_PROJECT' }) }),
    link({ id: 'link-b', eventId: 'event-b', event: event({ id: 'event-b', eventType: 'ZONING_CHANGE' }) }),
    link({ id: 'link-c', eventId: 'event-c', event: event({ id: 'event-c', eventType: 'PARK_DEVELOPMENT' }) }),
  ];
  const { job, getCreateCalls } = loadJob({ links });

  await job.neighborhoodChangeNotificationJob();

  const calls = getCreateCalls();
  assert.equal(calls.length, 1, 'must send exactly one notification for the property, not one per link');
  assert.equal(calls[0].category, 'NEIGHBORHOOD');
  assert.match(calls[0].title, /3 neighborhood changes/);
  assert.deepEqual(
    calls[0].metadata.propertyNeighborhoodEventIds.sort(),
    ['link-a', 'link-b', 'link-c'].sort(),
  );
  assert.equal(calls[0].metadata.impactScore, 75);
});

test('links for different properties are notified separately', async () => {
  const links = [
    link({ id: 'link-a', propertyId: 'property-1', property: property({ id: 'property-1' }) }),
    link({ id: 'link-b', propertyId: 'property-2', property: property({ id: 'property-2', homeownerProfile: { userId: 'user-2' } }) }),
  ];
  const { job, getCreateCalls } = loadJob({ links });

  await job.neighborhoodChangeNotificationJob();

  const calls = getCreateCalls();
  assert.equal(calls.length, 2);
  const userIds = calls.map((c) => c.userId).sort();
  assert.deepEqual(userIds, ['user-1', 'user-2']);
});

test('a link already covered by a prior batched notification is not re-notified', async () => {
  const theLink = link({ id: 'link-a' });
  const { job, getCreateCalls } = loadJob({
    links: [theLink],
    existingNotifications: [{ metadata: { propertyNeighborhoodEventIds: ['link-a'] } }],
  });

  await job.neighborhoodChangeNotificationJob();

  assert.equal(getCreateCalls().length, 0);
});

test('a link already covered by a prior pre-batching (singular field) notification is not re-notified', async () => {
  const theLink = link({ id: 'link-a' });
  const { job, getCreateCalls } = loadJob({
    links: [theLink],
    existingNotifications: [{ metadata: { propertyNeighborhoodEventId: 'link-a' } }],
  });

  await job.neighborhoodChangeNotificationJob();

  assert.equal(getCreateCalls().length, 0, 'must recognize the legacy singular metadata shape too');
});

test('a new link is still notified alongside an already-notified link for the same property', async () => {
  const links = [
    link({ id: 'link-old', eventId: 'event-old' }),
    link({ id: 'link-new', eventId: 'event-new' }),
  ];
  const { job, getCreateCalls } = loadJob({
    links,
    existingNotifications: [{ metadata: { propertyNeighborhoodEventIds: ['link-old'] } }],
  });

  await job.neighborhoodChangeNotificationJob();

  const calls = getCreateCalls();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].metadata.propertyNeighborhoodEventIds, ['link-new']);
});

test('links suppressed by Property Context policy are excluded from the batch entirely', async () => {
  const { job, getCreateCalls } = loadJob({ links: [link()], planningApplicable: false });

  await job.neighborhoodChangeNotificationJob();

  assert.equal(getCreateCalls().length, 0);
});
