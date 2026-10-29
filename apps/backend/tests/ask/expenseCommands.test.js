const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Expenses in Ask (FRD v1.467): list, add, change and delete the expenses a homeowner recorded for a home, from the Ownership Costs answer, through
// the existing OWNERSHIP_COST_COMMAND. The writes are the home-management service's own functions, stubbed here. No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { isAskActionAllowedForHouseholdRole } = require('../../src/services/ask/askAudiencePresentation.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const evaluate = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const HomeManagement = require('../../src/services/home-management.service.ts');
const { ownershipCostReadModelService } = require('../../src/services/ownershipCosts/ownershipCostReadModel.service.ts');
const { ownershipExpensesBlock } = require('../../src/services/ask/handlers/savingsOwnership.handler.ts');
const { expenseCommandResult } = require('../../src/services/ask/handlers/expenseCommands.handler.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const x = require('../../src/services/ask/support/expenseCommand.ts');

const OP = 'OWNERSHIP_COST_COMMAND';
const MESSAGE = 'Manage this ownership cost item.';
const row = (over = {}) => ({ id: 'e1', description: 'Water bill', category: 'UTILITY', amount: '84.5', transactionDate: new Date('2026-10-01T12:00:00Z'), projectId: null, updatedAt: new Date('2026-10-02T00:00:00Z'), ...over });

const saved = { access: propertyAccess.resolvePropertyAccess, reconcile: executeOperation.reconcileAskExecutionSideEffects, prisma: { profile: prisma.homeownerProfile, expense: prisma.expense }, create: HomeManagement.createExpense, update: HomeManagement.updateExpense, del: HomeManagement.deleteExpense, current: ownershipCostReadModelService.getCurrent, evaluate: evaluate.evaluateFeatureContext };
let db; let role; let calls;
function install(over = {}) {
  db = { rows: over.rows ?? [row(), row({ id: 'e2', description: 'Roof repair', category: 'REPAIR_SERVICE', amount: '1200', projectId: 'p1' })], profile: over.noProfile ? null : { id: 'hp-1' } };
  calls = []; role = over.role ?? 'CONTRIBUTOR';
  prisma.homeownerProfile = { findFirst: async () => db.profile };
  prisma.expense = {
    findFirst: async ({ where }) => db.rows.find((r) => r.id === where.id && where.propertyId === 'prop-1' && where.homeownerProfileId === 'hp-1') ?? null,
    findMany: async () => db.rows, count: async () => db.rows.length,
  };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  HomeManagement.createExpense = async (...a) => { calls.push(['create', ...a]); return { id: 'e-new' }; };
  HomeManagement.updateExpense = async (...a) => { calls.push(['update', ...a]); return {}; };
  HomeManagement.deleteExpense = async (...a) => { calls.push(['delete', ...a]); return {}; };
}
test.beforeEach(() => install());
test.afterEach(() => { propertyAccess.resolvePropertyAccess = saved.access; executeOperation.reconcileAskExecutionSideEffects = saved.reconcile; prisma.homeownerProfile = saved.prisma.profile; prisma.expense = saved.prisma.expense; Object.assign(HomeManagement, { createExpense: saved.create, updateExpense: saved.update, deleteExpense: saved.del }); ownershipCostReadModelService.getCurrent = saved.current; evaluate.evaluateFeatureContext = saved.evaluate; });

const launch = (actionId, entityId = '', over = {}) => ({ operationId: OP, surface: 'ASK_WORKSPACE', actionId, entityId, entityType: 'OWNERSHIP_COST_ACTION', sourceExecutionId: 'exec-view', ...over });
const invoke = (actionId, entityId, accessRole = role, over = {}) => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: MESSAGE, launchContext: launch(actionId, entityId, over) }, { propertyAccess: { role: accessRole } });
const ctx = (parameters, accessRole = 'CONTRIBUTOR') => ({ userId: 'user-1', execution: { id: 'exec-w', propertyId: 'prop-1', createdAt: new Date() }, access: { role: accessRole }, parameters, command: getAskDomainCommandByOperation(OP) });
const A = x.EXPENSE_ACTION_IDS;
const writes = () => calls;

