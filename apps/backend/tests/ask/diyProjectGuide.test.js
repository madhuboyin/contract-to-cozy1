const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Step 5 of the stateful GUIDE, slice 5a (docs/architecture/ASK_COZY_DIY_PROJECT_GUIDE_PLAN.md): the read-only DIY project guide. The pure gate and builder,
// the strict step rule, the progress arithmetic, the stale-source rule, the contract, the trust pipeline (adjacency on the FINAL block sequence), the row action
// on DIY_PROJECTS, and the handler on the shared database-free fake with a write spy. Not Postgres, not a browser.
const { makeDiyDb } = require('../helpers/diyTemplateFake.js');
const { buildRevisionContent, computeContentHash } = require('../../src/services/diyTemplateRevision.service.ts');
const { stepSnapshotId } = require('../../src/services/diyPublishedTemplate.ts');
const guide = require('../../src/services/diy/projectGuide.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
// The executor attaches complete source evidence to every operation's result at runtime; tests that call the validator directly attach it the same way.
const withEvidence = (operationId, result) => attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence(operationId)]);

const template = (overrides = {}) => ({
  id: 't1', slug: 'repaint-hallway', title: 'Repaint a hallway', shortDescription: 'Fresh coat of paint.', longDescription: 'Longer text.', category: 'PAINTING',
  difficultyLevel: 'EASY', requiredSkillLevel: 'BEGINNER', safetyLevel: 'LOW', permitRequirement: 'NOT_REQUIRED', estimatedMinutes: 120, tags: ['paint'],
  steps: [
    { stepNumber: 1, title: 'Tape the trim', description: 'Apply painter tape along the trim.', estimatedMinutes: 20, isOptional: false, safetyNote: 'Keep a window open while you work.', tipNote: 'Press the tape edge down firmly.' },
    { stepNumber: 3, title: 'Cut in the edges', description: 'Brush the corners first.', estimatedMinutes: 30, isOptional: false, safetyNote: null, tipNote: null },
    { stepNumber: 7, title: 'Roll the walls', description: 'Roll two coats.', estimatedMinutes: 60, isOptional: false, safetyNote: null, tipNote: null },
    { stepNumber: 9, title: 'Touch up', description: 'Fix any misses.', estimatedMinutes: 10, isOptional: true, safetyNote: null, tipNote: null },
  ],
  materials: [], tools: [], ...overrides,
});
function revisionRow(overrides = {}, tpl = template()) {
  const content = buildRevisionContent(tpl);
  return {
    id: 'rev-1', templateId: 't1', revision: 1, provenance: 'GOVERNED', ...content.columns, contentJson: content.contentJson, contentHash: computeContentHash(content),
    retiredAt: null, retiredReason: null, ...overrides,
  };
}
const stepsFor = (revision, statuses = {}) => revision.contentJson.steps.map((step, i) => ({
  id: `ps${i + 1}`, stepNumber: step.stepNumber, templateStepId: stepSnapshotId(revision.id, step.stepNumber), title: step.title, description: step.description,
  estimatedMinutes: step.estimatedMinutes ?? null, isOptional: step.isOptional, safetyNote: step.safetyNote ?? null, tipNote: step.tipNote ?? null,
  status: statuses[step.stepNumber] ?? 'PENDING',
}));
function source({ revision = revisionRow(), project = {}, head, steps } = {}) {
  return {
    project: { id: 'p1', title: 'Repaint the hallway', status: 'IN_PROGRESS', category: 'PAINTING', templateId: 't1', aiGuideId: null, templateRevisionId: revision?.id ?? null, completionBasis: null, steps: steps ?? (revision ? stepsFor(revision) : []), ...project },
    revision, head: head === undefined ? { publishedRevisionId: revision?.id ?? null } : head,
  };
}
const evaluate = (input) => guide.evaluateProjectGuide(source(input));
const refused = (input) => { const e = evaluate(input); assert.equal(e.kind, 'REFUSED', JSON.stringify(e)); return e; };
const NOW = new Date('2026-10-06T12:00:00.000Z');

// ---- the gate --------------------------------------------------------------------------------------------------------------------------------------

test('a reviewed, eligible, matching project is guided (current, not withdrawn)', () => {
  const e = evaluate({}); assert.deepEqual([e.kind, e.sourceState], ['GUIDE', 'CURRENT']);
});

