const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ACUI I-2 (FRD v1.122): Inventory filters are a governed refinement. The real registered `inventory.lookup` handler runs against a
// fake prisma and a fake inventory list, so what is asserted is the result the homeowner would get, not the source text.
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { InventoryService } = require('../../src/services/inventory.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { resolveInventoryRefinement, inventoryFilterChips } = require('../../src/services/ask/handlers/inventory.handler.ts');
const { isFilterContinuationMessage } = require('../../src/services/ask/askFollowUpContext.ts');
const { matchesInventoryAnswerContract } = require('../../src/services/ask/askInventoryIntent.ts');

const realPrisma = prismaModule.prisma;
const originals = { listItems: InventoryService.prototype.listItems, resolveAccess: propertyAccess.resolvePropertyAccess };

const soon = new Date(); soon.setUTCFullYear(soon.getUTCFullYear() + 1);
const item = (id, name, category, overrides = {}) => ({
  id, name, category, assetType: null, brand: 'Acme', model: 'X1', manufacturer: null, modelNumber: null, serialNo: 'S1', serialNumber: null,
  purchasedOn: new Date('2020-01-01'), documents: [{ id: 'd' }], warrantyId: 'w1', insurancePolicyId: null, coverageEvidenceStatus: 'UNKNOWN',
  expectedExpiryDate: null, room: { name: 'Basement' }, tags: [], updatedAt: new Date('2026-09-01'), condition: 'GOOD', notes: null, isVerified: true,
  sourceType: 'USER_ADDED', verificationSource: null, ...overrides,
});
const ITEMS = [
  item('furnace', 'Furnace', 'HVAC'),                                              // complete
  item('heatpump', 'Heat pump', 'HVAC', { brand: null, documents: [] }),           // missing details, HVAC
  item('fridge', 'Refrigerator', 'APPLIANCE', { model: null, serialNo: null }),    // missing details, appliance
  item('washer', 'Washer', 'APPLIANCE'),                                           // complete
  item('roof', 'Roof', 'ROOF_EXTERIOR', { expectedExpiryDate: soon }),             // near end of life
];

let priorOperation; let priorViewState; let lookups;
function install(items = ITEMS) {
  priorOperation = 'INVENTORY_LOOKUP'; priorViewState = null; lookups = [];
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model !== 'askExecution') throw new Error(`Unexpected prisma.${String(model)} access`);
    return { findFirst: async (args) => { lookups.push(args); return priorViewState ? { operationId: priorOperation, parametersJson: { viewState: priorViewState } } : null; } };
  } });
  InventoryService.prototype.listItems = async () => items;
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'CONTRIBUTOR', userId: 'u1', propertyId: 'p1' });
}
function restore() {
  prismaModule.prisma = realPrisma;
  InventoryService.prototype.listItems = originals.listItems;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
}
const run = (message, sourceExecutionId) => capabilityInvoke('INVENTORY_LOOKUP', { userId: 'u1', propertyId: 'p1', message, launchContext: sourceExecutionId ? { surface: 'ASK_WORKSPACE', sourceExecutionId } : undefined });
const list = (result) => result.blocks.find((block) => block.id === 'inventory-results');
const summary = (result) => result.blocks.find((block) => block.id === 'inventory-summary');
const ids = (result) => list(result).sections[0].items.map((entry) => entry.id).sort();
const active = (result) => list(result).filters.filter((filter) => filter.active).map((filter) => filter.id).sort();
const view = (status, category, revision, resultId = 'result-1') => ({ resultId, domainScopePhrase: category, dateScopePhrase: null, statusFilter: status, selectedTaskId: null, revision });

test('a fresh collection question carries a new view state, declared filters and a counted headline', async () => {
  install();
  try {
    const result = await run('Show my inventory');
    assert.equal(result.parameters.viewState.revision, 1);
    assert.equal(result.parameters.viewState.statusFilter, 'ALL');
    assert.equal(result.parameters.viewState.domainScopePhrase, null);
    assert.match(result.parameters.viewState.resultId, /^[0-9a-f-]{36}$/);
    assert.equal(summary(result).headline, '5 items recorded, 2 with missing details.');
    assert.deepEqual(active(result), ['category-all', 'status-all']);
    assert.ok(!list(result).filters.some((filter) => filter.id === 'clear-all'), 'nothing to clear yet');
  } finally { restore(); }
});

