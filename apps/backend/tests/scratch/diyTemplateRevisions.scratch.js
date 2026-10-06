// SCRATCH-DATABASE RUN for the DIY template revisions rollout (docs/architecture/ASK_COZY_DIY_TEMPLATE_REVISIONS_PLAN.md slice 1e).
//
// The unit tests for slices 1a-1d use a database-free fake. This file runs the REAL services, the REAL Prisma client and the REAL backfill and
// verification SQL against a REAL, EMPTY, throwaway Postgres, to check what a fake cannot: relation filters and ordering, cursor paging over them,
// conditional updates, row locking between simultaneous transitions, the unique-key error mapping, and that a content hash survives a round trip
// through Postgres jsonb. It is NOT part of `npm test` (the name does not end in .test.js) and it TRUNCATES the DIY tables and the user, property and
// profile tables it seeds, so it refuses to run against anything that is not an obviously-scratch local database.
//
// Run (the scratch cluster, its schema and the safety rules are in docs/operations/DIY_TEMPLATE_REVISIONS_ROLLOUT.md):
//   PSQL_BIN=/usr/local/opt/postgresql@15/bin/psql SCRATCH_DATABASE_URL=postgresql://scratch@127.0.0.1:54391/scratch_c2c_1e node --test tests/scratch/diyTemplateRevisions.scratch.js
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
// Not under test here: the audit table, and the property facts behind applicability.
stub('../../src/services/adminAudit.service.ts', { recordAdminAction: async () => undefined });
stub('../../src/modules/propertyContext/index.ts', { getPropertyContext: async () => ({}) });
stub('../../src/services/diy/applicabilityPolicy.ts', { evaluateDiyApplicability: () => ({ status: 'APPLICABLE' }) });
stub('../../src/services/diyCompletion.service.ts', { diyCompletionService: { onComplete: async () => {} } });

const { prisma } = require('../../src/lib/prisma.ts');
const governance = require('../../src/services/adminContentGovernance.service.ts');
const revisions = require('../../src/services/diyTemplateRevision.service.ts');
const { diyService } = require('../../src/services/diy.service.ts');
const { warnAboutDiyTemplateRevisionState } = require('../../src/services/diyTemplateRevisionStartupCheck.ts');

const PSQL = process.env.PSQL_BIN || 'psql'; // the psql client of the scratch cluster's Postgres major version
const BACKFILL = path.resolve(__dirname, '../../prisma/diy-template-revisions-backfill.pgadmin.sql');
const VERIFY = path.resolve(__dirname, '../../prisma/diy-template-revisions-verify.pgadmin.sql');
const psqlFile = (file) => execFileSync(PSQL, ['-h', '127.0.0.1', '-p', DB_PORT, '-U', DB_USER, '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1', '-f', file], { encoding: 'utf8' });
const rowCounts = (output) => [...output.matchAll(/\((\d+) rows?\)/g)].map((m) => Number(m[1]));
const act = (templateId, action, actorId = 'admin-1') => governance.transitionDiyTemplate({ templateId, actorId, action, reason: 'scratch run' });
const rejectsWith = (promise, code) => assert.rejects(promise, (error) => error.code === code, code);

const stepsOf = (titles) => titles.map((title, index) => ({ stepNumber: index + 1, title, description: `${title} in detail.`, isOptional: false, ...(index === 0 ? { safetyNote: 'Be careful.' } : {}) }));
const seed = (id, slug, title, extra = {}) => prisma.diyProjectTemplate.create({
  data: {
    id, slug, title, shortDescription: `${title}.`, longDescription: `Long text for ${title}.`, category: 'PAINTING', difficultyLevel: 'EASY', requiredSkillLevel: 'BEGINNER',
    safetyLevel: 'LOW', permitRequirement: 'NOT_REQUIRED', estimatedMinutes: 60, estimatedMaterialCostMinCents: 1000, estimatedMaterialCostMaxCents: 5000, tags: ['diy', slug],
    status: 'DRAFT', ...extra.data,
    steps: { create: stepsOf(extra.steps ?? []) },
    materials: { create: extra.materials ?? [] },
    tools: { create: extra.tools ?? [] },
  },
});