test('each refusal reason with its fixed copy; only a project WITH an aiGuideId is called AI-written', () => {
  assert.equal(refused({ project: { status: 'COMPLETED' } }).reason, 'PROJECT_FINISHED');
  for (const status of ['ABANDONED', 'HIRED_OUT']) assert.equal(refused({ project: { status } }).reason, 'PROJECT_FINISHED');
  assert.equal(refused({ project: { aiGuideId: 'g1' } }).reason, 'AI_GUIDE_PROJECT');
  assert.equal(refused({ project: { templateId: null } }).reason, 'NOT_TEMPLATE_PROJECT');
  assert.equal(refused({ project: { templateId: null, aiGuideId: 'g1' } }).reason, 'AI_GUIDE_PROJECT', 'an AI guide wins over a missing template');
  assert.equal(refused({ revision: null, project: { templateRevisionId: null } }).reason, 'NO_REVISION');
  assert.equal(refused({ revision: null, project: { templateRevisionId: 'rev-1' } }).reason, 'NO_REVISION', 'a recorded revision that no longer exists');
  assert.equal(refused({ revision: revisionRow({ provenance: 'LEGACY_BACKFILL', contentHash: null }) }).reason, 'NOT_REVIEWED');
  assert.equal(refused({ revision: revisionRow({ contentHash: 'deadbeef' }) }).reason, 'REVISION_INTEGRITY');
  assert.equal(refused({ revision: revisionRow({ contentHash: null }) }).reason, 'REVISION_INTEGRITY', 'a governed revision with no hash is never usable');
  assert.match(guide.GUIDE_REFUSAL_COPY.AI_GUIDE_PROJECT.body, /written by an AI guide/);
  assert.doesNotMatch(guide.GUIDE_REFUSAL_COPY.NOT_TEMPLATE_PROJECT.body, /AI/, 'the generic copy claims nothing about who wrote the steps');
  for (const copy of Object.values(guide.GUIDE_REFUSAL_COPY)) assert.match(copy.body, /project page|temporarily unavailable/);
});

test('ineligible content is refused: high safety, a permit, and each excluded kind of work', () => {
  const ineligible = (overrides, stepsOverride) => { const tpl = template(overrides); if (stepsOverride) tpl.steps = stepsOverride; return refused({ revision: revisionRow({}, tpl) }); };
  assert.equal(ineligible({ safetyLevel: 'HIGH' }).reason, 'NOT_ELIGIBLE');
  assert.equal(ineligible({ permitRequirement: 'REQUIRED' }).reason, 'NOT_ELIGIBLE');
  // The policy's own patterns: a breaker panel, a gas line, structural work, active water, hazardous material.
  assert.equal(ineligible({ title: 'Replace the breaker panel' }).reason, 'NOT_ELIGIBLE');
  assert.equal(ineligible({ shortDescription: 'Move a gas line to the new range' }).reason, 'NOT_ELIGIBLE');
  assert.equal(ineligible({ shortDescription: 'Remove a load-bearing wall' }).reason, 'NOT_ELIGIBLE');
  assert.equal(ineligible({ shortDescription: 'Stop an active leak under the sink' }).reason, 'NOT_ELIGIBLE');
  assert.equal(ineligible({ title: 'Scrape asbestos tiles' }).reason, 'NOT_ELIGIBLE');
});

test('too many steps is refused (the outline holds 40)', () => {
  const many = Array.from({ length: 41 }, (_, i) => ({ stepNumber: i + 1, title: `Step ${i + 1}`, description: 'x', isOptional: false }));
  assert.equal(refused({ revision: revisionRow({}, template({ steps: many })) }).reason, 'TOO_MANY_STEPS');
  const forty = Array.from({ length: 40 }, (_, i) => ({ stepNumber: i + 1, title: `Step ${i + 1}`, description: 'x', isOptional: false }));
  assert.equal(evaluate({ revision: revisionRow({}, template({ steps: forty })) }).kind, 'GUIDE');
});

// ---- the strict step rule (plan 3.2.1) -------------------------------------------------------------------------------------------------------------

