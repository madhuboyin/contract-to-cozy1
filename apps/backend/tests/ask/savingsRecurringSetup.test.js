const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register/transpile-only');

// Recurring-cost setup from Ask (parity with the desktop Recurring costs tab). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { HomeSavingsService } = require('../../src/services/homeSavings.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const setup = require('../../src/services/ask/support/savingsRecurringSetup.ts');
const commands = require('../../src/services/ask/support/savingsBenefitCommand.ts');
const { recurringSetupResult } = require('../../src/services/ask/handlers/savingsRecurringSetup.handler.ts');
const { savingsRecurringSetupBlock } = require('../../src/services/ask/handlers/savingsOwnership.handler.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');

const OP = 'SAVINGS_BENEFIT_COMMAND';
const M = commands.SAVINGS_COMMAND_MESSAGES;
const UPDATED = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const planVersion = (category, account) => sha(`savings:PLAN:${category}:${account?.id ?? 'none'}:${account?.updatedAt.toISOString() ?? ''}`);
const FORM = { providerName: 'Comcast', planName: 'Gigabit', billingCadence: 'MONTHLY', amount: 89.99, contractEndDate: '2027-03-01', speedTier: '1000 Mbps' };

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withData({ primary = true, account = null } = {}) {
  const saved = { p: prisma.property, a: prisma.homeSavingsAccount, u: HomeSavingsService.prototype.upsertAccount, r: HomeSavingsService.prototype.runComparison, x: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  prisma.property = { findFirst: async () => (primary ? { id: 'prop-1' } : null) };
  prisma.homeSavingsAccount = { findFirst: async () => account, findMany: async () => (account ? [account] : []) };
  HomeSavingsService.prototype.upsertAccount = async function (...args) { calls.push(['upsertAccount', ...args]); return { account: {} }; };
  HomeSavingsService.prototype.runComparison = async function (...args) { calls.push(['runComparison', ...args]); return { runId: 'r1' }; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { prisma.property = saved.p; prisma.homeSavingsAccount = saved.a; HomeSavingsService.prototype.upsertAccount = saved.u; HomeSavingsService.prototype.runComparison = saved.r; executeOperation.reconcileAskExecutionSideEffects = saved.x; } };
}
const invoke = (kind, entityId, role = 'OWNER', over = {}) => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: M[kind], launchContext: { operationId: OP, surface: 'ASK_PAGE', entityId, entityType: commands.savingsCommandEntityType(kind), ...over } }, { propertyAccess: { role } });
const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'OWNER' }, parameters, command: getAskDomainCommandByOperation(OP) });
const account = { id: 'acc-1', providerName: 'Comcast', planName: 'Old plan', billingCadence: 'MONTHLY', amount: 99, renewalDate: null, contractEndDate: new Date('2027-01-01T00:00:00Z'), usageJson: { speedTier: '500 Mbps' }, planDetailsJson: null, updatedAt: UPDATED };

test('the form is the desktop form: amount and billing period required, the optional fields only where the category asks, nothing else', () => {
  const p = setup.parseSavingsPlanAnswer;
  assert.equal(p('INTERNET', FORM).success, true);
  assert.equal(p('INTERNET', { billingCadence: 'MONTHLY' }).success, false, 'the amount is required');
  assert.equal(p('INTERNET', { ...FORM, amount: -1 }).success, false);
  assert.equal(p('INTERNET', { ...FORM, billingCadence: 'WEEKLY' }).success, false);
  assert.equal(p('HOME_INSURANCE', { billingCadence: 'ANNUAL', amount: 1800, renewalDate: '2027-02-01' }).success, true);
  assert.equal(p('HOME_INSURANCE', { billingCadence: 'ANNUAL', amount: 1800, speedTier: '1 Gbps' }).success, false, 'a field the category does not ask for is refused');
  assert.equal(p('ELECTRICITY_GAS', { billingCadence: 'MONTHLY', amount: 140, rateType: 'FIXED', usageKwh: 850 }).success, true);
  assert.equal(p('ELECTRICITY_GAS', { billingCadence: 'MONTHLY', amount: 140, renewalDate: '2027-02-01' }).success, false);
  assert.equal(p('INTERNET', { ...FORM, accountNumberMasked: '1234' }).success, false, 'an account number is not collected');
});

