// FR-FAST-10 / FR-GATE-8, slice 4: HOME_STATUS_BOARD may be tried provisionally. The real handler runs through capabilityInvoke (stubbed board service, as the real-path evidence test) and its answer goes through the delivery gate.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register');
const prismaModule = require('../../src/lib/prisma.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
require('../../src/services/ask/handlers/statusBoard.handler.ts');
const statusBoard = require('../../src/services/homeStatusBoard.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { groundedStatusBoardVerdict, GROUNDED_READ_CHECKS } = require('../../src/services/ask/support/provisionalRead.ts');
const { isProvisionalReadOperation } = require('../../src/services/ask/fastPath/fastPathCertificates.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

const originals = { prisma: prismaModule.prisma, list: statusBoard.listBoard, resolveAccess: propertyAccess.resolvePropertyAccess };
const item = (id, condition, o = {}) => ({ id, displayName: `Item ${id}`, category: 'APPLIANCE', condition, recommendation: condition === 'ACTION_NEEDED' ? 'REPLACE_SOON' : 'OK', ageYears: 12.5, computedReasons: [{ code: 'X', detail: 'detail' }], ...o });
const view = (items) => ({ items, summary: {}, pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 } });
test.beforeEach(() => {
  prismaModule.prisma = new Proxy({}, { get(_t, model) { if (model === 'then') return undefined; if (model === 'homeItem') return { count: async () => 0 }; throw new Error(`Unexpected prisma.${String(model)} access`); } });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'VIEWER', userId: 'u1', propertyId: 'p1' });
});
test.afterEach(() => { prismaModule.prisma = originals.prisma; statusBoard.listBoard = originals.list; propertyAccess.resolvePropertyAccess = originals.resolveAccess; });
const invoke = (message, extra = {}) => capabilityInvoke('HOME_STATUS_BOARD', { userId: 'u1', propertyId: 'p1', message, ...extra }, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });
const gate = (question, result) => validateAskAnswerTrustPipeline({ question, operationId: 'HOME_STATUS_BOARD', propertyId: 'p1', semanticEnabled: true, provisionalRead: true, result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('HOME_STATUS_BOARD')].flat()) });
const BOARD = () => view([item('a', 'ACTION_NEEDED'), item('m', 'MONITOR'), item('g', 'GOOD')]);

test('HOME_STATUS_BOARD is on the allowlist and started only for plain board questions', () => {
  assert.ok('HOME_STATUS_BOARD' in GROUNDED_READ_CHECKS); assert.equal(isProvisionalReadOperation('HOME_STATUS_BOARD'), true);
  for (const m of ['Show my status board', 'How are my appliances doing?']) { const d = resolveAskRoutingCascade(m, { localRoutingEnabled: true }); assert.equal(d.stage, 'PROVISIONAL', m); assert.equal(d.operation.operationId, 'HOME_STATUS_BOARD', m); }
  for (const m of ['Hide my dishwasher from the status board', 'Refresh the status board', 'Pin the furnace on my status board', 'which plants need attention']) { const d = resolveAskRoutingCascade(m, { localRoutingEnabled: true }); assert.notEqual(d.operation?.operationId === 'HOME_STATUS_BOARD' && d.stage === 'PROVISIONAL', true, m); }
});
test('the real board answers are delivered', async () => {
  statusBoard.listBoard = async () => BOARD();
  for (const q of ['Show my status board', 'How are my appliances doing?', 'Which appliances need attention?']) { const a = await invoke(q); const c = gate(q, a); assert.equal(c.semantic.outcome, 'PASS', `${q}: ${JSON.stringify(c.semantic)}`); }
  statusBoard.listBoard = async () => view([]); assert.equal(gate('Show my status board', await invoke('Show my status board')).semantic.outcome, 'PASS', 'an empty board is an honest answer');
});
test('a mismatched answer is withheld', async () => {
  statusBoard.listBoard = async () => BOARD(); const board = await invoke('Show my status board');
  statusBoard.listBoard = async () => view([item('v', 'GOOD'), item('h', 'MONITOR', { isHidden: true })]); const { STATUS_BOARD_HIDDEN_MESSAGE } = require('../../src/services/ask/support/statusBoardCommand.ts'); const hidden = await invoke(STATUS_BOARD_HIDDEN_MESSAGE, { launchContext: { operationId: 'HOME_STATUS_BOARD', surface: 'ASK_CARD' } });
  const code = (q, a) => groundedStatusBoardVerdict(q, a).reasonCodes[1];
  assert.equal(code('Show my status board', hidden), 'HIDDEN_LIST_FOR_A_QUESTION_THAT_DID_NOT_ASK_FOR_IT');
  assert.equal(code('Show my hidden appliances', board), 'BOARD_FOR_A_HIDDEN_ITEMS_QUESTION');
  assert.equal(code('When does my warranty expire?', board), 'QUESTION_NOT_ABOUT_THE_STATUS_BOARD');
  assert.equal(code('What does it cost to replace my appliances?', board), 'ANOTHER_OPERATION_OWNS_THE_QUESTION');
  assert.equal(code('Show my status board', { status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 'x', title: 't', body: 'b', tone: 'DEFAULT', actions: [] }], suggestions: [] }), 'ANSWER_IS_NOT_A_VERIFIED_VARIANT');
});