test.before(async () => {
  const [{ db, port }] = await prisma.$queryRawUnsafe('select current_database() as db, inet_server_port() as port');
  assert.equal(db, DB_NAME, 'connected to the scratch database'); assert.equal(Number(port), Number(DB_PORT), 'on the scratch port');
  await prisma.$executeRawUnsafe('TRUNCATE diy_projects, diy_template_revisions, diy_template_steps, diy_template_materials, diy_template_tools, diy_project_templates, properties, homeowner_profiles, users RESTART IDENTITY CASCADE');
  await prisma.$executeRawUnsafe(`INSERT INTO users ("id","email","firstName","lastName","passwordHash","updatedAt") VALUES ('u1','scratch@example.test','S','C','x', now())`);
  await prisma.$executeRawUnsafe(`INSERT INTO homeowner_profiles ("id","userId","updatedAt") VALUES ('hp1','u1', now())`);
  await prisma.$executeRawUnsafe(`INSERT INTO properties ("id","homeownerProfileId","address","city","state","zipCode","updatedAt") VALUES ('prop1','hp1','1 Test St','Testville','NJ','08536', now())`);

  // The state a production database is in BEFORE the backfill: live templates with no revision, and templates stuck in review.
  const material = [{ name: 'Paint', unit: 'gallon', quantityFormula: '2', unitPriceCents: 4000, isOptional: false, sortOrder: 0 }, { name: 'Tape', unit: 'roll', quantityFormula: '1', unitPriceCents: 500, isOptional: false, sortOrder: 1 }];
  const tool = [{ name: 'Roller', canonicalId: 'ROLLER', isRequired: true, defaultToolAction: 'BUY', sortOrder: 0 }];
  await seed('tA', 'paint-a-room', 'Paint a room', { data: { status: 'ACTIVE', approvedBy: 'old-admin', approvedAt: new Date('2026-01-01'), featuredOrder: 2 }, steps: ['Tape the trim', 'Roll the walls'], materials: material, tools: tool });
  await seed('tB', 'caulk-a-tub', 'Caulk a tub', { data: { status: 'ACTIVE', category: 'GENERAL', difficultyLevel: 'MODERATE', requiredSkillLevel: 'INTERMEDIATE', approvedBy: 'old-admin', approvedAt: new Date('2026-01-02'), featuredOrder: 1 }, steps: ['Remove old caulk', 'Apply new caulk'] });
  await seed('tC', 'hang-a-shelf', 'Hang a shelf', { data: { status: 'ACTIVE', category: 'GENERAL', approvedBy: 'old-admin' } });
  await seed('tD', 'fix-a-faucet', 'Fix a faucet', { steps: ['Shut off water'] });
  await seed('tE', 'clean-gutters', 'Clean gutters', { data: { status: 'REVIEW' }, steps: ['Set up the ladder'] });
  await seed('tF', 'seal-a-deck', 'Seal a deck', { data: { status: 'APPROVED', approvedBy: 'old-admin', approvedAt: new Date('2026-02-01') }, steps: ['Sand the deck'] });
  await seed('tG', 'retired-project', 'Retired project', { data: { status: 'ARCHIVED' }, steps: ['Old step'] });
});
test.after(async () => { await prisma.$disconnect(); });

// ---- before the backfill: the outage the plan warns about ---------------------------------------------------------------------------------------

test('BEFORE the backfill: live templates have no head, so the library is empty, no project can start, and the startup check says so', async () => {
  assert.deepEqual((await diyService.listTemplates({})).items, []);
  assert.deepEqual(await diyService.getFeaturedTemplates(), []);
  await assert.rejects(diyService.getTemplateDetail('tA'), (error) => error.statusCode === 404);
  await assert.rejects(diyService.createProject('prop1', 'u1', { templateId: 'tA' }), (error) => error.statusCode === 404);
  const warns = []; const counts = await warnAboutDiyTemplateRevisionState(prisma, { warn: (...a) => warns.push(a) });
  assert.deepEqual(counts, { liveWithoutHead: 3, reviewWithoutCandidate: 2 }, 'the startup check ran its relation filter (revisions: { none }) against real Postgres');
  assert.equal(warns.length, 2);
});

test('BEFORE the backfill: the verification SQL reports the problems it exists to find', () => {
  const sizes = rowCounts(psqlFile(VERIFY));
  assert.equal(sizes[0], 3, 'three ACTIVE templates without a head');
  assert.equal(sizes[4], 2, 'two templates stuck in REVIEW or APPROVED');
});

// ---- the backfill -------------------------------------------------------------------------------------------------------------------------------