test('the payload is the desktop buildPayload: dates as ISO, speed in usage, rate type in plan details, monthly kWh in usage', () => {
  assert.deepEqual(setup.savingsPlanPayload('INTERNET', setup.parseSavingsPlanAnswer('INTERNET', FORM).data), {
    providerName: 'Comcast', planName: 'Gigabit', billingCadence: 'MONTHLY', amount: 89.99, contractEndDate: '2027-03-01T00:00:00.000Z', usageJson: { speedTier: '1000 Mbps' },
  });
  assert.deepEqual(setup.savingsPlanPayload('ELECTRICITY_GAS', setup.parseSavingsPlanAnswer('ELECTRICITY_GAS', { billingCadence: 'MONTHLY', amount: 140, rateType: 'VARIABLE', usageKwh: '850' }).data), {
    billingCadence: 'MONTHLY', amount: 140, planDetailsJson: { rateType: 'VARIABLE' }, usageJson: { kwhMonthly: 850 },
  });
});

test('both kinds are declared-action, category-level steps and are never routed from typed text', () => {
  assert.equal(commands.savingsCommandKindFromMessage(M.PLAN), 'PLAN');
  assert.equal(commands.savingsCommandKindFromMessage(M.CHECK), 'CHECK');
  assert.equal(commands.savingsCommandEntityType('PLAN'), setup.SAVINGS_RECURRING_CATEGORY_ENTITY_TYPE);
  assert.equal(commands.savingsCommandEntityType('SAVE'), commands.SAVINGS_AVAILABLE_ENTITY_TYPE, 'the opportunity kinds are unchanged');
  for (const message of [M.PLAN, M.CHECK]) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
});

test('viewers and non-primary owners are refused, a misrouted launch is not routable, and an unknown category is refused', async () => {
  let w = withData(); let restoreRole = withRole('VIEWER');
  try {
    assert.equal((await invoke('PLAN', 'INTERNET', 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
    restoreRole(); restoreRole = withRole('CONTRIBUTOR'); w.restore(); w = withData({ primary: false });
    assert.equal((await invoke('PLAN', 'INTERNET', 'CONTRIBUTOR')).reasonCode, 'SAVINGS_BENEFIT_PRIMARY_OWNER_ONLY');
    assert.equal((await invoke('CHECK', setup.SAVINGS_RECURRING_ALL, 'CONTRIBUTOR')).reasonCode, 'SAVINGS_BENEFIT_PRIMARY_OWNER_ONLY');
    restoreRole(); restoreRole = withRole('OWNER'); w.restore(); w = withData();
    assert.equal((await invoke('PLAN', 'INTERNET', 'OWNER', { surface: 'ASK_REFRESH' })).reasonCode, 'ASK_SAVINGS_BENEFIT_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('PLAN', 'INTERNET', 'OWNER', { entityType: commands.SAVINGS_AVAILABLE_ENTITY_TYPE })).reasonCode, 'ASK_SAVINGS_BENEFIT_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('PLAN', 'WATER')).reasonCode, 'SAVINGS_CATEGORY_NOT_FOUND');
    assert.equal(w.calls.length, 0);
  } finally { restoreRole(); w.restore(); }
});

test('the plan form opens empty for a new plan and prefilled from the saved one; the review says what it does and saves nothing', async () => {
  const restoreRole = withRole('OWNER'); let w = withData();
  try {
    const empty = await invoke('PLAN', 'INTERNET');
    assert.equal(empty.status, 'NEEDS_CONTEXT');
    assert.equal(empty.captureRequests[0].captureKey, setup.SAVINGS_RECURRING_PLAN_CAPTURE_KEY);
    assert.deepEqual(empty.captureRequests[0].currentAnswer, {});
    assert.deepEqual(empty.captureRequests[0].inputSchema.fields.map((field) => field.key), ['providerName', 'planName', 'billingCadence', 'amount', 'contractEndDate', 'speedTier']);
    w.restore(); w = withData({ account });
    const filled = await invoke('PLAN', 'INTERNET');
    assert.deepEqual(filled.captureRequests[0].currentAnswer, { providerName: 'Comcast', planName: 'Old plan', billingCadence: 'MONTHLY', amount: 99, contractEndDate: '2027-01-01', speedTier: '500 Mbps' });
    assert.equal(filled.contextVersion, planVersion('INTERNET', account));
    const review = await recurringSetupResult('user-1', 'prop-1', { kind: 'PLAN', entityId: 'INTERNET', sourceExecutionId: null }, setup.parseSavingsPlanAnswer('INTERNET', FORM).data);
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /compares it with benchmarks.*refreshes your savings list.*estimate, not a quote.*nothing is sent to a provider/);
    assert.equal(review.confirmation.confirmLabel, 'Update the plan');
    assert.ok(review.confirmation.fields.some((field) => field.label === 'You pay' && field.value === '$89.99 monthly'));
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); restoreRole(); }
});

