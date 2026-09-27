const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Radar R-2 (FRD v1.133): the feed's filters are a governed refinement. The real registered `home-event-radar.feed` handler runs against a
// fake prisma (only the source-execution lookup) and a fake canonical feed that honours lifecycle, source and state filters, limits and
// totals, and records every read. Reading changes nothing.
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { radarQueryService } = require('../../src/modules/homeEventRadar/services/radarQuery.service.ts');
const { resolveRadarRefinement, radarFeedFilterChips, radarFiltersFromViewState } = require('../../src/services/ask/handlers/homeEventRadar.handler.ts');
const { isFilterContinuationMessage, resolveAskFollowUpMessage } = require('../../src/services/ask/askFollowUpContext.ts');

const realPrisma = prismaModule.prisma;
const originalAccess = propertyAccess.resolvePropertyAccess;
const originalListFeed = radarQueryService.listFeed;
const match = (id, sourceFamily, lifecycle, userState = 'new', priorityBand = 'high') => ({
  id, title: `Event ${id}`, summary: `Summary ${id}`, severity: 'high', sourceFamily, sourceName: 'Source', userState, matchLifecycleStatus: lifecycle, priorityBand, isSourceStale: false,
});
const BASE = [
  match('w-now', 'weather', 'now'), match('w-up', 'weather', 'upcoming'), match('a-now', 'air_quality', 'now'),
  match('u-end', 'utility', 'recently_ended'), match('w-dismissed', 'weather', 'now', 'dismissed'),
];

let feed; let reads; let priorOperation; let priorViewState;
function install(rows = BASE) {
  feed = rows; reads = []; priorOperation = 'HOME_EVENT_RADAR_FEED'; priorViewState = null;
  radarQueryService.listFeed = async (_propertyId, _userId, options) => {
    reads.push(options);
    const rowsOut = feed.filter((row) => (!options.lifecycle || options.lifecycle.includes(row.matchLifecycleStatus))
      && (!options.sourceFamily || options.sourceFamily.includes(row.sourceFamily))
      && (!options.state || options.state.includes(row.userState)));
    return { items: rowsOut.slice(0, options.limit), pageInfo: { hasNextPage: rowsOut.length > options.limit, endCursor: 'cursor-1' }, totalCount: rowsOut.length, feedState: 'CONFIRMED_CLEAR', asOf: '2026-09-26T00:00:00.000Z' };
  };
  prismaModule.prisma = new Proxy({}, { get(_t, m) {
    if (m === 'then') return undefined;
    if (m === 'askExecution') return { findFirst: async () => (priorViewState ? { operationId: priorOperation, parametersJson: { viewState: priorViewState } } : null) };
    throw new Error(`Unexpected prisma.${String(m)} access`);
  } });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'CONTRIBUTOR', userId: 'u1', propertyId: 'p1' });
}
test.afterEach(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = originalAccess; radarQueryService.listFeed = originalListFeed; });
const run = (message, sourceExecutionId, continuationCursor) => capabilityInvoke('HOME_EVENT_RADAR_FEED', { userId: 'u1', propertyId: 'p1', message, continuationCursor, launchContext: sourceExecutionId ? { surface: 'ASK_WORKSPACE', sourceExecutionId } : undefined });
const list = (result) => result.blocks.find((block) => block.id === 'home-event-radar-feed');
const summary = (result) => result.blocks.find((block) => block.id === 'home-event-radar-summary');
const ids = (result) => list(result).sections.flatMap((section) => section.items.map((item) => item.id)).sort();
const active = (result) => list(result).filters.filter((filter) => filter.active).map((filter) => filter.id).sort();
const view = (lifecycle, family, dismissed, revision, resultId = 'result-1') => ({ resultId, statusFilter: lifecycle, domainScopePhrase: family, dateScopePhrase: dismissed ? 'INCLUDE_DISMISSED' : null, selectedTaskId: null, revision });
const pageReads = () => reads.filter((options) => options.limit === 20);

