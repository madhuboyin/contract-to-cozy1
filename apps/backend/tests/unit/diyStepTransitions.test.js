const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Slice 2a of docs/architecture/ASK_COZY_DIY_STEP_TRANSITIONS_PLAN.md: actor-aware, version-checked, atomic DIY step and project transitions and the
// completion rule. The real diy.service against the shared database-free fake (serialized transactions with rollback, conditional writes). Not Postgres.

const { makeDiyDb } = require('../helpers/diyTemplateFake.js');
const { evaluateStepTransition, openStepsForCompletion } = require('../../src/services/diy/stepTransitions.ts');

const completions = [];
function harness(hooks) {
  const db = makeDiyDb([], hooks);
  completions.length = 0;
  const stub = (relative, exports) => { const resolved = require.resolve(relative); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports }; };
  stub('../../src/lib/prisma.ts', { prisma: db });
  stub('../../src/lib/logger.ts', { logger: { info() {}, warn() {}, error() {} }, auditLog() {}, redactEmail: (value) => value });
  stub('../../src/modules/propertyContext/index.ts', { getPropertyContext: async () => ({}) });
  stub('../../src/services/diy/applicabilityPolicy.ts', { evaluateDiyApplicability: () => ({ status: 'APPLICABLE' }) });
  stub('../../src/services/diyCompletion.service.ts', { diyCompletionService: { onComplete: async (project, actor) => { completions.push({ projectId: project.id, actor }); } } });
  delete require.cache[require.resolve('../../src/services/diy.service.ts')];
  const { diyService } = require('../../src/services/diy.service.ts');
  return { db, state: db.state, diyService };
}

const T0 = new Date('2026-10-06T12:00:00.000Z');
const step = (id, stepNumber, extra = {}) => ({ id, stepNumber, title: `Step ${stepNumber}`, description: 'Do it.', isOptional: false, status: 'PENDING', notes: null, completedAt: null, completedByUserId: null, safetyNote: null, updatedAt: new Date(T0.getTime() + stepNumber), ...extra });
function seedProject(h, overrides = {}) {
  h.state.projects.push({
    id: 'p1', propertyId: 'prop-1', userId: 'creator', status: 'PLANNING', startedAt: null, completedAt: null, completedByUserId: null, notesJson: null, updatedAt: T0, materials: [], tools: [], aiGuide: null,
    steps: [step('s1', 1, { safetyNote: 'Turn the power off first.' }), step('s2', 2), step('s3', 3, { isOptional: true }), step('s4', 4, { isOptional: true, safetyNote: 'Wear gloves.' })],
    ...overrides,
  });
}
const project = (h) => h.state.projects[0];
const stepRow = (h, id) => project(h).steps.find((row) => row.id === id);
const tok = (h, id) => stepRow(h, id).updatedAt.toISOString();
const ptok = (h) => project(h).updatedAt.toISOString();
const ctx = (h, id, actor = 'alice') => ({ actorUserId: actor, expectedUpdatedAt: tok(h, id) });
const move = (h, id, status, actor, notes) => h.diyService.updateStep('p1', 'prop-1', id, { status, ...(notes !== undefined ? { notes } : {}) }, ctx(h, id, actor));
const finish = (h, actor = 'alice', payload = {}) => h.diyService.completeProject('p1', 'prop-1', payload, { actorUserId: actor, expectedUpdatedAt: ptok(h) });
const rejectsWith = (promise, code) => assert.rejects(promise, (error) => error.code === code, code);
const resolveAll = async (h) => { for (const id of ['s1', 's2']) await move(h, id, 'COMPLETED'); await move(h, 's3', 'SKIPPED'); await move(h, 's4', 'COMPLETED'); };

// ---- the rules, as pure functions --------------------------------------------------------------------------------------------------------------

