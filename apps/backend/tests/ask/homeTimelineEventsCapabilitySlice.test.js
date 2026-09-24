const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.61: HOME_TIMELINE_EVENTS (Home Timeline), the thirteenth new Ask operation for a
// capability the Appendix D audit found with none. listHomeEvents is stubbed for the answer tests; one test runs it
// against a fake prisma that answers only reads, to pin the page's query and show the read never writes.

const prismaModule = require('../../src/lib/prisma.ts');
const { homeTimelineFromView, HOME_TIMELINE_ASK_LIMIT } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const { HomeEventsService } = require('../../src/services/homeEvents.service.ts');

const PAGE = '/dashboard/properties/p1/timeline';
const originals = { prisma: prismaModule.prisma, list: HomeEventsService.prototype.listHomeEvents };
let calls;

const event = (id, overrides = {}) => ({
  id, title: `Event ${id}`, summary: null, type: 'REPAIR', subtype: null, importance: 'NORMAL', visibility: 'HOUSEHOLD', createdById: 'u2',
  occurredAt: new Date('2024-06-15T12:00:00.000Z'), datePrecision: 'EXACT_DATE', dateRangeStart: null, dateRangeEnd: null,
  verificationStatus: 'UNVERIFIED', meta: null, ...overrides,
});
const events = () => [
  event('kitchen', { title: 'Kitchen remodel', type: 'IMPROVEMENT', importance: 'HIGHLIGHT', verificationStatus: 'EVIDENCE_VERIFIED', summary: 'New cabinets and counters.' }),
  event('mine', { title: 'My private note', type: 'NOTE', visibility: 'PRIVATE', createdById: 'u1', occurredAt: new Date('2024-02-15T12:00:00.000Z'), datePrecision: 'MONTH' }),
  event('theirs', { title: 'Someone else private note', type: 'NOTE', visibility: 'PRIVATE', createdById: 'u2' }),
  event('inspection', { title: 'Home inspection', type: 'INSPECTION', occurredAt: new Date('2023-05-01T12:00:00.000Z'), datePrecision: 'YEAR', verificationStatus: 'HOMEOWNER_CONFIRMED' }),
  event('synthetic-appliance-dishwasher', { title: 'Purchased: Dishwasher', type: 'PURCHASE', subtype: 'APPLIANCE_INVENTORY', occurredAt: new Date('2022-03-10T12:00:00.000Z'), verificationStatus: 'PENDING_CONFIRMATION', meta: { synthetic: true } }),
  event('roof', { title: 'Old roof work', occurredAt: new Date('2019-01-01T12:00:00.000Z'), datePrecision: 'UNKNOWN', verificationStatus: 'DISPUTED' }),
];

function install() {
  calls = [];
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      throw new Error(`Unexpected prisma.${String(model)} access`);
    },
  });
  HomeEventsService.prototype.listHomeEvents = async function (...args) { calls.push(args); return { events: events(), signalEvents: [], timelineEntries: [] }; };
}

function restore() {
  prismaModule.prisma = originals.prisma;
  HomeEventsService.prototype.listHomeEvents = originals.list;
}

test.beforeEach(install);
test.afterEach(restore);

test('the operation reads the page\'s event list (limit 80) behind the page\'s viewer floor, for the asking user', async () => {
  const envelope = { userId: 'u1', propertyId: 'p1', message: 'Show my home timeline' };
  const viewer = await capabilityInvoke('HOME_TIMELINE_EVENTS', envelope, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });
  assert.deepEqual(calls, [['p1', { limit: 80 }]]);
  const titles = viewer.blocks.find((block) => block.id === 'home-timeline-events').sections.flatMap((section) => section.items.map((row) => row.title));
  assert.equal(titles.includes('My private note'), true);
  assert.equal(titles.includes('Someone else private note'), false);
});

test('the real list query is the page\'s (current, not deleted, newest first) and the read never writes', async () => {
  HomeEventsService.prototype.listHomeEvents = originals.list;
  const queries = [];
  const readOnly = (name, findMany) => new Proxy({ findMany }, { get(target, key) { if (key in target) return target[key]; throw new Error(`Unexpected ${name}.${String(key)}`); } });
  prismaModule.prisma = {
    homeEvent: readOnly('homeEvent', async (query) => { queries.push(query); return []; }),
    inventoryItem: readOnly('inventoryItem', async () => []),
    propertyRecordLink: readOnly('propertyRecordLink', async () => []),
  };
  await new HomeEventsService().listHomeEvents('p1', { limit: 80 });
  assert.deepEqual(queries[0].where, { propertyId: 'p1', isCurrent: true, deletedAt: null });
  assert.deepEqual(queries[0].orderBy, [{ occurredAt: 'desc' }, { id: 'desc' }]);
});

