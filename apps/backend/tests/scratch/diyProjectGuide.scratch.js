// SCRATCH-DATABASE RUN for the read-only DIY project guide (docs/architecture/ASK_COZY_DIY_PROJECT_GUIDE_PLAN.md slice 5c). OWNER-RUN: it was written and its guards
// and module loading were checked, but its DATABASE assertions have NEVER been executed by the author (plan decision S5-12: no scratch database is provisioned in
// this slice). Treat a first failure as a possible mistake in this script as well as in the product, and read the failing assertion before concluding either.
//
// The unit tests use a database-free fake. This file runs the REAL guide handler, the REAL `getProjectGuideSource` read, the REAL template governance and
// `createProject`, the REAL step transitions and the REAL list and row-action code against a REAL, EMPTY, throwaway Postgres, to check what a fake cannot:
//   * that a project copied by the real `createProject` from a really published revision satisfies the guide's STRICT step rule after the content has gone through
//     jsonb and text columns (unicode, trailing spaces, absent versus null fields, sparse step numbers);
//   * every refusal reason and the stale-source cases against real rows;
//   * that the real step transitions move the guide's progress as the plan defines it;
//   * that a guide read performs NO WRITE, measured by database triggers on every DIY table, not by a spy in JavaScript.
// It is NOT part of `npm test` (the name does not end in .test.js). It TRUNCATES the DIY, template, user and property tables it seeds and CREATES a table and triggers
// named scratch_*, so it refuses to run against anything that is not an obviously-scratch local database.
//
// Run from apps/backend (set-up and safety rules: docs/operations/DIY_PROJECT_GUIDE_ROLLOUT.md; PSQL_BIN is needed for the legacy-revision backfill step):
//   PSQL_BIN=/usr/local/opt/postgresql@15/bin/psql SCRATCH_DATABASE_URL=postgresql://scratch@127.0.0.1:54391/scratch_c2c_5c node --test tests/scratch/diyProjectGuide.scratch.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const URL_ = process.env.SCRATCH_DATABASE_URL;
if (!URL_) { console.log('SCRATCH_DATABASE_URL is not set: skipping the scratch-database run.'); process.exit(0); }
const match = /^postgres(?:ql)?:\/\/([^:@/]+)(?::[^@]*)?@(127\.0\.0\.1|localhost):(\d+)\/([A-Za-z0-9_]+)$/.exec(URL_);
if (!match || !/scratch/i.test(match[4]) || match[3] === '5433' || /contracttocozy/i.test(URL_)) {
  console.error(`REFUSING to run: SCRATCH_DATABASE_URL must be a local postgres URL whose database name contains "scratch" (and is not the dev database). Got: ${URL_.replace(/:[^:@/]*@/, ':***@')}`);
  process.exit(1);
}
const [, DB_USER, , DB_PORT, DB_NAME] = match;
process.env.DATABASE_URL = URL_; // set before anything loads the Prisma client; dotenv never overrides an existing value
process.env.NODE_ENV = 'test';

require('ts-node/register');
const stub = (relative, exports) => { const resolved = require.resolve(relative); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports }; };
// Not under test here: the audit table, and the property facts behind project applicability.
stub('../../src/services/adminAudit.service.ts', { recordAdminAction: async () => undefined });
stub('../../src/modules/propertyContext/index.ts', { getPropertyContext: async () => ({}) });
stub('../../src/services/diy/applicabilityPolicy.ts', { evaluateDiyApplicability: () => ({ status: 'APPLICABLE' }) });

