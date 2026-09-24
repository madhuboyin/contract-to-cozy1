const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-019, FRD v1.79): the home record's rooms render as a room map. The
// real PROPERTY_SUMMARY handler runs with the real property-record overview against a fake prisma that answers only
// the room and property reads (every other overview section is then unavailable, which the overview tolerates).

const prismaModule = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const getPropertyContextModule = require('../../src/modules/propertyContext/application/getPropertyContext.ts');
const evaluateModule = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
const { roomMapFacts } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');

const originals = { prisma: prismaModule.prisma, access: propertyAccess.resolvePropertyAccess, context: getPropertyContextModule.getPropertyContext, evaluate: evaluateModule.evaluateFeatureContext };
let roomQueries;

const room = (id, overrides = {}) => ({ id, name: `Room ${id}`, type: 'OTHER', floorLevel: null, updatedAt: new Date('2026-09-01T12:00:00Z'), _count: { items: 0, maintenanceTasks: 0 }, ...overrides });

function install(rooms, role = 'OWNER') {
  roomQueries = [];
  const models = {
    inventoryRoom: { findMany: async (args) => { roomQueries.push(args); return rooms; } },
    property: { findUnique: async () => ({ id: 'p1', name: 'Home', address: '1 Main St', city: 'Town', state: 'NJ', zipCode: '08000', dwellingType: 'SINGLE_FAMILY', propertyUse: null, occupancyStatus: null, propertySize: null, yearBuilt: 1990, bedrooms: 3, bathrooms: 2, heatingType: null, coolingType: null, roofType: null, updatedAt: new Date('2026-09-01T12:00:00Z') }) },
  };
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      // Any other overview read rejects, and the overview marks that section unavailable.
      if (!models[model]) return new Proxy({}, { get: (_t, method) => async () => { throw new Error(`Unexpected prisma.${String(model)}.${String(method)} call`); } });
      return models[model];
    },
  });
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  getPropertyContextModule.getPropertyContext = async () => { throw new Error('not needed'); };
  evaluateModule.evaluateFeatureContext = async () => ({ contextVersion: 'ctx-1', requirements: [] });
}

test.afterEach(() => {
  prismaModule.prisma = originals.prisma;
  propertyAccess.resolvePropertyAccess = originals.access;
  getPropertyContextModule.getPropertyContext = originals.context;
  evaluateModule.evaluateFeatureContext = originals.evaluate;
});

const invoke = (role = 'OWNER') => capabilityInvoke('PROPERTY_SUMMARY', { userId: 'u1', propertyId: 'p1', message: 'Give me a summary of my home record.' }, { propertyAccess: { role, userId: 'u1', propertyId: 'p1' } });
const roomsBlock = (result) => result.blocks.find((block) => block.id === 'property-rooms');

test('room tile facts: recorded items and open maintenance tasks, singular and plural, nothing when no task is open', () => {
  assert.deepEqual(roomMapFacts({ items: 7, maintenanceTasks: 2 }), { countLabel: '7 items', badgeLabel: '2 open tasks' });
  assert.deepEqual(roomMapFacts({ items: 1, maintenanceTasks: 1 }), { countLabel: '1 item', badgeLabel: '1 open task' });
  assert.deepEqual(roomMapFacts({ items: 0, maintenanceTasks: 0 }), { countLabel: '0 items', badgeLabel: null });
  assert.deepEqual(roomMapFacts(undefined), { countLabel: '0 items', badgeLabel: null });
});

test('the overview reads floor level, item counts and only pending or in-progress tasks, in the page\'s room order', async () => {
  install([room('kitchen')]);
  await invoke();
  assert.equal(roomQueries.length, 1);
  const [query] = roomQueries;
  assert.deepEqual(query.where, { propertyId: 'p1' });
  assert.deepEqual(query.orderBy, [{ sortOrder: 'asc' }, { name: 'asc' }]);
  assert.equal(query.select.floorLevel, true);
  assert.deepEqual(query.select._count, { select: { items: true, maintenanceTasks: { where: { status: { in: ['PENDING', 'IN_PROGRESS'] } } } } });
});

test('the rooms list declares the room map with each room\'s floor, item count and open-task badge', async () => {
  install([
    room('kitchen', { name: 'Kitchen', type: 'KITCHEN', floorLevel: 0, _count: { items: 7, maintenanceTasks: 2 } }),
    room('primary', { name: 'Primary bedroom', type: 'BEDROOM', floorLevel: 1, _count: { items: 3, maintenanceTasks: 0 } }),
    room('garage', { name: 'Garage', type: 'GARAGE', _count: { items: 1, maintenanceTasks: 1 } }),
  ]);
  const result = await invoke();
  const block = roomsBlock(result);
  assert.deepEqual(block.presentation, { pattern: 'ROOM_MAP' });
  const items = block.sections[0].items;
  assert.deepEqual(items.map((item) => [item.id, item.floorLevel, item.countLabel, item.badgeLabel ?? null, item.tone ?? null]), [
    ['kitchen', 0, '7 items', '2 open tasks', 'CAUTION'],
    ['primary', 1, '3 items', null, null],
    ['garage', null, '1 item', '1 open task', 'CAUTION'],
  ]);
  assert.deepEqual(items[0].meta, ['Kitchen', '7 items', '2 open tasks', 'Updated Sep 1, 2026']);
  assert.deepEqual(items[0].actions.map((action) => action.operationId), items[0].actions.map(() => 'ROOM_RENAME'));
  assert.equal(block.description, 'Select a room to inspect its current canonical details without leaving Ask Cozy.');
  AskPresentationBlockSchema.parse(block);
});

test('with no floor recorded the map stays, with a hint that says how to set one only to someone who can', async () => {
  install([room('kitchen', { name: 'Kitchen' }), room('den', { name: 'Den' })]);
  const owner = roomsBlock(await invoke());
  assert.deepEqual(owner.presentation, { pattern: 'ROOM_MAP' });
  assert.match(owner.description, /Floors aren't recorded yet; open a room to set its floor\.$/);
  install([room('kitchen', { name: 'Kitchen' })], 'VIEWER');
  const viewer = roomsBlock(await invoke('VIEWER'));
  assert.match(viewer.description, /Floors aren't recorded yet\.$/);
  assert.equal(viewer.sections[0].items[0].actions, undefined);
  install([]);
  const none = roomsBlock(await invoke());
  assert.doesNotMatch(none.description, /Floors/);
});

test('the answer checker keeps the room map intact', async () => {
  install([room('kitchen', { name: 'KITCHEN_MAIN', floorLevel: 0, _count: { items: 2, maintenanceTasks: 1 } }), room('den', { name: 'Den', floorLevel: 1 })]);
  const result = await invoke();
  const checked = validateAskAnswerTrustPipeline({
    question: 'Give me a summary of my home record.', operationId: 'PROPERTY_SUMMARY', propertyId: 'p1', semanticEnabled: false,
    result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('PROPERTY_SUMMARY')]),
  });
  assert.equal(checked.result.status, result.status, JSON.stringify(checked.trust.reasonCodes));
  const block = roomsBlock(checked.result);
  assert.deepEqual(block.presentation, { pattern: 'ROOM_MAP' });
  assert.deepEqual(block.sections[0].items.map((item) => [item.title, item.badgeLabel ?? null]), [['KITCHEN_MAIN', '1 open task'], ['Den', null]]);
});
