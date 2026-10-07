const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Step 6 of the stateful GUIDE, slice 6a (docs/architecture/ASK_COZY_DIY_STEP_COMMANDS_PLAN.md): DIY_STEP_UPDATE. The real registered handlers run against the shared
// database-free DIY fake (serialized transactions with rollback) with property access replaced. Not Postgres, not a browser.
const { makeDiyDb } = require('../helpers/diyTemplateFake.js');
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { buildRevisionContent, computeContentHash } = require('../../src/services/diyTemplateRevision.service.ts');
const { stepSnapshotId } = require('../../src/services/diyPublishedTemplate.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { ASK_OPERATION_DEFINITIONS, isAskMessageRoutableOperation, getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { diyService } = require('../../src/services/diy.service.ts');
const { diyProjectGuideResult } = require('../../src/services/ask/handlers/diyProjectGuide.handler.ts');
const guide = require('../../src/services/diy/projectGuide.ts');
const policy = require('../../src/services/diy/askStepPolicy.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const T0 = new Date('2026-10-06T12:00:00.000Z');
const NOW = new Date('2026-10-06T13:00:00.000Z');
const template = () => ({
  id: 't1', slug: 'repaint-hallway', title: 'Repaint a hallway', shortDescription: 'Fresh coat of paint.', longDescription: 'Longer text.', category: 'PAINTING',
  difficultyLevel: 'EASY', requiredSkillLevel: 'BEGINNER', safetyLevel: 'LOW', permitRequirement: 'NOT_REQUIRED', estimatedMinutes: 120, tags: ['paint'],
  steps: [
    { stepNumber: 1, title: 'Tape the trim', description: 'Apply painter tape along the trim.', estimatedMinutes: 20, isOptional: false, safetyNote: 'Keep a window open while you work.', tipNote: null },
    { stepNumber: 2, title: 'Cut in the edges', description: 'Brush the corners first.', estimatedMinutes: 30, isOptional: false, safetyNote: null, tipNote: null },
    { stepNumber: 3, title: 'Touch up', description: 'Fix any misses.', estimatedMinutes: 10, isOptional: true, safetyNote: null, tipNote: null },
    { stepNumber: 4, title: 'Wipe the tools', description: 'Clean the brushes.', estimatedMinutes: 10, isOptional: true, safetyNote: 'Wear gloves.', tipNote: null },
  ],
  materials: [], tools: [],
});
const revisionRow = () => {
  const content = buildRevisionContent(template());
  return { id: 'rev-1', templateId: 't1', revision: 1, provenance: 'GOVERNED', ...content.columns, contentJson: content.contentJson, contentHash: computeContentHash(content), retiredAt: null, retiredReason: null };
};
const stepRows = (revision) => revision.contentJson.steps.map((step, i) => ({
  id: `s${i + 1}`, stepNumber: step.stepNumber, templateStepId: stepSnapshotId(revision.id, step.stepNumber), title: step.title, description: step.description,
  estimatedMinutes: step.estimatedMinutes ?? null, isOptional: step.isOptional, safetyNote: step.safetyNote ?? null, tipNote: step.tipNote ?? null,
  status: 'PENDING', notes: null, completedAt: null, completedByUserId: null, updatedAt: new Date(T0.getTime() + step.stepNumber),
}));

const original = { prisma: prismaModule.prisma, resolveAccess: propertyAccess.resolvePropertyAccess, source: diyService.getProjectGuideSource };
let db; let role; let dbRole;
function install() {
  role = 'CONTRIBUTOR'; dbRole = 'CONTRIBUTOR'; // what Ask's own access check sees, and what the service's in-transaction check sees
  db = makeDiyDb([], { role: () => dbRole });
  db.askExecution = { findMany: async () => [] };
  const revision = revisionRow();
  db.state.revisions.push(revision);
  db.state.templates.set('t1', { id: 't1', publishedRevisionId: 'rev-1', steps: [], materials: [], tools: [] });
  db.state.projects.push({
    id: 'p1', propertyId: 'prop-1', userId: 'creator', title: 'Repaint the hallway', category: 'PAINTING', templateId: 't1', templateRevisionId: 'rev-1', aiGuideId: null, completionBasis: null,
    maintenanceTaskId: null, status: 'PLANNING', startedAt: null, completedAt: null, completedByUserId: null, notesJson: null, updatedAt: T0, materials: [], tools: [], aiGuide: null,
    steps: stepRows(revision),
  });
  prismaModule.prisma = db;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
}
function restore() {
  prismaModule.prisma = original.prisma;
  propertyAccess.resolvePropertyAccess = original.resolveAccess;
  diyService.getProjectGuideSource = original.source;
}
test.beforeEach(install);
test.afterEach(restore);

const stepRow = (id) => db.state.projects[0].steps.find((row) => row.id === id);
const setStatus = (...pairs) => pairs.forEach(([id, status]) => { stepRow(id).status = status; });
const DONE_1_2 = [['s1', 'COMPLETED'], ['s2', 'COMPLETED']];
const launch = (key, stepId, overrides = {}) => ({
  surface: 'ASK_WORKSPACE', entityType: 'DIY_STEP', entityId: stepId, operationId: 'DIY_STEP_UPDATE', actionId: key, sourceExecutionId: 'exec-guide', ...overrides,
});
const MESSAGES = { COMPLETE: 'Mark this step done.', SKIP: 'Skip this step.', REOPEN: 'Reopen this step.' };
const propose = (key, stepId, launchOverrides, message = MESSAGES[key], propertyId = 'prop-1') =>
  capabilityInvoke('DIY_STEP_UPDATE', { userId: 'u1', propertyId, message, launchContext: launch(key, stepId, launchOverrides) });
const execution = () => ({ id: 'exec-1', propertyId: 'prop-1', sessionId: 's1', userId: 'u1', operationId: 'DIY_STEP_UPDATE', createdAt: new Date() });
const confirm = (parameters, asRole = 'CONTRIBUTOR') => confirmCapabilityInvoke('DIY_STEP_UPDATE', {
  userId: 'u1', execution: execution(), parameters, access: { role: asRole }, command: getAskDomainCommandByOperation('DIY_STEP_UPDATE'),
});
const codeOf = async (promise) => { try { await promise; return null; } catch (error) { return error.code ?? `NO_CODE:${error.message}`; } };
const guideLaunch = { surface: 'ASK_WORKSPACE', entityType: 'DIY_PROJECT', entityId: 'p1' };
// The actions that CHANGE a step (the read-only navigation actions, like Previous step, are separate and visible to everyone).
const CHANGES = new Set(['diy-step-complete', 'diy-step-skip', 'diy-step-reopen']);
const actionsOf = (result) => result.blocks.flatMap((block) => block.actions ?? []);
const committedState = () => JSON.stringify([db.state.projects[0].status, db.state.projects[0].updatedAt, db.state.projects[0].steps.map((s) => [s.id, s.status, s.updatedAt]), db.state.events.length, db.state.domainEvents.length]);

// ---- the actions on the guide card ---------------------------------------------------------------------------------------------------------------------

test('the card carries Mark done for the current step; Skip only when it is optional with no safety note; each action is exactly declared', async () => {
  const first = await diyProjectGuideResult('prop-1', guideLaunch, NOW, true);
  const complete = first.blocks.find((b) => b.type === 'TASK_GUIDE').actions.filter((a) => CHANGES.has(a.id));
  assert.deepEqual(complete, [{ id: 'diy-step-complete', label: 'Mark this step done', interactionType: 'START_WORKFLOW', message: 'Mark this step done.', operationId: 'DIY_STEP_UPDATE', entityType: 'DIY_STEP', entityId: 's1', actionId: 'COMPLETE', style: 'PRIMARY' }]);
  setStatus(...DONE_1_2); // step 3: optional, no safety note
  const third = (await diyProjectGuideResult('prop-1', guideLaunch, NOW, true)).blocks.find((b) => b.type === 'TASK_GUIDE').actions;
  assert.deepEqual(third.filter((a) => CHANGES.has(a.id)).map((a) => [a.id, a.entityId, a.actionId, a.message, a.style]), [['diy-step-complete', 's3', 'COMPLETE', 'Mark this step done.', 'PRIMARY'], ['diy-step-skip', 's3', 'SKIP', 'Skip this step.', 'QUIET']]);
  setStatus(['s3', 'SKIPPED']); // step 4: optional BUT carries a safety note
  const fourth = (await diyProjectGuideResult('prop-1', guideLaunch, NOW, true)).blocks.find((b) => b.type === 'TASK_GUIDE').actions;
  assert.deepEqual(fourth.filter((a) => CHANGES.has(a.id)).map((a) => a.id), ['diy-step-complete']);
  for (const result of [first]) for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
});

test('no step action for a viewer, a default call, a withdrawn guide or a finished project; the page link always remains', async () => {
  const noAdvance = (result) => assert.deepEqual(actionsOf(result).filter((a) => CHANGES.has(a.id)), []);
  noAdvance(await diyProjectGuideResult('prop-1', guideLaunch, NOW));
  noAdvance(await diyProjectGuideResult('prop-1', guideLaunch, NOW, false));
  db.state.templates.get('t1').publishedRevisionId = null; // withdrawn
  const withdrawn = await diyProjectGuideResult('prop-1', guideLaunch, NOW, true);
  noAdvance(withdrawn);
  assert.ok(actionsOf(withdrawn).some((a) => a.id === 'open-diy-project'));
  db.state.templates.get('t1').publishedRevisionId = 'rev-1';
  db.state.projects[0].status = 'COMPLETED';
  noAdvance(await diyProjectGuideResult('prop-1', guideLaunch, NOW, true));
});

test('the REGISTERED guide handler reads the role per request: a contributor gets the actions, a viewer does not', async () => {
  const run = () => capabilityInvoke('DIY_PROJECT_GUIDE', { userId: 'u1', propertyId: 'prop-1', message: 'x', launchContext: guideLaunch });
  role = 'CONTRIBUTOR';
  assert.ok(actionsOf(await run()).some((a) => a.id === 'diy-step-complete'));
  role = 'OWNER';
  assert.ok(actionsOf(await run()).some((a) => a.id === 'diy-step-complete'));
  role = 'VIEWER';
  assert.deepEqual(actionsOf(await run()).filter((a) => CHANGES.has(a.id)), []);
});

// ---- the trust pipeline: the FINAL sequence --------------------------------------------------------------------------------------------------------------

const validate = (operationId, result, householdRole) => validateAskAnswerTrust({
  question: 'q', operationId, propertyId: 'prop-1',
  result: { ...result, parameters: { ...(result.parameters ?? {}), audiencePresentation: { householdRole }, answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: getAskOperationDefinition(operationId).adapterKey, operationId, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: new Date().toISOString() }] } } },
}).result;

