const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Step 7B of the stateful GUIDE (docs/architecture/ASK_COZY_DIY_PROJECT_COMMANDS_PLAN.md sections 3.4, 3.5, 3.7): finish a project (DIY_PROJECT_COMPLETE) and stop it or hand it
// off (DIY_PROJECT_ABANDON). The real registered handlers run against the shared database-free DIY fake (serialized transactions with rollback) with property access and
// analytics replaced. Not Postgres, not a browser.
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
const policy = require('../../src/services/diy/askStepPolicy.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const analytics = require('../../src/services/analytics');

const T0 = new Date('2026-10-06T12:00:00.000Z');
const NOW = new Date('2026-10-06T13:00:00.000Z');
const template = () => ({
  id: 't1', slug: 'repaint-hallway', title: 'Repaint a hallway', shortDescription: 'Fresh coat of paint.', longDescription: 'Longer text.', category: 'PAINTING',
  difficultyLevel: 'EASY', requiredSkillLevel: 'BEGINNER', safetyLevel: 'LOW', permitRequirement: 'NOT_REQUIRED', estimatedMinutes: 120, tags: ['paint'],
  steps: [
    { stepNumber: 1, title: 'Tape the trim', description: 'Apply painter tape along the trim.', estimatedMinutes: 20, isOptional: false, safetyNote: 'Keep a window open while you work.', tipNote: null },
    { stepNumber: 2, title: 'Cut in the edges', description: 'Brush the corners first.', estimatedMinutes: 30, isOptional: false, safetyNote: null, tipNote: null },
    { stepNumber: 3, title: 'Touch up', description: 'Fix any misses.', estimatedMinutes: 10, isOptional: true, safetyNote: null, tipNote: null },
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

const original = { prisma: prismaModule.prisma, resolveAccess: propertyAccess.resolvePropertyAccess, source: diyService.getProjectGuideSource, track: analytics.analyticsEmitter.track };
let db; let role; let dbRole; let tracked; let hooks;
function install() {
  role = 'CONTRIBUTOR'; dbRole = 'CONTRIBUTOR'; tracked = [];
  hooks = { role: () => dbRole, tasks: [] };
  db = makeDiyDb([], hooks);
  db.askExecution = { findMany: async () => [] };
  const revision = revisionRow();
  db.state.revisions.push(revision);
  db.state.templates.set('t1', { id: 't1', publishedRevisionId: 'rev-1', steps: [], materials: [], tools: [] });
  db.state.projects.push({
    id: 'p1', propertyId: 'prop-1', userId: 'creator', title: 'Repaint the hallway', category: 'PAINTING', templateId: 't1', templateRevisionId: 'rev-1', aiGuideId: null, completionBasis: null,
    maintenanceTaskId: null, status: 'IN_PROGRESS', startedAt: T0, completedAt: null, completedByUserId: null, notesJson: null, updatedAt: T0, materials: [], tools: [], aiGuide: null,
    steps: stepRows(revision),
  });
  prismaModule.prisma = db;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  analytics.analyticsEmitter.track = (event) => { tracked.push(event); };
}
function restore() {
  prismaModule.prisma = original.prisma; propertyAccess.resolvePropertyAccess = original.resolveAccess;
  diyService.getProjectGuideSource = original.source; analytics.analyticsEmitter.track = original.track;
}
test.beforeEach(install);
test.afterEach(restore);

const project = () => db.state.projects[0];
const stepRow = (id) => project().steps.find((row) => row.id === id);
const resolveAll = () => { for (const id of ['s1', 's2']) { stepRow(id).status = 'COMPLETED'; stepRow(id).completedByUserId = 'u9'; } stepRow('s3').status = 'SKIPPED'; };
const launchFor = (operationId, entityType, entityId, actionId, overrides = {}) => ({ surface: 'ASK_WORKSPACE', entityType, entityId, operationId, actionId, sourceExecutionId: null, ...overrides });
const FIN = 'Finish this project.';
const proposeFinish = (overrides, message = FIN, userId = 'u1') => capabilityInvoke('DIY_PROJECT_COMPLETE', { userId, propertyId: 'prop-1', message, launchContext: launchFor('DIY_PROJECT_COMPLETE', 'DIY_PROJECT', 'p1', 'COMPLETE', overrides) });
const MSG = { STOP: 'Stop this project.', HAND_OFF: 'Hand this off to a pro.' };
const proposeStop = (key, overrides, message = MSG[key]) => capabilityInvoke('DIY_PROJECT_ABANDON', { userId: 'u1', propertyId: 'prop-1', message, launchContext: launchFor('DIY_PROJECT_ABANDON', 'DIY_PROJECT', 'p1', key, overrides) });
const execution = (operationId) => ({ id: 'exec-1', propertyId: 'prop-1', sessionId: 's1', userId: 'u1', operationId, createdAt: new Date() });
const confirm = (operationId, parameters, asRole = 'CONTRIBUTOR') => confirmCapabilityInvoke(operationId, {
  userId: 'u1', execution: execution(operationId), parameters, access: { role: asRole }, command: getAskDomainCommandByOperation(operationId),
});
const codeOf = async (promise) => { try { await promise; return null; } catch (error) { return error.code ?? `NO_CODE:${error.message}`; } };
const guideLaunch = { surface: 'ASK_WORKSPACE', entityType: 'DIY_PROJECT', entityId: 'p1' };
const optionsLaunch = { ...guideLaunch, actionId: 'MORE' };
const guide = (launch = guideLaunch, canEdit = true) => diyProjectGuideResult('prop-1', launch, NOW, canEdit);
const actionsOf = (result) => result.blocks.flatMap((block) => block.actions ?? []);
const cardOf = (result) => result.blocks.find((b) => b.type === 'TASK_GUIDE');
const committed = () => JSON.stringify([project().status, project().updatedAt, project().abandonedAt ?? null, project().steps.map((s) => [s.id, s.status, s.updatedAt]), db.state.events.length, db.state.domainEvents.length]);
const validate = (operationId, result, householdRole) => validateAskAnswerTrust({
  question: 'q', operationId, propertyId: 'prop-1',
  result: { ...result, parameters: { ...(result.parameters ?? {}), audiencePresentation: { householdRole }, answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: getAskOperationDefinition(operationId).adapterKey, operationId, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: new Date().toISOString() }] } } },
}).result;

// ---- the actions on the guide --------------------------------------------------------------------------------------------------------------------------

test('FINISH is offered in the all-resolved summary to a person who can edit, on a guide that is not withdrawn; never with a step open, for a viewer or after the project closed', async () => {
  const finishOf = (result) => actionsOf(result).find((a) => a.id === 'diy-project-finish');
  assert.equal(finishOf(await guide()), undefined, 'steps are open');
  resolveAll();
  const summary = await guide();
  assert.deepEqual(finishOf(summary), { id: 'diy-project-finish', label: 'Finish this project', interactionType: 'START_WORKFLOW', message: 'Finish this project.', operationId: 'DIY_PROJECT_COMPLETE', entityType: 'DIY_PROJECT', entityId: 'p1', actionId: 'COMPLETE', style: 'PRIMARY' });
  assert.deepEqual(cardOf(summary).actions.map((a) => a.id), ['diy-project-finish', 'diy-review-last-step']);
  assert.equal(summary.blocks.some((b) => b.type === 'SUMMARY'), false, 'never a SUMMARY: the calm shell would show only its first action');
  assert.equal(finishOf(await guide(guideLaunch, false)), undefined, 'a viewer');
  db.state.templates.get('t1').publishedRevisionId = null;
  assert.equal(finishOf(await guide()), undefined, 'a withdrawn guide: finish on the page');
  db.state.templates.get('t1').publishedRevisionId = 'rev-1';
  project().status = 'COMPLETED';
  assert.equal(finishOf(await guide()), undefined, 'a finished project is refused by the guide');
  summary.blocks.forEach((b) => AskPresentationBlockSchema.parse(b));
});

test('"Stop or hand off" is a quiet READ action on the current-step card for people who can edit, including on a withdrawn guide; it is the only entrance to the two commands', async () => {
  const more = (result) => cardOf(result).actions.find((a) => a.id === 'diy-project-more');
  assert.deepEqual(more(await guide()), { id: 'diy-project-more', label: 'Stop or hand off', interactionType: 'START_WORKFLOW', message: 'Show the options to stop or hand off this project.', operationId: 'DIY_PROJECT_GUIDE', entityType: 'DIY_PROJECT', entityId: 'p1', actionId: 'MORE', style: 'QUIET' });
  assert.equal(more(await guide(guideLaunch, false)), undefined);
  db.state.templates.get('t1').publishedRevisionId = null;
  assert.ok(more(await guide()), 'a withdrawn guide still offers the exit');
  db.state.templates.get('t1').publishedRevisionId = 'rev-1';
  const allIds = actionsOf(await guide()).map((a) => a.id);
  assert.equal(allIds.includes('diy-project-stop') || allIds.includes('diy-project-handoff'), false, 'Stop and Hand off are never on the card itself');
  assert.ok(cardOf(await guide()).actions.length <= 6);
});

test('the options view is a READ: the explanation says irreversible, an editor gets Stop, Hand off and Back, a viewer only Back, a refresh keeps it, nothing is written', async () => {
  const before = committed();
  const result = await guide(optionsLaunch);
  assert.equal(result.reasonCode, 'DIY_PROJECT_OPTIONS_READY');
  result.blocks.forEach((b) => AskPresentationBlockSchema.parse(b));
  const summary = cardOf(result); // a TASK_GUIDE card, not a SUMMARY (the calm shell shows only a SUMMARY's first action)
  assert.match(summary.main.body, /Neither can be undone in Cozy/);
  assert.match(summary.main.body, /does not book or contact anyone/);
  assert.match(summary.main.body, /linked maintenance task is not changed/);
  assert.deepEqual(summary.actions.map((a) => [a.id, a.operationId, a.actionId, a.message]), [
    ['diy-project-stop', 'DIY_PROJECT_ABANDON', 'STOP', 'Stop this project.'],
    ['diy-project-handoff', 'DIY_PROJECT_ABANDON', 'HAND_OFF', 'Hand this off to a pro.'],
    ['diy-step-back', 'DIY_PROJECT_GUIDE', undefined, 'Back to the guide.'],
  ]);
  assert.deepEqual(cardOf(await guide(optionsLaunch, false)).actions.map((a) => a.id), ['diy-step-back']);
  assert.equal((await guide({ ...optionsLaunch, surface: 'ASK_REFRESH' })).reasonCode, 'DIY_PROJECT_OPTIONS_READY');
  assert.equal(committed(), before);
  assert.equal(db.state.writes.length, 0);
  project().status = 'ABANDONED';
  assert.equal((await guide(optionsLaunch)).reasonCode, 'DIY_GUIDE_PROJECT_FINISHED', 'a stopped project has no options');
  project().status = 'COMPLETED';
  const finished = await guide(optionsLaunch);
  assert.equal(finished.reasonCode, 'DIY_PROJECT_FINISHED_VIEW', 'a finished project shows its finished view, with no options');
  assert.equal(actionsOf(finished).some((a) => a.id === 'diy-project-stop' || a.id === 'diy-project-handoff'), false);
});

test('trust and viewers: every 7B action id survives the allow-list; Finish, Stop and Hand off are filtered from a viewer; the read-only Back and Review stay visible', async () => {
  const ids = (result) => actionsOf(result).map((a) => a.id);
  resolveAll();
  assert.ok(ids(validate('DIY_PROJECT_GUIDE', await guide(), 'OWNER')).includes('diy-project-finish'));
  assert.ok(ids(validate('DIY_PROJECT_GUIDE', await guide(optionsLaunch), 'OWNER')).includes('diy-project-stop'));
  const emitted = await guide(); // a "producer mistake": the actions are present for a viewer
  assert.equal(ids(validate('DIY_PROJECT_GUIDE', emitted, 'VIEWER')).includes('diy-project-finish'), false);
  const forViewer = ids(validate('DIY_PROJECT_GUIDE', await guide(optionsLaunch), 'VIEWER'));
  assert.equal(forViewer.includes('diy-project-stop') || forViewer.includes('diy-project-handoff'), false);
  const { isAskActionAllowedForHouseholdRole } = require('../../src/services/ask/askAudiencePresentation.ts');
  for (const label of ['Finish this project', 'Stop this project', 'Stop or hand off', 'Hand this off to a pro', 'Abandon project']) assert.equal(isAskActionAllowedForHouseholdRole({ id: 'x', label, style: 'SECONDARY' }, 'VIEWER'), false, label);
  for (const label of ['Back to the guide', 'Review last step', 'Previous step', 'Open this project']) assert.equal(isAskActionAllowedForHouseholdRole({ id: 'x', label, style: 'SECONDARY' }, 'VIEWER'), true, label);
});

// ---- finish: propose ----------------------------------------------------------------------------------------------------------------------------------------

test('finish propose: typed wording, a near-miss, a refresh, a wrong action id or entity never open a confirmation or write', async () => {
  resolveAll();
  const before = committed();
  const refused = (result) => { assert.equal(result.reasonCode, 'DIY_PROJECT_NOT_DIRECTLY_ROUTABLE'); assert.ok(!result.confirmation); };
  refused(await proposeFinish({}, 'finish the project please'));
  refused(await proposeFinish({}, 'Finish this project'));
  refused(await proposeFinish({ surface: 'ASK_REFRESH' }));
  refused(await proposeFinish({ actionId: 'STOP' }));
  refused(await proposeFinish({ entityType: 'DIY_STEP' }));
  refused(await proposeFinish({ operationId: 'DIY_PROJECT_GUIDE' }));
  assert.equal(committed(), before);
  assert.notEqual(resolveAskRoutingCascade(FIN, { localRoutingEnabled: true }).operation?.operationId, 'DIY_PROJECT_COMPLETE');
});

test('finish propose refusals, each a fixed boundary and nothing written', async () => {
  const code = async (promise) => (await promise).reasonCode;
  assert.equal(await code(proposeFinish({})), 'DIY_PROJECT_STEPS_INCOMPLETE', 'steps are open');
  resolveAll();
  const before = committed();
  role = 'VIEWER';
  assert.equal(await code(proposeFinish({})), 'ASK_PERMISSION_REQUIRED');
  role = 'CONTRIBUTOR';
  assert.equal(await code(capabilityInvoke('DIY_PROJECT_COMPLETE', { userId: 'u1', propertyId: 'prop-1', message: FIN, launchContext: launchFor('DIY_PROJECT_COMPLETE', 'DIY_PROJECT', 'nope', 'COMPLETE') })), 'DIY_PROJECT_NOT_FOUND');
  db.state.templates.get('t1').publishedRevisionId = null;
  assert.equal(await code(proposeFinish({})), 'DIY_PROJECT_GUIDE_NOT_CURRENT');
  db.state.templates.get('t1').publishedRevisionId = 'rev-1';
  project().status = 'ABANDONED';
  assert.equal(await code(proposeFinish({})), 'DIY_PROJECT_CLOSED');
  project().status = 'IN_PROGRESS';
  assert.equal(committed(), before);
  project().status = 'COMPLETED';
  assert.equal(await code(proposeFinish({})), 'DIY_PROJECT_ALREADY_COMPLETED');
});

test('the finish confirmation says what Cozy will QUEUE, never that it has happened; it names the linked task as it is now; it says it cannot be undone and changes no incident', async () => {
  resolveAll();
  const text = (result) => JSON.stringify([result.confirmation.description, result.confirmation.fields, result.blocks]);
  // No linked task.
  let proposed = await proposeFinish({});
  assert.equal(proposed.status, 'NEEDS_CONFIRMATION');
  assert.match(proposed.confirmation.description, /cannot be undone in Cozy/);
  assert.match(proposed.confirmation.description, /Cozy will queue a home-history record/);
  assert.match(proposed.confirmation.description, /Nothing about any incident changes/);
  assert.equal(proposed.confirmation.fields.some((f) => f.label === 'Linked maintenance task'), false);
  assert.deepEqual(proposed.confirmation.fields.find((f) => f.label === 'Steps'), { label: 'Steps', value: 'All 3 resolved (2 done, 1 skipped)' });
  assert.deepEqual(proposed.confirmation.fields.find((f) => f.label === 'Can be undone'), { label: 'Can be undone', value: 'No' });
  assert.doesNotMatch(text(proposed), /has been (added|completed|recorded|marked)|was (added|completed)|is now/i, 'a proposal promises no completed effect');
  proposed.blocks.forEach((b) => AskPresentationBlockSchema.parse(b));
  validate('DIY_PROJECT_COMPLETE', proposed, 'OWNER');
  // A valid, still-open linked task.
  project().maintenanceTaskId = 'task-1'; hooks.tasks.push({ id: 'task-1', propertyId: 'prop-1', status: 'PENDING' });
  proposed = await proposeFinish({});
  assert.match(proposed.confirmation.description, /queue the linked maintenance task to be marked done as DIY work/);
  assert.deepEqual(proposed.confirmation.fields.find((f) => f.label === 'Linked maintenance task').value, 'Cozy will queue it to be marked done as DIY work');
  // Already done.
  hooks.tasks[0].status = 'COMPLETED';
  proposed = await proposeFinish({});
  assert.match(proposed.confirmation.description, /already done, so it is left as it is/);
  // Deleted.
  hooks.tasks.length = 0;
  proposed = await proposeFinish({});
  assert.match(proposed.confirmation.description, /no longer exists, so there is nothing to update/);
  assert.equal(proposed.parameters.diyLinkedTask, 'MISSING');
  assert.equal(proposed.contextVersion, policy.guideContextVersion(await diyService.getProjectGuideSource('p1', 'prop-1')));
  assert.equal(proposed.parameters.diyProjectExpectedUpdatedAt, project().updatedAt.toISOString());
});

// ---- finish: confirm ----------------------------------------------------------------------------------------------------------------------------------------

test('finish confirm: the project is COMPLETED as the actor with one ledger row and ONE outbox event; the receipt reports only the honest status; analytics once; nothing else is written', async () => {
  resolveAll();
  const proposed = await proposeFinish({});
  const { result, artifactType, artifactId } = await confirm('DIY_PROJECT_COMPLETE', proposed.parameters);
  assert.deepEqual([project().status, project().completedByUserId, project().completionBasis], ['COMPLETED', 'u1', 'STEPS']);
  assert.deepEqual(db.state.events.map((e) => [e.type, e.actorUserId]), [['PROJECT_COMPLETED', 'u1']]);
  assert.deepEqual(db.state.domainEvents.map((e) => [e.type, e.idempotencyKey]), [['DIY_PROJECT_COMPLETED', 'diy-project-completed:p1']]);
  assert.deepEqual([artifactType, artifactId, result.reasonCode], ['DIY_PROJECT', 'p1', 'DIY_PROJECT_COMPLETED']);
  const receipt = result.blocks[0];
  assert.equal(receipt.title, 'Finished by you');
  assert.match(receipt.description, /Recording your completion/);
  assert.match(receipt.description, /your report; Cozy doesn't check the work/);
  assert.doesNotMatch(JSON.stringify(result), /verified|Completion recorded|Recorded\b/, 'it never says the records exist');
  AskPresentationBlockSchema.parse(receipt);
  assert.equal(tracked.length, 1);
  assert.deepEqual([tracked[0].userId, tracked[0].metadataJson], ['u1', { actionType: 'complete_project', source: 'ask' }]);
  assert.deepEqual([...new Set(db.state.writes.map((w) => w.model))].sort(), ['project'], 'the project row is the only model written directly; the outbox row is checked above');
  assert.deepEqual(validate('DIY_PROJECT_COMPLETE', result, 'OWNER').blocks[0].actions.map((a) => a.id), ['diy-show-projects'], 'the receipt is not a dead end: its one way forward stays inside Ask, and no link out to the desktop page');
  assert.deepEqual(validate('DIY_PROJECT_COMPLETE', result, 'OWNER').blocks[0].actions[0].operationId, 'DIY_PROJECTS');
  // The guide afterwards is the finished-project view (7C), with no step, finish, stop or hand-off action.
  const after = await guide();
  assert.equal(after.reasonCode, 'DIY_PROJECT_FINISHED_VIEW');
  assert.equal(actionsOf(after).some((a) => /^diy-(step|project)-/.test(a.id)), false);
});

test('finish confirm replay and concurrent finish: "already", no second event, no second ledger row, NO analytics', async () => {
  resolveAll();
  const proposed = await proposeFinish({});
  await confirm('DIY_PROJECT_COMPLETE', proposed.parameters);
  const again = await confirm('DIY_PROJECT_COMPLETE', proposed.parameters);
  assert.equal(again.result.reasonCode, 'DIY_PROJECT_ALREADY_COMPLETED');
  assert.deepEqual(validate('DIY_PROJECT_COMPLETE', again.result, 'OWNER').blocks[0].actions.map((a) => a.id), ['diy-show-projects'], 'the "already" receipt also leads on');
  assert.equal(db.state.events.length, 1);
  assert.equal(db.state.domainEvents.length, 1);
  assert.equal(tracked.length, 1, 'only the first, newly applied completion emitted');
  // A concurrent finisher: the pre-check read still says open, the transaction finds it closed with the status.
  const h = (() => { install(); resolveAll(); return null; })(); void h;
  const p2 = await proposeFinish({});
  const stale = structuredClone(await diyService.getProjectGuideSource('p1', 'prop-1'));
  await confirm('DIY_PROJECT_COMPLETE', p2.parameters); // the "other" finisher wins
  tracked.length = 0;
  diyService.getProjectGuideSource = async () => structuredClone(stale);
  const loser = await confirm('DIY_PROJECT_COMPLETE', p2.parameters);
  assert.equal(loser.result.reasonCode, 'DIY_PROJECT_ALREADY_COMPLETED');
  assert.equal(tracked.length, 0, 'the loser emits nothing');
  assert.equal(db.state.domainEvents.length, 1);
});

test('finish confirm refusals: a changed project, a step reopened after the pre-check, a guide withdrawn after it, a revoked role, a project closed another way, a viewer; no write, no analytics', async () => {
  resolveAll();
  const proposed = await proposeFinish({});
  const base = committed();
  // 1. changed: another step moved (context version).
  stepRow('s3').status = 'PENDING';
  assert.equal(await codeOf(confirm('DIY_PROJECT_COMPLETE', proposed.parameters)), 'ASK_CONTEXT_VERSION_CONFLICT');
  stepRow('s3').status = 'SKIPPED';
  // The races: the pre-check reads a stale snapshot, the transaction sees the truth.
  const staleSource = structuredClone(await diyService.getProjectGuideSource('p1', 'prop-1'));
  const stale = () => { diyService.getProjectGuideSource = async () => structuredClone(staleSource); };
  stale(); stepRow('s1').status = 'IN_PROGRESS'; // a step reopened on the page; the project token is untouched in the stale read
  assert.equal(await codeOf(confirm('DIY_PROJECT_COMPLETE', proposed.parameters)), 'ASK_CONTEXT_VERSION_CONFLICT', 'steps still open: DIY_PROJECT_STEPS_INCOMPLETE mapped');
  stepRow('s1').status = 'COMPLETED';
  stale(); db.state.templates.get('t1').publishedRevisionId = null;
  assert.equal(await codeOf(confirm('DIY_PROJECT_COMPLETE', proposed.parameters)), 'ASK_CONFIRMATION_NOT_ACTIVE', 'withdrawn after the pre-check');
  db.state.templates.get('t1').publishedRevisionId = 'rev-1';
  stale(); dbRole = 'VIEWER';
  assert.equal(await codeOf(confirm('DIY_PROJECT_COMPLETE', proposed.parameters)), 'ASK_PERMISSION_REQUIRED', 'role revoked after the pre-check');
  dbRole = 'CONTRIBUTOR';
  diyService.getProjectGuideSource = original.source;
  assert.equal(await codeOf(confirm('DIY_PROJECT_COMPLETE', proposed.parameters, 'VIEWER')), 'ASK_PERMISSION_REQUIRED');
  assert.equal(await codeOf(confirm('DIY_PROJECT_COMPLETE', { ...proposed.parameters, diyProjectId: undefined })), 'ASK_CONFIRMATION_NOT_ACTIVE');
  project().status = 'HIRED_OUT';
  assert.equal(await codeOf(confirm('DIY_PROJECT_COMPLETE', proposed.parameters)), 'ASK_CONFIRMATION_NOT_ACTIVE', 'closed another way');
  project().status = 'IN_PROGRESS';
  assert.equal(committed(), base);
  assert.equal(tracked.length, 0, 'no analytics for any refusal');
});

test('the project token is the one PROPOSED, independent of the context version: a project touched after the proposal is refused even if the early check were satisfied (finish and stop)', async () => {
  resolveAll();
  const finish = await proposeFinish({});
  const stop = await proposeStop('STOP', {});
  project().updatedAt = new Date(project().updatedAt.getTime() + 9); // e.g. a note saved on the page: same steps, new project version
  const fresh = await diyService.getProjectGuideSource('p1', 'prop-1');
  const forged = (parameters) => ({ ...parameters, diyProjectContextVersion: policy.guideContextVersion(fresh) });
  assert.equal(await codeOf(confirm('DIY_PROJECT_COMPLETE', forged(finish.parameters))), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(await codeOf(confirm('DIY_PROJECT_ABANDON', forged(stop.parameters))), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(project().status, 'IN_PROGRESS');
  assert.equal(db.state.events.length, 0);
  assert.equal(tracked.length, 0);
});

test('analytics are best-effort: an emitter that throws never fails a finish, and the receipt is unchanged', async () => {
  resolveAll();
  analytics.analyticsEmitter.track = () => { throw new Error('emitter down'); };
  const { result } = await confirm('DIY_PROJECT_COMPLETE', (await proposeFinish({})).parameters);
  assert.equal(result.reasonCode, 'DIY_PROJECT_COMPLETED');
  assert.equal(project().status, 'COMPLETED');
});

// ---- stop and hand off ------------------------------------------------------------------------------------------------------------------------------------

test('stop and hand off propose: declared actions only; the confirmation says it cannot be undone, names the untouched linked task, and says a hand-off books nobody', async () => {
  const refused = async (result) => { assert.equal(result.reasonCode, 'DIY_PROJECT_NOT_DIRECTLY_ROUTABLE'); assert.ok(!result.confirmation); };
  await refused(await proposeStop('STOP', {}, 'please stop the project'));
  await refused(await proposeStop('STOP', { surface: 'ASK_REFRESH' }));
  await refused(await proposeStop('STOP', {}, MSG.HAND_OFF)); // the action id says STOP, the message says hand off
  await refused(await proposeStop('STOP', { entityType: 'DIY_STEP' }));
  project().maintenanceTaskId = 'task-1'; hooks.tasks.push({ id: 'task-1', propertyId: 'prop-1', status: 'PENDING' });
  const stop = await proposeStop('STOP', {});
  assert.equal(stop.status, 'NEEDS_CONFIRMATION');
  assert.match(stop.confirmation.description, /cannot be undone in Cozy/);
  assert.match(stop.confirmation.description, /linked maintenance task is not changed/);
  assert.deepEqual(stop.confirmation.fields.find((f) => f.label === 'Linked maintenance task'), { label: 'Linked maintenance task', value: 'Not changed' });
  assert.deepEqual(stop.confirmation.fields.find((f) => f.label === 'Can be undone'), { label: 'Can be undone', value: 'No' });
  assert.equal(stop.confirmation.confirmLabel, 'Stop project');
  assert.equal(stop.parameters.diyProjectOutcome, 'ABANDONED');
  const hand = await proposeStop('HAND_OFF', {});
  assert.match(hand.confirmation.description, /does not book or contact anyone/);
  assert.deepEqual(hand.confirmation.fields.find((f) => f.label === 'Booking'), { label: 'Booking', value: 'Cozy books and contacts nobody' });
  assert.equal(hand.parameters.diyProjectOutcome, 'HIRED_OUT');
  for (const r of [stop, hand]) { r.blocks.forEach((b) => AskPresentationBlockSchema.parse(b)); validate('DIY_PROJECT_ABANDON', r, 'OWNER'); }
  assert.equal(project().status, 'IN_PROGRESS', 'a proposal changes nothing');
});

test('stop and hand off propose refusals: a viewer, an unknown project, a project closed another way; the same status answers "already"', async () => {
  const code = async (promise) => (await promise).reasonCode;
  const before = committed();
  role = 'VIEWER';
  assert.equal(await code(proposeStop('STOP', {})), 'ASK_PERMISSION_REQUIRED');
  role = 'CONTRIBUTOR';
  assert.equal(await code(capabilityInvoke('DIY_PROJECT_ABANDON', { userId: 'u1', propertyId: 'prop-1', message: MSG.STOP, launchContext: launchFor('DIY_PROJECT_ABANDON', 'DIY_PROJECT', 'nope', 'STOP') })), 'DIY_PROJECT_NOT_FOUND');
  assert.equal(committed(), before);
  project().status = 'COMPLETED';
  assert.equal(await code(proposeStop('STOP', {})), 'DIY_PROJECT_CLOSED');
  project().status = 'ABANDONED';
  assert.equal(await code(proposeStop('STOP', {})), 'DIY_PROJECT_ALREADY_STOPPED');
  assert.equal(await code(proposeStop('HAND_OFF', {})), 'DIY_PROJECT_CLOSED');
  project().status = 'HIRED_OUT';
  assert.equal(await code(proposeStop('HAND_OFF', {})), 'DIY_PROJECT_ALREADY_HANDED_OFF');
});

test('stop and hand off confirm: the status, the actor, abandonedAt and one ledger row; NO outbox event and NO linked-task or step write; analytics once with hireOut; the receipt claims nothing more', async () => {
  project().maintenanceTaskId = 'task-1'; hooks.tasks.push({ id: 'task-1', propertyId: 'prop-1', status: 'PENDING' });
  const taskBefore = JSON.stringify(hooks.tasks);
  const stop = await confirm('DIY_PROJECT_ABANDON', (await proposeStop('STOP', {})).parameters);
  assert.equal(project().status, 'ABANDONED');
  assert.ok(project().abandonedAt instanceof Date);
  assert.deepEqual(db.state.events.map((e) => [e.type, e.actorUserId, e.toStatus]), [['PROJECT_ABANDONED', 'u1', 'ABANDONED']]);
  assert.equal(db.state.domainEvents.length, 0, 'no outbox event');
  assert.equal(JSON.stringify(hooks.tasks), taskBefore, 'the linked task is untouched');
  assert.deepEqual([...new Set(db.state.writes.map((w) => w.model))].sort(), ['project']);
  assert.equal(stop.result.blocks[0].title, 'Project stopped');
  assert.match(stop.result.blocks[0].description, /Nothing else was changed/);
  assert.deepEqual(tracked.map((e) => e.metadataJson), [{ actionType: 'abandon_project', hireOut: false, source: 'ask' }]);
  AskPresentationBlockSchema.parse(stop.result.blocks[0]);
  assert.deepEqual(validate('DIY_PROJECT_ABANDON', stop.result, 'OWNER').blocks[0].actions.map((a) => a.id), ['diy-show-projects'], 'a stopped project leads on to the DIY projects, inside Ask');

  install(); // a fresh project for the hand-off
  const hand = await confirm('DIY_PROJECT_ABANDON', (await proposeStop('HAND_OFF', {})).parameters);
  assert.equal(project().status, 'HIRED_OUT');
  assert.equal(db.state.events[0].type, 'PROJECT_HIRED_OUT');
  assert.equal(hand.result.blocks[0].title, 'Handed off');
  assert.match(hand.result.blocks[0].description, /Nobody was booked or contacted/);
  assert.equal(tracked[0].metadataJson.hireOut, true);
  assert.deepEqual(validate('DIY_PROJECT_ABANDON', hand.result, 'OWNER').blocks[0].actions.map((a) => a.id), ['diy-show-projects'], 'so does a hand-off');
});

test('stop and hand off confirm: a replay or a concurrent stop is "already" with no analytics; refusals for a changed project, a revoked role and another closure write nothing', async () => {
  const proposed = await proposeStop('STOP', {});
  await confirm('DIY_PROJECT_ABANDON', proposed.parameters);
  const alreadyStopped = await confirm('DIY_PROJECT_ABANDON', proposed.parameters);
  assert.equal(alreadyStopped.result.reasonCode, 'DIY_PROJECT_ALREADY_STOPPED');
  assert.deepEqual(validate('DIY_PROJECT_ABANDON', alreadyStopped.result, 'OWNER').blocks[0].actions.map((a) => a.id), ['diy-show-projects'], 'the "already" receipt also leads on');
  assert.equal(db.state.events.length, 1);
  assert.equal(tracked.length, 1);

  install();
  const p2 = await proposeStop('STOP', {});
  const base = committed();
  stepRow('s1').status = 'IN_PROGRESS'; // the project changed (a step moved): the context version differs
  assert.equal(await codeOf(confirm('DIY_PROJECT_ABANDON', p2.parameters)), 'ASK_CONTEXT_VERSION_CONFLICT');
  stepRow('s1').status = 'PENDING';
  const stale = structuredClone(await diyService.getProjectGuideSource('p1', 'prop-1'));
  diyService.getProjectGuideSource = async () => structuredClone(stale);
  dbRole = 'VIEWER';
  assert.equal(await codeOf(confirm('DIY_PROJECT_ABANDON', p2.parameters)), 'ASK_PERMISSION_REQUIRED', 'the role is checked inside the service transaction');
  dbRole = 'CONTRIBUTOR';
  project().status = 'COMPLETED'; // closed another way after the pre-check
  assert.equal(await codeOf(confirm('DIY_PROJECT_ABANDON', p2.parameters)), 'ASK_CONFIRMATION_NOT_ACTIVE');
  project().status = 'IN_PROGRESS';
  assert.equal(committed(), base);
  assert.equal(tracked.length, 0);
  assert.equal(await codeOf(confirm('DIY_PROJECT_ABANDON', p2.parameters, 'VIEWER')), 'ASK_PERMISSION_REQUIRED');
  assert.equal(await codeOf(confirm('DIY_PROJECT_ABANDON', { ...p2.parameters, diyProjectOutcome: 'COMPLETED' })), 'ASK_CONFIRMATION_NOT_ACTIVE');
});

test('THE PAGE PATH: abandonProject now checks the role INSIDE its transaction for every caller; a viewer or a stranger is refused and nothing changes', async () => {
  const token = project().updatedAt.toISOString();
  const call = (actorUserId) => diyService.abandonProject('p1', 'prop-1', false, { actorUserId, expectedUpdatedAt: token });
  dbRole = 'VIEWER';
  assert.equal(await codeOf(call('u1')), 'DIY_ACCESS_REVOKED');
  dbRole = null;
  assert.equal(await codeOf(call('nobody')), 'DIY_ACCESS_REVOKED');
  assert.equal(project().status, 'IN_PROGRESS');
  assert.equal(db.state.events.length, 0);
  dbRole = 'CONTRIBUTOR';
  await call('u1');
  assert.equal(project().status, 'ABANDONED');
});

test('the COMPLETE_PROJECT policy: a reviewed, intact, not-withdrawn guide; a superseded one is fine; the page path (no policy) is unaffected', async () => {
  const src = async () => diyService.getProjectGuideSource('p1', 'prop-1');
  assert.deepEqual(policy.evaluateAskProjectPolicy(await src(), 'COMPLETE_PROJECT'), { ok: true });
  db.state.templates.get('t1').publishedRevisionId = null;
  assert.deepEqual([policy.evaluateAskProjectPolicy(await src(), 'COMPLETE_PROJECT').code, policy.evaluateAskProjectPolicy(await src(), 'COMPLETE_PROJECT').reason], ['DIY_GUIDE_NOT_CURRENT', 'WITHDRAWN']);
  // The page can still finish a project whose guide was withdrawn.
  resolveAll();
  const token = project().updatedAt.toISOString();
  assert.equal(await codeOf(diyService.completeProject('p1', 'prop-1', {}, { actorUserId: 'u1', expectedUpdatedAt: token, askPolicy: 'COMPLETE_PROJECT' })), 'DIY_GUIDE_NOT_CURRENT');
  assert.equal(project().status, 'IN_PROGRESS');
  await diyService.completeProject('p1', 'prop-1', {}, { actorUserId: 'u1', expectedUpdatedAt: token });
  assert.equal(project().status, 'COMPLETED');
});

// ---- registration -----------------------------------------------------------------------------------------------------------------------------------------

test('registry facts: two CONTRIBUTOR, confirmation-gated, non-routable commands with NO correction mode (irreversible), refreshing the guide and the list', () => {
  for (const id of ['DIY_PROJECT_COMPLETE', 'DIY_PROJECT_ABANDON']) {
    const command = getAskDomainCommandByOperation(id);
    assert.deepEqual([command.roleFloor, command.correctionModes, command.material], ['CONTRIBUTOR', [], true]);
    assert.equal(ASK_OPERATION_DEFINITIONS[id].family, 'COMMAND');
    assert.equal(isAskMessageRoutableOperation(id), false);
    assert.match(fs.readFileSync(path.join(__dirname, '../../src/services/ask/execution/executeOperation.ts'), 'utf8'), new RegExp(`${id}: \\['DIY_PROJECT_GUIDE', 'DIY_PROJECTS'\\]`));
  }
  assert.equal(getAskDomainCommandByOperation('DIY_PROJECT_COMPLETE').adapterKey, 'diy.project-complete');
  assert.equal(getAskDomainCommandByOperation('DIY_PROJECT_ABANDON').adapterKey, 'diy.project-abandon');
  const { DIY_SKILL } = require('../../src/services/skills/diy/skill.manifest.ts');
  assert.equal(DIY_SKILL.riskPolicy.reversibility, 'IRREVERSIBLE');
  assert.ok(DIY_SKILL.consumerPolicy[0].operations.includes('DIY_PROJECT_COMPLETE') && DIY_SKILL.consumerPolicy[0].operations.includes('DIY_PROJECT_ABANDON'));
});

test('the handler source: the declared-action guard, ASK_REFRESH, the policy flag, the analytics only after a real write, and no direct database write', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/ask/handlers/diyProjectCommands.handler.ts'), 'utf8');
  assert.match(source, /launchContext\.surface === 'ASK_REFRESH'/);
  assert.match(source, /askPolicy: 'COMPLETE_PROJECT'/);
  assert.match(source, /if \(applied\) track\(/);
  assert.doesNotMatch(source, /prisma\./);
  assert.doesNotMatch(source, /\.(create|update|updateMany|delete|upsert)\(/);
});