test('the form is validated: a real, past day, a positive amount rounded to cents, a closed category', () => {
  const now = new Date('2026-10-28T09:00:00Z');
  assert.deepEqual(x.parseExpenseAnswer({ description: ' Water bill ', category: 'UTILITY', amount: '84.555', transactionDate: { precision: 'EXACT_DATE', value: '2026-10-01' } }, now), { success: true, data: { description: 'Water bill', category: 'UTILITY', amount: 84.56, transactionDate: '2026-10-01' } });
  assert.deepEqual(x.parseExpenseAnswer({ description: 'x', category: 'UTILITY', amount: 5, transactionDate: '2026-12-01' }, now), { success: false, reason: 'FUTURE' });
  for (const bad of [{ category: 'UTILITY', amount: 5, transactionDate: '2026-10-01' }, { description: 'x', category: 'GIFTS', amount: 5, transactionDate: '2026-10-01' }, { description: 'x', category: 'UTILITY', amount: 0, transactionDate: '2026-10-01' }, { description: 'x', category: 'UTILITY', amount: -3, transactionDate: '2026-10-01' }, { description: 'x', category: 'UTILITY', amount: 5, transactionDate: '2026-02-31' }, { description: 'x', category: 'UTILITY', amount: 5, transactionDate: '2026-10-01', extra: 1 }]) {
    assert.equal(x.parseExpenseAnswer(bad, now).success, false, JSON.stringify(bad));
  }
  assert.equal(x.expenseTransactionDate('2026-10-01'), '2026-10-01T12:00:00.000Z');
  assert.deepEqual(x.expenseChanges({ description: 'a', category: 'UTILITY', amount: 10, transactionDate: '2026-10-01' }, { description: 'a', category: 'OTHER', amount: 12.5, transactionDate: '2026-10-01' }).map((c) => [c.label, c.before, c.after]), [['Category', 'Utility bill', 'Other'], ['Amount', '$10.00', '$12.50']]);
  assert.deepEqual(x.expenseChanges({ description: 'a', category: 'UTILITY', amount: 10, transactionDate: '2026-10-01' }, { description: 'a', category: 'UTILITY', amount: 10, transactionDate: '2026-10-01' }), []);
});

test('typing an expense request reaches Ownership Costs, not the inventory, and the actions are declared only', () => {
  for (const message of ['Show my expenses', 'Add an expense', 'Add a new expense', 'Record an expense for my water bill', 'List my recent expenses']) {
    assert.equal(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, 'OWNERSHIP_COSTS', message);
  }
  assert.equal(resolveAskRoutingCascade('Add a dishwasher', { localRoutingEnabled: true }).operation?.operationId, 'INVENTORY_ITEM_CREATE', 'adding an appliance is unchanged');
});

// ───────────────────────────── the list ─────────────────────────────

test('the list shows the caller\'s expenses with Change and Delete, leaves a project expense without actions, and a viewer gets none', () => {
  const rows = [row(), row({ id: 'e2', projectId: 'p1', description: 'Roof project' })];
  const block = ownershipExpensesBlock({ rows, total: 12 }, true);
  assert.equal(block.id, 'ownership-cost-expenses');
  assert.match(block.description, /newest 2 of 12/);
  const [plain, project] = block.sections[0].items;
  assert.deepEqual(plain.meta, ['Utility bill', '$84.50', '2026-10-01']);
  assert.deepEqual(plain.actions.map((a) => [a.id, a.entityId, a.operationId, a.interactionType]), [[A.EDIT, 'e1', OP, 'MUTATE_RECORD'], [A.DELETE, 'e1', OP, 'MUTATE_RECORD']]);
  assert.deepEqual(project.actions, []);
  assert.ok(project.meta.includes('From a project'));
  assert.deepEqual(block.actions.map((a) => [a.id, a.label, a.message, a.interactionType]), [[A.ADD, 'Add an expense', MESSAGE, 'START_WORKFLOW']]);
  const viewer = ownershipExpensesBlock({ rows, total: 2 }, false);
  assert.deepEqual([viewer.actions, viewer.sections[0].items.flatMap((i) => i.actions)], [[], []]);
  assert.equal(ownershipExpensesBlock({ rows: [], total: 0 }, false), null);
  assert.match(ownershipExpensesBlock({ rows: [], total: 0 }, true).description, /not recorded an expense/);
});

