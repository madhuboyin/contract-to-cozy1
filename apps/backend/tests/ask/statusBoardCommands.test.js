const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Register P1 "Status Board": correct an item and refresh the board (FRD v1.319). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const board = require('../../src/services/homeStatusBoard.service.ts');
const command = require('../../src/services/ask/support/statusBoardCommand.ts');
const handler = require('../../src/services/ask/handlers/statusBoardCommands.handler.ts');
const { statusBoardFromView } = require('../../src/services/ask/handlers/statusBoard.handler.ts');

const OP = 'STATUS_BOARD_COMMAND';
const M = command.STATUS_BOARD_COMMAND_MESSAGES;
const ITEM = '11111111-1111-4111-8111-111111111111';
const UPDATED = new Date('2026-09-01T00:00:00Z');

test('the form builds the canonical patch: only what was set, "use the estimate" is an explicit null, a date is noon UTC', () => {
  const p = command.parseStatusBoardCorrectAnswer;
  assert.deepEqual(p({}), { success: false, reason: 'NOTHING' });
  assert.deepEqual(p({ condition: 'ACTION_NEEDED', recommendation: 'REPLACE_SOON' }).data, { overrideCondition: 'ACTION_NEEDED', overrideRecommendation: 'REPLACE_SOON' });
  assert.deepEqual(p({ condition: command.USE_ESTIMATE }).data, { overrideCondition: null });
  assert.deepEqual(p({ installedAt: { precision: 'EXACT_DATE', value: '2019-05-02' } }).data, { overrideInstalledAt: '2019-05-02T12:00:00.000Z' });
  assert.deepEqual(p({ pinned: 'UNPIN', hidden: 'HIDE', notes: 'Serviced in May' }).data, { isPinned: false, isHidden: true, overrideNotes: 'Serviced in May' });
  assert.equal(p({ condition: 'BROKEN' }).success, false);
  assert.equal(p({ isPinned: true }).success, false, 'a raw patch field is not a form field');
});

test('a stored patch re-validates through the form schema (round trip) via the handler\'s stored shape', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withData();
  try {
    const parsed = command.parseStatusBoardCorrectAnswer({ condition: 'MONITOR', installedAt: '2020-01-15', pinned: 'PIN' });
    const result = await handler.statusBoardCommandResult('user-1', 'prop-1', { kind: 'CORRECT', entityId: ITEM, sourceExecutionId: null }, parsed.data);
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(command.parseStatusBoardCorrectAnswer(result.parameters.statusBoardCorrect).data, parsed.data);
  } finally { restore(); restoreRole(); }
});

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withData({ missing = false } = {}) {
  const saved = prisma.homeItem;
  prisma.homeItem = {
    findFirst: async (args) => (!missing && args.where.id === ITEM && args.where.propertyId === 'prop-1'
      ? { id: ITEM, displayName: 'Water heater', categoryKey: 'WATER_HEATER', status: { overrideCondition: null, overrideRecommendation: null, overrideNotes: null, isPinned: false, isHidden: false, updatedAt: UPDATED } }
      : null),
  };
  return () => { prisma.homeItem = saved; };
}
const invoke = (message, launchContext, role = 'CONTRIBUTOR') => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext }, { propertyAccess: { role } });
const launch = (kind, entityId, over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId, entityType: kind === 'REFRESH' ? command.STATUS_BOARD_PROPERTY_ENTITY_TYPE : command.STATUS_BOARD_ITEM_ENTITY_TYPE, ...over });

test('declared-action only, a contributor command; the correct action opens a form seeded with the current overrides; refresh asks for confirmation', async () => {
  for (const message of Object.values(M)) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withData();
  try {
    const form = await invoke(M.CORRECT, launch('CORRECT', ITEM));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].captureKey, command.STATUS_BOARD_CORRECT_CAPTURE_KEY);
    assert.equal(form.parameters.statusBoardCommandLaunch.entityId, ITEM);
    const refresh = await invoke(M.REFRESH, launch('REFRESH', 'prop-1'));
    assert.equal(refresh.status, 'NEEDS_CONFIRMATION');
    assert.equal(refresh.parameters.statusBoardCommand.kind, 'REFRESH');
    assert.equal((await invoke(M.CORRECT, launch('CORRECT', ITEM, { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_STATUS_BOARD_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.CORRECT, launch('CORRECT', ITEM, { entityType: command.STATUS_BOARD_PROPERTY_ENTITY_TYPE }))).reasonCode, 'ASK_STATUS_BOARD_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.CORRECT, launch('CORRECT', ITEM), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
  } finally { restore(); restoreRole(); }
});

test('an item that is gone is refused with nothing written', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withData({ missing: true });
  try {
    assert.equal((await invoke(M.CORRECT, launch('CORRECT', ITEM))).reasonCode, 'STATUS_BOARD_ITEM_NOT_FOUND');
  } finally { restore(); restoreRole(); }
});

