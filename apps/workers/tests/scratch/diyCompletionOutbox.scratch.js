// SCRATCH-DATABASE RUN for the DIY completion outbox (docs/architecture/ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md slice 3c).
//
// Runs the REAL completion service, the REAL domain-events job (`processDomainEventsJob`, default dependencies), the REAL handler and adapters, the REAL home
// event service and the REAL governed maintenance completion against a REAL, EMPTY, throwaway Postgres: the outbox row written with the completion, the
// worker claiming and processing it, the home event and the task (with its seasonal item, counters and recurring roll-forward), duplicate delivery, a
// partial failure and its retry, two workers racing, a reclaimed lease, a handler that overlaps its own retry, a cross-property task, a deleted task,
// dead-lettering and recovery, and that no incident is touched. NOT part of `npm test` (the name does not end in .test.js). It TRUNCATES the DIY, user,
// property and seasonal tables it seeds, so it refuses to run against anything that is not an obviously-scratch local database.
//
// Run from apps/workers (the scratch cluster and the safety rules are in docs/operations/DIY_TEMPLATE_REVISIONS_ROLLOUT.md and DIY_COMPLETION_OUTBOX_ROLLOUT.md):
//   SCRATCH_DATABASE_URL=postgresql://scratch@127.0.0.1:54391/scratch_c2c_3c node --require ts-node/register --require tsconfig-paths/register --test tests/scratch/diyCompletionOutbox.scratch.js
// Add WORKER_STUBS=1 to run it with the seven backend modules the production worker image replaces with stubs (apps/workers/stubs), which answers whether
// anything on the completion path depends on a stubbed module.
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
const { processDiyProjectCompletedEventWithDefaults } = require('@worker-shared/services/diy/diyCompletionEffectsAdapters');

const psql = (sql) => prisma.$executeRawUnsafe(sql);
// The timestamp columns are `timestamp(3) without time zone` holding UTC (Prisma's convention); a raw `now()` would write the SESSION's local time instead.
const UTC_NOW = "(now() AT TIME ZONE 'UTC')";
const KEY = (id) => `diy-project-completed:${id}`;
const outbox = (id) => prisma.domainEvent.findUnique({ where: { idempotencyKey: KEY(id) } });
const homeEvents = (id) => prisma.homeEvent.findMany({ where: { idempotencyKey: `diy-complete-${id}` } });
const runJob = async () => { const result = await processDomainEventsJob({ batchSize: 25 }); return result; };
/** Domain events other than ours (for example the radar reconciliation request the governed completion emits) must not be picked up by later runs. */
const sweepOthers = async () => { const others = await prisma.domainEvent.findMany({ where: { type: { not: 'DIY_PROJECT_COMPLETED' } } }); await prisma.domainEvent.deleteMany({ where: { type: { not: 'DIY_PROJECT_COMPLETED' } } }); return others; };
/** Closes an outbox row a test left open on purpose (it called the handler directly, or parked the row), so later job runs only see their own events. */
const settleOutbox = (id) => psql(`UPDATE domain_events SET status = 'PROCESSED' WHERE "idempotencyKey" = '${KEY(id)}'`);
const makeDue = (id) => psql(`UPDATE domain_events SET "availableAt" = ${UTC_NOW} - interval '1 second' WHERE "idempotencyKey" = '${KEY(id)}' AND status = 'FAILED'`);

