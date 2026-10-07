// SCRATCH-DATABASE RUN for DIY_STEP_UPDATE (docs/architecture/ASK_COZY_DIY_STEP_COMMANDS_PLAN.md slice 6c). OWNER-RUN: it was written and its guards and module loading were
// checked, but its DATABASE assertions have NEVER been executed by the author (plan decision S6-11: write, do not run). Treat a first failure as a possible mistake in this
// script as well as in the product, and read the failing assertion before concluding either.
//
// The unit tests use a database-free fake that serializes transactions. This file runs the REAL propose and confirm handlers, the REAL `diyService.updateStep` with its
// in-transaction role check and Ask policy, the REAL template governance and the REAL guide handler against a REAL, EMPTY, throwaway Postgres, to check what a fake cannot:
//   * what a step command writes, measured by database triggers on every table that could be touched (not by a spy in JavaScript);
//   * that the in-transaction authorization sees a role changed in the database after the handler's own check;
//   * that the SHARE lock on the revision and template rows REALLY makes a concurrent withdrawal wait, and the other way round (real concurrent transactions);
//   * that two concurrent confirmations of one step produce exactly one ledger row;
//   * that the real guide, after a real confirmed command, shows the next step with the next step's actions.
// It is NOT part of `npm test` (the name does not end in .test.js). It TRUNCATES the tables it seeds and CREATES a table and triggers named scratch_*, so it refuses to run
// against anything that is not an obviously-scratch local database.
//
// Run from apps/backend (set-up and safety rules: docs/operations/DIY_STEP_UPDATE_ROLLOUT.md):
//   SCRATCH_DATABASE_URL=postgresql://scratch@127.0.0.1:54391/scratch_c2c_6c node --test tests/scratch/diyStepUpdate.scratch.js
const test = require('node:test');
const assert = require('node:assert/strict');

const URL_ = process.env.SCRATCH_DATABASE_URL;
if (!URL_) { console.log('SCRATCH_DATABASE_URL is not set: skipping the scratch-database run.'); process.exit(0); }
const match = /^postgres(?:ql)?:\/\/([^:@/]+)(?::[^@]*)?@(127\.0\.0\.1|localhost):(\d+)\/([A-Za-z0-9_]+)$/.exec(URL_);
if (!match || !/scratch/i.test(match[4]) || match[3] === '5433' || /contracttocozy/i.test(URL_)) {
  console.error(`REFUSING to run: SCRATCH_DATABASE_URL must be a local postgres URL whose database name contains "scratch" (and is not the dev database). Got: ${URL_.replace(/:[^:@/]*@/, ':***@')}`);
  process.exit(1);
}
const [, , , DB_PORT, DB_NAME] = match;
process.env.DATABASE_URL = URL_; // set before anything loads the Prisma client; dotenv never overrides an existing value
process.env.NODE_ENV = 'test';

require('ts-node/register');
// A stub keeps every real export and overrides only what is named, because the whole Ask module graph (loaded below) imports other names from these modules.
const stub = (relative, overrides) => { const resolved = require.resolve(relative); const real = require(resolved); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: { ...real, ...overrides } }; };
// Not under test here: the audit table, and the property facts behind project applicability.
stub('../../src/services/adminAudit.service.ts', { recordAdminAction: async () => undefined });
stub('../../src/modules/propertyContext/index.ts', { getPropertyContext: async () => ({}) });
stub('../../src/services/diy/applicabilityPolicy.ts', { evaluateDiyApplicability: () => ({ status: 'APPLICABLE' }) });

const { prisma } = require('../../src/lib/prisma.ts');
// The orchestrator loads the whole Ask module graph in its supported order (the step handler imports the shared support modules, which fail to load in isolation).
require('../../src/services/ask/askOrchestrator.service.ts');
const governance = require('../../src/services/adminContentGovernance.service.ts');
const { diyService } = require('../../src/services/diy.service.ts');
const { shareLockGovernanceRows } = require('../../src/services/diyTemplateRevision.service.ts');
const { diyProjectGuideResult } = require('../../src/services/ask/handlers/diyProjectGuide.handler.ts');
const { diyStepUpdateResult } = require('../../src/services/ask/handlers/diyStepUpdate.handler.ts'); // registers the propose and confirm handlers
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const policy = require('../../src/services/diy/askStepPolicy.ts');

