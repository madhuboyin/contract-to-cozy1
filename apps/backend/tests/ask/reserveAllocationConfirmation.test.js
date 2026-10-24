const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

require('ts-node/register');

// "Fund this expense" (continuation FRD section 33): only a homeowner's explicit confirmation of THAT expense's reserve line item completes the step, through one shared write and reporter.
// A calculated line item, a generic contribution and the parent fund prove nothing. No database, browser or native module.

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { reserveFundCommandResult } = require('../../src/services/ask/handlers/reserveFundCommands.handler.ts');
const calc = require('../../src/services/homeReserveFundCalculation.service.ts').homeReserveFundCalculationService;
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const ops = require('../../src/services/reserveAllocationOperations.ts');
const { askGuidanceStepMode } = require('../../src/services/ask/askGuidanceStepHandlers.ts');
const { RESERVE_FUND_ACTION_IDS } = require('../../src/services/ask/support/reserveFundConstants.ts');

const OP = 'RESERVE_FUND_COMMAND';
let fundUpdates; let line; let updates; let step; let sourceLaunch; let reports; let reportFails; let role; let saved;
const stepRow = (over = {}) => ({ id: 'step-f', stepKey: 'fund_capital_expense', toolKey: 'capital-timeline', status: 'PENDING', journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: 'item-1',
  primarySignal: { signalIntentFamily: 'financial_exposure', sourceToolKey: 'reserve-fund', sourceEntityType: 'RESERVE_FUND_LINE_ITEM', sourceEntityId: 'tl-1' } }, ...over });

test.beforeEach(() => {
  line = { id: 'li-1', fundId: 'fund-1', timelineItemId: 'tl-1', status: 'ACTIVE', allocatedMonthlyCents: 18500, targetCostCents: 900000, allocationConfirmedAt: null, allocationConfirmedByUserId: null, allocationConfirmedMonthlyCents: null,
    timelineItem: { category: 'HVAC', inventoryItem: { name: 'Furnace' } } };
  updates = []; step = stepRow(); sourceLaunch = null; reports = []; reportFails = false; role = 'CONTRIBUTOR';
  saved = { models: ['guidanceSignal', 'guidanceJourney', 'guidanceJourneyEvent', 'guidanceStepEvidence', 'guidanceJourneyStep', 'homeReserveFundLineItem', 'homeReserveFund', 'askExecution'].map((name) => [name, prisma[name]]).concat([['$transaction', prisma.$transaction]]),
    fund: calc.getOrCreateFund, resolve: propertyAccess.resolvePropertyAccess, rec: guidanceJourneyService.recordToolCompletion };
  prisma.guidanceSignal = {}; prisma.guidanceJourney = {}; prisma.guidanceJourneyEvent = {}; prisma.guidanceStepEvidence = {};
  prisma.guidanceJourneyStep = { findFirst: async () => step };
  prisma.askExecution = { findFirst: async () => (sourceLaunch ? { launchContextJson: sourceLaunch } : null) };
  prisma.homeReserveFundLineItem = {
    findFirst: async (args) => (args.where.id === line.id && args.where.fundId === 'fund-1' ? line : null),
    update: async ({ where, data }) => { updates.push({ where, data }); Object.assign(line, data); return line; },
    findMany: async () => [line],
  };
  fundUpdates = [];
  prisma.homeReserveFund = { update: async (args) => { fundUpdates.push(args); return {}; } };
  prisma.$transaction = async (fn) => fn(prisma);
  calc.getOrCreateFund = async () => ({ id: 'fund-1' });
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  guidanceJourneyService.recordToolCompletion = async (input) => { reports.push(input); if (reportFails) throw new Error('down'); return {}; };
});
test.afterEach(() => {
  for (const [name, model] of saved.models) prisma[name] = model;
  calc.getOrCreateFund = saved.fund; propertyAccess.resolvePropertyAccess = saved.resolve; guidanceJourneyService.recordToolCompletion = saved.rec;
});