let seq = 0;
/** A project whose steps are all done, optionally linked to a recurring seasonal maintenance task and an incident. Returns ids. */
async function seedProject({ task = 'seasonal', category = 'PAINTING', title, propertyForTask = '11111111-1111-4111-8111-111111111111', incident = false } = {}) {
  seq += 1;
  const ids = { project: `dp${seq}`, task: null, item: null, checklist: null, incident: null };
  if (task) {
    ids.task = `mt${seq}`;
    const template = await prisma.seasonalTaskTemplate.create({ data: { taskKey: `tk${seq}`, season: 'FALL', title: `Seasonal ${seq}`, climateRegions: ['MODERATE'] } });
    const checklist = await prisma.seasonalChecklist.create({ data: { propertyId: '11111111-1111-4111-8111-111111111111', season: 'FALL', year: 2000 + seq, climateRegion: 'MODERATE', seasonStartDate: new Date('2026-09-22'), seasonEndDate: new Date('2026-12-20'), totalTasks: 1, tasksAdded: 1 } });
    const item = await prisma.seasonalChecklistItem.create({ data: { seasonalChecklistId: checklist.id, seasonalTaskTemplateId: template.id, propertyId: '11111111-1111-4111-8111-111111111111', taskKey: `tk${seq}`, title: `Seasonal ${seq}`, status: 'ADDED' } });
    ids.item = item.id; ids.checklist = checklist.id;
    await prisma.propertyMaintenanceTask.create({
      data: {
        id: ids.task, propertyId: propertyForTask, title: `Task ${seq}`, source: 'SEASONAL', status: 'PENDING', isRecurring: true, frequency: 'QUARTERLY', nextDueDate: new Date('2026-10-20T00:00:00Z'),
        isSeasonal: true, season: 'FALL', seasonalChecklistItemId: propertyForTask === '11111111-1111-4111-8111-111111111111' ? item.id : null,
      },
    });
  }
  if (incident) {
    const row = await prisma.incident.create({ data: { propertyId: '11111111-1111-4111-8111-111111111111', sourceType: 'MANUAL', typeKey: 'leak', title: 'Leak', fingerprint: `fp${seq}`, status: 'ACTIVE' } });
    ids.incident = row.id;
  }
  await prisma.diyProject.create({
    data: {
      id: ids.project, propertyId: '11111111-1111-4111-8111-111111111111', userId: 'u1', title: title ?? `Project ${seq}`, category, status: 'IN_PROGRESS', maintenanceTaskId: ids.task, incidentId: ids.incident,
      steps: { create: [{ id: `${ids.project}s1`, stepNumber: 1, title: 'Do it', description: 'x', status: 'COMPLETED' }] },
    },
  });
  return ids;
}
const finish = async (ids, actor = 'u2') => diyService.completeProject(ids.project, '11111111-1111-4111-8111-111111111111', { actualMinutes: 30, actualMaterialCostCents: 2500 }, { actorUserId: actor, expectedUpdatedAt: (await prisma.diyProject.findUnique({ where: { id: ids.project } })).updatedAt.toISOString() });

test.before(async () => {
  const [{ db, port }] = await prisma.$queryRawUnsafe('select current_database() as db, inet_server_port() as port');
  assert.equal(db, DB_NAME, 'connected to the scratch database'); assert.equal(Number(port), Number(DB_PORT), 'on the scratch port');
  await psql('TRUNCATE domain_events, diy_project_events, diy_project_steps, diy_projects, seasonal_task_templates, properties, homeowner_profiles, users RESTART IDENTITY CASCADE');
  await psql(`INSERT INTO users ("id","email","firstName","lastName","passwordHash","updatedAt") VALUES ('u1','s1@example.test','S','C','x', now()), ('u2','s2@example.test','T','D','x', now())`);
  await psql(`INSERT INTO homeowner_profiles ("id","userId","updatedAt") VALUES ('hp1','u1', now())`);
  await psql(`INSERT INTO properties ("id","homeownerProfileId","address","city","state","zipCode","updatedAt") VALUES ('11111111-1111-4111-8111-111111111111','hp1','1 Test St','Testville','NJ','08536', now()), ('22222222-2222-4222-8222-222222222222','hp1','2 Other St','Testville','NJ','08536', now())`);
  await psql(`INSERT INTO household_members ("id","propertyId","userId","role","updatedAt") VALUES ('hm2','11111111-1111-4111-8111-111111111111','u2','CONTRIBUTOR', now())`);
});
test.after(async () => { await prisma.$disconnect(); });