const sql = (text) => prisma.$executeRawUnsafe(text);
const act = (templateId, action, actorId = 'admin-1') => governance.transitionDiyTemplate({ templateId, actorId, action, reason: 'scratch run' });
const publish = async (id) => { await act(id, 'SUBMIT_FOR_REVIEW', 'author'); await act(id, 'APPROVE', 'reviewer'); await act(id, 'PUBLISH', 'publisher'); };
const NOW = new Date('2026-10-06T12:00:00.000Z');
const PROP = 'prop1';
const OWNER = 'u1'; const CONTRIBUTOR = 'u2'; const VIEWER = 'u3';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const codeOf = async (promise) => { try { await promise; return null; } catch (error) { return error.code ?? `NO_CODE:${error.message}`; } };

// Step 1 has a safety note; steps 3 and 9 are optional (9 has none); sparse step numbers.
const STEPS = [
  { stepNumber: 1, title: 'Tape the trim', description: 'Apply painter tape along the trim.', estimatedMinutes: 20, isOptional: false, safetyNote: 'Keep a window open while you work.', tipNote: 'Press the tape edge down firmly.' },
  { stepNumber: 3, title: 'Cut in the edges', description: 'Brush the corners first.', estimatedMinutes: 30, isOptional: false },
  { stepNumber: 7, title: 'Roll the walls', description: 'Roll two coats, letting the first dry.', isOptional: false },
  { stepNumber: 9, title: 'Touch up', description: 'Fix any misses.', estimatedMinutes: 10, isOptional: true },
];
const seedTemplate = (id, title, steps = STEPS) => prisma.diyProjectTemplate.create({
  data: {
    id, slug: id, title, shortDescription: `${title}.`, longDescription: `Long text for ${title}.`, category: 'PAINTING', difficultyLevel: 'EASY', requiredSkillLevel: 'BEGINNER',
    safetyLevel: 'LOW', permitRequirement: 'NOT_REQUIRED', estimatedMinutes: 120, tags: ['diy', id], status: 'DRAFT', steps: { create: steps }, materials: { create: [] }, tools: { create: [] },
  },
});
const published = async (id, title) => { await seedTemplate(id, title); await publish(id); };
const start = (templateId) => diyService.createProject(PROP, OWNER, { templateId });
const stepRows = (projectId) => prisma.diyProjectStep.findMany({ where: { projectId }, orderBy: { stepNumber: 'asc' } });
const stepAt = async (projectId, stepNumber) => (await stepRows(projectId)).find((row) => row.stepNumber === stepNumber);
const events = (projectId) => prisma.diyProjectEvent.findMany({ where: { projectId }, orderBy: { at: 'asc' } });

const launch = (key, stepId, overrides = {}) => ({ surface: 'ASK_WORKSPACE', entityType: 'DIY_STEP', entityId: stepId, operationId: 'DIY_STEP_UPDATE', actionId: key, sourceExecutionId: null, ...overrides });
const MESSAGES = { COMPLETE: 'Mark this step done.', SKIP: 'Skip this step.' };
const propose = (userId, key, stepId, overrides) => diyStepUpdateResult(userId, PROP, MESSAGES[key], launch(key, stepId, overrides));
const execution = (userId) => ({ id: 'exec-scratch', propertyId: PROP, sessionId: 's1', userId, operationId: 'DIY_STEP_UPDATE', createdAt: new Date() });
const confirm = (userId, parameters, role = 'CONTRIBUTOR') => confirmCapabilityInvoke('DIY_STEP_UPDATE', {
  userId, execution: execution(userId), parameters, access: { role }, command: getAskDomainCommandByOperation('DIY_STEP_UPDATE'),
});
const guide = (projectId, canEdit = true) => diyProjectGuideResult(PROP, { surface: 'ASK_WORKSPACE', entityType: 'DIY_PROJECT', entityId: projectId }, NOW, canEdit);
const advancing = (result) => result.blocks.flatMap((block) => block.actions ?? []).filter((action) => action.id.startsWith('diy-step'));

