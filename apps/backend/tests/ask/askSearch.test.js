const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { logger } = require('../../src/lib/logger.ts');
const { composeAskSearch, normalizeSearchQuery, validateAskSearchProviders } = require('../../src/services/ask/askSearch.service.ts');
const { ASK_SEARCH_PROVIDERS, recordRowTitle } = require('../../src/services/ask/search/askSearchProviders.ts');
const { ASK_RECORD_SECTION_REGISTRY } = require('../../src/services/ask/governance/askRecordSectionRegistry.ts');
const { ASK_WORK_PROVIDER_REGISTRY } = require('../../src/services/ask/governance/askWorkProviderRegistry.ts');
const { ASK_ARTIFACT_TYPE_REGISTRY } = require('../../src/services/ask/governance/askArtifactTypeRegistry.ts');
const { ASK_WORK_PROVIDER_READERS } = require('../../src/services/ask/askWork.service.ts');
const { ASK_SAVED_TYPE_READERS } = require('../../src/services/ask/saved/savedTypeReaders.ts');
const { readClaimWork } = require('../../src/services/ask/work/claims.reader.ts');

const NOW = new Date('2026-10-20T12:00:00.000Z');
const ctx = (extra = {}) => ({ userId: 'u1', propertyId: 'p1', role: 'OWNER', operatingMode: 'OWNING', now: NOW, ...extra });
const result = (providerId, group, title, extra = {}) => ({ resultKey: `${providerId}:${title}`, group, providerId, typeLabel: 'T', title, snippet: null, propertyId: 'p1', status: null, asOf: '2026-10-01T00:00:00.000Z', freshness: null, destination: { kind: 'WORK', workKey: 'x' }, ...extra });
const fake = (id, group, search, extra = {}) => ({ id, group, label: id, search, ...extra });

test('every Record section, Work provider and Saved type is a search provider, searchable or reported unavailable with a reason', () => {
  assert.deepEqual(validateAskSearchProviders(), []);
  const ids = new Set(ASK_SEARCH_PROVIDERS.map((p) => p.id));
  for (const section of ASK_RECORD_SECTION_REGISTRY) assert.ok(ids.has(`RECORD_${section.id}`), section.id);
  for (const provider of ASK_WORK_PROVIDER_REGISTRY) assert.ok(ids.has(`WORK_${provider.id}`), provider.id);
  for (const type of ASK_ARTIFACT_TYPE_REGISTRY) assert.ok(ids.has(`SAVED_${type.id}`), type.id);
  assert.ok(ids.has('HISTORY_CONVERSATIONS') && ids.has('CAPABILITIES'));
  for (const provider of ASK_SEARCH_PROVIDERS.filter((p) => p.unavailableReason)) assert.ok(provider.unavailableReason.length > 15, provider.id);
  assert.match(validateAskSearchProviders([{ id: 'x', group: 'WORK', label: 'x' }]).join(), /neither searchable/);
});

test('queries are bounded: too short and too long are refused, spaces are collapsed', () => {
  assert.throws(() => normalizeSearchQuery('a'), /too short/);
  assert.throws(() => normalizeSearchQuery('x'.repeat(81)), /too long/);
  assert.equal(normalizeSearchQuery('  water   heater '), 'water heater');
});

test('groups results by type, ranks title matches first, and carries property and freshness metadata', async () => {
  const providers = [
    fake('W1', 'WORK', async () => ({ more: false, results: [result('W1', 'WORK', 'Fix the roof leak', { asOf: '2026-10-19T00:00:00.000Z' }), result('W1', 'WORK', 'roof', { asOf: '2026-01-01T00:00:00.000Z' })] })),
    fake('S1', 'SAVED', async () => ({ more: true, results: [result('S1', 'SAVED', 'Roof quotes', { freshness: 'current', destination: { kind: 'SAVED', artifactKey: 'comparison:q1' } })] })),
  ];
  const response = await composeAskSearch(ctx(), 'roof', providers);
  assert.deepEqual(response.groups.map((g) => g.group), ['WORK', 'SAVED']);
  assert.deepEqual(response.groups[0].results.map((r) => r.title), ['roof', 'Fix the roof leak'], 'exact title match first');
  assert.equal(response.groups[1].more, true);
  assert.equal(response.groups[1].results[0].freshness, 'current');
  assert.ok(response.groups.flatMap((g) => g.results).every((r) => r.propertyId === 'p1'));
  assert.equal(response.partial, false);
  assert.equal(response.totalResults, 3);
});

