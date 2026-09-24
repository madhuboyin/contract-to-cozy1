const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.62: MATERIAL_SPECS_LIST (Material Specs), the fourteenth new Ask operation for a
// capability the Appendix D audit found with none. MaterialSpecService.listSpecs is stubbed for the answer tests; one
// test runs it against a fake prisma to pin the page's own query.

const prismaModule = require('../../src/lib/prisma.ts');
const { materialSpecsFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const { MaterialSpecService } = require('../../src/services/materialSpec.service.ts');

const PAGE = '/dashboard/properties/p1/materials';
const NOTE = 'Touch-up can is in the garage, left shelf';
const originals = { prisma: prismaModule.prisma, list: MaterialSpecService.prototype.listSpecs };
let calls;

const spec = (id, overrides = {}) => ({
  id, propertyId: 'p1', category: 'PAINT', scopeLevel: 'ROOM', label: `Spec ${id}`, manufacturer: null, productName: null, colorCode: null, finish: null,
  supplier: null, supplierDiscontinued: false, isActive: true, lifecycleStatus: 'AS_BUILT', notes: NOTE, room: null, ...overrides,
});
const view = (overrides = {}) => ({
  specs: [
    spec('dining', { label: 'Dining room walls', manufacturer: 'Sherwin-Williams', productName: 'Alabaster', colorCode: 'SW 7008', finish: 'Eggshell', supplier: 'Local paint store', room: { id: 'r1', name: 'Dining room' } }),
    spec('trim', { label: 'Trim', lifecycleStatus: 'INSTALLED', supplierDiscontinued: true, room: null, scopeLevel: 'PROPERTY' }),
    spec('shower', { category: 'TILE', label: 'Shower wall tile', manufacturer: 'Daltile', lifecycleStatus: 'PROPOSED', isActive: false, room: { id: 'r2', name: 'Primary bath' } }),
  ],
  nextCursor: null,
  hasMore: false,
  ...overrides,
});

function install() {
  calls = [];
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      throw new Error(`Unexpected prisma.${String(model)} access`);
    },
  });
  MaterialSpecService.prototype.listSpecs = async function (...args) { calls.push(args); return view(); };
}

function restore() {
  prismaModule.prisma = originals.prisma;
  MaterialSpecService.prototype.listSpecs = originals.list;
}

test.beforeEach(install);
test.afterEach(restore);

test('the operation reads the page\'s unfiltered list behind the page\'s viewer floor', async () => {
  const envelope = { userId: 'u1', propertyId: 'p1', message: 'Show my material specs' };
  const viewer = await capabilityInvoke('MATERIAL_SPECS_LIST', envelope, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });
  assert.deepEqual(calls, [['p1', {}]]);
  assert.equal(viewer.reasonCode, 'MATERIAL_SPECS_READY');
});

test('the real list query is the page\'s: this property, category then label, a page of 50', async () => {
  MaterialSpecService.prototype.listSpecs = originals.list;
  const queries = [];
  prismaModule.prisma = { materialSpec: { findMany: async (query) => { queries.push(query); return []; } } };
  await new MaterialSpecService().listSpecs('p1', {});
  assert.deepEqual(queries[0].where, { propertyId: 'p1' });
  assert.deepEqual(queries[0].orderBy, [{ category: 'asc' }, { label: 'asc' }]);
  assert.equal(queries[0].take, 51);
});

test('materials are grouped by category with product, room, colour, finish, supplier and lifecycle; notes stay on the spec', () => {
  const result = materialSpecsFromView(view(), 'p1');
  assert.equal(result.blocks[0].title, '3 materials recorded');
  assert.equal(result.blocks[0].body, 'Across 2 categories: Paint, Tile. 1 is marked discontinued by the supplier.');
  assert.equal(result.blocks[0].tone, 'CAUTION');
  const list = result.blocks.find((block) => block.id === 'material-specs-items');
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((row) => row.title)]), [
    ['Paint', ['Dining room walls', 'Trim']],
    ['Tile', ['Shower wall tile']],
  ]);
  const [dining, trim] = list.sections[0].items;
  assert.equal(dining.description, 'Sherwin-Williams · Alabaster');
  assert.deepEqual(dining.meta, ['Dining room', 'Colour SW 7008', 'Finish Eggshell', 'Supplier Local paint store']);
  assert.equal(dining.status, 'AS BUILT');
  assert.equal(dining.href, `${PAGE}/dining`);
  assert.deepEqual(trim.meta, ['Whole home', 'Discontinued']);
  assert.deepEqual(list.sections[1].items[0].meta, ['Primary bath', 'No longer in use']);
  assert.equal(JSON.stringify(result).includes(NOTE), false);
  assert.equal(result.blocks.some((block) => block.id === 'material-specs-limit'), false);
});

test('a second page is disclosed; nothing recorded is not an all-clear', () => {
  const more = materialSpecsFromView(view({ hasMore: true, nextCursor: 'shower' }), 'p1');
  assert.equal(more.blocks[0].title, '3+ materials recorded');
  assert.equal(more.blocks.find((block) => block.id === 'material-specs-limit').title, 'Showing the first 3 materials');
  const none = materialSpecsFromView({ specs: [], nextCursor: null, hasMore: false }, 'p1');
  assert.equal(none.reasonCode, 'MATERIAL_SPECS_EMPTY');
  assert.equal(none.blocks[0].title, 'No materials recorded yet');
  assert.equal(none.blocks.at(-1).title, 'As recorded, not checked against the product');
});

test('every block and the boundary survive the answer-trust validator, and the page link the whitelist', () => {
  const raw = materialSpecsFromView(view({ hasMore: true }), 'p1');
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'material-specs.list', operationId: 'MATERIAL_SPECS_LIST', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-24T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my material specs', operationId: 'MATERIAL_SPECS_LIST', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId: 'MATERIAL_SPECS_LIST', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true);
});

test('recorded-material questions route here; choosing, buying or adding a material is not claimed by the pattern', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true });
  for (const message of ['Show my material specs', 'What paint colour did we use in the living room?', 'What color is the paint in the master bedroom?', 'What tile did we use in the shower?', 'What paint colour is in our dining room?']) {
    assert.equal(route(message).operation?.operationId, 'MATERIAL_SPECS_LIST', message);
  }
  assert.equal(route('Show my inventory').operation?.operationId, 'INVENTORY_LOOKUP');
  // Each of these matches the materials pattern, so only the exclusion keeps the deterministic pattern from claiming them.
  for (const message of ['What paint colour should I choose for the bedroom?', 'Add a new paint colour to material specs', 'What tile is trending for bathrooms?']) {
    const resolution = route(message);
    assert.equal(resolution.stage === 'DETERMINISTIC' && resolution.operation?.operationId === 'MATERIAL_SPECS_LIST', false, message);
  }
});

test('the operation is fully registered: its own skill, the bridge, and the card launch', () => {
  assert.equal(getSkillForOperation('MATERIAL_SPECS_LIST').id, 'material-specs');
  assert.equal(ASK_OPERATION_CAPABILITY.MATERIAL_SPECS_LIST, 'material-specs');
  const launch = capabilityCardLaunch('material-specs').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'MATERIAL_SPECS_LIST');
});
