const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Slice 1b of docs/architecture/ASK_COZY_DIY_TEMPLATE_REVISIONS_PLAN.md: the lifecycle transitions and the admin edit semantics, run through the real
// governance and DIY services against a database-free fake (tests/helpers/diyTemplateFake.js: serialized transactions with rollback, conditional
// writes, unique keys). Not Postgres: lock timing and real isolation are not exercised here.

const { makeDiyDb } = require('../helpers/diyTemplateFake.js');

function harness(seeds, hooks) {
  const db = makeDiyDb(seeds, hooks);
  const audit = [];
  const prisma = Object.assign(db, { auditLog: { create: async ({ data }) => { audit.push(data); return data; } } });
  const stub = (relative, exports) => { const resolved = require.resolve(relative); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports }; };
  stub('../../src/lib/prisma.ts', { prisma });
  stub('../../src/lib/logger.ts', { logger: { info() {}, warn() {}, error() {} }, auditLog() {}, redactEmail: (value) => value });
  for (const relative of [
    '../../src/services/adminAudit.service.ts', '../../src/services/adminContentGovernance.service.ts',
    '../../src/services/diyTemplateRevision.service.ts', '../../src/services/diy.service.ts',
  ]) delete require.cache[require.resolve(relative)];
  const governance = require('../../src/services/adminContentGovernance.service.ts');
  const revisions = require('../../src/services/diyTemplateRevision.service.ts');
  const { diyService } = require('../../src/services/diy.service.ts');
  const act = (templateId, action, actorId = 'admin-1') => governance.transitionDiyTemplate({ templateId, actorId, action, reason: 'because' });
  return { db, state: db.state, audit, governance, revisions, diyService, act };
}

const tpl = (overrides = {}) => ({
  id: 't1', slug: 'replace-furnace-filter', title: 'Replace a furnace filter', shortDescription: 'Swap the filter.', longDescription: null,
  category: 'HVAC', difficultyLevel: 'EASY', requiredSkillLevel: 'BEGINNER', safetyLevel: 'LOW', permitRequirement: 'NOT_REQUIRED', estimatedMinutes: 15,
  tags: ['hvac'], steps: [{ id: 's1', stepNumber: 1, title: 'Turn off the furnace', description: 'Use the thermostat.', isOptional: false }],
  materials: [], tools: [], ...overrides,
});
const rejectsWith = (promise, code) => assert.rejects(promise, (error) => error.code === code, code);
const live = async (h, id = 't1') => { await h.act(id, 'SUBMIT_FOR_REVIEW', 'author'); await h.act(id, 'APPROVE', 'reviewer'); await h.act(id, 'PUBLISH', 'publisher'); };

// ---- edit semantics (plan §3.4) -----------------------------------------------------------------------------------------------------------------

test('editing a DRAFT updates the working copy in place, as before', async () => {
  const h = harness([tpl()]);
  const result = await h.diyService.adminUpdateTemplate('t1', { title: 'New title', steps: [{ stepNumber: 1, title: 'Different', description: 'Text', isOptional: false }] });
  assert.equal(result.title, 'New title');
  assert.equal(result.status, 'DRAFT');
  assert.deepEqual(result.steps.map((step) => step.title), ['Different']);
});

test('reviewed content is frozen: REVIEW, APPROVED and ARCHIVED templates refuse an edit and change nothing', async () => {
  for (const status of ['REVIEW', 'APPROVED', 'ARCHIVED']) {
    const h = harness([tpl({ status, approvedBy: status === 'APPROVED' ? 'reviewer' : null })]);
    await assert.rejects(h.diyService.adminUpdateTemplate('t1', { title: 'Sneaky change' }), (error) => error.statusCode === 409 && error.code === 'TEMPLATE_CONTENT_FROZEN' && error.details.status === status);
    await assert.rejects(h.diyService.adminUpdateTemplate('t1', { steps: [] }), (error) => error.code === 'TEMPLATE_CONTENT_FROZEN');
    const row = h.state.templates.get('t1');
    assert.equal(row.title, 'Replace a furnace filter');
    assert.equal(row.steps.length, 1, `${status}: steps untouched`);
    assert.equal(row.status, status);
  }
  await assert.rejects(harness([]).diyService.adminUpdateTemplate('missing', { title: 'x' }), (error) => error.statusCode === 404);
});

