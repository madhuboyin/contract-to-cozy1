const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Warranties W-2 (FRD v1.125): filters are a governed refinement. The real registered `warranty.lookup` handler runs against a fake prisma,
// so what is asserted is the result the homeowner would get, including continuity (result identity and revision) across chips.
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { resolveWarrantyRefinement, warrantyFilterChips } = require('../../src/services/ask/handlers/warranties.handler.ts');
const { isFilterContinuationMessage, resolveAskFollowUpMessage } = require('../../src/services/ask/askFollowUpContext.ts');

const realPrisma = prismaModule.prisma;
const originalAccess = propertyAccess.resolvePropertyAccess;
const today = new Date();
const day = (offset) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset));
const warranty = (id, overrides = {}) => ({
  id, propertyId: 'p1', providerName: `Provider ${id}`, category: 'APPLIANCE', coverageDetails: null, startDate: day(-500), expiryDate: day(300),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'), inventoryItem: null, documents: [], ...overrides,
});
const ROWS = [
  warranty('hvac-active', { category: 'HVAC', expiryDate: day(400) }),
  warranty('hvac-expiring', { category: 'HVAC', expiryDate: day(30) }),
  warranty('roof-expired', { category: 'ROOFING', expiryDate: day(-20) }),
  warranty('app-active', { category: 'APPLIANCE', expiryDate: day(200) }),
  warranty('app-review', { category: 'APPLIANCE', startDate: day(-10), expiryDate: day(-10) }),
];

let priorOperation; let priorViewState; let role;
function install(rows = ROWS) {
  priorOperation = 'WARRANTY_LOOKUP'; priorViewState = null; role = 'OWNER';
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'askExecution') return { findFirst: async () => (priorViewState ? { operationId: priorOperation, parametersJson: { viewState: priorViewState } } : null) };
    if (model === 'warranty') return { findMany: async (query) => (query.where.homeownerProfile ? [] : rows) };
    throw new Error(`Unexpected prisma.${String(model)} access`);
  } });
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
}
test.afterEach(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = originalAccess; });
const run = (message, sourceExecutionId) => capabilityInvoke('WARRANTY_LOOKUP', { userId: 'u1', propertyId: 'p1', message, launchContext: sourceExecutionId ? { surface: 'ASK_WORKSPACE', sourceExecutionId } : undefined });
const list = (result) => result.blocks.find((block) => block.id === 'warranty-results');
const summary = (result) => result.blocks.find((block) => block.id === 'warranty-summary');
const ids = (result) => list(result).sections[0].items.map((entry) => entry.id).sort();
const active = (result) => list(result).filters.filter((filter) => filter.active).map((filter) => filter.id).sort();
const view = (status, category, revision, resultId = 'result-1') => ({ resultId, domainScopePhrase: category, dateScopePhrase: null, statusFilter: status, selectedTaskId: null, revision });