const { prisma } = require('../../src/lib/prisma.ts');
const governance = require('../../src/services/adminContentGovernance.service.ts');
const { diyService } = require('../../src/services/diy.service.ts');
const { diyProjectGuideResult } = require('../../src/services/ask/handlers/diyProjectGuide.handler.ts');
const { diyProjectsFromView } = require('../../src/services/ask/handlers/diyProjectCenter.handler.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { stepSnapshotId } = require('../../src/services/diyPublishedTemplate.ts');

const PSQL = process.env.PSQL_BIN || 'psql';
const BACKFILL = path.resolve(__dirname, '../../prisma/diy-template-revisions-backfill.pgadmin.sql');
const psqlFile = (file) => execFileSync(PSQL, ['-h', '127.0.0.1', '-p', DB_PORT, '-U', DB_USER, '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1', '-f', file], { encoding: 'utf8' });
const sql = (text) => prisma.$executeRawUnsafe(text);
const act = (templateId, action, actorId = 'admin-1') => governance.transitionDiyTemplate({ templateId, actorId, action, reason: 'scratch run' });
const publish = async (id) => { await act(id, 'SUBMIT_FOR_REVIEW', 'author'); await act(id, 'APPROVE', 'reviewer'); await act(id, 'PUBLISH', 'publisher'); };
const NOW = new Date('2026-10-06T12:00:00.000Z');
const PROP = 'prop1';

// The step text deliberately includes what a copy through jsonb and text columns could plausibly disturb: non-ASCII, a trailing space, absent versus null fields.
const HALLWAY = [
  { stepNumber: 1, title: 'Tape the trim', description: 'Apply painter tape along the trim. Café-style edges ✓ ', estimatedMinutes: 20, isOptional: false, safetyNote: 'Keep a window open while you work.', tipNote: 'Press the tape edge down firmly.' },
  { stepNumber: 3, title: 'Cut in the edges', description: 'Brush the corners first.', estimatedMinutes: 30, isOptional: false },
  { stepNumber: 7, title: 'Roll the walls', description: 'Roll two coats, letting the first dry.', isOptional: false },
  { stepNumber: 9, title: 'Touch up', description: 'Fix any misses.', estimatedMinutes: 10, isOptional: true },
];
const seedTemplate = (id, title, steps, data = {}) => prisma.diyProjectTemplate.create({
  data: {
    id, slug: id, title, shortDescription: `${title}.`, longDescription: `Long text for ${title}.`, category: 'PAINTING', difficultyLevel: 'EASY', requiredSkillLevel: 'BEGINNER',
    safetyLevel: 'LOW', permitRequirement: 'NOT_REQUIRED', estimatedMinutes: 120, tags: ['diy', id], status: 'DRAFT', ...data,
    steps: { create: steps }, materials: { create: [] }, tools: { create: [] },
  },
});
const published = async (id, title, steps = HALLWAY, data = {}) => { await seedTemplate(id, title, steps, data); await publish(id); return prisma.diyProjectTemplate.findUnique({ where: { id }, include: { publishedRevision: true } }); };
const start = (templateId) => diyService.createProject(PROP, 'u1', { templateId });

/** A project copied exactly as createProject would, from a stored revision, for the cases createProject itself would now refuse (and for tampering). */
let seq = 0;
async function copyProject(revisionId, templateId, { status = 'IN_PROGRESS', aiGuideId = null } = {}) {
  seq += 1;
  const revision = await prisma.diyTemplateRevision.findUnique({ where: { id: revisionId } });
  const id = `cp${seq}`;
  await prisma.diyProject.create({
    data: {
      id, propertyId: PROP, userId: 'u1', title: revision.title, category: revision.category, status, templateId, templateRevisionId: revisionId, aiGuideId,
      steps: { create: revision.contentJson.steps.map((step) => ({
        templateStepId: stepSnapshotId(revisionId, Number(step.stepNumber)), stepNumber: step.stepNumber, title: step.title, description: step.description,
        estimatedMinutes: step.estimatedMinutes ?? null, safetyNote: step.safetyNote ?? null, tipNote: step.tipNote ?? null, isOptional: step.isOptional, status: 'PENDING',
      })) },
    },
  });
  return id;
}

const guide = (projectId, propertyId = PROP, entityType = 'DIY_PROJECT') => diyProjectGuideResult(propertyId, { entityType, entityId: projectId }, NOW);
const types = (result) => result.blocks.map((block) => block.type);
const taskGuide = (result) => result.blocks.find((block) => block.type === 'TASK_GUIDE');
const parsesAll = (result) => result.blocks.forEach((block) => AskPresentationBlockSchema.parse(block));
const stepRows = (projectId) => prisma.diyProjectStep.findMany({ where: { projectId }, orderBy: { stepNumber: 'asc' } });
const move = async (projectId, stepNumber, status) => {
  const row = (await stepRows(projectId)).find((step) => step.stepNumber === stepNumber);
  return diyService.updateStep(projectId, PROP, row.id, { status }, { actorUserId: 'u1', expectedUpdatedAt: row.updatedAt.toISOString() });
};

test.before(async () => {
  const [{ db, port }] = await prisma.$queryRawUnsafe('select current_database() as db, inet_server_port() as port');
  assert.equal(db, DB_NAME, 'connected to the scratch database'); assert.equal(Number(port), Number(DB_PORT), 'on the scratch port');
  await sql('TRUNCATE diy_projects, diy_template_revisions, diy_template_steps, diy_template_materials, diy_template_tools, diy_project_templates, diy_ai_guides, domain_events, properties, homeowner_profiles, users RESTART IDENTITY CASCADE');
  await sql(`INSERT INTO users ("id","email","firstName","lastName","passwordHash","updatedAt") VALUES ('u1','scratch@example.test','S','C','x', now())`);
  await sql(`INSERT INTO homeowner_profiles ("id","userId","updatedAt") VALUES ('hp1','u1', now())`);
  await sql(`INSERT INTO properties ("id","homeownerProfileId","address","city","state","zipCode","updatedAt") VALUES ('${PROP}','hp1','1 Test St','Testville','NJ','08536', now()), ('prop2','hp1','2 Other St','Testville','NJ','08536', now())`);
});
test.after(async () => { await prisma.$disconnect(); });

// ---- the happy path on real data -------------------------------------------------------------------------------------------------------------------------

let hallway; // the template, its published revision, and the project the real createProject copied from it
test('a project copied by the REAL createProject from a REALLY published revision is guided: the strict step rule holds through jsonb and text columns (unicode, a trailing space, absent fields, sparse step numbers)', async () => {
  const template = await published('tHall', 'Repaint a hallway');
  assert.equal(template.publishedRevision.provenance, 'GOVERNED');
  const project = await start('tHall');
  hallway = { templateId: 'tHall', revisionId: template.publishedRevisionId, projectId: project.id };
  assert.deepEqual((await stepRows(project.id)).map((step) => step.stepNumber), [1, 3, 7, 9]);

  const result = await guide(project.id);
  assert.equal(result.reasonCode, 'DIY_PROJECT_GUIDE_READY', JSON.stringify(result.blocks.map((b) => b.id)));
  parsesAll(result);
  assert.deepEqual(types(result), ['BOUNDARY', 'TASK_GUIDE', 'BOUNDARY']);
  assert.deepEqual([result.blocks[0].id, result.blocks[0].severity, result.blocks[0].body], ['diy-step-safety', 'CAUTION', 'Keep a window open while you work.']);
  const g = taskGuide(result);
  assert.equal(g.progress.label, 'Step 1 of 4, 0 done');
  assert.deepEqual(g.outline.map((entry) => [entry.title, entry.state, entry.optional]), [['Tape the trim', 'CURRENT', false], ['Cut in the edges', 'UPCOMING', false], ['Roll the walls', 'UPCOMING', false], ['Touch up', 'UPCOMING', true]]);
  assert.equal(g.tip.body, 'Press the tape edge down firmly.');
});

test('REAL step transitions move the guide as the plan defines: sparse step numbers give the one-based position; completed counts only COMPLETED; skipped is named separately; reopening moves "current" back', async () => {
  // createProject now refuses a second open project from the same template on one property (step 8), so copy one the way it would; the step transitions below stay real.
  const project = { id: await copyProject(hallway.revisionId, 'tHall') };
  const label = async () => taskGuide(await guide(project.id)).progress.label;
  await move(project.id, 1, 'COMPLETED');
  assert.equal(await label(), 'Step 2 of 4, 1 done', 'step number 3 is position 2');
  await move(project.id, 3, 'COMPLETED');
  await move(project.id, 9, 'SKIPPED');
  const g = taskGuide(await guide(project.id));
  assert.equal(g.progress.label, 'Step 3 of 4, 2 done, 1 skipped');
  assert.deepEqual(g.outline.map((entry) => entry.state), ['DONE', 'DONE', 'CURRENT', 'SKIPPED']);
  assert.equal(g.main.title, 'Roll the walls');
  await move(project.id, 3, 'IN_PROGRESS'); // reopen
  assert.equal(await label(), 'Step 2 of 4, 1 done, 1 skipped');
  await move(project.id, 3, 'COMPLETED'); await move(project.id, 7, 'COMPLETED');
  const resolved = await guide(project.id);
  assert.deepEqual(types(resolved), ['TASK_GUIDE']); // step 7B: the resolved state is a TASK_GUIDE card
  assert.match(resolved.blocks[0].main.body, /Finish the project on the project page/);
});

// ---- every refusal on real rows -----------------------------------------------------------------------------------------------------------------------

test('REFUSALS on real rows: AI guide, no template, no revision, a legacy (unreviewed) revision, a tampered revision hash, ineligible content, too many steps, and a finished project', async (t) => {
  const reasonOf = async (projectId) => (await guide(projectId)).reasonCode;

  await prisma.diyAiGuide.create({ data: { id: 'g1', userId: 'u1', propertyId: PROP, userPrompt: 'paint my hall', status: 'COMPLETED' } });
  await prisma.diyProject.create({ data: { id: 'ai1', propertyId: PROP, userId: 'u1', title: 'AI plan', category: 'PAINTING', status: 'IN_PROGRESS', aiGuideId: 'g1', steps: { create: [{ stepNumber: 1, title: 'Do it', description: 'x' }] } } });
  assert.equal(await reasonOf('ai1'), 'DIY_GUIDE_AI_GUIDE_PROJECT');

  await prisma.diyProject.create({ data: { id: 'custom1', propertyId: PROP, userId: 'u1', title: 'My own', category: 'GENERAL', status: 'IN_PROGRESS', steps: { create: [{ stepNumber: 1, title: 'Do it', description: 'x' }] } } });
  assert.equal(await reasonOf('custom1'), 'DIY_GUIDE_NOT_TEMPLATE_PROJECT');

  await prisma.diyProject.create({ data: { id: 'norev1', propertyId: PROP, userId: 'u1', title: 'Pre-revision', category: 'PAINTING', status: 'IN_PROGRESS', templateId: 'tHall', steps: { create: [{ stepNumber: 1, title: 'Do it', description: 'x' }] } } });
  assert.equal(await reasonOf('norev1'), 'DIY_GUIDE_NO_REVISION');

  // A live legacy template: the real backfill SQL gives it a LEGACY_BACKFILL revision that makes no review claim.
  await seedTemplate('tLegacy', 'Legacy paint', HALLWAY, { status: 'ACTIVE', approvedBy: 'old-admin', approvedAt: new Date('2026-01-01') });
  psqlFile(BACKFILL);
  assert.equal((await prisma.diyTemplateRevision.findUnique({ where: { id: 'legacy-tLegacy-1' } })).provenance, 'LEGACY_BACKFILL');
  assert.equal(await reasonOf(await copyProject('legacy-tLegacy-1', 'tLegacy')), 'DIY_GUIDE_NOT_REVIEWED');

  const tamper = await published('tTamper', 'Tamper test');
  const tamperProject = await start('tTamper');
  assert.equal((await guide(tamperProject.id)).reasonCode, 'DIY_PROJECT_GUIDE_READY');
  await sql(`UPDATE diy_template_revisions SET "contentJson" = jsonb_set("contentJson", '{steps,0,title}', '"Tampered"') WHERE id = '${tamper.publishedRevisionId}'`);
  assert.equal(await reasonOf(tamperProject.id), 'DIY_GUIDE_REVISION_INTEGRITY');

  // Template governance might itself refuse to publish a high-risk or a very long template. If it does, say so and skip that sub-check: it is then not the guide's
  // refusal that is being tested, and the unit tests cover the guide's side with constructed revisions.
  const tryPublished = async (id, title, steps, data) => {
    try { return await published(id, title, steps, data); } catch (error) { t.diagnostic(`governance refused to publish ${id} (${error.code ?? error.message}); its guide refusal was not exercised on real rows`); return null; }
  };
  const risky = await tryPublished('tRisky', 'Risky job', HALLWAY, { safetyLevel: 'HIGH' });
  if (risky) assert.equal(await reasonOf(await copyProject(risky.publishedRevisionId, 'tRisky')), 'DIY_GUIDE_NOT_ELIGIBLE');
  const breaker = await tryPublished('tBreaker', 'Replace the breaker panel', HALLWAY, {});
  if (breaker) assert.equal(await reasonOf(await copyProject(breaker.publishedRevisionId, 'tBreaker')), 'DIY_GUIDE_NOT_ELIGIBLE');

  const many = Array.from({ length: 41 }, (_, i) => ({ stepNumber: i + 1, title: `Step ${i + 1}`, description: 'x', isOptional: false }));
  const big = await tryPublished('tBig', 'Very long job', many, {});
  if (big) assert.equal(await reasonOf(await copyProject(big.publishedRevisionId, 'tBig')), 'DIY_GUIDE_TOO_MANY_STEPS');

  for (const status of ['COMPLETED', 'ABANDONED', 'HIRED_OUT']) {
    const finished = await copyProject(hallway.revisionId, 'tHall', { status });
    const result = await guide(finished);
    // Step 7C: a COMPLETED project of a reviewed template shows the finished view; a stopped or handed-off one keeps the plain refusal.
    assert.equal(result.reasonCode, status === 'COMPLETED' ? 'DIY_PROJECT_FINISHED_VIEW' : 'DIY_GUIDE_PROJECT_FINISHED', status);
    assert.equal(types(result)[0], status === 'COMPLETED' ? 'TASK_GUIDE' : 'SUMMARY'); // the finished view is a TASK_GUIDE card (calm shell shows one SUMMARY action only)
  }
});

test('THE STRICT STEP RULE on real rows: a one-character title change, a missing step, a foreign id, a duplicate id and a swapped pair are each refused; an untouched copy with different progress is accepted', async () => {
  const tamperAndExpect = async (name, mutate) => {
    const id = await copyProject(hallway.revisionId, 'tHall');
    await mutate(id);
    const result = await guide(id);
    assert.equal(result.reasonCode, 'DIY_GUIDE_STEPS_NOT_FROM_REVISION', name);
    assert.ok(!JSON.stringify(result).includes('ALTERED'), `${name}: the altered text is not echoed`);
  };
  await tamperAndExpect('a changed title', (id) => sql(`UPDATE diy_project_steps SET title = title || 'ALTERED' WHERE "projectId" = '${id}' AND "stepNumber" = 3`));
  await tamperAndExpect('a changed safety note', (id) => sql(`UPDATE diy_project_steps SET "safetyNote" = 'ALTERED' WHERE "projectId" = '${id}' AND "stepNumber" = 1`));
  await tamperAndExpect('a removed safety note', (id) => sql(`UPDATE diy_project_steps SET "safetyNote" = NULL WHERE "projectId" = '${id}' AND "stepNumber" = 1`));
  await tamperAndExpect('a missing step', (id) => sql(`DELETE FROM diy_project_steps WHERE "projectId" = '${id}' AND "stepNumber" = 9`));
  await tamperAndExpect('a foreign id', (id) => sql(`UPDATE diy_project_steps SET "templateStepId" = 'rev-other:step:7' WHERE "projectId" = '${id}' AND "stepNumber" = 7`));
  await tamperAndExpect('a duplicate id', (id) => sql(`UPDATE diy_project_steps SET "templateStepId" = (SELECT "templateStepId" FROM diy_project_steps WHERE "projectId" = '${id}' AND "stepNumber" = 1) WHERE "projectId" = '${id}' AND "stepNumber" = 3`));
  await tamperAndExpect('a swapped pair of ids', (id) => sql(`UPDATE diy_project_steps s SET "templateStepId" = o."templateStepId" FROM diy_project_steps o WHERE s."projectId" = '${id}' AND o."projectId" = '${id}' AND ((s."stepNumber" = 3 AND o."stepNumber" = 7) OR (s."stepNumber" = 7 AND o."stepNumber" = 3))`));
  await tamperAndExpect('a flipped optional flag', (id) => sql(`UPDATE diy_project_steps SET "isOptional" = false WHERE "projectId" = '${id}' AND "stepNumber" = 9`));
  await tamperAndExpect('a changed estimate', (id) => sql(`UPDATE diy_project_steps SET "estimatedMinutes" = 21 WHERE "projectId" = '${id}' AND "stepNumber" = 1`));

  const ok = await copyProject(hallway.revisionId, 'tHall');
  await sql(`UPDATE diy_project_steps SET status = 'COMPLETED', notes = 'my own note' WHERE "projectId" = '${ok}' AND "stepNumber" = 1`);
  assert.equal((await guide(ok)).reasonCode, 'DIY_PROJECT_GUIDE_READY', 'status and notes are the person\'s progress, not part of the match');
});

// ---- the stale-source rule on real revisions ---------------------------------------------------------------------------------------------------------

test('WITHDRAWN: unpublishing the template retires its revision as UNPUBLISHED and the guide says withdrawn while keeping the steps readable', async () => {
  await published('tWithdraw', 'Withdraw me');
  const project = await start('tWithdraw');
  assert.equal(taskGuide(await guide(project.id)).outline.length, 4);
  await act('tWithdraw', 'UNPUBLISH', 'publisher');
  const result = await guide(project.id);
  assert.equal(result.reasonCode, 'DIY_PROJECT_GUIDE_READY');
  assert.equal(result.blocks[0].id, 'diy-guide-withdrawn');
  assert.ok(taskGuide(result), 'the snapshot stays readable');
  parsesAll(result);
});

test('SUPERSEDED: publishing a corrected revision retires the old one as SUPERSEDED and the guide only discloses (it is not withdrawn)', async () => {
  await published('tSuper', 'Supersede me');
  const project = await start('tSuper');
  await diyService.adminUpdateTemplate('tSuper', { title: 'Supersede me (corrected)' });
  await publish('tSuper');
  const oldRevision = await prisma.diyTemplateRevision.findUnique({ where: { id: (await prisma.diyProject.findUnique({ where: { id: project.id } })).templateRevisionId } });
  assert.equal(oldRevision.retiredReason, 'SUPERSEDED');
  const result = await guide(project.id);
  assert.equal(result.reasonCode, 'DIY_PROJECT_GUIDE_READY');
  assert.equal(result.blocks[0].id, 'diy-guide-corrected');
  assert.equal(result.blocks[0].severity, 'INFO');
  assert.ok(taskGuide(result), 'the guide stays usable with the steps the project started with');
});

// ---- property scoping, the list and the row action ----------------------------------------------------------------------------------------------------

test('a project in another property, an unknown id and a wrong entity type all answer "couldn\'t find" with nothing about the project', async () => {
  for (const result of [await guide(hallway.projectId, 'prop2'), await guide('no-such-project'), await guide(hallway.projectId, PROP, 'GUIDANCE_JOURNEY')]) {
    assert.equal(result.reasonCode, 'DIY_GUIDE_PROJECT_NOT_FOUND');
    assert.ok(!JSON.stringify(result).includes('Repaint a hallway') && !JSON.stringify(result).includes('Tape the trim'));
  }
});

test('the REAL list and row action: only a project with a template, a recorded revision and no AI guide offers "Guide me through this project"', async () => {
  // This script creates more than the page's default 20 open projects, so ask for a larger page.
  const view = await diyService.listProjects(PROP, { status: ['PLANNING', 'IN_PROGRESS'], limit: 100 });
  const result = diyProjectsFromView(view, PROP);
  const rows = Object.fromEntries(result.blocks.find((block) => block.type === 'GROUPED_LIST').sections[0].items.map((row) => [row.id, row]));
  assert.ok(rows[hallway.projectId].actions?.[0].operationId === 'DIY_PROJECT_GUIDE' && rows[hallway.projectId].entityType === 'DIY_PROJECT');
  for (const id of ['ai1', 'custom1', 'norev1']) assert.equal(rows[id]?.actions, undefined, `${id} offers no guide action`);
  result.blocks.forEach((block) => AskPresentationBlockSchema.parse(block));
});

// ---- no write, measured by the database ---------------------------------------------------------------------------------------------------------------

test('A GUIDE READ WRITES NOTHING: database triggers on every DIY table, the outbox, tasks and home events record no statement across every branch above', async () => {
  await sql('CREATE TABLE IF NOT EXISTS scratch_write_log (id serial PRIMARY KEY, tbl text, op text)');
  await sql(`CREATE OR REPLACE FUNCTION scratch_log_write() RETURNS trigger AS $$ BEGIN INSERT INTO scratch_write_log (tbl, op) VALUES (TG_TABLE_NAME, TG_OP); RETURN NULL; END $$ LANGUAGE plpgsql`);
  const tables = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND (tablename LIKE 'diy\\_%' OR tablename IN ('domain_events', 'property_maintenance_tasks', 'home_events')) AND tablename <> 'scratch_write_log'`);
  assert.ok(tables.length >= 8, `found the tables to watch: ${tables.map((row) => row.tablename).join(', ')}`);
  for (const { tablename } of tables) {
    await sql(`DROP TRIGGER IF EXISTS scratch_spy ON "${tablename}"`);
    await sql(`CREATE TRIGGER scratch_spy AFTER INSERT OR UPDATE OR DELETE ON "${tablename}" FOR EACH STATEMENT EXECUTE FUNCTION scratch_log_write()`);
  }
  try {
    await sql('DELETE FROM scratch_write_log');
    const projects = await prisma.diyProject.findMany({ select: { id: true } });
    assert.ok(projects.length > 10, 'there are projects covering every branch to read');
    for (const { id } of projects) { const result = await guide(id); parsesAll(result); }
    await guide('no-such-project'); await guide(hallway.projectId, 'prop2'); await guide(hallway.projectId, PROP, 'GUIDANCE_JOURNEY');
    await diyService.listProjects(PROP, { status: ['PLANNING', 'IN_PROGRESS'], limit: 100 });
    const writes = await prisma.$queryRawUnsafe('SELECT tbl, op, count(*)::int AS statements FROM scratch_write_log GROUP BY 1, 2 ORDER BY 1, 2');
    assert.deepEqual(writes, [], `no write statement: ${JSON.stringify(writes)}`);
  } finally {
    for (const { tablename } of tables) await sql(`DROP TRIGGER IF EXISTS scratch_spy ON "${tablename}"`);
  }
});
