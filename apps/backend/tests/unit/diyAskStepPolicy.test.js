const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Step 6, slice 6a of docs/architecture/ASK_COZY_DIY_STEP_COMMANDS_PLAN.md (sections 3.2.1 and 3.9): the pure Ask step policy and the canonical context
// version, and the service's transaction-bound authorization and `requireCurrentGuideStep` policy, on the shared database-free fake. Not Postgres.
const { makeDiyDb } = require('../helpers/diyTemplateFake.js');
const { buildRevisionContent, computeContentHash } = require('../../src/services/diyTemplateRevision.service.ts');
const { stepSnapshotId } = require('../../src/services/diyPublishedTemplate.ts');
const policy = require('../../src/services/diy/askStepPolicy.ts');

const T0 = new Date('2026-10-06T12:00:00.000Z');
const template = () => ({
  id: 't1', slug: 'repaint-hallway', title: 'Repaint a hallway', shortDescription: 'Fresh coat of paint.', longDescription: 'Longer text.', category: 'PAINTING',
  difficultyLevel: 'EASY', requiredSkillLevel: 'BEGINNER', safetyLevel: 'LOW', permitRequirement: 'NOT_REQUIRED', estimatedMinutes: 120, tags: ['paint'],
  steps: [
    { stepNumber: 1, title: 'Tape the trim', description: 'Apply painter tape along the trim.', estimatedMinutes: 20, isOptional: false, safetyNote: 'Keep a window open while you work.', tipNote: null },
    { stepNumber: 2, title: 'Cut in the edges', description: 'Brush the corners first.', estimatedMinutes: 30, isOptional: false, safetyNote: null, tipNote: null },
    { stepNumber: 3, title: 'Touch up', description: 'Fix any misses.', estimatedMinutes: 10, isOptional: true, safetyNote: null, tipNote: null },
    { stepNumber: 4, title: 'Wipe the tools', description: 'Clean the brushes.', estimatedMinutes: 10, isOptional: true, safetyNote: 'Wear gloves.', tipNote: null },
  ],
  materials: [], tools: [],
});
const revisionRow = (overrides = {}) => {
  const content = buildRevisionContent(template());
  return { id: 'rev-1', templateId: 't1', revision: 1, provenance: 'GOVERNED', ...content.columns, contentJson: content.contentJson, contentHash: computeContentHash(content), retiredAt: null, retiredReason: null, ...overrides };
};
const stepRows = (revision, statuses = {}) => revision.contentJson.steps.map((step, i) => ({
  id: `s${i + 1}`, stepNumber: step.stepNumber, templateStepId: stepSnapshotId(revision.id, step.stepNumber), title: step.title, description: step.description,
  estimatedMinutes: step.estimatedMinutes ?? null, isOptional: step.isOptional, safetyNote: step.safetyNote ?? null, tipNote: step.tipNote ?? null,
  status: statuses[step.stepNumber] ?? 'PENDING', notes: null, completedAt: null, completedByUserId: null, updatedAt: new Date(T0.getTime() + step.stepNumber),
}));
function pureSource({ statuses = {}, revision = revisionRow(), head, project = {} } = {}) {
  return {
    project: { id: 'p1', title: 'Repaint', status: 'IN_PROGRESS', category: 'PAINTING', templateId: 't1', aiGuideId: null, templateRevisionId: revision.id, completionBasis: null, updatedAt: T0, steps: stepRows(revision, statuses), ...project },
    revision, head: head === undefined ? { publishedRevisionId: revision.id } : head,
  };
}

// ---- the pure policy -------------------------------------------------------------------------------------------------------------------------------

