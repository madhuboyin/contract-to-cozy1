// SCRATCH-DATABASE RUN for the DIY project commands (docs/architecture/ASK_COZY_DIY_PROJECT_COMMANDS_PLAN.md slice 7D): the previous-step view and Reopen (7A), Finish and Stop or
// hand off (7B), the finished-project view and recovery (7C). OWNER-RUN: it was written and its guards and module loading were checked, but its DATABASE assertions have NEVER been
// executed by the author (plan decision S7-13: write, do not run). Treat a first failure as a possible mistake in this script as well as in the product, and read the failing
// assertion before concluding either.
//
// The unit tests use a database-free fake that serializes transactions. This file runs the REAL propose and confirm handlers, the REAL `diyService` transitions (with their in-transaction
// role checks and Ask policies), the REAL template governance and the REAL guide handler against a REAL, EMPTY, throwaway Postgres, to check what a fake cannot:
//   * exactly which tables each command writes, measured by database triggers (a view and a proposal write nothing; Finish writes the project, one ledger row and ONE outbox row and
//     NOTHING in tasks, home events or incidents; Stop and Hand off write the project and one ledger row and leave a linked task untouched);
//   * that the outbox row exists, in the same transaction, and stays PENDING (the worker is not running here);
//   * real concurrency: Finish racing a step reopen can never leave a COMPLETED project with an unfinished step; two recoveries re-queue a dead letter once; Finish against a
//     withdrawal waits for the share lock and then refuses;
//   * that the role is checked inside the transaction against the real table for stop, finish and both recovery methods.
// It is NOT part of `npm test` (the name does not end in .test.js). It TRUNCATES the tables it seeds and CREATES a table and triggers named scratch_*, so it refuses to run against
// anything that is not an obviously-scratch local database. The worker does NOT run: nothing here proves that a home-history record or a task completion is ever created.
//
// Run from apps/backend (set-up and safety rules: docs/operations/DIY_PROJECT_COMMANDS_ROLLOUT.md):
//   SCRATCH_DATABASE_URL=postgresql://scratch@127.0.0.1:54391/scratch_c2c_7d node --test tests/scratch/diyProjectCommands.scratch.js
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
stub('../../src/services/adminAudit.service.ts', { recordAdminAction: async () => undefined });
stub('../../src/modules/propertyContext/index.ts', { getPropertyContext: async () => ({}) });
stub('../../src/services/diy/applicabilityPolicy.ts', { evaluateDiyApplicability: () => ({ status: 'APPLICABLE' }) });

