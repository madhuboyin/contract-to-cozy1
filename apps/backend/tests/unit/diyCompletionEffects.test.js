const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

// Slice 3a of docs/architecture/ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md: the pure DIY_PROJECT_COMPLETED handler (preflight, typed outcomes, partial-failure
// retries, the race after the pre-read), the fatal start-up check, and the boundary rules. The handler is run against injected, stateful fake dependencies.
const { processDiyProjectCompletedEvent, DiyCompletionEffectsFailed, DIY_HOME_EVENT_KEY, DIY_COMPLETION_EVENT_KEY } = require('../../src/services/diy/diyCompletionEffects.ts');
const { assertDiyCompletionEventTypeAvailable } = require('../../src/services/diyCompletionStartupCheck.ts');
const { isTerminalDomainEventError } = require('../../src/services/domainEvents/terminalDomainEventError.ts');

const payload = (overrides = {}) => ({
  projectId: 'p1', propertyId: 'prop-1', actorUserId: 'dana', completedAt: '2026-10-06T12:00:00.000Z', title: 'Paint a room', category: 'PAINTING',
  actualMinutes: 90, actualMaterialCostCents: 5000, maintenanceTaskId: 'task-1', ...overrides,
});

// Stateful fakes: home events by key, tasks by id; each call is recorded. `fail` injects a failure for a named call.
function world({ tasks = { 'task-1': { id: 'task-1', propertyId: 'prop-1', status: 'PENDING' } }, fail = {}, raceTo } = {}) {
  const calls = [];
  const homeEvents = new Map();
  const links = [];
  const taskTable = structuredClone(tasks);
  const deps = {
    async getTask(id) { calls.push(['getTask', id]); return taskTable[id] ? { ...taskTable[id] } : null; },
    async ensureHomeEvent({ snapshot, eventType, idempotencyKey }) {
      calls.push(['ensureHomeEvent', snapshot.actorUserId, eventType, idempotencyKey]);
      if (fail.homeEvent) throw new Error('home event write failed');
      if (homeEvents.has(idempotencyKey)) return { id: homeEvents.get(idempotencyKey), existed: true };
      homeEvents.set(idempotencyKey, `he-${homeEvents.size + 1}`);
      return { id: homeEvents.get(idempotencyKey), existed: false };
    },
    async linkHomeEvent(projectId, id) { calls.push(['linkHomeEvent', projectId, id]); links.push(id); },
    async completeTask({ snapshot, taskId, completionKey }) {
      calls.push(['completeTask', snapshot.actorUserId, taskId, completionKey]);
      if (raceTo) { taskTable[taskId].status = raceTo; throw new Error('This task was changed by a concurrent update. Reload it and try again.'); }
      if (fail.task) throw new Error('maintenance write failed');
      taskTable[taskId].status = 'COMPLETED';
    },
  };
  return { deps, calls, homeEvents, taskTable, links, count: (name) => calls.filter(([n]) => n === name).length };
}
const run = (w, overrides) => processDiyProjectCompletedEvent({ id: 'ev-1', payload: payload(overrides) }, w.deps);

test('happy path: the home event and the governed task completion each run once, with the actor and the project keys', async () => {
  const w = world();
  const outcome = await run(w);
  assert.deepEqual(outcome, { homeEvent: 'DONE', maintenance: 'DONE' });
  assert.deepEqual(w.calls.find(([n]) => n === 'ensureHomeEvent'), ['ensureHomeEvent', 'dana', 'IMPROVEMENT', DIY_HOME_EVENT_KEY('p1')]);
  assert.deepEqual(w.calls.find(([n]) => n === 'completeTask'), ['completeTask', 'dana', 'task-1', DIY_COMPLETION_EVENT_KEY('p1')]);
  assert.equal(DIY_COMPLETION_EVENT_KEY('p1'), 'diy-project-completed:p1');
  assert.equal(DIY_HOME_EVENT_KEY('p1'), 'diy-complete-p1', 'the home event key is unchanged from the inline version');
  assert.deepEqual(w.links, ['he-1']);
});