const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
function installWrites() {
  const saved = { ensure: board.ensureHomeItems, compute: board.computeStatuses, patch: board.patchItemStatus, r: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  board.ensureHomeItems = async (...a) => { calls.push(['ensure', ...a]); };
  board.computeStatuses = async (...a) => { calls.push(['compute', ...a]); };
  board.patchItemStatus = async (...a) => { calls.push(['patch', ...a]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { board.ensureHomeItems = saved.ensure; board.computeStatuses = saved.compute; board.patchItemStatus = saved.patch; executeOperation.reconcileAskExecutionSideEffects = saved.r; } };
}

test('confirming a correction calls patchItemStatus with the canonical patch; a refresh ensures then computes; stale or tampered writes nothing', async () => {
  const w = installWrites(); const restore = withData();
  try {
    const crypto = require('node:crypto');
    const version = crypto.createHash('sha256').update(`status-board-item:${ITEM}:${UPDATED.toISOString()}`).digest('hex');
    const stored = { condition: 'ACTION_NEEDED', notes: 'Leaking at the base' };
    await confirmCapabilityInvoke(OP, ctx({ statusBoardCorrect: stored, statusBoardCommand: { kind: 'CORRECT', entityId: ITEM }, statusBoardContextVersion: version }));
    assert.deepEqual(w.calls[0], ['patch', ITEM, 'prop-1', 'user-1', { overrideCondition: 'ACTION_NEEDED', overrideNotes: 'Leaking at the base' }]);
    await confirmCapabilityInvoke(OP, ctx({ statusBoardCommand: { kind: 'REFRESH', entityId: 'prop-1' } }));
    assert.deepEqual(w.calls.slice(1), [['ensure', 'prop-1'], ['compute', 'prop-1']]);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ statusBoardCorrect: stored, statusBoardCommand: { kind: 'CORRECT', entityId: ITEM }, statusBoardContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ statusBoardCorrect: { condition: 'BROKEN' }, statusBoardCommand: { kind: 'CORRECT', entityId: ITEM }, statusBoardContextVersion: version })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.filter((c) => c[0] === 'patch').length, 1);
  } finally { w.restore(); restore(); }
});

const view = (items) => ({ items, pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 } });
const row = (id, over = {}) => ({ id, displayName: id, category: 'WATER_HEATER', condition: 'MONITOR', computedReasons: [], needsInstallDateForPrediction: false, ...over });

test('the board answer offers refresh and a row correction only to someone who can change it; an item needing its date keeps the date capture', () => {
  const find = (result) => result.blocks.find((b) => b.id === 'status-board-items')?.sections.flatMap((s) => s.items) ?? [];
  const contributor = statusBoardFromView(view([row('a'), row('b', { needsInstallDateForPrediction: true, inventoryItemId: 'inv-b' })]), 'prop-1', true);
  assert.equal(contributor.blocks[0].actions[0].id, 'status-board-refresh');
  assert.equal(contributor.blocks[0].actions[0].entityId, 'prop-1');
  const [a, b] = find(contributor);
  assert.equal(a.entityType, command.STATUS_BOARD_ITEM_ENTITY_TYPE);
  assert.equal(a.actions[0].id, 'status-board-correct');
  assert.equal(b.actions[0].id, 'correct-installedOn');
  const viewer = statusBoardFromView(view([row('a')]), 'prop-1', false);
  assert.deepEqual(viewer.blocks[0].actions, []);
  assert.deepEqual(find(viewer)[0].actions ?? [], []);
});

test('the ids are allowlisted for the answer that emits them', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'PRIMARY' },
    operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of ['status-board-refresh', 'status-board-correct']) assert.equal(applicable(id, 'HOME_STATUS_BOARD'), true, id);
  assert.equal(applicable('status-board-back', OP), true);
});

test('the routes floor the two writing paths at CONTRIBUTOR and the Ask read passes readOnly', () => {
  const routes = fs.readFileSync(path.resolve(__dirname, '../../src/routes/homeStatusBoard.routes.ts'), 'utf8');
  assert.equal((routes.match(/requireHouseholdRole\('CONTRIBUTOR'\)/g) ?? []).length, 2);
  const service = fs.readFileSync(path.resolve(__dirname, '../../src/services/homeStatusBoard.service.ts'), 'utf8');
  assert.match(service, /options\.readOnly/);
});
