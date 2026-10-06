const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Slice 1c of docs/architecture/ASK_COZY_DIY_TEMPLATE_REVISIONS_PLAN.md: homeowner reads (library list, featured, detail) and createProject use the
// PUBLISHED HEAD REVISION and ignore the editable working copy. Runs the real diy.service against the shared database-free fake
// (tests/helpers/diyTemplateFake.js); property facts are stubbed because they are not what is under test. Not Postgres.

const { makeDiyDb } = require('../helpers/diyTemplateFake.js');

function harness(seeds, hooks) {
  const db = makeDiyDb(seeds, hooks);
  const prisma = Object.assign(db, {});
  const stub = (relative, exports) => { const resolved = require.resolve(relative); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports }; };
  stub('../../src/lib/prisma.ts', { prisma });
  stub('../../src/lib/logger.ts', { logger: { info() {}, warn() {}, error() {} }, auditLog() {}, redactEmail: (value) => value });
  stub('../../src/modules/propertyContext/index.ts', { getPropertyContext: async () => ({}) });
  stub('../../src/services/diy/applicabilityPolicy.ts', { evaluateDiyApplicability: () => ({ status: 'APPLICABLE' }) });
  for (const relative of ['../../src/services/diyTemplateRevision.service.ts', '../../src/services/diyPublishedTemplate.ts', '../../src/services/diy.service.ts']) delete require.cache[require.resolve(relative)];
  const revisions = require('../../src/services/diyTemplateRevision.service.ts');
  const { diyService } = require('../../src/services/diy.service.ts');
  return { db, state: db.state, revisions, diyService };
}

const tpl = (overrides = {}) => ({
  id: 't1', slug: 'paint-a-room', title: 'Paint a room', shortDescription: 'Fresh coat of paint.', longDescription: 'Long text.',
  category: 'PAINTING', difficultyLevel: 'EASY', requiredSkillLevel: 'BEGINNER', safetyLevel: 'LOW', permitRequirement: 'NOT_REQUIRED', estimatedMinutes: 120,
  estimatedMaterialCostMinCents: 3000, estimatedMaterialCostMaxCents: 9000, tags: ['paint', 'interior'], featuredOrder: null,
  steps: [
    { id: 'w2', stepNumber: 2, title: 'Roll the walls', description: 'Work in sections.', isOptional: false },
    { id: 'w1', stepNumber: 1, title: 'Tape the trim', description: 'Use painter\'s tape.', safetyNote: 'Ventilate the room.', isOptional: false },
  ],
  materials: [{ id: 'm1', name: 'Paint', unit: 'gallon', quantityFormula: '2', unitPriceCents: 4000, isOptional: false, sortOrder: 0 }],
  tools: [{ id: 'tl1', name: 'Roller', canonicalId: 'ROLLER', isRequired: true, defaultToolAction: 'BUY', sortOrder: 0 }],
  ...overrides,
});

// Takes a template through submit, approve and publish with the real revision service (so the hash is real).
async function goLive(h, id = 't1') {
  const revision = await h.revisions.createCandidateRevision(h.db, { templateId: id, actorId: 'author' });
  await h.revisions.approveRevision(h.db, { revisionId: revision.id, actorId: 'reviewer' });
  await h.revisions.publishRevision(h.db, { templateId: id, revisionId: revision.id, actorId: 'publisher' });
  return revision;
}
const edit = (h, patch, id = 't1') => Object.assign(h.state.templates.get(id), patch); // the working copy changes; the head does not
const rejects = (promise, check) => assert.rejects(promise, check);

// ---- library list ----------------------------------------------------------------------------------------------------------------------------

test('the list returns the published head and ignores a divergent working copy (title, category, tags, safety)', async () => {
  const h = harness([tpl()]); await goLive(h);
  edit(h, { title: 'WORK IN PROGRESS', category: 'PLUMBING', tags: ['wip'], safetyLevel: 'HIGH', shortDescription: 'draft text' });
  const { items } = await h.diyService.listTemplates({});
  assert.equal(items.length, 1);
  assert.deepEqual([items[0].id, items[0].title, items[0].category, items[0].safetyLevel, items[0].tags, items[0].shortDescription], ['t1', 'Paint a room', 'PAINTING', 'LOW', ['paint', 'interior'], 'Fresh coat of paint.']);
  assert.deepEqual((await h.diyService.listTemplates({ category: 'PAINTING' })).items.map((item) => item.id), ['t1'], 'filters use the head\'s category');
  assert.deepEqual((await h.diyService.listTemplates({ category: 'PLUMBING' })).items, [], 'not the working copy\'s');
  assert.deepEqual((await h.diyService.listTemplates({ search: 'WORK IN PROGRESS' })).items, [], 'search does not see draft text');
});