test('after trust validation every answer with an advancing action has the safety block directly before the card; the actions survive the allow-list', async () => {
  const result = await diyProjectGuideResult('prop-1', guideLaunch, NOW, true);
  const final = validate('DIY_PROJECT_GUIDE', result, 'OWNER');
  const index = final.blocks.findIndex((b) => b.type === 'TASK_GUIDE');
  assert.ok(actionsOf({ blocks: [final.blocks[index]] }).some((a) => a.id === 'diy-step-complete'), 'the allow-listed action survives');
  assert.equal(final.blocks[index - 1].id, 'diy-step-safety', 'the safety note is the block directly above the card that carries the action');
  // And with no note on the current step there is nothing to place before it, and the actions still stand.
  setStatus(...DONE_1_2);
  const noNote = validate('DIY_PROJECT_GUIDE', await diyProjectGuideResult('prop-1', guideLaunch, NOW, true), 'OWNER');
  assert.ok(actionsOf({ blocks: noNote.blocks.filter((b) => b.type === 'TASK_GUIDE') }).some((a) => a.id === 'diy-step-skip'));
  assert.equal(noNote.blocks.some((b) => b.id === 'diy-step-safety'), false);
});

test('defense in depth: even if a producer emitted the actions for a viewer, the final answer has none', async () => {
  const emitted = await diyProjectGuideResult('prop-1', guideLaunch, NOW, true); // a "producer mistake": the actions are present
  assert.ok(actionsOf(emitted).some((a) => a.id === 'diy-step-complete'));
  const forViewer = validate('DIY_PROJECT_GUIDE', emitted, 'VIEWER');
  assert.deepEqual(actionsOf(forViewer).filter((a) => CHANGES.has(a.id)), []);
  setStatus(...DONE_1_2);
  const withSkip = validate('DIY_PROJECT_GUIDE', await diyProjectGuideResult('prop-1', guideLaunch, NOW, true), 'VIEWER');
  assert.deepEqual(actionsOf(withSkip).filter((a) => CHANGES.has(a.id)), [], 'Skip this step is filtered too: skip is now on the verb list');
  const { isAskActionAllowedForHouseholdRole } = require('../../src/services/ask/askAudiencePresentation.ts');
  for (const label of ['Skip this step', 'Skip', 'Reopen step', 'Mark this step done']) assert.equal(isAskActionAllowedForHouseholdRole({ id: 'x', label, style: 'QUIET' }, 'VIEWER'), false, label);
  assert.equal(isAskActionAllowedForHouseholdRole({ id: 'x', label: 'Skip this step', style: 'QUIET' }, 'CONTRIBUTOR'), true);
});