test('a fresh question carries a new view state and the declared chips', async () => {
  install();
  const result = await run('Show my home event radar feed');
  assert.equal(result.parameters.viewState.revision, 1);
  assert.equal(result.parameters.viewState.statusFilter, 'ALL');
  assert.equal(result.parameters.viewState.domainScopePhrase, 'ALL');
  assert.equal(result.parameters.viewState.dateScopePhrase, null);
  assert.match(result.parameters.viewState.resultId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(active(result), ['radar-family-all', 'radar-hide-dismissed', 'radar-lifecycle-all']);
  assert.ok(!list(result).filters.some((filter) => filter.id === 'radar-clear-all'), 'no way back while nothing is applied');
  assert.deepEqual(ids(result), ['a-now', 'u-end', 'w-now', 'w-up'], 'dismissed events are hidden by default');
});

test('a timing chip keeps the result identity, bumps the revision, and replaces only the timing', async () => {
  install(); priorViewState = view('ALL', 'weather', false, 1);
  const result = await run('Only show events happening now', 'exec-1');
  assert.equal(result.parameters.viewState.resultId, 'result-1');
  assert.equal(result.parameters.viewState.revision, 2);
  assert.equal(result.parameters.viewState.statusFilter, 'now');
  assert.equal(result.parameters.viewState.domainScopePhrase, 'weather', 'the source filter is kept');
  assert.deepEqual(ids(result), ['w-now']);
  assert.deepEqual(active(result), ['radar-hide-dismissed', 'radar-family-weather', 'radar-lifecycle-now'].sort());
  assert.equal(summary(result).headline, '1 current weather event.');
});

test('a source chip is an authoritative re-query, not a filter over the earlier page', async () => {
  install(); priorViewState = view('ALL', 'ALL', false, 1);
  const result = await run('Only show utility events', 'exec-1');
  assert.deepEqual(ids(result), ['u-end']);
  assert.deepEqual(pageReads().map((options) => options.sourceFamily), [['utility']], 'one page read, asked for the new source');
});

test('the include-dismissed control adds dismissed events and can be reversed', async () => {
  install(); priorViewState = view('ALL', 'ALL', false, 1);
  const included = await run('Now show events including dismissed ones', 'exec-1');
  assert.ok(ids(included).includes('w-dismissed'));
  assert.equal(included.parameters.viewState.dateScopePhrase, 'INCLUDE_DISMISSED');
  priorViewState = included.parameters.viewState;
  const hidden = await run('Now show events without dismissed ones', 'exec-2');
  assert.ok(!ids(hidden).includes('w-dismissed'));
  assert.equal(hidden.parameters.viewState.dateScopePhrase, null);
});

test('Clear filters returns to the unfiltered feed and is offered only while a filter is applied', async () => {
  install(); priorViewState = view('upcoming', 'weather', true, 3);
  const before = await run('Only show events happening now', 'exec-1');
  assert.ok(list(before).filters.some((filter) => filter.id === 'radar-clear-all'));
  priorViewState = view('upcoming', 'weather', true, 3);
  const cleared = await run('Now show all events with no filters', 'exec-1');
  assert.deepEqual(cleared.parameters.viewState, { ...cleared.parameters.viewState, statusFilter: 'ALL', domainScopePhrase: 'ALL', dateScopePhrase: null });
  assert.ok(!list(cleared).filters.some((filter) => filter.id === 'radar-clear-all'));
});

test('a filter that matches nothing still continues the result and keeps the chips', async () => {
  install(); priorViewState = view('ALL', 'ALL', false, 1);
  const result = await run('Only show insurance events', 'exec-1');
  assert.equal(result.parameters.viewState.revision, 2);
  assert.equal(summary(result).headline, 'No monitored events match these filters.');
  assert.ok(list(result).filters.some((filter) => filter.id === 'radar-clear-all'));
  assert.ok(list(result).filters.some((filter) => filter.id === 'radar-family-insurance' && filter.active), 'the applied source stays selectable');
});

test('source chips are offered only for sources that have events under the other filters', async () => {
  install(); priorViewState = view('ALL', 'ALL', false, 1);
  const result = await run('Only show events happening now', 'exec-1');
  const families = list(result).filters.filter((filter) => filter.id.startsWith('radar-family-') && filter.id !== 'radar-family-all').map((filter) => filter.id);
  assert.deepEqual(families, ['radar-family-air_quality', 'radar-family-weather']);
});

test('paging keeps the filters the source result recorded', async () => {
  install(); priorViewState = view('now', 'weather', false, 4);
  const result = await run('Show my home event radar feed. Show more monitored events', 'exec-1', 'cursor-0');
  assert.equal(pageReads()[0].cursor, 'cursor-0');
  assert.deepEqual(pageReads()[0].lifecycle, ['now']);
  assert.deepEqual(pageReads()[0].sourceFamily, ['weather']);
  assert.equal(result.parameters.viewState.resultId, 'result-1');
});

test('an ordinary question is answered on its own, and another domain\'s view state is never continued', async () => {
  install(); priorViewState = view('now', 'weather', false, 1);
  const ordinary = await run('Show my home event radar feed for utility events', 'exec-1');
  assert.equal(ordinary.parameters.viewState.statusFilter, 'ALL');
  assert.equal(ordinary.parameters.viewState.domainScopePhrase, 'utility');
  install(); priorViewState = view('now', 'weather', false, 1); priorOperation = 'MAINTENANCE_STATUS';
  const foreign = await run('Only show events happening now', 'exec-1');
  assert.equal(foreign.parameters.viewState.revision, 1, 'a view state from another operation is ignored');
});

test('every declared chip begins with a continuation phrase, resolves back to its own filters, and replaces one dimension', () => {
  const base = { lifecycle: 'upcoming', sourceFamily: 'weather', includeDismissed: true };
  const prior = view('upcoming', 'weather', true, 1);
  const chips = radarFeedFilterChips(base, ['weather', 'air_quality']);
  for (const chip of chips) assert.ok(isFilterContinuationMessage(chip.message), chip.message);
  const resolved = (id) => resolveRadarRefinement(chips.find((chip) => chip.id === id).message, prior);
  assert.deepEqual(resolved('radar-lifecycle-all'), { ...base, lifecycle: null });
  assert.deepEqual(resolved('radar-lifecycle-recently_ended'), { ...base, lifecycle: 'recently_ended' });
  assert.deepEqual(resolved('radar-family-all'), { ...base, sourceFamily: null });
  assert.deepEqual(resolved('radar-family-air_quality'), { ...base, sourceFamily: 'air_quality' });
  assert.deepEqual(resolved('radar-hide-dismissed'), { ...base, includeDismissed: false });
  assert.deepEqual(resolved('radar-clear-all'), { lifecycle: null, sourceFamily: null, includeDismissed: false });
  assert.equal(resolveRadarRefinement('What is happening near my home?', prior), null);
  assert.equal(radarFiltersFromViewState(view('bogus', 'ALL', false, 1)), null);
});

test('the follow-up resolver treats a declared chip as a refinement of the radar feed', async () => {
  const prior = { id: 'exec-1', operationId: 'HOME_EVENT_RADAR_FEED', message: 'Show my home event radar feed', parametersJson: {}, status: 'ANSWERED' };
  const sessionPrisma = { askExecution: { findFirst: async () => prior, findMany: async () => [prior] } };
  prismaModule.prisma = new Proxy(sessionPrisma, { get: (target, name) => (name in target ? target[name] : realPrisma[name]) });
  const resolved = await resolveAskFollowUpMessage({ sessionId: 's1', propertyId: 'p1', message: 'Only show upcoming events', declaredSourceExecutionId: 'exec-1' });
  assert.equal(resolved.forcedOperationId, 'HOME_EVENT_RADAR_FEED');
  assert.equal(resolved.isFilterRefinement, true);
  assert.equal(resolved.sourceExecutionId, 'exec-1');
});
