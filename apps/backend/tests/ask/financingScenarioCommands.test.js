const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Saved financing scenarios and the equity refresh inside Ask (FRD v1.484). Extra actions of FINANCING_PROFILE_COMMAND. No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const financing = require('../../src/services/financing.service.ts');
const financialContext = require('../../src/services/financialContext/context.ts');
const scenarioCommand = require('../../src/services/ask/support/financingScenarioCommand.ts');
const profileCommand = require('../../src/services/ask/support/financingProfileCommand.ts');
const { financingFromView } = require('../../src/services/ask/handlers/financing.handler.ts');

const OP = 'FINANCING_PROFILE_COMMAND';
const IDS = scenarioCommand.FINANCING_SCENARIO_ACTION_IDS;
const T = new Date('2026-09-01T00:00:00Z');
const row = (over = {}) => ({ id: 's-1', title: 'Kitchen', status: 'SAVED', selectedOption: null, projectCostCents: 4000000, createdAt: T, updatedAt: T, ...over });

const stubs = (role, scenario = row()) => {
  const saved = {
    a: propertyAccess.resolvePropertyAccess, g: financing.getScenario, c: financing.createScenario, u: financing.updateScenario, r: financing.archiveScenario,
    e: financing.refreshEquity, l: financing.getLatestEquity, x: financialContext.getFinancialContextDecisions, q: executeOperation.reconcileAskExecutionSideEffects,
  };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  financing.getScenario = async () => scenario;
  financing.createScenario = async (...args) => { calls.push(['create', ...args]); return { id: 'new-1' }; };
  financing.updateScenario = async (...args) => { calls.push(['update', ...args]); return { count: 1 }; };
  financing.archiveScenario = async (...args) => { calls.push(['archive', ...args]); return { count: 1 }; };
  financing.refreshEquity = async (...args) => { calls.push(['refresh', ...args]); return {}; };
  financing.getLatestEquity = async () => ({ id: 'eq-1', computedAt: T });
  financialContext.getFinancialContextDecisions = async () => ({ contextVersion: 'ctx-1' });
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  const restore = () => {
    propertyAccess.resolvePropertyAccess = saved.a; financing.getScenario = saved.g; financing.createScenario = saved.c; financing.updateScenario = saved.u; financing.archiveScenario = saved.r;
    financing.refreshEquity = saved.e; financing.getLatestEquity = saved.l; financialContext.getFinancialContextDecisions = saved.x; executeOperation.reconcileAskExecutionSideEffects = saved.q;
  };
  return { calls, restore };
};
const launch = (actionId, entityId, entityType = scenarioCommand.FINANCING_SCENARIO_ENTITY_TYPE) => ({ operationId: OP, surface: 'ASK_PAGE', actionId, entityId, entityType });
const invoke = (launchContext) => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: profileCommand.FINANCING_PROFILE_COMMAND_MESSAGE, launchContext });
const ctx = (parameters, role = 'OWNER') => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });

test('the forms validate: a save needs a name, a choice must be one of the five ways to pay, a cost must be whole cents of at least a dollar', () => {
  assert.equal(scenarioCommand.parseScenarioSaveAnswer({ title: '  ' }).success, false);
  assert.equal(scenarioCommand.parseScenarioSaveAnswer({ title: 'Kitchen', userId: 'x' }).success, false);
  assert.equal(scenarioCommand.parseScenarioSaveAnswer({ title: 'Kitchen', notes: '' }).data.notes, undefined);
  assert.equal(scenarioCommand.parseScenarioChooseAnswer({ option: 'PAY_CASH' }).success, true);
  assert.equal(scenarioCommand.parseScenarioChooseAnswer({ option: 'CRYPTO' }).success, false);
  assert.equal(scenarioCommand.projectCostFromEntityId('4000000'), 4000000);
  assert.equal(scenarioCommand.projectCostFromEntityId('40.5'), null);
  assert.equal(scenarioCommand.projectCostFromEntityId('50'), null);
});