test('featuredOrder and geminiPromptHint are not reviewed content: they change in any status and never move the template', async () => {
  for (const status of ['DRAFT', 'REVIEW', 'APPROVED', 'ARCHIVED']) {
    const h = harness([tpl({ status })]);
    await h.diyService.adminUpdateTemplate('t1', { featuredOrder: 3, geminiPromptHint: 'keep it short' });
    const row = h.state.templates.get('t1');
    assert.deepEqual([row.featuredOrder, row.geminiPromptHint, row.status], [3, 'keep it short', status], status);
  }
  const h = harness([tpl()]); await live(h);
  await h.diyService.adminUpdateTemplate('t1', { featuredOrder: 1 });
  assert.equal(h.state.templates.get('t1').status, 'ACTIVE', 'a merchandising change does not diverge a live template');
});

test('editing an ACTIVE template saves a draft: it becomes DRAFT, approval clears, and the published head and its revision are untouched', async () => {
  const h = harness([tpl()]); await live(h);
  const head = h.state.templates.get('t1').publishedRevisionId;
  const published = structuredClone(h.state.revisions[0]);
  assert.ok(head);
  const result = await h.diyService.adminUpdateTemplate('t1', { title: 'Replace a furnace filter (v2)', safetyLevel: 'MODERATE' });
  assert.equal(result.status, 'DRAFT');
  assert.deepEqual([result.approvedBy, result.approvedAt], [null, null]);
  assert.equal(h.state.templates.get('t1').publishedRevisionId, head, 'the live head is unchanged');
  assert.deepEqual(h.state.revisions[0], published, 'the published revision is byte-identical, including its safety level and title');
  assert.equal(h.state.revisions[0].title, 'Replace a furnace filter');
});

// ---- submit, approve, return, publish, supersede ------------------------------------------------------------------------------------------------

test('the lifecycle creates, approves and publishes a revision and the audit record names the revision', async () => {
  const h = harness([tpl()]);
  assert.equal((await h.act('t1', 'SUBMIT_FOR_REVIEW', 'author')).status, 'REVIEW');
  assert.equal(h.state.revisions.length, 1);
  assert.equal(h.state.revisions[0].submittedBy, 'author');
  assert.equal((await h.act('t1', 'APPROVE', 'reviewer')).status, 'APPROVED');
  assert.deepEqual([h.state.revisions[0].approvedBy, h.state.templates.get('t1').approvedBy], ['reviewer', 'reviewer'], 'the revision is the source of truth and the template mirrors it');
  assert.equal((await h.act('t1', 'PUBLISH', 'publisher')).status, 'ACTIVE');
  assert.equal(h.state.templates.get('t1').publishedRevisionId, h.state.revisions[0].id);
  const last = h.audit.at(-1);
  assert.equal(last.action, 'ADMIN_DIY_LIFECYCLE');
  assert.equal(last.newValues.revision, 1);
  assert.equal(h.audit.at(0).newValues.revision, 1, 'submit records the revision it created');
});

