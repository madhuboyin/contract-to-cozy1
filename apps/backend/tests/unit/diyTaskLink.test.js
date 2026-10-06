const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Slice 4b of docs/architecture/ASK_COZY_DIY_TASK_RECONCILIATION_PLAN.md: the read-only disclosure of the linked task (section 3.3) and recovery of a
// dead-lettered reconcile event (3.4). The mapping is pure; the service runs on the shared database-free fake. Not Postgres.
const { describeTaskLink, TASK_LINK_COPY, occurrenceIdOf, projectOutcomeOf } = require('../../src/services/diy/taskLinkStatus.ts');
const { describeCompletionEffects } = require('../../src/services/diy/completionEffectsStatus.ts');
const { makeDiyDb } = require('../helpers/diyTemplateFake.js');

const project = (extra = {}) => ({ id: 'p1', status: 'IN_PROGRESS', maintenanceTaskId: 'task-1', completionBasis: null, ...extra });
const done = (extra = {}) => ({ status: 'COMPLETED', completionMetadata: { reconciliationOccurrenceId: 'occ-1' }, ...extra });
const event = (status, payload = {}) => ({ status, payload: { projectIds: ['p1'], ...payload } });
const view = (input) => describeTaskLink(input);

test('the mapping: every row of the disclosure table, with the review-and-confirm wording', () => {
  assert.equal(view({ project: project({ maintenanceTaskId: null }), task: null, event: null }), null, 'no linked task');
  assert.equal(view({ project: project(), task: { status: 'PENDING', completionMetadata: null }, event: null }), null, 'task not completed');
  assert.deepEqual(view({ project: project(), task: null, event: null }), { state: 'NEEDS_REVIEW', summary: TASK_LINK_COPY.NEEDS_REVIEW_DELETED, canRecover: false }, 'a missing task is shown, not hidden');
  for (const status of ['PENDING', 'PROCESSING', 'FAILED']) assert.deepEqual(view({ project: project(), task: done(), event: event(status) }), { state: 'UPDATING', summary: TASK_LINK_COPY.UPDATING, canRecover: false }, status);
  assert.deepEqual(view({ project: project(), task: done(), event: null }), { state: 'NEEDS_REVIEW', summary: TASK_LINK_COPY.NEEDS_REVIEW, canRecover: false }, 'completed with no event');
  assert.equal(view({ project: project(), task: done(), event: event('PROCESSED', { processingOutcome: { projectOutcomes: { p1: 'NEEDS_REVIEW' } } }) }).state, 'NEEDS_REVIEW');
  assert.equal(view({ project: project(), task: done(), event: event('PROCESSED') }).state, 'NEEDS_REVIEW', 'processed, yet the project is still open: nothing was applied to it');
  assert.deepEqual(view({ project: project(), task: done(), event: event('DEAD_LETTER') }), { state: 'NEEDS_ATTENTION', summary: TASK_LINK_COPY.NEEDS_ATTENTION, canRecover: true });
  assert.equal(view({ project: project(), task: done(), event: event('DEAD_LETTER', { projectOutcomes: { p1: 'NEEDS_REVIEW' } }) }).state, 'NEEDS_REVIEW', 'a final outcome is not recoverable');
  assert.equal(view({ project: project(), task: done(), event: event('DEAD_LETTER', { projectIds: ['someone-else'] }) }).state, 'NEEDS_REVIEW', 'an event that was not about this project');
  assert.deepEqual(view({ project: project({ status: 'COMPLETED', completionBasis: 'LINKED_TASK' }), task: done(), event: null }), { state: 'CLOSED_BY_TASK', summary: TASK_LINK_COPY.CLOSED_COMPLETED, canRecover: false });
  assert.deepEqual(view({ project: project({ status: 'HIRED_OUT', completionBasis: 'LINKED_TASK' }), task: null, event: null }), { state: 'CLOSED_BY_TASK', summary: TASK_LINK_COPY.CLOSED_HIRED_OUT, canRecover: false });
  assert.equal(view({ project: project({ status: 'COMPLETED', completionBasis: 'STEPS' }), task: done(), event: null }), null, 'a project the person completed says nothing about the task');
  assert.equal(view({ project: project({ status: 'ABANDONED' }), task: done(), event: null }), null);
});

test('the copy asks the person to review and confirm, and never tells them to recreate the classification by hand', () => {
  for (const text of [TASK_LINK_COPY.NEEDS_REVIEW, TASK_LINK_COPY.NEEDS_REVIEW_DELETED]) {
    assert.match(text, /Review the project and confirm whether you completed the work or hired a professional\./);
    assert.doesNotMatch(text, /Finish it|stop it/i);
  }
});

