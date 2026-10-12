const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { HomeBuyerTaskService } = require('../../src/services/HomeBuyerTask.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { extractBuyerTaskTitle } = require('../../src/services/ask/handlers/buyerPlan.handler.ts');

const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;

// Register section 4, "Add a closing task": a closing task is a Buyer Plan task. It used to become a maintenance task, "show my closing
// tasks" read the maintenance list, and the buyer create command would have built a buyer checklist on any property.

test('"add a closing task" reaches the Buyer Plan command, never a maintenance task', () => {
  for (const message of [
    'Add a closing task to schedule the final walkthrough',
    'add a closing task',
    'create a closing task for the title search',
    'Add a closing task to get the survey done',
    'add a closing plan task for the appraisal',
    'add a task to my closing plan',
  ]) assert.equal(route(message), 'BUYER_TASK_CREATE', message);
  // Other task phrasings keep their routes.
  assert.equal(route('add a maintenance task to clean gutters'), 'MAINTENANCE_TASK_CREATE');
  assert.equal(route('mark the closing task complete'), 'BUYER_TASK_COMPLETE');
  assert.equal(route('reschedule the closing plan task for the appraisal'), 'BUYER_TASK_UPDATE');
});

test('reads of the closing tasks go to the Buyer Plan status, not the maintenance list', () => {
  for (const message of ['show my closing tasks', 'what closing tasks are left?', 'list my closing checklist', 'which buyer plan tasks are open']) {
    assert.equal(route(message), 'BUYER_PLAN_STATUS', message);
  }
});

test('the task title is the work to do, not the phrase that asked for it', () => {
  const cases = [
    ['Add a closing task to schedule the final walkthrough', 'Schedule the final walkthrough'],
    ['create a closing task for the title search', 'Title search'],
    ['add a closing task: confirm homeowner insurance', 'Confirm homeowner insurance'],
    ['add a closing plan task for the appraisal', 'Appraisal'],
    ['add a closing task called wire the down payment.', 'Wire the down payment'],
    ['add the final walkthrough to my closing plan', 'Final walkthrough'],
    ['add a closing task', null],
    ['add a closing task to', null],
  ];
  for (const [message, expected] of cases) assert.equal(extractBuyerTaskTitle(message), expected, message);
});

// ---- handler: no active plan writes nothing ----------------------------------------------------------------------------------------

// buyerPlanContextProvider is frozen, so the seam is the canonical service it reads: getClosingHomePresentation.
const loaded = (data) => ({ presentation: data });
const failed = () => ({ error: new Error('presentation unavailable') });
function stub({ context, role = 'CONTRIBUTOR' }) {
  const saved = {
    presentation: HomeBuyerTaskService.getClosingHomePresentation, resolve: propertyAccess.resolvePropertyAccess, createTask: HomeBuyerTaskService.createTask,
    getOrCreate: HomeBuyerTaskService.getOrCreateChecklist, property: prisma.property,
  };
  const calls = { createTask: 0, getOrCreateChecklist: 0, presentationReads: 0 };
  HomeBuyerTaskService.getClosingHomePresentation = async () => { calls.presentationReads += 1; if (context.error) throw context.error; return context.presentation; };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  HomeBuyerTaskService.createTask = async () => { calls.createTask += 1; return { id: 'task-1' }; };
  HomeBuyerTaskService.getOrCreateChecklist = async () => { calls.getOrCreateChecklist += 1; return { id: 'list-1' }; };
  // Only the two reads these handlers make on the property row; any other call fails loudly rather than reaching a database.
  prisma.property = { findFirst: async () => ({ id: 'prop-1' }), findUnique: async () => ({ id: 'prop-1', timezone: 'America/New_York' }) };
  return {
    calls,
    restore() {
      HomeBuyerTaskService.getClosingHomePresentation = saved.presentation; propertyAccess.resolvePropertyAccess = saved.resolve;
      HomeBuyerTaskService.createTask = saved.createTask; HomeBuyerTaskService.getOrCreateChecklist = saved.getOrCreate;
      prisma.property = saved.property;
    },
  };
}
const invoke = (message, role = 'CONTRIBUTOR') => capabilityInvoke('BUYER_TASK_CREATE', { userId: 'user-1', propertyId: 'prop-1', message, launchContext: null }, { propertyAccess: { role } });

test('with no active Buyer Plan the request is explained and nothing is created', async () => {
  for (const context of [
    loaded({ presentationMode: 'CANDIDATE', overview: null }),
    loaded({ presentationMode: 'ACTIVE', overview: null }),
  ]) {
    const s = stub({ context });
    try {
      const result = await invoke('Add a closing task to schedule the final walkthrough');
      assert.equal(result.status, 'NOT_APPLICABLE');
      assert.equal(result.reasonCode, 'BUYER_PLAN_NOT_ACTIVE');
      assert.equal(s.calls.presentationReads, 1, 'the plan state came from the stubbed canonical read, not a database failure');
      assert.equal(result.confirmation ?? null, null);
      assert.equal(result.parameters?.buyerTaskTitle, undefined);
      assert.deepEqual(result.blocks[0].actions, []);
      assert.match(result.blocks[0].body, /Nothing has changed/);
      assert.deepEqual({ createTask: s.calls.createTask, getOrCreateChecklist: s.calls.getOrCreateChecklist }, { createTask: 0, getOrCreateChecklist: 0 });
    } finally { s.restore(); }
  }
});

test('with an active Buyer Plan the task is proposed with its title, for confirmation, and still nothing is written', async () => {
  const s = stub({ context: loaded({ presentationMode: 'ACTIVE', overview: { journey: { progress: { total: 3, completed: 1, percent: 33 } }, nextAction: null, blockers: [], milestones: [] } }) });
  try {
    const result = await invoke('Add a closing task to schedule the final walkthrough');
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    assert.equal(result.parameters.buyerTaskTitle, 'Schedule the final walkthrough');
    assert.deepEqual(result.confirmation.fields[0], { label: 'Task', value: 'Schedule the final walkthrough' });
    assert.deepEqual({ createTask: s.calls.createTask, getOrCreateChecklist: s.calls.getOrCreateChecklist }, { createTask: 0, getOrCreateChecklist: 0 });
  } finally { s.restore(); }
});

test('a viewer is blocked before the plan is even loaded', async () => {
  const s = stub({ context: loaded({ presentationMode: 'ACTIVE', overview: { nextAction: null, blockers: [], milestones: [] } }), role: 'VIEWER' });
  try {
    const result = await invoke('add a closing task', 'VIEWER');
    assert.notEqual(result.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual({ createTask: s.calls.createTask, getOrCreateChecklist: s.calls.getOrCreateChecklist }, { createTask: 0, getOrCreateChecklist: 0 });
  } finally { s.restore(); }
});

test('if the plan state cannot be read the request fails and nothing is created', async () => {
  const s = stub({ context: failed() });
  try {
    await assert.rejects(() => invoke('add a closing task to schedule the final walkthrough'), /presentation unavailable/);
    assert.deepEqual({ createTask: s.calls.createTask, getOrCreateChecklist: s.calls.getOrCreateChecklist }, { createTask: 0, getOrCreateChecklist: 0 });
  } finally { s.restore(); }
});