test('policy: only the first unfinished step may be completed; any other step is "not current"', () => {
  assert.deepEqual(policy.evaluateAskStepPolicy(pureSource(), 's1', 'COMPLETED'), { ok: true });
  assert.equal(policy.evaluateAskStepPolicy(pureSource(), 's2', 'COMPLETED').code, 'DIY_STEP_NOT_CURRENT', 'a later step');
  assert.equal(policy.evaluateAskStepPolicy(pureSource({ statuses: { 1: 'COMPLETED' } }), 's1', 'COMPLETED').code, 'DIY_STEP_NOT_CURRENT', 'an already finished step is not current');
  assert.deepEqual(policy.evaluateAskStepPolicy(pureSource({ statuses: { 1: 'COMPLETED' } }), 's2', 'COMPLETED'), { ok: true });
  assert.equal(policy.currentStepOf(pureSource({ statuses: { 1: 'COMPLETED', 2: 'SKIPPED' } }).project.steps).id, 's3');
  assert.equal(policy.currentStepOf(pureSource({ statuses: { 1: 'COMPLETED', 2: 'COMPLETED', 3: 'SKIPPED', 4: 'COMPLETED' } }).project.steps), null);
  assert.equal(policy.evaluateAskStepPolicy(pureSource({ statuses: { 1: 'COMPLETED', 2: 'COMPLETED', 3: 'SKIPPED', 4: 'COMPLETED' } }), 's4', 'COMPLETED').code, 'DIY_STEP_NOT_CURRENT', 'nothing is current once every step is finished');
});

test('policy: an in-progress step is still current; Ask offers only COMPLETED and SKIPPED', () => {
  assert.deepEqual(policy.evaluateAskStepPolicy(pureSource({ statuses: { 1: 'IN_PROGRESS' } }), 's1', 'COMPLETED'), { ok: true });
  for (const target of ['IN_PROGRESS', 'PENDING', 'REOPEN', undefined]) {
    const d = policy.evaluateAskStepPolicy(pureSource(), 's1', target);
    assert.deepEqual([d.ok, d.code, d.reason], [false, 'DIY_STEP_TRANSITION_NOT_ALLOWED', 'TARGET_NOT_OFFERED']);
  }
});

test('policy: skip only an optional step with no safety note, restated here even though the transition table also checks it', () => {
  const at3 = { 1: 'COMPLETED', 2: 'COMPLETED' };
  assert.deepEqual(policy.evaluateAskStepPolicy(pureSource({ statuses: at3 }), 's3', 'SKIPPED'), { ok: true });
  assert.equal(policy.evaluateAskStepPolicy(pureSource(), 's1', 'SKIPPED').reason, 'SKIP_REQUIRED_STEP');
  assert.equal(policy.evaluateAskStepPolicy(pureSource({ statuses: { ...at3, 3: 'SKIPPED' } }), 's4', 'SKIPPED').reason, 'SKIP_SAFETY_STEP');
});

test('policy: a withdrawn, corrupted, ineligible or finished guide offers nothing; a superseded one still works', () => {
  const code = (input) => policy.evaluateAskStepPolicy(pureSource(input), 's1', 'COMPLETED');
  assert.deepEqual(code({ head: { publishedRevisionId: null } }).reason, 'WITHDRAWN');
  assert.deepEqual(code({ revision: revisionRow({ retiredAt: T0, retiredReason: 'UNPUBLISHED' }) }).reason, 'WITHDRAWN');
  assert.deepEqual(code({ revision: revisionRow({ retiredAt: T0, retiredReason: 'ARCHIVED' }) }).reason, 'WITHDRAWN');
  assert.equal(code({ revision: revisionRow({ contentHash: 'deadbeef' }) }).reason, 'REVISION_INTEGRITY');
  assert.equal(code({ project: { status: 'COMPLETED' } }).reason, 'PROJECT_FINISHED');
  assert.equal(code({ project: { aiGuideId: 'g1' } }).reason, 'AI_GUIDE_PROJECT');
  assert.equal(code({ project: { steps: stepRows(revisionRow()).slice(1) } }).reason, 'STEPS_NOT_FROM_REVISION');
  for (const input of [{ head: { publishedRevisionId: null } }, { project: { status: 'COMPLETED' } }]) assert.equal(code(input).code, 'DIY_GUIDE_NOT_CURRENT');
  assert.deepEqual(code({ head: { publishedRevisionId: 'rev-2' }, revision: revisionRow({ retiredAt: T0, retiredReason: 'SUPERSEDED' }) }), { ok: true });
});