test('one provider failing or timing out never blanks the response; it is named, and the others still answer', async () => {
  const providers = [
    fake('OK', 'RECORD', async () => ({ more: false, results: [result('OK', 'RECORD', 'Water heater')] })),
    fake('BOOM', 'WORK', async () => { throw new Error('db down'); }),
    fake('SLOW', 'SAVED', () => new Promise((resolve) => setTimeout(() => resolve({ more: false, results: [] }), 500))),
    fake('NOPE', 'HISTORY', null, { unavailableReason: 'Not searchable yet.' }),
  ];
  const response = await composeAskSearch(ctx(), 'water', providers, { timeoutMs: 40 });
  assert.equal(response.partial, true);
  assert.deepEqual(Object.fromEntries(response.providers.map((p) => [p.providerId, p.state])), { OK: 'AVAILABLE', BOOM: 'FAILED', SLOW: 'TIMED_OUT', NOPE: 'UNAVAILABLE' });
  assert.equal(response.groups.find((g) => g.group === 'RECORD').results.length, 1);
  assert.equal(response.providers.find((p) => p.providerId === 'NOPE').reason, 'Not searchable yet.');
  assert.ok(response.groups.some((g) => g.group === 'SAVED') && response.groups.find((g) => g.group === 'SAVED').results.length === 0, 'a failed group is still present and empty, not dropped');
});

test('a provider the role cannot use is reported and never called; another home\'s rows are dropped', async () => {
  let called = false;
  const providers = [
    fake('LOCKED', 'RECORD', async () => { called = true; return { more: false, results: [] }; }, { applicability: () => 'RESTRICTED' }),
    fake('LEAK', 'WORK', async () => ({ more: false, results: [result('LEAK', 'WORK', 'Mine'), result('LEAK', 'WORK', 'Other home', { propertyId: 'p2' })] })),
  ];
  const response = await composeAskSearch(ctx({ role: 'VIEWER' }), 'mine', providers);
  assert.equal(called, false);
  assert.equal(response.providers.find((p) => p.providerId === 'LOCKED').state, 'RESTRICTED');
  assert.deepEqual(response.groups.find((g) => g.group === 'WORK').results.map((r) => r.title), ['Mine']);
  assert.equal(response.partial, true);
});

test('the selected-home boundary holds for every group, conversations included', async () => {
  const providers = [
    fake('H', 'HISTORY', async () => ({ more: false, results: [result('H', 'HISTORY', 'Mine', { destination: { kind: 'HISTORY', sessionId: 's1', executionId: 'e1' } }), result('H', 'HISTORY', 'Other home chat', { propertyId: 'p2', destination: { kind: 'HISTORY', sessionId: 's2', executionId: 'e2' } })] })),
    fake('R', 'RECORD', async () => ({ more: false, results: [result('R', 'RECORD', 'Other record', { propertyId: 'p2' })] })),
    fake('C', 'CAPABILITY', async () => ({ more: false, results: [result('C', 'CAPABILITY', 'Other capability', { propertyId: 'p3' })] })),
  ];
  const response = await composeAskSearch(ctx(), 'chat', providers);
  assert.deepEqual(response.groups.find((g) => g.group === 'HISTORY').results.map((r) => r.title), ['Mine']);
  assert.equal(response.groups.find((g) => g.group === 'RECORD').results.length, 0);
  assert.equal(response.groups.find((g) => g.group === 'CAPABILITY').results.length, 0);
  assert.ok(response.groups.flatMap((g) => g.results).every((r) => r.propertyId === 'p1'));
});

test('telemetry carries counts, timings and the query length only: never the text, titles or ids', async () => {
  const lines = [];
  const original = logger.info;
  logger.info = (...args) => { lines.push(JSON.stringify(args)); };
  try {
    await composeAskSearch(ctx(), 'secret mortgage payoff', [fake('A', 'WORK', async () => ({ more: false, results: [result('A', 'WORK', 'Private payoff letter')] }))]);
  } finally { logger.info = original; }
  const logged = lines.join('\n');
  assert.match(logged, /ask_search/);
  assert.match(logged, /"queryLength":22/);
  assert.doesNotMatch(logged, /secret|mortgage|payoff|Private|resultKey/);
});

test('Record search goes through the section\'s own reader with the search term and no restricted detail, and opens the exact record', async () => {
  const calls = [];
  prisma.inventoryRoom = {
    findMany: async (args) => { calls.push(args); return [{ id: 'room-9', propertyId: 'p1', name: 'Primary bedroom', type: 'BEDROOM', floorLevel: 2, sortOrder: 0, updatedAt: new Date('2026-10-02T00:00:00Z'), _count: { items: 2, maintenanceTasks: 0 } }]; },
    count: async () => 1, groupBy: async () => [],
  };
  const provider = ASK_SEARCH_PROVIDERS.find((p) => p.id === 'RECORD_rooms');
  assert.equal(provider.applicability(ctx()), 'APPLICABLE');
  const output = await provider.search(ctx(), 'bedroom', 5);
  assert.match(JSON.stringify(calls[0].where), /"name":\{"contains":"bedroom","mode":"insensitive"\}/);
  assert.equal(output.results[0].title, 'Primary bedroom');
  // Choosing it asks, in the same conversation, the question that opens that area; nothing navigates.
  assert.deepEqual(output.results[0].destination, { kind: 'RECORD', sectionId: 'rooms', recordId: 'room-9', open: { question: output.results[0].destination.open.question } });
  assert.ok(output.results[0].destination.open.question.length > 0);
  assert.equal(output.results[0].snippet, null);
  assert.equal(recordRowTitle({ providerName: 'Rheem' }, 'Warranties'), 'Rheem');
  assert.equal(recordRowTitle({}, 'Warranties'), 'Warranties');
  const household = ASK_SEARCH_PROVIDERS.find((p) => p.id === 'RECORD_household-access');
  assert.ok(household.applicability(ctx({ role: 'VIEWER' })));
});

