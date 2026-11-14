// FR-GATE-2 real-path evidence for HOME_STATUS_BOARD: the real handler, run through capabilityInvoke for each variant it can answer with (the board, an all-unknown board, a board that offers hidden items, the hidden-items list), against
// a stubbed board service and a fake prisma that answers only the hidden-item count (the boundary the existing status-board tests use). Nothing here reads handler source text.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register');
const prismaModule = require('../../src/lib/prisma.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
require('../../src/services/ask/handlers/statusBoard.handler.ts');
const statusBoard = require('../../src/services/homeStatusBoard.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { matchesOperationAnswerContract } = require('../../src/services/ask/answerContract/operationAnswerContract.ts');
const { matchesStatusBoardAnswerContract } = require('../../src/services/ask/askStatusBoardIntent.ts');
const { conformRealPath } = require('./support/realPathContract');

const originals = { prisma: prismaModule.prisma, list: statusBoard.listBoard, resolveAccess: propertyAccess.resolvePropertyAccess };
let hiddenCount = 0;
const item = (id, condition, overrides = {}) => ({ id, displayName: `Item ${id}`, category: 'APPLIANCE', condition, recommendation: condition === 'ACTION_NEEDED' ? 'REPLACE_SOON' : 'OK', ageYears: 12.5, computedReasons: condition === 'GOOD' ? [{ code: 'ALL_CLEAR', detail: 'No issues detected' }] : [{ code: 'PAST_EOL', detail: 'Past expected life (10yr)' }], warrantyStatus: 'EXPIRED', pendingMaintenance: 1, room: { id: 'r1', name: 'Kitchen' }, isPinned: false, needsInstallDateForPrediction: false, deepLinks: { viewItem: `/dashboard/properties/p1/inventory?openItemId=inv-${id}` }, ...overrides });
const view = (items) => ({ items, summary: {}, pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 } });
test.beforeEach(() => {
  hiddenCount = 0;
  prismaModule.prisma = new Proxy({}, { get(_t, model) { if (model === 'then') return undefined; if (model === 'homeItem') return { count: async () => hiddenCount }; throw new Error(`Unexpected prisma.${String(model)} access`); } });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'VIEWER', userId: 'u1', propertyId: 'p1' });
});
test.afterEach(() => { prismaModule.prisma = originals.prisma; statusBoard.listBoard = originals.list; propertyAccess.resolvePropertyAccess = originals.resolveAccess; });
const invoke = (message, extra = {}) => capabilityInvoke('HOME_STATUS_BOARD', { userId: 'u1', propertyId: 'p1', message, ...extra });

test('HOME_STATUS_BOARD: every variant the real handler answers with conforms, and the typed contract accepts each one', async () => {
  const variants = {};
  statusBoard.listBoard = async () => view([item('a', 'ACTION_NEEDED', { isPinned: true }), item('m', 'MONITOR'), item('g', 'GOOD')]); variants.board = await invoke('Show my status board');
  statusBoard.listBoard = async () => view([item('u1', 'GOOD', { needsInstallDateForPrediction: true }), item('u2', 'GOOD', { needsInstallDateForPrediction: true })]); variants.allUnknown = await invoke('Show my status board');
  statusBoard.listBoard = async () => view([item('a', 'ACTION_NEEDED')]); hiddenCount = 2; const offered = await invoke('Show my status board'); variants.boardOffersHiddenItems = offered;
  const open = offered.blocks[0].actions.find((a) => a.id === 'status-board-hidden'); assert.ok(open, 'the hidden-items action is offered');
  statusBoard.listBoard = async () => view([item('v', 'GOOD'), item('h', 'MONITOR', { isHidden: true })]);
  variants.hiddenList = await invoke(open.message, { launchContext: { operationId: 'HOME_STATUS_BOARD', surface: 'ASK_CARD' } });
  for (const [name, result] of Object.entries(variants)) {
    assert.ok(['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status), `${name}: ${result.status}`);
    assert.equal(matchesStatusBoardAnswerContract(result), true, `${name}: the typed contract rejects the handler's own answer`);
    if (process.env.ASK_REAL_PATH_UPDATE !== '1') assert.equal(matchesOperationAnswerContract('HOME_STATUS_BOARD', result), true, `${name}: the runtime variant contract rejects the handler's own answer`);
  }
  conformRealPath('HOME_STATUS_BOARD', variants, __filename);
});