test('returning to draft from REVIEW or APPROVED closes the candidate, clears the mirror and lets the content be edited again', async () => {
  for (const stop of ['REVIEW', 'APPROVED']) {
    const h = harness([tpl()]);
    await h.act('t1', 'SUBMIT_FOR_REVIEW'); if (stop === 'APPROVED') await h.act('t1', 'APPROVE', 'reviewer');
    assert.equal((await h.act('t1', 'RETURN_TO_DRAFT', 'reviewer')).status, 'DRAFT');
    assert.ok(h.state.revisions[0].returnedAt, 'the candidate is kept as history, marked returned');
    assert.deepEqual([h.state.templates.get('t1').approvedBy, h.state.templates.get('t1').approvedAt], [null, null]);
    await h.diyService.adminUpdateTemplate('t1', { title: `Edited after ${stop}` });
    await h.act('t1', 'SUBMIT_FOR_REVIEW');
    assert.equal(h.state.revisions.length, 2);
    assert.equal(h.state.revisions[1].title, `Edited after ${stop}`, 'the next revision snapshots the edited content');
  }
});

test('publishing a newer revision supersedes the previous head, and a live template can be edited meanwhile without changing what is live', async () => {
  const h = harness([tpl()]); await live(h);
  const first = h.state.revisions[0].id;
  await h.diyService.adminUpdateTemplate('t1', { title: 'v2' });
  assert.equal(h.state.templates.get('t1').publishedRevisionId, first, 'still live while the draft exists');
  await h.act('t1', 'SUBMIT_FOR_REVIEW', 'author'); await h.act('t1', 'APPROVE', 'reviewer'); await h.act('t1', 'PUBLISH', 'publisher');
  const [one, two] = h.state.revisions;
  assert.deepEqual([one.retiredReason, two.retiredAt, h.state.templates.get('t1').publishedRevisionId], ['SUPERSEDED', null, two.id]);
});

test('HIGH-safety publishing uses the revision\'s approver, not the template mirror', async () => {
  const h = harness([tpl({ safetyLevel: 'HIGH' })]);
  await h.act('t1', 'SUBMIT_FOR_REVIEW', 'author'); await h.act('t1', 'APPROVE', 'admin-1');
  h.state.templates.get('t1').approvedBy = 'someone-else'; // the mirror says otherwise; the revision decides
  await rejectsWith(h.act('t1', 'PUBLISH', 'admin-1'), 'HIGH_SAFETY_SEPARATION_REQUIRED');
  assert.equal(h.state.templates.get('t1').status, 'APPROVED', 'the refused publish rolled back');
  assert.equal(h.state.templates.get('t1').publishedRevisionId, null);
  assert.equal((await h.act('t1', 'PUBLISH', 'admin-2')).status, 'ACTIVE');
});

// ---- withdrawal (a live template can always be pulled) ------------------------------------------------------------------------------------------

test('UNPUBLISH of a live DRAFT (edited while live) withdraws the head at once and leaves the draft as it is', async () => {
  const h = harness([tpl()]); await live(h);
  await h.diyService.adminUpdateTemplate('t1', { title: 'in progress' });
  assert.equal(h.state.templates.get('t1').status, 'DRAFT');
  assert.equal((await h.act('t1', 'UNPUBLISH', 'publisher')).status, 'DRAFT');
  const row = h.state.templates.get('t1');
  assert.equal(row.publishedRevisionId, null);
  assert.deepEqual([h.state.revisions[0].retiredReason, row.title], ['UNPUBLISHED', 'in progress']);
});

test('ARCHIVE works from a live DRAFT or REVIEW, retires the head, and closes an open candidate', async () => {
  const h = harness([tpl()]); await live(h);
  await h.diyService.adminUpdateTemplate('t1', { title: 'v2' }); await h.act('t1', 'SUBMIT_FOR_REVIEW', 'author');
  assert.equal(h.state.templates.get('t1').status, 'REVIEW');
  assert.equal((await h.act('t1', 'ARCHIVE', 'publisher')).status, 'ARCHIVED');
  const [head, candidate] = h.state.revisions;
  assert.deepEqual([head.retiredReason, candidate.retiredReason, h.state.templates.get('t1').publishedRevisionId], ['ARCHIVED', 'ARCHIVED', null]);

  const draft = harness([tpl()]); await live(draft); await draft.diyService.adminUpdateTemplate('t1', { title: 'draft' });
  assert.equal((await draft.act('t1', 'ARCHIVE', 'publisher')).status, 'ARCHIVED');
  assert.equal(draft.state.templates.get('t1').publishedRevisionId, null);
});

