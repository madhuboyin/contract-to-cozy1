const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// FRD v1.478: editing an existing maintenance task's estimated and actual cost, the two fields Desktop's Edit Task form has and Ask's edit lacked.
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { maintenanceTaskUpdateResult, maintenanceUpdateCosts } = require('../../src/services/ask/handlers/maintenance.handler.ts');
const { MaintenanceTaskUpdateInputSchema } = require('../../src/services/ask/support/commandInputs.ts');
const { PropertyMaintenanceTaskService } = require('../../src/services/PropertyMaintenanceTask.service.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const coverage = require('../../src/services/coverageAnalysis.service.ts');

const at = new Date('2026-09-01T00:00:00.000Z');
const task = (extra = {}) => ({ id: 't-1', propertyId: 'p1', title: 'Clean gutters', status: 'PENDING', priority: 'MEDIUM', nextDueDate: null, isRecurring: false, frequency: null, serviceCategory: null, snoozedUntil: null, source: 'USER', estimatedCost: '100.00', actualCost: null, updatedAt: at, inventoryItem: null, room: null, ...extra });
const saved = { prisma: prismaModule.prisma, get: PropertyMaintenanceTaskService.getTasksForProperty, update: PropertyMaintenanceTaskService.updateTask, reconcile: executeOperation.reconcileAskExecutionSideEffects };
let rows; let writes;
test.beforeEach(() => {
  rows = [task(), task({ id: 't-2', title: 'Replace furnace filter', status: 'COMPLETED', estimatedCost: null })];
  writes = [];
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'householdMember') return { findMany: async () => [] };
    if (model === 'propertyMaintenanceTask') return { findFirst: async ({ where }) => rows.find((row) => row.id === where.id) ?? null, findUniqueOrThrow: async ({ where }) => ({ ...rows.find((row) => row.id === where.id), assignedTo: null }) };
    throw new Error(`Unexpected prisma.${String(model)} access`);
  } });
  PropertyMaintenanceTaskService.getTasksForProperty = async () => rows;
  PropertyMaintenanceTaskService.updateTask = async (...args) => { writes.push(args); const row = rows.find((candidate) => candidate.id === args[1]); Object.assign(row, args[2]); return row; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  require('../../src/services/ask/handlers/maintenanceConfirm.handler.ts');
});
test.afterEach(() => { prismaModule.prisma = saved.prisma; PropertyMaintenanceTaskService.getTasksForProperty = saved.get; PropertyMaintenanceTaskService.updateTask = saved.update; executeOperation.reconcileAskExecutionSideEffects = saved.reconcile; });

test('the cost a message names: labelled, after the task\'s name, bare by status, above zero, never a digit inside a title', () => {
  assert.deepEqual(maintenanceUpdateCosts('Change the estimated cost of Replace furnace filter to $1,250.50', 'PENDING'), { estimatedCostUsd: 1250.5 });
  assert.deepEqual(maintenanceUpdateCosts('Set the actual cost of Clean gutters to $180', 'COMPLETED'), { actualCostUsd: 180 });
  assert.deepEqual(maintenanceUpdateCosts('Update the cost of Clean gutters task to $90', 'COMPLETED'), { actualCostUsd: 90 });
  assert.deepEqual(maintenanceUpdateCosts('Update the cost of Clean gutters task to $90', 'PENDING'), { estimatedCostUsd: 90 });
  assert.deepEqual(maintenanceUpdateCosts('Change Clean gutters task estimate to 75 and actual cost was $60', 'COMPLETED'), { estimatedCostUsd: 75, actualCostUsd: 60 });
  assert.deepEqual(maintenanceUpdateCosts('Edit Clean gutters task estimated cost $0', 'PENDING'), {});
  assert.deepEqual(maintenanceUpdateCosts('Update the estimated cost of Replace 3 filters task', 'PENDING'), {});
  assert.equal(MaintenanceTaskUpdateInputSchema.safeParse({ taskId: 't', action: 'EDIT', estimatedCostUsd: 0 }).success, false);
});

test('a cost edit routes to the maintenance update; a project\'s cost and a bare reschedule do not change', () => {
  for (const m of ['Change the estimated cost of Replace furnace filter to $1,250.50', 'Set the actual cost of Clean gutters to $180']) assert.equal(resolveAskOperation(m).operationId, 'MAINTENANCE_TASK_UPDATE', m);
  assert.notEqual(resolveAskOperation('Update the actual cost of the kitchen project to $5000').operationId, 'MAINTENANCE_TASK_UPDATE');
});

test('the review shows the cost before and after and writes nothing; confirm sends only the cost through the canonical update with the reviewed version', async () => {
  const review = await maintenanceTaskUpdateResult('u1', 'p1', 'Change the estimated cost of Clean gutters task to $150');
  assert.equal(review.status, 'NEEDS_CONFIRMATION');
  assert.equal(writes.length, 0);
  assert.deepEqual(review.parameters.maintenanceUpdate.estimatedCostUsd, 150);
  assert.ok(review.confirmation.fields.some((field) => field.label === 'Estimated cost' && /\$100.* → \$150/.test(field.value)), JSON.stringify(review.confirmation.fields));
  const done = await confirmCapabilityInvoke('MAINTENANCE_TASK_UPDATE', {
    userId: 'u1', execution: { id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId: 'MAINTENANCE_TASK_UPDATE', createdAt: at }, parameters: review.parameters, access: { role: 'CONTRIBUTOR' }, command: getAskDomainCommandByOperation('MAINTENANCE_TASK_UPDATE'),
  });
  assert.equal(done.result.reasonCode, 'MAINTENANCE_TASK_UPDATED');
  assert.deepEqual(writes[0][2], { estimatedCost: 150 });
  assert.equal(writes[0][3].expectedUpdatedAt, at);
});

test('a completed task\'s bare cost is its actual cost; a message with no usable cost still asks what should change', async () => {
  const review = await maintenanceTaskUpdateResult('u1', 'p1', 'Update the cost of the Replace furnace filter task to $42.50');
  assert.equal(review.status, 'NEEDS_CONFIRMATION');
  assert.equal(review.parameters.maintenanceUpdate.actualCostUsd, 42.5);
  assert.equal(review.parameters.maintenanceUpdate.estimatedCostUsd, undefined);
  const none = await maintenanceTaskUpdateResult('u1', 'p1', 'Edit the Clean gutters task estimated cost $0');
  assert.equal(none.status, 'NEEDS_CLARIFICATION');
  assert.equal(writes.length, 0);
});