test('the event type follows the category: painting, exterior and flooring are improvements, everything else maintenance', async () => {
  for (const [category, type] of [['PAINTING', 'IMPROVEMENT'], ['EXTERIOR', 'IMPROVEMENT'], ['FLOORING', 'IMPROVEMENT'], ['PLUMBING', 'MAINTENANCE'], ['GENERAL', 'MAINTENANCE']]) {
    const w = world(); await run(w, { category, maintenanceTaskId: null });
    assert.equal(w.calls.find(([n]) => n === 'ensureHomeEvent')[2], type, category);
  }
});

test('no linked task: NOT_LINKED, and no task lookup or completion is attempted', async () => {
  const w = world();
  assert.deepEqual(await run(w, { maintenanceTaskId: null }), { homeEvent: 'DONE', maintenance: 'NOT_LINKED' });
  assert.equal(w.count('getTask') + w.count('completeTask'), 0);
});

test('PREFLIGHT: a task on another property is a terminal integrity failure BEFORE any home event is created', async () => {
  const w = world({ tasks: { 'task-1': { id: 'task-1', propertyId: 'someone-elses-property', status: 'PENDING' } } });
  await assert.rejects(run(w), (error) => isTerminalDomainEventError(error) && error.code === 'INTEGRITY_CROSS_PROPERTY');
  assert.equal(w.count('ensureHomeEvent'), 0, 'nothing was created');
  assert.equal(w.count('completeTask'), 0);
  assert.equal(w.homeEvents.size, 0);
});

test('a deleted task is a typed skip for the task only; the home event is still created', async () => {
  const w = world({ tasks: {} });
  assert.deepEqual(await run(w), { homeEvent: 'DONE', maintenance: 'SKIPPED_TARGET_MISSING' });
  assert.equal(w.count('completeTask'), 0);
});

test('an already completed task is ALREADY_DONE and is not completed again (no second roll-forward or counter bump)', async () => {
  const w = world({ tasks: { 'task-1': { id: 'task-1', propertyId: 'prop-1', status: 'COMPLETED' } } });
  assert.deepEqual(await run(w), { homeEvent: 'DONE', maintenance: 'ALREADY_DONE' });
  assert.equal(w.count('completeTask'), 0);
});

test('home event succeeds and maintenance fails: the event fails, and the retry creates no second home event and completes the task once', async () => {
  const w = world({ fail: { task: true } });
  await assert.rejects(run(w), (error) => error instanceof DiyCompletionEffectsFailed && error.failures[0].effect === 'MAINTENANCE' && error.failures[0].reason === 'UNEXPECTED' && error.partial.homeEvent === 'DONE');
  w.deps.completeTask = async ({ taskId }) => { w.calls.push(['completeTask:retry']); w.taskTable[taskId].status = 'COMPLETED'; };
  assert.deepEqual(await run(w), { homeEvent: 'ALREADY_DONE', maintenance: 'DONE' });
  assert.equal(w.homeEvents.size, 1, 'exactly one home event across both attempts');
});

test('maintenance succeeds and the home event fails: the retry does not complete the task again', async () => {
  const w = world({ fail: { homeEvent: true } });
  await assert.rejects(run(w), (error) => error instanceof DiyCompletionEffectsFailed && error.failures[0].effect === 'HOME_EVENT');
  assert.equal(w.count('completeTask'), 1, 'the task effect was still attempted despite the earlier failure, and succeeded');
  assert.equal(w.taskTable['task-1'].status, 'COMPLETED');
  delete w.deps.ensureHomeEvent; w.deps.ensureHomeEvent = async () => ({ id: 'he-1', existed: false });
  assert.deepEqual(await run(w), { homeEvent: 'DONE', maintenance: 'ALREADY_DONE' });
  assert.equal(w.count('completeTask'), 1, 'no second completion, so no second recurring roll-forward');
});