// ───────────────────────────── add ─────────────────────────────

test('Add opens the form with the category a correction chose, reviews exactly what will be recorded, and writes nothing yet', async () => {
  const form = await invoke(A.ADD, 'UTILITY');
  assert.equal(form.status, 'NEEDS_CONTEXT');
  assert.equal(form.captureRequests[0].captureKey, x.EXPENSE_CAPTURE_KEY);
  assert.deepEqual(form.captureRequests[0].inputSchema.fields.map((f) => [f.key, f.required]), [['description', true], ['category', true], ['amount', true], ['transactionDate', true]]);
  assert.deepEqual(form.captureRequests[0].currentAnswer, { category: 'UTILITY' });
  assert.equal(form.captureRequests[0].inputSchema.fields[3].inputSchema.allowFuture, false);
  assert.deepEqual((await invoke(A.ADD, '')).captureRequests[0].currentAnswer, {});
  const review = await expenseCommandResult('user-1', 'prop-1', { actionId: A.ADD, entityId: 'UTILITY', sourceExecutionId: 'exec-view' }, { description: 'Water bill', category: 'UTILITY', amount: 84.5, transactionDate: '2026-10-01' });
  assert.equal(review.status, 'NEEDS_CONFIRMATION');
  assert.equal(review.confirmation.confirmLabel, 'Record expense');
  assert.deepEqual(review.confirmation.fields.map((f) => [f.label, f.value]), [['For', 'Water bill'], ['Category', 'Utility bill'], ['Amount', '$84.50'], ['Date paid', review.confirmation.fields[3].value]]);
  assert.deepEqual(writes(), []);
  assert.equal((await expenseCommandResult('user-1', 'prop-1', { actionId: A.ADD }, { description: 'x', category: 'UTILITY', amount: 5, transactionDate: '2999-01-01' })).reasonCode, 'EXPENSE_FUTURE_DATE');
  assert.equal((await expenseCommandResult('user-1', 'prop-1', { actionId: A.ADD }, { description: '', category: 'UTILITY', amount: 5, transactionDate: '2026-10-01' })).reasonCode, 'EXPENSE_INPUT_INVALID');
});

test('confirming Add calls the canonical create under the caller\'s profile, with midday UTC, and returns to the totals', async () => {
  const review = await expenseCommandResult('user-1', 'prop-1', { actionId: A.ADD }, { description: 'Water bill', category: 'UTILITY', amount: 84.5, transactionDate: '2026-10-01' });
  const out = await confirmCapabilityInvoke(OP, ctx(review.parameters));
  assert.deepEqual(writes(), [['create', 'hp-1', { propertyId: 'prop-1', description: 'Water bill', category: 'UTILITY', amount: 84.5, transactionDate: '2026-10-01T12:00:00.000Z' }]]);
  assert.equal(out.result.blocks[0].title, 'Expense recorded');
  assert.equal(out.result.blocks[0].actions[0].operationId, 'OWNERSHIP_COSTS');
  assert.equal(out.artifactType, 'EXPENSE');
  assert.equal(out.artifactId, 'e-new');
});

// ───────────────────────────── change and delete ─────────────────────────────

test('Change opens the form with what is recorded, reviews only what changed, and refuses no change', async () => {
  const form = await invoke(A.EDIT, 'e1');
  assert.deepEqual(form.captureRequests[0].currentAnswer, { description: 'Water bill', category: 'UTILITY', amount: 84.5, transactionDate: '2026-10-01' });
  const review = await expenseCommandResult('user-1', 'prop-1', { actionId: A.EDIT, entityId: 'e1' }, { description: 'Water bill', category: 'UTILITY', amount: 90, transactionDate: '2026-10-01' });
  assert.equal(review.status, 'NEEDS_CONFIRMATION');
  assert.deepEqual(review.confirmation.fields.map((f) => [f.label, f.value]), [['Expense', 'Water bill'], ['Amount', '$84.50 → $90.00']]);
  assert.equal((await expenseCommandResult('user-1', 'prop-1', { actionId: A.EDIT, entityId: 'e1' }, { description: 'Water bill', category: 'UTILITY', amount: 84.5, transactionDate: '2026-10-01' })).reasonCode, 'EXPENSE_EDIT_NO_CHANGE');
  assert.deepEqual(writes(), []);
  const out = await confirmCapabilityInvoke(OP, ctx(review.parameters));
  assert.deepEqual(writes(), [['update', 'e1', 'hp-1', { description: 'Water bill', category: 'UTILITY', amount: 90, transactionDate: '2026-10-01T12:00:00.000Z' }]]);
  assert.equal(out.result.blocks[0].title, 'Expense changed');
});