test('a head whose reviewed safety is not LOW is not listed, even if the working copy now says LOW', async () => {
  const h = harness([tpl({ safetyLevel: 'MODERATE' })]); await goLive(h);
  edit(h, { safetyLevel: 'LOW' });
  assert.deepEqual((await h.diyService.listTemplates({})).items, []);
  assert.deepEqual(await h.diyService.getFeaturedTemplates(), []);
});

test('a template with no published head is invisible: draft, review, approved, archived, and "ACTIVE" with no head', async () => {
  const seeds = ['DRAFT', 'REVIEW', 'APPROVED', 'ARCHIVED', 'ACTIVE'].map((status, index) => tpl({ id: `t${index + 1}`, slug: `s${index + 1}`, status, featuredOrder: index + 1 }));
  const h = harness(seeds);
  assert.deepEqual((await h.diyService.listTemplates({})).items, []);
  assert.deepEqual(await h.diyService.getFeaturedTemplates(), []);
  for (const id of ['t1', 't2', 't3', 't4', 't5']) await rejects(h.diyService.getTemplateDetail(id), (error) => error.statusCode === 404);
});

test('withdrawing the head removes the template from the list, featured and detail at once', async () => {
  const h = harness([tpl({ featuredOrder: 1 })]); await goLive(h);
  assert.equal((await h.diyService.listTemplates({})).items.length, 1);
  assert.equal((await h.diyService.getFeaturedTemplates()).length, 1);
  await h.revisions.retireHead(h.db, { templateId: 't1', reason: 'UNPUBLISHED' });
  assert.deepEqual((await h.diyService.listTemplates({})).items, []);
  assert.deepEqual(await h.diyService.getFeaturedTemplates(), []);
  await rejects(h.diyService.getTemplateDetail('t1'), (error) => error.statusCode === 404);
});

test('filters, search and paging work on the head: difficulty, skill level, title and tag search, and a template-id cursor in title order', async () => {
  const h = harness([
    tpl({ id: 'a', slug: 'a', title: 'Caulk a tub', difficultyLevel: 'EASY', requiredSkillLevel: 'BEGINNER', tags: ['bath'] }),
    tpl({ id: 'b', slug: 'b', title: 'Paint a fence', difficultyLevel: 'MODERATE', requiredSkillLevel: 'INTERMEDIATE', tags: ['exterior'], category: 'EXTERIOR' }),
    tpl({ id: 'c', slug: 'c', title: 'Hang a shelf', difficultyLevel: 'EASY', requiredSkillLevel: 'BEGINNER', tags: ['wall'], category: 'GENERAL' }),
  ]);
  for (const id of ['a', 'b', 'c']) await goLive(h, id);
  const ids = async (params) => (await h.diyService.listTemplates(params)).items.map((item) => item.id);
  assert.deepEqual(await ids({}), ['a', 'c', 'b'], 'title order: Caulk, Hang, Paint');
  assert.deepEqual(await ids({ difficulty: 'EASY' }), ['a', 'c']);
  assert.deepEqual(await ids({ maxSkillLevel: 'BEGINNER' }), ['a', 'c']);
  assert.deepEqual(await ids({ search: 'PAINT' }), ['b'], 'title search is case-insensitive');
  assert.deepEqual(await ids({ search: 'wall' }), ['c'], 'tag search');
  const first = await h.diyService.listTemplates({ limit: 2 });
  assert.deepEqual([first.items.map((item) => item.id), first.nextCursor], [['a', 'c'], 'c']);
  const second = await h.diyService.listTemplates({ limit: 2, cursor: first.nextCursor });
  assert.deepEqual([second.items.map((item) => item.id), second.nextCursor], [['b'], undefined]);
});

