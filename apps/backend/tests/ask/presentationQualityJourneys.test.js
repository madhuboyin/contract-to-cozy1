const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Presentation Quality 4: five multi-turn journeys at the contract level. Each next turn is derived from the PREVIOUS result's own
// declared action (never hand-typed), then checked for what continuity needs: exact entity identity, a registered operation, the role
// floor and confirmation the domain registry declares, and that reconciliation refreshes the result a person is looking at.

const fs = require('node:fs');
const path = require('node:path');
const prismaModule = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { statusBoardFromView, refinanceScenarioComparison } = require('../../src/services/ask/askOrchestrator.service.ts');
const { ASK_MUTATION_IMPACT_MAP, selectSiblingRefreshTargets } = require('../../src/services/ask/execution/executeOperation.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { ASK_DOMAIN_COMMAND_REGISTRY, getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');

const isCommandOperation = (id) => Boolean(getAskDomainCommandByOperation(id));

/** The next turn a client would send for a declared action. */
const turnFrom = (action) => ({
  message: action.message, operationId: action.operationId ?? null, entityType: action.entityType ?? null, entityId: action.entityId ?? null,
  interactionType: action.interactionType ?? null,
});
const registered = (operationId) => assert.ok(ASK_OPERATION_DEFINITIONS[operationId], `${operationId} is not a registered operation`);

// ---- Journey 1: Status Board -----------------------------------------------------------------------------------------------------

const row = (id, condition, extra = {}) => ({
  id, displayName: `Item ${id}`, category: 'APPLIANCE', condition, recommendation: 'OK', ageYears: 12,
  computedReasons: [{ code: 'PAST_EOL', detail: 'Past expected life' }], warrantyStatus: 'EXPIRED', pendingMaintenance: 0, room: null, isPinned: false,
  needsInstallDateForPrediction: false, ...extra,
});
const boardOf = (items, canChange) => statusBoardFromView({ items, summary: {}, pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 } }, 'p1', canChange);
const unknownItem = row('board-row-1', 'GOOD', { displayName: 'Water heater', needsInstallDateForPrediction: true, ageYears: null, computedReasons: [], inventoryItemId: 'inv-1' });

test('J1 status board: an unknown item keeps its exact inventory identity into the correction, which is confirmed and then reconciles the board', () => {
  const result = boardOf([row('a', 'MONITOR'), unknownItem], true);
  const list = result.blocks.find((block) => block.id === 'status-board-items');
  const missing = list.sections.find((section) => section.id === 'status-board-needs-info');
  assert.deepEqual(missing.items.map((item) => item.title), ['Water heater'], 'unknown is never Good');
  const card = missing.items[0];
  assert.deepEqual([card.id, card.entityType], ['inv-1', 'INVENTORY_ITEM'], 'the card carries the inventory item, not the board row');
  assert.equal(card.needsInfo, true);

  const turn = turnFrom({ ...card.actions[0], entityType: card.entityType, entityId: card.id });
  registered(turn.operationId);
  assert.deepEqual([turn.operationId, turn.entityType, turn.entityId], ['INVENTORY_ITEM_CORRECT', 'INVENTORY_ITEM', 'inv-1']);
  assert.ok(ASK_OPERATION_DEFINITIONS.INVENTORY_ITEM_CORRECT.propertyRoleFloor !== 'VIEWER', 'a viewer cannot correct');
  const command = ASK_DOMAIN_COMMAND_REGISTRY.INVENTORY_ITEM_CORRECT;
  assert.ok(command, 'the correction is a confirmed command');
  assert.equal(command.material, true);
  assert.ok(command.cancellation.body.length > 10, 'cancelling says nothing changed');

  // After confirmation the board a person is looking at is reconciled in place; the original response is not rewritten
  // (only reads are refreshed, never commands).
  assert.ok(ASK_MUTATION_IMPACT_MAP.INVENTORY_ITEM_CORRECT.includes('HOME_STATUS_BOARD'));
  assert.ok(ASK_MUTATION_IMPACT_MAP.STATUS_BOARD_COMMAND.includes('HOME_STATUS_BOARD'));
  const targets = selectSiblingRefreshTargets(
    [{ operationId: 'HOME_STATUS_BOARD' }, { operationId: 'INVENTORY_ITEM_CORRECT' }, { operationId: 'HOME_STATUS_BOARD' }], isCommandOperation);
  assert.deepEqual(targets, [{ operationId: 'HOME_STATUS_BOARD' }], 'one read refreshed, no command re-run');
});

