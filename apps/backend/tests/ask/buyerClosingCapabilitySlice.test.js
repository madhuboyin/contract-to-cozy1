const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.46: buyer-closing capability-card slice (first cut: the deadlines list's blocking
// tasks). Same fake-prisma harness as the other capability-card slice tests; the fake prisma throws on any model it
// was not given.

const prismaModule = require('../../src/lib/prisma.ts');
const { BUYER_TASK_ITEM_ACTIONS, buyerTaskItemActions, buyerDeadlineTaskRow } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { HomeBuyerTaskService } = require('../../src/services/HomeBuyerTask.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const originals = { prisma: prismaModule.prisma, getTasks: HomeBuyerTaskService.getTasks, resolveAccess: propertyAccess.resolvePropertyAccess };
let tasks;

const task = (id, overrides) => ({ id, title: `Task ${id}`, description: null, status: 'PENDING', applicability: 'APPLICABLE', priority: 'NOW', dueAt: null, userEditedAt: null, ...overrides });

function install() {
  tasks = [task('task-appraisal', { title: 'Order the appraisal' }), task('task-insurance', { title: 'Bind homeowners insurance' })];
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (model === 'askExecution') return { findMany: async () => [] };
      throw new Error(`Unexpected prisma.${String(model)} access`);
    },
  });
  HomeBuyerTaskService.getTasks = async () => tasks;
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'CONTRIBUTOR', userId: 'u1', propertyId: 'p1' });
}

function restore() {
  prismaModule.prisma = originals.prisma;
  HomeBuyerTaskService.getTasks = originals.getTasks;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
}

test.beforeEach(install);
test.afterEach(restore);

const propose = (entityId, message = BUYER_TASK_ITEM_ACTIONS[0].message) => capabilityInvoke('BUYER_TASK_COMPLETE', {
  userId: 'u1', propertyId: 'p1', message,
  launchContext: { surface: 'ASK_WORKSPACE', entityType: 'BUYER_TASK', entityId, operationId: 'BUYER_TASK_COMPLETE', sourceExecutionId: 'exec-deadlines' },
});

test('Mark complete proposes completing exactly the launched task, carrying the source list for refresh', async () => {
  for (const id of ['task-appraisal', 'task-insurance']) {
    const result = await propose(id);
    assert.equal(result.status, 'NEEDS_CONFIRMATION', id);
    assert.equal(result.parameters.buyerTaskId, id);
    assert.equal(result.parameters.sourceExecutionId, 'exec-deadlines');
  }
});

test('a launched task that is no longer open is refused, never swapped for another open task', async () => {
  tasks = [task('task-appraisal', { status: 'COMPLETED' }), task('task-insurance')];
  // Before FRD v1.46 the one remaining open task would have been proposed instead.
  const result = await propose('task-appraisal');
  assert.equal(result.status, 'NOT_APPLICABLE');
  assert.equal(result.reasonCode, 'BUYER_TASK_NO_LONGER_OPEN');
  assert.equal(result.parameters, undefined);
  // Even when the message names another open task, the launched id wins.
  assert.equal((await propose('task-appraisal', 'Mark the Task task-insurance buyer plan task complete')).reasonCode, 'BUYER_TASK_NO_LONGER_OPEN');
});

test('free-text completion without a launched task still matches by title', async () => {
  const result = await capabilityInvoke('BUYER_TASK_COMPLETE', { userId: 'u1', propertyId: 'p1', message: 'Mark the Bind homeowners insurance buyer plan task complete' });
  assert.equal(result.parameters.buyerTaskId, 'task-insurance');
});

test('blocking-task rows carry identity, a Buyer Plan task link and Mark complete for contributors; viewers get none', () => {
  const row = buyerDeadlineTaskRow({ id: 'task-appraisal', title: 'Order the appraisal', description: null, priority: 'NOW', status: 'PENDING', dueAt: null }, '/dashboard/properties/p1/buyer-plan', buyerTaskItemActions('CONTRIBUTOR'));
  assert.equal(row.entityType, 'BUYER_TASK');
  assert.equal(row.href, '/dashboard/properties/p1/buyer-plan?taskId=task-appraisal');
  assert.deepEqual(row.actions.map((action) => [action.id, action.operationId]), [['buyer-task-complete', 'BUYER_TASK_COMPLETE']]);
  assert.deepEqual(buyerTaskItemActions('VIEWER'), []);
});

test('Mark complete survives the answer-trust whitelist for BUYER_DEADLINES', () => {
  const [action] = buyerTaskItemActions('OWNER');
  assert.equal(isAskActionApplicable({ action, operationId: 'BUYER_DEADLINES', propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true);
});

test('the buyer-closing card launches inline into the deadlines list, and its message routes there', () => {
  const launch = capabilityCardLaunch('buyer-closing').inlineLaunch;
  assert.equal(launch.operationId, 'BUYER_DEADLINES');
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'BUYER_DEADLINES');
});