test('a status chip keeps the result identity, bumps the revision, re-queries the whole inventory and offers a way back', async () => {
  install(); priorViewState = view('ALL', null, 1);
  try {
    const result = await run('Only show items with missing details', 'exec-1');
    assert.equal(result.parameters.viewState.resultId, 'result-1');
    assert.equal(result.parameters.viewState.revision, 2);
    assert.equal(result.parameters.viewState.statusFilter, 'INCOMPLETE');
    assert.deepEqual(ids(result), ['fridge', 'heatpump']);
    assert.equal(summary(result).headline, '2 records are missing details.');
    assert.deepEqual(active(result), ['category-all', 'status-incomplete']);
    assert.ok(list(result).filters.some((filter) => filter.id === 'clear-all'));
    assert.equal(list(result).title, 'Incomplete inventory records');
  } finally { restore(); }
});

test('a category chip replaces only the category and keeps the status focus that was already applied', async () => {
  install(); priorViewState = view('INCOMPLETE', null, 2);
  try {
    const result = await run('Only show HVAC items', 'exec-2');
    assert.equal(result.parameters.viewState.statusFilter, 'INCOMPLETE');
    assert.equal(result.parameters.viewState.domainScopePhrase, 'HVAC');
    assert.equal(result.parameters.viewState.revision, 3);
    assert.deepEqual(ids(result), ['heatpump']);
    assert.equal(summary(result).headline, '1 HVAC record is missing details.');
    assert.deepEqual(active(result), ['category-hvac', 'status-incomplete']);
    // One row is still a list (the way back never disappears), not a single-item detail with capture prompts.
    assert.equal(list(result).filters.length > 0, true);
    assert.deepEqual(result.captureRequests ?? [], []);
  } finally { restore(); }
});

test('"All items" clears only the status, "All categories" only the category, and "no filters" clears both', async () => {
  install();
  try {
    priorViewState = view('INCOMPLETE', 'HVAC', 3);
    const allStatus = await run('Now show all inventory items', 'exec-3');
    assert.equal(allStatus.parameters.viewState.statusFilter, 'ALL');
    assert.equal(allStatus.parameters.viewState.domainScopePhrase, 'HVAC');
    assert.deepEqual(ids(allStatus), ['furnace', 'heatpump']);

    priorViewState = view('INCOMPLETE', 'HVAC', 3);
    const allCategories = await run('Now show all inventory categories', 'exec-3');
    assert.equal(allCategories.parameters.viewState.statusFilter, 'INCOMPLETE');
    assert.equal(allCategories.parameters.viewState.domainScopePhrase, null);
    assert.deepEqual(ids(allCategories), ['fridge', 'heatpump']);

    priorViewState = view('INCOMPLETE', 'HVAC', 3);
    const cleared = await run('Now show all inventory items with no filters', 'exec-3');
    assert.equal(cleared.parameters.viewState.statusFilter, 'ALL');
    assert.equal(cleared.parameters.viewState.domainScopePhrase, null);
    assert.equal(ids(cleared).length, 5);
    assert.ok(!list(cleared).filters.some((filter) => filter.id === 'clear-all'));
  } finally { restore(); }
});

test('a filter that matches nothing still continues the result and keeps every chip so it can be widened', async () => {
  install(); priorViewState = view('ALL', 'HVAC', 1);
  try {
    const result = await run('Only show items nearing end of life', 'exec-1');
    assert.equal(result.status, 'ANSWERED');
    assert.equal(result.reasonCode, 'INVENTORY_FILTER_NO_MATCH');
    assert.equal(result.parameters.viewState.revision, 2);
    assert.equal(result.parameters.viewState.statusFilter, 'LIFECYCLE');
    assert.equal(summary(result).headline, 'No items match these filters.');
    assert.equal(list(result).sections[0].count, 0);
    assert.ok(list(result).filters.some((filter) => filter.id === 'clear-all'));
  } finally { restore(); }
});