test.before(async () => {
  const [{ db, port }] = await prisma.$queryRawUnsafe('select current_database() as db, inet_server_port() as port');
  assert.equal(db, DB_NAME, 'connected to the scratch database'); assert.equal(Number(port), Number(DB_PORT), 'on the scratch port');
  await sql('TRUNCATE diy_projects, diy_template_revisions, diy_template_steps, diy_template_materials, diy_template_tools, diy_project_templates, diy_ai_guides, domain_events, household_members, properties, homeowner_profiles, users RESTART IDENTITY CASCADE');
  for (const id of [OWNER, CONTRIBUTOR, VIEWER]) await sql(`INSERT INTO users ("id","email","firstName","lastName","passwordHash","updatedAt") VALUES ('${id}','${id}@example.test','S','C','x', now())`);
  await sql(`INSERT INTO homeowner_profiles ("id","userId","updatedAt") VALUES ('hp1','${OWNER}', now())`);
  await sql(`INSERT INTO properties ("id","homeownerProfileId","address","city","state","zipCode","updatedAt") VALUES ('${PROP}','hp1','1 Test St','Testville','NJ','08536', now())`);
  await sql(`INSERT INTO household_members ("id","propertyId","userId","role","isPrimaryOwner","updatedAt") VALUES ('m1','${PROP}','${CONTRIBUTOR}','CONTRIBUTOR', false, now()), ('m2','${PROP}','${VIEWER}','VIEWER', false, now())`);
});
test.after(async () => { await prisma.$disconnect(); });

// ---- the happy path, through the real stack ---------------------------------------------------------------------------------------------------------------

