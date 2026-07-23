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
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache. This job transitively imports guidanceJourney.service.ts,
// which constructs a GeminiService singleton at module load — that throws if
// GEMINI_API_KEY is unset, so it's stubbed before the real require() below.

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';

require('ts-node/register');

const { neighborhoodChangeNotificationJob } = require('../../src/jobs/neighborhoodChangeNotification.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ links, existingNotifications = [], planningApplicable = true }) {
  const createCalls = [];

  const deps = {
    prisma: {
      propertyNeighborhoodEvent: {
        findMany: async () => links,
      },
      notification: {
        findMany: async () => existingNotifications,
      },
    },
    notificationService: {
      create: async (input) => {
        createCalls.push(input);
        return { id: `notification-${createCalls.length}` };
      },
    },
    guidanceJourneyService: {
      ingestSignal: async () => {},
    },
    getPlanningContextEnvelope: async () => ({
      decision: { status: planningApplicable ? 'APPLICABLE' : 'NOT_APPLICABLE' },
    }),
    logger: noopLogger,
  };

  return { deps, getCreateCalls: () => createCalls };
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
  const { deps, getCreateCalls } = fakeDeps({ links: [link()] });

  await neighborhoodChangeNotificationJob(deps);

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
  const { deps, getCreateCalls } = fakeDeps({ links });

  await neighborhoodChangeNotificationJob(deps);

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
  const { deps, getCreateCalls } = fakeDeps({ links });

  await neighborhoodChangeNotificationJob(deps);

  const calls = getCreateCalls();
  assert.equal(calls.length, 2);
  const userIds = calls.map((c) => c.userId).sort();
  assert.deepEqual(userIds, ['user-1', 'user-2']);
});

test('a link already covered by a prior batched notification is not re-notified', async () => {
  const theLink = link({ id: 'link-a' });
  const { deps, getCreateCalls } = fakeDeps({
    links: [theLink],
    existingNotifications: [{ metadata: { propertyNeighborhoodEventIds: ['link-a'] } }],
  });

  await neighborhoodChangeNotificationJob(deps);

  assert.equal(getCreateCalls().length, 0);
});

test('a link already covered by a prior pre-batching (singular field) notification is not re-notified', async () => {
  const theLink = link({ id: 'link-a' });
  const { deps, getCreateCalls } = fakeDeps({
    links: [theLink],
    existingNotifications: [{ metadata: { propertyNeighborhoodEventId: 'link-a' } }],
  });

  await neighborhoodChangeNotificationJob(deps);

  assert.equal(getCreateCalls().length, 0, 'must recognize the legacy singular metadata shape too');
});

test('a new link is still notified alongside an already-notified link for the same property', async () => {
  const links = [
    link({ id: 'link-old', eventId: 'event-old' }),
    link({ id: 'link-new', eventId: 'event-new' }),
  ];
  const { deps, getCreateCalls } = fakeDeps({
    links,
    existingNotifications: [{ metadata: { propertyNeighborhoodEventIds: ['link-old'] } }],
  });

  await neighborhoodChangeNotificationJob(deps);

  const calls = getCreateCalls();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].metadata.propertyNeighborhoodEventIds, ['link-new']);
});

test('links suppressed by Property Context policy are excluded from the batch entirely', async () => {
  const { deps, getCreateCalls } = fakeDeps({ links: [link()], planningApplicable: false });

  await neighborhoodChangeNotificationJob(deps);

  assert.equal(getCreateCalls().length, 0);
});