// ---- the happy path through the real worker job -----------------------------------------------------------------------------------------------------

test('completion writes the outbox row; the REAL job processes it: home event (actor, key), project link, governed task completion with seasonal item, counter, recurring roll-forward and radar request; no incident change', async () => {
  const ids = await seedProject({ incident: true });
  const taskBefore = await prisma.propertyMaintenanceTask.findUnique({ where: { id: ids.task } });
  await finish(ids, 'u2');
  assert.equal((await outbox(ids.project)).status, 'PENDING');
  assert.equal((await prisma.diyProject.findUnique({ where: { id: ids.project } })).homeEventId, null, 'nothing inline: the effects have not run yet');
  assert.equal((await prisma.propertyMaintenanceTask.findUnique({ where: { id: ids.task } })).status, 'PENDING');

  const result = await runJob();
  assert.equal(result.processed, 1, JSON.stringify(result));
  const row = await outbox(ids.project);
  assert.equal(row.status, 'PROCESSED');
  assert.deepEqual(row.payload.processingOutcome, { homeEvent: 'DONE', maintenance: 'DONE' });

  const events = await homeEvents(ids.project);
  assert.equal(events.length, 1);
  assert.deepEqual([events[0].createdById, events[0].type, events[0].title], ['u2', 'IMPROVEMENT', `Project ${seq}`]);
  assert.equal((await prisma.diyProject.findUnique({ where: { id: ids.project } })).homeEventId, events[0].id);

  const task = await prisma.propertyMaintenanceTask.findUnique({ where: { id: ids.task } });
  assert.equal(task.status, 'COMPLETED');
  assert.equal(task.completionMetadata.completionIdempotencyKey, KEY(ids.project));
  assert.deepEqual([task.completionMetadata.recordedByUserId, task.completionMetadata.fulfillmentMode], ['u2', 'DIY']);
  assert.ok(task.nextDueDate.getTime() > taskBefore.nextDueDate.getTime(), 'the recurring task rolled forward (the raw update never did)');
  assert.equal(Number(task.actualCost), 25);
  const item = await prisma.seasonalChecklistItem.findUnique({ where: { id: ids.item } });
  assert.equal(item.status, 'COMPLETED');
  assert.equal((await prisma.seasonalChecklist.findUnique({ where: { id: ids.checklist } })).tasksCompleted, 1, 'the seasonal counter followed');
  const others = await sweepOthers();
  assert.ok(others.some((event) => event.type === 'RADAR_PROPERTY_RECONCILIATION_REQUESTED'), 'the governed path requested radar reconciliation, as every maintenance completion does');

  const incident = await prisma.incident.findUnique({ where: { id: ids.incident } });
  assert.equal(incident.status, 'ACTIVE', 'a self-reported DIY completion did not resolve the incident (O13)');
  assert.equal(incident.resolvedAt, null);
});

test('DUPLICATE DELIVERY: the same event delivered again creates no second home event and no second roll-forward or counter bump', async () => {
  const ids = await seedProject();
  await finish(ids); await runJob(); await sweepOthers();
  const after1 = await prisma.propertyMaintenanceTask.findUnique({ where: { id: ids.task } });
  const counter1 = (await prisma.seasonalChecklist.findUnique({ where: { id: ids.checklist } })).tasksCompleted;
  await psql(`UPDATE domain_events SET status = 'PENDING', attempts = 0, "availableAt" = ${UTC_NOW} - interval '1 second' WHERE "idempotencyKey" = '${KEY(ids.project)}'`);
  const again = await runJob(); await sweepOthers();
  assert.equal(again.processed, 1);
  assert.deepEqual((await outbox(ids.project)).payload.processingOutcome, { homeEvent: 'ALREADY_DONE', maintenance: 'ALREADY_DONE' });
  assert.equal((await homeEvents(ids.project)).length, 1);
  const after2 = await prisma.propertyMaintenanceTask.findUnique({ where: { id: ids.task } });
  assert.equal(after2.nextDueDate.getTime(), after1.nextDueDate.getTime(), 'no second recurring roll-forward');
  assert.equal((await prisma.seasonalChecklist.findUnique({ where: { id: ids.checklist } })).tasksCompleted, counter1, 'no second counter bump');
});