test('STRICT STEP RULE: every way of not being exactly the reviewed steps is refused as a whole, naming fields never text', () => {
  const revision = revisionRow();
  const base = () => stepsFor(revision);
  const cases = {
    'a missing step id': (s) => { s[1].templateStepId = null; },
    'a duplicate id': (s) => { s[1].templateStepId = s[0].templateStepId; },
    "a foreign id (another revision's)": (s) => { s[2].templateStepId = stepSnapshotId('rev-other', 7); },
    'ids that pair in a different order': (s) => { [s[0].templateStepId, s[1].templateStepId] = [s[1].templateStepId, s[0].templateStepId]; },
    'a missing step': (s) => { s.pop(); },
    'an extra step': (s) => { s.push({ ...s[0], id: 'extra', templateStepId: stepSnapshotId('rev-1', 99), stepNumber: 99 }); },
    'a renumbered step': (s) => { s[2].stepNumber = 8; },
    'a one-character title change': (s) => { s[0].title += '.'; },
    'a one-character description change': (s) => { s[1].description = s[1].description.replace('Brush', 'Brusb'); },
    'a changed estimate': (s) => { s[2].estimatedMinutes = 61; },
    'a flipped optional flag': (s) => { s[3].isOptional = false; },
    'an altered safety note': (s) => { s[0].safetyNote = 'Keep a window closed while you work.'; },
    'a removed safety note': (s) => { s[0].safetyNote = null; },
    'a changed tip': (s) => { s[0].tipNote = 'Press lightly.'; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const steps = base(); mutate(steps);
    const e = refused({ revision, steps });
    assert.equal(e.reason, 'STEPS_NOT_FROM_REVISION', name);
    assert.ok(e.mismatches.length > 0, name);
    assert.ok(!JSON.stringify(e).includes('Brusb') && !JSON.stringify(e).includes('Keep a window closed'), `${name}: no step text in the result`);
  }
  // Progress is not compared: other statuses (and notes, which are not even copied here) leave the match intact.
  const progressed = stepsFor(revision, { 1: 'COMPLETED', 3: 'IN_PROGRESS', 9: 'SKIPPED' });
  assert.equal(evaluate({ revision, steps: progressed }).kind, 'GUIDE');
  assert.deepEqual(guide.stepMismatches(base(), revision), []);
  const reordered = base().reverse();
  assert.deepEqual(guide.stepMismatches(reordered, revision), [], 'the match is by authored order, not by the order the rows were read in');
});

// ---- the stale-source rule (3.3) -------------------------------------------------------------------------------------------------------------------

test('STALE SOURCE: withdrawn vs superseded (a superseded revision is retired, and that alone is NOT withdrawn)', () => {
  const retired = (reason) => revisionRow({ retiredAt: NOW, retiredReason: reason });
  assert.equal(evaluate({ revision: retired('UNPUBLISHED'), head: { publishedRevisionId: null } }).sourceState, 'WITHDRAWN');
  assert.equal(evaluate({ revision: retired('ARCHIVED'), head: { publishedRevisionId: 'rev-9' } }).sourceState, 'WITHDRAWN', 'archived is withdrawn even if another head exists');
  assert.equal(evaluate({ revision: retired('SUPERSEDED'), head: { publishedRevisionId: 'rev-2' } }).sourceState, 'SUPERSEDED');
  assert.equal(evaluate({ head: { publishedRevisionId: 'rev-2' } }).sourceState, 'SUPERSEDED', 'a newer head with the project\'s revision not yet marked retired');
  assert.equal(evaluate({ head: { publishedRevisionId: null } }).sourceState, 'WITHDRAWN', 'the template is no longer published');
  assert.equal(evaluate({ head: null }).sourceState, 'WITHDRAWN', 'the template is gone');
  assert.equal(evaluate({}).sourceState, 'CURRENT');
});

// ---- progress arithmetic (3.4) ---------------------------------------------------------------------------------------------------------------------

test('PROGRESS: the one-based position in the sorted outline (not the raw step number), completed counts only COMPLETED, skipped is separate', () => {
  const rows = (statuses) => [1, 3, 7, 9].map((n, i) => ({ id: `s${n}`, stepNumber: n, status: statuses[i], title: `Step ${n}`, isOptional: n === 9 }));
  const a = guide.projectGuideProgress(rows(['COMPLETED', 'PENDING', 'PENDING', 'PENDING']), NOW);
  assert.deepEqual(a.progress, { current: 2, total: 4, completed: 1, skipped: 0, label: 'Step 2 of 4, 1 done', asOf: NOW.toISOString() }, 'step number 3 is position 2');
  assert.equal(a.outline.find((e) => e.state === 'CURRENT').stepId, 's3');
  const b = guide.projectGuideProgress(rows(['COMPLETED', 'SKIPPED', 'IN_PROGRESS', 'PENDING']), NOW);
  assert.deepEqual([b.progress.current, b.progress.completed, b.progress.skipped, b.progress.label], [3, 1, 1, 'Step 3 of 4, 1 done, 1 skipped']);
  assert.deepEqual(b.outline.map((e) => e.state), ['DONE', 'SKIPPED', 'CURRENT', 'UPCOMING']);
  const c = guide.projectGuideProgress(rows(['COMPLETED', 'COMPLETED', 'COMPLETED', 'SKIPPED']), NOW);
  assert.equal(c.progress, null, 'every step resolved: no current step'); assert.equal(c.currentIndex, -1);
  const d = guide.projectGuideProgress(rows(['SKIPPED', 'PENDING', 'PENDING', 'PENDING']), NOW);
  assert.equal(d.progress.label, 'Step 2 of 4, 0 done, 1 skipped');
  const reopened = guide.projectGuideProgress(rows(['IN_PROGRESS', 'COMPLETED', 'PENDING', 'PENDING']), NOW);
  assert.equal(reopened.progress.current, 1, 'reopening an earlier step moves "current" back');
  const optionalFirst = guide.projectGuideProgress([{ id: 'a', stepNumber: 1, status: 'PENDING', title: 'Optional first', isOptional: true }, { id: 'b', stepNumber: 2, status: 'PENDING', title: 'Required', isOptional: false }], NOW);
  assert.equal(optionalFirst.outline[0].state, 'CURRENT', 'an optional step can be the current step');
});

// ---- the answer ------------------------------------------------------------------------------------------------------------------------------------

function guideBlocks(input = {}) {
  const src = source(input); const evaluation = guide.evaluateProjectGuide(src);
  assert.equal(evaluation.kind, 'GUIDE');
  return guide.buildProjectGuideBlocks({ source: src, evaluation, propertyId: 'prop-1', asOf: NOW });
}

test('the guide: every block parses against the real contract; the safety note is a CAUTION boundary immediately before the TASK_GUIDE; progress and outline are declared', () => {
  const blocks = guideBlocks();
  for (const block of blocks) AskPresentationBlockSchema.parse(block);
  assert.deepEqual(blocks.map((b) => b.type), ['BOUNDARY', 'TASK_GUIDE', 'BOUNDARY']);
  assert.deepEqual([blocks[0].id, blocks[0].severity, blocks[0].body], ['diy-step-safety', 'CAUTION', 'Keep a window open while you work.']);
  const taskGuide = blocks[1];
  assert.equal(taskGuide.progress.label, 'Step 1 of 4, 0 done');
  assert.deepEqual(taskGuide.outline.map((e) => [e.title, e.state, e.optional]), [['Tape the trim', 'CURRENT', false], ['Cut in the edges', 'UPCOMING', false], ['Roll the walls', 'UPCOMING', false], ['Touch up', 'UPCOMING', true]]);
  assert.deepEqual([taskGuide.main.title, taskGuide.tip.body], ['Tape the trim', 'Press the tape edge down firmly.']);
  assert.deepEqual(taskGuide.actions.map((a) => [a.id, a.href]), [['open-diy-project', '/dashboard/diy/projects/p1?propertyId=prop-1']]);
  assert.ok(taskGuide.actions.every((a) => !a.interactionType), 'no step-advancing or workflow action in this step');
});

test('no safety block when the current step has none; the safety note follows the CURRENT step, not the first', () => {
  const noSafety = guideBlocks({ steps: stepsFor(revisionRow(), { 1: 'COMPLETED' }) });
  assert.deepEqual(noSafety.map((b) => b.type), ['TASK_GUIDE', 'BOUNDARY']);
  assert.equal(noSafety[0].main.title, 'Cut in the edges');
});

test('a withdrawn guide keeps its snapshot readable behind a caution boundary; a superseded one only discloses; neither adds an advancing action', () => {
  const withdrawn = guideBlocks({ revision: revisionRow({ retiredAt: NOW, retiredReason: 'UNPUBLISHED' }), head: { publishedRevisionId: null } });
  assert.deepEqual(withdrawn.map((b) => b.id), ['diy-guide-withdrawn', 'diy-step-safety', 'diy-project-guide', 'diy-project-guide-boundary']);
  assert.equal(withdrawn[0].severity, 'CAUTION'); assert.match(withdrawn[0].body, /withdrawn/);
  const superseded = guideBlocks({ head: { publishedRevisionId: 'rev-2' } });
  assert.equal(superseded[0].id, 'diy-guide-corrected'); assert.equal(superseded[0].severity, 'INFO');
  assert.match(superseded[0].body, /corrected version of this guide is available/);
  for (const blocks of [withdrawn, superseded]) for (const block of blocks) AskPresentationBlockSchema.parse(block);
});

test('every step resolved while the project is open: a summary pointing at the page, no guide block', () => {
  const resolved = guideBlocks({ steps: stepsFor(revisionRow(), { 1: 'COMPLETED', 3: 'COMPLETED', 7: 'COMPLETED', 9: 'SKIPPED' }) });
  assert.deepEqual(resolved.map((b) => b.type), ['SUMMARY']);
  assert.match(resolved[0].body, /Every step is resolved\. Finish the project on the project page\./);
});

test('over-long step text is shortened to the contract limits and says so, never silently cut', () => {
  const longTpl = template(); longTpl.steps[0].description = 'a'.repeat(900); longTpl.steps[0].tipNote = 'b'.repeat(500);
  const blocks = guideBlocks({ revision: revisionRow({}, longTpl) });
  for (const block of blocks) AskPresentationBlockSchema.parse(block);
  const g = blocks.find((b) => b.type === 'TASK_GUIDE');
  assert.equal(g.main.body.length, 800); assert.ok(g.main.body.endsWith('…'));
  assert.deepEqual(g.notes.map((n) => n.title), ['Longer on the page']);
});

test('refusal and not-found answers parse, carry the page link, and the finished summary says how the project ended', () => {
  const reasons = ['AI_GUIDE_PROJECT', 'NOT_TEMPLATE_PROJECT', 'NO_REVISION', 'NOT_REVIEWED', 'REVISION_INTEGRITY', 'NOT_ELIGIBLE', 'TOO_MANY_STEPS', 'STEPS_NOT_FROM_REVISION'];
  for (const reason of reasons) {
    const blocks = guide.refusalBlocks(reason, source(), 'prop-1', 'p1');
    for (const block of blocks) AskPresentationBlockSchema.parse(block);
    assert.equal(blocks[0].actions[0].href, '/dashboard/diy/projects/p1?propertyId=prop-1', reason);
  }
  const finished = (status, completionBasis) => guide.refusalBlocks('PROJECT_FINISHED', source({ project: { status, completionBasis } }), 'prop-1', 'p1')[0].body;
  assert.equal(finished('COMPLETED', null), 'This project is finished.');
  assert.equal(finished('COMPLETED', 'LINKED_TASK'), 'Closed because your linked task was completed.');
  assert.equal(finished('HIRED_OUT', 'LINKED_TASK'), 'Closed because a pro completed your linked task.');
  assert.equal(finished('ABANDONED', null), 'This project was stopped.');
  const notFound = guide.projectNotFoundBlocks('prop-1');
  AskPresentationBlockSchema.parse(notFound[0]);
  assert.equal(notFound[0].actions[0].href, '/dashboard/properties/prop-1/tools/diy');
});

test('TRUST PIPELINE: the final, validated sequence keeps the caution boundary immediately before the guide and keeps the guide and its page action', () => {
  const guideResult = withEvidence('DIY_PROJECT_GUIDE', { status: 'ANSWERED', reasonCode: 'DIY_PROJECT_GUIDE_READY', blocks: guideBlocks(), suggestions: [] });
  const { result, trust } = validateAskAnswerTrust({ question: 'Guide me through this project.', operationId: 'DIY_PROJECT_GUIDE', result: guideResult, propertyId: 'prop-1' });
  const types = result.blocks.map((b) => b.type);
  const at = types.indexOf('TASK_GUIDE');
  assert.ok(at > 0, 'the guide survived validation');
  assert.deepEqual([result.blocks[at - 1].type, result.blocks[at - 1].id, result.blocks[at - 1].severity], ['BOUNDARY', 'diy-step-safety', 'CAUTION'], 'adjacency holds in the FINAL sequence');
  assert.deepEqual(result.blocks[at].actions.map((a) => a.id), ['open-diy-project'], 'the page action survived the action allow-list');
  assert.equal(result.blocks[at].progress.label, 'Step 1 of 4, 0 done');
  assert.ok(trust.outcome !== 'BLOCK', JSON.stringify(trust));
  for (const [name, blocks] of [['withdrawn', guideBlocks({ revision: revisionRow({ retiredAt: NOW, retiredReason: 'UNPUBLISHED' }), head: { publishedRevisionId: null } })], ['superseded', guideBlocks({ head: { publishedRevisionId: 'rev-2' } })]]) {
    const validated = validateAskAnswerTrust({ question: 'Guide me through this project.', operationId: 'DIY_PROJECT_GUIDE', result: withEvidence('DIY_PROJECT_GUIDE', { ...guideResult, blocks }), propertyId: 'prop-1' }).result;
    assert.deepEqual(validated.blocks.map((b) => b.id), blocks.map((b) => b.id), `${name}: no boundary or action was stripped`);
  }
  const refusal = validateAskAnswerTrust({ question: 'Guide me through this project.', operationId: 'DIY_PROJECT_GUIDE', result: withEvidence('DIY_PROJECT_GUIDE', { status: 'ANSWERED', reasonCode: 'DIY_GUIDE_AI_GUIDE_PROJECT', blocks: guide.refusalBlocks('AI_GUIDE_PROJECT', source(), 'prop-1', 'p1'), suggestions: [] }), propertyId: 'prop-1' }).result;
  assert.equal(refusal.blocks[0].actions[0].id, 'open-diy-project', 'the refusal keeps its page link');
});

test('a TASK_GUIDE without the new fields (every existing producer, every stored execution) parses unchanged and adds no keys', () => {
  const old = { type: 'TASK_GUIDE', id: 'g', title: 'T', summary: 'S', eyebrow: [], icon: 'TASK', chips: [], tip: null, main: null, history: [], notes: [], actions: [] };
  const parsed = AskPresentationBlockSchema.parse(old);
  assert.equal('progress' in parsed, false); assert.equal('outline' in parsed, false);
  assert.throws(() => AskPresentationBlockSchema.parse({ ...old, outline: Array.from({ length: 41 }, (_, i) => ({ stepId: `s${i}`, title: 't', state: 'UPCOMING' })) }), 'bounded at 40');
  assert.throws(() => AskPresentationBlockSchema.parse({ ...old, progress: { current: 0, total: 3, completed: 0, skipped: 0, label: 'x', asOf: 'y' } }), 'current is one-based');
});

// ---- the handler, on the shared fake, with a write spy ---------------------------------------------------------------------------------------------

function harness(hooks = {}) {
  const db = makeDiyDb([], hooks);
  const stub = (relative, exports) => { const resolved = require.resolve(relative); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports }; };
  stub('../../src/lib/prisma.ts', { prisma: db });
  stub('../../src/lib/logger.ts', { logger: { info() {}, warn(...args) { warnings.push(args); }, error() {} }, auditLog() {}, redactEmail: (value) => value });
  stub('../../src/modules/propertyContext/index.ts', { getPropertyContext: async () => ({}) });
  stub('../../src/services/diy/applicabilityPolicy.ts', { evaluateDiyApplicability: () => ({ status: 'APPLICABLE' }) });
  for (const f of ['../../src/services/diy.service.ts', '../../src/services/ask/handlers/diyProjectGuide.handler.ts']) delete require.cache[require.resolve(f)];
  const handler = require('../../src/services/ask/handlers/diyProjectGuide.handler.ts');
  return { db, state: db.state, handler };
}
const warnings = [];
function seed(h, { revision = revisionRow(), project = {}, templateHead } = {}) {
  h.state.revisions.push(structuredClone(revision));
  h.state.templates.set('t1', { id: 't1', status: 'ACTIVE', publishedRevisionId: templateHead === undefined ? revision.id : templateHead, steps: [], materials: [], tools: [] });
  const src = source({ revision, project });
  h.state.projects.push({ ...src.project, propertyId: 'prop-1', userId: 'creator', updatedAt: new Date('2026-10-06T12:00:00Z'), materials: [], tools: [], aiGuide: null });
}
const launch = (entityType, entityId) => ({ entityType, entityId });
const snapshot = (h) => JSON.stringify({ projects: h.state.projects, revisions: h.state.revisions, events: h.state.events, domainEvents: h.state.domainEvents, writes: h.state.writes });