test('the occurrence id and the project outcome are read from where the producer and the handler put them (progress or final outcome)', () => {
  assert.equal(occurrenceIdOf({ reconciliationOccurrenceId: 'occ-9' }), 'occ-9');
  assert.equal(occurrenceIdOf(null), null);
  assert.equal(occurrenceIdOf([]), null);
  assert.equal(projectOutcomeOf({ projectOutcomes: { p1: 'FAILED' } }, 'p1'), 'FAILED');
  assert.equal(projectOutcomeOf({ projectOutcomes: { p1: 'FAILED' }, processingOutcome: { projectOutcomes: { p1: 'HIRED_OUT' } } }, 'p1'), 'HIRED_OUT', 'the final outcome wins over stale progress');
  assert.equal(projectOutcomeOf({}, 'p1'), null);
});

test('a project closed from its linked task is NOT "legacy": the completion-effects disclosure says nothing when no records were expected, and says legacy only with no basis', () => {
  assert.equal(describeCompletionEffects('COMPLETED', null, 'LINKED_TASK'), null);
  assert.equal(describeCompletionEffects('COMPLETED', null, 'STEPS'), null);
  assert.equal(describeCompletionEffects('COMPLETED', null, null).state, 'LEGACY_UNKNOWN');
  assert.equal(describeCompletionEffects('COMPLETED', 'PROCESSED', 'STEPS').state, 'RECORDED');
});

// ---- the service, on the shared fake ---------------------------------------------------------------------------------------------------------------
function harness(hooks) {
  const db = makeDiyDb([], hooks);
  const stub = (relative, exports) => { const resolved = require.resolve(relative); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports }; };
  stub('../../src/lib/prisma.ts', { prisma: db });
  stub('../../src/lib/logger.ts', { logger: { info() {}, warn() {}, error() {} }, auditLog() {}, redactEmail: (value) => value });
  stub('../../src/modules/propertyContext/index.ts', { getPropertyContext: async () => ({}) });
  stub('../../src/services/diy/applicabilityPolicy.ts', { evaluateDiyApplicability: () => ({ status: 'APPLICABLE' }) });
  delete require.cache[require.resolve('../../src/services/diy.service.ts')];
  const { diyService } = require('../../src/services/diy.service.ts');
  return { db, state: db.state, diyService };
}
const T0 = new Date('2026-10-06T12:00:00.000Z');
const KEY = 'diy-task-reconcile:task-1:occ-1';
function seed(h, { status = 'IN_PROGRESS', basis = null, event } = {}) {
  h.state.projects.push({ id: 'p1', propertyId: 'prop-1', userId: 'creator', title: 'Paint', category: 'PAINTING', maintenanceTaskId: 'task-1', completionBasis: basis, status, updatedAt: T0, steps: [], materials: [], tools: [], aiGuide: null });
  if (event) h.state.domainEvents.push({ id: 'ev-1', type: 'DIY_TASK_COMPLETED_RECONCILE', idempotencyKey: KEY, attempts: 8, lastError: 'PROJECT p1: boom', availableAt: T0, updatedAt: T0, ...event, payload: { taskId: 'task-1', projectIds: ['p1'], ...(event.payload ?? {}) } });
}
const tasks = (extra = {}) => [{ id: 'task-1', propertyId: 'prop-1', status: 'COMPLETED', completionMetadata: { reconciliationOccurrenceId: 'occ-1' }, ...extra }];
const read = async (h) => (await h.diyService.getProjectWithCompletionEffects('p1', 'prop-1')).taskLink;
const retry = (h, actor = 'dana', property = 'prop-1') => h.diyService.retryTaskReconciliation('p1', property, actor);

test('the project read discloses each state, finds the event through the task\'s occurrence id, and WRITES NOTHING (a spy on every write)', async () => {
  for (const [eventStatus, expected] of [['PENDING', 'UPDATING'], ['PROCESSING', 'UPDATING'], ['FAILED', 'UPDATING'], ['DEAD_LETTER', 'NEEDS_ATTENTION'], ['PROCESSED', 'NEEDS_REVIEW']]) {
    const h = harness({ tasks: tasks() }); seed(h, { event: { status: eventStatus } });
    const before = JSON.stringify(h.state.domainEvents);
    const link = await read(h);
    assert.equal(link.state, expected, eventStatus);
    assert.equal(h.state.writes.length, 0, `${eventStatus}: no write during a read`);
    assert.equal(JSON.stringify(h.state.domainEvents), before);
    assert.ok(!JSON.stringify(link).includes('boom'), 'no raw error text');
  }
});

test('the read: completed task with no event or occurrence id is "needs review"; a deleted or foreign task is shown as such; an incomplete task shows nothing', async () => {
  const noEvent = harness({ tasks: tasks() }); seed(noEvent);
  assert.equal((await read(noEvent)).state, 'NEEDS_REVIEW');
  const noOccurrence = harness({ tasks: tasks({ completionMetadata: null }) }); seed(noOccurrence);
  assert.equal((await read(noOccurrence)).summary, TASK_LINK_COPY.NEEDS_REVIEW);
  const deleted = harness({ tasks: [] }); seed(deleted);
  assert.equal((await read(deleted)).summary, TASK_LINK_COPY.NEEDS_REVIEW_DELETED);
  const foreign = harness({ tasks: tasks({ propertyId: 'other-property' }) }); seed(foreign);
  assert.equal((await read(foreign)).summary, TASK_LINK_COPY.NEEDS_REVIEW_DELETED, 'a task on another property is not this project\'s task');
  const pending = harness({ tasks: tasks({ status: 'PENDING' }) }); seed(pending);
  assert.equal(await read(pending), null);
});