test('a fresh collection question carries a new view state and declared chips that reflect only what this home has', async () => {
  install();
  const result = await run('Show my warranties');
  assert.equal(result.parameters.viewState.revision, 1);
  assert.equal(result.parameters.viewState.statusFilter, 'ALL');
  assert.equal(result.parameters.viewState.domainScopePhrase, null);
  assert.match(result.parameters.viewState.resultId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(list(result).filters.map((filter) => filter.id), [
    'status-all', 'status-active', 'status-expiring', 'status-expired', 'status-review', 'category-all', 'category-hvac', 'category-roofing', 'category-appliance',
    'order-attention', 'order-latest-expiry', 'order-newest', 'order-oldest', 'order-provider',
  ]);
  assert.deepEqual(active(result), ['category-all', 'order-attention', 'status-all']);
  assert.ok(!list(result).filters.some((filter) => filter.id === 'clear-all'), 'nothing to clear yet');
  assert.equal(list(result).filters.find((filter) => filter.id === 'status-expiring').label, 'Expires within 60 days');
});

test('a home with one category and no unreadable dates gets neither a category row nor a "Dates need review" chip', async () => {
  install([warranty('a', { category: 'HVAC' }), warranty('b', { category: 'HVAC', expiryDate: day(10) })]);
  const result = await run('Show my warranties');
  assert.deepEqual(list(result).filters.map((filter) => filter.id), ['status-all', 'status-active', 'status-expiring', 'status-expired', 'order-attention', 'order-latest-expiry', 'order-newest', 'order-oldest', 'order-provider']);
});

test('a status chip keeps the result identity, bumps the revision, re-queries every warranty and offers a way back', async () => {
  install(); priorViewState = view('ALL', null, 1);
  const result = await run('Only show warranties expiring within 60 days', 'exec-1');
  assert.equal(result.parameters.viewState.resultId, 'result-1');
  assert.equal(result.parameters.viewState.revision, 2);
  assert.equal(result.parameters.viewState.statusFilter, 'EXPIRING');
  assert.deepEqual(ids(result), ['hvac-expiring']);
  assert.equal(summary(result).headline, '1 warranty: 1 expiring within 60 days.');
  assert.deepEqual(active(result), ['category-all', 'order-attention', 'status-expiring']);
  assert.ok(list(result).filters.some((filter) => filter.id === 'clear-all'));
});

test('a category chip replaces only the category and keeps the status that was already applied', async () => {
  install(); priorViewState = view('ACTIVE', null, 2);
  const result = await run('Only show HVAC warranties', 'exec-2');
  assert.equal(result.parameters.viewState.statusFilter, 'ACTIVE');
  assert.equal(result.parameters.viewState.domainScopePhrase, 'HVAC');
  assert.equal(result.parameters.viewState.revision, 3);
  assert.deepEqual(ids(result), ['hvac-active']);
  assert.equal(summary(result).headline, '1 HVAC warranty: 1 active.');
  assert.deepEqual(active(result), ['category-hvac', 'order-attention', 'status-active']);
  assert.ok(list(result).filters.length > 0, 'one row is still a list with its chips');
});

test('every status has its own chip and lands on exactly its rows', async () => {
  install();
  const expected = { 'Only show active warranties': ['app-active', 'hvac-active'], 'Only show expired warranties': ['roof-expired'], 'Only show warranties with dates that need review': ['app-review'], 'Only show warranties expiring within 60 days': ['hvac-expiring'] };
  for (const [message, want] of Object.entries(expected)) {
    priorViewState = view('ALL', null, 1);
    assert.deepEqual(ids(await run(message, 'exec-1')), want, message);
  }
});

test('"All" clears only the status, "All categories" only the category, and "no filters" clears both', async () => {
  install();
  priorViewState = view('EXPIRED', 'ROOFING', 3);
  const allStatus = await run('Now show all warranties', 'exec-3');
  assert.equal(allStatus.parameters.viewState.statusFilter, 'ALL');
  assert.equal(allStatus.parameters.viewState.domainScopePhrase, 'ROOFING');
  assert.deepEqual(ids(allStatus), ['roof-expired']);

  priorViewState = view('EXPIRED', 'ROOFING', 3);
  const allCategories = await run('Now show all warranty categories', 'exec-3');
  assert.equal(allCategories.parameters.viewState.statusFilter, 'EXPIRED');
  assert.equal(allCategories.parameters.viewState.domainScopePhrase, null);
  assert.deepEqual(ids(allCategories), ['roof-expired']);

  priorViewState = view('EXPIRED', 'ROOFING', 3);
  const cleared = await run('Now show all warranties with no filters', 'exec-3');
  assert.equal(cleared.parameters.viewState.statusFilter, 'ALL');
  assert.equal(cleared.parameters.viewState.domainScopePhrase, null);
  assert.equal(ids(cleared).length, 5);
  assert.ok(!list(cleared).filters.some((filter) => filter.id === 'clear-all'));
});

test('a filter that matches nothing still continues the result and keeps every chip so it can be widened', async () => {
  install(); priorViewState = view('ALL', 'ROOFING', 1);
  const result = await run('Only show active warranties', 'exec-1');
  assert.equal(result.reasonCode, 'WARRANTY_FILTER_NO_MATCH');
  assert.equal(result.parameters.viewState.revision, 2);
  assert.equal(result.parameters.viewState.statusFilter, 'ACTIVE');
  assert.equal(summary(result).headline, 'No warranties match these filters.');
  assert.equal(list(result).sections[0].count, 0);
  assert.ok(list(result).filters.some((filter) => filter.id === 'clear-all'));
  assert.equal(result.blocks.at(-1).id, 'warranty-boundary');
});

test('the filtered list is re-queried from the full record, not from a truncated earlier result', async () => {
  const many = Array.from({ length: 80 }, (_, index) => warranty(`w${index}`, { category: index === 79 ? 'ROOFING' : 'APPLIANCE' }));
  install(many);
  const fresh = await run('Show my warranties');
  assert.equal(list(fresh).sections[0].items.length, 50);
  assert.match(summary(fresh).supportLine, /Showing the first 50/);
  priorViewState = view('ALL', null, 1);
  assert.deepEqual(ids(await run('Only show roofing warranties', 'exec-1')), ['w79'], 'a warranty beyond the first 50 is still found');
});

test('another domain\'s view state is never continued, and a named-item question is not given filters', async () => {
  install(); priorViewState = view('ALL', null, 7, 'buyer-result'); priorOperation = 'BUYER_DEADLINES';
  const result = await run('Only show HVAC warranties', 'exec-buyer');
  assert.notEqual(result.parameters.viewState.resultId, 'buyer-result');
  assert.equal(result.parameters.viewState.revision, 1);
  install([warranty('w', { inventoryItem: { name: 'Water heater' } }), warranty('x')]);
  const named = await run('Do I have a warranty for my water heater?');
  assert.equal(named.parameters, undefined);
  assert.deepEqual(list(named).filters, []);
});

test('every declared chip is recognised as a filter continuation, round-trips to its own state, and resolves through the follow-up resolver', async () => {
  install();
  const prior = view('ALL', null, 1);
  const present = { categories: ['HVAC', 'ROOFING', 'APPLIANCE', 'PLUMBING', 'ELECTRICAL', 'STRUCTURAL', 'HOME_WARRANTY_PLAN', 'OTHER'], needsReview: true };
  const expectations = {
    'status-all': { status: 'ALL' }, 'status-active': { status: 'ACTIVE' }, 'status-expiring': { status: 'EXPIRING' }, 'status-expired': { status: 'EXPIRED' }, 'status-review': { status: 'NEEDS_REVIEW' },
    'category-all': { category: null }, 'category-hvac': { category: 'HVAC' }, 'category-roofing': { category: 'ROOFING' }, 'category-appliance': { category: 'APPLIANCE' },
    'category-plumbing': { category: 'PLUMBING' }, 'category-electrical': { category: 'ELECTRICAL' }, 'category-structural': { category: 'STRUCTURAL' },
    'category-home_warranty_plan': { category: 'HOME_WARRANTY_PLAN' }, 'category-other': { category: 'OTHER' },
    'order-attention': { ordering: 'ATTENTION' }, 'order-latest-expiry': { ordering: 'LATEST_EXPIRY' }, 'order-newest': { ordering: 'NEWEST' }, 'order-oldest': { ordering: 'OLDEST' }, 'order-provider': { ordering: 'PROVIDER' },
  };
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model !== 'askExecution') throw new Error(`Unexpected prisma.${String(model)} access`);
    return { findFirst: async () => ({ id: 'exec-1', operationId: 'WARRANTY_LOOKUP', message: 'Show my warranties', resultJson: {}, parametersJson: null, launchContextJson: null }) };
  } });
  for (const chip of warrantyFilterChips('EXPIRED', 'HVAC', present)) {
    assert.ok(isFilterContinuationMessage(chip.message), `${chip.label}: "${chip.message}" must start with a filter-continuation phrase`);
    const resolved = resolveWarrantyRefinement(chip.message, prior);
    assert.ok(resolved, `${chip.label} must resolve to a refinement`);
    if (chip.id === 'clear-all') assert.deepEqual(resolved, { status: 'ALL', category: null, ordering: 'ATTENTION' });
    else {
      assert.ok(expectations[chip.id], `unexpected chip ${chip.id}`);
      if (expectations[chip.id].status) assert.equal(resolved.status, expectations[chip.id].status, chip.label);
      if (expectations[chip.id].category !== undefined) assert.equal(resolved.category, expectations[chip.id].category, chip.label);
      if (expectations[chip.id].ordering) assert.equal(resolved.ordering, expectations[chip.id].ordering, chip.label);
    }
    const resolution = await resolveAskFollowUpMessage({ sessionId: 's1', propertyId: 'p1', message: chip.message, declaredSourceExecutionId: 'exec-1' });
    assert.equal(resolution.forcedOperationId, 'WARRANTY_LOOKUP', chip.label);
    assert.equal(resolution.isFilterRefinement, true, `${chip.label}: a refinement is what supersedes the earlier result`);
    assert.equal(resolution.effectiveMessage, chip.message, `${chip.label}: the chip wording is a complete specification`);
  }
  assert.equal(resolveWarrantyRefinement('Tell me about my roof warranty', prior), null, 'an ordinary question is not a refinement');
  assert.equal(resolveWarrantyRefinement('Only show HVAC warranties', null), null);
});