const { prisma } = require('../../src/lib/prisma.ts');
// The orchestrator loads the whole Ask module graph in its supported order (the handlers import shared support modules that fail to load in isolation).
require('../../src/services/ask/askOrchestrator.service.ts');
const governance = require('../../src/services/adminContentGovernance.service.ts');
const { diyService } = require('../../src/services/diy.service.ts');
const { diyProjectGuideResult } = require('../../src/services/ask/handlers/diyProjectGuide.handler.ts');
const { diyStepUpdateResult } = require('../../src/services/ask/handlers/diyStepUpdate.handler.ts');
const { diyProjectCompleteResult, diyProjectAbandonResult } = require('../../src/services/ask/handlers/diyProjectCommands.handler.ts');
const { diyCompletionRecoverResult } = require('../../src/services/ask/handlers/diyCompletionRecover.handler.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { shareLockGovernanceRows } = require('../../src/services/diyTemplateRevision.service.ts');
const analytics = require('../../src/services/analytics');
const { DIY_COMPLETION_EVENT_KEY } = require('../../src/services/diy/diyCompletionEffects.ts');
const { DIY_TASK_RECONCILE_EVENT_KEY } = require('../../src/services/diy/diyTaskReconciliationRequest.ts');

const sql = (text) => prisma.$executeRawUnsafe(text);
const act = (templateId, action, actorId = 'admin-1') => governance.transitionDiyTemplate({ templateId, actorId, action, reason: 'scratch run' });
const publish = async (id) => { await act(id, 'SUBMIT_FOR_REVIEW', 'author'); await act(id, 'APPROVE', 'reviewer'); await act(id, 'PUBLISH', 'publisher'); };
const NOW = new Date('2026-10-06T12:00:00.000Z');
const PROP = 'prop1';
const OWNER = 'u1'; const CONTRIBUTOR = 'u2'; const VIEWER = 'u3';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const codeOf = async (promise) => { try { await promise; return null; } catch (error) { return error.code ?? `NO_CODE:${error.message}`; } };

// Analytics are counted, never sent.
const tracked = [];
analytics.analyticsEmitter.track = (event) => { tracked.push(event); };

const STEPS = [
  { stepNumber: 1, title: 'Tape the trim', description: 'Apply painter tape along the trim.', estimatedMinutes: 20, isOptional: false, safetyNote: 'Keep a window open while you work.', tipNote: 'Press the tape edge down firmly.' },
  { stepNumber: 3, title: 'Cut in the edges', description: 'Brush the corners first.', estimatedMinutes: 30, isOptional: false },
  { stepNumber: 9, title: 'Touch up', description: 'Fix any misses.', estimatedMinutes: 10, isOptional: true },
];
const seedTemplate = (id, title) => prisma.diyProjectTemplate.create({
  data: {
    id, slug: id, title, shortDescription: `${title}.`, longDescription: `Long text for ${title}.`, category: 'PAINTING', difficultyLevel: 'EASY', requiredSkillLevel: 'BEGINNER',
    safetyLevel: 'LOW', permitRequirement: 'NOT_REQUIRED', estimatedMinutes: 120, tags: ['diy', id], status: 'DRAFT', steps: { create: STEPS }, materials: { create: [] }, tools: { create: [] },
  },
});
let seq = 0;
/** A fresh published template and a project started from it with the real createProject. */
async function freshProject(extra = {}) {
  seq += 1; const id = `t${seq}`;
  await seedTemplate(id, `Project ${seq}`); await publish(id);
  const project = await diyService.createProject(PROP, OWNER, { templateId: id, ...extra });
  return { templateId: id, projectId: project.id };
}
const stepRows = (projectId) => prisma.diyProjectStep.findMany({ where: { projectId }, orderBy: { stepNumber: 'asc' } });
const stepAt = async (projectId, n) => (await stepRows(projectId)).find((row) => row.stepNumber === n);
const events = (projectId) => prisma.diyProjectEvent.findMany({ where: { projectId }, orderBy: { at: 'asc' } });
const getProject = (projectId) => prisma.diyProject.findUnique({ where: { id: projectId } });

const launch = (operationId, entityType, entityId, actionId, overrides = {}) => ({ surface: 'ASK_WORKSPACE', entityType, entityId, operationId, actionId, sourceExecutionId: null, ...overrides });
const execution = (operationId, userId = CONTRIBUTOR) => ({ id: 'exec-scratch', propertyId: PROP, sessionId: 's1', userId, operationId, createdAt: new Date() });
const confirm = (operationId, parameters, userId = CONTRIBUTOR, role = 'CONTRIBUTOR') => confirmCapabilityInvoke(operationId, {
  userId, execution: execution(operationId, userId), parameters, access: { role }, command: getAskDomainCommandByOperation(operationId),
});
const stepMsg = { COMPLETE: 'Mark this step done.', SKIP: 'Skip this step.', REOPEN: 'Reopen this step.' };
const proposeStep = (userId, key, stepId) => diyStepUpdateResult(userId, PROP, stepMsg[key], launch('DIY_STEP_UPDATE', 'DIY_STEP', stepId, key));
const proposeFinish = (userId, projectId) => diyProjectCompleteResult(userId, PROP, 'Finish this project.', launch('DIY_PROJECT_COMPLETE', 'DIY_PROJECT', projectId, 'COMPLETE'));
const stopMsg = { STOP: 'Stop this project.', HAND_OFF: 'Hand this off to a pro.' };
const proposeStop = (userId, projectId, key) => diyProjectAbandonResult(userId, PROP, stopMsg[key], launch('DIY_PROJECT_ABANDON', 'DIY_PROJECT', projectId, key));
const recoverMsg = { COMPLETION_EFFECTS: 'Record my completion again.', TASK_LINK: 'Update my linked task again.' };
const proposeRecover = (userId, projectId, key) => diyCompletionRecoverResult(userId, PROP, recoverMsg[key], launch('DIY_COMPLETION_RECOVER', 'DIY_PROJECT', projectId, key));
const guide = (projectId, canEdit = true, extra = {}) => diyProjectGuideResult(PROP, { surface: 'ASK_WORKSPACE', entityType: 'DIY_PROJECT', entityId: projectId, ...extra }, NOW, canEdit);
const viewStep = (stepId, canEdit = true) => diyProjectGuideResult(PROP, { surface: 'ASK_WORKSPACE', entityType: 'DIY_STEP', entityId: stepId, actionId: 'VIEW' }, NOW, canEdit);
const actionsOf = (result) => result.blocks.flatMap((block) => block.actions ?? []);
const cardOf = (result) => result.blocks.find((block) => block.type === 'TASK_GUIDE');
const parsesAll = (result) => result.blocks.forEach((block) => AskPresentationBlockSchema.parse(block));

/** Completes every step of a project through the REAL propose and confirm path (so the ledger and actor are the real ones). */
async function resolveAll(projectId) {
  for (const n of [1, 3]) { const row = await stepAt(projectId, n); await confirm('DIY_STEP_UPDATE', (await proposeStep(CONTRIBUTOR, 'COMPLETE', row.id)).parameters); }
  const optional = await stepAt(projectId, 9); await confirm('DIY_STEP_UPDATE', (await proposeStep(CONTRIBUTOR, 'SKIP', optional.id)).parameters);
}

// ---- write measurement by database triggers ------------------------------------------------------------------------------------------------------------------
let watched = [];
async function startSpy() {
  await sql('CREATE TABLE IF NOT EXISTS scratch_write_log (id serial PRIMARY KEY, tbl text, op text)');
  await sql(`CREATE OR REPLACE FUNCTION scratch_log_write() RETURNS trigger AS $$ BEGIN INSERT INTO scratch_write_log (tbl, op) VALUES (TG_TABLE_NAME, TG_OP); RETURN NULL; END $$ LANGUAGE plpgsql`);
  watched = (await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND (tablename LIKE 'diy\\_%' OR tablename LIKE 'incident%' OR tablename IN ('domain_events', 'property_maintenance_tasks', 'home_events', 'household_members', 'documents')) AND tablename <> 'scratch_write_log'`)).map((row) => row.tablename);
  assert.ok(watched.length >= 9, `found the tables to watch: ${watched.join(', ')}`);
  for (const tablename of watched) {
    await sql(`DROP TRIGGER IF EXISTS scratch_spy ON "${tablename}"`);
    await sql(`CREATE TRIGGER scratch_spy AFTER INSERT OR UPDATE OR DELETE ON "${tablename}" FOR EACH STATEMENT EXECUTE FUNCTION scratch_log_write()`);
  }
  await sql('DELETE FROM scratch_write_log');
}
const writes = async () => (await prisma.$queryRawUnsafe('SELECT tbl, op FROM scratch_write_log GROUP BY 1, 2 ORDER BY 1, 2')).map((row) => `${row.tbl}:${row.op}`);
const clearSpy = () => sql('DELETE FROM scratch_write_log');
async function stopSpy() { for (const tablename of watched) await sql(`DROP TRIGGER IF EXISTS scratch_spy ON "${tablename}"`); }

test.before(async () => {
  const [{ db, port }] = await prisma.$queryRawUnsafe('select current_database() as db, inet_server_port() as port');
  assert.equal(db, DB_NAME, 'connected to the scratch database'); assert.equal(Number(port), Number(DB_PORT), 'on the scratch port');
  await sql('TRUNCATE diy_projects, diy_template_revisions, diy_template_steps, diy_template_materials, diy_template_tools, diy_project_templates, diy_ai_guides, domain_events, property_maintenance_tasks, household_members, properties, homeowner_profiles, users RESTART IDENTITY CASCADE');
  for (const id of [OWNER, CONTRIBUTOR, VIEWER]) await sql(`INSERT INTO users ("id","email","firstName","lastName","passwordHash","updatedAt") VALUES ('${id}','${id}@example.test','S','C','x', now())`);
  await sql(`INSERT INTO homeowner_profiles ("id","userId","updatedAt") VALUES ('hp1','${OWNER}', now())`);
  await sql(`INSERT INTO properties ("id","homeownerProfileId","address","city","state","zipCode","updatedAt") VALUES ('${PROP}','hp1','1 Test St','Testville','NJ','08536', now())`);
  await sql(`INSERT INTO household_members ("id","propertyId","userId","role","isPrimaryOwner","updatedAt") VALUES ('m1','${PROP}','${CONTRIBUTOR}','CONTRIBUTOR', false, now()), ('m2','${PROP}','${VIEWER}','VIEWER', false, now())`);
});
test.after(async () => { try { await stopSpy(); } catch { /* best effort */ } await prisma.$disconnect(); });

// ---- 7A: the previous-step view and Reopen -------------------------------------------------------------------------------------------------------------------

test('7A on real rows: a view writes NOTHING; Reopen puts the step back in progress as the actor, clears its completion fields, writes one STEP_REOPENED row, and the guide returns to it', async () => {
  const { projectId } = await freshProject();
  const s1 = await stepAt(projectId, 1); const s3 = await stepAt(projectId, 3);
  await confirm('DIY_STEP_UPDATE', (await proposeStep(CONTRIBUTOR, 'COMPLETE', s1.id)).parameters);
  await confirm('DIY_STEP_UPDATE', (await proposeStep(CONTRIBUTOR, 'COMPLETE', s3.id)).parameters);
  assert.ok(actionsOf(await guide(projectId)).some((a) => a.id === 'diy-step-previous' && a.entityId === s3.id), 'Previous step leads to the nearest finished step');

  await startSpy();
  try {
    const view = await viewStep(s1.id);
    assert.equal(view.reasonCode, 'DIY_PREVIOUS_STEP_READY'); parsesAll(view);
    const cardIndex = view.blocks.findIndex((b) => b.type === 'TASK_GUIDE');
    assert.equal(view.blocks[cardIndex - 1].id, 'diy-step-safety', "the viewed step's own safety note is directly above the card");
    assert.ok(actionsOf(view).some((a) => a.id === 'diy-step-reopen'));
    await guide(projectId); await viewStep(s3.id, false);
    assert.deepEqual(await writes(), [], 'views and guide reads write nothing');

    const proposed = await proposeStep(CONTRIBUTOR, 'REOPEN', s1.id);
    assert.equal(proposed.status, 'NEEDS_CONFIRMATION'); assert.ok(proposed.confirmation.fields.some((f) => f.label === 'Safety note'));
    assert.deepEqual(await writes(), [], 'a proposal writes nothing');
    const { result } = await confirm('DIY_STEP_UPDATE', proposed.parameters);
    assert.equal(result.reasonCode, 'DIY_STEP_REOPENED');
    const unexpected = (await writes()).filter((w) => !['diy_project_steps:UPDATE', 'diy_projects:UPDATE', 'diy_project_events:INSERT'].includes(w));
    assert.deepEqual(unexpected, [], 'a reopen writes only the step, the project row and the ledger');
  } finally { await stopSpy(); }

  const after = await stepAt(projectId, 1);
  assert.deepEqual([after.status, after.completedAt, after.completedByUserId], ['IN_PROGRESS', null, null]);
  assert.deepEqual((await events(projectId)).map((e) => [e.type, e.actorUserId]).slice(-1), [['STEP_REOPENED', CONTRIBUTOR]]);
  assert.equal(cardOf(await guide(projectId)).progress.label, 'Step 1 of 3, 1 done', 'the guide returns to the reopened step; the later finished step stays finished');
  assert.equal((await viewStep(s1.id)).reasonCode, 'DIY_PROJECT_GUIDE_READY', 'the viewed step is the current step now');
});

test('7A refusals on real rows: an unfinished step, a withdrawn guide, a role changed after the handler\'s check; and with every step resolved, Review last step still reaches Reopen', async () => {
  const { projectId, templateId } = await freshProject();
  await resolveAll(projectId);
  const summary = await guide(projectId);
  assert.ok(actionsOf(summary).some((a) => a.id === 'diy-review-last-step'), 'Review last step on the all-resolved card');
  assert.ok(actionsOf(summary).some((a) => a.id === 'diy-project-finish'));
  const last = actionsOf(summary).find((a) => a.id === 'diy-review-last-step');
  assert.ok(actionsOf(await viewStep(last.entityId)).some((a) => a.id === 'diy-step-reopen'), 'Reopen is reachable when no step is current');

  const s1 = await stepAt(projectId, 1);
  const proposed = await proposeStep(CONTRIBUTOR, 'REOPEN', s1.id);
  await sql(`UPDATE household_members SET role = 'VIEWER' WHERE "userId" = '${CONTRIBUTOR}' AND "propertyId" = '${PROP}'`);
  try { assert.equal(await codeOf(confirm('DIY_STEP_UPDATE', proposed.parameters)), 'ASK_PERMISSION_REQUIRED', 'the role changed in the database after the handler\'s check'); }
  finally { await sql(`UPDATE household_members SET role = 'CONTRIBUTOR' WHERE "userId" = '${CONTRIBUTOR}' AND "propertyId" = '${PROP}'`); }
  assert.equal((await stepAt(projectId, 1)).status, 'COMPLETED');

  await act(templateId, 'UNPUBLISH', 'publisher');
  assert.equal((await proposeStep(CONTRIBUTOR, 'REOPEN', s1.id)).reasonCode, 'DIY_STEP_GUIDE_NOT_CURRENT');
  assert.equal(actionsOf(await viewStep(s1.id)).some((a) => a.id === 'diy-step-reopen'), false, 'a withdrawn guide offers no reopen');

  const fresh = await freshProject(); const pending = await stepAt(fresh.projectId, 3);
  assert.equal((await proposeStep(CONTRIBUTOR, 'REOPEN', pending.id)).reasonCode, 'DIY_STEP_NOT_REOPENABLE');
});

// ---- 7B: finish, stop and hand off -------------------------------------------------------------------------------------------------------------------------

test('7B FINISH on real rows, measured by triggers: the project, one ledger row and ONE outbox row, and nothing in tasks, home events or incidents; the outbox row stays PENDING (no worker runs here)', async () => {
  const { projectId } = await freshProject();
  await resolveAll(projectId);
  tracked.length = 0;
  await startSpy();
  let receipt;
  try {
    const proposed = await proposeFinish(CONTRIBUTOR, projectId);
    assert.equal(proposed.status, 'NEEDS_CONFIRMATION'); assert.match(proposed.confirmation.description, /cannot be undone in Cozy/);
    assert.deepEqual(await writes(), [], 'a proposal writes nothing');
    receipt = (await confirm('DIY_PROJECT_COMPLETE', proposed.parameters)).result;
    const seen = await writes();
    const unexpected = seen.filter((w) => !['diy_projects:UPDATE', 'diy_project_events:INSERT', 'domain_events:INSERT'].includes(w));
    assert.deepEqual(unexpected, [], `nothing outside the project, the ledger and the outbox: ${JSON.stringify(seen)}`);
    assert.ok(['diy_projects:UPDATE', 'diy_project_events:INSERT', 'domain_events:INSERT'].every((w) => seen.includes(w)), JSON.stringify(seen));
  } finally { await stopSpy(); }
  const project = await getProject(projectId);
  assert.deepEqual([project.status, project.completedByUserId, project.completionBasis], ['COMPLETED', CONTRIBUTOR, 'STEPS']);
  const outbox = await prisma.domainEvent.findMany({ where: { idempotencyKey: DIY_COMPLETION_EVENT_KEY(projectId) } });
  assert.equal(outbox.length, 1, 'exactly one outbox row');
  assert.deepEqual([outbox[0].type, outbox[0].status], ['DIY_PROJECT_COMPLETED', 'PENDING']);
  assert.equal(receipt.blocks[0].title, 'Finished by you'); assert.match(receipt.blocks[0].description, /Recording your completion/);
  assert.equal(tracked.length, 1, 'analytics once, for the newly applied completion');
  assert.ok((await events(projectId)).some((e) => e.type === 'PROJECT_COMPLETED' && e.actorUserId === CONTRIBUTOR));

  // A replay is "already": no second outbox row, no second ledger row, no analytics.
  assert.equal((await proposeFinish(CONTRIBUTOR, projectId)).reasonCode, 'DIY_PROJECT_ALREADY_COMPLETED');
  assert.equal((await prisma.domainEvent.count({ where: { idempotencyKey: DIY_COMPLETION_EVENT_KEY(projectId) } })), 1);
  assert.equal(tracked.length, 1);
  assert.equal((await guide(projectId)).reasonCode, 'DIY_PROJECT_FINISHED_VIEW');
});

test('7B STOP and HAND OFF on real rows: the project and one ledger row only; a linked task is byte-for-byte untouched; nothing in the outbox; closed projects are refused; the role is checked inside the transaction', async () => {
  for (const [key, status, ledger] of [['STOP', 'ABANDONED', 'PROJECT_ABANDONED'], ['HAND_OFF', 'HIRED_OUT', 'PROJECT_HIRED_OUT']]) {
    const task = await prisma.propertyMaintenanceTask.create({ data: { propertyId: PROP, title: `Linked task for ${key}` } });
    const { projectId } = await freshProject({ maintenanceTaskId: task.id });
    const taskBefore = JSON.stringify(await prisma.propertyMaintenanceTask.findUnique({ where: { id: task.id } }));
    const options = await guide(projectId, true, { actionId: 'MORE' });
    assert.equal(options.reasonCode, 'DIY_PROJECT_OPTIONS_READY'); assert.match(cardOf(options).main.body, /Neither can be undone in Cozy/);
    tracked.length = 0;
    await startSpy();
    try {
      const proposed = await proposeStop(CONTRIBUTOR, projectId, key);
      assert.equal(proposed.status, 'NEEDS_CONFIRMATION');
      assert.deepEqual(await writes(), []);
      await confirm('DIY_PROJECT_ABANDON', proposed.parameters);
      const unexpected = (await writes()).filter((w) => !['diy_projects:UPDATE', 'diy_project_events:INSERT'].includes(w));
      assert.deepEqual(unexpected, [], `${key}: only the project and the ledger`);
    } finally { await stopSpy(); }
    const project = await getProject(projectId);
    assert.equal(project.status, status);
    assert.ok(project.abandonedAt instanceof Date);
    assert.equal(JSON.stringify(await prisma.propertyMaintenanceTask.findUnique({ where: { id: task.id } })), taskBefore, `${key}: the linked task is untouched`);
    assert.equal(await prisma.domainEvent.count({ where: { idempotencyKey: DIY_COMPLETION_EVENT_KEY(projectId) } }), 0, 'no outbox row');
    assert.equal((await events(projectId)).slice(-1)[0].type, ledger);
    assert.deepEqual(tracked.map((e) => e.metadataJson.actionType), ['abandon_project']);
    assert.equal((await guide(projectId)).reasonCode, 'DIY_GUIDE_PROJECT_FINISHED');
    assert.equal((await proposeStop(CONTRIBUTOR, projectId, key)).reasonCode, key === 'STOP' ? 'DIY_PROJECT_ALREADY_STOPPED' : 'DIY_PROJECT_ALREADY_HANDED_OFF');
  }
  // The page path: a viewer or a removed member is refused INSIDE the service transaction.
  const { projectId } = await freshProject();
  const token = (await getProject(projectId)).updatedAt.toISOString();
  const call = (actorUserId) => diyService.abandonProject(projectId, PROP, false, { actorUserId, expectedUpdatedAt: token });
  assert.equal(await codeOf(call(VIEWER)), 'DIY_ACCESS_REVOKED');
  assert.equal(await codeOf(call('nobody')), 'DIY_ACCESS_REVOKED');
  assert.equal((await getProject(projectId)).status, 'PLANNING');
});

test('7B FINISH with a linked task: the Ask command itself never touches the task or an incident (the worker would, later; it does not run here)', async () => {
  const task = await prisma.propertyMaintenanceTask.create({ data: { propertyId: PROP, title: 'Linked task for finish' } });
  const { projectId } = await freshProject({ maintenanceTaskId: task.id });
  await resolveAll(projectId);
  const proposed = await proposeFinish(CONTRIBUTOR, projectId);
  assert.match(proposed.confirmation.description, /queue the linked maintenance task to be marked done as DIY work/);
  assert.equal(proposed.confirmation.fields.find((f) => f.label === 'Linked maintenance task').value, 'Cozy will queue it to be marked done as DIY work');
  const taskBefore = JSON.stringify(await prisma.propertyMaintenanceTask.findUnique({ where: { id: task.id } }));
  await confirm('DIY_PROJECT_COMPLETE', proposed.parameters);
  assert.equal(JSON.stringify(await prisma.propertyMaintenanceTask.findUnique({ where: { id: task.id } })), taskBefore, 'the task row is unchanged by the command');
  const outbox = await prisma.domainEvent.findUnique({ where: { idempotencyKey: DIY_COMPLETION_EVENT_KEY(projectId) } });
  assert.deepEqual([outbox.status, outbox.payload.projectId], ['PENDING', projectId]);
});

// ---- 7C: recovery -----------------------------------------------------------------------------------------------------------------------------------------------

test('7C RECOVERY of the completion event on real rows: only a dead letter is re-queued, once, with who and how many times recorded; the finished view offers it only then; the receipt claims nothing', async () => {
  const { projectId } = await freshProject();
  await resolveAll(projectId);
  await confirm('DIY_PROJECT_COMPLETE', (await proposeFinish(CONTRIBUTOR, projectId)).parameters);
  const key = DIY_COMPLETION_EVENT_KEY(projectId);
  assert.equal(actionsOf(await guide(projectId)).some((a) => a.id === 'diy-record-again'), false, 'a PENDING event: no recovery offered');
  assert.equal((await proposeRecover(CONTRIBUTOR, projectId, 'COMPLETION_EFFECTS')).reasonCode, 'DIY_RECOVER_ALREADY_QUEUED');

  await sql(`UPDATE domain_events SET status = 'DEAD_LETTER', attempts = 5, "lastError" = 'boom' WHERE "idempotencyKey" = '${key}'`);
  const finished = await guide(projectId);
  assert.equal(finished.reasonCode, 'DIY_PROJECT_FINISHED_VIEW'); parsesAll(finished);
  assert.match(cardOf(finished).main.body, /Some records could not be updated/);
  assert.ok(actionsOf(finished).some((a) => a.id === 'diy-record-again'));
  assert.equal(actionsOf(await guide(projectId, false)).some((a) => a.id === 'diy-record-again'), false, 'never for a viewer');

  const proposed = await proposeRecover(CONTRIBUTOR, projectId, 'COMPLETION_EFFECTS');
  assert.equal(proposed.status, 'NEEDS_CONFIRMATION'); assert.match(proposed.confirmation.description, /cannot tell you whether the retry worked/);
  const projectBefore = JSON.stringify(await getProject(projectId));
  await startSpy();
  try {
    const { result } = await confirm('DIY_COMPLETION_RECOVER', proposed.parameters);
    assert.equal(result.blocks[0].title, 'Queued again'); assert.match(result.blocks[0].description, /does not know yet whether it worked/);
    assert.deepEqual(await writes(), ['domain_events:UPDATE'], 'a recovery writes only the one outbox row');
  } finally { await stopSpy(); }
  const row = await prisma.domainEvent.findUnique({ where: { idempotencyKey: key } });
  assert.deepEqual([row.status, row.attempts, row.lastError], ['PENDING', 0, null]);
  assert.deepEqual([row.payload.recovery.count, row.payload.recovery.lastBy], [1, CONTRIBUTOR]);
  assert.equal(JSON.stringify(await getProject(projectId)), projectBefore, 'the project is untouched');
  assert.match(cardOf(await guide(projectId)).main.body, /Recording your completion/);
  // Statuses that are not dead letters are left alone, by the service itself.
  for (const status of ['PENDING', 'PROCESSING', 'FAILED', 'PROCESSED']) {
    await sql(`UPDATE domain_events SET status = '${status}' WHERE "idempotencyKey" = '${key}'`);
    assert.equal((await diyService.retryCompletionEffects(projectId, PROP, CONTRIBUTOR)).reset, false, status);
  }
});

test('7C TWO RECOVERIES AT ONCE re-queue a dead letter exactly once (real concurrent transactions); a viewer and a removed member are refused inside the transaction', async () => {
  const { projectId } = await freshProject();
  await resolveAll(projectId);
  await confirm('DIY_PROJECT_COMPLETE', (await proposeFinish(CONTRIBUTOR, projectId)).parameters);
  const key = DIY_COMPLETION_EVENT_KEY(projectId);
  await sql(`UPDATE domain_events SET status = 'DEAD_LETTER' WHERE "idempotencyKey" = '${key}'`);
  assert.equal(await codeOf(diyService.retryCompletionEffects(projectId, PROP, VIEWER)), 'DIY_ACCESS_REVOKED');
  assert.equal(await codeOf(diyService.retryCompletionEffects(projectId, PROP, 'nobody')), 'DIY_ACCESS_REVOKED');
  assert.equal((await prisma.domainEvent.findUnique({ where: { idempotencyKey: key } })).status, 'DEAD_LETTER');
  const settled = await Promise.allSettled([diyService.retryCompletionEffects(projectId, PROP, OWNER), diyService.retryCompletionEffects(projectId, PROP, CONTRIBUTOR)]);
  assert.equal(settled.filter((s) => s.status === 'fulfilled' && s.value.reset).length, 1, JSON.stringify(settled.map((s) => s.status === 'fulfilled' ? s.value.reset : s.reason.code)));
  assert.equal((await prisma.domainEvent.findUnique({ where: { idempotencyKey: key } })).payload.recovery.count, 1);
});

test('7C TASK-LINK recovery on an OPEN project: a linked task completed elsewhere whose reconciliation dead-lettered shows on the open guide; recovery re-queues it; a project closed from its linked task shows no action', async () => {
  const task = await prisma.propertyMaintenanceTask.create({ data: { propertyId: PROP, title: 'Task completed elsewhere', status: 'COMPLETED', completionMetadata: { reconciliationOccurrenceId: 'occ-7d' } } });
  const { projectId } = await freshProject({ maintenanceTaskId: task.id });
  const key = DIY_TASK_RECONCILE_EVENT_KEY(task.id, 'occ-7d');
  await prisma.domainEvent.create({ data: { type: 'DIY_TASK_COMPLETED_RECONCILE', status: 'DEAD_LETTER', propertyId: PROP, userId: OWNER, idempotencyKey: key, attempts: 5, payload: { projectIds: [projectId] } } });
  const open = await guide(projectId);
  const block = open.blocks.find((b) => b.id === 'diy-task-link');
  assert.ok(block, 'the recoverable task-link failure shows on the open guide'); parsesAll(open);
  assert.ok(open.blocks.findIndex((b) => b.id === 'diy-task-link') < open.blocks.findIndex((b) => b.id === 'diy-step-safety'));
  assert.equal(open.blocks[open.blocks.findIndex((b) => b.type === 'TASK_GUIDE') - 1].id, 'diy-step-safety', 'the safety note is still directly above the card');
  assert.deepEqual(block.actions.map((a) => a.id), ['diy-task-record-again']);
  assert.deepEqual((await guide(projectId, false)).blocks.find((b) => b.id === 'diy-task-link').actions, []);
  const proposed = await proposeRecover(CONTRIBUTOR, projectId, 'TASK_LINK');
  assert.equal(proposed.status, 'NEEDS_CONFIRMATION');
  await confirm('DIY_COMPLETION_RECOVER', proposed.parameters);
  const row = await prisma.domainEvent.findUnique({ where: { idempotencyKey: key } });
  assert.deepEqual([row.status, row.payload.recovery.count], ['PENDING', 1]);
  assert.equal(JSON.stringify(await prisma.propertyMaintenanceTask.findUnique({ where: { id: task.id } })).includes('Task completed elsewhere'), true);
  assert.equal(block.actions.length, 1);
  assert.equal((await proposeRecover(CONTRIBUTOR, projectId, 'COMPLETION_EFFECTS')).reasonCode, 'DIY_RECOVER_NOT_NEEDED', 'the completion action on an open project');
  // Closed from its linked task: the page's disclosure, no action.
  await sql(`UPDATE diy_projects SET status = 'COMPLETED', "completionBasis" = 'LINKED_TASK', "completedAt" = now() WHERE id = '${projectId}'`);
  const closed = await guide(projectId);
  assert.equal(closed.reasonCode, 'DIY_PROJECT_FINISHED_VIEW');
  assert.equal(actionsOf(closed).some((a) => /record-again/.test(a.id)), false);
});

// ---- real concurrency -------------------------------------------------------------------------------------------------------------------------------------

test('FINISH RACING A REOPEN, real concurrent transactions (several rounds): the project is never COMPLETED with an unfinished step', async () => {
  for (let round = 0; round < 4; round += 1) {
    const { projectId } = await freshProject();
    await resolveAll(projectId);
    const finishParams = (await proposeFinish(CONTRIBUTOR, projectId)).parameters;
    const s1 = await stepAt(projectId, 1);
    const reopenParams = (await proposeStep(CONTRIBUTOR, 'REOPEN', s1.id)).parameters;
    await Promise.allSettled([confirm('DIY_PROJECT_COMPLETE', finishParams), confirm('DIY_STEP_UPDATE', reopenParams)]);
    const project = await getProject(projectId);
    const steps = await stepRows(projectId);
    const open = steps.filter((row) => !['COMPLETED', 'SKIPPED'].includes(row.status));
    if (project.status === 'COMPLETED') assert.deepEqual(open.map((row) => row.id), [], `round ${round}: a COMPLETED project has no unfinished step`);
    else assert.ok(open.length >= 1 && project.status === 'IN_PROGRESS', `round ${round}: otherwise the reopen won and the project is open with the reopened step`);
    assert.ok((await prisma.domainEvent.count({ where: { idempotencyKey: DIY_COMPLETION_EVENT_KEY(projectId) } })) === (project.status === 'COMPLETED' ? 1 : 0), `round ${round}: an outbox row exists exactly when the project completed`);
  }
});

test('THE SHARE LOCK for the project commands, real concurrent transactions: a withdrawal that starts first makes Finish WAIT and then refuse; a held lock makes a withdrawal WAIT', async () => {
  const { projectId, templateId } = await freshProject();
  await resolveAll(projectId);
  const proposed = await proposeFinish(CONTRIBUTOR, projectId);
  const revisionId = (await getProject(projectId)).templateRevisionId;
  const pending = async (promise, ms = 1500) => { let settled = false; promise.then(() => { settled = true; }, () => { settled = true; }); await wait(ms); return !settled; };

  let releaseAdmin; const adminHeld = new Promise((resolve) => { releaseAdmin = resolve; });
  const admin = prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`UPDATE diy_template_revisions SET "retiredAt" = now(), "retiredReason" = 'UNPUBLISHED' WHERE id = '${revisionId}'`);
    await tx.$executeRawUnsafe(`UPDATE diy_project_templates SET "publishedRevisionId" = NULL WHERE id = '${templateId}'`);
    await adminHeld;
  }, { timeout: 30000 });
  await wait(300);
  const finishing = diyService.completeProject(projectId, PROP, {}, { actorUserId: CONTRIBUTOR, expectedUpdatedAt: proposed.parameters.diyProjectExpectedUpdatedAt, askPolicy: 'COMPLETE_PROJECT' });
  assert.equal(await pending(finishing), true, 'Finish is WAITING on the withdrawal\'s row lock');
  releaseAdmin(); await admin;
  assert.equal(await codeOf(finishing), 'DIY_GUIDE_NOT_CURRENT');
  assert.equal((await getProject(projectId)).status, 'IN_PROGRESS');

  const second = await freshProject(); await resolveAll(second.projectId);
  const revision2 = (await getProject(second.projectId)).templateRevisionId;
  let releaseLock; const lockHeld = new Promise((resolve) => { releaseLock = resolve; });
  let acquired; const gotLock = new Promise((resolve) => { acquired = resolve; });
  const holder = prisma.$transaction(async (tx) => { await shareLockGovernanceRows(tx, { revisionId: revision2, templateId: second.templateId }); acquired(); await lockHeld; }, { timeout: 30000 });
  await gotLock;
  const withdrawal = act(second.templateId, 'UNPUBLISH', 'publisher');
  assert.equal(await pending(withdrawal), true, 'the withdrawal is WAITING for the share lock');
  releaseLock(); await holder; await withdrawal;
  assert.equal((await prisma.diyTemplateRevision.findUnique({ where: { id: revision2 } })).retiredReason, 'UNPUBLISHED');
});