test('THE HANDLER WRITES NOTHING, in every branch (a spy over every write the fake records, plus a before and after of all state)', async () => {
  const branches = {
    guided: () => { const h = harness(); seed(h); return [h, launch('DIY_PROJECT', 'p1')]; },
    withdrawn: () => { const h = harness(); seed(h, { revision: revisionRow({ retiredAt: NOW, retiredReason: 'UNPUBLISHED' }), templateHead: null }); return [h, launch('DIY_PROJECT', 'p1')]; },
    aiGuide: () => { const h = harness(); seed(h, { project: { aiGuideId: 'g1' } }); return [h, launch('DIY_PROJECT', 'p1')]; },
    mismatch: () => { const h = harness(); seed(h); h.state.projects[0].steps[0].title = 'Changed'; return [h, launch('DIY_PROJECT', 'p1')]; },
    finished: () => { const h = harness(); seed(h, { project: { status: 'COMPLETED' } }); return [h, launch('DIY_PROJECT', 'p1')]; },
    notFound: () => { const h = harness(); seed(h); return [h, launch('DIY_PROJECT', 'nope')]; },
    wrongEntityType: () => { const h = harness(); seed(h); return [h, launch('GUIDANCE_JOURNEY', 'p1')]; },
    noLaunch: () => { const h = harness(); seed(h); return [h, undefined]; },
  };
  for (const [name, make] of Object.entries(branches)) {
    const [h, ctx] = make(); const before = snapshot(h);
    const result = await h.handler.diyProjectGuideResult('prop-1', ctx, NOW);
    assert.equal(snapshot(h), before, `${name}: nothing changed`);
    assert.equal(h.state.writes.length, 0, `${name}: no write recorded`);
    assert.ok(result.blocks.length > 0);
    for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
  }
});