// ---- failures and retries ---------------------------------------------------------------------------------------------------------------------------

async function failHomeEventsFor(title) {
  await psql(`CREATE OR REPLACE FUNCTION scratch_fail_home() RETURNS trigger AS $$ BEGIN IF NEW."title" = '${title}' THEN RAISE EXCEPTION 'scratch: home event insert refused'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await psql('DROP TRIGGER IF EXISTS scratch_fail_home_trg ON home_events');
  await psql('CREATE TRIGGER scratch_fail_home_trg BEFORE INSERT ON home_events FOR EACH ROW EXECUTE FUNCTION scratch_fail_home()');
}
const stopFailingHomeEvents = () => psql('DROP TRIGGER IF EXISTS scratch_fail_home_trg ON home_events');

test('PARTIAL FAILURE: the task completes, the home event fails, the event is FAILED with backoff; the retry creates the home event and does NOT complete the task again', async () => {
  const ids = await seedProject({ title: 'FAILHOME-1' });
  await finish(ids);
  await failHomeEventsFor('FAILHOME-1');
  try {
    const first = await runJob(); await sweepOthers();
    assert.deepEqual([first.processed, first.failed], [0, 1], JSON.stringify(first));
    const failed = await outbox(ids.project);
    assert.equal(failed.status, 'FAILED');
    assert.match(failed.lastError, /HOME_EVENT/);
    assert.ok(failed.availableAt.getTime() > Date.now(), 'backoff scheduled');
    assert.equal((await prisma.propertyMaintenanceTask.findUnique({ where: { id: ids.task } })).status, 'COMPLETED', 'the task effect still ran');
    assert.equal((await homeEvents(ids.project)).length, 0);
  } finally { await stopFailingHomeEvents(); }
  const taskAfterFirst = await prisma.propertyMaintenanceTask.findUnique({ where: { id: ids.task } });
  await makeDue(ids.project);
  const second = await runJob(); await sweepOthers();
  assert.equal(second.processed, 1);
  assert.deepEqual((await outbox(ids.project)).payload.processingOutcome, { homeEvent: 'DONE', maintenance: 'ALREADY_DONE' });
  assert.equal((await homeEvents(ids.project)).length, 1);
  assert.equal((await prisma.propertyMaintenanceTask.findUnique({ where: { id: ids.task } })).nextDueDate.getTime(), taskAfterFirst.nextDueDate.getTime(), 'no second roll-forward on the retry');
  assert.equal((await prisma.seasonalChecklist.findUnique({ where: { id: ids.checklist } })).tasksCompleted, 1);
});

test('a persistent failure walks the backoff to a DEAD LETTER after the attempt limit; RECOVERY re-queues the same row and the next run completes it', async () => {
  const ids = await seedProject({ title: 'FAILHOME-2', task: null });
  await finish(ids);
  await failHomeEventsFor('FAILHOME-2');
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) { await runJob(); await makeDue(ids.project); }
  } finally { await stopFailingHomeEvents(); }
  const dead = await outbox(ids.project);
  assert.deepEqual([dead.status, dead.attempts], ['DEAD_LETTER', 8]);
  assert.equal((await diyService.getProjectWithCompletionEffects(ids.project, '11111111-1111-4111-8111-111111111111')).completionEffects.canRecover, true);

  const recovered = await diyService.retryCompletionEffects(ids.project, '11111111-1111-4111-8111-111111111111', 'u2');
  assert.equal(recovered.reset, true);
  const queued = await outbox(ids.project);
  assert.deepEqual([queued.id, queued.status, queued.attempts, queued.payload.recovery.count, queued.payload.recovery.lastBy], [dead.id, 'PENDING', 0, 1, 'u2']);
  const result = await runJob(); await sweepOthers();
  assert.equal(result.processed, 1);
  assert.equal((await outbox(ids.project)).status, 'PROCESSED');
  assert.equal((await homeEvents(ids.project)).length, 1);
  assert.equal((await diyService.getProjectWithCompletionEffects(ids.project, '11111111-1111-4111-8111-111111111111')).completionEffects.state, 'RECORDED');
});

// ---- concurrency, leases and overlap ----------------------------------------------------------------------------------------------------------------

test('TWO WORKERS racing for one event: exactly one handler run (one claims, the other finds it taken); one home event', async () => {
  const ids = await seedProject();
  await finish(ids);
  const [a, b] = await Promise.all([runJob(), runJob()]);
  await sweepOthers();
  assert.equal(a.processed + b.processed, 1, JSON.stringify([a, b]));
  assert.equal((await homeEvents(ids.project)).length, 1);
  assert.equal((await prisma.seasonalChecklist.findUnique({ where: { id: ids.checklist } })).tasksCompleted, 1);
  assert.equal((await outbox(ids.project)).attempts, 1, 'claimed once');
});

test('LEASE RECLAIM: an event left PROCESSING by a crashed worker is reclaimed once its lease expires and then processed', async () => {
  const ids = await seedProject();
  await finish(ids);
  await psql(`UPDATE domain_events SET status = 'PROCESSING', attempts = 1, "leaseExpiresAt" = ${UTC_NOW} - interval '1 minute', "processingStartedAt" = ${UTC_NOW} - interval '20 minutes' WHERE "idempotencyKey" = '${KEY(ids.project)}'`);
  const result = await runJob(); await sweepOthers();
  assert.equal(result.processed, 1);
  const row = await outbox(ids.project);
  assert.deepEqual([row.status, row.attempts], ['PROCESSED', 2]);
  assert.equal((await homeEvents(ids.project)).length, 1);
});

test('an UNEXPIRED lease is not reclaimed by a second worker', async () => {
  const ids = await seedProject();
  await finish(ids);
  await psql(`UPDATE domain_events SET status = 'PROCESSING', attempts = 1, "leaseExpiresAt" = ${UTC_NOW} + interval '10 minutes' WHERE "idempotencyKey" = '${KEY(ids.project)}'`);
  const result = await runJob(); await sweepOthers();
  assert.equal(result.processed, 0);
  assert.equal((await outbox(ids.project)).status, 'PROCESSING');
  assert.equal((await homeEvents(ids.project)).length, 0);
  await settleOutbox(ids.project);
});

test('a SLOW handler overlapping its own reclaimed retry (both run at once): the keyed effects happen once, and neither run is left in a corrupt state', async () => {
  const ids = await seedProject();
  await finish(ids);
  const event = await outbox(ids.project);
  const run = () => processDiyProjectCompletedEventWithDefaults({ id: event.id, payload: event.payload }).then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }));
  const [a, b] = await Promise.all([run(), run()]);
  for (const outcome of [a, b]) if (!outcome.ok) assert.ok(/CONFLICT_STATE|UNEXPECTED/.test(outcome.error.message), `a clean typed failure, not corruption: ${outcome.error.message}`);
  assert.equal((await homeEvents(ids.project)).length, 1, 'one home event despite two concurrent creators');
  const task = await prisma.propertyMaintenanceTask.findUnique({ where: { id: ids.task } });
  assert.equal(task.status, 'COMPLETED');
  assert.equal((await prisma.seasonalChecklist.findUnique({ where: { id: ids.checklist } })).tasksCompleted, 1, 'the seasonal counter moved once');
  await sweepOthers();
  // Whatever one run reported, a third (the redelivery) now converges.
  const converged = await run();
  assert.equal(converged.ok, true);
  assert.deepEqual(converged.value, { homeEvent: 'ALREADY_DONE', maintenance: 'ALREADY_DONE' });
  await settleOutbox(ids.project);
});

// ---- integrity and edge outcomes ------------------------------------------------------------------------------------------------------------------------

test('a task on ANOTHER property dead-letters on the first attempt, with NO home event created', async () => {
  const ids = await seedProject({ propertyForTask: '22222222-2222-4222-8222-222222222222' });
  await finish(ids);
  const result = await runJob(); await sweepOthers();
  assert.deepEqual([result.processed, result.deadLettered], [0, 1], JSON.stringify(result));
  const row = await outbox(ids.project);
  assert.deepEqual([row.status, row.attempts], ['DEAD_LETTER', 1]);
  assert.match(row.lastError, /different property/);
  assert.equal((await homeEvents(ids.project)).length, 0, 'preflight stopped everything before any effect');
  assert.equal((await prisma.propertyMaintenanceTask.findUnique({ where: { id: ids.task } })).status, 'PENDING');
});

test('a DELETED task is a typed skip: the home event is still created and the event processes', async () => {
  const ids = await seedProject();
  await finish(ids);
  await prisma.propertyMaintenanceTask.delete({ where: { id: ids.task } });
  const result = await runJob(); await sweepOthers();
  assert.equal(result.processed, 1);
  assert.deepEqual((await outbox(ids.project)).payload.processingOutcome, { homeEvent: 'DONE', maintenance: 'SKIPPED_TARGET_MISSING' });
  assert.equal((await homeEvents(ids.project)).length, 1);
});

test('a project with no linked task records the home event only (NOT_LINKED), and a non-improvement category is a MAINTENANCE event', async () => {
  const ids = await seedProject({ task: null, category: 'PLUMBING' });
  await finish(ids);
  const result = await runJob(); await sweepOthers();
  assert.equal(result.processed, 1);
  assert.deepEqual((await outbox(ids.project)).payload.processingOutcome, { homeEvent: 'DONE', maintenance: 'NOT_LINKED' });
  assert.equal((await homeEvents(ids.project))[0].type, 'MAINTENANCE');
});

test('a task someone ELSE already completed is left alone (ALREADY_DONE) and the roll-forward is not repeated', async () => {
  const ids = await seedProject();
  await finish(ids);
  await prisma.propertyMaintenanceTask.update({ where: { id: ids.task }, data: { status: 'COMPLETED', lastCompletedDate: new Date('2026-10-01'), nextDueDate: new Date('2027-01-01') } });
  const result = await runJob(); await sweepOthers();
  assert.equal(result.processed, 1);
  assert.deepEqual((await outbox(ids.project)).payload.processingOutcome, { homeEvent: 'DONE', maintenance: 'ALREADY_DONE' });
  assert.equal((await prisma.propertyMaintenanceTask.findUnique({ where: { id: ids.task } })).nextDueDate.toISOString(), new Date('2027-01-01').toISOString());
  assert.equal((await prisma.seasonalChecklist.findUnique({ where: { id: ids.checklist } })).tasksCompleted, 0, 'the seasonal counter was not touched by a completion we did not make');
});

test('the actor losing household access AFTER completion does not strand the effects (the intent was authorized in the completion transaction)', async () => {
  const ids = await seedProject();
  await finish(ids, 'u2');
  await psql(`DELETE FROM household_members WHERE "userId" = 'u2' AND "propertyId" = '11111111-1111-4111-8111-111111111111'`);
  try {
    const result = await runJob(); await sweepOthers();
    assert.equal(result.processed, 1);
    assert.equal((await prisma.propertyMaintenanceTask.findUnique({ where: { id: ids.task } })).status, 'COMPLETED');
    assert.equal((await homeEvents(ids.project))[0].createdById, 'u2', 'still attributed to the person who completed it');
  } finally {
    await psql(`INSERT INTO household_members ("id","propertyId","userId","role","updatedAt") VALUES ('hm2b','11111111-1111-4111-8111-111111111111','u2','CONTRIBUTOR', now()) ON CONFLICT DO NOTHING`);
  }
});