test('the list drops a head that fails the eligibility policy (permit required)', async () => {
  const h = harness([tpl({ permitRequirement: 'LIKELY_NOT_REQUIRED' }), tpl({ id: 't2', slug: 's2', title: 'Replace a gas line valve', permitRequirement: 'NOT_REQUIRED' })]);
  await goLive(h, 't1'); await goLive(h, 't2');
  assert.deepEqual((await h.diyService.listTemplates({})).items.map((item) => item.id), ['t1'], 'excluded gas work is not offered');
  await rejects(h.diyService.getTemplateDetail('t2'), (error) => error.statusCode === 409 && error.code === 'DIY_NOT_LOW_RISK');
});

test('paging is not wasted on heads that are not listable: a not-LOW head sorted first does not take a slot from the page', async () => {
  const h = harness([tpl({ id: 'a', slug: 'a', title: 'A first but moderate', safetyLevel: 'MODERATE' }), tpl({ id: 'b', slug: 'b', title: 'B listable' }), tpl({ id: 'c', slug: 'c', title: 'C listable' })]);
  for (const id of ['a', 'b', 'c']) await goLive(h, id);
  const page = await h.diyService.listTemplates({ limit: 1 });
  assert.deepEqual([page.items.map((item) => item.id), page.nextCursor], [['b'], 'b'], 'the page holds the first listable template, filtered by the query itself');
  assert.deepEqual((await h.diyService.listTemplates({ limit: 1, cursor: page.nextCursor })).items.map((item) => item.id), ['c']);
});

// ---- featured -------------------------------------------------------------------------------------------------------------------------------

test('featured order comes from the template row (merchandising, not reviewed content) while the content comes from the head', async () => {
  const h = harness([tpl({ id: 'a', slug: 'a', title: 'Alpha', featuredOrder: 2 }), tpl({ id: 'b', slug: 'b', title: 'Beta', featuredOrder: 1 }), tpl({ id: 'c', slug: 'c', title: 'Gamma', featuredOrder: null })]);
  for (const id of ['a', 'b', 'c']) await goLive(h, id);
  assert.deepEqual((await h.diyService.getFeaturedTemplates()).map((item) => item.id), ['b', 'a']);
  edit(h, { featuredOrder: 1 }, 'a'); edit(h, { featuredOrder: 2 }, 'b'); edit(h, { title: 'Renamed in draft' }, 'a');
  const featured = await h.diyService.getFeaturedTemplates();
  assert.deepEqual(featured.map((item) => [item.id, item.title, item.featuredOrder]), [['a', 'Alpha', 1], ['b', 'Beta', 2]]);
});

// ---- detail ---------------------------------------------------------------------------------------------------------------------------------

test('detail: the template id, head content with stable synthetic ids, the shape the pages use, and no admin fields', async () => {
  const h = harness([tpl({ approvedBy: 'someone', geminiPromptHint: 'secret hint' })]); const revision = await goLive(h);
  edit(h, { title: 'draft', steps: [{ id: 'x', stepNumber: 1, title: 'Draft step', description: 'd', isOptional: false }] });
  const detail = await h.diyService.getTemplateDetail('t1');
  assert.equal(detail.id, 't1');
  assert.equal(detail.title, 'Paint a room');
  assert.deepEqual(detail.steps.map((step) => [step.id, step.stepNumber, step.title]), [[`${revision.id}:step:1`, 1, 'Tape the trim'], [`${revision.id}:step:2`, 2, 'Roll the walls']]);
  assert.equal(detail.steps[0].safetyNote, 'Ventilate the room.');
  assert.deepEqual([detail.materials[0].id, detail.materials[0].name, detail.tools[0].id, detail.tools[0].canonicalId], [`${revision.id}:material:0`, 'Paint', `${revision.id}:tool:0`, 'ROLLER']);
  assert.equal(detail.longDescription, 'Long text.');
  assert.equal(detail.revision, 1);
  for (const key of ['approvedBy', 'approvedAt', 'geminiPromptHint', 'status', 'publishedRevisionId', 'createdAt', 'updatedAt']) assert.equal(key in detail, false, `${key} is not part of a homeowner response`);
  for (const key of ['id', 'slug', 'title', 'shortDescription', 'category', 'difficultyLevel', 'requiredSkillLevel', 'safetyLevel', 'permitRequirement', 'estimatedMinutes', 'tags', 'featuredOrder', 'steps', 'materials', 'tools']) assert.ok(key in detail, `${key} is still in the detail`);
});

// ---- createProject --------------------------------------------------------------------------------------------------------------------------

const start = (h, templateId = 't1', payload = {}) => h.diyService.createProject('prop-1', 'user-1', { templateId, ...payload });