test('without a live head, UNPUBLISH and ARCHIVE of a DRAFT or REVIEW template stay invalid transitions', async () => {
  const h = harness([tpl()]);
  await rejectsWith(h.act('t1', 'UNPUBLISH'), 'INVALID_TRANSITION');
  await rejectsWith(h.act('t1', 'ARCHIVE'), 'INVALID_TRANSITION');
  await h.act('t1', 'SUBMIT_FOR_REVIEW');
  await rejectsWith(h.act('t1', 'UNPUBLISH'), 'INVALID_TRANSITION');
  await rejectsWith(h.act('t1', 'PUBLISH'), 'INVALID_TRANSITION');
  await rejectsWith(h.act('missing', 'APPROVE'), 'TEMPLATE_NOT_FOUND');
});

test('unpublish then publish again republishes the same approved revision without a new review, and archiving closes it for good', async () => {
  const h = harness([tpl()]); await live(h);
  assert.equal((await h.act('t1', 'UNPUBLISH', 'publisher')).status, 'APPROVED');
  assert.equal(h.state.templates.get('t1').publishedRevisionId, null);
  await rejectsWith(h.diyService.adminUpdateTemplate('t1', { title: 'x' }), 'TEMPLATE_CONTENT_FROZEN');
  assert.equal((await h.act('t1', 'PUBLISH', 'publisher')).status, 'ACTIVE');
  assert.equal(h.state.revisions.length, 1, 'no new revision was created');
  assert.equal(h.state.revisions[0].retiredAt, null);
  assert.equal(h.state.templates.get('t1').publishedRevisionId, h.state.revisions[0].id);
  await h.act('t1', 'ARCHIVE', 'publisher'); await h.act('t1', 'REVIVE_TO_DRAFT', 'author');
  await h.act('t1', 'SUBMIT_FOR_REVIEW', 'author');
  assert.equal(h.state.revisions.length, 2, 'an archived revision is never reused: reviving needs a new review');
});

// ---- atomicity and concurrency ------------------------------------------------------------------------------------------------------------------

test('two simultaneous approvals yield one success and one INVALID_TRANSITION, with the revision approved once', async () => {
  const h = harness([tpl()]); await h.act('t1', 'SUBMIT_FOR_REVIEW');
  const results = await Promise.allSettled([h.act('t1', 'APPROVE', 'reviewer-a'), h.act('t1', 'APPROVE', 'reviewer-b')]);
  assert.deepEqual(results.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'INVALID_TRANSITION');
  assert.ok(['reviewer-a', 'reviewer-b'].includes(h.state.revisions[0].approvedBy));
  assert.equal(h.state.revisions[0].approvedBy, h.state.templates.get('t1').approvedBy);
});

