const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Slice 3b of docs/architecture/ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md: the read-only disclosure of completion effects (sections 3.4) and the recovery of a
// dead-lettered event (3.5). The real diy.service against the shared database-free fake. Not Postgres.
const { makeDiyDb } = require('../helpers/diyTemplateFake.js');
const { describeCompletionEffects, COMPLETION_EFFECTS_COPY } = require('../../src/services/diy/completionEffectsStatus.ts');

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
const seed = (h, { status = 'COMPLETED', event } = {}) => {
  h.state.projects.push({ id: 'p1', propertyId: 'prop-1', userId: 'creator', title: 'Paint', category: 'PAINTING', status, updatedAt: T0, steps: [], materials: [], tools: [], aiGuide: null });
  if (event) h.state.domainEvents.push({ id: 'ev-1', type: 'DIY_PROJECT_COMPLETED', idempotencyKey: 'diy-project-completed:p1', payload: { projectId: 'p1' }, attempts: 8, lastError: 'MAINTENANCE:UNEXPECTED: boom', availableAt: T0, updatedAt: T0, ...event });
};
const effects = async (h) => (await h.diyService.getProjectWithCompletionEffects('p1', 'prop-1')).completionEffects;
const retry = (h, actor = 'dana', property = 'prop-1') => h.diyService.retryCompletionEffects('p1', property, actor);

test('the mapping: retrying FAILED is "recording" with no recovery; only a dead letter offers recovery; legacy is honest; an open project shows nothing', () => {
  const view = (project, event) => describeCompletionEffects(project, event);
  assert.equal(view('IN_PROGRESS', 'PENDING'), null);
  assert.equal(view('PLANNING', null), null);
  for (const status of ['PENDING', 'PROCESSING', 'FAILED']) assert.deepEqual(view('COMPLETED', status), { state: 'RECORDING', summary: 'Recording your completion.', canRecover: false }, status);
  assert.deepEqual(view('COMPLETED', 'DEAD_LETTER'), { state: 'NEEDS_ATTENTION', summary: 'Some records could not be updated.', canRecover: true });
  assert.deepEqual(view('COMPLETED', 'PROCESSED'), { state: 'RECORDED', summary: 'Completion recorded.', canRecover: false });
  assert.deepEqual(view('COMPLETED', null), { state: 'LEGACY_UNKNOWN', summary: 'Completion was recorded before effect tracking was added. Related record updates are not verified here.', canRecover: false });
  assert.ok(!JSON.stringify(COMPLETION_EFFECTS_COPY).includes('boom'));
});

test('the project read discloses each state and WRITES NOTHING (a spy on every write), and never shows the raw error', async () => {
  for (const [status, expected] of [['PENDING', 'RECORDING'], ['PROCESSING', 'RECORDING'], ['FAILED', 'RECORDING'], ['DEAD_LETTER', 'NEEDS_ATTENTION'], ['PROCESSED', 'RECORDED']]) {
    const h = harness(); seed(h, { event: { status } });
    const before = JSON.stringify(h.state.domainEvents);
    const project = await h.diyService.getProjectWithCompletionEffects('p1', 'prop-1');
    assert.equal(project.completionEffects.state, expected, status);
    assert.equal(h.state.writes.length, 0, `${status}: no write during a read`);
    assert.equal(JSON.stringify(h.state.domainEvents), before, `${status}: the event row is untouched`);
    assert.ok(!JSON.stringify(project.completionEffects).includes('boom'), 'no raw error text');
  }
  const legacy = harness(); seed(legacy);
  assert.equal((await effects(legacy)).state, 'LEGACY_UNKNOWN');
  const open = harness(); seed(open, { status: 'IN_PROGRESS' });
  assert.equal(await effects(open), null);
});