test('Work search matches on the owner\'s own text across every lifecycle view, scoped to the home', async () => {
  const calls = [];
  prisma.claim = { findMany: async (args) => { calls.push(args); return [{ id: 'c1', propertyId: 'p1', title: 'Water damage claim', status: 'CLOSED', providerName: 'Acme', nextFollowUpAt: null, updatedAt: NOW }]; }, count: async () => 1 };
  prisma.operationalWorkExecution = { findMany: async () => [] };
  const page = await readClaimWork({ userId: 'u1', propertyId: 'p1', role: 'OWNER' }, { view: 'NEEDS_YOU', allViews: true, search: 'water', after: null, limit: 6, status: null });
  const where = JSON.stringify(calls[0].where);
  assert.match(where, /"title":\{"contains":"water","mode":"insensitive"\}/);
  assert.doesNotMatch(where, /"status":\{"in":\["DRAFT"/, 'a closed claim is found although it is not in Needs you');
  assert.equal(page.rows[0].lifecycleView, 'COMPLETED');
  const provider = ASK_SEARCH_PROVIDERS.find((p) => p.id === 'WORK_CLAIMS');
  const original = ASK_WORK_PROVIDER_READERS.CLAIMS;
  ASK_WORK_PROVIDER_READERS.CLAIMS = async (context, query) => { assert.equal(query.allViews, true); assert.equal(query.search, 'water'); return original(context, query); };
  const output = await provider.search(ctx(), 'water', 5);
  ASK_WORK_PROVIDER_READERS.CLAIMS = original;
  assert.equal(output.results[0].destination.workKey, 'claim:c1');
  assert.ok(output.results[0].destination.open.question.length > 0);
  for (const id of ['MONITORS', 'QUEUED_JOBS', 'SCHEDULED_FOLLOW_UPS']) assert.ok(ASK_SEARCH_PROVIDERS.find((p) => p.id === `WORK_${id}`).search, `${id} is now searchable`);
});

test('Saved search uses the artifact reader, active list only, and opens the exact artifact', async () => {
  prisma.askSavedArtifactPreference = { findMany: async () => [{ artifactKey: 'comparison:q-archived' }] };
  const seen = [];
  const original = ASK_SAVED_TYPE_READERS.QUOTE_COMPARISON;
  ASK_SAVED_TYPE_READERS.QUOTE_COMPARISON = async (_c, query) => {
    seen.push(query);
    return { rows: [{ artifactKey: 'comparison:q1', title: 'Roofing quotes', summary: 'Selected Acme', version: { label: 'Decided' }, sourceAsOf: '2026-10-07T00:00:00.000Z', freshness: { state: 'CURRENT' } }], total: 1, otherTotal: null };
  };
  const output = await ASK_SEARCH_PROVIDERS.find((p) => p.id === 'SAVED_QUOTE_COMPARISON').search(ctx(), 'roof', 5);
  ASK_SAVED_TYPE_READERS.QUOTE_COMPARISON = original;
  assert.equal(seen[0].archived, 'ACTIVE');
  assert.deepEqual(seen[0].archivedByYouIds, ['q-archived']);
  // A row with no registered reopen operation falls back to the Saved question; one with it carries the operation and exact record (see the Work test).
  assert.deepEqual(output.results[0].destination, { kind: 'SAVED', artifactKey: 'comparison:q1', open: { question: 'Show my saved results' } });
  assert.equal(ASK_SEARCH_PROVIDERS.find((p) => p.id === 'SAVED_HOME_DIGITAL_WILL').unavailableReason.length > 20, true);
});

test('capability matches only launch the reviewed question; search text never becomes a route, operation or URL', async () => {
  const provider = ASK_SEARCH_PROVIDERS.find((p) => p.id === 'CAPABILITIES');
  const output = await provider.search(ctx(), 'maintenance', 5);
  assert.ok(output.results.length > 0);
  for (const entry of output.results) {
    assert.equal(entry.destination.kind, 'CAPABILITY');
    assert.ok(entry.destination.question.length > 0);
    assert.ok(!('href' in entry.destination) && !('operationId' in entry.destination));
    assert.doesNotMatch(JSON.stringify(entry.destination), /^\/|https?:/);
  }
  assert.deepEqual((await provider.search(ctx(), 'zzzzqqqq', 5)).results, []);
});