// ---- propose ------------------------------------------------------------------------------------------------------------------------------------

test('typed wording, a near-miss, a refresh, a wrong action id and a foreign launch never write and never open a confirmation', async () => {
  const before = committedState();
  const refused = async (result, code) => { assert.equal(result.status, 'NOT_APPLICABLE', code); assert.equal(result.reasonCode, code); assert.ok(!result.confirmation); assert.equal(result.blocks[0].id, 'diy-step-boundary'); };
  await refused(await propose('COMPLETE', 's1', {}, 'mark step 1 as done please'), 'DIY_STEP_NOT_DIRECTLY_ROUTABLE');
  await refused(await propose('COMPLETE', 's1', {}, 'Mark this step done'), 'DIY_STEP_NOT_DIRECTLY_ROUTABLE'); // missing the period: not the canned message
  await refused(await propose('COMPLETE', 's1', { surface: 'ASK_REFRESH' }), 'DIY_STEP_NOT_DIRECTLY_ROUTABLE');
  await refused(await propose('SKIP', 's1', {}, MESSAGES.COMPLETE), 'DIY_STEP_NOT_DIRECTLY_ROUTABLE'); // the action id says SKIP, the message says done
  await refused(await propose('COMPLETE', 's1', { operationId: 'DIY_PROJECT_GUIDE' }), 'DIY_STEP_NOT_DIRECTLY_ROUTABLE');
  await refused(await propose('COMPLETE', 's1', { entityType: 'DIY_PROJECT' }), 'DIY_STEP_NOT_DIRECTLY_ROUTABLE');
  await refused(await propose('COMPLETE', undefined, { entityId: undefined }), 'DIY_STEP_NOT_DIRECTLY_ROUTABLE');
  assert.equal(committedState(), before);
  for (const message of Object.values(MESSAGES)) {
    assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, 'DIY_STEP_UPDATE', message);
  }
});

test('propose refusals, each with a fixed boundary and nothing written', async () => {
  const before = committedState();
  const code = async (promise) => (await promise).reasonCode;
  role = 'VIEWER';
  // The registry's role floor answers first (CONTRIBUTOR); the handler's own viewer branch is a second layer behind it.
  assert.equal(await code(propose('COMPLETE', 's1')), 'ASK_PERMISSION_REQUIRED');
  role = 'CONTRIBUTOR';
  assert.equal(await code(propose('COMPLETE', 'nope')), 'DIY_STEP_NOT_FOUND');
  assert.equal(await code(propose('COMPLETE', 's1', {}, undefined, 'prop-2')), 'DIY_STEP_NOT_FOUND', 'a step of another property is "not available", with no detail');
  assert.equal(await code(propose('COMPLETE', 's2')), 'DIY_STEP_NOT_CURRENT');
  assert.equal(await code(propose('SKIP', 's1')), 'DIY_STEP_SKIP_REQUIRED');
  setStatus(...DONE_1_2, ['s3', 'SKIPPED']);
  assert.equal(await code(propose('SKIP', 's4')), 'DIY_STEP_SKIP_SAFETY');
  assert.equal(await code(propose('COMPLETE', 's1')), 'DIY_STEP_ALREADY_COMPLETED', 'a step already done answers "already", not a stale-card error');
  const mid = committedState();
  db.state.templates.get('t1').publishedRevisionId = null;
  assert.equal(await code(propose('COMPLETE', 's4')), 'DIY_STEP_GUIDE_NOT_CURRENT');
  db.state.templates.get('t1').publishedRevisionId = 'rev-1';
  db.state.projects[0].status = 'COMPLETED';
  assert.equal(await code(propose('COMPLETE', 's4')), 'DIY_STEP_PROJECT_FINISHED');
  db.state.projects[0].status = 'PLANNING';
  assert.equal(committedState(), mid);
  void before;
});

test('the confirmation: the step and project, the safety note repeated directly before the review, the version token, the canonical context version', async () => {
  const result = await propose('COMPLETE', 's1');
  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  assert.deepEqual(result.blocks.map((b) => b.id), ['diy-step-safety', 'diy-step-update-review']);
  assert.equal(result.blocks[0].body, 'Keep a window open while you work.');
  assert.deepEqual(result.confirmation.fields, [{ label: 'Step', value: 'Tape the trim' }, { label: 'Project', value: 'Repaint the hallway' }, { label: 'Safety note', value: 'Keep a window open while you work.' }]);
  assert.equal(result.confirmation.confirmLabel, 'Mark step done');
  assert.match(result.confirmation.description, /on your word/);
  assert.equal(result.contextVersion, policy.guideContextVersion(await diyService.getProjectGuideSource('p1', 'prop-1')));
  assert.equal(result.parameters.diyStepContextVersion, result.contextVersion);
  assert.equal(result.parameters.diyStepExpectedUpdatedAt, stepRow('s1').updatedAt.toISOString());
  assert.deepEqual([result.parameters.diyStepId, result.parameters.diyProjectId, result.parameters.diyStepTarget], ['s1', 'p1', 'COMPLETED']);
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
  validate('DIY_STEP_UPDATE', result, 'OWNER'); // the boundary ids are allow-listed
  assert.equal(validate('DIY_STEP_UPDATE', result, 'OWNER').blocks[0].id, 'diy-step-safety');
  setStatus(...DONE_1_2);
  const skip = await propose('SKIP', 's3');
  assert.deepEqual(skip.blocks.map((b) => b.id), ['diy-step-update-review']);
  assert.equal(skip.confirmation.confirmLabel, 'Skip step');
  assert.equal(skip.confirmation.fields.length, 2);
});