test('confirming a plan calls the canonical upsert once with the desktop payload; stale and invalid steps write nothing; a failed follow-up is disclosed', async () => {
  const restoreRole = withRole('OWNER'); const w = withData({ account });
  try {
    const parameters = (over = {}) => ({ savingsCommand: { kind: 'PLAN', entityId: 'INTERNET' }, savingsContextVersion: planVersion('INTERNET', account), savingsPlan: FORM, ...over });
    const done = await confirmCapabilityInvoke(OP, ctx(parameters()));
    assert.deepEqual(w.calls[0].slice(0, 4), ['upsertAccount', 'prop-1', 'INTERNET', 'user-1']);
    assert.equal(w.calls[0][4].amount, 89.99);
    assert.equal(done.result.reasonCode, 'SAVINGS_RECURRING_PLAN_COMPLETED');
    assert.equal(done.result.blocks[0].title, 'Plan updated');
    const reject = (over) => assert.rejects(() => confirmCapabilityInvoke(OP, ctx(parameters(over))), (error) => ['ASK_CONTEXT_VERSION_CONFLICT', 'ASK_CONFIRMATION_NOT_ACTIVE'].includes(error.code));
    await reject({ savingsContextVersion: 'old' });
    await reject({ savingsPlan: { billingCadence: 'MONTHLY' } });
    await reject({ savingsPlan: { ...FORM, renewalDate: '2027-01-01', speedTier: undefined, contractEndDate: undefined }, savingsCommand: { kind: 'PLAN', entityId: 'INTERNET' } });
    assert.equal(w.calls.length, 1);
    HomeSavingsService.prototype.upsertAccount = async () => { throw new Error('Account saved, but Savings & Benefits reevaluation could not be queued.'); };
    const partial = await confirmCapabilityInvoke(OP, ctx(parameters()));
    assert.ok(partial.result.blocks.some((block) => block.type === 'LIMITATION' && /could not be queued/.test(block.body)), 'the saved plan is not reported as a failure');
  } finally { w.restore(); restoreRole(); }
});

test('check re-runs one category or all through the canonical run, says nothing is sent to a provider, and is stale-protected', async () => {
  const restoreRole = withRole('OWNER'); const w = withData({ account });
  try {
    const review = await invoke('CHECK', setup.SAVINGS_RECURRING_ALL);
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /estimates, not quotes, and nothing is sent to a provider/);
    const version = sha(`savings:CHECK:ALL:acc-1@${UPDATED.toISOString()}`);
    assert.equal(review.contextVersion, version);
    await confirmCapabilityInvoke(OP, ctx({ savingsCommand: { kind: 'CHECK', entityId: 'ALL' }, savingsContextVersion: version }));
    assert.equal(w.calls[0][0], 'runComparison');
    assert.deepEqual(w.calls[0].slice(1, 4), ['prop-1', 'user-1', {}]);
    await confirmCapabilityInvoke(OP, ctx({ savingsCommand: { kind: 'CHECK', entityId: 'INTERNET' }, savingsContextVersion: sha(`savings:CHECK:INTERNET:acc-1@${UPDATED.toISOString()}`) }));
    assert.deepEqual(w.calls[1].slice(3, 4), [{ categoryKey: 'INTERNET' }]);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ savingsCommand: { kind: 'CHECK', entityId: 'ALL' }, savingsContextVersion: 'old' })), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(w.calls.length, 2);
  } finally { w.restore(); restoreRole(); }
});