test('recovery resets ONLY a dead letter: the same row, attempts zero, retry due now, and the actor, time and count recorded in its payload', async () => {
  const h = harness(); seed(h, { event: { status: 'DEAD_LETTER', payload: { projectId: 'p1', processingOutcome: undefined, snapshot: 'kept' } } });
  const result = await retry(h);
  assert.equal(result.reset, true);
  assert.equal(result.completionEffects.state, 'RECORDING');
  assert.equal(h.state.domainEvents.length, 1, 'the same row, never a second one');
  const [row] = h.state.domainEvents;
  assert.deepEqual([row.status, row.attempts, row.lastError, row.leaseExpiresAt], ['PENDING', 0, null, null]);
  assert.ok(row.availableAt.getTime() >= T0.getTime() + 1);
  assert.equal(row.payload.snapshot, 'kept', 'the snapshot is not lost');
  assert.deepEqual([row.payload.recovery.count, row.payload.recovery.lastBy, typeof row.payload.recovery.lastAt], [1, 'dana', 'string']);
});

test('recovery leaves every other state alone: PENDING, PROCESSING, FAILED (still retrying) and PROCESSED are untouched, and the answer is the current state', async () => {
  for (const status of ['PENDING', 'PROCESSING', 'FAILED', 'PROCESSED']) {
    const h = harness(); seed(h, { event: { status, attempts: 3 } });
    const before = JSON.stringify(h.state.domainEvents);
    const result = await retry(h);
    assert.equal(result.reset, false, status);
    assert.equal(JSON.stringify(h.state.domainEvents), before, `${status}: nothing changed (retry count and backoff intact)`);
    assert.equal(h.state.writes.filter((write) => write.model === 'domainEvent').length, 0, `${status}: not even a conditional write was attempted`);
  }
  const legacy = harness(); seed(legacy);
  assert.deepEqual(await retry(legacy), { reset: false, completionEffects: { state: 'LEGACY_UNKNOWN', summary: COMPLETION_EFFECTS_COPY.LEGACY_UNKNOWN, canRecover: false } });
  assert.equal(legacy.state.domainEvents.length, 0, 'no outbox row is invented for a legacy project');
});

test('two simultaneous recoveries reset the dead letter once, and the count is 1', async () => {
  const h = harness(); seed(h, { event: { status: 'DEAD_LETTER' } });
  const results = await Promise.all([retry(h, 'dana'), retry(h, 'sam')]);
  assert.equal(results.filter((result) => result.reset).length, 1);
  assert.equal(h.state.domainEvents[0].payload.recovery.count, 1);
});

test('a second dead-lettering and recovery increments the count and keeps only the latest actor', async () => {
  const h = harness(); seed(h, { event: { status: 'DEAD_LETTER' } });
  await retry(h, 'dana');
  Object.assign(h.state.domainEvents[0], { status: 'DEAD_LETTER', attempts: 8 });
  await retry(h, 'sam');
  assert.deepEqual([h.state.domainEvents[0].payload.recovery.count, h.state.domainEvents[0].payload.recovery.lastBy], [2, 'sam']);
});

test('a viewer, a stranger and a project from another property are refused, and nothing changes', async () => {
  for (const role of [null, 'VIEWER']) {
    const h = harness({ role: () => role }); seed(h, { event: { status: 'DEAD_LETTER' } });
    await assert.rejects(retry(h), (error) => error.statusCode === 403);
    assert.equal(h.state.domainEvents[0].status, 'DEAD_LETTER');
  }
  const h = harness(); seed(h, { event: { status: 'DEAD_LETTER' } });
  await assert.rejects(retry(h, 'dana', 'other-property'), (error) => error.statusCode === 404);
  assert.equal(h.state.domainEvents[0].status, 'DEAD_LETTER');
});

test('the route is behind the contributor floor and the controller replies with the effects view', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const routes = fs.readFileSync(path.resolve(__dirname, '../../src/routes/diy.routes.ts'), 'utf8');
  assert.match(routes, /router\.post\('\/properties\/:propertyId\/diy\/projects\/:projectId\/completion-effects\/retry', propertyAuthMiddleware, requireHouseholdRole\('CONTRIBUTOR'\), retryCompletionEffects\)/);
  const controller = fs.readFileSync(path.resolve(__dirname, '../../src/controllers/diy.controller.ts'), 'utf8');
  assert.match(controller, /effects: 'RECORDING'/);
});