test('createProject copies the published head, not the working copy, and records the revision it copied', async () => {
  const h = harness([tpl()], { skillProfile: { toolsOwnedJson: ['ROLLER'] }, tasks: [{ id: 'task-1', propertyId: 'prop-1' }] }); const revision = await goLive(h);
  edit(h, { title: 'Draft title', steps: [{ id: 'd', stepNumber: 1, title: 'Draft only step', description: 'x', isOptional: false }], materials: [] });
  const project = await start(h, 't1', { maintenanceTaskId: 'task-1' });
  assert.deepEqual([project.title, project.templateId, project.templateRevisionId, project.maintenanceTaskId], ['Paint a room', 't1', revision.id, 'task-1']);
  assert.deepEqual(project.steps.map((step) => [step.stepNumber, step.title, step.templateStepId, step.status]), [[1, 'Tape the trim', `${revision.id}:step:1`, 'PENDING'], [2, 'Roll the walls', `${revision.id}:step:2`, 'PENDING']]);
  assert.equal(project.steps[0].safetyNote, 'Ventilate the room.');
  assert.deepEqual([project.materials[0].name, project.materials[0].quantity, project.materials[0].totalEstimateCents], ['Paint', 2, 8000]);
  assert.deepEqual([project.tools[0].name, project.tools[0].userToolAction], ['Roller', 'ALREADY_OWNED']);
});

test('createProject returns the project it just created: the detail is read through the transaction, where the new row is visible', async () => {
  const h = harness([tpl()]); await goLive(h);
  const project = await start(h); // would throw "Project not found" if the detail were read outside the still-open transaction
  assert.equal(project.title, 'Paint a room');
  assert.equal(h.state.projects.length, 1);
  assert.equal(h.state.uncommittedProjects.size, 0, 'committed when the transaction finished');
});

test('createProject refuses a template without a published head', async () => {
  for (const status of ['DRAFT', 'REVIEW', 'APPROVED', 'ARCHIVED', 'ACTIVE']) {
    const h = harness([tpl({ status })]);
    await rejects(start(h), (error) => error.statusCode === 404);
    assert.equal(h.state.projects.length, 0, status);
  }
  const h = harness([tpl()]); await goLive(h);
  await h.revisions.retireHead(h.db, { templateId: 't1', reason: 'ARCHIVED' });
  await rejects(start(h), (error) => error.statusCode === 404);
});

test('createProject judges eligibility on the head\'s safety and permit fields, not the working copy\'s', async () => {
  const allowed = harness([tpl()]); await goLive(allowed);
  edit(allowed, { safetyLevel: 'HIGH', permitRequirement: 'REQUIRED' }); // an unreviewed draft edit does not block a reviewed head
  assert.equal((await start(allowed)).templateId, 't1');

  const refused = harness([tpl({ permitRequirement: 'REQUIRED' })]); await goLive(refused);
  edit(refused, { permitRequirement: 'NOT_REQUIRED' }); // nor can an unreviewed draft edit unlock a head that is not low risk
  await rejects(start(refused), (error) => error.statusCode === 409 && error.code === 'DIY_NOT_LOW_RISK');
  assert.equal(refused.state.projects.length, 0);
});

test('createProject refuses a governed revision whose stored content no longer matches its hash, and creates nothing', async () => {
  const h = harness([tpl()]); await goLive(h);
  h.state.revisions[0].contentJson.steps[0].title = 'Tampered in the database';
  await rejects(start(h), (error) => error.statusCode === 409 && error.code === 'DIY_TEMPLATE_UNAVAILABLE');
  assert.equal(h.state.projects.length, 0);
  const missing = harness([tpl()]); await goLive(missing);
  missing.state.revisions[0].contentHash = null;
  await rejects(start(missing), (error) => error.code === 'DIY_TEMPLATE_UNAVAILABLE');
});

test('createProject accepts a legacy-backfill revision (no hash, no integrity claim) so templates live before revisions keep working', async () => {
  const h = harness([tpl()]); const revision = await goLive(h);
  Object.assign(h.state.revisions[0], { provenance: 'LEGACY_BACKFILL', contentHash: null });
  const project = await start(h);
  assert.equal(project.templateRevisionId, revision.id);
  assert.equal(h.state.revisions[0].provenance, 'LEGACY_BACKFILL', 'recorded as legacy, so Ask can treat it as not reviewed');
});
