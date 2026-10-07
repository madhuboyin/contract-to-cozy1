const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Slice 8A of docs/architecture/ASK_COZY_DIY_PROJECT_START_PLAN.md: the ONE transactional template-start authority (diyService.startProjectFromTemplate), shared
// by the page (createProject's template branch) and Ask. Runs the real diy.service against the shared database-free fake (tests/helpers/diyTemplateFake.js), NOT
// Postgres. The fake's `overlap` option lets two transactions run concurrently, so ONLY the advisory lock can order them; the owner-run Postgres script (8E) is the real proof.

const { makeDiyDb } = require('../helpers/diyTemplateFake.js');

function harness(seeds, hooks = {}, options = {}) {
  const db = makeDiyDb(seeds, hooks);
  const calls = { context: [] };
  const stub = (relative, exports) => { const resolved = require.resolve(relative); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports }; };
  stub('../../src/lib/prisma.ts', { prisma: db });
  stub('../../src/lib/logger.ts', { logger: { info() {}, warn() {}, error() {} }, auditLog() {}, redactEmail: (value) => value });
  stub('../../src/modules/propertyContext/index.ts', { getPropertyContext: async (propertyId, actor, request, deps, txClient) => { calls.context.push({ propertyId, actor, request, txClient }); return {}; } });
  stub('../../src/services/diy/applicabilityPolicy.ts', { evaluateDiyApplicability: () => options.applicability ?? { status: 'APPLICABLE' } });
  for (const relative of ['../../src/services/diyTemplateRevision.service.ts', '../../src/services/diyPublishedTemplate.ts', '../../src/services/diy/templateStartPolicy.ts', '../../src/services/diy.service.ts']) delete require.cache[require.resolve(relative)];
  const revisions = require('../../src/services/diyTemplateRevision.service.ts');
  const { diyService } = require('../../src/services/diy.service.ts');
  return { db, state: db.state, revisions, diyService, calls };
}

const tpl = (overrides = {}) => ({
  id: 't1', slug: 'replace-furnace-filter', title: 'Replace a furnace filter', shortDescription: 'Swap the filter.', longDescription: 'Long.',
  category: 'GENERAL', difficultyLevel: 'EASY', requiredSkillLevel: 'BEGINNER', safetyLevel: 'LOW', permitRequirement: 'NOT_REQUIRED', estimatedMinutes: 10,
  estimatedMaterialCostMinCents: 1000, estimatedMaterialCostMaxCents: 3000, tags: ['hvac'], featuredOrder: null,
  steps: [
    { id: 'w2', stepNumber: 2, title: 'Slide in the new filter', description: 'Arrow toward the furnace.', isOptional: false },
    { id: 'w1', stepNumber: 1, title: 'Remove the old filter', description: 'Note the size.', isOptional: false },
  ],
  materials: [{ id: 'm1', name: 'Filter', unit: 'each', quantityFormula: '1', unitPriceCents: 2000, isOptional: false, sortOrder: 0 }],
  tools: [{ id: 'tl1', name: 'Flashlight', canonicalId: 'FLASHLIGHT', isRequired: false, defaultToolAction: 'BUY', sortOrder: 0 }],
  ...overrides,
});

async function goLive(h, id = 't1') {
  const revision = await h.revisions.createCandidateRevision(h.db, { templateId: id, actorId: 'author' });
  await h.revisions.approveRevision(h.db, { revisionId: revision.id, actorId: 'reviewer' });
  await h.revisions.publishRevision(h.db, { templateId: id, revisionId: revision.id, actorId: 'publisher' });
  return revision;
}
const ask = (h, propertyId = 'prop-1', actorUserId = 'user-1', templateId = 't1') => h.diyService.startProjectFromTemplate(propertyId, templateId, { actorUserId, requireGoverned: true });
const openStatuses = (h) => h.state.projects.filter((project) => ['PLANNING', 'IN_PROGRESS'].includes(project.status));