test('confirming writes the person, the time and the monthly amount confirmed, and nothing else on the line item', async () => {
  const out = await ops.confirmReserveAllocationWithEffects('p1', 'u1', 'li-1');
  assert.equal(updates.length, 1);
  assert.deepEqual(Object.keys(updates[0].data).sort(), ['allocatedMonthlyCents', 'allocationConfirmedAt', 'allocationConfirmedByUserId', 'allocationConfirmedMonthlyCents', 'allocationSuggestedMonthlyCents']);
  assert.deepEqual([updates[0].data.allocationConfirmedByUserId, updates[0].data.allocationConfirmedMonthlyCents], ['u1', 18500]);
  assert.ok(updates[0].data.allocationConfirmedAt instanceof Date);
  assert.deepEqual([out.guidanceReported, out.guidanceRefusal, reports.length], [null, null, 0], 'no journey step named: nothing reported');
});

test('a missing, other-home or retired line item cannot be confirmed', async () => {
  await assert.rejects(() => ops.confirmReserveAllocationWithEffects('p1', 'u1', 'li-missing'), (e) => e.code === 'LINE_ITEM_NOT_FOUND');
  line.status = 'RETIRED';
  await assert.rejects(() => ops.confirmReserveAllocationWithEffects('p1', 'u1', 'li-1'), (e) => e.code === 'LINE_ITEM_NOT_ACTIVE');
  assert.equal(updates.length, 0);
});

test('with a journey step it reports a typed proof: the line item, the expense, the amount, who confirmed and when', async () => {
  const out = await ops.confirmReserveAllocationWithEffects('p1', 'u1', 'li-1', { guidanceStepId: 'step-f' });
  assert.equal(out.guidanceReported, true);
  const done = reports[0];
  assert.deepEqual({ j: done.journeyId, s: done.stepKey, st: done.status, tool: done.sourceToolKey, et: done.sourceEntityType, id: done.sourceEntityId, actor: done.actorUserId },
    { j: 'j1', s: 'fund_capital_expense', st: 'COMPLETED', tool: 'capital-timeline', et: 'RESERVE_FUND_LINE_ITEM', id: 'li-1', actor: 'u1' });
  assert.deepEqual({ proofType: done.producedData.proofType, line: done.producedData.lineItemId, tl: done.producedData.timelineItemId, monthly: done.producedData.confirmedMonthlyCents, by: done.producedData.confirmedByUserId },
    { proofType: 'reserve_allocation_confirmation', line: 'li-1', tl: 'tl-1', monthly: 18500, by: 'u1' });
  assert.match(done.dedupeKey, /^reserve-allocation:p1:li-1:18500:/);
});

test('a journey about another expense, from another tool, a stale step or a closed journey is never reported to, but the confirmation is saved', async () => {
  for (const [stale, reason] of [
    [stepRow({ journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: null, primarySignal: { signalIntentFamily: 'financial_exposure', sourceToolKey: 'reserve-fund', sourceEntityType: 'X', sourceEntityId: 'tl-OTHER' } } }), 'WRONG_SUBJECT'],
    [stepRow({ journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: null, primarySignal: { signalIntentFamily: 'financial_exposure', sourceToolKey: 'coverage-intelligence', sourceEntityType: 'X', sourceEntityId: 'tl-1' } } }), 'WRONG_SUBJECT'],
    [stepRow({ toolKey: 'home-savings' }), 'WRONG_TOOL'], [stepRow({ stepKey: 'estimate_out_of_pocket_cost' }), 'WRONG_STEP'], [stepRow({ status: 'COMPLETED' }), 'STEP_DONE'],
    [stepRow({ journey: { id: 'j1', status: 'DISMISSED', inventoryItemId: null, primarySignal: null } }), 'JOURNEY_CLOSED'], [null, 'NOT_FOUND'],
  ]) {
    step = stale; reports.length = 0; updates.length = 0;
    const out = await ops.confirmReserveAllocationWithEffects('p1', 'u1', 'li-1', { guidanceStepId: 'step-f' });
    assert.deepEqual([out.guidanceReported, out.guidanceRefusal, reports.length, updates.length], [false, reason, 0, 1], reason);
  }
});

