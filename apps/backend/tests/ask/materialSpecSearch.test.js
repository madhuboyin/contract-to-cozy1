const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// FRD v1.477: searching the recorded materials by product, colour code, supplier or any recorded word, through the call Desktop's search box makes.
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { materialSearchTerm, MATERIAL_SPECS_SHOW_ALL_MESSAGE } = require('../../src/services/ask/support/materialSpecSearch.ts');
const { MaterialSpecService } = require('../../src/services/materialSpec.service.ts');

const originals = { prisma: prismaModule.prisma, list: MaterialSpecService.prototype.listSpecs, search: MaterialSpecService.prototype.searchSpecs };
let calls;
const spec = (id, extra = {}) => ({ id, propertyId: 'p1', category: 'PAINT', scopeLevel: 'ROOM', label: `Spec ${id}`, manufacturer: null, productName: null, colorCode: null, finish: null, supplier: null, supplierDiscontinued: false, isActive: true, lifecycleStatus: 'AS_BUILT', room: null, ...extra });

test.beforeEach(() => {
  calls = { list: [], search: [] };
  prismaModule.prisma = new Proxy({}, { get(_t, model) { if (model === 'then') return undefined; if (model === 'materialSpecExport') return { findMany: async () => [] }; throw new Error(`Unexpected prisma.${String(model)} access`); } });
  MaterialSpecService.prototype.listSpecs = async function (...a) { calls.list.push(a); return { specs: [spec('all')], hasMore: false, nextCursor: null }; };
  MaterialSpecService.prototype.searchSpecs = async function (...a) { calls.search.push(a); return a[1] === 'nothing' ? [] : [spec('dining', { label: 'Dining walls', manufacturer: 'Sherwin-Williams', colorCode: 'SW 7008' })]; };
});
test.afterEach(() => { prismaModule.prisma = originals.prisma; MaterialSpecService.prototype.listSpecs = originals.list; MaterialSpecService.prototype.searchSpecs = originals.search; });

test('the term a question names: quoted, "for / from / matching", a code, never a room, and none for the whole list', () => {
  const cases = [
    ['Search my materials for Sherwin Williams', 'Sherwin Williams'], ['Find the paint colour SW 7008', 'SW 7008'], ['Which materials are from Benjamin Moore?', 'Benjamin Moore'],
    ['Find "Agreeable Gray" in my materials', 'Agreeable Gray'], ['look for paint code SW 7008', 'SW 7008'], ['What materials are from Sherwin-Williams?', 'Sherwin-Williams'],
    ['Which materials are from Benjamin Moore in the bedroom?', 'Benjamin Moore'],
    ['Show my material specs', null], ['Show my materials', null], ['What paint colour is in the living room?', null], ['What is the paint code for the kitchen?', null], ['Search my materials for the kitchen', null],
  ];
  for (const [message, expected] of cases) assert.equal(materialSearchTerm(message), expected, message);
});

test('searching and the whole list route to the one operation; a request for a recommendation or an add does not', () => {
  for (const m of ['Search my materials for Sherwin Williams', 'Find the paint colour SW 7008', 'Which materials are from Benjamin Moore?', 'Show my material specs']) assert.equal(resolveAskOperation(m).operationId, 'MATERIAL_SPECS_LIST', m);
  for (const m of ['Find me a good paint for the kitchen', 'Add a new paint colour']) assert.notEqual(resolveAskOperation(m).operationId, 'MATERIAL_SPECS_LIST', m);
});

test('a term runs the page\'s own search; the answer names the term, offers the whole list, and the action is allowed', async () => {
  const result = await capabilityInvoke('MATERIAL_SPECS_LIST', { userId: 'u1', propertyId: 'p1', message: 'Find the paint colour SW 7008' }, { propertyAccess: { role: 'CONTRIBUTOR', userId: 'u1', propertyId: 'p1' } });
  assert.deepEqual(calls.search, [['p1', 'SW 7008']]);
  assert.equal(calls.list.length, 0);
  assert.match(result.blocks[0].title, /1 material matches “SW 7008”/);
  const showAll = result.blocks[0].actions.find((action) => action.id === 'material-specs-show-all');
  assert.equal(showAll.message, MATERIAL_SPECS_SHOW_ALL_MESSAGE);
  assert.equal(isAskActionApplicable({ action: showAll, operationId: 'MATERIAL_SPECS_LIST', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true);
  assert.equal(resolveAskOperation(showAll.message).operationId, 'MATERIAL_SPECS_LIST');
  assert.equal(materialSearchTerm(showAll.message), null, 'the show-all message asks for the whole list');
});

test('no match says so without claiming the home has no materials, and offers the whole list; no term keeps the page\'s unfiltered list', async () => {
  const none = await capabilityInvoke('MATERIAL_SPECS_LIST', { userId: 'u1', propertyId: 'p1', message: 'Search my materials for nothing' }, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });
  assert.equal(none.reasonCode, 'MATERIAL_SPECS_SEARCH_EMPTY');
  assert.match(none.blocks[0].title, /No recorded material matches “nothing”/);
  assert.ok(none.blocks[0].actions.some((action) => action.id === 'material-specs-show-all'));
  const all = await capabilityInvoke('MATERIAL_SPECS_LIST', { userId: 'u1', propertyId: 'p1', message: 'Show my material specs' }, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });
  assert.equal(all.reasonCode, 'MATERIAL_SPECS_READY');
  assert.deepEqual(calls.list, [['p1', {}]]);
});