// ---- the context version -----------------------------------------------------------------------------------------------------------------------------

test('context version: stable for the same state; changed by any step, the project version, the revision and the head; unchanged by irrelevant fields', () => {
  const base = policy.guideContextVersion(pureSource());
  assert.match(base, /^[0-9a-f]{64}$/);
  assert.equal(policy.guideContextVersion(pureSource()), base);
  const changed = (input) => assert.notEqual(policy.guideContextVersion(pureSource(input)), base);
  changed({ statuses: { 2: 'IN_PROGRESS' } });              // a step other than the current one
  changed({ statuses: { 1: 'COMPLETED' } });                // the current step
  changed({ project: { updatedAt: new Date(T0.getTime() + 1) } });
  changed({ project: { status: 'PLANNING' } });
  changed({ revision: revisionRow({ contentHash: 'other' }) });
  changed({ revision: revisionRow({ retiredAt: T0, retiredReason: 'SUPERSEDED' }) });
  changed({ revision: revisionRow({ retiredAt: T0, retiredReason: 'UNPUBLISHED' }) });
  changed({ head: { publishedRevisionId: 'rev-2' } });
  changed({ head: { publishedRevisionId: null } });
  const touched = pureSource(); touched.project.steps[1].updatedAt = new Date(T0.getTime() + 500);
  assert.notEqual(policy.guideContextVersion(touched), base, 'another step\'s own version');
  const irrelevant = pureSource(); irrelevant.project.title = 'Renamed'; irrelevant.project.steps[0].description = 'Different words.';
  assert.equal(policy.guideContextVersion(irrelevant), base);
  const reordered = pureSource(); reordered.project.steps.reverse();
  assert.equal(policy.guideContextVersion(reordered), base, 'order of the rows read does not matter');
});

// ---- the service -------------------------------------------------------------------------------------------------------------------------------------

function harness(hooks) {
  const db = makeDiyDb([], hooks);
  const stub = (relative, exports) => { const resolved = require.resolve(relative); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports }; };
  stub('../../src/lib/prisma.ts', { prisma: db });
  stub('../../src/lib/logger.ts', { logger: { info() {}, warn() {}, error() {} }, auditLog() {}, redactEmail: (value) => value });
  stub('../../src/modules/propertyContext/index.ts', { getPropertyContext: async () => ({}) });
  stub('../../src/services/diy/applicabilityPolicy.ts', { evaluateDiyApplicability: () => ({ status: 'APPLICABLE' }) });
  delete require.cache[require.resolve('../../src/services/diy.service.ts')];
  const { diyService } = require('../../src/services/diy.service.ts');
  const revision = revisionRow();
  db.state.revisions.push(revision);
  db.state.templates.set('t1', { id: 't1', publishedRevisionId: 'rev-1', steps: [], materials: [], tools: [] });
  db.state.projects.push({
    id: 'p1', propertyId: 'prop-1', userId: 'creator', title: 'Repaint', category: 'PAINTING', templateId: 't1', templateRevisionId: 'rev-1', aiGuideId: null, completionBasis: null,
    maintenanceTaskId: null, status: 'PLANNING', startedAt: null, completedAt: null, completedByUserId: null, notesJson: null, updatedAt: T0, materials: [], tools: [], aiGuide: null,
    steps: stepRows(revision),
  });
  return { db, state: db.state, diyService };
}
const stepRow = (h, id) => h.state.projects[0].steps.find((row) => row.id === id);
const advance = (h, id, status, extra = {}, actor = 'alice') =>
  h.diyService.updateStep('p1', 'prop-1', id, { status }, { actorUserId: actor, expectedUpdatedAt: stepRow(h, id).updatedAt.toISOString(), ...extra });