test('a contributor is refused every scenario action and nothing is written', async () => {
  const { calls, restore } = stubs('CONTRIBUTOR');
  try {
    for (const id of Object.values(IDS)) assert.equal((await invoke(launch(id, id === IDS.SAVE ? '4000000' : 's-1'))).reasonCode, 'ASK_PERMISSION_REQUIRED');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ financingScenarioCommand: { actionId: IDS.ARCHIVE, entityId: 's-1' }, financingScenarioContextVersion: 'x' }, 'CONTRIBUTOR')), (e) => e.code === 'ASK_PERMISSION_REQUIRED');
    assert.equal(calls.length, 0);
  } finally { restore(); }
});

test('save: a form seeded with the project cost, a review of name and cost, and the canonical createScenario on confirm', async () => {
  const { calls, restore } = stubs('OWNER');
  try {
    assert.equal((await invoke(launch(IDS.SAVE, '12', scenarioCommand.FINANCING_PROJECT_COST_ENTITY_TYPE))).reasonCode, 'FINANCING_SCENARIO_COST_MISSING');
    const form = await invoke(launch(IDS.SAVE, '4000000', scenarioCommand.FINANCING_PROJECT_COST_ENTITY_TYPE));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].captureKey, scenarioCommand.FINANCING_SCENARIO_CAPTURE_KEY);
    assert.match(form.captureRequests[0].currentAnswer.title, /40,000/);
    assert.equal(form.parameters.financingScenarioLaunch.actionId, IDS.SAVE);

    const { financingScenarioCommandResult } = require('../../src/services/ask/handlers/financingScenarioCommands.handler.ts');
    const review = await financingScenarioCommandResult('user-1', 'prop-1', { actionId: IDS.SAVE, entityId: '4000000', sourceExecutionId: null }, { title: 'Kitchen', notes: 'Spring' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(review.confirmation.fields.map((f) => f.label), ['Name', 'Project cost', 'Notes']);
    assert.equal(calls.length, 0);

    const out = await confirmCapabilityInvoke(OP, ctx(review.parameters));
    assert.deepEqual(calls[0].slice(0, 3), ['create', 'prop-1', 'user-1']);
    assert.deepEqual(calls[0][3], { title: 'Kitchen', notes: 'Spring', projectCostCents: 4000000, entryPoint: 'DIRECT' });
    assert.equal(calls[0][4], 'ctx-1');
    assert.equal(out.artifactId, 'new-1');
    assert.equal(out.result.blocks[0].title, 'Comparison saved');
  } finally { restore(); }
});

test('choose: a review of the exact before and after, the canonical updateScenario, and a changed or archived scenario is a conflict', async () => {
  const { calls, restore } = stubs('OWNER', row({ selectedOption: 'HELOC' }));
  try {
    const form = await invoke(launch(IDS.CHOOSE, 's-1'));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].currentAnswer.option, 'HELOC');
    const { financingScenarioCommandResult } = require('../../src/services/ask/handlers/financingScenarioCommands.handler.ts');
    const same = await financingScenarioCommandResult('user-1', 'prop-1', { actionId: IDS.CHOOSE, entityId: 's-1', sourceExecutionId: null }, { option: 'HELOC' });
    assert.equal(same.reasonCode, 'FINANCING_SCENARIO_NO_CHANGE');
    const review = await financingScenarioCommandResult('user-1', 'prop-1', { actionId: IDS.CHOOSE, entityId: 's-1', sourceExecutionId: null }, { option: 'PAY_CASH' });
    assert.deepEqual(review.confirmation.fields[1], { label: 'Way to pay', value: 'Home equity line of credit (HELOC) → Pay cash' });
    await confirmCapabilityInvoke(OP, ctx(review.parameters));
    assert.deepEqual(calls[0], ['update', 's-1', 'prop-1', { selectedOption: 'PAY_CASH' }]);

    financing.getScenario = async () => row({ selectedOption: 'PAY_CASH', updatedAt: new Date('2026-09-02T00:00:00Z') });
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(review.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    financing.getScenario = async () => row({ status: 'ARCHIVED' });
    assert.equal((await invoke(launch(IDS.CHOOSE, 's-1'))).reasonCode, 'FINANCING_SCENARIO_NOT_FOUND');
    assert.equal(calls.length, 1);
  } finally { restore(); }
});