test('Delete is cautioned, confirmed, and the canonical delete runs; a changed or vanished expense is refused', async () => {
  const review = await invoke(A.DELETE, 'e1');
  assert.equal(review.blocks[0].tone, 'CAUTION');
  assert.match(review.confirmation.description, /cannot be undone/);
  assert.deepEqual(writes(), []);
  await confirmCapabilityInvoke(OP, ctx(review.parameters));
  assert.deepEqual(writes(), [['delete', 'e1', 'hp-1']]);
  db.rows[0] = row({ updatedAt: new Date('2026-10-05T00:00:00Z') });
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(review.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  db.rows = [];
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(review.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
});

test('only the caller\'s own, non-project expenses can be changed; a viewer and an account with no profile cannot change any', async () => {
  assert.equal((await invoke(A.EDIT, 'someone-elses')).reasonCode, 'EXPENSE_NOT_FOUND');
  assert.equal((await invoke(A.DELETE, 'e2')).reasonCode, 'EXPENSE_FROM_PROJECT');
  assert.equal((await invoke(A.EDIT, 'e2')).reasonCode, 'EXPENSE_FROM_PROJECT');
  role = 'VIEWER';
  for (const action of [A.ADD, A.EDIT, A.DELETE]) assert.equal((await invoke(action, 'e1', 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED', action);
  install({ noProfile: true });
  assert.equal((await invoke(A.ADD, '')).reasonCode, 'EXPENSE_NO_HOMEOWNER_PROFILE');
  assert.deepEqual(writes(), []);
});

test('confirming refuses a viewer, and a database "not found" at write time reads as a changed expense', async () => {
  const review = await invoke(A.DELETE, 'e1');
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(review.parameters, 'VIEWER')), (e) => e.code === 'ASK_PERMISSION_REQUIRED');
  HomeManagement.deleteExpense = async () => { throw Object.assign(new Error('Record to delete does not exist.'), { code: 'P2025' }); };
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(review.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
});

test('the actions are declared-only on the command, allowlisted and refused to a viewer; the older ownership actions still work', async () => {
  assert.equal((await capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: MESSAGE, launchContext: launch(A.ADD, '', { surface: 'ASK_REFRESH' }) }, { propertyAccess: { role } })).reasonCode, 'OWNERSHIP_COST_ACTION_REQUIRED');
  assert.equal((await capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: 'add an expense', launchContext: launch(A.ADD) }, { propertyAccess: { role } })).reasonCode, 'OWNERSHIP_COST_ACTION_REQUIRED');
  const add = { id: A.ADD, label: 'Add an expense', interactionType: 'START_WORKFLOW', message: MESSAGE, operationId: OP, style: 'PRIMARY' };
  assert.equal(isAskActionApplicable({ action: add, operationId: 'OWNERSHIP_COSTS', propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true);
  for (const id of Object.values(A)) {
    const action = { ...add, id };
    assert.equal(isAskActionAllowedForHouseholdRole(action, 'CONTRIBUTOR'), true, id);
    assert.equal(isAskActionAllowedForHouseholdRole(action, 'VIEWER'), false, id);
  }
  const scenario = await capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: MESSAGE, launchContext: launch('ownership-cost-create-scenario', '') }, { propertyAccess: { role } });
  assert.equal(scenario.reasonCode, 'OWNERSHIP_COST_SCENARIO_INPUT_REQUIRED', 'the existing scenario action is unchanged');
});

