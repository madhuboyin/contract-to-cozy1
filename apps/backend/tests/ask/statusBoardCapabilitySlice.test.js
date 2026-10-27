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
let hiddenCount;
let countArgs;

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
  hiddenCount = 0;
  countArgs = null;
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (model === 'homeItem') return { count: async (args) => { countArgs = args; return hiddenCount; } };
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
  const [propertyId, query, userId, options] = calls[0];
  assert.equal(propertyId, 'p1');
  assert.equal(userId, 'u1');
  assert.deepEqual(options, { readOnly: true }, 'the Ask read never creates rows or recomputes (FRD v1.319)');
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
  assert.deepEqual(list.presentation, { pattern: 'STATUS_ACCORDION' });
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((row) => row.id)]), [['Needs action', ['a']], ['Monitor', ['m']], ['In good shape', ['g']]]);
  const [urgent] = list.sections[0].items;
  assert.equal(urgent.description, 'Past expected life (10yr)');
  // Seven facts do not fit a card (six at most), so a fully recorded item drops the category and keeps the rest.
  assert.deepEqual(urgent.meta, ['replace soon', '12.5 yr old', 'Warranty: expired', '1 open maintenance task', 'Kitchen', 'Pinned']);
  assert.equal(urgent.href, null, 'a status row links to no desktop inventory page');
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

test('every block and the boundary survive the answer-trust validator, and nothing links to a desktop page', () => {
  const raw = statusBoardFromView(view({ pagination: { page: 1, limit: 100, total: 140, totalPages: 2 } }), 'p1');
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'status-board.read', operationId: 'HOME_STATUS_BOARD', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-23T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my status board', operationId: 'HOME_STATUS_BOARD', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.deepEqual(result.blocks[0].actions, []);
  assert.equal(JSON.stringify(result).includes('/dashboard/'), false);
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

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10: the Status Board accordion retains the shared display facts.
test('status facts: only Needs action is a caution; timing is the recorded age, or says the install date is missing', () => {
  const { statusBoardShelfFacts } = require('../../src/services/ask/askOrchestrator.service.ts');
  assert.deepEqual(statusBoardShelfFacts({ condition: 'ACTION_NEEDED', ageYears: 12.5 }), { tone: 'CAUTION', timingLabel: '12.5 yr old' });
  assert.deepEqual(statusBoardShelfFacts({ condition: 'MONITOR', ageYears: 0 }), { tone: 'DEFAULT', timingLabel: '0 yr old' });
  assert.deepEqual(statusBoardShelfFacts({ condition: 'GOOD', ageYears: null, needsInstallDateForPrediction: true }), { tone: 'DEFAULT', timingLabel: 'Install date needed' });
  assert.deepEqual(statusBoardShelfFacts({ condition: 'GOOD', ageYears: null }), { tone: 'DEFAULT', timingLabel: null });
});

test('the condition list declares the status accordion with display facts and no page link, and satisfies the contract', () => {
  const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
  const list = statusBoardFromView(view(), 'p1').blocks.find((block) => block.id === 'status-board-items');
  assert.deepEqual(list.presentation, { pattern: 'STATUS_ACCORDION' });
  assert.deepEqual(list.sections.map((section) => section.items[0].tone), ['CAUTION', 'DEFAULT', 'DEFAULT']);
  assert.equal(list.sections[0].items[0].timingLabel, '12.5 yr old');
  assert.deepEqual(list.actions, []);
  AskPresentationBlockSchema.parse(list);
});

test('the status accordion retains empty condition tabs so its counts remain comparable', () => {
  const list = statusBoardFromView(view({ items: [item('m', 'MONITOR')], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } }), 'p1').blocks.find((block) => block.id === 'status-board-items');
  assert.deepEqual(list.sections.map((section) => [section.title, section.count]), [['Needs action', 0], ['Monitor', 1], ['In good shape', 0]]);
});

test('the full answer checker, with answer relevance on, keeps the accordion answer with a code-like item name', () => {
  const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
  const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
  const result = attachAskAuthoritativeSourceEvidence(statusBoardFromView(view({ items: [item('a', 'ACTION_NEEDED', { displayName: 'HVAC_FURNACE' })], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } }), 'p1'), [completedAskAuthoritativeSourceEvidence('HOME_STATUS_BOARD')]);
  const checked = validateAskAnswerTrustPipeline({ question: 'Show my status board', operationId: 'HOME_STATUS_BOARD', propertyId: 'p1', semanticEnabled: true, result });
  assert.equal(checked.result.status, 'ANSWERED', JSON.stringify(checked.semantic));
});