test('a failing effect does not stop the other from being attempted', async () => {
  const w = world({ fail: { homeEvent: true } });
  await assert.rejects(run(w));
  assert.equal(w.count('ensureHomeEvent'), 1); assert.equal(w.count('completeTask'), 1);
});

test('RACE after the pre-read: the task became COMPLETED elsewhere, so the lost race is ALREADY_DONE, not a retry', async () => {
  const w = world({ raceTo: 'COMPLETED' });
  assert.deepEqual(await run(w), { homeEvent: 'DONE', maintenance: 'ALREADY_DONE' });
});

test('RACE after the pre-read: the task moved to another state, so it fails with the typed conflict', async () => {
  const w = world({ raceTo: 'CANCELLED' });
  await assert.rejects(run(w), (error) => error instanceof DiyCompletionEffectsFailed && error.failures[0].reason === 'CONFLICT_STATE' && /CANCELLED/.test(error.message));
});

test('a malformed snapshot is terminal and touches nothing', async () => {
  const w = world();
  for (const bad of [{ projectId: '' }, { propertyId: undefined }, { actorUserId: null }, { completedAt: 'not a date' }, { title: '  ' }]) {
    await assert.rejects(run(w, bad), (error) => isTerminalDomainEventError(error) && error.code === 'SNAPSHOT_INVALID');
  }
  assert.equal(w.calls.length, 0);
});

// ---- boundary rules --------------------------------------------------------------------------------------------------------------------------

const src = (relative) => fs.readFileSync(path.resolve(__dirname, '../../src', relative), 'utf8');
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) { if (e.name !== 'graphify-out') walk(f, out); } else if (f.endsWith('.ts')) out.push(f); } return out; };

test('the handler is pure: it imports nothing but the terminal-error class, and never touches incidents (O13)', () => {
  const handler = src('services/diy/diyCompletionEffects.ts');
  assert.deepEqual([...handler.matchAll(/^import .* from '(.*)';/gm)].map((m) => m[1]), ['../domainEvents/terminalDomainEventError']);
  assert.doesNotMatch(handler, /syncIncidentWorkItem|\.incident\b|from '[^']*prisma'/);
});

test('the internal maintenance completion is imported by the DIY adapters and nothing else, and the core is private on the class', () => {
  const importers = walk(path.resolve(__dirname, '../../src')).filter((file) => /completeMaintenanceTaskForDiyOutbox/.test(fs.readFileSync(file, 'utf8'))).map((file) => path.relative(path.resolve(__dirname, '../../src'), file));
  assert.deepEqual(importers.sort(), ['services/PropertyMaintenanceTask.service.ts', 'services/diy/diyCompletionEffectsAdapters.ts']);
  assert.match(src('services/PropertyMaintenanceTask.service.ts'), /private static async completeTaskCore\(/);
});

// ---- the fatal start-up check ------------------------------------------------------------------------------------------------------------------

test('start-up check: passes when the enum value exists, and FAILS (never warns) when it is missing or cannot be confirmed', async () => {
  await assertDiyCompletionEventTypeAvailable({ $queryRaw: async () => [{ present: 1 }] });
  await assert.rejects(assertDiyCompletionEventTypeAvailable({ $queryRaw: async () => [] }), /FATAL.*DIY_PROJECT_COMPLETED.*prisma db push/s);
  await assert.rejects(assertDiyCompletionEventTypeAvailable({ $queryRaw: async () => { throw new Error('connection refused'); } }), /FATAL.*could not confirm.*connection refused/s);
  const index = src('index.ts');
  assert.ok(index.indexOf('await assertDiyCompletionEventTypeAvailable();') > index.indexOf('assertAgentDeploymentReadiness()'), 'the check runs in startServer');
  assert.ok(index.indexOf('await assertDiyCompletionEventTypeAvailable();') < index.indexOf('app.listen(PORT'), 'and before the server listens');
});