// ---- confirm ------------------------------------------------------------------------------------------------------------------------------------

test('confirm marks the step done as the actor, writes exactly the step, the project version and one ledger row, and says it is the person\'s report', async () => {
  const proposed = await propose('COMPLETE', 's1');
  const { result, artifactType, artifactId } = await confirm(proposed.parameters);
  assert.deepEqual([stepRow('s1').status, stepRow('s1').completedByUserId], ['COMPLETED', 'u1']);
  assert.deepEqual(db.state.events.map((e) => [e.type, e.actorUserId, e.stepId]), [['STEP_COMPLETED', 'u1', 's1']]);
  assert.equal(db.state.domainEvents.length, 0, 'no outbox event: completion belongs to the project');
  assert.equal(db.state.projects[0].status, 'IN_PROGRESS');
  const models = new Set(db.state.writes.map((w) => w.model));
  assert.deepEqual([...models].sort(), ['project', 'step'], 'only the step and the project row are written (the ledger row is the event)');
  assert.deepEqual([artifactType, artifactId, result.reasonCode], ['DIY_PROJECT_STEP', 's1', 'DIY_STEP_COMPLETED']);
  const receipt = result.blocks[0];
  assert.deepEqual([receipt.type, receipt.title], ['WORKFLOW_PROGRESS', 'Marked done by you']);
  assert.match(receipt.description, /your report; Cozy doesn't check the work/);
  assert.doesNotMatch(JSON.stringify(result), /verified|confirmed that|inspected/i);
  assert.doesNotMatch(receipt.description, /Every step is resolved/);
  AskPresentationBlockSchema.parse(receipt);
  assert.deepEqual(validate('DIY_STEP_UPDATE', result, 'OWNER').blocks[0].actions.map((a) => a.id), ['open-diy-project']);
});

test('confirm skip: "Skipped by you"; and the last resolved step points to the project page', async () => {
  setStatus(...DONE_1_2);
  const skipped = await confirm((await propose('SKIP', 's3')).parameters);
  assert.equal(skipped.result.blocks[0].title, 'Skipped by you');
  assert.equal(stepRow('s3').status, 'SKIPPED');
  const last = await confirm((await propose('COMPLETE', 's4')).parameters);
  assert.match(last.result.blocks[0].description, /Every step is resolved\. Finish the project on the project page\./);
  assert.equal(db.state.events.map((e) => e.type).join(','), 'STEP_SKIPPED,STEP_COMPLETED');
});

test('a replay, or a step already in the target status, is an "already" receipt with no second ledger row', async () => {
  const proposed = await propose('COMPLETE', 's1');
  await confirm(proposed.parameters);
  const again = await confirm(proposed.parameters);
  assert.equal(again.result.reasonCode, 'DIY_STEP_ALREADY_COMPLETED');
  assert.equal(again.result.blocks[0].title, 'Already marked done');
  assert.equal(db.state.events.length, 1);
});

test('a changed project is refused by the context version: another step, the guide\'s governance, the project version', async () => {
  const proposed = await propose('COMPLETE', 's1');
  const base = committedState();
  stepRow('s3').status = 'SKIPPED'; // the page changed ANOTHER step
  assert.equal(await codeOf(confirm(proposed.parameters)), 'ASK_CONTEXT_VERSION_CONFLICT');
  stepRow('s3').status = 'PENDING';
  db.state.templates.get('t1').publishedRevisionId = null; // withdrawn while the card was open
  assert.equal(await codeOf(confirm(proposed.parameters)), 'ASK_CONTEXT_VERSION_CONFLICT');
  db.state.templates.get('t1').publishedRevisionId = 'rev-1';
  db.state.projects[0].updatedAt = new Date(T0.getTime() + 99);
  assert.equal(await codeOf(confirm(proposed.parameters)), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(db.state.events.length, 0);
  void base;
});

test('THE RACE: the early checks pass on a stale read, and the transaction still refuses (current step, withdrawal, role)', async () => {
  const proposed = await propose('COMPLETE', 's1');
  const staleSource = await diyService.getProjectGuideSource('p1', 'prop-1');
  const stale = () => { diyService.getProjectGuideSource = async () => structuredClone(staleSource); }; // the handler's pre-check sees the old snapshot

  // 1. The page finishes step 1 and 2 meanwhile: step 1 is no longer the current step... (it is already done: the transaction answers "already", never a second write)
  stale();
  setStatus(['s1', 'COMPLETED']);
  assert.equal((await confirm(proposed.parameters)).result.reasonCode, 'DIY_STEP_ALREADY_COMPLETED', 'the stale read said PENDING, the transaction saw COMPLETED, and nothing was written twice');
  assert.equal(db.state.events.length, 0);
  setStatus(['s1', 'PENDING']);

  // 2. A different step is advanced by the page: the Ask command is refused by the in-transaction policy (stale token mapped to a conflict).
  const token = proposed.parameters.diyStepExpectedUpdatedAt;
  stale();
  setStatus(['s1', 'IN_PROGRESS']); stepRow('s1').updatedAt = new Date(new Date(token).getTime() + 5);
  assert.equal(await codeOf(confirm(proposed.parameters)), 'ASK_CONTEXT_VERSION_CONFLICT');
  setStatus(['s1', 'PENDING']); stepRow('s1').updatedAt = new Date(token);

  // 3. The guide is withdrawn after the pre-check.
  stale();
  db.state.templates.get('t1').publishedRevisionId = null;
  assert.equal(await codeOf(confirm(proposed.parameters)), 'ASK_CONFIRMATION_NOT_ACTIVE');
  db.state.templates.get('t1').publishedRevisionId = 'rev-1';

  // 4. Access is revoked after Ask's own check.
  stale();
  dbRole = 'VIEWER';
  assert.equal(await codeOf(confirm(proposed.parameters)), 'ASK_PERMISSION_REQUIRED');
  dbRole = 'CONTRIBUTOR';
  assert.equal(stepRow('s1').status, 'PENDING');
  assert.equal(db.state.events.length, 0);
  // And with nothing changed the same confirmation does go through.
  diyService.getProjectGuideSource = original.source;
  assert.equal((await confirm(proposed.parameters)).result.reasonCode, 'DIY_STEP_COMPLETED');
});

test('THE RACE, the exact case: the page reopens an EARLIER step after the pre-check; this step\'s own token is unchanged, and the transaction still refuses', async () => {
  setStatus(['s1', 'COMPLETED']);
  const proposed = await propose('COMPLETE', 's2'); // s2 is current
  const staleSource = await diyService.getProjectGuideSource('p1', 'prop-1');
  diyService.getProjectGuideSource = async () => structuredClone(staleSource);
  setStatus(['s1', 'IN_PROGRESS']); // the page reopened step 1: s2's version is untouched, but s2 is no longer the first unfinished step
  assert.equal(stepRow('s2').updatedAt.toISOString(), proposed.parameters.diyStepExpectedUpdatedAt);
  assert.equal(await codeOf(confirm(proposed.parameters)), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(stepRow('s2').status, 'PENDING');
  assert.equal(db.state.events.length, 0);
});

test('the step token is the one PROPOSED, independent of the context version: a step touched after the proposal is refused even if the early check were satisfied', async () => {
  const proposed = await propose('COMPLETE', 's1');
  stepRow('s1').updatedAt = new Date(stepRow('s1').updatedAt.getTime() + 7); // e.g. a note saved on the page: same status, new version
  const fresh = await diyService.getProjectGuideSource('p1', 'prop-1');
  // Even with a context version that matches the CURRENT state, the proposed token no longer matches the step.
  const forged = { ...proposed.parameters, diyStepContextVersion: policy.guideContextVersion(fresh) };
  assert.equal(await codeOf(confirm(forged)), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(stepRow('s1').status, 'PENDING');
  assert.equal(db.state.events.length, 0);
});

test('confirm refuses a viewer and malformed parameters, writing nothing', async () => {
  const proposed = await propose('COMPLETE', 's1');
  const before = committedState();
  assert.equal(await codeOf(confirm(proposed.parameters, 'VIEWER')), 'ASK_PERMISSION_REQUIRED');
  for (const key of ['diyStepId', 'diyProjectId', 'diyStepTarget', 'diyStepExpectedUpdatedAt']) assert.equal(await codeOf(confirm({ ...proposed.parameters, [key]: undefined })), 'ASK_CONFIRMATION_NOT_ACTIVE', key);
  assert.equal(await codeOf(confirm({ ...proposed.parameters, diyStepTarget: 'PENDING' })), 'ASK_CONFIRMATION_NOT_ACTIVE', 'Ask never confirms a move it does not offer');
  assert.equal(await codeOf(confirm({ ...proposed.parameters, diyStepId: 'nope' })), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(committedState(), before);
});

// ---- registration -------------------------------------------------------------------------------------------------------------------------------

test('registry facts: a CONTRIBUTOR, confirmation-gated, non-routable command with a REOPEN correction mode declared, refreshing the guide and the list', () => {
  const command = getAskDomainCommandByOperation('DIY_STEP_UPDATE');
  assert.deepEqual([command.roleFloor, command.adapterKey, command.correctionModes, command.material], ['CONTRIBUTOR', 'diy.step-update', ['REOPEN'], true]);
  const def = ASK_OPERATION_DEFINITIONS.DIY_STEP_UPDATE;
  assert.deepEqual([def.family, def.propertyRoleFloor, def.allowedBlockTypes], ['COMMAND', 'CONTRIBUTOR', ['SUMMARY', 'WORKFLOW_PROGRESS', 'BOUNDARY']]);
  assert.equal(isAskMessageRoutableOperation('DIY_STEP_UPDATE'), false);
  const executeSource = fs.readFileSync(path.join(__dirname, '../../src/services/ask/execution/executeOperation.ts'), 'utf8');
  assert.match(executeSource, /DIY_STEP_UPDATE: \['DIY_PROJECT_GUIDE', 'DIY_PROJECTS'\]/);
  const { DIY_SKILL } = require('../../src/services/skills/diy/skill.manifest.ts');
  assert.deepEqual([DIY_SKILL.autonomyLevel, DIY_SKILL.riskPolicy.effects, DIY_SKILL.riskPolicy.materiality, DIY_SKILL.riskPolicy.reversibility], [2, ['READ', 'WRITE'], 'MATERIAL', 'PARTIALLY_REVERSIBLE']);
  assert.ok(DIY_SKILL.allowedResultBlocks.includes('WORKFLOW_PROGRESS'));
});

test('the handler source has the guard shape and no direct write: declared action, canned messages, ASK_REFRESH, the policy flag, no model write', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/ask/handlers/diyStepUpdate.handler.ts'), 'utf8');
  assert.match(source, /launchContext\.surface === 'ASK_REFRESH'/);
  assert.match(source, /askPolicy: TARGET_COPY\[target\]\.policy/);
  assert.doesNotMatch(source, /prisma\./, 'every write goes through diyService.updateStep');
  assert.doesNotMatch(source, /\.(create|update|updateMany|delete|upsert)\(/);
});

// ===========================================================================================================================================================
// Step 7A (docs/architecture/ASK_COZY_DIY_PROJECT_COMMANDS_PLAN.md sections 3.1 to 3.3): the previous-step view (a READ), the all-resolved "Review last step" path and
// Reopen (the step operation's third action).
// ===========================================================================================================================================================
const viewLaunch = (stepId, overrides = {}) => ({ surface: 'ASK_WORKSPACE', entityType: 'DIY_STEP', entityId: stepId, actionId: 'VIEW', ...overrides });
const view = (stepId, canEdit = true, overrides, propertyId = 'prop-1') => diyProjectGuideResult(propertyId, viewLaunch(stepId, overrides), NOW, canEdit);
const taskGuideOf = (result) => result.blocks.find((b) => b.type === 'TASK_GUIDE');
const finish = (...ids) => ids.forEach((id) => { stepRow(id).status = id === 's3' ? 'SKIPPED' : 'COMPLETED'; stepRow(id).completedByUserId = 'u9'; stepRow(id).completedAt = T0; });
const RESOLVE_ALL = ['s1', 's2', 's3', 's4'];

test('policy helpers: the previous finished step before a point, and what counts as a valid previous-step view', () => {
  const steps = [{ id: 'a', stepNumber: 1, status: 'COMPLETED' }, { id: 'b', stepNumber: 3, status: 'SKIPPED' }, { id: 'c', stepNumber: 7, status: 'IN_PROGRESS' }, { id: 'd', stepNumber: 9, status: 'COMPLETED' }];
  assert.equal(policy.previousFinishedStep(steps, 7).id, 'b');
  assert.equal(policy.previousFinishedStep(steps, 3).id, 'a');
  assert.equal(policy.previousFinishedStep(steps, 1), null);
  assert.equal(policy.previousFinishedStep(steps, null).id, 'd', 'with no current step the last finished one');
  assert.equal(policy.isPreviousStepView(steps, 'a'), true);
  assert.equal(policy.isPreviousStepView(steps, 'b'), true);
  for (const id of ['c', 'd', 'nope']) assert.equal(policy.isPreviousStepView(steps, id), false, `${id}: the current step, a LATER finished step and an unknown step are not previous steps`);
  assert.equal(policy.isPreviousStepView(steps.map((s) => ({ ...s, status: 'COMPLETED' })), 'd'), true, 'every step resolved: any step may be reviewed');
});

test('the REOPEN policy: a finished step of a guide that is not withdrawn; anything else is refused; the two policies accept different targets', async () => {
  const src = async () => diyService.getProjectGuideSource('p1', 'prop-1');
  finish('s1', 's2');
  assert.deepEqual(policy.evaluateAskStepPolicy(await src(), 's1', 'IN_PROGRESS', 'REOPEN_FINISHED_STEP'), { ok: true });
  assert.equal(policy.evaluateAskStepPolicy(await src(), 's3', 'IN_PROGRESS', 'REOPEN_FINISHED_STEP').code, 'DIY_STEP_NOT_REOPENABLE', 'an unfinished step');
  assert.equal(policy.evaluateAskStepPolicy(await src(), 's1', 'COMPLETED', 'REOPEN_FINISHED_STEP').reason, 'TARGET_NOT_OFFERED');
  assert.equal(policy.evaluateAskStepPolicy(await src(), 's1', 'IN_PROGRESS', 'ADVANCE_CURRENT_STEP').reason, 'TARGET_NOT_OFFERED');
  db.state.templates.get('t1').publishedRevisionId = null;
  assert.equal(policy.evaluateAskStepPolicy(await src(), 's1', 'IN_PROGRESS', 'REOPEN_FINISHED_STEP').code, 'DIY_GUIDE_NOT_CURRENT');
  db.state.templates.get('t1').publishedRevisionId = 'rev-1';
  db.state.projects[0].status = 'COMPLETED';
  assert.equal(policy.evaluateAskStepPolicy(await src(), 's1', 'IN_PROGRESS', 'REOPEN_FINISHED_STEP').reason, 'PROJECT_FINISHED');
});

test('the card offers "Previous step" only when a finished step comes before the current one, to everyone (it is a read); never for a later finished step', async () => {
  const previousOf = (result) => taskGuideOf(result).actions.find((a) => a.id === 'diy-step-previous');
  assert.equal(previousOf(await diyProjectGuideResult('prop-1', guideLaunch, NOW, true)), undefined, 'step 1 is current: nothing before it');
  finish('s1', 's2');
  const card = await diyProjectGuideResult('prop-1', guideLaunch, NOW, false); // a viewer still sees it
  assert.deepEqual(previousOf(card), { id: 'diy-step-previous', label: 'Previous step', interactionType: 'START_WORKFLOW', message: 'Show the previous step.', operationId: 'DIY_PROJECT_GUIDE', entityType: 'DIY_STEP', entityId: 's2', actionId: 'VIEW', style: 'SECONDARY' });
  assert.deepEqual(actionsOf(card).filter((a) => CHANGES.has(a.id)), []);
  stepRow('s2').status = 'PENDING'; stepRow('s3').status = 'COMPLETED'; // s2 current again; a LATER step finished out of order
  assert.equal(previousOf(await diyProjectGuideResult('prop-1', guideLaunch, NOW, true)).entityId, 's1', 'the nearest finished step BEFORE the current one, never a later one');
});

test('the previous-step view: the viewed step\'s own safety note directly above, the real current step still marked, a plain label, the actions, a schema-valid card, and NO write', async () => {
  finish('s1', 's2');
  const before = committedState();
  const result = await view('s1');
  assert.equal(result.reasonCode, 'DIY_PREVIOUS_STEP_READY');
  result.blocks.forEach((block) => AskPresentationBlockSchema.parse(block));
  const cardIndex = result.blocks.findIndex((b) => b.type === 'TASK_GUIDE');
  assert.deepEqual([result.blocks[cardIndex - 1].id, result.blocks[cardIndex - 1].body], ['diy-step-safety', 'Keep a window open while you work.']);
  const card = taskGuideOf(result);
  assert.equal(card.id, 'diy-project-guide', 'the same block id, so a refresh replaces the live guide in place');
  assert.equal(card.summary, 'Looking back at step 1 of 4, done. You are on step 3.');
  assert.equal(card.progress.label, card.summary);
  assert.deepEqual(card.eyebrow, ['Painting', 'Reviewed guide', 'Earlier step']);
  assert.deepEqual([card.main.title, card.chips[0]], ['Tape the trim', { label: 'Done', kind: 'STATUS' }]);
  assert.deepEqual(card.outline.map((o) => o.state), ['DONE', 'DONE', 'CURRENT', 'UPCOMING'], 'the outline still marks the REAL current step');
  assert.deepEqual(card.actions.map((a) => a.id), ['diy-step-reopen', 'diy-step-back', 'open-diy-project'], 'no earlier finished step, so no Previous');
  assert.deepEqual(card.actions[0], { id: 'diy-step-reopen', label: 'Reopen this step', interactionType: 'START_WORKFLOW', message: 'Reopen this step.', operationId: 'DIY_STEP_UPDATE', entityType: 'DIY_STEP', entityId: 's1', actionId: 'REOPEN', style: 'SECONDARY' });
  assert.deepEqual([card.actions[1].label, card.actions[1].entityType, card.actions[1].entityId, card.actions[1].operationId], ['Back to step 3', 'DIY_PROJECT', 'p1', 'DIY_PROJECT_GUIDE']);
  assert.equal(committedState(), before, 'a view writes nothing');
  assert.equal(db.state.writes.length, 0);
  // From the second step, Previous leads back to the first, and a skipped step reads "skipped".
  const second = taskGuideOf(await view('s2'));
  assert.equal(second.actions.find((a) => a.id === 'diy-step-previous').entityId, 's1');
  assert.equal(second.summary, 'Looking back at step 2 of 4, done. You are on step 3.');
});

test('the view for a viewer or a withdrawn guide has no Reopen; it stays readable; a refresh renders the same view', async () => {
  finish('s1', 's2');
  const ids = (result) => taskGuideOf(result).actions.map((a) => a.id);
  assert.equal(ids(await view('s1', false)).includes('diy-step-reopen'), false);
  assert.equal(ids(await view('s1', true)).includes('diy-step-reopen'), true);
  db.state.templates.get('t1').publishedRevisionId = null;
  const withdrawn = await view('s1', true);
  assert.equal(withdrawn.blocks[0].id, 'diy-guide-withdrawn');
  assert.equal(ids(withdrawn).includes('diy-step-reopen'), false, 'a withdrawn guide offers no change');
  assert.equal(ids(withdrawn).includes('diy-step-back'), true);
  db.state.templates.get('t1').publishedRevisionId = 'rev-1';
  const refreshed = await view('s1', true, { surface: 'ASK_REFRESH' });
  assert.equal(refreshed.reasonCode, 'DIY_PREVIOUS_STEP_READY');
});

test('a step that is not a valid previous step falls back to the live guide; an unknown step, another property and a missing action id answer "not found"', async () => {
  finish('s1');
  for (const id of ['s2', 's3']) assert.equal((await view(id)).reasonCode, 'DIY_PROJECT_GUIDE_READY', `${id}: the current step or a later one is not a previous step`);
  finish('s2'); stepRow('s4').status = 'COMPLETED'; // s3 is current; s4 finished out of order
  assert.equal((await view('s4')).reasonCode, 'DIY_PROJECT_GUIDE_READY');
  for (const result of [await view('nope'), await view('s1', true, undefined, 'prop-2'), await diyProjectGuideResult('prop-1', { surface: 'ASK_WORKSPACE', entityType: 'DIY_STEP', entityId: 's1' }, NOW, true)]) {
    assert.equal(result.reasonCode, 'DIY_GUIDE_PROJECT_NOT_FOUND');
    assert.ok(!JSON.stringify(result).includes('Tape the trim'));
  }
});

test('ALL STEPS RESOLVED: "Review last step" leads to the last finished step; its Back returns to the summary; Reopen is reachable from there', async () => {
  finish(...RESOLVE_ALL);
  const summary = await diyProjectGuideResult('prop-1', guideLaunch, NOW, true);
  const resolved = summary.blocks.find((b) => b.id === 'diy-guide-resolved');
  assert.deepEqual(resolved.actions.map((a) => a.id), ['diy-review-last-step', 'open-diy-project']);
  assert.deepEqual(resolved.actions[0], { id: 'diy-review-last-step', label: 'Review last step', interactionType: 'START_WORKFLOW', message: 'Review the last step.', operationId: 'DIY_PROJECT_GUIDE', entityType: 'DIY_STEP', entityId: 's4', actionId: 'VIEW', style: 'SECONDARY' });
  const last = await view('s4');
  assert.equal(last.reasonCode, 'DIY_PREVIOUS_STEP_READY');
  const card = taskGuideOf(last);
  assert.equal(card.summary, 'Looking back at step 4 of 4, done. Every step is resolved.');
  assert.deepEqual(card.actions.map((a) => a.id), ['diy-step-reopen', 'diy-step-previous', 'diy-step-back', 'open-diy-project']);
  assert.equal(card.actions.find((a) => a.id === 'diy-step-back').label, 'Back to the guide');
  assert.deepEqual(card.outline.map((o) => o.state), ['DONE', 'DONE', 'SKIPPED', 'DONE'], 'no step is current');
  // The summary is read-only for a viewer too: they can review, not reopen.
  const forViewer = await diyProjectGuideResult('prop-1', guideLaunch, NOW, false);
  assert.ok(forViewer.blocks.find((b) => b.id === 'diy-guide-resolved').actions.some((a) => a.id === 'diy-review-last-step'));
  assert.equal(taskGuideOf(await view('s4', false)).actions.some((a) => a.id === 'diy-step-reopen'), false);
});

test('REOPEN, end to end: from the view, the confirmation repeats the safety note and says what changes, the step goes back in progress as the actor, the guide returns to it', async () => {
  finish('s1', 's2');
  const proposed = await propose('REOPEN', 's1');
  assert.equal(proposed.status, 'NEEDS_CONFIRMATION');
  assert.deepEqual(proposed.blocks.map((b) => b.id), ['diy-step-safety', 'diy-step-update-review']);
  assert.match(proposed.confirmation.description, /steps you finished after it stay finished/);
  assert.equal(proposed.confirmation.confirmLabel, 'Reopen step');
  assert.ok(proposed.confirmation.fields.some((f) => f.label === 'Safety note'));
  assert.equal(proposed.parameters.diyStepTarget, 'IN_PROGRESS');
  assert.equal(stepRow('s1').status, 'COMPLETED', 'a proposal changes nothing');
  proposed.blocks.forEach((b) => AskPresentationBlockSchema.parse(b));

  const { result } = await confirm(proposed.parameters);
  assert.equal(result.reasonCode, 'DIY_STEP_REOPENED');
  assert.equal(result.blocks[0].title, 'Reopened by you');
  assert.doesNotMatch(JSON.stringify(result), /verified|your report; Cozy doesn't check/i, 'a reopen claims nothing about the work');
  assert.deepEqual([stepRow('s1').status, stepRow('s1').completedByUserId, stepRow('s1').completedAt], ['IN_PROGRESS', null, null]);
  assert.deepEqual(db.state.events.map((e) => [e.type, e.actorUserId, e.stepId, e.fromStatus, e.toStatus]), [['STEP_REOPENED', 'u1', 's1', 'COMPLETED', 'IN_PROGRESS']]);
  assert.equal(db.state.domainEvents.length, 0);
  assert.deepEqual([...new Set(db.state.writes.map((w) => w.model))].sort(), ['project', 'step']);
  // The guide (and the same view, refreshed) now show step 1 as the current step.
  const live = taskGuideOf(await diyProjectGuideResult('prop-1', guideLaunch, NOW, true));
  assert.equal(live.progress.label, 'Step 1 of 4, 1 done');
  assert.equal((await view('s1')).reasonCode, 'DIY_PROJECT_GUIDE_READY', 'the viewed step is the current step now: the refreshed view becomes the ordinary guide');
  // A replay is "already".
  const again = await confirm(proposed.parameters);
  assert.equal(again.result.reasonCode, 'DIY_STEP_ALREADY_REOPENED');
  assert.equal(db.state.events.length, 1);
});

test('REOPEN refusals: typed wording, an unfinished step, a withdrawn guide, a finished project, a viewer, a stale card and a revoked role; nothing written', async () => {
  finish('s1', 's2');
  db.state.projects[0].status = 'IN_PROGRESS'; // a project with finished steps is in progress
  const before = committedState();
  assert.equal((await propose('REOPEN', 's1', {}, 'reopen step one please')).reasonCode, 'DIY_STEP_NOT_DIRECTLY_ROUTABLE');
  assert.equal((await propose('REOPEN', 's1', { surface: 'ASK_REFRESH' })).reasonCode, 'DIY_STEP_NOT_DIRECTLY_ROUTABLE');
  assert.equal((await propose('REOPEN', 's3')).reasonCode, 'DIY_STEP_NOT_REOPENABLE', 'step 3 is not finished');
  db.state.templates.get('t1').publishedRevisionId = null;
  assert.equal((await propose('REOPEN', 's1')).reasonCode, 'DIY_STEP_GUIDE_NOT_CURRENT');
  db.state.templates.get('t1').publishedRevisionId = 'rev-1';
  db.state.projects[0].status = 'COMPLETED';
  assert.equal((await propose('REOPEN', 's1')).reasonCode, 'DIY_STEP_PROJECT_FINISHED');
  db.state.projects[0].status = 'IN_PROGRESS';
  role = 'VIEWER';
  assert.equal((await propose('REOPEN', 's1')).reasonCode, 'ASK_PERMISSION_REQUIRED');
  role = 'CONTRIBUTOR';
  assert.equal(committedState(), before);

  // Confirm-side: the early checks pass on a stale read, the transaction refuses.
  const proposed = await propose('REOPEN', 's1');
  const stale = structuredClone(await diyService.getProjectGuideSource('p1', 'prop-1'));
  diyService.getProjectGuideSource = async () => structuredClone(stale);
  db.state.templates.get('t1').publishedRevisionId = null;
  assert.equal(await codeOf(confirm(proposed.parameters)), 'ASK_CONFIRMATION_NOT_ACTIVE', 'withdrawn after the pre-check');
  db.state.templates.get('t1').publishedRevisionId = 'rev-1';
  dbRole = 'VIEWER';
  assert.equal(await codeOf(confirm(proposed.parameters)), 'ASK_PERMISSION_REQUIRED', 'role revoked after the pre-check');
  dbRole = 'CONTRIBUTOR';
  stepRow('s1').status = 'PENDING'; // someone else changed the step to something that is no longer finished (not a normal transition, a race fixture)
  assert.equal(await codeOf(confirm(proposed.parameters)), 'ASK_CONTEXT_VERSION_CONFLICT');
  diyService.getProjectGuideSource = original.source;
  assert.equal(db.state.events.length, 0);
});

test('every 7A action id survives the trust allow-list; read-only navigation stays visible to a viewer while Reopen is filtered', async () => {
  finish('s1', 's2');
  const ids = (result) => actionsOf(result).map((a) => a.id);
  const owner = validate('DIY_PROJECT_GUIDE', await view('s1'), 'OWNER');
  assert.deepEqual(ids(owner), ['diy-step-reopen', 'diy-step-back', 'open-diy-project']);
  const live = validate('DIY_PROJECT_GUIDE', await diyProjectGuideResult('prop-1', guideLaunch, NOW, true), 'OWNER');
  assert.ok(ids(live).includes('diy-step-previous'));
  const forViewer = validate('DIY_PROJECT_GUIDE', await view('s1'), 'VIEWER'); // even if a producer emitted Reopen
  assert.equal(ids(forViewer).includes('diy-step-reopen'), false);
  assert.deepEqual(ids(forViewer), ['diy-step-back', 'open-diy-project']);
  assert.ok(ids(validate('DIY_PROJECT_GUIDE', await diyProjectGuideResult('prop-1', guideLaunch, NOW, false), 'VIEWER')).includes('diy-step-previous'));
  finish('s3', 's4');
  const summary = validate('DIY_PROJECT_GUIDE', await diyProjectGuideResult('prop-1', guideLaunch, NOW, false), 'VIEWER');
  assert.ok(ids(summary).includes('diy-review-last-step'));
  const { isAskActionAllowedForHouseholdRole } = require('../../src/services/ask/askAudiencePresentation.ts');
  for (const label of ['Previous step', 'Review last step', 'Back to step 3', 'Back to the guide']) assert.equal(isAskActionAllowedForHouseholdRole({ id: 'x', label, style: 'SECONDARY' }, 'VIEWER'), true, label);
  assert.equal(isAskActionAllowedForHouseholdRole({ id: 'x', label: 'Reopen this step', style: 'SECONDARY' }, 'VIEWER'), false);
});

test('adjacency on the FINAL sequence: a card carrying Reopen has the viewed step\'s own safety note directly before it; a step without one has none', async () => {
  finish('s1', 's2');
  const final = validate('DIY_PROJECT_GUIDE', await view('s1'), 'OWNER');
  const index = final.blocks.findIndex((b) => b.type === 'TASK_GUIDE');
  assert.equal(final.blocks[index - 1].id, 'diy-step-safety');
  assert.equal(final.blocks[index - 1].body, 'Keep a window open while you work.');
  const noNote = validate('DIY_PROJECT_GUIDE', await view('s2'), 'OWNER');
  assert.equal(noNote.blocks.some((b) => b.id === 'diy-step-safety'), false);
  assert.ok(taskGuideOf(noNote).actions.some((a) => a.id === 'diy-step-reopen'));
});