test('an item missing its install date carries an inline "Add install date" capture on the inventory item id, and survives the answer checker', () => {
  const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
  const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
  const items = [
    item('a', 'MONITOR', { ageYears: null, needsInstallDateForPrediction: true, inventoryItemId: 'inv-a' }),
    item('b', 'GOOD', { ageYears: null, needsInstallDateForPrediction: true, inventoryItemId: null }),
    item('c', 'GOOD'),
  ];
  // A contributor: the capture writes the inventory item, so it is offered only to someone who can (a viewer sees the gap, not the action).
  const raw = statusBoardFromView(view({ items, pagination: { page: 1, limit: 100, total: 3, totalPages: 1 } }), 'p1', true);
  const list = raw.blocks.find((block) => block.id === 'status-board-items');
  require('../../src/productFramework/ask/ask.contract.ts').AskPresentationBlockSchema.parse(list);
  const cards = list.sections.flatMap((section) => section.items);
  const [a, b, c] = ['inv-a', 'b', 'c'].map((id) => cards.find((card) => card.id === id));
  assert.equal(a.needsInfo, true);
  assert.equal(b.needsInfo, true);
  assert.equal(c.needsInfo, false);
  assert.equal(a.entityType, 'INVENTORY_ITEM');
  assert.deepEqual(a.actions.map((action) => [action.label, action.operationId, action.interactionType, action.message]), [['Add install date', 'INVENTORY_ITEM_CORRECT', 'MUTATE_RECORD', 'Correct the install date of this inventory item.']]);
  assert.equal(b.actions, undefined, 'without an inventory item there is nothing to correct');
  assert.deepEqual(c.actions.map((action) => action.id), ['status-board-correct'], 'a dated item has the board correction, not the date capture');
  assert.equal(c.entityType, 'STATUS_BOARD_ITEM');
  const viewerCards = statusBoardFromView(view({ items, pagination: { page: 1, limit: 100, total: 3, totalPages: 1 } }), 'p1', false)
    .blocks.find((block) => block.id === 'status-board-items').sections.flatMap((section) => section.items);
  assert.ok(viewerCards.every((card) => card.actions === undefined), 'a viewer is offered no action');
  const result = attachAskAuthoritativeSourceEvidence(raw, [completedAskAuthoritativeSourceEvidence('HOME_STATUS_BOARD')]);
  const checked = validateAskAnswerTrustPipeline({ question: 'Show my status board', operationId: 'HOME_STATUS_BOARD', propertyId: 'p1', semanticEnabled: true, result });
  // The missing-date limitation makes the answer READY_WITH_LIMITATIONS; the checker must still pass it.
  assert.equal(checked.result.status, 'READY_WITH_LIMITATIONS', JSON.stringify(checked.semantic));
  assert.equal(checked.semantic.outcome, 'PASS');
});

test('an unknown-condition item is excluded from Good and counted once, in its own Missing information section', () => {
  const items = [
    item('a', 'ACTION_NEEDED'), item('m', 'MONITOR'), item('g', 'GOOD'),
    item('u', 'GOOD', { ageYears: null, needsInstallDateForPrediction: true, inventoryItemId: 'inv-u' }),
  ];
  const result = statusBoardFromView(view({ items, pagination: { page: 1, limit: 100, total: 4, totalPages: 1 } }), 'p1', true);
  const list = result.blocks.find((block) => block.id === 'status-board-items');
  assert.deepEqual(list.sections.map((section) => [section.id, section.count, section.items.map((row) => row.id)]), [
    ['status-board-action-needed', 1, ['a']], ['status-board-monitor', 1, ['m']], ['status-board-good', 1, ['g']], ['status-board-needs-info', 1, ['inv-u']],
  ]);
  assert.equal(result.blocks[0].title, '1 need action, 1 to monitor, 1 in good shape');
  const unknown = list.sections[3].items[0];
  assert.deepEqual(unknown.actions.map((action) => [action.label, action.operationId]), [['Add install date', 'INVENTORY_ITEM_CORRECT']]);
  require('../../src/productFramework/ask/ask.contract.ts').AskPresentationBlockSchema.parse(list);
});

