const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// FRD v1.479: Community in Ask. The pure answer is tested from the sections it is given; the reader is tested with the feed providers replaced so each section's
// reason for being empty (none found, no feed for this city, the source did not answer) is proved apart.
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { communityFromSections } = require('../../src/services/ask/handlers/communityUpdates.handler.ts');
const { communityViewFor, COMMUNITY_MESSAGES } = require('../../src/services/ask/support/communityUpdates.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const rss = require('../../src/community/providers/rss.provider.ts');
const nyc = require('../../src/community/providers/nycOpenData.provider.ts');
const reader = require('../../src/community/communityAskReader.ts');

const now = '2026-10-28T15:00:00.000Z';
const event = (id, extra = {}) => ({ source: 'ticketmaster', externalId: id, title: `Event ${id}`, category: 'COMMUNITY', startTime: '2026-11-02T19:00:00.000Z', externalUrl: 'https://example.test/e', venueName: 'Town Hall', city: 'Princeton', state: 'NJ', ...extra });
const notice = (title, extra = {}) => ({ title, description: 'Details', publishedAt: now, sourceName: 'Princeton NJ - General Municipal Alerts (RSS)', ...extra });
const sec = (status, items = [], extra = {}) => ({ status, items, sourceNames: ['Source'], fetchedAt: now, ...extra });

test('which view a question asks for: one named section, or everything', () => {
  assert.equal(communityViewFor('Show community events near me'), 'EVENTS');
  assert.equal(communityViewFor('Any city alerts for my area?'), 'ALERTS');
  assert.equal(communityViewFor('When is trash pickup?'), 'TRASH');
  assert.equal(communityViewFor('Show community updates for my home'), 'ALL');
  assert.equal(communityViewFor('Events and trash pickup'), 'ALL');
});

test('routing: the community questions reach the operation; writes, the radar, weather and the timeline do not', () => {
  for (const m of ['What community events are happening near me?', 'When is trash pickup?', 'Show my trash schedule', 'Any city alerts for my area?', ...Object.values(COMMUNITY_MESSAGES)]) {
    assert.equal(resolveAskOperation(m).operationId, 'COMMUNITY_UPDATES', m);
  }
  for (const m of ['Add a community event to my timeline', 'Show my home event radar feed', 'What is happening near my home?', 'What is the weather alert for my area?', 'Show my home timeline', 'Remind me when trash pickup is']) {
    assert.notEqual(resolveAskOperation(m).operationId, 'COMMUNITY_UPDATES', m);
  }
});

test('a ready overview lists each section, switches view by declared actions, names its source and shows no link', () => {
  const result = communityFromSections('ALL', 'Princeton', 'NJ', { events: sec('READY', [event('1'), event('2')]), alerts: sec('READY', [notice('Road closure on Nassau St')]), trash: sec('READY', [notice('Recycling moves to Wednesday')]) });
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
  assert.equal(result.reasonCode, 'COMMUNITY_READY');
  assert.match(result.blocks[0].body, /2 events, 1 alert, 1 recycling update found for Princeton/);
  assert.deepEqual(result.blocks[0].actions.map((action) => action.id), ['community-show-events', 'community-show-alerts', 'community-show-trash']);
  assert.ok(result.blocks[0].actions.every((action) => action.operationId === 'COMMUNITY_UPDATES' && resolveAskOperation(action.message).operationId === 'COMMUNITY_UPDATES'));
  const text = JSON.stringify(result);
  assert.doesNotMatch(text, /https?:\/\//, 'no source link is carried');
  const items = result.blocks.filter((block) => block.type === 'GROUPED_LIST').flatMap((block) => block.sections[0].items);
  assert.ok(items.every((item) => item.href === null));
  assert.ok(items.some((item) => item.meta.includes('Princeton NJ - General Municipal Alerts (RSS)')));
});

test('each empty section says why: none found, no feed for the city, no public trash feed, or the source did not answer', () => {
  const body = (feeds) => communityFromSections('ALL', 'Metuchen', 'NJ', feeds);
  const titles = (result) => result.blocks.filter((block) => block.type === 'LIMITATION').map((block) => block.title);
  const unsupported = body({ events: sec('NONE'), alerts: sec('UNSUPPORTED'), trash: sec('UNSUPPORTED') });
  assert.ok(titles(unsupported).some((title) => /No upcoming events found near Metuchen/.test(title)));
  assert.ok(titles(unsupported).some((title) => /no alerts feed for Metuchen yet/i.test(title)));
  assert.match(JSON.stringify(unsupported), /not a statement that nothing is happening/);
  const noFeed = communityFromSections('TRASH', 'Jersey City', 'NJ', { events: null, alerts: null, trash: sec('NO_FEED', [], { sourceNames: ['City of Jersey City (DPW)'] }) });
  assert.match(noFeed.blocks.find((block) => block.type === 'LIMITATION').body, /does not guess a pickup schedule.*City of Jersey City \(DPW\)/);
  const down = body({ events: sec('UNAVAILABLE'), alerts: sec('UNAVAILABLE'), trash: sec('NO_FEED') });
  assert.equal(down.reasonCode, 'COMMUNITY_SOURCES_UNAVAILABLE');
  assert.equal(down.status, 'READY_WITH_LIMITATIONS');
  assert.match(down.blocks[0].body, /Nothing here means nothing is happening/);
  assert.ok(titles(down).some((title) => /source did not answer/.test(title)));
  assert.ok(down.blocks.at(-1).id === 'community-boundary');
});

test('a single view lists up to 20, offers the other views, and a partly failed section says so', () => {
  const many = Array.from({ length: 25 }, (_, index) => event(String(index)));
  const result = communityFromSections('EVENTS', 'Princeton', 'NJ', { events: sec('READY', many), alerts: null, trash: null });
  const list = result.blocks.find((block) => block.type === 'GROUPED_LIST');
  assert.equal(list.sections[0].items.length, 20);
  assert.deepEqual(result.blocks[0].actions.map((action) => action.id), ['community-show-all', 'community-show-alerts', 'community-show-trash']);
  const partial = communityFromSections('ALERTS', 'NYC', 'NY', { events: null, alerts: sec('READY', [notice('Alert')], { partial: true }), trash: null });
  assert.ok(partial.blocks.some((block) => block.id === 'community-alerts-partial'));
});

test('the reader tells an unsupported city, a failed feed and an empty feed apart', async () => {
  const saved = { rss: rss.fetchRssItemsStrict, nyc: nyc.fetchNycEmergencyNotificationsStrict };
  reader.clearCommunityReaderCache();
  try {
    rss.fetchRssItemsStrict = async () => { throw new Error('feed down'); };
    assert.equal((await reader.readCityAlerts('Princeton', 'NJ', 5)).status, 'UNAVAILABLE');
    reader.clearCommunityReaderCache();
    rss.fetchRssItemsStrict = async () => [];
    assert.equal((await reader.readCityAlerts('Princeton', 'NJ', 5)).status, 'NONE');
    reader.clearCommunityReaderCache();
    rss.fetchRssItemsStrict = async () => [{ title: 'Alert', link: 'https://x.test', description: null, publishedAt: now }];
    const ready = await reader.readCityAlerts('Princeton', 'NJ', 5);
    assert.equal(ready.status, 'READY');
    assert.deepEqual(ready.items.map((item) => item.title), ['Alert']);
    assert.equal((await reader.readCityAlerts('Metuchen', 'NJ', 5)).status, 'UNSUPPORTED');
    assert.equal((await reader.readCityTrash('Metuchen', 'NJ', 5)).status, 'UNSUPPORTED');
    const noFeed = await reader.readCityTrash('Jersey City', 'NJ', 5);
    assert.equal(noFeed.status, 'NO_FEED');
    assert.ok(noFeed.sourceNames.some((name) => /Jersey City/.test(name)));
    reader.clearCommunityReaderCache();
    nyc.fetchNycEmergencyNotificationsStrict = async () => { throw new Error('NYC down'); };
    assert.equal((await reader.readCityAlerts('New York', 'NY', 5)).status, 'UNAVAILABLE');
    const events = await reader.readCommunityEvents({ getCommunityEventsByCity: async () => { throw new Error('Missing env var'); } }, 'Princeton', 'NJ', 5);
    assert.equal(events.status, 'UNAVAILABLE');
    reader.clearCommunityReaderCache();
    assert.equal((await reader.readCommunityEvents({ getCommunityEventsByCity: async () => [] }, 'Princeton', 'NJ', 5)).status, 'NONE');
  } finally { rss.fetchRssItemsStrict = saved.rss; nyc.fetchNycEmergencyNotificationsStrict = saved.nyc; reader.clearCommunityReaderCache(); }
});

test('the operation reads the property\'s city, and a home with no city is asked for it without any lookup', async () => {
  const saved = prismaModule.prisma;
  try {
    prismaModule.prisma = new Proxy({}, { get(_t, model) { if (model === 'then') return undefined; if (model === 'property') return { findFirst: async () => ({ city: null, state: null }) }; throw new Error(`Unexpected prisma.${String(model)} access`); } });
    const result = await capabilityInvoke('COMMUNITY_UPDATES', { userId: 'u1', propertyId: 'p1', message: 'Show community updates for my home' }, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });
    assert.equal(result.status, 'NEEDS_CONTEXT');
    assert.equal(result.reasonCode, 'COMMUNITY_LOCATION_REQUIRED');
  } finally { prismaModule.prisma = saved; }
});

// ── "this weekend" (FRD v1.481) ──────────────────────────────────────────────────────────────────────
const { communityDateWindow } = require('../../src/services/ask/support/communityUpdates.ts');

test('a span of days is read in the home\'s own time zone, across a daylight-saving change, with the weekend under way kept', () => {
  const tz = 'America/New_York';
  const span = (now, message) => { const w = communityDateWindow(message, new Date(now), tz); return w && [w.key, w.start.toISOString(), w.end.toISOString()]; };
  // Wed 28 Oct 2026: the weekend is Sat 31 Oct (EDT) through Sun 1 Nov, the day daylight saving ends, so the span ends at Mon 2 Nov midnight EST.
  assert.deepEqual(span('2026-10-28T16:00:00Z', 'community events this weekend'), ['THIS_WEEKEND', '2026-10-31T04:00:00.000Z', '2026-11-02T05:00:00.000Z']);
  assert.deepEqual(span('2026-10-31T16:00:00Z', 'events this weekend'), ['THIS_WEEKEND', '2026-10-31T04:00:00.000Z', '2026-11-02T05:00:00.000Z']);
  assert.deepEqual(span('2026-11-01T17:00:00Z', 'events this weekend'), ['THIS_WEEKEND', '2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z'], 'Sunday keeps the weekend that is under way');
  assert.deepEqual(span('2026-11-02T17:00:00Z', 'events this weekend'), ['THIS_WEEKEND', '2026-11-07T05:00:00.000Z', '2026-11-09T05:00:00.000Z'], 'Monday looks to the coming one');
  assert.deepEqual(span('2026-10-28T16:00:00Z', 'events next weekend'), ['NEXT_WEEKEND', '2026-11-07T05:00:00.000Z', '2026-11-09T05:00:00.000Z']);
  assert.deepEqual(span('2026-10-28T16:00:00Z', 'events tomorrow'), ['TOMORROW', '2026-10-29T04:00:00.000Z', '2026-10-30T04:00:00.000Z']);
  assert.deepEqual(span('2026-10-28T16:00:00Z', 'events this week'), ['THIS_WEEK', '2026-10-28T04:00:00.000Z', '2026-11-02T05:00:00.000Z']);
  assert.deepEqual(span('2026-11-02T17:00:00Z', 'events next week'), ['NEXT_WEEK', '2026-11-09T05:00:00.000Z', '2026-11-16T05:00:00.000Z']);
  assert.equal(span('2026-10-28T16:00:00Z', 'community events near me'), null);
  assert.ok(communityDateWindow('events this weekend', new Date('2026-10-28T16:00:00Z'), 'Not/AZone'), 'an invalid zone falls back to UTC instead of failing');
});

test('events outside the span are left out, and a span with none says so with the span named; alerts and trash are not narrowed', async () => {
  reader.clearCommunityReaderCache();
  const win = { start: new Date('2026-10-31T04:00:00.000Z'), end: new Date('2026-11-02T05:00:00.000Z') };
  const service = { getCommunityEventsByCity: async ({ limit }) => { assert.equal(limit, 100, 'the nearest events are read so the span can be found among them'); return [event('1', { startTime: '2026-10-30T20:00:00.000Z' }), event('2', { startTime: '2026-10-31T23:00:00.000Z' }), event('3', { startTime: '2026-11-01T15:00:00.000Z' }), event('4', { startTime: '2026-11-03T01:00:00.000Z' })]; } };
  const inSpan = await reader.readCommunityEvents(service, 'Princeton', 'NJ', 5, win);
  assert.deepEqual(inSpan.items.map((item) => item.externalId), ['2', '3']);
  reader.clearCommunityReaderCache();
  const none = await reader.readCommunityEvents(service, 'Princeton', 'NJ', 5, { start: new Date('2026-12-01T00:00:00.000Z'), end: new Date('2026-12-03T00:00:00.000Z') });
  assert.equal(none.status, 'NONE');
  const answer = communityFromSections('EVENTS', 'Princeton', 'NJ', { events: none, alerts: null, trash: null }, 'this weekend');
  assert.match(answer.blocks.find((block) => block.type === 'LIMITATION').title, /No upcoming events found near Princeton this weekend/);
  assert.match(answer.blocks[0].title, /Community events near Princeton, NJ, this weekend/);
  const ready = communityFromSections('EVENTS', 'Princeton', 'NJ', { events: sec('READY', inSpan.items), alerts: null, trash: null }, 'this weekend');
  assert.equal(ready.blocks.find((block) => block.type === 'GROUPED_LIST').title, 'Community events, this weekend');
});