test('J1 status board: refresh is a separate confirmed command on the property, and a viewer is offered neither it nor the correction', () => {
  const contributor = boardOf([unknownItem], true);
  const refresh = contributor.blocks[0].actions[0];
  assert.deepEqual([refresh.operationId, refresh.entityType, refresh.entityId, refresh.style], ['STATUS_BOARD_COMMAND', 'STATUS_BOARD_PROPERTY', 'p1', 'SECONDARY']);
  const refreshCommand = getAskDomainCommandByOperation('STATUS_BOARD_COMMAND');
  assert.equal(refreshCommand.roleFloor, 'CONTRIBUTOR');

  const viewer = boardOf([unknownItem], false);
  assert.deepEqual(viewer.blocks[0].actions, []);
  const viewerCard = viewer.blocks.find((block) => block.id === 'status-board-items').sections.flatMap((section) => section.items)[0];
  assert.equal(viewerCard.actions, undefined, 'no action the server would refuse');
  assert.equal(viewerCard.id, 'board-row-1');
  assert.equal(viewerCard.needsInfo, true, 'the gap is still shown, honestly');
});

// ---- Journey 2: refinance decision -----------------------------------------------------------------------------------------------

const refinance = require('../../src/services/ask/handlers/refinance.handler.ts');
const scenarioInput = (edit) => ({
  current: { currentRatePct: 6.875, marketRatePct: 6.125, monthlySavings: 210, lifetimeSavings: 41000, breakEvenMonths: 28 },
  scenario: {
    newMonthlyPayment: 1750, currentMonthlyPayment: 2083, monthlySavings: 333, lifetimeSavings: 77000, closingCostUsd: 6000, breakEvenMonths: 19, estimatedAprPct: 5.6,
    cashToCloseUsd: 6000, totalInterestNewLoan: 120000, totalInterestRemainingCurrent: 197000, payoffDeltaMonths: -36,
    recommendationExplanation: 'The 15-year term saves the most interest.', objective: 'LOWER_PAYMENT', recommendedTerm: 'FIFTEEN_YEAR',
  },
  scenarioEdit: edit, targetRatePct: edit.targetRatePct, termLabel: '15-year',
  benchmark: { date: '2026-10-09', source: 'FRED', sourceRef: null }, mortgageObservedAt: null, mortgageUpdatedAt: '2026-09-02T00:00:00.000Z', contextVersion: 'ctx',
});

test('J2 refinance: the scenario the homeowner adjusts is the same subject, its own action reproduces the same assumptions, and nothing is saved', () => {
  const first = refinance.parseRefinanceScenarioEdit('What if I refinanced at 5.5% for 15 years with $6,000 closing costs?');
  const answer = refinance.refinanceScenarioAnswer(scenarioInput(first));
  for (const block of answer.blocks) AskPresentationBlockSchema.parse(block);
  const adjust = answer.blocks[0].actions.find((action) => action.id === 'refinance-adjust-scenario');
  assert.equal(adjust.style, 'PRIMARY');
  const again = refinance.parseRefinanceScenarioEdit(turnFrom(adjust).message);
  assert.deepEqual([again.targetRatePct, again.targetTerm, again.closingCostAmount], [5.5, 'FIFTEEN_YEAR', 6000], 'the adjust action carries the same rate, term and costs');
  registered(turnFrom(adjust).operationId);

  // The answer says what it assumed, and that nothing was saved; the engine call is declared not to save.
  assert.ok(answer.blocks.some((block) => block.type === 'ASSUMPTIONS'));
  assert.match(answer.blocks[0].body, /nothing was saved/);
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/services/ask/handlers/refinance.handler.ts'), 'utf8');
  assert.match(source, /saveScenario: false/);
});

test('J2 refinance: the follow-up actions reach the journey they name, and the consequential write stays an owner-confirmed command', () => {
  const answer = refinance.refinanceScenarioAnswer(scenarioInput(refinance.parseRefinanceScenarioEdit('What if I refinanced at 5.5% for 15 years with $6,000 closing costs?')));
  const byId = Object.fromEntries(answer.blocks[0].actions.map((action) => [action.id, action]));
  assert.equal(refinance.refinanceJourneyIntent(byId['refinance-compare-offers'].message), 'COMPARE_OFFERS');
  assert.equal(refinance.refinanceJourneyIntent(byId['refinance-record-decision'].message), 'RECORD_DECISION');
  const profile = getAskDomainCommandByOperation('FINANCING_PROFILE_COMMAND');
  assert.ok(profile, 'changing mortgage facts is a confirmed command');
  assert.equal(profile.material, true);
  assert.equal(profile.roleFloor, 'OWNER');
  assert.equal(answer.blocks[0].actions.filter((action) => action.style === 'PRIMARY').length, 1);
});

// ---- Journey 3: seasonal care ------------------------------------------------------------------------------------------------------

const seasonal = require('../../src/services/ask/support/seasonalHomeCare.ts');