test('with no known-good items the board makes no all-clear claim and shows unknown items as missing information', () => {
  const items = [item('u1', 'GOOD', { needsInstallDateForPrediction: true }), item('u2', 'GOOD', { needsInstallDateForPrediction: true })];
  const result = statusBoardFromView(view({ items, pagination: { page: 1, limit: 100, total: 2, totalPages: 1 } }), 'p1');
  assert.equal(result.blocks[0].title, '0 need action, 0 to monitor, 0 in good shape');
  const list = result.blocks.find((block) => block.id === 'status-board-items');
  assert.equal(list.sections.find((section) => section.id === 'status-board-good').count, 0);
  assert.equal(result.reasonCode, 'STATUS_BOARD_REVIEWED');
});

test('the typed status board contract matches each block id to its type, so a known id with another type is not the envelope', () => {
  const { matchesStatusBoardAnswerContract } = require('../../src/services/ask/askStatusBoardIntent.ts');
  const real = statusBoardFromView(view(), 'p1');
  assert.equal(matchesStatusBoardAnswerContract(real), true);
  const wrongType = { ...real, blocks: real.blocks.map((block) => block.id === 'status-board-items' ? { ...block, type: 'TABLE' } : block) };
  assert.equal(matchesStatusBoardAnswerContract(wrongType), false);
  assert.equal(matchesStatusBoardAnswerContract({ ...real, blocks: [...real.blocks, { type: 'SUMMARY', id: 'other', title: 't', body: 'b', actions: [] }] }), false);
});

test('hidden items: the board offers them only when some exist, and the declared action lists just those with their way back', async () => {
  const none = await capabilityInvoke('HOME_STATUS_BOARD', { userId: 'u1', propertyId: 'p1', message: 'Show my status board' });
  assert.ok(!none.blocks[0].actions.some((a) => a.id === 'status-board-hidden'));
  assert.deepEqual(countArgs.where, { propertyId: 'p1', status: { is: { isHidden: true } } });

  hiddenCount = 2;
  const some = await capabilityInvoke('HOME_STATUS_BOARD', { userId: 'u1', propertyId: 'p1', message: 'Show my status board' });
  const open = some.blocks[0].actions.find((a) => a.id === 'status-board-hidden');
  assert.equal(open.label, 'Show hidden items (2)');
  assert.equal(open.operationId, 'HOME_STATUS_BOARD');

  statusBoard.listBoard = async (...args) => { calls.push(args); return view({ items: [item('v', 'GOOD'), item('h', 'MONITOR', { isHidden: true })], pagination: { page: 1, limit: 100, total: 2, totalPages: 1 } }); };
  const hidden = await capabilityInvoke('HOME_STATUS_BOARD', { userId: 'u1', propertyId: 'p1', message: open.message, launchContext: { operationId: 'HOME_STATUS_BOARD', surface: 'ASK_CARD' } });
  assert.equal(calls[calls.length - 1][1].includeHidden, true);
  assert.equal(hidden.blocks[0].title, '1 hidden item');
  const rows = hidden.blocks.find((b) => b.id === 'status-board-items').sections.flatMap((x) => x.items);
  assert.deepEqual(rows.map((r) => r.title), ['Item h']);
  assert.equal(hidden.blocks[0].actions[0].id, 'status-board-back-to-board');
});

test('the hidden list is reached only by its declared action, never by the message alone', async () => {
  hiddenCount = 1;
  statusBoard.listBoard = async (...args) => { calls.push(args); return view(); };
  await capabilityInvoke('HOME_STATUS_BOARD', { userId: 'u1', propertyId: 'p1', message: 'Show the home items I have hidden from my status board.' });
  assert.equal(calls[calls.length - 1][1].includeHidden, false);
});
