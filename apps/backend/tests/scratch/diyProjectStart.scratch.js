// SCRATCH-DATABASE RUN for starting a DIY project from Ask (docs/architecture/ASK_COZY_DIY_PROJECT_START_PLAN.md slice 8E): the read-only template browse (8B), the confirmation-gated
// DIY_PROJECT_START (8C) and the one transactional start authority behind them and the project page (8A). OWNER-RUN: it was written and its guards and module loading were checked, but
// its DATABASE assertions have NEVER been executed by the author. Treat a first failure as a possible mistake in this script as well as in the product, and read the failing assertion
// before concluding either.
//
// The unit tests use a database-free fake. This file runs the REAL handlers, the REAL `diyService.startProjectFromTemplate`, the REAL property-context assemblers (read on the
// transaction client: the property context is deliberately NOT stubbed here) and the REAL template governance against a REAL, EMPTY, throwaway Postgres, to check what a fake cannot:
//   * that `SELECT pg_advisory_xact_lock(...)` actually runs through Prisma's `$executeRaw` (a `void` result breaks `$queryRaw`) and really serializes concurrent starts;
//   * real concurrency: many simultaneous confirmations of one proposal leave exactly ONE open project and one winner; two different templates are independent; a held advisory lock
//     makes a start WAIT; a withdrawal that starts first makes a start WAIT and then refuse; a held share lock makes a withdrawal WAIT;
//   * exactly which tables a start writes (database triggers): the project, its steps (and materials and tools when the template has any), and nothing in tasks, home events, incidents
//     or the outbox; and that browsing and proposing write nothing;
//   * that the role is checked inside the transaction against the real table, BEFORE the duplicate lookup (a removed member learns nothing, not even that a project exists).
// It is NOT part of `npm test` (the name does not end in .test.js). It TRUNCATES the tables it seeds and CREATES a table and triggers named scratch_*, so it refuses to run against
// anything that is not an obviously-scratch local database. The mutation check at the end of the runbook (remove the lock line, expect the race test to fail) is run BY HAND.
//
// Run from apps/backend (set-up and safety rules: docs/operations/DIY_PROJECT_START_ROLLOUT.md):
//   SCRATCH_DATABASE_URL=postgresql://scratch@127.0.0.1:54391/scratch_c2c_8e node --test tests/scratch/diyProjectStart.scratch.js
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
// The property context is REAL (that is the point of this script); it is only wrapped to record whether a transaction client was passed.
const contextCalls = [];
{
  const resolved = require.resolve('../../src/modules/propertyContext/index.ts');
  const real = require(resolved);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: { ...real, getPropertyContext: (...args) => { contextCalls.push({ hadTransactionClient: args[4] !== undefined }); return real.getPropertyContext(...args); } } };
}