test('the backfill inserts one legacy revision per live template and sets the heads, and changes nothing else', async () => {
  const before = await prisma.diyProjectTemplate.findMany({ orderBy: { id: 'asc' }, include: { steps: true, materials: true, tools: true } });
  const output = psqlFile(BACKFILL);
  assert.match(output, /INSERT 0 3/); assert.match(output, /UPDATE 3/); assert.match(output, /COMMIT/);
  const live = await prisma.diyProjectTemplate.findMany({ where: { status: 'ACTIVE' }, include: { publishedRevision: true } });
  assert.equal(live.length, 3);
  for (const template of live) {
    const revision = template.publishedRevision;
    assert.equal(revision.id, `legacy-${template.id}-1`);
    assert.deepEqual([revision.provenance, revision.contentHash, revision.revision, revision.templateId], ['LEGACY_BACKFILL', null, 1, template.id]);
    assert.deepEqual([revision.title, revision.category, revision.safetyLevel, revision.permitRequirement], [template.title, template.category, template.safetyLevel, template.permitRequirement]);
    assert.equal(revision.approvedBy, 'old-admin');
    assert.ok(revision.publishedAt);
  }
  const a = (await prisma.diyProjectTemplate.findUnique({ where: { id: 'tA' }, include: { publishedRevision: true } })).publishedRevision;
  assert.deepEqual(a.contentJson.steps.map((step) => [step.stepNumber, step.title, step.safetyNote ?? null]), [[1, 'Tape the trim', 'Be careful.'], [2, 'Roll the walls', null]]);
  assert.deepEqual(a.contentJson.materials.map((material) => [material.name, material.sortOrder]), [['Paint', 0], ['Tape', 1]]);
  assert.deepEqual(a.contentJson.tools.map((tool) => [tool.name, tool.canonicalId, tool.defaultToolAction]), [['Roller', 'ROLLER', 'BUY']]);
  assert.equal(a.contentJson.longDescription, 'Long text for Paint a room.');
  assert.equal(revisions.checkRevisionIntegrity(a), 'LEGACY_UNVERIFIED');
  // Nothing else moved: same rows, same statuses and content (only the head pointer and updatedAt on the three live templates differ).
  const after = await prisma.diyProjectTemplate.findMany({ orderBy: { id: 'asc' }, include: { steps: true, materials: true, tools: true } });
  after.forEach((row, index) => {
    const { publishedRevisionId, updatedAt, ...rest } = row; const { publishedRevisionId: _p, updatedAt: _u, ...prior } = before[index];
    assert.deepEqual(rest, prior, `template ${row.id} content and status are untouched`);
  });
  assert.equal(await prisma.diyTemplateRevision.count(), 3, 'DRAFT, REVIEW, APPROVED and ARCHIVED templates got no revision');
});

test('the backfill is idempotent: a second run inserts and updates nothing', async () => {
  const output = psqlFile(BACKFILL);
  assert.match(output, /INSERT 0 0/); assert.match(output, /UPDATE 0/);
  assert.equal(await prisma.diyTemplateRevision.count(), 3);
});

test('AFTER the backfill: the verification SQL is clean except the templates that must be returned and resubmitted', async () => {
  const sizes = rowCounts(psqlFile(VERIFY));
  assert.deepEqual(sizes.slice(0, 4), [0, 0, 0, 0], 'no live template without a head, no broken head, no snapshot mismatch');
  assert.equal(sizes[4], 2, 'REVIEW and APPROVED templates still need an admin decision');
  assert.deepEqual(await warnAboutDiyTemplateRevisionState(prisma, { warn() {} }), { liveWithoutHead: 0, reviewWithoutCandidate: 2 });
});

// ---- homeowner reads on real Postgres ------------------------------------------------------------------------------------------------------------