test('J3 seasonal: the first task\'s walkthrough is the leading task, keeps the plan identity, and setup stays a confirmed proposal', () => {
  const input = { zipCode: '60601', now: new Date('2026-10-14T12:00:00.000Z'), focus: 'THIS_SEASON', setup: { canSetUp: true, checklist: null } };
  const plan = seasonal.buildSeasonalHomeCareResult(input);
  const list = plan.blocks.find((block) => block.id === 'seasonal-home-care-tasks');
  const leading = list.sections[0].items[0];
  const next = plan.blocks.find((block) => block.id === 'seasonal-home-care-next');

  const walk = next.actions.find((action) => action.id === 'seasonal-walkthrough');
  const parsed = seasonal.parseSeasonalTaskEntityId(walk.entityId);
  assert.equal(parsed.taskKey, leading.id, 'the walkthrough is for the task the plan led with');
  const guide = seasonal.buildSeasonalTaskWalkthrough({ ...input, taskKey: parsed.taskKey });
  assert.equal(guide.blocks[0].type, 'TASK_GUIDE');
  assert.equal(guide.blocks[0].title, leading.title);
  const back = guide.blocks[0].actions.find((action) => action.id === 'seasonal-back-to-plan');
  assert.equal(back.operationId, 'SEASONAL_HOME_CARE', 'the guide returns to the same plan');

  const add = next.actions.find((action) => action.id === 'seasonal-add-tasks');
  assert.equal(add.operationId, 'SEASONAL_CHECKLIST_SETUP');
  const plan_ = seasonal.parseSeasonalPlanEntityId(add.entityId);
  assert.deepEqual([plan_.season, typeof plan_.year], ['FALL', 'number']);
  const command = getAskDomainCommandByOperation('SEASONAL_CHECKLIST_SETUP');
  assert.ok(command && command.material, 'creating tasks is confirmed');
  assert.ok(command.cancellation.body.length > 10, 'cancelling changes nothing');
  assert.ok(ASK_MUTATION_IMPACT_MAP.SEASONAL_CHECKLIST_SETUP.includes('SEASONAL_HOME_CARE'));
  assert.ok(ASK_MUTATION_IMPACT_MAP.SEASONAL_CHECKLIST_SETUP.includes('MAINTENANCE_STATUS'));
});

test('J3 seasonal: asking about a task the plan does not contain recovers instead of inventing it', () => {
  const input = { zipCode: '60601', now: new Date('2026-10-14T12:00:00.000Z'), focus: 'THIS_SEASON' };
  assert.equal(seasonal.buildSeasonalTaskWalkthrough({ ...input, taskKey: 'NOT_A_REAL_TASK' }), null);
});

// ---- Journey 4: warranty to repair or replace -------------------------------------------------------------------------------------

const itemRecord = (overrides = {}) => ({
  id: 'w1', propertyId: 'p1', providerName: 'Rheem Care', category: 'APPLIANCE', coverageDetails: 'Parts and labor', startDate: new Date('2022-01-01T00:00:00.000Z'),
  expiryDate: new Date('2032-01-01T00:00:00.000Z'), updatedAt: new Date('2026-09-01T00:00:00.000Z'), inventoryItem: { name: 'Water heater' }, documents: [], ...overrides,
});

test('J4 warranty: the item chosen in the repair-or-replace answer is the item whose warranty is answered, and the way back keeps it', () => {
  const { itemWarrantyFromRecords } = require('../../src/services/ask/handlers/warranties.handler.ts');
  const item = { id: 'inv-9', name: 'Water heater' };
  const covered = itemWarrantyFromRecords({ item, propertyId: 'p1', records: [itemRecord()], canWrite: true, ownedIds: new Set(), now: new Date('2026-10-14T00:00:00.000Z') });
  assert.match(covered.blocks[0].title, /^Water heater: /);
  const back = covered.blocks[0].actions.find((action) => action.id === 'warranty-item-repair-replace');
  assert.deepEqual([back.operationId, back.entityType, back.entityId], ['REPLACEMENT_GUIDANCE', 'INVENTORY_ITEM', 'inv-9']);
  for (const block of covered.blocks) AskPresentationBlockSchema.parse(block);

  const none = itemWarrantyFromRecords({ item, propertyId: 'p1', records: [], canWrite: true, ownedIds: new Set() });
  assert.equal(none.reasonCode, 'WARRANTY_NOT_RECORDED_FOR_ITEM');
  assert.match(none.blocks[0].body, /will not assume coverage either way/);
  assert.equal(none.status, 'READY_WITH_LIMITATIONS');
});

test('J4 warranty: both new actions survive the answer trust policy for the operations that emit them', () => {
  const applicable = (id, operationId, targetOperationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId: targetOperationId, entityType: 'INVENTORY_ITEM', entityId: 'inv-9', style: 'SECONDARY' },
    operationId, propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true,
  });
  assert.equal(applicable('repair-replace-check-warranty', 'REPLACEMENT_GUIDANCE', 'WARRANTY_LOOKUP'), true);
  assert.equal(applicable('warranty-item-repair-replace', 'WARRANTY_LOOKUP', 'REPLACEMENT_GUIDANCE'), true);
});

