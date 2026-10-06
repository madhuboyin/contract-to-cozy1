// SCRATCH-DATABASE RUN for DIY reverse reconciliation (docs/architecture/ASK_COZY_DIY_TASK_RECONCILIATION_PLAN.md slice 4c).
//
// Runs the REAL governed maintenance completion (with its new transaction), the REAL domain-events job (`processDomainEventsJob`, default dependencies), the REAL
// reconciliation handler and adapters, the REAL DIY transitions, the REAL completion outbox and home event service, and the REAL disclosure and recovery,
// against a REAL, EMPTY, throwaway Postgres. It checks what the unit tests cannot: that the request is atomic with the task's completion on a real
// transaction, that the transaction wrapper leaves the task's seasonal sync, counters and recurring roll-forward exactly as they were, that the worker
// applies each rule to real projects, and the failure, redelivery, race and recovery behavior. NOT part of `npm test` (the name does not end in .test.js).
// It TRUNCATES the DIY, user, property and seasonal tables it seeds, so it refuses to run against anything that is not an obviously-scratch local database.
//
// Run from apps/workers (setup and safety rules: docs/operations/DIY_TASK_RECONCILIATION_ROLLOUT.md and DIY_COMPLETION_OUTBOX_ROLLOUT.md):
//   SCRATCH_DATABASE_URL=postgresql://scratch@127.0.0.1:54391/scratch_c2c_4c node --require ts-node/register --require tsconfig-paths/register --test tests/scratch/diyTaskReconciliation.scratch.js
// Add WORKER_STUBS=1 to run it with the seven backend modules the production worker image replaces with stubs (apps/workers/stubs).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const URL_ = process.env.SCRATCH_DATABASE_URL;
if (!URL_) { console.log('SCRATCH_DATABASE_URL is not set: skipping the scratch-database run.'); process.exit(0); }
const match = /^postgres(?:ql)?:\/\/([^:@/]+)(?::[^@]*)?@(127\.0\.0\.1|localhost):(\d+)\/([A-Za-z0-9_]+)$/.exec(URL_);
if (!match || !/scratch/i.test(match[4]) || match[3] === '5433' || /contracttocozy/i.test(URL_)) {
  console.error(`REFUSING to run: SCRATCH_DATABASE_URL must be a local postgres URL whose database name contains "scratch" (and is not the dev database). Got: ${URL_.replace(/:[^:@/]*@/, ':***@')}`);
  process.exit(1);
}
const [, , , DB_PORT, DB_NAME] = match;
process.env.DATABASE_URL = URL_; // set before anything loads a Prisma client
process.env.NODE_ENV = 'test';
const WITH_STUBS = process.env.WORKER_STUBS === '1';