test('the handler end to end: reason codes, a project in another property is "couldn\'t find" with no data, and a viewer gets the same guide (the floor is VIEWER)', async () => {
  const h = harness(); seed(h);
  const ready = await h.handler.diyProjectGuideResult('prop-1', launch('DIY_PROJECT', 'p1'), NOW);
  assert.equal(ready.reasonCode, 'DIY_PROJECT_GUIDE_READY');
  assert.equal(ready.blocks.find((b) => b.type === 'TASK_GUIDE').progress.label, 'Step 1 of 4, 0 done');
  const other = await h.handler.diyProjectGuideResult('some-other-property', launch('DIY_PROJECT', 'p1'), NOW);
  assert.equal(other.reasonCode, 'DIY_GUIDE_PROJECT_NOT_FOUND');
  assert.ok(!JSON.stringify(other).includes('Repaint the hallway') && !JSON.stringify(other).includes('Tape the trim'), 'nothing about the project leaks across properties');
  assert.equal((await h.handler.diyProjectGuideResult('prop-1', launch('DIY_PROJECT', 'nope'), NOW)).reasonCode, 'DIY_GUIDE_PROJECT_NOT_FOUND');
  assert.equal((await h.handler.diyProjectGuideResult('prop-1', launch('GUIDANCE_JOURNEY', 'p1'), NOW)).reasonCode, 'DIY_GUIDE_PROJECT_NOT_FOUND', 'only the DIY_PROJECT entity type launches it');
  const def = require('../../src/services/ask/askOperationRegistry.ts').ASK_OPERATION_DEFINITIONS.DIY_PROJECT_GUIDE;
  assert.deepEqual([def.propertyRoleFloor, def.messageRoutable, def.adapterKey], ['VIEWER', false, 'diy.project-guide']);
});