test('J4 warranty: the handler answers for the launched item only, says when the item is gone, and never lists the whole home as if it were the item', async () => {
  const originals = { prisma: prismaModule.prisma, access: propertyAccess.resolvePropertyAccess };
  const queries = [];
  const items = { 'inv-9': { id: 'inv-9', name: 'Water heater', warrantyId: 'w1' } };
  prismaModule.prisma = {
    inventoryItem: { findFirst: async (args) => { queries.push(['item', args.where]); return items[args.where.id] ?? null; } },
    warranty: { findMany: async (args) => { queries.push(['warranty', args.where]); return args.where.homeownerProfile ? [] : [itemRecord()]; } },
  };
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'CONTRIBUTOR', userId: 'u1', propertyId: 'p1' });
  try {
    const found = await capabilityInvoke('WARRANTY_LOOKUP', { userId: 'u1', propertyId: 'p1', message: 'Is Water heater still under warranty?', launchContext: { entityType: 'INVENTORY_ITEM', entityId: 'inv-9' } });
    assert.match(found.blocks[0].title, /^Water heater: /);
    const warrantyQuery = queries.find(([kind, where]) => kind === 'warranty' && where.OR);
    assert.deepEqual(warrantyQuery[1].OR, [{ inventoryItemId: 'inv-9' }, { id: 'w1' }], 'scoped to the item, by both of its links');
    assert.equal(warrantyQuery[1].propertyId, 'p1');

    const gone = await capabilityInvoke('WARRANTY_LOOKUP', { userId: 'u1', propertyId: 'p1', message: 'Is it under warranty?', launchContext: { entityType: 'INVENTORY_ITEM', entityId: 'inv-deleted' } });
    assert.equal(gone.reasonCode, 'WARRANTY_ITEM_NOT_FOUND');
    assert.match(gone.blocks[0].body, /Nothing was assumed about its coverage/);
  } finally {
    prismaModule.prisma = originals.prisma;
    propertyAccess.resolvePropertyAccess = originals.access;
  }
});

// ---- Journey 5: home buyer closing -------------------------------------------------------------------------------------------------

const buyer = require('../../src/services/ask/handlers/buyerPlan.handler.ts');

test('J5 buyer: a deadline task row carries the exact task, its completion is a confirmed contributor command, and the plan reads reconcile', () => {
  const task = { id: 'task-77', title: 'Lock the rate', description: null, priority: 'NOW', status: 'PENDING', dueAt: '2026-10-20T00:00:00.000Z' };
  const row = buyer.buyerDeadlineTaskRow(task, buyer.buyerTaskItemActions('CONTRIBUTOR'));
  assert.deepEqual([row.id, row.entityType], ['task-77', 'BUYER_TASK']);
  const complete = row.actions[0];
  assert.deepEqual([complete.operationId, complete.interactionType], ['BUYER_TASK_COMPLETE', 'MUTATE_RECORD']);
  registered(complete.operationId);
  const command = getAskDomainCommandByOperation('BUYER_TASK_COMPLETE');
  assert.ok(command && command.material);
  assert.ok(['CONTRIBUTOR', 'OWNER'].includes(command.roleFloor));

  // "What changed?" is answered from the reconciled reads, with the original answer left as it was.
  assert.deepEqual([...ASK_MUTATION_IMPACT_MAP.BUYER_TASK_COMPLETE].sort(), ['BUYER_DEADLINES', 'BUYER_PLAN_STATUS']);
  for (const id of ['BUYER_PLAN_STATUS', 'BUYER_DEADLINES']) assert.equal(isCommandOperation(id), false, `${id} is a read, so it is refreshed`);
  assert.deepEqual(buyer.buyerTaskItemActions('VIEWER'), [], 'a viewer is offered no completion');
});

test('J5 buyer: a deadline with no recorded due date states none, and sequential questions keep one result identity', () => {
  const row = buyer.buyerDeadlineTaskRow({ id: 't', title: 'Schedule inspection', description: null, priority: 'NEXT', status: 'PENDING', dueAt: null }, []);
  assert.ok(!row.meta.some((entry) => /^Due /.test(entry)), 'no invented date');
  const first = buyer.buildBuyerDeadlinesViewState(null, null);
  const second = buyer.buildBuyerDeadlinesViewState(first, 'FINANCING');
  assert.equal(second.resultId, first.resultId, 'the same result continues rather than restarting');
  assert.equal(second.revision, first.revision + 1);
  assert.equal(ASK_OPERATION_DEFINITIONS.BUYER_DEADLINES.family === 'COMMAND', false);
});