test('closed from the linked task: the read says so, and the project\'s completion-effects disclosure is silent (no records were expected)', async () => {
  const h = harness({ tasks: [] }); seed(h, { status: 'COMPLETED', basis: 'LINKED_TASK' });
  const result = await h.diyService.getProjectWithCompletionEffects('p1', 'prop-1');
  assert.equal(result.taskLink.state, 'CLOSED_BY_TASK');
  assert.equal(result.completionEffects, null);
  const hired = harness({ tasks: [] }); seed(hired, { status: 'HIRED_OUT', basis: 'LINKED_TASK' });
  assert.equal((await hired.diyService.getProjectWithCompletionEffects('p1', 'prop-1')).taskLink.summary, TASK_LINK_COPY.CLOSED_HIRED_OUT);
});

test('recovery re-queues ONLY a dead letter: same row, attempts zero, snapshot AND projectOutcomes kept, who, when and the count recorded', async () => {
  const h = harness({ tasks: tasks() }); seed(h, { event: { status: 'DEAD_LETTER', payload: { projectOutcomes: { pOther: 'HIRED_OUT' }, snapshotMarker: 'kept' } } });
  const result = await retry(h);
  assert.equal(result.reset, true);
  assert.equal(result.taskLink.state, 'UPDATING');
  assert.equal(h.state.domainEvents.length, 1, 'never a second row');
  const [row] = h.state.domainEvents;
  assert.deepEqual([row.id, row.status, row.attempts, row.lastError, row.leaseExpiresAt], ['ev-1', 'PENDING', 0, null, null]);
  assert.deepEqual([row.payload.snapshotMarker, row.payload.projectOutcomes, row.payload.taskId], ['kept', { pOther: 'HIRED_OUT' }, 'task-1']);
  assert.deepEqual([row.payload.recovery.count, row.payload.recovery.lastBy, typeof row.payload.recovery.lastAt], [1, 'dana', 'string']);
});

test('recovery leaves every other state alone, including a dead letter whose outcome for THIS project is already final', async () => {
  for (const [status, payload] of [['PENDING'], ['PROCESSING'], ['FAILED'], ['PROCESSED'], ['DEAD_LETTER', { projectOutcomes: { p1: 'NEEDS_REVIEW' } }]]) {
    const h = harness({ tasks: tasks() }); seed(h, { event: { status, payload } });
    const before = JSON.stringify(h.state.domainEvents);
    const result = await retry(h);
    assert.equal(result.reset, false, status);
    assert.equal(JSON.stringify(h.state.domainEvents), before, `${status}: untouched`);
    assert.equal(h.state.writes.filter((write) => write.model === 'domainEvent').length, 0, `${status}: not even a conditional write was attempted`);
  }
  const none = harness({ tasks: tasks() }); seed(none);
  assert.equal((await retry(none)).reset, false);
  assert.equal(none.state.domainEvents.length, 0, 'no event is invented');
});

test('two simultaneous recoveries reset the dead letter once', async () => {
  const h = harness({ tasks: tasks() }); seed(h, { event: { status: 'DEAD_LETTER' } });
  const results = await Promise.all([retry(h, 'dana'), retry(h, 'sam')]);
  assert.equal(results.filter((result) => result.reset).length, 1);
  assert.equal(h.state.domainEvents[0].payload.recovery.count, 1);
});

test('a viewer, a stranger and another property\'s project are refused and nothing changes', async () => {
  for (const role of [null, 'VIEWER']) {
    const h = harness({ tasks: tasks(), role: () => role }); seed(h, { event: { status: 'DEAD_LETTER' } });
    await assert.rejects(retry(h), (error) => error.statusCode === 403);
    assert.equal(h.state.domainEvents[0].status, 'DEAD_LETTER');
  }
  const h = harness({ tasks: tasks() }); seed(h, { event: { status: 'DEAD_LETTER' } });
  await assert.rejects(retry(h, 'dana', 'other-property'), (error) => error.statusCode === 404);
});

test('the recovery route is behind the contributor floor and the controller replies with the task link', () => {
  const routes = fs.readFileSync(path.resolve(__dirname, '../../src/routes/diy.routes.ts'), 'utf8');
  assert.match(routes, /router\.post\('\/properties\/:propertyId\/diy\/projects\/:projectId\/task-reconciliation\/retry', propertyAuthMiddleware, requireHouseholdRole\('CONTRIBUTOR'\), retryTaskReconciliation\)/);
  assert.match(fs.readFileSync(path.resolve(__dirname, '../../src/controllers/diy.controller.ts'), 'utf8'), /diyService\.retryTaskReconciliation\(/);
});
