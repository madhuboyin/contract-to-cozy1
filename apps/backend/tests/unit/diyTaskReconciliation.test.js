const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Slice 4a of docs/architecture/ASK_COZY_DIY_TASK_RECONCILIATION_PLAN.md. Part 1: the pure worker handler (preflight, the deleted-task skip, per-project outcomes
// that are persisted and never revisited). Part 2: the real diy.service transitions the handler calls, on the shared database-free fake. Part 3: the link
// check at project creation. Not Postgres.
const { processDiyTaskReconciliationEvent, DiyTaskReconciliationFailed, FINAL_PROJECT_OUTCOMES } = require('../../src/services/diy/diyTaskReconciliation.ts');
const { isTerminalDomainEventError } = require('../../src/services/domainEvents/terminalDomainEventError.ts');

const snapshot = (overrides = {}) => ({
  taskId: 'task-1', propertyId: 'prop-1', occurrenceId: 'occ-1', actorUserId: 'dana', completedAt: '2026-10-06T12:00:00.000Z', fulfillmentMode: 'DIY', completionKey: null,
  projectIds: ['pA', 'pB', 'pC'], ...overrides,
});

// Part 1 ---------------------------------------------------------------------------------------------------------------------------------------------
function world({ task = { id: 'task-1', propertyId: 'prop-1', status: 'COMPLETED' }, outcomeFor = {}, failFor = new Set(), recorded = {} } = {}) {
  const calls = [];
  const events = new Map(); // what recordOutcome persisted: projectId -> outcome
  const deps = {
    async getTask(id) { calls.push(['getTask', id]); return task ? { ...task } : null; },
    async reconcileProject(input) {
      calls.push(['reconcileProject', input.projectId, input.mode, input.actorUserId]);
      if (failFor.has(input.projectId)) throw new Error('boom');
      return outcomeFor[input.projectId] ?? 'CLOSED_BY_LINKED_TASK';
    },
    async recordOutcome(eventId, projectId, outcome) { calls.push(['recordOutcome', projectId, outcome]); events.set(projectId, outcome); },
  };
  return { deps, calls, events, count: (name) => calls.filter(([n]) => n === name).length, payload: (overrides = {}) => ({ ...snapshot(overrides), projectOutcomes: recorded }) };
}
const run = (w, overrides) => processDiyTaskReconciliationEvent({ id: 'ev-1', payload: w.payload(overrides) }, w.deps);

test('each snapshotted project is reconciled with the snapshot mode and the completing user, and each outcome is recorded before the next project', async () => {
  const w = world({ outcomeFor: { pA: 'HIRED_OUT', pB: 'COMPLETED', pC: 'NEEDS_REVIEW' } });
  const result = await run(w);
  assert.deepEqual(result, { result: 'APPLIED', projectOutcomes: { pA: 'HIRED_OUT', pB: 'COMPLETED', pC: 'NEEDS_REVIEW' } });
  assert.deepEqual(w.calls.filter(([n]) => n === 'reconcileProject').map(([, id, mode, actor]) => [id, mode, actor]), [['pA', 'DIY', 'dana'], ['pB', 'DIY', 'dana'], ['pC', 'DIY', 'dana']]);
  const order = w.calls.map(([n, id]) => `${n}:${id ?? ''}`).filter((entry) => !entry.startsWith('getTask'));
  assert.deepEqual(order, ['reconcileProject:pA', 'recordOutcome:pA', 'reconcileProject:pB', 'recordOutcome:pB', 'reconcileProject:pC', 'recordOutcome:pC']);
});

test('an unknown mode is passed through as null (the service decides NEEDS_REVIEW), never inferred', async () => {
  const w = world({ outcomeFor: { pA: 'NEEDS_REVIEW', pB: 'NEEDS_REVIEW', pC: 'NEEDS_REVIEW' } });
  await run(w, { fulfillmentMode: null });
  assert.ok(w.calls.filter(([n]) => n === 'reconcileProject').every(([, , mode]) => mode === null));
});

test('PREFLIGHT: a deleted task is the typed terminal skip TASK_DELETED: nothing is applied, nothing fails, and no outcome is invented', async () => {
  const w = world({ task: null });
  const result = await run(w);
  assert.deepEqual(result, { result: 'TASK_DELETED', projectOutcomes: {} });
  assert.equal(w.count('reconcileProject') + w.count('recordOutcome'), 0);
});

test('PREFLIGHT: a task that is no longer completed (reopened meanwhile) applies nothing', async () => {
  const w = world({ task: { id: 'task-1', propertyId: 'prop-1', status: 'IN_PROGRESS' } });
  assert.equal((await run(w)).result, 'TASK_NO_LONGER_COMPLETED');
  assert.equal(w.count('reconcileProject'), 0);
});

test('PREFLIGHT: a task on another property is a terminal integrity failure before any project is touched', async () => {
  const w = world({ task: { id: 'task-1', propertyId: 'elsewhere', status: 'COMPLETED' } });
  await assert.rejects(run(w), (error) => isTerminalDomainEventError(error) && error.code === 'INTEGRITY_CROSS_PROPERTY');
  assert.equal(w.count('reconcileProject'), 0);
});

test('malformed snapshots are terminal: missing ids, a bad mode, no projects, more than 25, a bad date', async () => {
  const w = world();
  const tooMany = Array.from({ length: 26 }, (_, i) => `p${i}`);
  for (const bad of [{ taskId: '' }, { occurrenceId: undefined }, { fulfillmentMode: 'HYBRID' }, { projectIds: [] }, { projectIds: tooMany }, { completedAt: 'nope' }, { projectIds: [1, 2] }]) {
    await assert.rejects(run(w, bad), (error) => isTerminalDomainEventError(error) && error.code === 'SNAPSHOT_INVALID', JSON.stringify(bad).slice(0, 40));
  }
  assert.equal(w.calls.length, 0);
});

test('PARTIAL FAILURE: one project failing does not stop the others; their outcomes are recorded and the event fails naming only the failed project', async () => {
  const w = world({ failFor: new Set(['pB']), outcomeFor: { pA: 'HIRED_OUT', pC: 'HIRED_OUT' } });
  await assert.rejects(run(w), (error) => error instanceof DiyTaskReconciliationFailed && error.failures.map((f) => f.projectId).join() === 'pB' && /boom/.test(error.message));
  assert.deepEqual(Object.fromEntries(w.events), { pA: 'HIRED_OUT', pB: 'FAILED', pC: 'HIRED_OUT' });
  assert.ok(!FINAL_PROJECT_OUTCOMES.has('FAILED'), 'FAILED is not a final outcome');
});

test('RETRY / RECOVERY redoes ONLY the failed or never-attempted projects; every final outcome is skipped, including NEEDS_REVIEW', async () => {
  const w = world({ recorded: { pA: 'HIRED_OUT', pB: 'FAILED', pC: 'NEEDS_REVIEW' }, outcomeFor: { pB: 'CLOSED_BY_LINKED_TASK' } });
  const result = await run(w);
  assert.deepEqual(w.calls.filter(([n]) => n === 'reconcileProject').map(([, id]) => id), ['pB'], 'only the failed project was attempted');
  assert.deepEqual(result.projectOutcomes, { pA: 'HIRED_OUT', pB: 'CLOSED_BY_LINKED_TASK', pC: 'NEEDS_REVIEW' });
  const allFinal = world({ recorded: { pA: 'COMPLETED', pB: 'ALREADY_CLOSED', pC: 'PROJECT_GONE' } });
  assert.equal((await run(allFinal)).result, 'APPLIED');
  assert.equal(allFinal.count('reconcileProject'), 0, 'nothing is redone');
});

test('duplicate project ids in a snapshot are handled once', async () => {
  const w = world();
  await run(w, { projectIds: ['pA', 'pA', 'pB'] });
  assert.deepEqual(w.calls.filter(([n]) => n === 'reconcileProject').map(([, id]) => id), ['pA', 'pB']);
});

test('the handler is pure: it imports nothing but the terminal-error class and never touches incidents or a database client', () => {
  const handler = fs.readFileSync(path.resolve(__dirname, '../../src/services/diy/diyTaskReconciliation.ts'), 'utf8');
  assert.deepEqual([...handler.matchAll(/^import .* from '(.*)';/gm)].map((m) => m[1]), ['../domainEvents/terminalDomainEventError']);
  assert.doesNotMatch(handler, /syncIncidentWorkItem|\.incident\b|from '[^']*prisma'/);
});

// Part 2 ---------------------------------------------------------------------------------------------------------------------------------------------
const { makeDiyDb } = require('../helpers/diyTemplateFake.js');
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
const step = (id, n, extra = {}) => ({ id, stepNumber: n, title: `Step ${n}`, description: 'x', isOptional: false, status: 'PENDING', notes: null, completedAt: null, completedByUserId: null, safetyNote: null, updatedAt: new Date(T0.getTime() + n), ...extra });
const seedProject = (h, { steps, status = 'IN_PROGRESS', id = 'p1' } = {}) => h.state.projects.push({
  id, propertyId: 'prop-1', userId: 'creator', title: 'Paint a room', category: 'PAINTING', maintenanceTaskId: 'task-1', status, updatedAt: T0, materials: [], tools: [], aiGuide: null,
  steps: steps ?? [step('s1', 1), step('s2', 2, { isOptional: true })],
});
const reconcile = (h, mode, id = 'p1', actor = 'dana') => h.diyService.reconcileProjectFromLinkedTask(id, 'prop-1', { mode, actorUserId: actor, completedAt: new Date('2026-10-05T09:00:00Z') });
const doneSteps = [step('s1', 1, { status: 'COMPLETED' }), step('s2', 2, { isOptional: true, status: 'SKIPPED' })];

test('PROVIDER hires the project out: status, basis LINKED_TASK, the completing user on the ledger, steps untouched, no home-event outbox row', async () => {
  const h = harness(); seedProject(h);
  const stepsBefore = JSON.stringify(h.state.projects[0].steps);
  assert.equal(await reconcile(h, 'PROVIDER'), 'HIRED_OUT');
  const project = h.state.projects[0];
  assert.deepEqual([project.status, project.completionBasis, !!project.abandonedAt], ['HIRED_OUT', 'LINKED_TASK', true]);
  assert.equal(JSON.stringify(project.steps), stepsBefore);
  assert.deepEqual(h.state.events.map((e) => [e.type, e.actorUserId, e.fromStatus, e.toStatus]), [['PROJECT_HIRED_OUT', 'dana', 'IN_PROGRESS', 'HIRED_OUT']]);
  assert.equal(h.state.domainEvents.length, 0);
});

test('DIY with the completion rule holding: the NORMAL completion (basis STEPS, ledger PROJECT_COMPLETED, and its outbox event for the home event)', async () => {
  const h = harness(); seedProject(h, { steps: doneSteps });
  assert.equal(await reconcile(h, 'DIY'), 'COMPLETED');
  const project = h.state.projects[0];
  assert.deepEqual([project.status, project.completionBasis, project.completedByUserId], ['COMPLETED', 'STEPS', 'dana']);
  assert.deepEqual(h.state.events.map((e) => e.type), ['PROJECT_COMPLETED']);
  assert.deepEqual(h.state.domainEvents.map((e) => [e.type, e.idempotencyKey, e.payload.actorUserId, e.payload.maintenanceTaskId]), [['DIY_PROJECT_COMPLETED', 'diy-project-completed:p1', 'dana', 'task-1']]);
});

test('DIY with required steps still open: a reconciled closure (basis LINKED_TASK), steps left exactly as they were, the task completion time, NO outbox row and NO home event', async () => {
  const h = harness(); seedProject(h);
  const stepsBefore = JSON.stringify(h.state.projects[0].steps);
  assert.equal(await reconcile(h, 'DIY'), 'CLOSED_BY_LINKED_TASK');
  const project = h.state.projects[0];
  assert.deepEqual([project.status, project.completionBasis, project.completedByUserId, project.completedAt.toISOString()], ['COMPLETED', 'LINKED_TASK', 'dana', '2026-10-05T09:00:00.000Z']);
  assert.equal(JSON.stringify(project.steps), stepsBefore, 'no step was changed');
  assert.deepEqual(h.state.events.map((e) => [e.type, e.actorUserId, e.fromStatus, e.toStatus]), [['PROJECT_CLOSED_BY_LINKED_TASK', 'dana', 'IN_PROGRESS', 'COMPLETED']]);
  assert.equal(h.state.domainEvents.length, 0, 'a linked-task closure writes no outbox event, so no home event claims the work');
});

test('an unknown mode is NEEDS_REVIEW and writes NOTHING (not even the claim)', async () => {
  const h = harness(); seedProject(h);
  const before = JSON.stringify(h.state.projects[0]);
  assert.equal(await reconcile(h, null), 'NEEDS_REVIEW');
  assert.equal(JSON.stringify(h.state.projects[0]), before);
  assert.equal(h.state.writes.length + h.state.events.length + h.state.domainEvents.length, 0);
});

test('an already finished or stopped project is ALREADY_CLOSED, a missing one PROJECT_GONE, and neither is changed', async () => {
  for (const status of ['COMPLETED', 'ABANDONED', 'HIRED_OUT']) {
    const h = harness(); seedProject(h, { status });
    assert.equal(await reconcile(h, 'DIY'), 'ALREADY_CLOSED', status);
    assert.equal(h.state.projects[0].status, status);
    assert.equal(h.state.events.length, 0);
  }
  const gone = harness();
  assert.equal(await reconcile(gone, 'DIY', 'nope'), 'PROJECT_GONE');
});

test('the transition bumps the version, so a person with the old page gets DIY_STALE (or DIY_PROJECT_CLOSED) instead of overwriting it', async () => {
  const h = harness(); seedProject(h);
  const stalePage = h.state.projects[0].updatedAt.toISOString();
  await reconcile(h, 'PROVIDER');
  await assert.rejects(h.diyService.abandonProject('p1', 'prop-1', false, { actorUserId: 'alice', expectedUpdatedAt: stalePage }), (error) => ['DIY_STALE', 'DIY_PROJECT_CLOSED'].includes(error.code));
});

test('RACE with the person finishing the same project: exactly one wins and the other sees a closed project', async () => {
  const h = harness(); seedProject(h, { steps: doneSteps });
  const token = h.state.projects[0].updatedAt.toISOString();
  const [system, person] = await Promise.allSettled([reconcile(h, 'DIY'), h.diyService.completeProject('p1', 'prop-1', {}, { actorUserId: 'alice', expectedUpdatedAt: token })]);
  const wins = [system.status === 'fulfilled' && system.value === 'COMPLETED', person.status === 'fulfilled'].filter(Boolean).length;
  const lost = system.status === 'fulfilled' ? system.value === 'ALREADY_CLOSED' : false;
  assert.ok(wins === 1 || (wins === 0 && lost), JSON.stringify([system, person]));
  assert.equal(h.state.projects[0].status, 'COMPLETED');
  assert.equal(h.state.events.filter((e) => e.type === 'PROJECT_COMPLETED').length, 1, 'one completion on the ledger');
  assert.equal(h.state.domainEvents.length, 1, 'one outbox event');
});

test('a normal completion by a person records basis STEPS (the new field is set on the existing path too)', async () => {
  const h = harness(); seedProject(h, { steps: doneSteps });
  await h.diyService.completeProject('p1', 'prop-1', {}, { actorUserId: 'alice', expectedUpdatedAt: h.state.projects[0].updatedAt.toISOString() });
  assert.equal(h.state.projects[0].completionBasis, 'STEPS');
});

// Part 3 ---------------------------------------------------------------------------------------------------------------------------------------------
test('creating a project validates its linked task: it must exist on THIS property; an already-completed task is allowed; an absent link is fine', async () => {
  const tasks = [{ id: 'task-1', propertyId: 'prop-1', status: 'COMPLETED' }, { id: 'task-2', propertyId: 'other-property', status: 'PENDING' }];
  const h = harness({ tasks });
  // The link check runs before the template is looked up, so a refusal needs no template; an accepted link then reaches the template step (404 here).
  await assert.rejects(h.diyService.createProject('prop-1', 'dana', { templateId: 'tpl', maintenanceTaskId: 'task-2' }), (error) => error.statusCode === 404 && error.code === 'DIY_TASK_NOT_FOUND');
  await assert.rejects(h.diyService.createProject('prop-1', 'dana', { templateId: 'tpl', maintenanceTaskId: 'no-such-task' }), (error) => error.code === 'DIY_TASK_NOT_FOUND');
  await assert.rejects(h.diyService.createProject('prop-1', 'dana', { templateId: 'tpl', maintenanceTaskId: 'task-1' }), (error) => error.statusCode === 404 && error.code !== 'DIY_TASK_NOT_FOUND', 'a same-property task (even completed) passes the link check');
  await assert.rejects(h.diyService.createProject('prop-1', 'dana', { templateId: 'tpl' }), (error) => error.statusCode === 404 && error.code !== 'DIY_TASK_NOT_FOUND', 'no link, no check');
});
