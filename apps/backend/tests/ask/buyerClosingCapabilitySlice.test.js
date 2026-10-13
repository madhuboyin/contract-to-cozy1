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

test('blocking-task rows carry identity and Mark complete for contributors, link to no desktop page; viewers get no action', () => {
  const row = buyerDeadlineTaskRow({ id: 'task-appraisal', title: 'Order the appraisal', description: null, priority: 'NOW', status: 'PENDING', dueAt: null }, buyerTaskItemActions('CONTRIBUTOR'));
  assert.equal(row.entityType, 'BUYER_TASK');
  assert.equal(row.href, null);
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

// Buyer Plan batch of the handler sweep (docs/product/ASK_COZY_ALL_TOOLS_PARITY_IMPLEMENTATION.md): Ask never links to a desktop page
// (owner decision, 2026-10-10), so the buyer answers carry no Buyer Plan, Documents or Inspection Hub link. The real handlers run with the
// closing-home presentation stubbed.
const presentationOriginal = HomeBuyerTaskService.getClosingHomePresentation;
test.afterEach(() => { HomeBuyerTaskService.getClosingHomePresentation = presentationOriginal; });

const overview = (overrides = {}) => ({
  journey: { stage: 'DUE_DILIGENCE', progress: { total: 10, completed: 4, percent: 40 } },
  nextAction: { id: 'task-appraisal', title: 'Order the appraisal', checklistSection: 'APPRAISAL', status: 'PENDING', priority: 'NOW', dueAt: null, phase: 'DUE_DILIGENCE', description: null },
  blockers: [{ id: 'task-insurance', title: 'Bind homeowners insurance', status: 'PENDING', priority: 'NOW', dueAt: null, phase: 'DUE_DILIGENCE', description: null }],
  milestones: [],
  evidence: {
    documentsNeedingReviewCount: 2, documentCount: 5, verifiedDocumentCount: 3, openMaterialFindingCount: 1, inspectionReportCount: 1,
    inspectionState: 'CONFIRMED', documents: [], findings: [],
  },
  routes: { documents: '/dashboard/properties/p1/documents', inspection: '/dashboard/properties/p1/inspection-hub' },
  ...overrides,
});

test('the buyer status, document and inspection answers carry no desktop link', async () => {
  HomeBuyerTaskService.getClosingHomePresentation = async () => ({ presentationMode: 'ACTIVE', overview: overview() });
  for (const operationId of ['BUYER_PLAN_STATUS', 'BUYER_DOCUMENT_READINESS', 'BUYER_INSPECTION_REVIEW']) {
    const result = await capabilityInvoke(operationId, { userId: 'u1', propertyId: 'p1', message: 'Where am I in my purchase?' });
    assert.ok(result.blocks.length > 0, operationId);
    const text = JSON.stringify(result);
    assert.equal(text.includes('/dashboard/'), false, operationId);
    // An action is an Ask command (a declared operation, no href); the inspection answer offers the inspection plan update (FRD v1.353).
    for (const block of result.blocks) {
      for (const action of block.actions ?? []) {
        assert.equal(action.href, undefined, `${operationId} ${block.id}`);
        assert.equal(action.operationId, 'BUYER_PLAN_SETUP_COMMAND', `${operationId} ${block.id}`);
      }
    }
  }
});

test('a purchase with no active Buyer Plan says so and offers no link or "start it" step', async () => {
  HomeBuyerTaskService.getClosingHomePresentation = async () => ({ presentationMode: 'CANDIDATE', overview: null });
  const result = await capabilityInvoke('BUYER_PLAN_STATUS', { userId: 'u1', propertyId: 'p1', message: 'Where am I in my purchase?' });
  assert.equal(result.reasonCode, 'BUYER_PLAN_NOT_ACTIVE');
  assert.deepEqual(result.blocks[0].actions, []);
  assert.match(result.blocks[0].body, /not currently available in Ask/);
  assert.equal(JSON.stringify(result).includes('/dashboard'), false);
});

test('a task that cannot be matched, and a task proposal, link to no desktop page', async () => {
  const unmatched = await capabilityInvoke('BUYER_TASK_COMPLETE', { userId: 'u1', propertyId: 'p1', message: 'Mark the thing complete' });
  assert.equal(unmatched.status, 'NEEDS_ENTITY');
  assert.deepEqual(unmatched.blocks[0].actions, []);
  assert.equal(/open the plan|Open Buyer Plan/.test(JSON.stringify(unmatched)), false);
  const proposal = await propose('task-appraisal');
  assert.equal(proposal.status, 'NEEDS_CONFIRMATION');
  assert.equal(JSON.stringify(proposal.blocks).includes('/dashboard/'), false);
});