const { prisma } = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const governance = require('../../src/services/adminContentGovernance.service.ts');
const { diyService } = require('../../src/services/diy.service.ts');
const { diyTemplateBrowseFromItems, diyProjectStartResult } = require('../../src/services/ask/handlers/diyProjectStart.handler.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { shareLockGovernanceRows } = require('../../src/services/diyTemplateRevision.service.ts');
const analytics = require('../../src/services/analytics');

const sql = (text) => prisma.$executeRawUnsafe(text);
const act = (templateId, action, actorId = 'admin-1') => governance.transitionDiyTemplate({ templateId, actorId, action, reason: 'scratch run' });
const publish = async (id) => { await act(id, 'SUBMIT_FOR_REVIEW', 'author'); await act(id, 'APPROVE', 'reviewer'); await act(id, 'PUBLISH', 'publisher'); };
const PROP = 'prop1';
const OWNER = 'u1'; const CONTRIBUTOR = 'u2'; const VIEWER = 'u3';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const codeOf = async (promise) => { try { await promise; return null; } catch (error) { return error.code ?? `NO_CODE:${error.message}`; } };
const pending = async (promise, ms = 1500) => { let settled = false; promise.then(() => { settled = true; }, () => { settled = true; }); await wait(ms); return !settled; };

// Analytics are counted, never sent.
const tracked = [];
analytics.analyticsEmitter.track = (event) => { tracked.push(event); };

const STEPS = [
  { stepNumber: 1, title: 'Tape the trim', description: 'Apply painter tape along the trim.', estimatedMinutes: 20, isOptional: false, safetyNote: 'Keep a window open while you work.', tipNote: 'Press the tape edge down firmly.' },
  { stepNumber: 3, title: 'Cut in the edges', description: 'Brush the corners first.', estimatedMinutes: 30, isOptional: false },
];
const seedTemplate = (id, title) => prisma.diyProjectTemplate.create({
  data: {
    id, slug: id, title, shortDescription: `${title}.`, longDescription: `Long text for ${title}.`, category: 'PAINTING', difficultyLevel: 'EASY', requiredSkillLevel: 'BEGINNER',
    safetyLevel: 'LOW', permitRequirement: 'NOT_REQUIRED', estimatedMinutes: 120, tags: ['diy', id], status: 'DRAFT', steps: { create: STEPS }, materials: { create: [] }, tools: { create: [] },
  },
});
let seq = 0;
async function liveTemplate() { seq += 1; const id = `t${seq}`; await seedTemplate(id, `Project ${seq}`); await publish(id); return id; }
const openProjects = (templateId) => prisma.diyProject.findMany({ where: { propertyId: PROP, templateId, status: { in: ['PLANNING', 'IN_PROGRESS'] } } });

const launch = (templateId, overrides = {}) => ({ surface: 'ASK_WORKSPACE', entityType: 'DIY_TEMPLATE', entityId: templateId, operationId: 'DIY_PROJECT_START', sourceExecutionId: null, ...overrides });
const proposeStart = (userId, templateId) => diyProjectStartResult(userId, PROP, 'Start this project.', launch(templateId));
const execution = (userId) => ({ id: 'exec-scratch', propertyId: PROP, sessionId: 's1', userId, operationId: 'DIY_PROJECT_START', createdAt: new Date() });
const confirm = (parameters, userId = CONTRIBUTOR, role = 'CONTRIBUTOR') => confirmCapabilityInvoke('DIY_PROJECT_START', {
  userId, execution: execution(userId), parameters, access: { role }, command: getAskDomainCommandByOperation('DIY_PROJECT_START'),
});
const rowsOf = (result) => result.blocks.find((b) => b.type === 'GROUPED_LIST')?.sections.flatMap((section) => section.items) ?? [];

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

// ---- 8A / 8B / 8C on real rows ------------------------------------------------------------------------------------------------------------------------------

test('8B browse on real rows: a governed, published template is listed with the start action for a contributor and none for a viewer; a draft or withdrawn template is not; browsing and proposing write NOTHING', async () => {
  const live = await liveTemplate();
  await seedTemplate('draft-only', 'Never published');
  const withdrawn = await liveTemplate(); await act(withdrawn, 'UNPUBLISH', 'publisher');
  await startSpy();
  try {
    const view = await diyService.listStartableTemplates(PROP, CONTRIBUTOR);
    assert.deepEqual(view.items.map((item) => item.id), [live]);
    const asContributor = diyTemplateBrowseFromItems(view, PROP, true);
    asContributor.blocks.forEach((block) => AskPresentationBlockSchema.parse(block));
    assert.deepEqual(rowsOf(asContributor)[0].actions.map((a) => a.operationId), ['DIY_PROJECT_START']);
    assert.equal(rowsOf(diyTemplateBrowseFromItems(view, PROP, false))[0].actions, undefined);
    const proposed = await proposeStart(CONTRIBUTOR, live);
    assert.equal(proposed.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(await writes(), [], 'browsing and proposing write nothing');
  } finally { await stopSpy(); }
  assert.ok(contextCalls.length >= 1, 'the real property context was read');
});

test('8A/8C start on real rows: writes the project and its steps and NOTHING in tasks, home events, incidents or the outbox; the property context was read on the transaction client; analytics once; step 1 first', async () => {
  const templateId = await liveTemplate();
  const proposed = await proposeStart(CONTRIBUTOR, templateId);
  contextCalls.length = 0; tracked.length = 0;
  await startSpy();
  let outcome;
  try { outcome = await confirm(proposed.parameters); } finally { await stopSpy(); }
  assert.equal(outcome.result.reasonCode, 'DIY_PROJECT_STARTED');
  const unexpected = (await writes()).filter((w) => !['diy_projects:INSERT', 'diy_project_steps:INSERT', 'diy_project_materials:INSERT', 'diy_project_tools:INSERT'].includes(w));
  assert.deepEqual(unexpected, [], 'a start writes only the project and what it copies from the template');
  const [project] = await openProjects(templateId);
  assert.deepEqual([project.status, project.userId, project.maintenanceTaskId, project.incidentId, project.aiGuideId], ['PLANNING', CONTRIBUTOR, null, null, null]);
  assert.deepEqual((await prisma.diyProjectStep.findMany({ where: { projectId: project.id }, orderBy: { stepNumber: 'asc' } })).map((s) => [s.stepNumber, s.status]), [[1, 'PENDING'], [3, 'PENDING']]);
  assert.equal(outcome.artifactId, project.id);
  assert.ok(contextCalls.length >= 1 && contextCalls.every((c) => c.hadTransactionClient), 'every property-context read inside the start used the transaction client');
  assert.equal(tracked.length, 1);
  assert.equal(outcome.result.blocks[0].actions[0].operationId, 'DIY_PROJECT_GUIDE');
});

test('REAL RACE: eight simultaneous confirmations of one proposal leave exactly ONE open project and one winner; two different templates are independent', async () => {
  const templateId = await liveTemplate();
  const proposed = await proposeStart(CONTRIBUTOR, templateId);
  tracked.length = 0;
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => confirm(proposed.parameters)));
  assert.deepEqual(results.filter((r) => r.status === 'rejected').map((r) => r.reason.code ?? r.reason.message), [], 'no confirmation failed');
  const open = await openProjects(templateId);
  assert.equal(open.length, 1, `exactly one open project (got ${open.length})`);
  const reasons = results.map((r) => r.value.result.reasonCode);
  assert.equal(reasons.filter((c) => c === 'DIY_PROJECT_STARTED').length, 1, JSON.stringify(reasons));
  assert.equal(reasons.filter((c) => c === 'DIY_PROJECT_ALREADY_STARTED').length, 7);
  assert.deepEqual([...new Set(results.map((r) => r.value.artifactId))], [open[0].id], 'one winner for every caller');
  assert.equal(tracked.length, 1, 'analytics only for the project that was created');

  const [a, b] = [await liveTemplate(), await liveTemplate()];
  const [pa, pb] = [await proposeStart(CONTRIBUTOR, a), await proposeStart(CONTRIBUTOR, b)];
  await Promise.all([confirm(pa.parameters), confirm(pb.parameters)]);
  assert.deepEqual([(await openProjects(a)).length, (await openProjects(b)).length], [1, 1]);
});

