const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { SuggestedNextActionSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { SuggestedNextActionCandidateSchema } = require('../../src/services/ask/suggestedActions/suggestedNextActionCandidate.ts');
const { roomAddItemCandidates, INVENTORY_ADD_MESSAGE } = require('../../src/services/ask/handlers/inventory.handler.ts');
const { roomContextVersion } = require('../../src/services/ask/handlers/homeRecordWrites.handler.ts');
const { roomContextVersion: leafVersion } = require('../../src/services/ask/suggestedActions/domainVersions.ts');
const { isRegisteredOutcome, DOMAIN_FRESHNESS_MATRIX } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { finalizeSuggestedNextActionsWithReport } = require('../../src/services/ask/suggestedActions/finalizeSuggestedNextActions.ts');
const { fixedSuggestedNextActionClock } = require('../../src/services/ask/suggestedActions/suggestedNextActionClock.ts');
const { getSuggestedNextActionEntityValidator } = require('../../src/services/ask/suggestedActions/suggestedNextActionEntityValidators.ts');

// ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN Appendix C, rooms: one "add an item to this room" chip on the room receipts.

const NOW = new Date('2026-10-04T12:00:00.000Z');
const UPDATED = new Date('2026-10-04T11:00:00.000Z');
const ctxArgs = { propertyId: 'prop-1', sourceOperationId: 'ROOM_CREATE' };

test('a room receipt nominates exactly one add-item candidate that names the exact room', () => {
  const candidates = roomAddItemCandidates({ id: 'room-1', name: 'Garage', updatedAt: UPDATED }, ctxArgs);
  assert.equal(candidates.length, 1);
  const [candidate] = candidates;
  assert.ok(SuggestedNextActionCandidateSchema.safeParse(candidate).success, JSON.stringify(candidate));
  assert.equal(candidate.label, 'Add an item to Garage');
  assert.equal(candidate.operationId, 'INVENTORY_ITEM_CREATE');
  assert.equal(candidate.outcomeKey, 'ADD_ITEM_TO_ROOM');
  assert.ok(isRegisteredOutcome('INVENTORY_ITEM_CREATE', 'ADD_ITEM_TO_ROOM'));
  assert.equal(candidate.tier, 'DISCOVERY');
  assert.equal(candidate.entityContext.entityType, 'INVENTORY_ROOM');
  assert.equal(candidate.entityContext.entityId, 'room-1');
  assert.equal(candidate.entityContext.contextVersion, roomContextVersion({ id: 'room-1', updatedAt: UPDATED }));
  assert.equal(candidate.message, INVENTORY_ADD_MESSAGE, 'the add-item handler only starts the form for its declared message');
});

test('floor level is deliberately not offered', () => {
  const outcomes = roomAddItemCandidates({ id: 'room-1', name: 'Garage' }, ctxArgs).map((c) => c.outcomeKey);
  assert.deepEqual(outcomes, ['ADD_ITEM_TO_ROOM']);
  assert.equal(isRegisteredOutcome('ROOM_RENAME', 'ADD_FLOOR_LEVEL'), false);
});

test('a long room name keeps the label within the contract limit; the shared version function is one function', () => {
  const [candidate] = roomAddItemCandidates({ id: 'r', name: 'The very long named upstairs guest bedroom suite with attached sitting area and balcony' }, ctxArgs);
  assert.ok(candidate.label.length <= 80, candidate.label);
  assert.ok(SuggestedNextActionCandidateSchema.safeParse(candidate).success);
  assert.equal(roomContextVersion({ id: 'r', updatedAt: UPDATED }), leafVersion({ id: 'r', updatedAt: UPDATED }));
  assert.equal(DOMAIN_FRESHNESS_MATRIX.INVENTORY_ROOM.versionFunction, 'roomContextVersion');
});

test('a just-written room (no record read) carries no stale version', () => {
  assert.equal(roomAddItemCandidates({ id: 'new-1', name: 'Den' }, ctxArgs)[0].entityContext.contextVersion, null);
});

// ---- finalizer with the real room validator -------------------------------------------------------------------------------

const clock = fixedSuggestedNextActionClock(NOW);
const finalize = (candidates, availability = null, over = {}) => finalizeSuggestedNextActionsWithReport(
  { result: { status: 'COMPLETED', blocks: [], suggestions: ['Show my rooms'], suggestedNextActionCandidates: candidates }, executionId: 'exec-1', userId: 'u1', sessionId: 's1', propertyId: 'prop-1', operationId: 'ROOM_CREATE', message: 'Add a room', ...over },
  { clock, loadOperationAvailability: async () => new Map([['INVENTORY_ITEM_CREATE', availability]]), loadExecutionExpiresAt: async () => null },
);
const withRooms = async (rows, fn) => {
  const original = prisma.inventoryRoom.findMany;
  let calls = 0;
  prisma.inventoryRoom.findMany = async (args) => { calls += 1; return rows.filter((row) => args.where.id.in.includes(row.id) && (!args.where.propertyId || args.where.propertyId === row.propertyId)); };
  try { return await fn(() => calls); } finally { prisma.inventoryRoom.findMany = original; }
};

test('the room validator is registered; the typed chip survives for a current room without a raw fallback', async () => {
  assert.equal(typeof getSuggestedNextActionEntityValidator('INVENTORY_ROOM'), 'function');
  await withRooms([{ id: 'room-1', propertyId: 'prop-1', updatedAt: UPDATED }], async (calls) => {
    const { result } = await finalize(roomAddItemCandidates({ id: 'room-1', name: 'Garage', updatedAt: UPDATED }, ctxArgs));
    assert.equal(calls(), 1);
    assert.equal(result.suggestedNextActions.length, 1);
    const [action] = result.suggestedNextActions;
    assert.ok(SuggestedNextActionSchema.safeParse(action).success);
    assert.equal(action.operationId, 'INVENTORY_ITEM_CREATE');
    assert.equal(action.entityContext.entityType, 'INVENTORY_ROOM');
    assert.deepEqual(result.suggestions, []);
  });
});

test('a room that was deleted, is in another property, or changed since the receipt is not offered', async () => {
  const candidates = roomAddItemCandidates({ id: 'room-1', name: 'Garage', updatedAt: UPDATED }, ctxArgs);
  await withRooms([], async () => assert.deepEqual((await finalize(candidates)).result.suggestedNextActions, [], 'deleted'));
  await withRooms([{ id: 'room-1', propertyId: 'prop-2', updatedAt: UPDATED }], async () => assert.deepEqual((await finalize(candidates)).result.suggestedNextActions, [], 'other property'));
  await withRooms([{ id: 'room-1', propertyId: 'prop-1', updatedAt: new Date(UPDATED.getTime() + 1000) }], async () => {
    const { result, report } = await finalize(candidates);
    assert.deepEqual(result.suggestedNextActions, []);
    assert.equal(report.diagnostics.rejections['FRESHNESS:CONTEXT_VERSION_STALE'], 1);
  });
});

test('a viewer is not offered the chip (INVENTORY_ITEM_CREATE requires a contributor)', async () => {
  await withRooms([{ id: 'room-1', propertyId: 'prop-1', updatedAt: UPDATED }], async () => {
    const { result, report } = await finalize(roomAddItemCandidates({ id: 'room-1', name: 'Garage', updatedAt: UPDATED }, ctxArgs), 'AUTHORIZATION');
    assert.deepEqual(result.suggestedNextActions, []);
    assert.equal(report.diagnostics.rejections['AUTHORIZATION:ROLE_BELOW_FLOOR'], 1);
  });
});

// ---- wiring guards ---------------------------------------------------------------------------------------------------------

test('both room receipts nominate the typed candidate and emit no raw fallback', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/recordConfirm.handler.ts'), 'utf8');
  assert.match(source, /roomAddItemCandidates\(\{ id: room\.id, name: renamed \? proposed : room\.name \}/);
  assert.match(source, /roomAddItemCandidates\(\{ id: roomId, name \}/);
  assert.equal((source.match(/suggestions: \['Show my rooms'\]/g) ?? []).length, 0);
});

test('the add-item handler reads the room from the launch entity the selected action supplies', () => {
  const handler = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/inventory.handler.ts'), 'utf8');
  assert.match(handler, /launchContext\?\.entityType === 'INVENTORY_ROOM' \? envelope\.launchContext\.entityId/);
});
