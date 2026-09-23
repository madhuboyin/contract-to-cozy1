const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.51: HOME_STATUS_BOARD (Status Board), the fourth new Ask operation for a capability
// the Appendix D audit found with none. The service is stubbed; the fake prisma throws on any model.

const prismaModule = require('../../src/lib/prisma.ts');
const { statusBoardFromView, STATUS_BOARD_ASK_LIMIT } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const statusBoard = require('../../src/services/homeStatusBoard.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const originals = { prisma: prismaModule.prisma, list: statusBoard.listBoard, resolveAccess: propertyAccess.resolvePropertyAccess };
let calls;

const item = (id, condition, overrides = {}) => ({
  id, displayName: `Item ${id}`, category: 'APPLIANCE', condition, recommendation: condition === 'ACTION_NEEDED' ? 'REPLACE_SOON' : 'OK', ageYears: 12.5,
  computedReasons: condition === 'GOOD' ? [{ code: 'ALL_CLEAR', detail: 'No issues detected' }] : [{ code: 'PAST_EOL', detail: 'Past expected life (10yr)' }],
  warrantyStatus: 'EXPIRED', pendingMaintenance: 1, room: { id: 'r1', name: 'Kitchen' }, isPinned: false, needsInstallDateForPrediction: false,
  deepLinks: { viewItem: `/dashboard/properties/p1/inventory?openItemId=inv-${id}` },
  ...overrides,
});
const view = (overrides = {}) => ({
  items: [item('a', 'ACTION_NEEDED', { isPinned: true }), item('m', 'MONITOR'), item('g', 'GOOD')],
  summary: {}, pagination: { page: 1, limit: 100, total: 3, totalPages: 1 },
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
  statusBoard.listBoard = async (...args) => { calls.push(args); return view(); };
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'VIEWER', userId: 'u1', propertyId: 'p1' });
}

function restore() {
  prismaModule.prisma = originals.prisma;
  statusBoard.listBoard = originals.list;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
}

test.beforeEach(install);
test.afterEach(restore);

test('the operation reads listBoard like the page route, for the route\'s maximum page of visible items', async () => {
  await capabilityInvoke('HOME_STATUS_BOARD', { userId: 'u1', propertyId: 'p1', message: 'Show my status board' });
  const [propertyId, query, userId] = calls[0];
  assert.equal(propertyId, 'p1');
  assert.equal(userId, 'u1');
  assert.equal(query.limit, STATUS_BOARD_ASK_LIMIT);
  assert.equal(query.page, 1);
  assert.equal(query.includeHidden, false);
  assert.equal(query.pinnedOnly, false);
});

test('items are grouped by condition with their reasons, age, warranty, maintenance, room and a link to the item', () => {
  const result = statusBoardFromView(view(), 'p1');
  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.blocks[0].title, '1 need action, 1 to monitor, 1 in good shape');
  const list = result.blocks.find((block) => block.id === 'status-board-items');
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((row) => row.id)]), [['Needs action', ['a']], ['Monitor', ['m']], ['In good shape', ['g']]]);
  const [urgent] = list.sections[0].items;
  assert.equal(urgent.description, 'Past expected life (10yr)');
  assert.deepEqual(urgent.meta, ['replace soon', 'appliance', '12.5 yr old', 'Warranty: expired', '1 open maintenance task', 'Kitchen', 'Pinned']);
  assert.equal(urgent.href, '/dashboard/properties/p1/inventory?openItemId=inv-a');
  assert.equal(list.sections[2].items[0].description, null, 'an all-clear reason is not repeated as a description');
});

test('a larger board and items missing an install date are disclosed; an empty board is not an all-clear', () => {
  const big = statusBoardFromView(view({ pagination: { page: 1, limit: 100, total: 140, totalPages: 2 }, items: [item('a', 'ACTION_NEEDED', { needsInstallDateForPrediction: true })] }), 'p1');
  assert.equal(big.status, 'READY_WITH_LIMITATIONS');
  const limits = big.blocks.find((block) => block.type === 'LIMITATION');
  assert.match(limits.body, /first 1 of 140 items/);
  assert.match(limits.body, /1 item needs an install or purchase date/);
  const empty = statusBoardFromView(view({ items: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } }), 'p1');
  assert.equal(empty.reasonCode, 'STATUS_BOARD_EMPTY');
  assert.equal(empty.blocks[0].title, 'Nothing is on the Status Board yet');
});

test('every block and the boundary survive the answer-trust validator, and the page link the whitelist', () => {
  const raw = statusBoardFromView(view({ pagination: { page: 1, limit: 100, total: 140, totalPages: 2 } }), 'p1');
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'status-board.read', operationId: 'HOME_STATUS_BOARD', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-23T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my status board', operationId: 'HOME_STATUS_BOARD', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId: 'HOME_STATUS_BOARD', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true);
});

test('condition phrasing routes here; maintenance due, next actions, repair-or-replace and the inventory list do not', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId;
  for (const message of ['Show my status board', 'Which of my appliances need attention?', 'How are my home systems holding up?', 'What is the condition of my appliances?']) {
    assert.equal(route(message), 'HOME_STATUS_BOARD', message);
  }
  assert.equal(route('What maintenance is due?'), 'MAINTENANCE_STATUS');
  assert.equal(route('What should I do next for my home?'), 'HOME_ACTIONS');
  assert.equal(route('Should I repair or replace my dishwasher?'), 'REPLACEMENT_GUIDANCE');
  assert.equal(route('Show my appliances'), 'INVENTORY_LOOKUP');
});

test('the operation is fully registered: its own skill, the bridge, and the card launch', () => {
  assert.equal(getSkillForOperation('HOME_STATUS_BOARD').id, 'status-board');
  assert.equal(ASK_OPERATION_CAPABILITY.HOME_STATUS_BOARD, 'status-board');
  const launch = capabilityCardLaunch('status-board').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'HOME_STATUS_BOARD');
});