test('a refusal for an altered step list is logged with field NAMES only, never the step text', async () => {
  warnings.length = 0;
  const h = harness(); seed(h); h.state.projects[0].steps[1].description = 'SECRET ALTERED TEXT';
  const result = await h.handler.diyProjectGuideResult('prop-1', launch('DIY_PROJECT', 'p1'), NOW);
  assert.equal(result.reasonCode, 'DIY_GUIDE_STEPS_NOT_FROM_REVISION');
  assert.ok(warnings.length >= 1);
  const logged = JSON.stringify(warnings);
  assert.match(logged, /description/); assert.doesNotMatch(logged, /SECRET ALTERED TEXT/);
  assert.ok(!JSON.stringify(result).includes('SECRET ALTERED TEXT'));
});

test('reopening a step moves "current" back on the next read (state is derived, nothing is remembered)', async () => {
  const h = harness(); seed(h);
  h.state.projects[0].steps.forEach((s) => { if (s.stepNumber < 7) s.status = 'COMPLETED'; });
  assert.equal((await h.handler.diyProjectGuideResult('prop-1', launch('DIY_PROJECT', 'p1'), NOW)).blocks.find((b) => b.type === 'TASK_GUIDE').progress.label, 'Step 3 of 4, 2 done');
  h.state.projects[0].steps.find((s) => s.stepNumber === 3).status = 'IN_PROGRESS';
  assert.equal((await h.handler.diyProjectGuideResult('prop-1', launch('DIY_PROJECT', 'p1'), NOW)).blocks.find((b) => b.type === 'TASK_GUIDE').progress.label, 'Step 2 of 4, 1 done');
});