test('creates the project from the published head with step 1 first, and reads the property context on the SAME transaction client (not the shared one)', async () => {
  const h = harness([tpl()]); const revision = await goLive(h);
  const result = await ask(h);
  assert.equal(result.outcome, 'CREATED');
  assert.deepEqual([result.project.status, result.project.templateId, result.project.templateRevisionId], ['PLANNING', 't1', revision.id]);
  assert.deepEqual(result.project.steps.map((step) => step.stepNumber), [1, 2]);
  assert.equal(h.calls.context.length, 1);
  assert.notEqual(h.calls.context[0].txClient, undefined, 'a transaction client was passed');
  assert.notEqual(h.calls.context[0].txClient, h.db, 'and it is not the shared client');
  assert.deepEqual(h.calls.context[0].request.scopes.sort(), ['EXTERIOR', 'INVENTORY', 'RESPONSIBILITY', 'SYSTEMS']);
  const sqls = h.state.locks.map((lock) => lock.sql);
  assert.ok(sqls.findIndex((sql) => sql.includes('pg_advisory_xact_lock')) < sqls.findIndex((sql) => sql.includes('diy_template_revisions')), 'the advisory lock is taken before the governance row locks');
});

test('authorization runs first inside the transaction: a viewer is refused before anything is revealed, even when an open project exists', async () => {
  const h = harness([tpl()], { role: (userId) => (userId === 'viewer' ? 'VIEWER' : 'CONTRIBUTOR') }); await goLive(h);
  await ask(h, 'prop-1', 'user-1');
  const before = structuredClone(h.state.projects);
  await assert.rejects(ask(h, 'prop-1', 'viewer'), (error) => error.statusCode === 403 && error.code === 'DIY_ACCESS_REVOKED' && !error.details);
  const revoked = harness([tpl()], { role: () => null }); await goLive(revoked);
  await assert.rejects(ask(revoked), (error) => error.code === 'DIY_ACCESS_REVOKED');
  assert.equal(revoked.state.projects.length, 0);
  assert.deepEqual(h.state.projects, before);
});

test('a second start while one is open returns the SAME (earliest) project as ALREADY_OPEN; the page path turns it into a 409 carrying only the project id', async () => {
  const h = harness([tpl()]); await goLive(h);
  const first = await ask(h);
  const second = await ask(h);
  assert.deepEqual([second.outcome, second.project.id], ['ALREADY_OPEN', first.project.id]);
  assert.equal(h.state.projects.length, 1);
  await assert.rejects(h.diyService.createProject('prop-1', 'user-1', { templateId: 't1' }), (error) => error.statusCode === 409 && error.code === 'DIY_PROJECT_ALREADY_OPEN' && JSON.stringify(error.details) === JSON.stringify({ projectId: first.project.id }));
  assert.equal(h.state.projects.length, 1);
});

test('IN_PROGRESS still counts as open; a finished, stopped or handed-off project does not block a new start; another property is independent', async () => {
  const h = harness([tpl()]); await goLive(h);
  const first = await ask(h);
  h.state.projects[0].status = 'IN_PROGRESS';
  assert.equal((await ask(h)).outcome, 'ALREADY_OPEN');
  for (const status of ['COMPLETED', 'ABANDONED', 'HIRED_OUT']) {
    h.state.projects[0].status = status;
    const next = await ask(h);
    assert.equal(next.outcome, 'CREATED', status);
    assert.notEqual(next.project.id, first.project.id);
    h.state.projects.at(-1).status = 'COMPLETED';
  }
  const other = await ask(h, 'prop-2');
  assert.equal(other.outcome, 'CREATED');
});

async function race(skipAdvisoryLock) {
  const h = harness([tpl()], { overlap: true, skipAdvisoryLock }); await goLive(h);
  const results = await Promise.all([ask(h), ask(h), ask(h)]);
  return { h, results };
}

test('RACE: three simultaneous confirmations on overlapping transactions create exactly one project, and every caller gets the same winner', async () => {
  const { h, results } = await race(false);
  assert.equal(h.state.projects.length, 1, 'one project');
  assert.deepEqual(results.map((result) => result.project.id), Array(3).fill(h.state.projects[0].id), 'the same winner for all');
  assert.deepEqual(results.map((result) => result.outcome).sort(), ['ALREADY_OPEN', 'ALREADY_OPEN', 'CREATED']);
  assert.equal(h.state.advisoryLocks.size, 0, 'every advisory lock was released at the end of its transaction');
});