test('two simultaneous submissions create one revision', async () => {
  const h = harness([tpl()]);
  const results = await Promise.allSettled([h.act('t1', 'SUBMIT_FOR_REVIEW', 'a'), h.act('t1', 'SUBMIT_FOR_REVIEW', 'b')]);
  assert.deepEqual(results.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(h.state.revisions.length, 1);
});

test('an edit racing a submission is either in the revision or refused, never silently lost', async () => {
  for (const order of ['edit-first', 'submit-first']) {
    const h = harness([tpl()]);
    const edit = () => h.diyService.adminUpdateTemplate('t1', { title: 'Raced edit' });
    const submit = () => h.act('t1', 'SUBMIT_FOR_REVIEW');
    const results = await Promise.allSettled(order === 'edit-first' ? [edit(), submit()] : [submit(), edit()]);
    const [editResult] = order === 'edit-first' ? results : [results[1]];
    const revision = h.state.revisions[0];
    if (editResult.status === 'fulfilled') assert.equal(revision.title, 'Raced edit', `${order}: an applied edit is in the snapshot`);
    else assert.equal(editResult.reason.code, 'TEMPLATE_CONTENT_FROZEN', `${order}: otherwise it is refused`);
    assert.equal(h.state.templates.get('t1').title === 'Raced edit', revision.title === 'Raced edit', `${order}: template and revision agree`);
  }
});

test('a failure part-way through a transition rolls everything back', async () => {
  const submit = harness([tpl()], { fail: (name) => name === 'revision.create' });
  await assert.rejects(submit.act('t1', 'SUBMIT_FOR_REVIEW'), /injected failure/);
  assert.equal(submit.state.templates.get('t1').status, 'DRAFT');
  assert.equal(submit.state.revisions.length, 0);

  let armed = false;
  const publish = harness([tpl()], { fail: (name) => armed && name === 'revision.updateMany' });
  await publish.act('t1', 'SUBMIT_FOR_REVIEW'); await publish.act('t1', 'APPROVE', 'reviewer');
  armed = true;
  await assert.rejects(publish.act('t1', 'PUBLISH', 'publisher'), /injected failure/);
  const row = publish.state.templates.get('t1');
  assert.deepEqual([row.status, row.publishedRevisionId, row.approvedBy], ['APPROVED', null, 'reviewer']);
  assert.equal(publish.state.revisions[0].publishedAt, null);
});

test('a failed edit part-way through rolls back the claim, the status change and the child rows', async () => {
  let armed = false;
  const h = harness([tpl()], { fail: (name) => armed && name === 'steps.createMany' });
  await live(h);
  armed = true;
  await assert.rejects(h.diyService.adminUpdateTemplate('t1', { title: 'half', steps: [{ stepNumber: 1, title: 'x', description: 'y', isOptional: false }] }), /injected failure/);
  const row = h.state.templates.get('t1');
  assert.deepEqual([row.status, row.title, row.steps.length, row.approvedBy], ['ACTIVE', 'Replace a furnace filter', 1, 'reviewer']);
});

// ---- templates that were in review or approved before revisions existed -------------------------------------------------------------------------

test('legacy REVIEW without a candidate: APPROVE asks for a resubmission (and changes nothing), RETURN_TO_DRAFT works', async () => {
  const h = harness([tpl({ status: 'REVIEW' })]);
  await rejectsWith(h.act('t1', 'APPROVE', 'reviewer'), 'REVISION_REQUIRED');
  assert.deepEqual([h.state.templates.get('t1').status, h.state.templates.get('t1').approvedBy], ['REVIEW', null]);
  assert.equal((await h.act('t1', 'RETURN_TO_DRAFT', 'reviewer')).status, 'DRAFT');
  await h.act('t1', 'SUBMIT_FOR_REVIEW');
  assert.equal((await h.act('t1', 'APPROVE', 'reviewer')).status, 'APPROVED');
});

test('legacy APPROVED without a revision cannot be published until it is returned and reviewed again', async () => {
  const h = harness([tpl({ status: 'APPROVED', approvedBy: 'old-reviewer', approvedAt: new Date('2026-01-01') })]);
  await rejectsWith(h.act('t1', 'PUBLISH', 'publisher'), 'REVISION_REQUIRED');
  assert.equal(h.state.templates.get('t1').status, 'APPROVED');
  assert.equal((await h.act('t1', 'RETURN_TO_DRAFT', 'reviewer')).status, 'DRAFT');
  assert.equal(h.state.templates.get('t1').approvedBy, null);
});

test('a legacy ACTIVE template with no head can still be unpublished or archived', async () => {
  const unpublish = harness([tpl({ status: 'ACTIVE', approvedBy: 'old' })]);
  assert.equal((await unpublish.act('t1', 'UNPUBLISH')).status, 'APPROVED');
  const archive = harness([tpl({ status: 'ACTIVE', approvedBy: 'old' })]);
  assert.equal((await archive.act('t1', 'ARCHIVE')).status, 'ARCHIVED');
});