// ───────────────────────────── the Ownership Costs answer carries it ─────────────────────────────

const category = (name, over = {}) => ({ category: name, label: name, includedInSelectedLens: true, applicability: 'APPLICABLE', amountCents: null, monthlyAmountCents: null, missingDependencies: [], amountKind: 'MISSING', freshnessStatus: 'CURRENT', sourceDomain: null, evidenceStatus: null, periodEnd: null, ...over });
function installOwnership() {
  evaluate.evaluateFeatureContext = async () => ({ requirements: [], contextVersion: 'ctx-1' });
  ownershipCostReadModelService.getCurrent = async () => ({
    snapshot: { monthlyTotalCents: 50000, annualTotalCents: 600000, coverageStatus: 'CREDIBLE', lastKnownGood: false, calculatedAt: new Date('2026-10-28T00:00:00Z').toISOString() },
    stale: { isStale: false }, evidenceSummary: { confirmedAnnualCents: 600000, estimatedAnnualCents: 0, staleCategoryCount: 0, pendingConfirmationCount: 0 }, coverage: { includedCategoryCount: 1, confirmedCategoryCount: 1, estimatedCategoryCount: 0, missingCategoryCount: 4, notApplicableCategoryCount: 0, confirmedAnnualCents: 600000, estimatedAnnualCents: 0, staleCategoryCount: 0, pendingConfirmationCount: 0 }, rankedAction: null,
    categories: [
      category('PROPERTY_TAX', { amountCents: 600000, monthlyAmountCents: 50000, amountKind: 'CONFIRMED' }),
      category('UTILITIES'), category('HOA'), category('KNOWN_REPAIR'), category('INSURANCE'),
    ],
  });
}
const ask = (message, accessRole = role) => capabilityInvoke('OWNERSHIP_COSTS', { userId: 'user-1', propertyId: 'prop-1', message, launchContext: null }, { propertyAccess: { role: accessRole } });
const block = (result, id) => result.blocks.find((b) => b.id === id);

test('a missing category an expense feeds offers Add an expense with that category chosen; the others do not', async () => {
  installOwnership();
  const result = await ask('How much does my home cost?');
  for (const answerBlock of result.blocks) {
    const parsed = AskPresentationBlockSchema.safeParse(answerBlock);
    assert.ok(parsed.success, `${answerBlock.id} must satisfy the persisted presentation contract: ${parsed.success ? '' : JSON.stringify(parsed.error.issues)}`);
  }
  const items = Object.fromEntries(block(result, 'ownership-cost-missing').sections[0].items.map((item) => [item.id, item.actions.map((a) => [a.id, a.label, a.entityId])]));
  assert.deepEqual(items.UTILITIES.slice(1), [[A.ADD, 'Add a utility expense', 'UTILITY']]);
  assert.deepEqual(items.HOA.slice(1), [[A.ADD, 'Add an HOA fee', 'HOA_FEE']]);
  assert.deepEqual(items.KNOWN_REPAIR.slice(1), [[A.ADD, 'Add a repair expense', 'REPAIR_SERVICE']]);
  assert.equal(items.INSURANCE.length, 1, 'insurance is fed by policy terms, not expenses');
  assert.ok(block(result, 'ownership-cost-expenses'), 'the list is part of the answer');
  assert.equal(result.blocks[0].id, 'ownership-costs-summary');
  assert.equal(block(result, 'ownership-cost-expenses').actions[0].entityId, undefined, 'a home-level Add action does not persist an empty entity id');
  assert.doesNotMatch(result.blocks[0].title, /You recorded/);
  role = 'VIEWER';
  const viewer = await ask('How much does my home cost?', 'VIEWER');
  assert.equal(JSON.stringify(viewer.blocks).includes(A.ADD), false, 'a viewer is offered no expense action');
});

test('asking for the expenses leads with how many were recorded, and the Add action is on the list', async () => {
  installOwnership();
  const result = await ask('Show my expenses');
  assert.equal(result.blocks[0].title, 'You recorded 2 expenses for this home');
  assert.deepEqual(block(result, 'ownership-cost-expenses').actions.map((a) => a.id), [A.ADD]);
});