test('the answer always lists the four costs with Set up or Update, Check appears once a plan is saved, and utility focus lists electricity only', () => {
  const entry = (key, extra = {}) => ({ category: { key }, status: 'NOT_SET_UP', account: null, topOpportunity: null, ...extra });
  const categories = [entry('HOME_INSURANCE'), entry('HOME_WARRANTY'), entry('INTERNET', { status: 'FOUND_SAVINGS', account: { providerName: 'Comcast', planName: 'Gigabit', amount: 89.99, billingCadence: 'MONTHLY', renewalDate: null } }), entry('ELECTRICITY_GAS')];
  const block = savingsRecurringSetupBlock(categories, { utilityFocus: false, canChange: true });
  const items = block.sections[0].items;
  assert.deepEqual(items.map((item) => item.title), ['Home insurance', 'Home warranty', 'Internet', 'Electricity and gas']);
  assert.deepEqual(items.map((item) => item.actions[0].label), ['Set up plan', 'Set up plan', 'Update plan', 'Set up plan']);
  assert.deepEqual(items[2].meta, ['Plan saved', '$89.99 monthly', 'Possible saving found']);
  assert.equal(items[0].description, 'Not set up yet. Add what you pay now and Ask will compare it.');
  assert.equal(block.actions.length, 1);
  assert.deepEqual([block.actions[0].entityId, block.actions[0].message], [setup.SAVINGS_RECURRING_ALL, M.CHECK]);
  assert.equal(savingsRecurringSetupBlock(categories.map((c) => ({ ...c, account: null })), { utilityFocus: false, canChange: true }).actions.length, 0, 'no saved plan, nothing to check yet');
  assert.deepEqual(savingsRecurringSetupBlock(categories, { utilityFocus: true, canChange: true }).sections[0].items.map((item) => item.title), ['Electricity and gas']);
  assert.equal(savingsRecurringSetupBlock(categories, { utilityFocus: false, canChange: false }), null, 'someone who cannot change it is not shown the actions');
  assert.ok(AskPresentationBlockSchema.safeParse(block).success);
});

test('the setup block and its action ids survive the answer-trust validator for the savings answer', () => {
  const categories = [{ category: { key: 'INTERNET' }, status: 'CONNECTED', account: { providerName: 'Comcast', amount: 90, billingCadence: 'MONTHLY' }, topOpportunity: null }];
  const block = savingsRecurringSetupBlock(categories, { utilityFocus: false, canChange: true });
  const result = { status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 'savings-summary', title: 'Here is the current savings picture for this home', body: 'Estimates are planning signals.', tone: 'DEFAULT', actions: [] }, block], suggestions: [],
    parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'savings.opportunities', operationId: 'SAVINGS_OPPORTUNITIES', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-26T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Where could I save money on this home?', operationId: 'SAVINGS_OPPORTUNITIES', result, propertyId: 'prop-1' });
  const kept = validated.blocks.find((entry) => entry.id === 'savings-recurring-setup');
  assert.deepEqual(kept.sections[0].items[0].actions.map((action) => action.id), ['savings-recurring-plan']);
  assert.deepEqual(kept.actions.map((action) => action.id), ['savings-recurring-check']);
  for (const id of Object.values({ plan: commands.SAVINGS_COMMAND_ACTION_IDS.PLAN, check: commands.SAVINGS_COMMAND_ACTION_IDS.CHECK })) {
    assert.equal(isAskActionApplicable({ action: { id, label: 'x', interactionType: 'MUTATE_RECORD', message: 'm', operationId: OP, style: 'SECONDARY' }, operationId: 'SAVINGS_OPPORTUNITIES', propertyId: 'prop-1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true, id);
  }
});