test('a failed report never undoes the confirmation', async () => {
  reportFails = true;
  const out = await ops.confirmReserveAllocationWithEffects('p1', 'u1', 'li-1', { guidanceStepId: 'step-f' });
  assert.deepEqual([out.guidanceReported, out.guidanceRefusal, updates.length], [false, null, 1]);
});

test('the journey step opens the capital reserve plan carrying the step, and the plan row offers the confirmation', () => {
  const mode = askGuidanceStepMode('capital-timeline', 'fund_capital_expense');
  assert.deepEqual({ m: mode.mode, o: mode.inAsk.operationId, c: mode.inAsk.carriesStep }, { m: 'IN_ASK', o: 'CAPITAL_RESERVE_PLAN', c: 'FIELD' });
  const source = fs.readFileSync(require.resolve('../../src/services/ask/handlers/capitalPlanning.handler.ts'), 'utf8');
  assert.match(source, /RESERVE_FUND_ACTION_IDS\.CONFIRM_ALLOCATION/);
});

const launch = (over = {}) => ({ actionId: RESERVE_FUND_ACTION_IDS.CONFIRM_ALLOCATION, entityId: 'li-1', sourceExecutionId: 'plan-exec', ...over });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'p1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });

test('Ask: the proposal shows the expense and the amount being confirmed, and takes the step from the reserve plan the journey opened', async () => {
  sourceLaunch = { operationId: 'CAPITAL_RESERVE_PLAN', guidanceStepId: 'step-f' };
  const result = await reserveFundCommandResult('u1', 'p1', launch());
  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  assert.deepEqual(result.confirmation.fields.map((f) => [f.label, f.value]), [['Expense', 'Furnace'], ['Suggested monthly amount', '$185.00'], ['Monthly allocation', '$185.00'], ['Target', '$9,000.00']]);
  assert.equal(result.parameters.reserveFundCommand.guidanceStepId, 'step-f');
  assert.equal(updates.length, 0, 'proposing writes nothing');
});

test('Ask: a step for another expense is remembered as refused, so nothing is reported to any journey, and the allocation can still be confirmed', async () => {
  sourceLaunch = { operationId: 'CAPITAL_RESERVE_PLAN', guidanceStepId: 'step-f' };
  step = stepRow({ journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: null, primarySignal: { signalIntentFamily: 'financial_exposure', sourceToolKey: 'reserve-fund', sourceEntityType: 'X', sourceEntityId: 'tl-OTHER' } } });
  const proposal = await reserveFundCommandResult('u1', 'p1', launch());
  assert.equal(proposal.parameters.reserveFundCommand.guidanceStepRefused, true);
  assert.equal('guidanceStepId' in proposal.parameters.reserveFundCommand && proposal.parameters.reserveFundCommand.guidanceStepId !== null, false);
  const out = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.equal(reports.length, 0);
  assert.equal(updates.length, 1);
  assert.match(out.result.blocks[0].details.find((d) => d.label === 'Guided journey').value, /not the one the journey step is about/);
});

test('Ask: confirming completes the step through the shared write; a plain confirmation from outside any journey reports nothing', async () => {
  sourceLaunch = { operationId: 'CAPITAL_RESERVE_PLAN', guidanceStepId: 'step-f' };
  const proposal = await reserveFundCommandResult('u1', 'p1', launch());
  const out = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.equal(out.result.blocks[0].title, 'Funding plan confirmed');
  assert.equal(out.result.blocks[0].details.find((d) => d.label === 'Guided journey').value, 'This step is recorded as done');
  assert.equal(reports[0].producedData.proofType, 'reserve_allocation_confirmation');
  reports.length = 0; updates.length = 0; line.allocationConfirmedAt = null; sourceLaunch = null;
  const plain = await confirmCapabilityInvoke(OP, ctx((await reserveFundCommandResult('u1', 'p1', launch({ sourceExecutionId: null }))).parameters));
  assert.equal(plain.result.status, 'COMPLETED');
  assert.deepEqual([reports.length, updates.length], [0, 1]);
  assert.equal(plain.result.blocks[0].details.some((d) => d.label === 'Guided journey'), false);
});