test('homeowner reads: the library, filters, search, tag search, ordering and cursor paging work through a relation on real Postgres', async () => {
  const ids = async (params) => (await diyService.listTemplates(params)).items.map((item) => item.id);
  assert.deepEqual(await ids({}), ['tB', 'tC', 'tA'], 'ordered by the head\'s title: Caulk, Hang, Paint');
  assert.deepEqual(await ids({ category: 'PAINTING' }), ['tA']);
  assert.deepEqual(await ids({ difficulty: 'MODERATE' }), ['tB']);
  assert.deepEqual(await ids({ maxSkillLevel: 'BEGINNER' }), ['tC', 'tA']);
  assert.deepEqual(await ids({ search: 'PAINT' }), ['tA'], 'case-insensitive title search');
  assert.deepEqual(await ids({ search: 'hang-a-shelf' }), ['tC'], 'tag search');
  const first = await diyService.listTemplates({ limit: 2 });
  assert.deepEqual([first.items.map((item) => item.id), first.nextCursor], [['tB', 'tC'], 'tC']);
  const second = await diyService.listTemplates({ limit: 2, cursor: first.nextCursor });
  assert.deepEqual([second.items.map((item) => item.id), second.nextCursor], [['tA'], undefined]);
  assert.deepEqual((await diyService.getFeaturedTemplates()).map((item) => item.id), ['tB', 'tA'], 'featured order comes from the template row');
  const detail = await diyService.getTemplateDetail('tA');
  assert.deepEqual([detail.id, detail.revision, detail.steps.map((step) => step.title), detail.materials.length, detail.tools[0].name], ['tA', 1, ['Tape the trim', 'Roll the walls'], 2, 'Roller']);
  assert.match(detail.steps[0].id, /^legacy-tA-1:step:1$/);
  for (const hidden of ['tD', 'tE', 'tF', 'tG']) await assert.rejects(diyService.getTemplateDetail(hidden), (error) => error.statusCode === 404);
});

test('createProject from a legacy revision on real Postgres: copies the snapshot, records the revision, and the foreign keys hold', async () => {
  const project = await diyService.createProject('prop1', 'u1', { templateId: 'tA' });
  assert.deepEqual([project.templateId, project.templateRevisionId, project.title], ['tA', 'legacy-tA-1', 'Paint a room']);
  assert.deepEqual(project.steps.map((step) => [step.stepNumber, step.title, step.templateStepId]), [[1, 'Tape the trim', 'legacy-tA-1:step:1'], [2, 'Roll the walls', 'legacy-tA-1:step:2']]);
  assert.deepEqual(project.materials.map((material) => [material.name, Number(material.quantity), material.totalEstimateCents]), [['Paint', 2, 8000], ['Tape', 1, 500]]);
  assert.equal(project.tools[0].name, 'Roller');
});

test('createProject from an AI guide also returns the project it just created (the second call site of the same fix)', async () => {
  const steps = JSON.stringify([{ stepNumber: 1, title: 'Gather supplies', description: 'Get what you need.' }]);
  await prisma.$executeRawUnsafe(`INSERT INTO diy_ai_guides ("id","userId","propertyId","userPrompt","status","generatedTitle","generatedSummary","category","safetyLevel","permitRequirement","stepsJson","materialsJson","toolsJson","updatedAt")
    VALUES ('guide1','u1','prop1','paint a wall','COMPLETED','Paint a wall','Fresh paint.','PAINTING','LOW','NOT_REQUIRED','${steps}'::jsonb,'[]'::jsonb,'[]'::jsonb, now())`);
  const project = await diyService.createProject('prop1', 'u1', { aiGuideId: 'guide1' });
  assert.deepEqual([project.title, project.aiGuideId, project.templateRevisionId ?? null, project.steps.map((step) => step.title)], ['Paint a wall', 'guide1', null, ['Gather supplies']]);
});

// ---- governance on real Postgres ------------------------------------------------------------------------------------------------------------------

test('a governed revision survives a round trip through Postgres jsonb: its hash still verifies', async () => {
  await act('tD', 'SUBMIT_FOR_REVIEW', 'author');
  const row = await prisma.diyTemplateRevision.findFirst({ where: { templateId: 'tD' } });
  assert.equal(row.provenance, 'GOVERNED');
  assert.match(row.contentHash, /^[0-9a-f]{64}$/);
  assert.equal(revisions.checkRevisionIntegrity(row), 'VERIFIED', 'hash computed before insert equals the hash recomputed from the stored row');
  await act('tD', 'APPROVE', 'reviewer');
  await act('tD', 'PUBLISH', 'publisher');
  const head = (await prisma.diyProjectTemplate.findUnique({ where: { id: 'tD' } })).publishedRevisionId;
  assert.equal(head, row.id);
  assert.ok((await diyService.listTemplates({})).items.some((item) => item.id === 'tD'));
  const project = await diyService.createProject('prop1', 'u1', { templateId: 'tD' });
  assert.equal(project.templateRevisionId, row.id);
});