const ask = { requireCurrentGuideStep: true };
const rejectsWith = (promise, code) => assert.rejects(promise, (error) => error.code === code, code);
// "Nothing written" is judged on the committed state (the spy also sees the project-row claim that a refused transaction rolls back).
const noWrites = (h) => assert.deepEqual(
  [h.state.events.length, h.state.domainEvents.length, h.state.projects[0].status, h.state.projects[0].updatedAt.toISOString(), h.state.projects[0].steps.map((s) => `${s.status}@${s.updatedAt.toISOString()}`).join('|')],
  [0, 0, 'PLANNING', T0.toISOString(), stepRows(revisionRow()).map((s) => `PENDING@${s.updatedAt.toISOString()}`).join('|')],
);

test('service: the role is checked inside the transaction for every caller, the page path included, before the idempotent early return', async () => {
  for (const role of ['VIEWER', null]) {
    const h = harness({ role: () => role });
    await rejectsWith(advance(h, 's1', 'COMPLETED'), 'DIY_ACCESS_REVOKED');
    await rejectsWith(advance(h, 's1', 'COMPLETED', ask), 'DIY_ACCESS_REVOKED');
    noWrites(h);
  }
  // A revoked person gets no "already applied" receipt either.
  const h = harness({ role: () => 'CONTRIBUTOR' });
  stepRow(h, 's1').status = 'COMPLETED';
  const h2 = harness({ role: () => null });
  stepRow(h2, 's1').status = 'COMPLETED';
  await rejectsWith(advance(h2, 's1', 'COMPLETED'), 'DIY_ACCESS_REVOKED');
  assert.equal((await advance(h, 's1', 'COMPLETED')).alreadyApplied, true, 'a contributor still gets the idempotent receipt');
});

test('service: access revoked after the caller\'s own check but before the transaction is refused (the check inside is the one that counts)', async () => {
  let role = 'CONTRIBUTOR';
  const h = harness({ role: () => role });
  role = 'VIEWER'; // revoked between the handler's check and the write
  await rejectsWith(advance(h, 's1', 'COMPLETED', ask), 'DIY_ACCESS_REVOKED');
  noWrites(h);
});

test('service with the Ask policy: completes the current step, one ledger row, an actor, share locks on the governance rows, no outbox event', async () => {
  const h = harness();
  const { step, alreadyApplied } = await advance(h, 's1', 'COMPLETED', ask);
  assert.deepEqual([alreadyApplied, step.status, stepRow(h, 's1').completedByUserId], [false, 'COMPLETED', 'alice']);
  assert.equal(h.state.events.length, 1);
  assert.deepEqual([h.state.events[0].type, h.state.events[0].actorUserId], ['STEP_COMPLETED', 'alice']);
  assert.equal(h.state.domainEvents.length, 0, 'a step command writes no outbox event');
  assert.equal(h.state.projects[0].status, 'IN_PROGRESS', 'the first activity starts the project, as on the page');
  const locks = h.state.locks.map((lock) => lock.sql);
  assert.ok(locks.some((sql) => /diy_template_revisions .* FOR SHARE/.test(sql)) && locks.some((sql) => /diy_project_templates .* FOR SHARE/.test(sql)), JSON.stringify(locks));
  assert.ok(locks.findIndex((sql) => /diy_template_revisions/.test(sql)) < locks.findIndex((sql) => /diy_project_templates/.test(sql)), 'revision before template, as the governance writers update them');
});