const workersRoot = path.resolve(__dirname, '../..');
const backendSrc = path.resolve(workersRoot, '../backend/src');
if (WITH_STUBS) {
  // The image compiles each stub INTO the backend tree at the module's own path; evaluate each stub as a module located at the file it replaces.
  const ts = require('typescript'); const Module = require('node:module');
  const script = fs.readFileSync(path.join(workersRoot, 'scripts/build-worker-backend-overrides.js'), 'utf8');
  for (const m of script.matchAll(/'([^']+\.ts)':\s*'([^']+)\.js'/g)) {
    const stub = path.join(workersRoot, 'stubs', m[1]); const backend = path.join(backendSrc, `${m[2]}.ts`);
    const output = ts.transpileModule(fs.readFileSync(stub, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const mod = new Module(backend, null); mod.filename = backend; mod.paths = Module._nodeModulePaths(path.dirname(backend));
    require.cache[backend] = mod; mod._compile(output, backend); mod.loaded = true;
  }
  console.log('# running WITH the seven production worker stubs applied');
}

const { prisma } = require('@worker-shared/lib/prisma');
const { diyService } = require('@worker-shared/services/diy.service');
const { processDomainEventsJob } = require('../../src/jobs/processDomainEvents.job.ts');
const { PropertyMaintenanceTaskService, completeMaintenanceTaskForDiyOutbox } = require('@worker-shared/services/PropertyMaintenanceTask.service');
const { processDiyTaskReconciliationEventWithDefaults } = require('@worker-shared/services/diy/diyTaskReconciliationAdapters');
const { planDiyTaskReconciliation } = require('@worker-shared/services/diy/diyTaskReconciliationRequest');

const psql = (sql) => prisma.$executeRawUnsafe(sql);
// The timestamp columns are `timestamp(3) without time zone` holding UTC (Prisma's convention); a raw `now()` would write the SESSION's local time instead.
const UTC_NOW = "(now() AT TIME ZONE 'UTC')";
const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const RECONCILE = (taskId) => prisma.domainEvent.findMany({ where: { type: 'DIY_TASK_COMPLETED_RECONCILE', idempotencyKey: { startsWith: `diy-task-reconcile:${taskId}:` } }, orderBy: { createdAt: 'asc' } });
const runJob = () => processDomainEventsJob({ batchSize: 50 });
/** Drops the noise a governed completion emits (radar reconciliation requests) so later job runs only see the DIY events; returns what it dropped. */
const sweepNoise = async () => { const rows = await prisma.domainEvent.findMany({ where: { type: { notIn: ['DIY_TASK_COMPLETED_RECONCILE', 'DIY_PROJECT_COMPLETED'] } } }); await prisma.domainEvent.deleteMany({ where: { type: { notIn: ['DIY_TASK_COMPLETED_RECONCILE', 'DIY_PROJECT_COMPLETED'] } } }); return rows; };
const settleAll = () => psql(`UPDATE domain_events SET status = 'PROCESSED' WHERE status IN ('PENDING','FAILED','PROCESSING')`);
const makeDue = () => psql(`UPDATE domain_events SET "availableAt" = ${UTC_NOW} - interval '1 second' WHERE status = 'FAILED'`);
const project = (id) => prisma.diyProject.findUnique({ where: { id } });
const ledger = (id) => prisma.diyProjectEvent.findMany({ where: { projectId: id }, orderBy: { at: 'asc' } });
const task = (id) => prisma.propertyMaintenanceTask.findUnique({ where: { id } });
const view = async (id) => diyService.getProjectWithCompletionEffects(id, P1);

let seq = 0;
/** A recurring seasonal maintenance task (with its checklist item, so the governed side effects have something to sync). */
async function seedTask({ propertyId = P1, seasonal = true, recurring = true } = {}) {
  seq += 1;
  const id = `rt${seq}`;
  const ids = { task: id, item: null, checklist: null };
  if (seasonal) {
    const template = await prisma.seasonalTaskTemplate.create({ data: { taskKey: `rk${seq}`, season: 'FALL', title: `Seasonal ${seq}`, climateRegions: ['MODERATE'] } });
    const checklist = await prisma.seasonalChecklist.create({ data: { propertyId, season: 'FALL', year: 3000 + seq, climateRegion: 'MODERATE', seasonStartDate: new Date('2026-09-22'), seasonEndDate: new Date('2026-12-20'), totalTasks: 1, tasksAdded: 1 } });
    const item = await prisma.seasonalChecklistItem.create({ data: { seasonalChecklistId: checklist.id, seasonalTaskTemplateId: template.id, propertyId, taskKey: `rk${seq}`, title: `Seasonal ${seq}`, status: 'ADDED' } });
    ids.item = item.id; ids.checklist = checklist.id;
  }
  await prisma.propertyMaintenanceTask.create({
    data: {
      id, propertyId, title: `Task ${seq}`, source: seasonal ? 'SEASONAL' : 'USER_CREATED', status: 'PENDING', isRecurring: recurring, frequency: recurring ? 'QUARTERLY' : null,
      nextDueDate: recurring ? new Date('2026-10-20T00:00:00Z') : null, isSeasonal: seasonal, season: seasonal ? 'FALL' : null, seasonalChecklistItemId: ids.item,
    },
  });
  return ids;
}
/** A DIY project linked to a task. `done` marks its (single required) step completed so the completion rule holds. */
async function seedProject(taskId, { done = false, title, status = 'IN_PROGRESS', propertyId = P1 } = {}) {
  seq += 1;
  const id = `rp${seq}`;
  await prisma.diyProject.create({
    data: {
      id, propertyId, userId: 'u1', title: title ?? `Project ${seq}`, category: 'PAINTING', status, maintenanceTaskId: taskId,
      steps: { create: [{ id: `${id}s1`, stepNumber: 1, title: 'Do it', description: 'x', status: done ? 'COMPLETED' : 'PENDING' }, { id: `${id}s2`, stepNumber: 2, title: 'Optional', description: 'y', isOptional: true, status: done ? 'SKIPPED' : 'PENDING' }] },
    },
  });
  return id;
}
const completeVia = (taskId, details, actor = 'u2', key = 'k-1') => PropertyMaintenanceTaskService.updateTaskStatus(actor, taskId, 'COMPLETED', undefined, undefined, key, details);
const steps = (id) => prisma.diyProjectStep.findMany({ where: { projectId: id }, orderBy: { stepNumber: 'asc' }, select: { id: true, status: true, updatedAt: true } });

test.before(async () => {
  const [{ db, port }] = await prisma.$queryRawUnsafe('select current_database() as db, inet_server_port() as port');
  assert.equal(db, DB_NAME, 'connected to the scratch database'); assert.equal(Number(port), Number(DB_PORT), 'on the scratch port');
  await psql('TRUNCATE domain_events, diy_project_events, diy_project_steps, diy_projects, seasonal_task_templates, properties, homeowner_profiles, users RESTART IDENTITY CASCADE');
  await psql(`INSERT INTO users ("id","email","firstName","lastName","passwordHash","updatedAt") VALUES ('u1','s1@example.test','S','C','x', now()), ('u2','s2@example.test','T','D','x', now()), ('u3','s3@example.test','V','W','x', now())`);
  await psql(`INSERT INTO homeowner_profiles ("id","userId","updatedAt") VALUES ('hp1','u1', now())`);
  await psql(`INSERT INTO properties ("id","homeownerProfileId","address","city","state","zipCode","updatedAt") VALUES ('${P1}','hp1','1 Test St','Testville','NJ','08536', now()), ('${P2}','hp1','2 Other St','Testville','NJ','08536', now())`);
  await psql(`INSERT INTO household_members ("id","propertyId","userId","role","updatedAt") VALUES ('hm2','${P1}','u2','CONTRIBUTOR', now()), ('hm3','${P1}','u3','VIEWER', now())`);
});
test.after(async () => { await prisma.$disconnect(); });

// ---- the request is atomic with the task's completion, and the wrapper leaves everything else as it was -------------------------------------------------------

test('a governed completion with an open linked project writes the task completion AND the request in one real transaction: the occurrence id is on the task, the event is keyed by it, and the seasonal sync, counter, roll-forward and radar request still happen', async () => {
  const t = await seedTask(); const p = await seedProject(t.task);
  const before = await task(t.task);
  await completeVia(t.task, { fulfillmentMode: 'PROVIDER', completedAt: new Date('2026-10-06T12:00:00Z') });
  const after = await task(t.task);
  assert.equal(after.status, 'COMPLETED');
  const occurrence = after.completionMetadata.reconciliationOccurrenceId;
  assert.match(occurrence, /^[0-9a-f-]{36}$/);
  assert.equal(after.completionMetadata.completionIdempotencyKey, 'k-1', 'the existing completion metadata survived the merge');
  const [event] = await RECONCILE(t.task);
  assert.deepEqual([event.status, event.idempotencyKey, event.propertyId, event.userId], ['PENDING', `diy-task-reconcile:${t.task}:${occurrence}`, P1, 'u2']);
  assert.deepEqual({ ...event.payload, occurrenceId: 'x' }, { taskId: t.task, propertyId: P1, occurrenceId: 'x', actorUserId: 'u2', completedAt: '2026-10-06T12:00:00.000Z', fulfillmentMode: 'PROVIDER', completionKey: 'k-1', projectIds: [p] });
  assert.equal(event.payload.occurrenceId, occurrence);
  // The transaction wrapper must not have changed the governed side effects.
  assert.ok(after.nextDueDate.getTime() > before.nextDueDate.getTime(), 'recurring roll-forward');
  assert.equal((await prisma.seasonalChecklistItem.findUnique({ where: { id: t.item } })).status, 'COMPLETED');
  assert.equal((await prisma.seasonalChecklist.findUnique({ where: { id: t.checklist } })).tasksCompleted, 1);
  assert.ok((await sweepNoise()).some((row) => row.type === 'RADAR_PROPERTY_RECONCILIATION_REQUESTED'), 'the radar reconciliation request');
  await settleAll();
});

test('ATOMICITY: when the request cannot be written, the task completion rolls back with it (still PENDING, no occurrence id, no seasonal change, no counter)', async () => {
  const t = await seedTask(); await seedProject(t.task);
  await psql(`CREATE OR REPLACE FUNCTION scratch_fail_reconcile() RETURNS trigger AS $$ BEGIN IF NEW."type" = 'DIY_TASK_COMPLETED_RECONCILE' THEN RAISE EXCEPTION 'scratch: reconcile insert refused'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await psql('CREATE TRIGGER scratch_fail_reconcile_trg BEFORE INSERT ON domain_events FOR EACH ROW EXECUTE FUNCTION scratch_fail_reconcile()');
  try {
    await assert.rejects(completeVia(t.task, { fulfillmentMode: 'DIY' }), /reconcile insert refused/);
  } finally { await psql('DROP TRIGGER IF EXISTS scratch_fail_reconcile_trg ON domain_events'); }
  const after = await task(t.task);
  assert.deepEqual([after.status, after.completionMetadata], ['PENDING', null], 'the completion did not happen');
  assert.equal((await prisma.seasonalChecklistItem.findUnique({ where: { id: t.item } })).status, 'ADDED');
  assert.equal((await prisma.seasonalChecklist.findUnique({ where: { id: t.checklist } })).tasksCompleted, 0, 'the side effects never ran');
  assert.equal((await RECONCILE(t.task)).length, 0);
  // And the same completion succeeds once the cause is gone: nothing was left half-done.
  await completeVia(t.task, { fulfillmentMode: 'DIY' }, 'u2', 'k-retry');
  assert.equal((await task(t.task)).status, 'COMPLETED');
  await sweepNoise(); await settleAll();
});

test('no linked open project: no occurrence id, no event, and the completion is exactly as before (status, roll-forward, seasonal item, counter)', async () => {
  const t = await seedTask();
  await seedProject(t.task, { status: 'COMPLETED' }); await seedProject(t.task, { status: 'ABANDONED' }); // closed projects do not count
  const before = await task(t.task);
  await completeVia(t.task, { fulfillmentMode: 'DIY' });
  const after = await task(t.task);
  assert.equal(after.completionMetadata.reconciliationOccurrenceId, undefined);
  assert.equal((await RECONCILE(t.task)).length, 0);
  assert.ok(after.nextDueDate.getTime() > before.nextDueDate.getTime());
  assert.equal((await prisma.seasonalChecklist.findUnique({ where: { id: t.checklist } })).tasksCompleted, 1);
  await sweepNoise();
});

test('ACCESS inside the transaction: a viewer is refused with nothing written; the internal DIY export (authorized earlier) still requests reconciliation for another open project', async () => {
  const t = await seedTask(); await seedProject(t.task);
  await assert.rejects(completeVia(t.task, { fulfillmentMode: 'DIY' }, 'u3'), /does not have access/);
  assert.deepEqual([(await task(t.task)).status, (await RECONCILE(t.task)).length], ['PENDING', 0]);
  await completeMaintenanceTaskForDiyOutbox('u3', t.task, 'COMPLETED', undefined, undefined, 'diy-project-completed:other', { fulfillmentMode: 'DIY' });
  assert.equal((await task(t.task)).status, 'COMPLETED');
  assert.equal((await RECONCILE(t.task)).length, 1, 'authorization was captured when that other project completed');
  await sweepNoise(); await settleAll();
});

test('the in-transaction access check on a REAL transaction (the window between the public check and the write): a viewer and a stranger are refused, a contributor passes, and a legacy owner with no membership row passes WITHOUT one being written', async () => {
  const t = await seedTask(); await seedProject(t.task);
  const plan = (actor, accessVerifiedElsewhere = false) => prisma.$transaction((tx) => planDiyTaskReconciliation(tx, { taskId: t.task, propertyId: P1, actorUserId: actor, accessVerifiedElsewhere }));
  await assert.rejects(plan('u3'), /does not have access/);
  await assert.rejects(plan('nobody'), /does not have access/);
  assert.equal((await plan('u2')).projectIds.length, 1);
  assert.equal((await plan('u1')).projectIds.length, 1, 'the property owner through the homeowner profile');
  assert.equal(await prisma.householdMember.count({ where: { userId: 'u1', propertyId: P1 } }), 0, 'checking access never wrote the owner membership row the old check would have created');
  assert.equal((await plan('nobody', true)).projectIds.length, 1, 'authorization verified elsewhere is not checked a second time');
});

// ---- the worker applies each rule to real projects --------------------------------------------------------------------------------------------------------

test('PROVIDER: the real job hires the project out (basis LINKED_TASK, the completing user on the ledger, steps untouched, no outbox event); the page says a pro completed the task', async () => {
  const t = await seedTask(); const p = await seedProject(t.task);
  const stepsBefore = JSON.stringify(await steps(p));
  await completeVia(t.task, { fulfillmentMode: 'PROVIDER' }); await sweepNoise();
  const result = await runJob();
  assert.equal(result.processed, 1, JSON.stringify(result));
  const after = await project(p);
  assert.deepEqual([after.status, after.completionBasis, !!after.abandonedAt], ['HIRED_OUT', 'LINKED_TASK', true]);
  assert.equal(JSON.stringify(await steps(p)), stepsBefore);
  assert.deepEqual((await ledger(p)).map((e) => `${e.type}:${e.actorUserId}`), ['PROJECT_HIRED_OUT:u2']);
  assert.equal(await prisma.domainEvent.count({ where: { type: 'DIY_PROJECT_COMPLETED' } }), 0);
  assert.deepEqual((await RECONCILE(t.task))[0].payload.processingOutcome, { result: 'APPLIED', projectOutcomes: { [p]: 'HIRED_OUT' } });
  const shown = await view(p);
  assert.equal(shown.taskLink.summary, 'Closed because a pro completed your linked task.');
  assert.equal(shown.completionEffects, null);
  await sweepNoise();
});

test('DIY with required steps open: the real job closes the project by the linked task (the task\'s completion time, steps untouched, NO home event and NO completion outbox event)', async () => {
  const t = await seedTask(); const p = await seedProject(t.task);
  const stepsBefore = JSON.stringify(await steps(p));
  await completeVia(t.task, { fulfillmentMode: 'DIY', completedAt: new Date('2026-10-05T09:00:00Z') }); await sweepNoise();
  await runJob();
  const after = await project(p);
  assert.deepEqual([after.status, after.completionBasis, after.completedByUserId, after.completedAt.toISOString()], ['COMPLETED', 'LINKED_TASK', 'u2', '2026-10-05T09:00:00.000Z']);
  assert.equal(JSON.stringify(await steps(p)), stepsBefore, 'no step was changed');
  assert.deepEqual((await ledger(p)).map((e) => e.type), ['PROJECT_CLOSED_BY_LINKED_TASK']);
  assert.equal(await prisma.domainEvent.count({ where: { type: 'DIY_PROJECT_COMPLETED' } }), 0);
  assert.equal(await prisma.homeEvent.count({ where: { idempotencyKey: `diy-complete-${p}` } }), 0);
  assert.equal((await view(p)).completionEffects, null, 'a linked-task closure is not "legacy" and expects no records');
  await sweepNoise();
});

test('DIY with the completion rule holding: the real job runs the NORMAL completion (basis STEPS, outbox event); the next job run records the home event, and the task is ALREADY_DONE (no second completion, no second request)', async () => {
  const t = await seedTask(); const p = await seedProject(t.task, { done: true });
  await completeVia(t.task, { fulfillmentMode: 'DIY' }); await sweepNoise();
  await runJob(); await sweepNoise();
  const after = await project(p);
  assert.deepEqual([after.status, after.completionBasis, after.completedByUserId], ['COMPLETED', 'STEPS', 'u2']);
  assert.equal(await prisma.domainEvent.count({ where: { type: 'DIY_PROJECT_COMPLETED', idempotencyKey: `diy-project-completed:${p}` } }), 1);
  const second = await runJob(); const noise = await sweepNoise();
  assert.equal(second.processed, 1, JSON.stringify(second));
  assert.deepEqual((await prisma.domainEvent.findUnique({ where: { idempotencyKey: `diy-project-completed:${p}` } })).payload.processingOutcome, { homeEvent: 'DONE', maintenance: 'ALREADY_DONE' });
  assert.equal(await prisma.homeEvent.count({ where: { idempotencyKey: `diy-complete-${p}` } }), 1);
  assert.equal((await RECONCILE(t.task)).length, 1, 'completing the already-completed task again made no second request');
  assert.ok(!noise.some((row) => row.type === 'RADAR_PROPERTY_RECONCILIATION_REQUESTED'), 'and no second governed completion happened');
  assert.equal((await prisma.seasonalChecklist.findUnique({ where: { id: t.checklist } })).tasksCompleted, 1);
});

test('UNKNOWN mode (the ordinary completion path, and the generic edit path): nothing is inferred; the project stays open and the page asks the person to review and confirm', async () => {
  const t = await seedTask(); const p = await seedProject(t.task);
  await PropertyMaintenanceTaskService.updateTask('u2', t.task, { status: 'COMPLETED' }); await sweepNoise();
  const [event] = await RECONCILE(t.task);
  assert.deepEqual([event.payload.fulfillmentMode, event.payload.completionKey], [null, null]);
  await runJob();
  const after = await project(p);
  assert.deepEqual([after.status, after.completionBasis], ['IN_PROGRESS', null]);
  assert.equal((await ledger(p)).length, 0);
  assert.deepEqual((await RECONCILE(t.task))[0].payload.processingOutcome, { result: 'APPLIED', projectOutcomes: { [p]: 'NEEDS_REVIEW' } });
  const shown = await view(p);
  assert.equal(shown.taskLink.state, 'NEEDS_REVIEW');
  assert.match(shown.taskLink.summary, /Review the project and confirm whether you completed the work or hired a professional\./);
  // The ordinary status endpoint path records no mode either.
  const t2 = await seedTask(); const p2 = await seedProject(t2.task);
  await completeVia(t2.task, undefined, 'u2', 'plain'); await sweepNoise(); await runJob();
  assert.equal((await project(p2)).status, 'IN_PROGRESS');
  assert.equal((await view(p2)).taskLink.state, 'NEEDS_REVIEW');
  await sweepNoise();
});

test('RECURRING, the same completion date supplied for two cycles: two distinct occurrence ids and events, no collision; and a routine completion closes an in-progress project when the mode is DIY and steps are open (S4-4)', async () => {
  const t = await seedTask();
  const p1 = await seedProject(t.task);
  const sameDate = new Date('2026-10-06T12:00:00Z');
  await completeVia(t.task, { fulfillmentMode: 'DIY', completedAt: sameDate }, 'u2', 'cycle-1'); await sweepNoise(); await runJob(); await sweepNoise();
  assert.deepEqual([(await project(p1)).status, (await project(p1)).completionBasis], ['COMPLETED', 'LINKED_TASK'], 'the routine completion closed the in-progress project');
  await prisma.propertyMaintenanceTask.update({ where: { id: t.task }, data: { status: 'PENDING' } }); // the next cycle opens the task again
  const p2 = await seedProject(t.task);
  await completeVia(t.task, { fulfillmentMode: 'DIY', completedAt: sameDate }, 'u2', 'cycle-2'); await sweepNoise(); await runJob(); await sweepNoise();
  const events = await RECONCILE(t.task);
  assert.equal(events.length, 2);
  assert.notEqual(events[0].payload.occurrenceId, events[1].payload.occurrenceId);
  assert.notEqual(events[0].idempotencyKey, events[1].idempotencyKey);
  assert.equal(events[0].payload.completedAt, events[1].payload.completedAt, 'identical dates did not collide');
  assert.deepEqual(events.map((event) => event.status), ['PROCESSED', 'PROCESSED']);
  assert.equal((await project(p2)).status, 'COMPLETED');
  assert.equal((await task(t.task)).completionMetadata.reconciliationOccurrenceId, events[1].payload.occurrenceId, 'the task points at the latest occurrence');
});

// ---- several projects, failure, redelivery, recovery -----------------------------------------------------------------------------------------------------

async function failProjectTransition(title) {
  await psql(`CREATE OR REPLACE FUNCTION scratch_fail_project() RETURNS trigger AS $$ BEGIN IF OLD."title" = '${title}' AND NEW."status" <> OLD."status" THEN RAISE EXCEPTION 'scratch: project transition refused'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await psql('DROP TRIGGER IF EXISTS scratch_fail_project_trg ON diy_projects');
  await psql('CREATE TRIGGER scratch_fail_project_trg BEFORE UPDATE ON diy_projects FOR EACH ROW EXECUTE FUNCTION scratch_fail_project()');
}
const stopFailingProject = () => psql('DROP TRIGGER IF EXISTS scratch_fail_project_trg ON diy_projects');

test('SEVERAL projects on one task, one failing: the others are applied and their outcomes saved; the event is FAILED naming only the failed one; the retry redoes ONLY that project (the others\' ledgers are untouched)', async () => {
  const t = await seedTask();
  const a = await seedProject(t.task, { done: true }); const b = await seedProject(t.task, { title: 'FAILP-1' }); const c = await seedProject(t.task);
  await completeVia(t.task, { fulfillmentMode: 'DIY' }); await sweepNoise();
  await failProjectTransition('FAILP-1');
  try {
    const first = await runJob(); await sweepNoise();
    assert.deepEqual([first.processed, first.failed], [0, 1], JSON.stringify(first));
  } finally { await stopFailingProject(); }
  const [failed] = await RECONCILE(t.task);
  assert.equal(failed.status, 'FAILED');
  assert.match(failed.lastError, new RegExp(`PROJECT ${b}`));
  assert.deepEqual(failed.payload.projectOutcomes, { [a]: 'COMPLETED', [b]: 'FAILED', [c]: 'CLOSED_BY_LINKED_TASK' });
  assert.equal((await project(b)).status, 'IN_PROGRESS');
  const ledgerA = JSON.stringify(await ledger(a)); const ledgerC = JSON.stringify(await ledger(c));
  await makeDue();
  const second = await runJob(); await sweepNoise();
  assert.equal(second.processed >= 1, true, JSON.stringify(second));
  assert.equal((await RECONCILE(t.task))[0].status, 'PROCESSED');
  assert.equal((await project(b)).status, 'COMPLETED');
  assert.equal(JSON.stringify(await ledger(a)), ledgerA, 'a final outcome was not redone');
  assert.equal(JSON.stringify(await ledger(c)), ledgerC, 'a final outcome was not redone');
  // The RECORD is what disclosure and recovery read: a retry must carry the earlier final outcomes forward, not re-derive them as "already closed".
  assert.deepEqual((await RECONCILE(t.task))[0].payload.processingOutcome, { result: 'APPLIED', projectOutcomes: { [a]: 'COMPLETED', [b]: 'CLOSED_BY_LINKED_TASK', [c]: 'CLOSED_BY_LINKED_TASK' } });
  await settleAll();
});

test('a persistent failure walks the real backoff to a DEAD LETTER; the page offers "Finish updating"; recovery re-queues the SAME row once with its snapshot and outcomes, and the next run completes only what failed', async () => {
  const t = await seedTask();
  const a = await seedProject(t.task); const b = await seedProject(t.task, { title: 'FAILP-2' });
  await completeVia(t.task, { fulfillmentMode: 'PROVIDER' }); await sweepNoise();
  await failProjectTransition('FAILP-2');
  try { for (let attempt = 0; attempt < 8; attempt += 1) { await runJob(); await sweepNoise(); await makeDue(); } } finally { await stopFailingProject(); }
  const [dead] = await RECONCILE(t.task);
  assert.deepEqual([dead.status, dead.attempts], ['DEAD_LETTER', 8]);
  assert.equal((await project(a)).status, 'HIRED_OUT');
  assert.deepEqual([(await view(b)).taskLink.state, (await view(b)).taskLink.canRecover], ['NEEDS_ATTENTION', true]);
  assert.equal((await view(a)).taskLink.state, 'CLOSED_BY_TASK', 'the project that did get applied says so');
  const ledgerA = JSON.stringify(await ledger(a));

  const results = await Promise.all([diyService.retryTaskReconciliation(b, P1, 'u1'), diyService.retryTaskReconciliation(b, P1, 'u2')]);
  assert.equal(results.filter((r) => r.reset).length, 1, 'two simultaneous requests reset it once');
  const [queued] = await RECONCILE(t.task);
  assert.deepEqual([queued.id, queued.status, queued.attempts, queued.payload.recovery.count], [dead.id, 'PENDING', 0, 1]);
  assert.equal(queued.payload.taskId, t.task, 'the snapshot survived');
  assert.equal(queued.payload.projectOutcomes[a], 'HIRED_OUT', 'and so did the outcomes');
  await runJob(); await sweepNoise();
  assert.equal((await RECONCILE(t.task))[0].status, 'PROCESSED');
  assert.equal((await project(b)).status, 'HIRED_OUT');
  assert.equal(JSON.stringify(await ledger(a)), ledgerA, 'recovery did not touch the project that was already applied');
  await assert.rejects(diyService.retryTaskReconciliation(b, P1, 'u3'), (error) => error.code === 'DIY_ACCESS_REVOKED', 'a viewer is refused');
});

test('DUPLICATE DELIVERY: a processed event delivered again changes nothing (no second ledger row, no second outbox event, the project stays as it was)', async () => {
  const t = await seedTask(); const p = await seedProject(t.task, { done: true });
  await completeVia(t.task, { fulfillmentMode: 'DIY' }); await sweepNoise(); await runJob(); await sweepNoise(); await runJob(); await sweepNoise();
  const ledgerBefore = JSON.stringify(await ledger(p)); const outboxBefore = await prisma.domainEvent.count({ where: { type: 'DIY_PROJECT_COMPLETED' } });
  await psql(`UPDATE domain_events SET status = 'PENDING', attempts = 0, "availableAt" = ${UTC_NOW} - interval '1 second' WHERE "idempotencyKey" LIKE 'diy-task-reconcile:${t.task}:%'`);
  const again = await runJob(); await sweepNoise();
  assert.equal(again.processed, 1);
  assert.equal(JSON.stringify(await ledger(p)), ledgerBefore);
  assert.equal(await prisma.domainEvent.count({ where: { type: 'DIY_PROJECT_COMPLETED' } }), outboxBefore);
  assert.deepEqual([(await project(p)).status, (await project(p)).completionBasis], ['COMPLETED', 'STEPS']);
  await settleAll();
});

test('TWO WORKERS racing for one reconcile event: one claims it; each project is transitioned once', async () => {
  const t = await seedTask(); const a = await seedProject(t.task); const b = await seedProject(t.task);
  await completeVia(t.task, { fulfillmentMode: 'PROVIDER' }); await sweepNoise();
  const [x, y] = await Promise.all([runJob(), runJob()]); await sweepNoise();
  assert.equal(x.processed + y.processed, 1, JSON.stringify([x, y]));
  for (const id of [a, b]) assert.equal((await ledger(id)).length, 1, `one ledger row for ${id}`);
  assert.equal((await RECONCILE(t.task))[0].attempts, 1);
});

test('RACE with the person finishing the same project: exactly one completion, one ledger row for it, and at most one outbox event', async () => {
  const t = await seedTask(); const p = await seedProject(t.task, { done: true });
  await completeVia(t.task, { fulfillmentMode: 'DIY' }); await sweepNoise();
  const token = (await project(p)).updatedAt.toISOString();
  const person = diyService.completeProject(p, P1, {}, { actorUserId: 'u1', expectedUpdatedAt: token }).then(() => 'person', (error) => error.code);
  const [, personResult] = await Promise.all([runJob(), person]); await sweepNoise();
  assert.ok(['person', 'DIY_STALE', 'DIY_PROJECT_CLOSED'].includes(personResult), personResult);
  assert.equal((await project(p)).status, 'COMPLETED');
  assert.equal((await ledger(p)).filter((e) => e.type === 'PROJECT_COMPLETED').length, 1, 'one completion on the ledger');
  assert.equal(await prisma.domainEvent.count({ where: { idempotencyKey: `diy-project-completed:${p}` } }), 1);
  await settleAll();
});

// ---- integrity and edge outcomes --------------------------------------------------------------------------------------------------------------------------

test('a DELETED task: the event ends as the typed skip TASK_DELETED (processed, not retried, not dead-lettered), the project is unchanged, and the page says the task no longer exists', async () => {
  const t = await seedTask(); const p = await seedProject(t.task);
  await completeVia(t.task, { fulfillmentMode: 'DIY' }); await sweepNoise();
  await prisma.propertyMaintenanceTask.delete({ where: { id: t.task } });
  const result = await runJob(); await sweepNoise();
  assert.deepEqual([result.processed, result.failed, result.deadLettered], [1, 0, 0]);
  const [event] = await RECONCILE(t.task);
  assert.deepEqual([event.status, event.payload.processingOutcome.result], ['PROCESSED', 'TASK_DELETED']);
  assert.deepEqual([(await project(p)).status, (await ledger(p)).length], ['IN_PROGRESS', 0]);
  assert.match((await view(p)).taskLink.summary, /no longer exists/);
});

test('a task REOPENED before the worker runs: nothing is applied, and the page shows nothing (the task is not completed)', async () => {
  const t = await seedTask(); const p = await seedProject(t.task);
  await completeVia(t.task, { fulfillmentMode: 'PROVIDER' }); await sweepNoise();
  await prisma.propertyMaintenanceTask.update({ where: { id: t.task }, data: { status: 'IN_PROGRESS' } });
  await runJob(); await sweepNoise();
  assert.equal((await RECONCILE(t.task))[0].payload.processingOutcome.result, 'TASK_NO_LONGER_COMPLETED');
  assert.deepEqual([(await project(p)).status, (await view(p)).taskLink], ['IN_PROGRESS', null]);
});

test('a task on ANOTHER property than the snapshot dead-letters on the first attempt, before any project is touched', async () => {
  const t = await seedTask({ propertyId: P2 }); const p = await seedProject(t.task);
  await prisma.domainEvent.create({ data: { type: 'DIY_TASK_COMPLETED_RECONCILE', status: 'PENDING', propertyId: P1, userId: 'u2', idempotencyKey: `diy-task-reconcile:${t.task}:forged`, payload: {
    taskId: t.task, propertyId: P1, occurrenceId: 'forged', actorUserId: 'u2', completedAt: '2026-10-06T12:00:00.000Z', fulfillmentMode: 'PROVIDER', completionKey: null, projectIds: [p] } } });
  await prisma.propertyMaintenanceTask.update({ where: { id: t.task }, data: { status: 'COMPLETED' } });
  const result = await runJob();
  assert.deepEqual([result.processed, result.deadLettered], [0, 1], JSON.stringify(result));
  const [event] = await RECONCILE(t.task);
  assert.deepEqual([event.status, event.attempts], ['DEAD_LETTER', 1]);
  assert.match(event.lastError, /different property/);
  assert.deepEqual([(await project(p)).status, (await ledger(p)).length], ['IN_PROGRESS', 0]);
});

test('creating a project with a linked task checks it on real Postgres: another property\'s task and a missing task are refused; a completed task of this property is accepted', async () => {
  const mine = await seedTask(); const theirs = await seedTask({ propertyId: P2 });
  await prisma.propertyMaintenanceTask.update({ where: { id: mine.task }, data: { status: 'COMPLETED' } });
  // The link check runs before any template lookup, so a refusal needs no template; an accepted link then reaches the template step (404 for a missing one).
  await assert.rejects(diyService.createProject(P1, 'u1', { templateId: 'no-such-template', maintenanceTaskId: theirs.task }), (error) => error.code === 'DIY_TASK_NOT_FOUND');
  await assert.rejects(diyService.createProject(P1, 'u1', { templateId: 'no-such-template', maintenanceTaskId: 'no-such-task' }), (error) => error.code === 'DIY_TASK_NOT_FOUND');
  await assert.rejects(diyService.createProject(P1, 'u1', { templateId: 'no-such-template', maintenanceTaskId: mine.task }), (error) => error.statusCode === 404 && error.code !== 'DIY_TASK_NOT_FOUND');
});

test('the reverse lookup is index-driven: the maintenanceTaskId index exists, and with sequential scans disabled the planner answers the producer\'s query from an index (on a near-empty table it may pick the property index; the point is that no table scan is needed)', async () => {
  const [{ present }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS present FROM pg_indexes WHERE tablename = 'diy_projects' AND indexdef LIKE '%("maintenanceTaskId")%'`);
  assert.equal(present, 1, 'the index from the schema is there');
  await psql('SET enable_seqscan = off');
  const plan = await prisma.$queryRawUnsafe(`EXPLAIN SELECT id FROM diy_projects WHERE "maintenanceTaskId" = 'x' AND "propertyId" = 'y' AND status IN ('PLANNING','IN_PROGRESS') ORDER BY "createdAt" ASC LIMIT 25`);
  await psql('RESET enable_seqscan');
  assert.match(plan.map((row) => row['QUERY PLAN']).join('\n'), /Index (Scan|Only Scan)|Bitmap Index Scan/);
});