test('Ask: a viewer is blocked, and a retired or unknown line item is not offered', async () => {
  role = 'VIEWER';
  assert.equal((await reserveFundCommandResult('u1', 'p1', launch())).status, 'BLOCKED');
  role = 'CONTRIBUTOR'; line.status = 'RETIRED';
  assert.equal((await reserveFundCommandResult('u1', 'p1', launch())).reasonCode, 'RESERVE_FUND_LINE_ITEM_NOT_AVAILABLE');
});

test('nothing but the confirmation sets the confirmation: generic reserve writes and the recalculation never touch those fields, and the page route is the contributor-only shared write', () => {
  for (const file of ['services/homeReserveFund.service.ts', 'services/homeReserveFundCalculation.service.ts', 'services/homeReserveFundReconciliation.service.ts', 'services/ask/handlers/reserveFundCommands.handler.ts']) {
    assert.equal(/allocationConfirmed(At|ByUserId|MonthlyCents)\s*:/.test(fs.readFileSync(require.resolve(`../../src/${file}`), 'utf8')), false, `${file} must not set the confirmation`);
  }
  const routes = fs.readFileSync(require.resolve('../../src/routes/homeReserveFund.routes.ts'), 'utf8');
  assert.match(routes, /line-items\/:lineItemId\/confirm-allocation',\s*propertyAuthMiddleware,\s*requireHouseholdRole\('CONTRIBUTOR'\)/);
  assert.match(fs.readFileSync(require.resolve('../../src/controllers/homeReserveFund.controller.ts'), 'utf8'), /confirmReserveAllocationWithEffects\(/);
});

test('the homeowner can choose another positive monthly amount: it becomes the allocation, the suggestion they overrode is recorded and the parent total is recomputed', async () => {
  line.allocationSuggestedMonthlyCents = 18500;
  const out = await ops.confirmReserveAllocationWithEffects('p1', 'u1', 'li-1', { monthlyCents: 25000, expectedSuggestedCents: 18500 });
  assert.deepEqual([out.lineItem.allocatedMonthlyCents, out.lineItem.allocationConfirmedMonthlyCents, out.lineItem.allocationSuggestedMonthlyCents], [25000, 25000, 18500]);
  assert.equal(fundUpdates[0].data.recommendedMonthlyContributionCents, 25000);
});

test('zero or a non-integer amount never funds the expense, and a suggestion that changed since it was shown is refused', async () => {
  for (const monthlyCents of [0, -5, 12.5]) {
    await assert.rejects(() => ops.confirmReserveAllocationWithEffects('p1', 'u1', 'li-1', { monthlyCents }), (e) => e.code === 'RESERVE_ALLOCATION_AMOUNT_INVALID');
  }
  line.allocatedMonthlyCents = 0;
  await assert.rejects(() => ops.confirmReserveAllocationWithEffects('p1', 'u1', 'li-1'), (e) => e.code === 'RESERVE_ALLOCATION_AMOUNT_INVALID');
  line.allocatedMonthlyCents = 18500; line.allocationSuggestedMonthlyCents = 20000;
  await assert.rejects(() => ops.confirmReserveAllocationWithEffects('p1', 'u1', 'li-1', { expectedSuggestedCents: 18500 }), (e) => e.code === 'RESERVE_ALLOCATION_CHANGED');
  assert.equal(updates.length, 0);
});

test('recalculation keeps a confirmed allocation instead of replacing it', () => {
  const src = fs.readFileSync(require.resolve('../../src/services/homeReserveFundCalculation.service.ts'), 'utf8');
  assert.match(src, /if \(keptCents != null\) allocatedMonthlyCents = keptCents;/);
});