// ---- the row action on DIY_PROJECTS ------------------------------------------------------------------------------------------------------------------

test('DIY_PROJECTS rows: only a project started from a reviewed template version offers "Guide me through this project", with the exact launch', () => {
  const { diyProjectsFromView } = require('../../src/services/ask/handlers/diyProjectCenter.handler.ts');
  const item = (id, extra) => ({ id, title: id, category: 'PAINTING', status: 'IN_PROGRESS', decisionVerdict: null, requiredStepCount: 3, completedStepCount: 1, templateId: 't1', aiGuideId: null, templateRevisionId: 'rev-1', ...extra });
  const result = diyProjectsFromView({ items: [item('reviewed'), item('ai', { aiGuideId: 'g1' }), item('legacy', { templateRevisionId: null }), item('custom', { templateId: null, templateRevisionId: null })], nextCursor: undefined }, 'prop-1');
  const rows = result.blocks.find((b) => b.type === 'GROUPED_LIST').sections[0].items;
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  assert.deepEqual(byId.reviewed.actions, [{ id: 'guide-diy-project', label: 'Guide me through this project', message: 'Guide me through this project.', style: 'SECONDARY', interactionType: 'CONVERSATION_CONTINUE', operationId: 'DIY_PROJECT_GUIDE' }]);
  assert.equal(byId.reviewed.entityType, 'DIY_PROJECT');
  for (const id of ['ai', 'legacy', 'custom']) { assert.equal(byId[id].actions, undefined, id); assert.equal(byId[id].entityType, undefined, id); }
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
  const validated = validateAskAnswerTrust({ question: 'Show my DIY projects', operationId: 'DIY_PROJECTS', result: withEvidence('DIY_PROJECTS', result), propertyId: 'prop-1' }).result;
  assert.equal(validated.blocks.find((b) => b.type === 'GROUPED_LIST').sections[0].items.find((r) => r.id === 'reviewed').actions.length, 1, 'the row action survives the trust pipeline');
});