test('the filtered list is re-queried from the full inventory, not from a truncated earlier result', async () => {
  const many = Array.from({ length: 80 }, (_, index) => item(`i${index}`, `Item ${index}`, index === 79 ? 'HVAC' : 'APPLIANCE', index === 79 ? { brand: null } : {}));
  install(many); priorViewState = view('ALL', null, 1);
  try {
    const fresh = await run('Show my inventory');
    assert.equal(list(fresh).sections[0].items.length, 50);
    assert.match(summary(fresh).supportLine, /Showing the first 50/);
    priorViewState = view('ALL', null, 1);
    const result = await run('Only show HVAC items', 'exec-1');
    assert.deepEqual(ids(result), ['i79'], 'an item beyond the first 50 is still found');
  } finally { restore(); }
});

test('another domain\'s view state is never continued', async () => {
  install(); priorViewState = view('ALL', null, 7, 'buyer-result'); priorOperation = 'BUYER_DEADLINES';
  try {
    const result = await run('Only show HVAC items', 'exec-buyer');
    assert.notEqual(result.parameters.viewState.resultId, 'buyer-result');
    assert.equal(result.parameters.viewState.revision, 1);
  } finally { restore(); }
});

test('every declared chip is recognised as a filter continuation, round-trips to its own state, and passes the answer contract', async () => {
  install();
  try {
    const prior = view('ALL', null, 1);
    const expectations = {
      'status-all': { status: 'ALL' }, 'status-incomplete': { status: 'INCOMPLETE' }, 'status-lifecycle': { status: 'LIFECYCLE' },
      'category-all': { category: null }, 'category-hvac': { category: 'HVAC' }, 'category-appliance': { category: 'APPLIANCE' }, 'category-roof': { category: 'ROOF_EXTERIOR' },
    };
    for (const chip of inventoryFilterChips('INCOMPLETE', 'HVAC')) {
      assert.ok(isFilterContinuationMessage(chip.message), `${chip.label}: "${chip.message}" must start with a filter-continuation phrase`);
      const resolved = resolveInventoryRefinement(chip.message, prior);
      assert.ok(resolved, `${chip.label} must resolve to a refinement`);
      if (chip.id === 'clear-all') assert.deepEqual(resolved, { status: 'ALL', category: null });
      else assert.equal(resolved.status, expectations[chip.id].status ?? 'ALL');
      if (expectations[chip.id]?.category !== undefined) assert.equal(resolved.category, expectations[chip.id].category);
      priorViewState = prior;
      const result = await run(chip.message, 'exec-1');
      assert.ok(matchesInventoryAnswerContract(chip.message, result), `${chip.label}: the answer contract must accept the result`);
    }
    // An ordinary question is not a refinement even with a prior view.
    assert.equal(resolveInventoryRefinement('Tell me about the water heater', prior), null);
    assert.equal(resolveInventoryRefinement('Only show HVAC items', null), null);
  } finally { restore(); }
});

test('the follow-up resolver pins a declared inventory chip to INVENTORY_LOOKUP as a refinement of the source result, using the chip wording alone', async () => {
  const { resolveAskFollowUpMessage } = require('../../src/services/ask/askFollowUpContext.ts');
  const { inventoryFilterChips: chips } = require('../../src/services/ask/handlers/inventory.handler.ts');
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model !== 'askExecution') throw new Error(`Unexpected prisma.${String(model)} access`);
    return { findFirst: async () => ({ id: 'exec-1', operationId: 'INVENTORY_LOOKUP', message: 'Show incomplete inventory records', resultJson: {}, parametersJson: null, launchContextJson: null }) };
  } });
  try {
    for (const chip of chips('INCOMPLETE', 'HVAC')) {
      const resolution = await resolveAskFollowUpMessage({ sessionId: 's1', propertyId: 'p1', message: chip.message, declaredSourceExecutionId: 'exec-1' });
      assert.equal(resolution.forcedOperationId, 'INVENTORY_LOOKUP', chip.label);
      assert.equal(resolution.sourceExecutionId, 'exec-1', chip.label);
      assert.equal(resolution.isFilterRefinement, true, `${chip.label}: a refinement is what supersedes the earlier result`);
      assert.equal(resolution.effectiveMessage, chip.message, `${chip.label}: the chip wording is a complete specification`);
    }
  } finally { prismaModule.prisma = realPrisma; }
});