test('MUTATION: with the advisory lock removed the same race creates TWO OR MORE open projects (proves the test depends on the lock, not on the fake serializing)', async () => {
  const { h } = await race(true);
  assert.ok(openStatuses(h).length >= 2, `expected duplicates without the lock, got ${openStatuses(h).length}`);
});

test('a failure after the lock releases it, so a retry can proceed', async () => {
  const h = harness([tpl()], { overlap: true, fail: (name) => name === 'project.steps.createMany' }); await goLive(h);
  await assert.rejects(ask(h), /injected failure/);
  assert.equal(h.state.advisoryLocks.size, 0);
});

test('the confirmation re-checks everything even when the card was fine: a withdrawn template, a changed (tampered) revision, a not-governed revision, a property that is no longer applicable', async () => {
  const withdrawn = harness([tpl()]); await goLive(withdrawn);
  await withdrawn.revisions.retireHead(withdrawn.db, { templateId: 't1', reason: 'UNPUBLISHED' });
  await assert.rejects(ask(withdrawn), (error) => error.statusCode === 404);

  const tampered = harness([tpl()]); await goLive(tampered);
  tampered.state.revisions[0].contentJson.steps[0].title = 'Changed after review';
  await assert.rejects(ask(tampered), (error) => error.code === 'DIY_TEMPLATE_UNAVAILABLE');

  const legacy = harness([tpl()]); await goLive(legacy);
  Object.assign(legacy.state.revisions[0], { provenance: 'LEGACY_BACKFILL', contentHash: null });
  await assert.rejects(ask(legacy), (error) => error.code === 'DIY_TEMPLATE_UNAVAILABLE', 'Ask never starts a legacy revision');
  const page = await legacy.diyService.createProject('prop-1', 'user-1', { templateId: 't1' });
  assert.equal(page.templateId, 't1', 'the page still accepts it');

  const notApplicable = harness([tpl()], {}, { applicability: { status: 'NOT_APPLICABLE', reasonCodes: ['ASSOCIATION_RESPONSIBLE'] } }); await goLive(notApplicable);
  await assert.rejects(ask(notApplicable), (error) => error.code === 'DIY_PROPERTY_NOT_APPLICABLE');
  for (const h of [withdrawn, tampered, notApplicable]) assert.equal(h.state.projects.length, 0);
  assert.equal(notApplicable.calls.context.length, 1, 'applicability was evaluated inside the transaction, after the lock');
});

test('not eligible (permit required) is refused with the eligibility details and creates nothing', async () => {
  const h = harness([tpl({ permitRequirement: 'REQUIRED' })]); await goLive(h);
  await assert.rejects(ask(h), (error) => error.statusCode === 409 && error.code === 'DIY_NOT_LOW_RISK' && error.details?.eligibility?.eligible === false);
  assert.equal(h.state.projects.length, 0);
});

test('tool ownership is read inside the transaction at confirmation time', async () => {
  const hooks = { skillProfile: null };
  const h = harness([tpl()], hooks); await goLive(h);
  hooks.skillProfile = { toolsOwnedJson: ['FLASHLIGHT'] }; // changed after the card was shown
  const { project } = await ask(h);
  assert.equal(project.tools[0].userToolAction, 'ALREADY_OWNED');
});

test('the source reads the context on the transaction client, never the shared one, and takes the advisory lock before the duplicate check (source scan)', () => {
  const source = require('node:fs').readFileSync(require.resolve('../../src/services/diy.service.ts'), 'utf8');
  const body = source.slice(source.indexOf('async startProjectFromTemplate('), source.indexOf('async listStartableTemplates('));
  assert.ok(body.indexOf('hasPropertyRoleWithin(tx') < body.indexOf('pg_advisory_xact_lock'));
  assert.ok(body.indexOf('pg_advisory_xact_lock') < body.indexOf('tx.diyProject.findFirst'));
  assert.ok(body.indexOf('tx.diyProject.findFirst') < body.indexOf('getPropertyContext('));
  assert.match(body, /getPropertyContext\([\s\S]*?\n\s*tx,\n\s*\)/);
  assert.equal(/prisma\.(diy|propertyMaintenanceTask)/.test(body), false, 'no shared-client read inside the authority');
});
