const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { SuggestedNextActionSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { SuggestedNextActionCandidateSchema } = require('../../src/services/ask/suggestedActions/suggestedNextActionCandidate.ts');
const { maintenanceUndoCandidates, maintenanceUpdateAction, maintenanceTaskUpdateResult, maintenanceTaskVersion } = require('../../src/services/ask/handlers/maintenance.handler.ts');
const { maintenanceTaskVersion: leafVersion } = require('../../src/services/ask/suggestedActions/domainVersions.ts');
const { isRegisteredOutcome } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { finalizeSuggestedNextActionsWithReport } = require('../../src/services/ask/suggestedActions/finalizeSuggestedNextActions.ts');
const { fixedSuggestedNextActionClock } = require('../../src/services/ask/suggestedActions/suggestedNextActionClock.ts');
const { getSuggestedNextActionEntityValidator } = require('../../src/services/ask/suggestedActions/suggestedNextActionEntityValidators.ts');
const { PropertyMaintenanceTaskService } = require('../../src/services/PropertyMaintenanceTask.service.ts');

// ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN Appendix C, maintenance: undo chips on the update receipt.

const NOW = new Date('2026-10-04T12:00:00.000Z');
const UPDATED = new Date('2026-10-04T11:00:00.000Z');
const task = (over = {}) => ({ id: 'task-1', title: 'Clean gutters', status: 'CANCELLED', updatedAt: UPDATED, snoozedUntil: null, ...over });

test('a cancelled task offers Reopen and a snoozed task offers Resume reminders, each on the exact task', () => {
  const [reopen] = maintenanceUndoCandidates(task(), { propertyId: 'prop-1', undo: 'REOPEN' });
  const [resume] = maintenanceUndoCandidates(task({ status: 'PENDING', snoozedUntil: new Date('2026-10-11') }), { propertyId: 'prop-1', undo: 'UNSNOOZE' });
  for (const candidate of [reopen, resume]) {
    assert.ok(SuggestedNextActionCandidateSchema.safeParse(candidate).success, JSON.stringify(candidate));
    assert.equal(candidate.operationId, 'MAINTENANCE_TASK_UPDATE');
    assert.equal(candidate.interactionType, 'MUTATE_RECORD');
    assert.equal(candidate.tier, 'RECORD_ACTION');
    assert.equal(candidate.entityContext.entityType, 'MAINTENANCE_TASK');
    assert.equal(candidate.entityContext.entityId, 'task-1');
    assert.ok(isRegisteredOutcome('MAINTENANCE_TASK_UPDATE', candidate.outcomeKey));
  }
  assert.equal(reopen.outcomeKey, 'REOPEN_TASK');
  assert.equal(reopen.label, 'Reopen Clean gutters');
  assert.equal(resume.outcomeKey, 'RESUME_REMINDERS');
  assert.equal(resume.label, 'Resume reminders for Clean gutters');
});

test('the version a candidate stamps is the one the validator compares, and a long title stays within the label limit', () => {
  const t = task();
  assert.equal(maintenanceTaskVersion(t), leafVersion(t));
  assert.equal(maintenanceUndoCandidates(t, { propertyId: 'p', undo: 'REOPEN' })[0].entityContext.contextVersion, leafVersion(t));
  const [long] = maintenanceUndoCandidates(task({ title: 'Annual professional inspection and flushing of the whole-house water heater and expansion tank' }), { propertyId: 'p', undo: 'UNSNOOZE' });
  assert.ok(long.label.length <= 80 && SuggestedNextActionCandidateSchema.safeParse(long).success, long.label);
});

test('a selected action picks its update action from the outcome, never from the message', () => {
  assert.equal(maintenanceUpdateAction('Reopen the maintenance task "Remove old paint".'), 'DELETE', 'free text alone still keyword-matches');
  assert.equal(maintenanceUpdateAction('Reopen the maintenance task "Remove old paint".', 'REOPEN_TASK'), 'REOPEN');
  assert.equal(maintenanceUpdateAction('anything', 'RESUME_REMINDERS'), 'UNSNOOZE');
  assert.equal(maintenanceUpdateAction('Cancel this maintenance task.', 'NOT_AN_OUTCOME'), 'ARCHIVE', 'an unknown outcome falls back to free text');
});

// ---- the target operation, executed with stubbed reads -------------------------------------------------------------------

test('a selected Reopen on a task named "Urgent: remove old paint" proposes a plain reopen, with no priority or delete', async () => {
  const cancelled = { id: 'task-1', propertyId: 'prop-1', title: 'Urgent: remove old paint', status: 'CANCELLED', priority: 'LOW', source: 'USER', nextDueDate: null, isRecurring: false, frequency: null, updatedAt: UPDATED, snoozedUntil: null, assignedTo: null };
  const originals = [prisma.householdMember.findUnique, prisma.householdMember.findMany, PropertyMaintenanceTaskService.getTasksForProperty];
  prisma.householdMember.findUnique = async () => ({ role: 'OWNER', isPrimaryOwner: true });
  prisma.householdMember.findMany = async () => [];
  PropertyMaintenanceTaskService.getTasksForProperty = async () => [cancelled];
  try {
    const message = 'Reopen the maintenance task "Urgent: remove old paint".';
    const result = await maintenanceTaskUpdateResult('u1', 'prop-1', message, 'task-1', null, 'REOPEN_TASK');
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    assert.equal(result.parameters.maintenanceUpdate.action, 'REOPEN');
    assert.equal(result.parameters.maintenanceUpdate.priority, undefined);
    assert.ok(!result.confirmation.fields.some((f) => f.label === 'New priority'));
    // Without the outcome the same message is read as a delete with an URGENT priority.
    const guessed = await maintenanceTaskUpdateResult('u1', 'prop-1', message, 'task-1', null, null);
    assert.equal(guessed.parameters.maintenanceUpdate.action, 'DELETE');
  } finally {
    [prisma.householdMember.findUnique, prisma.householdMember.findMany, PropertyMaintenanceTaskService.getTasksForProperty] = originals;
    prisma.householdMember.findUnique = originals[0]; prisma.householdMember.findMany = originals[1]; PropertyMaintenanceTaskService.getTasksForProperty = originals[2];
  }
});

// ---- finalizer with the real validator ----------------------------------------------------------------------------------------

const clock = fixedSuggestedNextActionClock(NOW);
const finalize = (candidates, availability = null) => finalizeSuggestedNextActionsWithReport(
  { result: { status: 'COMPLETED', blocks: [], suggestions: ['What maintenance is pending?'], suggestedNextActionCandidates: candidates }, executionId: 'exec-1', userId: 'u1', sessionId: 's1', propertyId: 'prop-1', operationId: 'MAINTENANCE_TASK_UPDATE', message: 'Cancel this maintenance task.' },
  { clock, loadOperationAvailability: async () => new Map([['MAINTENANCE_TASK_UPDATE', availability]]), loadExecutionExpiresAt: async () => null },
);
const withTasks = async (rows, fn) => {
  const original = prisma.propertyMaintenanceTask.findMany;
  let calls = 0;
  prisma.propertyMaintenanceTask.findMany = async (args) => { calls += 1; return rows.filter((row) => args.where.id.in.includes(row.id) && (!args.where.propertyId || args.where.propertyId === row.propertyId)); };
  try { return await fn(() => calls); } finally { prisma.propertyMaintenanceTask.findMany = original; }
};
const row = (over = {}) => ({ id: 'task-1', propertyId: 'prop-1', status: 'CANCELLED', updatedAt: UPDATED, snoozedUntil: null, ...over });
const reopen = () => maintenanceUndoCandidates(task(), { propertyId: 'prop-1', undo: 'REOPEN' });

test('the task validator is registered; the chip survives for the current task and the plain fallback is preserved', async () => {
  assert.equal(typeof getSuggestedNextActionEntityValidator('MAINTENANCE_TASK'), 'function');
  await withTasks([row()], async (calls) => {
    const { result } = await finalize(reopen());
    assert.equal(calls(), 1);
    assert.equal(result.suggestedNextActions.length, 1);
    assert.ok(SuggestedNextActionSchema.safeParse(result.suggestedNextActions[0]).success);
    assert.equal(result.suggestedNextActions[0].outcomeKey, 'REOPEN_TASK');
    assert.deepEqual(result.suggestions, ['What maintenance is pending?']);
  });
});

test('a task that was deleted, is in another property, or changed (reopened elsewhere) since the receipt is not offered', async () => {
  await withTasks([], async () => assert.deepEqual((await finalize(reopen())).result.suggestedNextActions, [], 'deleted'));
  await withTasks([row({ propertyId: 'prop-2' })], async () => assert.deepEqual((await finalize(reopen())).result.suggestedNextActions, [], 'other property'));
  await withTasks([row({ status: 'PENDING', updatedAt: new Date(UPDATED.getTime() + 1000) })], async () => {
    const { result, report } = await finalize(reopen());
    assert.deepEqual(result.suggestedNextActions, []);
    assert.equal(report.diagnostics.rejections['FRESHNESS:CONTEXT_VERSION_STALE'], 1);
  });
});

test('a viewer is not offered an undo write', async () => {
  await withTasks([row()], async () => {
    const { result, report } = await finalize(reopen(), 'AUTHORIZATION');
    assert.deepEqual(result.suggestedNextActions, []);
    assert.equal(report.diagnostics.rejections['AUTHORIZATION:ROLE_BELOW_FLOOR'], 1);
  });
});

// ---- wiring guards ---------------------------------------------------------------------------------------------------------

test('the update receipt nominates undo candidates, no longer emits the ambiguous Reopen string, and the capability passes the outcome', () => {
  const confirm = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/maintenanceConfirm.handler.ts'), 'utf8');
  assert.match(confirm, /maintenanceUndoCandidates\(updated, \{ propertyId: execution\.propertyId, undo: 'REOPEN' \}\)/);
  assert.match(confirm, /undo: 'UNSNOOZE'/);
  assert.doesNotMatch(confirm, /\[`Reopen \$\{updated\.title\}`\]/);
  const misc = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/miscHandlers.handler.ts'), 'utf8');
  assert.match(misc, /maintenanceTaskUpdateResult\(.*launchContext\?\.outcomeKey \?\? null\)\)/);
});

test('the create and complete receipts deliberately stay plain', () => {
  const confirm = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/maintenanceConfirm.handler.ts'), 'utf8');
  assert.equal((confirm.match(/suggestedNextActionCandidates/g) ?? []).length, 1);
});