// ---- registry and boundaries ---------------------------------------------------------------------------------------------------------------------------

test('the operation is launch-only and read-only in the registry, the skill, the coverage matrix and the adapter list', () => {
  const { ASK_OPERATION_DEFINITIONS, isAskMessageRoutableOperation } = require('../../src/services/ask/askOperationRegistry.ts');
  const def = ASK_OPERATION_DEFINITIONS.DIY_PROJECT_GUIDE;
  assert.equal(isAskMessageRoutableOperation('DIY_PROJECT_GUIDE'), false);
  assert.deepEqual([def.family, def.propertyRoleFloor, def.allowedBlockTypes], ['RECORD_QUERY', 'VIEWER', ['SUMMARY', 'TASK_GUIDE', 'EMPTY_STATE', 'BOUNDARY']]);
  const { DIY_SKILL } = require('../../src/services/skills/diy/skill.manifest.ts');
  // Step 6 moved the SKILL to write effects (DIY_STEP_UPDATE); this operation itself stays a launch-only read.
  assert.deepEqual([DIY_SKILL.autonomyLevel, DIY_SKILL.riskPolicy.effects], [2, ['READ', 'WRITE']], 'the skill now carries the step command');
  assert.ok(DIY_SKILL.allowedResultBlocks.includes('TASK_GUIDE'));
  const { ASK_LAUNCH_ONLY_READ_OPERATION_IDS } = require('../../src/services/ask/askInteractionCoverageMatrix.ts');
  assert.ok(ASK_LAUNCH_ONLY_READ_OPERATION_IDS.has('DIY_PROJECT_GUIDE'));
});

test('the guide source read and the handler contain no write call (source scan), and createProject shares the eligibility mapping', () => {
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, '../../src', rel), 'utf8');
  const handler = read('services/ask/handlers/diyProjectGuide.handler.ts');
  const pure = read('services/diy/projectGuide.ts');
  const service = read('services/diy.service.ts');
  const sourceRead = service.slice(service.indexOf('async getProjectGuideSource('), service.indexOf('async getProjectWithCompletionEffects('));
  for (const text of [handler, pure, sourceRead]) assert.doesNotMatch(text, /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$transaction|\$executeRaw|emit\(/);
  assert.match(service, /evaluateDiyEligibility\(eligibilityInputFromRevision\(revision, payload\.decisionVerdict\)\)/);
  assert.match(pure, /evaluateDiyEligibility\(eligibilityInputFromRevision\(/);
});