let hall; // { projectId } of the main project used by the early tests
test('REAL propose and confirm: the safety note repeats in the confirmation, the step is done as the actor, one ledger row, and the real guide moves to the next step with ITS actions', async () => {
  await published('tHall', 'Repaint a hallway');
  const project = await start('tHall');
  hall = { projectId: project.id };
  const first = await stepAt(project.id, 1);

  const opened = await guide(project.id);
  assert.deepEqual(advancing(opened).map((a) => [a.id, a.entityId, a.actionId]), [['diy-step-complete', first.id, 'COMPLETE']], 'step 1 is required and has a safety note: only Mark done');
  opened.blocks.forEach((block) => AskPresentationBlockSchema.parse(block));
  assert.equal(opened.blocks.findIndex((b) => b.type === 'TASK_GUIDE') - 1, opened.blocks.findIndex((b) => b.id === 'diy-step-safety'), 'the safety block is directly above the card');

  const proposed = await propose(CONTRIBUTOR, 'COMPLETE', first.id);
  assert.equal(proposed.status, 'NEEDS_CONFIRMATION', JSON.stringify(proposed.blocks.map((b) => b.id)));
  assert.deepEqual(proposed.blocks.map((b) => b.id), ['diy-step-safety', 'diy-step-update-review']);
  assert.ok(proposed.confirmation.fields.some((field) => field.label === 'Safety note' && field.value === 'Keep a window open while you work.'));
  assert.equal(proposed.contextVersion, policy.guideContextVersion(await diyService.getProjectGuideSource(project.id, PROP)), 'the version a real read produces');
  assert.equal((await stepAt(project.id, 1)).status, 'PENDING', 'a proposal changes nothing');
  assert.equal((await events(project.id)).length, 0);

  const { result, artifactId } = await confirm(CONTRIBUTOR, proposed.parameters);
  assert.equal(result.reasonCode, 'DIY_STEP_COMPLETED');
  assert.equal(artifactId, first.id);
  assert.match(result.blocks[0].description, /your report; Cozy doesn't check the work/);
  const after = await stepAt(project.id, 1);
  assert.deepEqual([after.status, after.completedByUserId], ['COMPLETED', CONTRIBUTOR]);
  assert.deepEqual((await events(project.id)).map((e) => [e.type, e.actorUserId, e.stepId]), [['STEP_COMPLETED', CONTRIBUTOR, first.id]]);
  assert.equal((await prisma.diyProject.findUnique({ where: { id: project.id } })).status, 'IN_PROGRESS');

  const next = await guide(project.id);
  assert.equal(next.blocks.find((b) => b.type === 'TASK_GUIDE').progress.label, 'Step 2 of 4, 1 done');
  const second = await stepAt(project.id, 3);
  assert.deepEqual(advancing(next).map((a) => [a.id, a.entityId]), [['diy-step-complete', second.id]], 'the refreshed card carries the NEXT step\'s action, and no skip for a required step');
  assert.equal(next.blocks.some((b) => b.id === 'diy-step-safety'), false, 'step 2 has no safety note');
});

// ---- exactly what a command writes, measured by the database ------------------------------------------------------------------------------------------------

test('WHAT A COMMAND WRITES, by database triggers: a proposal writes nothing; a confirmed step command writes the step, the project and one ledger row, and nothing else', async () => {
  await sql('CREATE TABLE IF NOT EXISTS scratch_write_log (id serial PRIMARY KEY, tbl text, op text)');
  await sql(`CREATE OR REPLACE FUNCTION scratch_log_write() RETURNS trigger AS $$ BEGIN INSERT INTO scratch_write_log (tbl, op) VALUES (TG_TABLE_NAME, TG_OP); RETURN NULL; END $$ LANGUAGE plpgsql`);
  const tables = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND (tablename LIKE 'diy\\_%' OR tablename IN ('domain_events', 'property_maintenance_tasks', 'home_events', 'household_members')) AND tablename <> 'scratch_write_log'`);
  assert.ok(tables.length >= 8, `found the tables to watch: ${tables.map((row) => row.tablename).join(', ')}`);
  for (const { tablename } of tables) {
    await sql(`DROP TRIGGER IF EXISTS scratch_spy ON "${tablename}"`);
    await sql(`CREATE TRIGGER scratch_spy AFTER INSERT OR UPDATE OR DELETE ON "${tablename}" FOR EACH STATEMENT EXECUTE FUNCTION scratch_log_write()`);
  }
  const written = async () => (await prisma.$queryRawUnsafe('SELECT tbl, op FROM scratch_write_log GROUP BY 1, 2 ORDER BY 1, 2')).map((row) => `${row.tbl}:${row.op}`);
  try {
    const current = await stepAt(hall.projectId, 3); // step 2 of 4, the current step
    await sql('DELETE FROM scratch_write_log');
    const proposed = await propose(OWNER, 'COMPLETE', current.id);
    assert.equal(proposed.status, 'NEEDS_CONFIRMATION');
    await guide(hall.projectId);
    assert.deepEqual(await written(), [], 'a proposal and a guide read write nothing');
    await confirm(OWNER, proposed.parameters, 'OWNER');
    const writes = await written();
    // household_members may legitimately appear: resolving a pre-household owner's access can create the membership row on first use.
    const unexpected = writes.filter((entry) => !['diy_project_steps:UPDATE', 'diy_projects:UPDATE', 'diy_project_events:INSERT', 'household_members:INSERT'].includes(entry));
    assert.deepEqual(unexpected, [], `nothing outside the step, the project and the ledger: ${JSON.stringify(writes)}`);
    assert.ok(['diy_project_steps:UPDATE', 'diy_projects:UPDATE', 'diy_project_events:INSERT'].every((entry) => writes.includes(entry)), JSON.stringify(writes));
    assert.equal((await prisma.domainEvent.count()), 0, 'no outbox event');
  } finally {
    for (const { tablename } of tables) await sql(`DROP TRIGGER IF EXISTS scratch_spy ON "${tablename}"`);
  }
});

// ---- the policy and the role, inside the real transaction -----------------------------------------------------------------------------------------------------

test('the Ask policy inside the REAL transaction: not the current step, a required skip, an unlisted target and a withdrawn guide each refuse and change nothing; the page path is unaffected', async () => {
  await published('tPolicy', 'Policy project');
  const project = await start('tPolicy');
  const [s1, s3] = await Promise.all([1, 3].map((n) => stepAt(project.id, n)));
  const ctx = (row, extra = {}) => ({ actorUserId: OWNER, expectedUpdatedAt: row.updatedAt.toISOString(), requireCurrentGuideStep: true, ...extra });
  const snapshot = async () => JSON.stringify((await stepRows(project.id)).map((row) => [row.id, row.status, row.updatedAt])) + (await events(project.id)).length;
  const before = await snapshot();
  assert.equal(await codeOf(diyService.updateStep(project.id, PROP, s3.id, { status: 'COMPLETED' }, ctx(s3))), 'DIY_STEP_NOT_CURRENT');
  assert.equal(await codeOf(diyService.updateStep(project.id, PROP, s1.id, { status: 'SKIPPED' }, ctx(s1))), 'DIY_STEP_TRANSITION_NOT_ALLOWED');
  assert.equal(await codeOf(diyService.updateStep(project.id, PROP, s1.id, { status: 'IN_PROGRESS' }, ctx(s1))), 'DIY_STEP_TRANSITION_NOT_ALLOWED');
  assert.equal(await snapshot(), before, 'refusals change nothing');
  // The page path (no policy) can still work out of order: the asymmetry is deliberate.
  assert.equal((await diyService.updateStep(project.id, PROP, s3.id, { status: 'COMPLETED' }, { actorUserId: OWNER, expectedUpdatedAt: s3.updatedAt.toISOString() })).step.status, 'COMPLETED');

  // Withdraw the guide for real, then try again.
  await act('tPolicy', 'UNPUBLISH', 'publisher');
  const fresh = await stepAt(project.id, 1);
  assert.equal(await codeOf(diyService.updateStep(project.id, PROP, fresh.id, { status: 'COMPLETED' }, ctx(fresh))), 'DIY_GUIDE_NOT_CURRENT');
  assert.equal((await stepAt(project.id, 1)).status, 'PENDING');
  assert.equal((await diyService.updateStep(project.id, PROP, fresh.id, { status: 'COMPLETED' }, { actorUserId: OWNER, expectedUpdatedAt: fresh.updatedAt.toISOString() })).step.status, 'COMPLETED', 'the page can still record it');
});

test('the role is checked INSIDE the transaction against the real table: a viewer, a removed member and a member demoted after the handler\'s check are all refused, and nothing changes', async () => {
  await published('tRole', 'Role project');
  const project = await start('tRole');
  const step = await stepAt(project.id, 1);
  const call = (actorUserId, extra = {}) => diyService.updateStep(project.id, PROP, step.id, { status: 'COMPLETED' }, { actorUserId, expectedUpdatedAt: step.updatedAt.toISOString(), ...extra });
  assert.equal(await codeOf(call(VIEWER)), 'DIY_ACCESS_REVOKED');
  assert.equal(await codeOf(call(VIEWER, { requireCurrentGuideStep: true })), 'DIY_ACCESS_REVOKED');
  assert.equal(await codeOf(call('nobody')), 'DIY_ACCESS_REVOKED');
  // The handler's own check passes (the proposal is made as a contributor), then the role changes in the database before the write.
  const proposed = await propose(CONTRIBUTOR, 'COMPLETE', step.id);
  assert.equal(proposed.status, 'NEEDS_CONFIRMATION');
  await sql(`UPDATE household_members SET role = 'VIEWER' WHERE "userId" = '${CONTRIBUTOR}' AND "propertyId" = '${PROP}'`);
  try {
    assert.equal(await codeOf(confirm(CONTRIBUTOR, proposed.parameters, 'CONTRIBUTOR')), 'ASK_PERMISSION_REQUIRED', 'the confirm handler\'s ctx said CONTRIBUTOR; the transaction saw VIEWER');
    await sql(`DELETE FROM household_members WHERE "userId" = '${CONTRIBUTOR}' AND "propertyId" = '${PROP}'`);
    assert.equal(await codeOf(confirm(CONTRIBUTOR, proposed.parameters, 'CONTRIBUTOR')), 'ASK_PERMISSION_REQUIRED');
  } finally {
    await sql(`INSERT INTO household_members ("id","propertyId","userId","role","isPrimaryOwner","updatedAt") VALUES ('m1b','${PROP}','${CONTRIBUTOR}','CONTRIBUTOR', false, now()) ON CONFLICT ("propertyId","userId") DO UPDATE SET role = 'CONTRIBUTOR'`);
  }
  assert.equal((await stepAt(project.id, 1)).status, 'PENDING');
  assert.equal((await events(project.id)).length, 0);
  assert.equal((await diyService.updateStep(project.id, PROP, step.id, { status: 'COMPLETED' }, { actorUserId: OWNER, expectedUpdatedAt: step.updatedAt.toISOString() })).step.status, 'COMPLETED', 'the owner (no membership row needed) still can');
});

// ---- real concurrency: the locks and the double confirmation ------------------------------------------------------------------------------------------------

test('THE SHARE LOCK, real concurrent transactions: a withdrawal that starts first makes the step command WAIT and then refuse; a step command that holds the lock makes a withdrawal WAIT', async () => {
  await published('tLock', 'Lock project');
  const project = await start('tLock');
  const step = await stepAt(project.id, 1);
  const revisionId = (await prisma.diyProject.findUnique({ where: { id: project.id } })).templateRevisionId;
  const pending = async (promise, ms = 1500) => { let settled = false; promise.then(() => { settled = true; }, () => { settled = true; }); await wait(ms); return !settled; };

  // A: a transaction withdraws the revision (an uncommitted UPDATE on the revision row) while the step command starts.
  let releaseAdmin; const adminHeld = new Promise((resolve) => { releaseAdmin = resolve; });
  const admin = prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`UPDATE diy_template_revisions SET "retiredAt" = now(), "retiredReason" = 'UNPUBLISHED' WHERE id = '${revisionId}'`);
    await tx.$executeRawUnsafe(`UPDATE diy_project_templates SET "publishedRevisionId" = NULL WHERE id = 'tLock'`);
    await adminHeld;
  }, { timeout: 30000 });
  await wait(300);
  const command = diyService.updateStep(project.id, PROP, step.id, { status: 'COMPLETED' }, { actorUserId: OWNER, expectedUpdatedAt: step.updatedAt.toISOString(), requireCurrentGuideStep: true });
  assert.equal(await pending(command), true, 'the step command is WAITING on the withdrawal\'s row lock (the share lock conflicts with the uncommitted update)');
  releaseAdmin(); await admin;
  assert.equal(await codeOf(command), 'DIY_GUIDE_NOT_CURRENT', 'once the withdrawal commits, the command sees it and refuses');
  assert.equal((await stepAt(project.id, 1)).status, 'PENDING');

  // B: the other direction. A transaction holds the same share lock the step command takes; a withdrawal started meanwhile must wait for it.
  await published('tLock2', 'Lock project two');
  const second = await start('tLock2');
  const revision2 = (await prisma.diyProject.findUnique({ where: { id: second.id } })).templateRevisionId;
  let releaseLock; const lockHeld = new Promise((resolve) => { releaseLock = resolve; });
  let acquired; const gotLock = new Promise((resolve) => { acquired = resolve; });
  const holder = prisma.$transaction(async (tx) => {
    await shareLockGovernanceRows(tx, { revisionId: revision2, templateId: 'tLock2' });
    acquired(); await lockHeld;
  }, { timeout: 30000 });
  await gotLock;
  const withdrawal = act('tLock2', 'UNPUBLISH', 'publisher');
  assert.equal(await pending(withdrawal), true, 'the withdrawal is WAITING for the step command\'s share lock');
  releaseLock(); await holder; await withdrawal;
  assert.equal((await prisma.diyTemplateRevision.findUnique({ where: { id: revision2 } })).retiredReason, 'UNPUBLISHED', 'and completes once the lock is released');
});

test('TWO CONCURRENT CONFIRMATIONS of one step: exactly one ledger row, one real change, the other is "already" or a plain conflict', async () => {
  await published('tTwice', 'Twice project');
  const project = await start('tTwice');
  const step = await stepAt(project.id, 1);
  const proposed = await propose(OWNER, 'COMPLETE', step.id);
  const settled = await Promise.allSettled([confirm(OWNER, proposed.parameters, 'OWNER'), confirm(OWNER, proposed.parameters, 'OWNER')]);
  const ok = settled.filter((entry) => entry.status === 'fulfilled').map((entry) => entry.value.result.reasonCode);
  const failed = settled.filter((entry) => entry.status === 'rejected').map((entry) => entry.reason.code);
  assert.ok(ok.includes('DIY_STEP_COMPLETED'), JSON.stringify({ ok, failed }));
  for (const code of failed) assert.ok(['ASK_CONTEXT_VERSION_CONFLICT', 'ASK_CONFIRMATION_NOT_ACTIVE'].includes(code), code);
  for (const code of ok) assert.ok(['DIY_STEP_COMPLETED', 'DIY_STEP_ALREADY_COMPLETED'].includes(code), code);
  assert.equal((await events(project.id)).filter((e) => e.type === 'STEP_COMPLETED').length, 1, 'exactly one ledger row');
  assert.equal((await stepAt(project.id, 1)).status, 'COMPLETED');
});

test('THE PAGE AND ASK, interleaved on real rows: the page finishes a LATER step after the proposal, the early check refuses, and the same step is still allowed by the transaction while it is the current one', async () => {
  await published('tRace', 'Race project');
  const project = await start('tRace');
  const s1 = await stepAt(project.id, 1); const s3 = await stepAt(project.id, 3);
  const proposed = await propose(OWNER, 'COMPLETE', s1.id);
  await diyService.updateStep(project.id, PROP, s3.id, { status: 'COMPLETED' }, { actorUserId: OWNER, expectedUpdatedAt: s3.updatedAt.toISOString() }); // the page, out of order
  assert.equal(await codeOf(confirm(OWNER, proposed.parameters, 'OWNER')), 'ASK_CONTEXT_VERSION_CONFLICT', 'another step changed: the early check says look again');
  assert.equal((await stepAt(project.id, 1)).status, 'PENDING');
  // The transaction alone is not bothered by a change to a LATER step: step 1 is still the first unfinished step and its own token is unchanged.
  const stillCurrent = await stepAt(project.id, 1);
  assert.equal((await diyService.updateStep(project.id, PROP, s1.id, { status: 'COMPLETED' }, { actorUserId: OWNER, expectedUpdatedAt: stillCurrent.updatedAt.toISOString(), requireCurrentGuideStep: true })).step.status, 'COMPLETED');
});

test('a withdrawn guide offers no advancing action to anyone, on the real guide', async () => {
  await published('tGone', 'Withdrawn project');
  const project = await start('tGone');
  assert.equal(advancing(await guide(project.id)).length > 0, true);
  await act('tGone', 'UNPUBLISH', 'publisher');
  const result = await guide(project.id);
  assert.equal(result.blocks[0].id, 'diy-guide-withdrawn');
  assert.deepEqual(advancing(result), []);
  assert.equal(advancing(await guide(project.id, false)).length, 0);
});