test('archive and equity refresh: reviewed, then the canonical archiveScenario and refreshEquity', async () => {
  const { calls, restore } = stubs('OWNER');
  try {
    const archive = await invoke(launch(IDS.ARCHIVE, 's-1'));
    assert.equal(archive.status, 'NEEDS_CONFIRMATION');
    assert.equal(calls.length, 0);
    const out = await confirmCapabilityInvoke(OP, ctx(archive.parameters));
    assert.deepEqual(calls[0], ['archive', 's-1', 'prop-1']);
    assert.equal(out.result.blocks[0].title, 'Comparison archived');

    const refresh = await invoke(launch(IDS.REFRESH_EQUITY, 'prop-1', profileCommand.FINANCING_PROFILE_ENTITY_TYPE));
    assert.equal(refresh.status, 'NEEDS_CONFIRMATION');
    const done = await confirmCapabilityInvoke(OP, ctx(refresh.parameters));
    assert.deepEqual(calls[1], ['refresh', 'prop-1', 'ctx-1']);
    assert.equal(done.artifactType, 'PROPERTY_FINANCING_PROFILE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...refresh.parameters, financingScenarioContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  } finally { restore(); }
});

test('the answer offers each action to an owner only, every id is allowlisted, and the old profile edit still works beside them', () => {
  const calc = { projectCostCents: 4000000, ratesAsOf: T.toISOString(), disclaimer: 'x', helocEligible: true, helocCapacityCents: 1,
    heloc: { drawMonthlyPaymentCents: 1, repaymentMonthlyPaymentCents: 1, rateBps: 800, totalInterestCents: 1 }, homeEquityLoan: { monthlyPaymentCents: 1, termYears: 10, rateBps: 800, totalInterestCents: 1 },
    personalLoan: { scenarios: [] }, contractorFinancing: { promoMonthlyIfPaidInFullCents: 1, promoMonths: 12, warningText: 'w', ongoingAprBps: 2000, deferredInterestRiskCents: 1 },
    payCash: { opportunityCostFiveYearCents: 1, opportunityCostTenYearCents: 1, opportunityCostRateBps: 500 } };
  const scenarios = [row()];
  const view = (isOwner) => financingFromView({ profile: null, equity: null, scenarios, calc, amountDollars: 40000, propertyId: 'prop-1', isOwner });
  const owner = view(true);
  const options = owner.blocks.find((b) => b.id === 'financing-options');
  assert.deepEqual(options.actions.map((a) => [a.id, a.actionId, a.entityType, a.entityId]), [[IDS.SAVE, IDS.SAVE, 'FINANCING_PROJECT_COST', '4000000']]);
  const list = owner.blocks.find((b) => b.id === 'financing-scenarios');
  assert.deepEqual(list.sections[0].items[0].actions.map((a) => a.id), [IDS.CHOOSE, IDS.ARCHIVE]);
  assert.ok(list.sections[0].items[0].actions.every((a) => a.entityId === 's-1' && a.operationId === OP));
  const viewer = view(false);
  assert.deepEqual(viewer.blocks.find((b) => b.id === 'financing-options').actions, []);
  assert.deepEqual(viewer.blocks.find((b) => b.id === 'financing-scenarios').sections[0].items[0].actions, []);
  for (const id of Object.values(IDS)) {
    assert.equal(isAskActionApplicable({
      action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId: OP, style: 'SECONDARY' }, operationId: 'FINANCING_OVERVIEW', propertyId: 'prop-1', householdRole: 'OWNER', authoritativeSourceAvailable: true,
    }), true, id);
  }
});