test('ordering in words: a chip or a sentence changes only the order, a filter chip afterwards keeps it, and the answer states it', async () => {
  install([
    warranty('a', { providerName: 'Zed Roofing', category: 'ROOFING', expiryDate: day(300), startDate: day(-100) }),
    warranty('b', { providerName: 'Acme HVAC', category: 'HVAC', expiryDate: day(20), startDate: day(-900) }),
    warranty('c', { providerName: 'Mid Plumbing', category: 'PLUMBING', expiryDate: day(700), startDate: day(-400) }),
  ]);
  const order = (result) => list(result).sections[0].items.map((entry) => entry.id);
  const first = await run('Show my warranties');
  assert.deepEqual(order(first), ['b', 'a', 'c']);
  assert.equal(first.parameters.viewState.roomScopePhrase, null);
  const prior = { ...first.parameters.viewState };
  const newest = resolveWarrantyRefinement('Now show them newest first', prior);
  assert.deepEqual([newest.status, newest.category, newest.ordering], ['ALL', null, 'NEWEST']);
  for (const [message, ordering] of [['Now show them with the latest expiry first', 'LATEST_EXPIRY'], ['Now show them oldest first', 'OLDEST'], ['Now show them by provider', 'PROVIDER'], ['Now show them with what needs attention first', 'ATTENTION']]) {
    assert.equal(resolveWarrantyRefinement(message, prior).ordering, ordering, message);
  }
  // An ordinary question is never an ordering.
  assert.equal(resolveWarrantyRefinement('Which warranty is newest', prior), null);

  const sorted = (message, viewState) => { priorViewState = viewState; return run(message, 'exec-1'); };
  const byProvider = await sorted('Now show them by provider', prior);
  assert.deepEqual(order(byProvider), ['b', 'c', 'a']);
  assert.match(summary(byProvider).supportLine, /Ordered by provider, A to Z\./);
  assert.equal(byProvider.parameters.viewState.roomScopePhrase, 'PROVIDER');
  assert.equal(byProvider.parameters.viewState.resultId, prior.resultId);
  assert.ok(list(byProvider).filters.find((chip) => chip.id === 'order-provider').active);
  assert.ok(list(byProvider).filters.length <= 16);
  // A filter chip keeps the order; Clear returns to the usual one.
  assert.equal(resolveWarrantyRefinement('Only show expired warranties', byProvider.parameters.viewState).ordering, 'PROVIDER');
  assert.equal(resolveWarrantyRefinement('Now show all warranties with no filters', byProvider.parameters.viewState).ordering, 'ATTENTION');
  assert.deepEqual(order(await sorted('Now show them newest first', prior)), ['a', 'c', 'b']);
  assert.deepEqual(order(await sorted('Now show them oldest first', prior)), ['b', 'c', 'a']);
  assert.deepEqual(order(await sorted('Now show them with the latest expiry first', prior)), ['c', 'a', 'b']);
  // A fresh question may name the order itself.
  priorViewState = null;
  assert.deepEqual(order(await run('Show my warranties oldest first')), ['b', 'c', 'a']);
});