test('templates sent for review before revisions existed: approve and publish are refused, the refusal rolls back, and return-and-resubmit works', async () => {
  await rejectsWith(act('tE', 'APPROVE', 'reviewer'), 'REVISION_REQUIRED');
  assert.deepEqual(await prisma.diyProjectTemplate.findUnique({ where: { id: 'tE' }, select: { status: true, approvedBy: true } }), { status: 'REVIEW', approvedBy: null });
  await rejectsWith(act('tF', 'PUBLISH', 'publisher'), 'REVISION_REQUIRED');
  assert.equal((await prisma.diyProjectTemplate.findUnique({ where: { id: 'tF' } })).status, 'APPROVED');
  for (const id of ['tE', 'tF']) {
    assert.equal((await act(id, 'RETURN_TO_DRAFT', 'reviewer')).status, 'DRAFT');
    await act(id, 'SUBMIT_FOR_REVIEW', 'author'); await act(id, 'APPROVE', 'reviewer'); await act(id, 'PUBLISH', 'publisher');
    assert.equal((await prisma.diyTemplateRevision.findFirst({ where: { templateId: id } })).provenance, 'GOVERNED');
  }
  assert.deepEqual(await warnAboutDiyTemplateRevisionState(prisma, { warn() {} }), { liveWithoutHead: 0, reviewWithoutCandidate: 0 });
});

test('editing a live legacy template saves a draft while its head keeps serving, and a no-change form save leaves it alone', async () => {
  const row = await prisma.diyProjectTemplate.findUnique({ where: { id: 'tB' }, include: { steps: true, materials: true, tools: true } });
  const form = { title: row.title, shortDescription: row.shortDescription, longDescription: row.longDescription, category: row.category, difficultyLevel: row.difficultyLevel, requiredSkillLevel: row.requiredSkillLevel, safetyLevel: row.safetyLevel, permitRequirement: row.permitRequirement, estimatedMinutes: row.estimatedMinutes, tags: row.tags, steps: row.steps.map(({ id, templateId, ...s }) => s), materials: [], tools: [] };
  const stepIds = row.steps.map((step) => step.id).sort();
  await diyService.adminUpdateTemplate('tB', { ...form, featuredOrder: 5 });
  const unchanged = await prisma.diyProjectTemplate.findUnique({ where: { id: 'tB' }, include: { steps: true } });
  assert.deepEqual([unchanged.status, unchanged.featuredOrder, unchanged.steps.map((step) => step.id).sort()], ['ACTIVE', 5, stepIds], 'a repeat-the-content save changed only the non-content field');

  await diyService.adminUpdateTemplate('tB', { ...form, title: 'Caulk a bathtub (draft)', safetyLevel: 'HIGH' });
  const draft = await prisma.diyProjectTemplate.findUnique({ where: { id: 'tB' } });
  assert.deepEqual([draft.status, draft.approvedBy, draft.title], ['DRAFT', null, 'Caulk a bathtub (draft)']);
  const listed = (await diyService.listTemplates({})).items.find((item) => item.id === 'tB');
  assert.deepEqual([listed.title, listed.safetyLevel], ['Caulk a tub', 'LOW'], 'homeowners still see the reviewed head');
  assert.equal((await diyService.createProject('prop1', 'u1', { templateId: 'tB' })).title, 'Caulk a tub');
});

test('withdrawal on real Postgres: unpublish a live draft, archive another, and republish an unpublished approved revision without a new review', async () => {
  assert.equal((await act('tB', 'UNPUBLISH', 'publisher')).status, 'DRAFT');
  assert.equal((await prisma.diyProjectTemplate.findUnique({ where: { id: 'tB' } })).publishedRevisionId, null);
  assert.equal((await diyService.listTemplates({})).items.some((item) => item.id === 'tB'), false, 'gone from the library at once');
  assert.equal((await prisma.diyTemplateRevision.findUnique({ where: { id: 'legacy-tB-1' } })).retiredReason, 'UNPUBLISHED');

  assert.equal((await act('tD', 'UNPUBLISH', 'publisher')).status, 'APPROVED');
  const before = await prisma.diyTemplateRevision.count({ where: { templateId: 'tD' } });
  assert.equal((await act('tD', 'PUBLISH', 'publisher')).status, 'ACTIVE');
  assert.equal(await prisma.diyTemplateRevision.count({ where: { templateId: 'tD' } }), before, 'republish created no revision');
  assert.equal((await prisma.diyTemplateRevision.findFirst({ where: { templateId: 'tD' } })).retiredAt, null);

  assert.equal((await act('tC', 'ARCHIVE', 'publisher')).status, 'ARCHIVED');
  assert.equal((await prisma.diyTemplateRevision.findUnique({ where: { id: 'legacy-tC-1' } })).retiredReason, 'ARCHIVED');
});