test('service with the Ask policy: a step that is not the current one is refused inside the transaction, nothing written', async () => {
  const h = harness();
  await rejectsWith(advance(h, 's2', 'COMPLETED', ask), 'DIY_STEP_NOT_CURRENT');
  noWrites(h);
  // The page (no policy) may still complete out of order: the asymmetry is deliberate.
  assert.equal((await advance(h, 's2', 'COMPLETED')).step.status, 'COMPLETED');
  // And a page update to the current step between the handler's check and the write makes the Ask command stale-by-policy, not silently out of order.
  const h2 = harness();
  stepRow(h2, 's1').status = 'COMPLETED'; // the page finished s1 meanwhile
  await rejectsWith(h2.diyService.updateStep('p1', 'prop-1', 's2', { status: 'SKIPPED' }, { actorUserId: 'alice', expectedUpdatedAt: stepRow(h2, 's2').updatedAt.toISOString(), ...ask }), 'DIY_STEP_TRANSITION_NOT_ALLOWED');
  assert.equal((await advance(h2, 's2', 'COMPLETED', ask)).step.status, 'COMPLETED');
});

test('service with the Ask policy: a guide withdrawn, superseded-away or corrupted between the checks and the write', async () => {
  const withdrawn = harness();
  withdrawn.state.templates.get('t1').publishedRevisionId = null;
  await rejectsWith(advance(withdrawn, 's1', 'COMPLETED', ask), 'DIY_GUIDE_NOT_CURRENT');
  noWrites(withdrawn);
  const unpublished = harness();
  Object.assign(unpublished.state.revisions[0], { retiredAt: T0, retiredReason: 'UNPUBLISHED' });
  await rejectsWith(advance(unpublished, 's1', 'COMPLETED', ask), 'DIY_GUIDE_NOT_CURRENT');
  const corrupted = harness();
  corrupted.state.revisions[0].contentHash = 'deadbeef';
  await rejectsWith(advance(corrupted, 's1', 'COMPLETED', ask), 'DIY_GUIDE_NOT_CURRENT');
  const superseded = harness();
  Object.assign(superseded.state.revisions[0], { retiredAt: T0, retiredReason: 'SUPERSEDED' });
  superseded.state.templates.get('t1').publishedRevisionId = 'rev-2';
  assert.equal((await advance(superseded, 's1', 'COMPLETED', ask)).step.status, 'COMPLETED', 'a superseded guide is still usable by a project that started on it');
  // The page path does not apply the Ask policy.
  const page = harness();
  page.state.templates.get('t1').publishedRevisionId = null;
  assert.equal((await advance(page, 's1', 'COMPLETED')).step.status, 'COMPLETED');
});

test('service with the Ask policy: skip only an optional step without a safety note; refusals leave nothing written', async () => {
  const h = harness();
  await rejectsWith(advance(h, 's1', 'SKIPPED', ask), 'DIY_STEP_TRANSITION_NOT_ALLOWED');
  await advance(h, 's1', 'COMPLETED', ask); await advance(h, 's2', 'COMPLETED', ask);
  assert.equal((await advance(h, 's3', 'SKIPPED', ask)).step.status, 'SKIPPED');
  await rejectsWith(advance(h, 's4', 'SKIPPED', ask), 'DIY_STEP_TRANSITION_NOT_ALLOWED');
  assert.equal((await advance(h, 's4', 'COMPLETED', ask)).step.status, 'COMPLETED');
  await rejectsWith(advance(h, 's4', 'IN_PROGRESS', ask), 'DIY_STEP_TRANSITION_NOT_ALLOWED');
});

test('service with the Ask policy: a replay is "already applied" with no second ledger row, and a stale token is still refused', async () => {
  const h = harness();
  const first = await advance(h, 's1', 'COMPLETED', ask);
  const eventsAfterFirst = h.state.events.length;
  const replay = await h.diyService.updateStep('p1', 'prop-1', 's1', { status: 'COMPLETED' }, { actorUserId: 'alice', expectedUpdatedAt: first.step.updatedAt.toISOString(), ...ask });
  assert.equal(replay.alreadyApplied, true);
  assert.equal(h.state.events.length, eventsAfterFirst);
  const h2 = harness();
  await rejectsWith(h2.diyService.updateStep('p1', 'prop-1', 's1', { status: 'COMPLETED' }, { actorUserId: 'alice', expectedUpdatedAt: new Date(0).toISOString(), ...ask }), 'DIY_STALE');
  noWrites(h2);
});