test('events are grouped by year with precision-honest dates, verification, and links; synthetic events link to the page', () => {
  const result = homeTimelineFromView(events(), 'p1', 'u1');
  assert.equal(result.blocks[0].title, '5 events on the home timeline');
  assert.equal(result.blocks[0].body, '2 confirmed or verified by evidence. 1 is disputed. Most recent: Kitchen remodel (Jun 15, 2024).');
  assert.equal(result.blocks[0].tone, 'CAUTION');
  const list = result.blocks.find((block) => block.id === 'home-timeline-events');
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((row) => row.title)]), [
    ['2024', ['Kitchen remodel', 'My private note']],
    ['2023', ['Home inspection']],
    ['2022', ['Purchased: Dishwasher']],
    ['Date unknown', ['Old roof work']],
  ]);
  const [kitchen, mine] = list.sections[0].items;
  assert.deepEqual(kitchen.meta, ['Jun 15, 2024', 'Improvement', 'Highlight']);
  assert.equal(kitchen.status, 'Evidence Verified');
  assert.equal(kitchen.description, 'New cabinets and counters.');
  assert.equal(kitchen.href, `${PAGE}?eventId=kitchen`);
  assert.deepEqual(mine.meta, ['February 2024', 'Note', 'Private']);
  assert.equal(list.sections[1].items[0].meta[0], '2023');
  const synthetic = list.sections[2].items[0];
  assert.deepEqual(synthetic.meta, ['Mar 10, 2022', 'Purchase', 'Appliance Inventory']);
  assert.equal(synthetic.href, PAGE);
  assert.equal(list.sections[3].items[0].meta[0], 'Date unknown');
  assert.equal(list.sections[3].items[0].status, 'Disputed');
});

test('a range keeps its range; a full page is disclosed; an empty timeline is not an all-clear', () => {
  const ranged = homeTimelineFromView([event('r', { datePrecision: 'RANGE', dateRangeStart: new Date('2020-04-01T12:00:00.000Z'), dateRangeEnd: new Date('2020-06-30T12:00:00.000Z') })], 'p1', 'u1');
  assert.equal(ranged.blocks.find((block) => block.id === 'home-timeline-events').sections[0].items[0].meta[0], 'Apr 1, 2020 – Jun 30, 2020');
  const full = homeTimelineFromView(Array.from({ length: HOME_TIMELINE_ASK_LIMIT }, (_, index) => event(`e${index}`)), 'p1', 'u1');
  assert.equal(full.blocks.find((block) => block.id === 'home-timeline-limit').title, 'Showing the 80 most recent events');
  const onlyOthersPrivate = homeTimelineFromView([event('theirs', { visibility: 'PRIVATE', createdById: 'u2' })], 'p1', 'u1');
  assert.equal(onlyOthersPrivate.reasonCode, 'HOME_TIMELINE_EMPTY');
  assert.equal(onlyOthersPrivate.blocks[0].title, 'No events on the timeline yet');
  assert.equal(onlyOthersPrivate.blocks.at(-1).title, 'History as recorded');
});

test('every block and the boundary survive the answer-trust validator, and the page link the whitelist', () => {
  const raw = homeTimelineFromView(events(), 'p1', 'u1');
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'home-timeline.events', operationId: 'HOME_TIMELINE_EVENTS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-24T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my home timeline', operationId: 'HOME_TIMELINE_EVENTS', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId: 'HOME_TIMELINE_EVENTS', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true);
});

test('timeline phrasing routes here; recent changes, past hazards and logging an event are not claimed by the pattern', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true });
  for (const message of ['Show my home timeline', 'Open the home timeline', 'What does the history of our home include?', 'What does our home timeline show for the last few years?']) {
    assert.equal(route(message).operation?.operationId, 'HOME_TIMELINE_EVENTS', message);
  }
  assert.equal(route('What changed at my home recently?').operation?.operationId, 'HOME_CHANGE_SUMMARY');
  assert.equal(route('Has this house been through any wildfires or floods?').operation?.operationId, 'PAST_HAZARD_EXPOSURE');
  // Each of these matches the timeline pattern, so only the exclusion keeps the deterministic pattern from claiming them.
  for (const message of ['Log a repair on my home timeline', 'Show the flood history of my home', 'Correct the date on my home timeline']) {
    const resolution = route(message);
    assert.equal(resolution.stage === 'DETERMINISTIC' && resolution.operation?.operationId === 'HOME_TIMELINE_EVENTS', false, message);
  }
});

test('the operation is fully registered: its own skill, the bridge, and the card launch', () => {
  assert.equal(getSkillForOperation('HOME_TIMELINE_EVENTS').id, 'home-timeline');
  assert.equal(ASK_OPERATION_CAPABILITY.HOME_TIMELINE_EVENTS, 'home-timeline');
  const launch = capabilityCardLaunch('home-timeline').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'HOME_TIMELINE_EVENTS');
});