test('frozen content on real Postgres: a template in review refuses a content edit', async () => {
  await act('tB', 'SUBMIT_FOR_REVIEW', 'author');
  await assert.rejects(diyService.adminUpdateTemplate('tB', { title: 'sneaky' }), (error) => error.statusCode === 409 && error.code === 'TEMPLATE_CONTENT_FROZEN');
  assert.equal((await prisma.diyProjectTemplate.findUnique({ where: { id: 'tB' } })).title, 'Caulk a bathtub (draft)');
});

// ---- concurrency on real Postgres -----------------------------------------------------------------------------------------------------------------

test('two simultaneous approvals: real row locking yields exactly one success', async () => {
  const results = await Promise.allSettled([act('tB', 'APPROVE', 'reviewer-a'), act('tB', 'APPROVE', 'reviewer-b')]);
  assert.deepEqual(results.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'INVALID_TRANSITION');
  // GOVERNED only: the legacy revision carries the template's old approval for the record and is not part of this race.
  const approved = await prisma.diyTemplateRevision.findMany({ where: { templateId: 'tB', provenance: 'GOVERNED', approvedAt: { not: null } } });
  assert.equal(approved.length, 1);
  assert.equal(approved[0].approvedBy, (await prisma.diyProjectTemplate.findUnique({ where: { id: 'tB' } })).approvedBy);
});

test('two simultaneous submissions create exactly one revision', async () => {
  await act('tB', 'RETURN_TO_DRAFT', 'reviewer');
  const before = await prisma.diyTemplateRevision.count({ where: { templateId: 'tB' } });
  const results = await Promise.allSettled([act('tB', 'SUBMIT_FOR_REVIEW', 'a'), act('tB', 'SUBMIT_FOR_REVIEW', 'b')]);
  assert.deepEqual(results.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(await prisma.diyTemplateRevision.count({ where: { templateId: 'tB' } }), before + 1);
});

test('a real unique-key collision on the revision number maps to REVISION_CONFLICT (two uncoordinated transactions)', async () => {
  await seed('tH', 'race-template', 'Race template', { steps: ['One'] });
  const attempt = (actor) => prisma.$transaction((tx) => revisions.createCandidateRevision(tx, { templateId: 'tH', actorId: actor }));
  const results = await Promise.allSettled([attempt('a'), attempt('b'), attempt('c')]);
  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  assert.equal(fulfilled.length, 1, 'exactly one revision was created');
  for (const rejected of results.filter((result) => result.status === 'rejected')) {
    assert.ok(['REVISION_CONFLICT', 'REVISION_STATE_CONFLICT'].includes(rejected.reason.code), `the loser got a clean error, not a raw database error: ${rejected.reason.code}`);
  }
  assert.equal(await prisma.diyTemplateRevision.count({ where: { templateId: 'tH' } }), 1);
});

test('an edit racing a submission is either in the revision or refused, on real Postgres', async () => {
  await seed('tI', 'race-two', 'Race two', { steps: ['One'] });
  const results = await Promise.allSettled([diyService.adminUpdateTemplate('tI', { title: 'Raced edit' }), act('tI', 'SUBMIT_FOR_REVIEW', 'author')]);
  const revision = await prisma.diyTemplateRevision.findFirst({ where: { templateId: 'tI' } });
  const template = await prisma.diyProjectTemplate.findUnique({ where: { id: 'tI' } });
  assert.ok(revision, 'the submission succeeded');
  assert.equal(template.title === 'Raced edit', revision.title === 'Raced edit', `template and revision agree: ${JSON.stringify(results.map((r) => r.status))}`);
  if (results[0].status === 'rejected') assert.equal(results[0].reason.code, 'TEMPLATE_CONTENT_FROZEN');
});

// ---- integrity on real Postgres ---------------------------------------------------------------------------------------------------------------------

test('tampering with a published governed revision in the database is caught at project creation', async () => {
  const head = (await prisma.diyProjectTemplate.findUnique({ where: { id: 'tD' } })).publishedRevisionId;
  await prisma.$executeRawUnsafe(`UPDATE diy_template_revisions SET "contentJson" = jsonb_set("contentJson", '{steps,0,title}', '"Tampered"') WHERE id = '${head}'`);
  await assert.rejects(diyService.createProject('prop1', 'u1', { templateId: 'tD' }), (error) => error.statusCode === 409 && error.code === 'DIY_TEMPLATE_UNAVAILABLE');
});