test('REAL RACE through the project page path: the page returns 409 DIY_PROJECT_ALREADY_OPEN carrying only the winner\'s project id, and an Ask start against a page-made project is "already started"', async () => {
  const templateId = await liveTemplate();
  const settled = await Promise.allSettled(Array.from({ length: 5 }, () => diyService.createProject(PROP, OWNER, { templateId })));
  const created = settled.filter((s) => s.status === 'fulfilled');
  const refused = settled.filter((s) => s.status === 'rejected');
  assert.equal(created.length, 1, JSON.stringify(settled.map((s) => s.status === 'fulfilled' ? 'created' : s.reason.code)));
  assert.ok(refused.every((s) => s.reason.statusCode === 409 && s.reason.code === 'DIY_PROJECT_ALREADY_OPEN' && JSON.stringify(s.reason.details) === JSON.stringify({ projectId: created[0].value.id })));
  const proposed = await proposeStart(CONTRIBUTOR, templateId);
  assert.equal(proposed.reasonCode, 'DIY_PROJECT_ALREADY_STARTED');
  assert.equal((await openProjects(templateId)).length, 1);
});

test('THE ADVISORY LOCK, held by another transaction: a start WAITS, then proceeds when the lock is released (the key is the one the service uses)', async () => {
  const templateId = await liveTemplate();
  const proposed = await proposeStart(CONTRIBUTOR, templateId);
  let release; const held = new Promise((resolve) => { release = resolve; });
  let acquired; const got = new Promise((resolve) => { acquired = resolve; });
  const holder = prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`diy-start:${PROP}:${templateId}`}, 0))`;
    acquired(); await held;
  }, { timeout: 30000 });
  await got;
  const starting = confirm(proposed.parameters);
  assert.equal(await pending(starting), true, 'the start is WAITING for the advisory lock');
  assert.equal((await openProjects(templateId)).length, 0);
  release(); await holder;
  assert.equal((await starting).result.reasonCode, 'DIY_PROJECT_STARTED');
  assert.equal((await openProjects(templateId)).length, 1);
});

test('ROLE inside the transaction, against the real table: a member removed or demoted after the proposal is refused; a viewer learns nothing about an existing project (403, not ALREADY_OPEN)', async () => {
  const templateId = await liveTemplate();
  const proposed = await proposeStart(CONTRIBUTOR, templateId);
  await sql(`UPDATE household_members SET role = 'VIEWER' WHERE "userId" = '${CONTRIBUTOR}' AND "propertyId" = '${PROP}'`);
  try {
    assert.equal(await codeOf(confirm(proposed.parameters)), 'ASK_PERMISSION_REQUIRED', 'demoted after the proposal; the handler context still says CONTRIBUTOR');
    assert.equal((await openProjects(templateId)).length, 0);
  } finally { await sql(`UPDATE household_members SET role = 'CONTRIBUTOR' WHERE "userId" = '${CONTRIBUTOR}' AND "propertyId" = '${PROP}'`); }
  await confirm((await proposeStart(CONTRIBUTOR, templateId)).parameters);
  assert.equal((await openProjects(templateId)).length, 1);
  assert.equal(await codeOf(diyService.startProjectFromTemplate(PROP, templateId, { actorUserId: VIEWER, requireGoverned: true })), 'DIY_ACCESS_REVOKED', 'no existence leak to a viewer');
  assert.equal(await codeOf(diyService.startProjectFromTemplate(PROP, templateId, { actorUserId: 'nobody', requireGoverned: true })), 'DIY_ACCESS_REVOKED');
});

test('THE SHARE LOCK, real concurrent transactions: a withdrawal that starts first makes a start WAIT and then refuse; a held share lock makes a withdrawal WAIT', async () => {
  const templateId = await liveTemplate();
  const revisionId = (await prisma.diyProjectTemplate.findUnique({ where: { id: templateId } })).publishedRevisionId;
  const proposed = await proposeStart(CONTRIBUTOR, templateId);
  let releaseAdmin; const adminHeld = new Promise((resolve) => { releaseAdmin = resolve; });
  const admin = prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`UPDATE diy_template_revisions SET "retiredAt" = now(), "retiredReason" = 'UNPUBLISHED' WHERE id = '${revisionId}'`);
    await tx.$executeRawUnsafe(`UPDATE diy_project_templates SET "publishedRevisionId" = NULL WHERE id = '${templateId}'`);
    await adminHeld;
  }, { timeout: 30000 });
  await wait(300);
  const starting = confirm(proposed.parameters);
  assert.equal(await pending(starting), true, 'the start is WAITING on the withdrawal\'s row lock');
  releaseAdmin(); await admin;
  assert.equal(await codeOf(starting), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal((await openProjects(templateId)).length, 0);

  const second = await liveTemplate();
  const revision2 = (await prisma.diyProjectTemplate.findUnique({ where: { id: second } })).publishedRevisionId;
  let releaseLock; const lockHeld = new Promise((resolve) => { releaseLock = resolve; });
  let acquired; const gotLock = new Promise((resolve) => { acquired = resolve; });
  const holder = prisma.$transaction(async (tx) => { await shareLockGovernanceRows(tx, { revisionId: revision2, templateId: second }); acquired(); await lockHeld; }, { timeout: 30000 });
  await gotLock;
  const withdrawal = act(second, 'UNPUBLISH', 'publisher');
  assert.equal(await pending(withdrawal), true, 'the withdrawal is WAITING for the share lock');
  releaseLock(); await holder; await withdrawal;
  assert.equal((await prisma.diyTemplateRevision.findUnique({ where: { id: revision2 } })).retiredReason, 'UNPUBLISHED');
});

test('re-revised after review: a template re-published with a new revision refuses the old proposal (DIY_TEMPLATE_CHANGED -> a context conflict) and a closed project does not block a new start', async () => {
  const templateId = await liveTemplate();
  const proposed = await proposeStart(CONTRIBUTOR, templateId);
  await act(templateId, 'UNPUBLISH', 'publisher');
  await publish(templateId);
  assert.equal(await codeOf(confirm(proposed.parameters)), 'ASK_CONTEXT_VERSION_CONFLICT', 'a different head than the one reviewed');
  const fresh = await proposeStart(CONTRIBUTOR, templateId);
  await confirm(fresh.parameters);
  const [project] = await openProjects(templateId);
  await sql(`UPDATE diy_projects SET status = 'ABANDONED', "abandonedAt" = now() WHERE id = '${project.id}'`);
  const again = await proposeStart(CONTRIBUTOR, templateId);
  assert.equal(again.status, 'NEEDS_CONFIRMATION', 'a stopped project does not count as open');
  await confirm(again.parameters);
  assert.equal((await openProjects(templateId)).length, 1);
});