test('transition table: every allowed move, every refusal, and the same status as "already"', () => {
  const required = { isOptional: false, safetyNote: null };
  const decide = (from, to, extra = {}) => evaluateStepTransition({ status: from, ...required, ...extra }, to);
  assert.deepEqual(decide('PENDING', 'IN_PROGRESS'), { kind: 'ALLOWED', event: 'STEP_STARTED' });
  assert.deepEqual(decide('PENDING', 'COMPLETED'), { kind: 'ALLOWED', event: 'STEP_COMPLETED' });
  assert.deepEqual(decide('IN_PROGRESS', 'COMPLETED'), { kind: 'ALLOWED', event: 'STEP_COMPLETED' });
  assert.deepEqual(decide('COMPLETED', 'IN_PROGRESS'), { kind: 'ALLOWED', event: 'STEP_REOPENED' });
  assert.deepEqual(decide('SKIPPED', 'IN_PROGRESS', { isOptional: true }), { kind: 'ALLOWED', event: 'STEP_REOPENED' });
  assert.deepEqual(decide('PENDING', 'SKIPPED', { isOptional: true }), { kind: 'ALLOWED', event: 'STEP_SKIPPED' });
  assert.deepEqual(decide('IN_PROGRESS', 'SKIPPED', { isOptional: true, safetyNote: '   ' }), { kind: 'ALLOWED', event: 'STEP_SKIPPED' }, 'a blank safety note is no safety note');
  for (const status of ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED']) assert.deepEqual(decide(status, status), { kind: 'ALREADY' });
  assert.deepEqual(decide('PENDING', 'SKIPPED'), { kind: 'REFUSED', reason: 'SKIP_REQUIRED_STEP' });
  assert.deepEqual(decide('PENDING', 'SKIPPED', { isOptional: true, safetyNote: 'Wear gloves.' }), { kind: 'REFUSED', reason: 'SKIP_SAFETY_STEP' });
  for (const from of ['IN_PROGRESS', 'COMPLETED', 'SKIPPED']) assert.deepEqual(decide(from, 'PENDING'), { kind: 'REFUSED', reason: 'NOT_ALLOWED' }, `${from} cannot go back to pending`);
  assert.deepEqual(decide('COMPLETED', 'SKIPPED', { isOptional: true }), { kind: 'REFUSED', reason: 'NOT_ALLOWED' });
  assert.deepEqual(decide('SKIPPED', 'COMPLETED'), { kind: 'REFUSED', reason: 'NOT_ALLOWED' });
});

test('completion rule: required steps COMPLETED, optional steps COMPLETED or SKIPPED, no steps is fine', () => {
  const rows = (...pairs) => pairs.map(([isOptional, status], index) => ({ id: `s${index}`, stepNumber: index + 1, title: `S${index}`, isOptional, status }));
  assert.deepEqual(openStepsForCompletion([]), []);
  assert.deepEqual(openStepsForCompletion(rows([false, 'COMPLETED'], [true, 'SKIPPED'], [true, 'COMPLETED'])), []);
  assert.deepEqual(openStepsForCompletion(rows([false, 'COMPLETED'], [false, 'SKIPPED'])).map((row) => row.id), ['s1'], 'a required step cannot be skipped into completion');
  assert.deepEqual(openStepsForCompletion(rows([false, 'COMPLETED'], [true, 'PENDING'], [true, 'IN_PROGRESS'])).map((row) => row.id), ['s1', 's2'], 'untouched optional steps block it too');
});

// ---- step transitions through the service -------------------------------------------------------------------------------------------------------

test('starting a step starts the project, records the actor in the ledger, and moves the step version forward', async () => {
  const h = harness(); seedProject(h);
  const before = tok(h, 's2');
  const { step: result, alreadyApplied } = await move(h, 's2', 'IN_PROGRESS', 'alice');
  assert.equal(alreadyApplied, false);
  assert.equal(result.status, 'IN_PROGRESS');
  assert.notEqual(result.updatedAt.toISOString(), before);
  assert.deepEqual([project(h).status, project(h).startedAt instanceof Date], ['IN_PROGRESS', true]);
  assert.deepEqual(h.state.events.map((event) => [event.type, event.actorUserId, event.fromStatus, event.toStatus, event.stepId]), [['STEP_STARTED', 'alice', 'PENDING', 'IN_PROGRESS', 's2']]);
});

test('completing a step records who and when; reopening clears both and is its own ledger event', async () => {
  const h = harness(); seedProject(h);
  await move(h, 's2', 'COMPLETED', 'bob');
  assert.deepEqual([stepRow(h, 's2').completedByUserId, stepRow(h, 's2').completedAt instanceof Date], ['bob', true]);
  assert.equal(project(h).status, 'IN_PROGRESS', 'completing a pending step also starts the project');
  await move(h, 's2', 'IN_PROGRESS', 'carol');
  assert.deepEqual([stepRow(h, 's2').status, stepRow(h, 's2').completedByUserId, stepRow(h, 's2').completedAt], ['IN_PROGRESS', null, null]);
  assert.deepEqual(h.state.events.map((event) => [event.type, event.actorUserId]), [['STEP_COMPLETED', 'bob'], ['STEP_REOPENED', 'carol']]);
});

test('skip: allowed for an optional step without a safety note; refused for a required step and for an optional step that has a safety note', async () => {
  const h = harness(); seedProject(h);
  await move(h, 's3', 'SKIPPED', 'alice');
  assert.equal(stepRow(h, 's3').status, 'SKIPPED');
  assert.equal(h.state.events.at(-1).type, 'STEP_SKIPPED');
  await rejectsWith(move(h, 's2', 'SKIPPED'), 'DIY_STEP_TRANSITION_NOT_ALLOWED');
  await assert.rejects(move(h, 's4', 'SKIPPED'), (error) => error.code === 'DIY_STEP_TRANSITION_NOT_ALLOWED' && error.details.reason === 'SKIP_SAFETY_STEP');
  assert.deepEqual([stepRow(h, 's2').status, stepRow(h, 's4').status], ['PENDING', 'PENDING']);
});

test('refused moves change nothing and write no ledger row: back to pending, and any change to a step in a closed project', async () => {
  const h = harness(); seedProject(h);
  await move(h, 's2', 'COMPLETED');
  const events = h.state.events.length;
  await rejectsWith(move(h, 's2', 'PENDING'), 'DIY_STEP_TRANSITION_NOT_ALLOWED');
  assert.equal(h.state.events.length, events);
  project(h).status = 'COMPLETED';
  await rejectsWith(move(h, 's1', 'COMPLETED'), 'DIY_PROJECT_CLOSED');
  await rejectsWith(move(h, 's2', 'IN_PROGRESS'), 'DIY_PROJECT_CLOSED');
  assert.equal(stepRow(h, 's1').status, 'PENDING');
});

test('the version token is required, and a stale one is refused with the current state, never overwritten', async () => {
  const h = harness(); seedProject(h);
  await assert.rejects(h.diyService.updateStep('p1', 'prop-1', 's2', { status: 'COMPLETED' }, { actorUserId: 'a' }), (error) => error.statusCode === 400 && error.code === 'DIY_TOKEN_REQUIRED');
  await assert.rejects(h.diyService.updateStep('p1', 'prop-1', 's2', { status: 'COMPLETED' }, { actorUserId: 'a', expectedUpdatedAt: 'not a date' }), (error) => error.code === 'DIY_TOKEN_REQUIRED');
  const stale = tok(h, 's2');
  await move(h, 's2', 'IN_PROGRESS', 'alice'); // someone else moves it on
  await assert.rejects(
    h.diyService.updateStep('p1', 'prop-1', 's2', { status: 'COMPLETED' }, { actorUserId: 'bob', expectedUpdatedAt: stale }),
    (error) => error.statusCode === 409 && error.code === 'DIY_STALE' && error.details.status === 'IN_PROGRESS' && error.details.updatedAt === tok(h, 's2'),
  );
  assert.equal(stepRow(h, 's2').status, 'IN_PROGRESS', 'the stale request changed nothing');
});

test('idempotent by resulting state: repeating a request that is already true is a no-op even with a stale token, and notes-only updates need a current token', async () => {
  const h = harness(); seedProject(h);
  const stale = tok(h, 's2');
  await move(h, 's2', 'COMPLETED', 'alice');
  const writes = h.state.writes.length; const events = h.state.events.length;
  const again = await h.diyService.updateStep('p1', 'prop-1', 's2', { status: 'COMPLETED' }, { actorUserId: 'alice', expectedUpdatedAt: stale });
  assert.equal(again.alreadyApplied, true);
  assert.deepEqual([h.state.writes.length, h.state.events.length], [writes, events], 'no write, no ledger row');

  await move(h, 's1', 'IN_PROGRESS');
  const noted = await move(h, 's1', 'IN_PROGRESS', 'alice', 'Used the garage panel');
  assert.deepEqual([noted.alreadyApplied, noted.step.notes], [false, 'Used the garage panel']);
  assert.equal(h.state.events.filter((event) => event.stepId === 's1').length, 1, 'a notes-only update is not a transition');
  await assert.rejects(h.diyService.updateStep('p1', 'prop-1', 's1', { status: 'IN_PROGRESS', notes: 'late' }, { actorUserId: 'a', expectedUpdatedAt: T0.toISOString() }), (error) => error.code === 'DIY_STALE');
});

test('a step that is not in the project, or a project that is not in the property, is not found', async () => {
  const h = harness(); seedProject(h);
  await assert.rejects(h.diyService.updateStep('p1', 'prop-1', 'nope', { status: 'COMPLETED' }, { actorUserId: 'a', expectedUpdatedAt: T0.toISOString() }), (error) => error.statusCode === 404);
  await assert.rejects(h.diyService.updateStep('p1', 'other-property', 's2', { status: 'COMPLETED' }, ctx(h, 's2')), (error) => error.statusCode === 404);
});

// ---- completion ---------------------------------------------------------------------------------------------------------------------------------

test('a project cannot complete with a required step open or an optional step untouched, and the refusal lists them and changes nothing', async () => {
  const h = harness(); seedProject(h);
  await move(h, 's1', 'COMPLETED'); await move(h, 's2', 'COMPLETED');
  await assert.rejects(finish(h), (error) => error.statusCode === 409 && error.code === 'DIY_PROJECT_STEPS_INCOMPLETE' && error.details.openSteps.map((row) => row.id).join() === 's3,s4');
  assert.deepEqual([project(h).status, completions.length], ['IN_PROGRESS', 0]);
  await move(h, 's3', 'SKIPPED');
  await assert.rejects(finish(h), (error) => error.details.openSteps.map((row) => row.id).join() === 's4');
  await move(h, 's2', 'IN_PROGRESS');
  await assert.rejects(finish(h), (error) => error.details.openSteps.map((row) => row.id).join() === 's2,s4');
});

test('completing a fully resolved project records the actor, the ledger and the completion effects, and returns the closed project', async () => {
  const h = harness(); seedProject(h);
  await resolveAll(h);
  const done = await finish(h, 'dana', { actualMinutes: 90, notes: 'All good.' });
  assert.deepEqual([done.status, done.completedByUserId, done.actualMinutes], ['COMPLETED', 'dana', 90]);
  assert.deepEqual(done.notesJson.map((note) => note.text), ['All good.']);
  assert.deepEqual(completions, [{ projectId: 'p1', actor: 'dana' }], 'the effects are attributed to the actor, not the creator');
  assert.deepEqual(h.state.events.at(-1), { ...h.state.events.at(-1), type: 'PROJECT_COMPLETED', actorUserId: 'dana', fromStatus: 'IN_PROGRESS', toStatus: 'COMPLETED' });
  await rejectsWith(finish(h, 'dana'), 'DIY_PROJECT_CLOSED');
  assert.equal(completions.length, 1, 'no second set of effects');
});

test('a project with no steps can be completed; a stale project token cannot', async () => {
  const empty = harness(); seedProject(empty, { steps: [] });
  assert.equal((await finish(empty)).status, 'COMPLETED');
  const h = harness(); seedProject(h);
  const stale = ptok(h);
  await resolveAll(h); // every step transition moves the project's version
  await assert.rejects(h.diyService.completeProject('p1', 'prop-1', {}, { actorUserId: 'a', expectedUpdatedAt: stale }), (error) => error.code === 'DIY_STALE' && error.details.status === 'IN_PROGRESS');
  await assert.rejects(h.diyService.completeProject('p1', 'prop-1', {}, { actorUserId: 'a' }), (error) => error.code === 'DIY_TOKEN_REQUIRED');
  assert.equal(project(h).status, 'IN_PROGRESS');
});

// ---- abandon ------------------------------------------------------------------------------------------------------------------------------------

test('abandon and hire out: conditional on an open project and the token, attributed, and never able to overwrite a finished project', async () => {
  const h = harness(); seedProject(h);
  const stale = ptok(h);
  await move(h, 's2', 'IN_PROGRESS');
  await rejectsWith(h.diyService.abandonProject('p1', 'prop-1', false, { actorUserId: 'a', expectedUpdatedAt: stale }), 'DIY_STALE');
  const hired = await h.diyService.abandonProject('p1', 'prop-1', true, { actorUserId: 'erin', expectedUpdatedAt: ptok(h) });
  assert.deepEqual([hired.status, hired.abandonedAt instanceof Date], ['HIRED_OUT', true]);
  assert.deepEqual(h.state.events.at(-1), { ...h.state.events.at(-1), type: 'PROJECT_HIRED_OUT', actorUserId: 'erin', fromStatus: 'IN_PROGRESS', toStatus: 'HIRED_OUT' });
  await rejectsWith(h.diyService.abandonProject('p1', 'prop-1', false, { actorUserId: 'a', expectedUpdatedAt: ptok(h) }), 'DIY_PROJECT_CLOSED');
  assert.equal(project(h).status, 'HIRED_OUT');

  const done = harness(); seedProject(done); await resolveAll(done); await finish(done);
  await rejectsWith(done.diyService.abandonProject('p1', 'prop-1', false, { actorUserId: 'a', expectedUpdatedAt: ptok(done) }), 'DIY_PROJECT_CLOSED');
  assert.equal(project(done).status, 'COMPLETED', 'a completed project is not overwritten by abandon');
});

// ---- atomicity ----------------------------------------------------------------------------------------------------------------------------------

test('a failure part-way through a step transition rolls back the claim, the step, the project start and the ledger', async () => {
  let armed = false;
  const h = harness({ fail: (name) => armed && name === 'event.create' }); seedProject(h);
  const before = { project: structuredClone(project(h)), version: tok(h, 's2') };
  armed = true;
  await assert.rejects(move(h, 's2', 'COMPLETED'), /injected failure/);
  assert.deepEqual([project(h).status, project(h).updatedAt.getTime(), stepRow(h, 's2').status, tok(h, 's2'), h.state.events.length], ['PLANNING', before.project.updatedAt.getTime(), 'PENDING', before.version, 0]);
});

test('a failure while completing leaves the project open and writes no completion effects', async () => {
  let armed = false;
  const h = harness({ fail: (name) => armed && name === 'event.create' }); seedProject(h); await resolveAll(h);
  armed = true;
  await assert.rejects(finish(h), /injected failure/);
  assert.deepEqual([project(h).status, project(h).completedByUserId, completions.length], ['IN_PROGRESS', null, 0]);
});

// ---- concurrency --------------------------------------------------------------------------------------------------------------------------------

test('two simultaneous completions of one step: one transition, the other is "already applied", one ledger row', async () => {
  const h = harness(); seedProject(h);
  const token = tok(h, 's2');
  const results = await Promise.allSettled([
    h.diyService.updateStep('p1', 'prop-1', 's2', { status: 'COMPLETED' }, { actorUserId: 'alice', expectedUpdatedAt: token }),
    h.diyService.updateStep('p1', 'prop-1', 's2', { status: 'COMPLETED' }, { actorUserId: 'bob', expectedUpdatedAt: token }),
  ]);
  assert.deepEqual(results.map((result) => result.status), ['fulfilled', 'fulfilled']);
  assert.deepEqual(results.map((result) => result.value.alreadyApplied).sort(), [false, true]);
  assert.equal(h.state.events.filter((event) => event.type === 'STEP_COMPLETED').length, 1);
  assert.equal(stepRow(h, 's2').completedByUserId, h.state.events.find((event) => event.type === 'STEP_COMPLETED').actorUserId);
});

test('two writers on the same step with the same token, asking for different things: exactly one wins and the other is told the step changed', async () => {
  const h = harness(); seedProject(h);
  const token = tok(h, 's3');
  const results = await Promise.allSettled([
    h.diyService.updateStep('p1', 'prop-1', 's3', { status: 'COMPLETED' }, { actorUserId: 'a', expectedUpdatedAt: token }),
    h.diyService.updateStep('p1', 'prop-1', 's3', { status: 'SKIPPED' }, { actorUserId: 'b', expectedUpdatedAt: token }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'DIY_STALE');
  assert.equal(h.state.events.filter((event) => event.stepId === 's3').length, 1);
});

test('completion racing a reopen: the project never ends COMPLETED with a step that is not done, in either order', async () => {
  for (const order of ['reopen-first', 'complete-first']) {
    const h = harness(); seedProject(h); await resolveAll(h);
    const reopen = () => move(h, 's2', 'IN_PROGRESS', 'alice');
    const complete = () => finish(h, 'bob');
    const results = await Promise.allSettled(order === 'reopen-first' ? [reopen(), complete()] : [complete(), reopen()]);
    const completed = project(h).status === 'COMPLETED';
    const stillOpen = project(h).steps.some((row) => (row.isOptional ? !['COMPLETED', 'SKIPPED'].includes(row.status) : row.status !== 'COMPLETED'));
    assert.equal(completed && stillOpen, false, `${order}: a completed project has no open step (${JSON.stringify(results.map((r) => r.status === 'rejected' ? r.reason.code : 'ok'))})`);
    assert.ok(results.some((result) => result.status === 'fulfilled'), `${order}: one of them succeeded`);
  }
});

test('versions strictly increase even when the clock does not move, so a stale token can never match a later state', async (t) => {
  const h = harness(); seedProject(h);
  t.mock.method(Date, 'now', () => T0.getTime() + 10_000); // a frozen clock
  const seen = new Set([tok(h, 's2')]);
  for (const status of ['IN_PROGRESS', 'COMPLETED', 'IN_PROGRESS', 'COMPLETED']) {
    await move(h, 's2', status);
    const version = tok(h, 's2');
    assert.equal(seen.has(version), false, `a new version after ${status}`);
    seen.add(version);
  }
  const projectVersions = new Set([T0.toISOString()]);
  for (const id of ['s3', 's3', 's1']) {
    try { await move(h, id, id === 's1' ? 'COMPLETED' : 'SKIPPED'); } catch { /* the second skip is a no-op */ }
    projectVersions.add(ptok(h));
  }
  assert.ok(projectVersions.size >= 3, 'the project version also moves forward on a frozen clock');
});
