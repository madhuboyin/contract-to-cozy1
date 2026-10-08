const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Step 7C of the stateful GUIDE (docs/architecture/ASK_COZY_DIY_PROJECT_COMMANDS_PLAN.md section 3.6): the finished-project view with the status of the records after a completion,
// the task-link status on an open guide, and DIY_COMPLETION_RECOVER (queue a dead-lettered request again). The real handlers and service run on the shared database-free fake.
// Not Postgres, not a browser.
const { makeDiyDb } = require('../helpers/diyTemplateFake.js');
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { buildRevisionContent, computeContentHash } = require('../../src/services/diyTemplateRevision.service.ts');
const { stepSnapshotId } = require('../../src/services/diyPublishedTemplate.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { ASK_OPERATION_DEFINITIONS, isAskMessageRoutableOperation, getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { diyService } = require('../../src/services/diy.service.ts');
const { diyProjectGuideResult } = require('../../src/services/ask/handlers/diyProjectGuide.handler.ts');
const { DIY_COMPLETION_EVENT_KEY } = require('../../src/services/diy/diyCompletionEffects.ts');
const { DIY_TASK_RECONCILE_EVENT_KEY } = require('../../src/services/diy/diyTaskReconciliationRequest.ts');
const { TASK_LINK_COPY } = require('../../src/services/diy/taskLinkStatus.ts');
const { COMPLETION_EFFECTS_COPY } = require('../../src/services/diy/completionEffectsStatus.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const T0 = new Date('2026-10-06T12:00:00.000Z');
const NOW = new Date('2026-10-06T13:00:00.000Z');
const template = () => ({
  id: 't1', slug: 'repaint-hallway', title: 'Repaint a hallway', shortDescription: 'Fresh coat of paint.', longDescription: 'Longer text.', category: 'PAINTING',
  difficultyLevel: 'EASY', requiredSkillLevel: 'BEGINNER', safetyLevel: 'LOW', permitRequirement: 'NOT_REQUIRED', estimatedMinutes: 120, tags: ['paint'],
  steps: [
    { stepNumber: 1, title: 'Tape the trim', description: 'Apply painter tape along the trim.', estimatedMinutes: 20, isOptional: false, safetyNote: 'Keep a window open while you work.', tipNote: null },
    { stepNumber: 2, title: 'Cut in the edges', description: 'Brush the corners first.', estimatedMinutes: 30, isOptional: false, safetyNote: null, tipNote: null },
  ],
  materials: [], tools: [],
});
const revisionRow = () => {
  const content = buildRevisionContent(template());
  return { id: 'rev-1', templateId: 't1', revision: 1, provenance: 'GOVERNED', ...content.columns, contentJson: content.contentJson, contentHash: computeContentHash(content), retiredAt: null, retiredReason: null };
};
const stepRows = (revision, status = 'PENDING') => revision.contentJson.steps.map((step, i) => ({
  id: `s${i + 1}`, stepNumber: step.stepNumber, templateStepId: stepSnapshotId(revision.id, step.stepNumber), title: step.title, description: step.description,
  estimatedMinutes: step.estimatedMinutes ?? null, isOptional: step.isOptional, safetyNote: step.safetyNote ?? null, tipNote: step.tipNote ?? null,
  status, notes: null, completedAt: null, completedByUserId: null, updatedAt: new Date(T0.getTime() + step.stepNumber),
}));

const original = { prisma: prismaModule.prisma, resolveAccess: propertyAccess.resolvePropertyAccess, effects: diyService.readProjectEffects };
let db; let role; let dbRole; let hooks;
function install() {
  role = 'CONTRIBUTOR'; dbRole = 'CONTRIBUTOR';
  hooks = { role: () => dbRole, tasks: [] };
  db = makeDiyDb([], hooks);
  db.askExecution = { findMany: async () => [] };
  const revision = revisionRow();
  db.state.revisions.push(revision);
  db.state.templates.set('t1', { id: 't1', publishedRevisionId: 'rev-1', steps: [], materials: [], tools: [] });
  db.state.projects.push({
    id: 'p1', propertyId: 'prop-1', userId: 'creator', title: 'Repaint the hallway', category: 'PAINTING', templateId: 't1', templateRevisionId: 'rev-1', aiGuideId: null, completionBasis: null,
    maintenanceTaskId: null, status: 'COMPLETED', startedAt: T0, completedAt: T0, completedByUserId: 'u9', notesJson: null, updatedAt: T0, materials: [], tools: [], aiGuide: null,
    steps: stepRows(revision, 'COMPLETED'),
  });
  prismaModule.prisma = db;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
}
function restore() { prismaModule.prisma = original.prisma; propertyAccess.resolvePropertyAccess = original.resolveAccess; diyService.readProjectEffects = original.effects; }
test.beforeEach(install);
test.afterEach(restore);

const project = () => db.state.projects[0];
let eventSeq = 0;
const addEvent = (key, status, payload = {}) => {
  eventSeq += 1;
  const row = { id: `ev-${eventSeq}`, type: 'DIY_PROJECT_COMPLETED', idempotencyKey: key, status, attempts: 3, lastError: status === 'DEAD_LETTER' ? 'boom' : null, updatedAt: new Date(T0.getTime() + eventSeq), payload };
  db.state.domainEvents.push(row);
  return row;
};
const completionEvent = (status) => addEvent(DIY_COMPLETION_EVENT_KEY('p1'), status, { projectId: 'p1' });
const openWithDeadTaskLink = (eventStatus = 'DEAD_LETTER') => {
  project().status = 'IN_PROGRESS'; project().completedAt = null; project().maintenanceTaskId = 'task-1';
  project().steps.forEach((s) => { s.status = 'PENDING'; });
  hooks.tasks.push({ id: 'task-1', propertyId: 'prop-1', status: 'COMPLETED', completionMetadata: { reconciliationOccurrenceId: 'occ-1' } });
  return addEvent(DIY_TASK_RECONCILE_EVENT_KEY('task-1', 'occ-1'), eventStatus, { projectIds: ['p1'] });
};
const launchFor = (key, overrides = {}) => ({ surface: 'ASK_WORKSPACE', entityType: 'DIY_PROJECT', entityId: 'p1', operationId: 'DIY_COMPLETION_RECOVER', actionId: key, sourceExecutionId: null, ...overrides });
const MSG = { COMPLETION_EFFECTS: 'Record my completion again.', TASK_LINK: 'Update my linked task again.' };
const propose = (key, overrides, message = MSG[key]) => capabilityInvoke('DIY_COMPLETION_RECOVER', { userId: 'u1', propertyId: 'prop-1', message, launchContext: launchFor(key, overrides) });
const execution = () => ({ id: 'exec-1', propertyId: 'prop-1', sessionId: 's1', userId: 'u1', operationId: 'DIY_COMPLETION_RECOVER', createdAt: new Date() });
const confirm = (parameters, asRole = 'CONTRIBUTOR') => confirmCapabilityInvoke('DIY_COMPLETION_RECOVER', { userId: 'u1', execution: execution(), parameters, access: { role: asRole }, command: getAskDomainCommandByOperation('DIY_COMPLETION_RECOVER') });
const codeOf = async (promise) => { try { await promise; return null; } catch (error) { return error.code ?? `NO_CODE:${error.message}`; } };
const guideLaunch = { surface: 'ASK_WORKSPACE', entityType: 'DIY_PROJECT', entityId: 'p1' };
const guide = (canEdit = true) => diyProjectGuideResult('prop-1', guideLaunch, NOW, canEdit);
const actionsOf = (result) => result.blocks.flatMap((block) => block.actions ?? []);
const cardOf = (result) => result.blocks.find((b) => b.type === 'TASK_GUIDE');
const eventsState = () => JSON.stringify(db.state.domainEvents);
const validate = (operationId, result, householdRole) => validateAskAnswerTrust({
  question: 'q', operationId, propertyId: 'prop-1',
  result: { ...result, parameters: { ...(result.parameters ?? {}), audiencePresentation: { householdRole }, answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: getAskOperationDefinition(operationId).adapterKey, operationId, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: new Date().toISOString() }] } } },
}).result;

// ---- the finished-project view ---------------------------------------------------------------------------------------------------------------------------------

test('the finished view says in words what is known about the records, for each outbox state; the recovery action only for a dead letter and only to a person who can edit', async () => {
  const cases = [['PENDING', COMPLETION_EFFECTS_COPY.RECORDING, false], ['PROCESSING', COMPLETION_EFFECTS_COPY.RECORDING, false], ['FAILED', COMPLETION_EFFECTS_COPY.RECORDING, false],
    ['PROCESSED', COMPLETION_EFFECTS_COPY.RECORDED, false], ['DEAD_LETTER', COMPLETION_EFFECTS_COPY.NEEDS_ATTENTION, true]];
  for (const [status, text, offered] of cases) {
    install(); completionEvent(status);
    const result = await guide();
    assert.equal(result.reasonCode, 'DIY_PROJECT_FINISHED_VIEW', status);
    result.blocks.forEach((b) => AskPresentationBlockSchema.parse(b));
    assert.match(cardOf(result).main.body, new RegExp(text.replace(/\./g, '\\.')), status);
    assert.equal(actionsOf(result).some((a) => a.id === 'diy-record-again'), offered, `${status}: recovery offered only for a dead letter`);
    assert.equal(actionsOf(await guide(false)).some((a) => a.id === 'diy-record-again'), false, `${status}: never to a viewer`);
    assert.ok(actionsOf(result).every((a) => a.id !== 'open-diy-project'), 'no link out to the desktop page');
  }
  install(); completionEvent('DEAD_LETTER');
  assert.deepEqual(actionsOf(await guide()).find((a) => a.id === 'diy-record-again'), { id: 'diy-record-again', label: 'Record my completion again', interactionType: 'START_WORKFLOW', message: 'Record my completion again.', operationId: 'DIY_COMPLETION_RECOVER', entityType: 'DIY_PROJECT', entityId: 'p1', actionId: 'COMPLETION_EFFECTS', style: 'SECONDARY' });
});

test('the finished view is a read-only TASK_GUIDE with no "current" step; a legacy completion and a project closed from its linked task show their disclosure and offer NO recovery', async () => {
  completionEvent('DEAD_LETTER');
  const before = JSON.stringify([project(), db.state.domainEvents]);
  const result = await guide();
  const card = cardOf(result);
  assert.equal(result.blocks.some((b) => b.type === 'SUMMARY'), false, 'never a SUMMARY: the calm shell would show only its first action');
  assert.equal(card.outline.some((o) => o.state === 'CURRENT'), false);
  assert.match(card.progress.label, /^Finished, 2 of 2 steps done/);
  assert.equal(JSON.stringify([project(), db.state.domainEvents]), before);
  assert.equal(db.state.writes.length, 0, 'a view writes nothing');
  // Legacy: completed before effect tracking (no basis, no event).
  install();
  assert.match(cardOf(await guide()).main.body, /before effect tracking was added/);
  assert.equal(actionsOf(await guide()).some((a) => a.id === 'diy-record-again'), false);
  // Closed from its linked task: the closed-by-task disclosure and no action.
  install(); project().completionBasis = 'LINKED_TASK'; project().maintenanceTaskId = 'task-1';
  const closed = await guide();
  assert.match(cardOf(closed).main.body, new RegExp(TASK_LINK_COPY.CLOSED_COMPLETED.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(actionsOf(closed).some((a) => /record-again/.test(a.id)), false);
});

test('a project that is not a reviewed template project, and one stopped or handed off, keep the plain "finished" answer: no steps of an unreviewed project are shown', async () => {
  project().aiGuideId = 'g1';
  const ai = await guide();
  assert.equal(ai.reasonCode, 'DIY_GUIDE_PROJECT_FINISHED');
  assert.equal(JSON.stringify(ai).includes('Tape the trim'), false);
  install(); project().status = 'ABANDONED';
  assert.equal((await guide()).reasonCode, 'DIY_GUIDE_PROJECT_FINISHED');
  project().status = 'HIRED_OUT';
  assert.equal((await guide()).reasonCode, 'DIY_GUIDE_PROJECT_FINISHED');
});

test('the open guide shows a RECOVERABLE linked-task failure as a caution block above the step safety note (which stays directly above the card); other states show nothing', async () => {
  openWithDeadTaskLink('DEAD_LETTER');
  const result = await guide();
  assert.equal(result.reasonCode, 'DIY_PROJECT_GUIDE_READY');
  const ids = result.blocks.map((b) => b.id);
  assert.ok(ids.indexOf('diy-task-link') < ids.indexOf('diy-step-safety'), 'the task block comes first');
  assert.equal(result.blocks[result.blocks.findIndex((b) => b.type === 'TASK_GUIDE') - 1].id, 'diy-step-safety', 'the safety note is still directly above the card');
  const block = result.blocks.find((b) => b.id === 'diy-task-link');
  assert.deepEqual([block.severity, block.body], ['CAUTION', TASK_LINK_COPY.NEEDS_ATTENTION]);
  assert.deepEqual(block.actions.map((a) => [a.id, a.operationId, a.actionId, a.message]), [['diy-task-record-again', 'DIY_COMPLETION_RECOVER', 'TASK_LINK', 'Update my linked task again.']]);
  result.blocks.forEach((b) => AskPresentationBlockSchema.parse(b));
  assert.deepEqual((await guide(false)).blocks.find((b) => b.id === 'diy-task-link').actions, [], 'a viewer sees the text, not the action');
  for (const status of ['PENDING', 'PROCESSING', 'FAILED', 'PROCESSED']) {
    install(); openWithDeadTaskLink(status);
    assert.equal((await guide()).blocks.some((b) => b.id === 'diy-task-link'), false, status);
  }
  install(); project().status = 'IN_PROGRESS';
  assert.equal((await guide()).blocks.some((b) => b.id === 'diy-task-link'), false, 'no linked task');
});

// ---- propose ------------------------------------------------------------------------------------------------------------------------------------------------------

test('propose: typed wording, a refresh, a wrong action id or entity never open a confirmation; a viewer, an unknown project and every state with nothing to queue are refused with nothing written', async () => {
  completionEvent('DEAD_LETTER');
  const before = eventsState();
  const refused = (r) => { assert.equal(r.reasonCode, 'DIY_RECOVER_NOT_DIRECTLY_ROUTABLE'); assert.ok(!r.confirmation); };
  refused(await propose('COMPLETION_EFFECTS', {}, 'record my completion again please'));
  refused(await propose('COMPLETION_EFFECTS', { surface: 'ASK_REFRESH' }));
  refused(await propose('COMPLETION_EFFECTS', { actionId: 'TASK_LINK' }));
  refused(await propose('COMPLETION_EFFECTS', { entityType: 'DIY_STEP' }));
  role = 'VIEWER';
  assert.equal((await propose('COMPLETION_EFFECTS', {})).reasonCode, 'ASK_PERMISSION_REQUIRED');
  role = 'CONTRIBUTOR';
  assert.equal((await capabilityInvoke('DIY_COMPLETION_RECOVER', { userId: 'u1', propertyId: 'prop-1', message: MSG.COMPLETION_EFFECTS, launchContext: launchFor('COMPLETION_EFFECTS', { entityId: 'nope' }) })).reasonCode, 'DIY_RECOVER_NOT_FOUND');
  assert.equal(eventsState(), before);
  const states = [['PENDING', 'DIY_RECOVER_ALREADY_QUEUED'], ['FAILED', 'DIY_RECOVER_ALREADY_QUEUED'], ['PROCESSED', 'DIY_RECOVER_NOT_NEEDED']];
  for (const [status, code] of states) { install(); completionEvent(status); assert.equal((await propose('COMPLETION_EFFECTS', {})).reasonCode, code, status); }
  install(); assert.equal((await propose('COMPLETION_EFFECTS', {})).reasonCode, 'DIY_RECOVER_NOT_POSSIBLE', 'a legacy completion');
  install(); completionEvent('DEAD_LETTER');
  assert.equal((await propose('TASK_LINK', {})).reasonCode, 'DIY_RECOVER_NOT_NEEDED', 'the task action on a finished project: its status model cannot offer it');
  install(); openWithDeadTaskLink('DEAD_LETTER');
  assert.equal((await propose('COMPLETION_EFFECTS', {})).reasonCode, 'DIY_RECOVER_NOT_NEEDED', 'the completion action on an open project');
});

test('the confirmation says it only asks Cozy to try again: no success claim, the project unchanged, nothing verified; schema valid and allow-listed', async () => {
  completionEvent('DEAD_LETTER');
  const proposed = await propose('COMPLETION_EFFECTS', {});
  assert.equal(proposed.status, 'NEEDS_CONFIRMATION');
  assert.match(proposed.confirmation.description, /asks Cozy to try again in the background/);
  assert.match(proposed.confirmation.description, /does not change the project/);
  assert.match(proposed.confirmation.description, /cannot tell you whether the retry worked/);
  assert.deepEqual(proposed.confirmation.fields.map((f) => f.label), ['What happens', 'Changes to the project', 'Verified']);
  assert.equal(proposed.confirmation.confirmLabel, 'Try again');
  assert.doesNotMatch(JSON.stringify(proposed), /recorded|has been|was updated/i);
  proposed.blocks.forEach((b) => AskPresentationBlockSchema.parse(b));
  validate('DIY_COMPLETION_RECOVER', proposed, 'OWNER');
  install(); openWithDeadTaskLink('DEAD_LETTER');
  const task = await propose('TASK_LINK', {});
  assert.equal(task.confirmation.title, 'Update your linked task again?');
  assert.match(task.confirmation.description, /linked maintenance task/);
});

// ---- confirm --------------------------------------------------------------------------------------------------------------------------------------------------------

test('confirm re-queues ONLY the dead-lettered row, recording who and how many times; nothing else is written; the receipt says "queued again" and claims nothing', async () => {
  const dead = completionEvent('DEAD_LETTER');
  const projectBefore = JSON.stringify(project());
  const proposed = await propose('COMPLETION_EFFECTS', {});
  const { result, artifactType, artifactId } = await confirm(proposed.parameters);
  const row = db.state.domainEvents.find((e) => e.id === dead.id);
  assert.deepEqual([row.status, row.attempts, row.lastError], ['PENDING', 0, null]);
  assert.deepEqual([row.payload.recovery.count, row.payload.recovery.lastBy], [1, 'u1']);
  assert.equal(JSON.stringify(project()), projectBefore, 'the project is untouched');
  assert.deepEqual([...new Set(db.state.writes.map((w) => w.model))].sort(), ['domainEvent']);
  assert.deepEqual([artifactType, artifactId, result.reasonCode], ['DIY_PROJECT', 'p1', 'DIY_RECOVER_QUEUED']);
  assert.equal(result.blocks[0].title, 'Queued again');
  assert.match(result.blocks[0].description, /does not know yet whether it worked/);
  assert.doesNotMatch(JSON.stringify(result), /verified|recorded successfully|Completion recorded/i);
  AskPresentationBlockSchema.parse(result.blocks[0]);
  assert.deepEqual(validate('DIY_COMPLETION_RECOVER', result, 'OWNER').blocks[0].actions.map((a) => a.id), ['diy-show-projects'], 'the receipt leads on inside Ask');
  // The guide afterwards says it is recording again, with no recovery action.
  const after = await guide();
  assert.match(cardOf(after).main.body, /Recording your completion/);
  assert.equal(actionsOf(after).some((a) => a.id === 'diy-record-again'), false);
});

test('confirm for the task link re-queues the reconciliation event the same way, on an open project', async () => {
  const dead = openWithDeadTaskLink('DEAD_LETTER');
  const proposed = await propose('TASK_LINK', {});
  const { result } = await confirm(proposed.parameters);
  const row = db.state.domainEvents.find((e) => e.id === dead.id);
  assert.deepEqual([row.status, row.payload.recovery.count, row.payload.recovery.lastBy], ['PENDING', 1, 'u1']);
  assert.equal(result.reasonCode, 'DIY_RECOVER_QUEUED');
  assert.equal(project().status, 'IN_PROGRESS');
});

test('a replay, a request someone already queued and a stale confirmation: "already queued" with no second recovery count; a changed state is a plain conflict', async () => {
  const dead = completionEvent('DEAD_LETTER');
  const proposed = await propose('COMPLETION_EFFECTS', {});
  await confirm(proposed.parameters);
  const again = await confirm(proposed.parameters);
  assert.equal(again.result.reasonCode, 'DIY_RECOVER_ALREADY_QUEUED');
  assert.equal(db.state.domainEvents.find((e) => e.id === dead.id).payload.recovery.count, 1);
  // The pre-check reads a stale "dead letter"; the transaction finds it already re-queued by someone else: reset is false, nothing is written, nothing is claimed.
  install(); const dead2 = completionEvent('DEAD_LETTER');
  const p2 = await propose('COMPLETION_EFFECTS', {});
  const staleEffects = structuredClone(await diyService.readProjectEffects('p1', 'prop-1'));
  diyService.readProjectEffects = async () => structuredClone(staleEffects);
  db.state.domainEvents.find((e) => e.id === dead2.id).status = 'PENDING';
  const raced = await confirm(p2.parameters);
  assert.equal(raced.result.reasonCode, 'DIY_RECOVER_ALREADY_QUEUED');
  assert.equal(db.state.domainEvents.find((e) => e.id === dead2.id).payload.recovery, undefined, 'no recovery recorded for a request that was not re-queued here');
  diyService.readProjectEffects = original.effects;
  // The event finished processing meanwhile: the context moved, so this is a conflict rather than a claim.
  install(); const dead3 = completionEvent('DEAD_LETTER');
  const p3 = await propose('COMPLETION_EFFECTS', {});
  db.state.domainEvents.find((e) => e.id === dead3.id).status = 'PROCESSED';
  assert.equal(await codeOf(confirm(p3.parameters)), 'ASK_CONTEXT_VERSION_CONFLICT');
});

test('confirm refusals: a viewer (handler context and the database role INSIDE the transaction), malformed parameters; nothing changes', async () => {
  const dead = completionEvent('DEAD_LETTER');
  const proposed = await propose('COMPLETION_EFFECTS', {});
  const before = eventsState();
  assert.equal(await codeOf(confirm(proposed.parameters, 'VIEWER')), 'ASK_PERMISSION_REQUIRED');
  assert.equal(await codeOf(confirm({ ...proposed.parameters, diyRecoverKind: 'NOPE' })), 'ASK_CONFIRMATION_NOT_ACTIVE');
  assert.equal(await codeOf(confirm({ ...proposed.parameters, diyProjectId: undefined })), 'ASK_CONFIRMATION_NOT_ACTIVE');
  dbRole = 'VIEWER'; // revoked after Ask's own check
  assert.equal(await codeOf(confirm(proposed.parameters, 'CONTRIBUTOR')), 'ASK_PERMISSION_REQUIRED');
  dbRole = 'CONTRIBUTOR';
  assert.equal(eventsState(), before);
  assert.equal(db.state.domainEvents.find((e) => e.id === dead.id).status, 'DEAD_LETTER');
});

// ---- the service: the whole decision is one transaction --------------------------------------------------------------------------------------------------

test('THE SERVICE: both retry methods run the role check, the lookups, the eligibility check and the re-queue INSIDE one transaction (NOT ONE call on the global client), and refuse a revoked role', async () => {
  const globalCalls = [];
  const spy = (object, name, label) => { const real = object[name].bind(object); object[name] = async (...args) => { globalCalls.push(label); return real(...args); }; };
  const spyAll = () => {
    spy(db.domainEvent, 'findUnique', 'domainEvent.findUnique'); spy(db.domainEvent, 'updateMany', 'domainEvent.updateMany'); spy(db.householdMember, 'findUnique', 'householdMember.findUnique');
    spy(db.diyProject, 'findFirst', 'diyProject.findFirst'); spy(db.propertyMaintenanceTask, 'findFirst', 'propertyMaintenanceTask.findFirst');
  };
  const dead = completionEvent('DEAD_LETTER');
  spyAll();
  const outcome = await diyService.retryCompletionEffects('p1', 'prop-1', 'u1');
  assert.equal(outcome.reset, true);
  assert.equal(db.state.domainEvents.find((e) => e.id === dead.id).status, 'PENDING', 'the re-queue really happened (through the transaction client)');
  assert.deepEqual(globalCalls, [], 'the completion retry made no call on the global client');

  install(); openWithDeadTaskLink('DEAD_LETTER'); globalCalls.length = 0; spyAll();
  const task = await diyService.retryTaskReconciliation('p1', 'prop-1', 'u1');
  assert.equal(task.reset, true);
  assert.deepEqual(globalCalls, [], 'the task retry made no call on the global client');

  install(); const dead2 = completionEvent('DEAD_LETTER');
  dbRole = 'VIEWER';
  assert.equal(await codeOf(diyService.retryCompletionEffects('p1', 'prop-1', 'u1')), 'DIY_ACCESS_REVOKED');
  assert.equal(db.state.domainEvents.find((e) => e.id === dead2.id).status, 'DEAD_LETTER');
  install(); openWithDeadTaskLink('DEAD_LETTER'); dbRole = 'VIEWER';
  assert.equal(await codeOf(diyService.retryTaskReconciliation('p1', 'prop-1', 'u1')), 'DIY_ACCESS_REVOKED');
});

test('the handler asks the canonical status model AND the project state: a status model that disagrees with the project (a finished project with a task link, an open one with completion effects) offers nothing', async () => {
  completionEvent('DEAD_LETTER');
  diyService.readProjectEffects = async () => ({ status: 'IN_PROGRESS', completionEffects: { state: 'NEEDS_ATTENTION', summary: 'x', canRecover: true }, taskLink: null, versions: { completion: null, task: null } });
  assert.equal((await propose('COMPLETION_EFFECTS', {})).reasonCode !== 'DIY_COMPLETION_RECOVER_CONFIRMATION_REQUIRED', true);
  diyService.readProjectEffects = async () => ({ status: 'COMPLETED', completionEffects: null, taskLink: { state: 'NEEDS_ATTENTION', summary: 'x', canRecover: true }, versions: { completion: null, task: null } });
  assert.equal((await propose('TASK_LINK', {})).reasonCode !== 'DIY_COMPLETION_RECOVER_CONFIRMATION_REQUIRED', true);
});

test('the confirmation is tied to the request it was drawn for: if it was re-queued and failed AGAIN (a new event version), the old confirmation is refused', async () => {
  const dead = completionEvent('DEAD_LETTER');
  const proposed = await propose('COMPLETION_EFFECTS', {});
  dead.updatedAt = new Date(dead.updatedAt.getTime() + 60_000); // dead-lettered again since the proposal: still DEAD_LETTER, a new version
  assert.equal(await codeOf(confirm(proposed.parameters)), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(db.state.domainEvents.find((e) => e.id === dead.id).status, 'DEAD_LETTER');
  const again = await propose('COMPLETION_EFFECTS', {});
  assert.equal((await confirm(again.parameters)).result.reasonCode, 'DIY_RECOVER_QUEUED');
});

test('THE SERVICE: only a dead letter is ever re-queued; pending, processing, failed-retrying and processed events are left alone', async () => {
  for (const status of ['PENDING', 'PROCESSING', 'FAILED', 'PROCESSED']) {
    install(); const event = completionEvent(status);
    const before = JSON.stringify(event);
    const outcome = await diyService.retryCompletionEffects('p1', 'prop-1', 'u1');
    assert.equal(outcome.reset, false, status);
    assert.equal(JSON.stringify(db.state.domainEvents[0]), before, `${status}: untouched`);
  }
});

// ---- trust, viewers and registration ----------------------------------------------------------------------------------------------------------------------------

test('every 7C action id survives the allow-list; the recovery actions are filtered from a viewer even if a producer emitted them', async () => {
  const ids = (result) => actionsOf(result).map((a) => a.id);
  completionEvent('DEAD_LETTER');
  assert.ok(ids(validate('DIY_PROJECT_GUIDE', await guide(), 'OWNER')).includes('diy-record-again'));
  assert.equal(ids(validate('DIY_PROJECT_GUIDE', await guide(), 'VIEWER')).includes('diy-record-again'), false);
  install(); openWithDeadTaskLink('DEAD_LETTER');
  assert.ok(ids(validate('DIY_PROJECT_GUIDE', await guide(), 'OWNER')).includes('diy-task-record-again'));
  assert.equal(ids(validate('DIY_PROJECT_GUIDE', await guide(), 'VIEWER')).includes('diy-task-record-again'), false);
  const { isAskActionAllowedForHouseholdRole } = require('../../src/services/ask/askAudiencePresentation.ts');
  for (const label of ['Record my completion again', 'Update my linked task again']) assert.equal(isAskActionAllowedForHouseholdRole({ id: 'x', label, style: 'SECONDARY' }, 'VIEWER'), false, label);
});

test('registry facts, and the handler source: a CONTRIBUTOR, confirmation-gated, non-routable command; no database write of its own; no analytics; the guard shape', () => {
  const command = getAskDomainCommandByOperation('DIY_COMPLETION_RECOVER');
  assert.deepEqual([command.roleFloor, command.adapterKey, command.correctionModes, command.material], ['CONTRIBUTOR', 'diy.completion-recover', [], true]);
  assert.equal(ASK_OPERATION_DEFINITIONS.DIY_COMPLETION_RECOVER.family, 'COMMAND');
  assert.equal(isAskMessageRoutableOperation('DIY_COMPLETION_RECOVER'), false);
  assert.match(fs.readFileSync(path.join(__dirname, '../../src/services/ask/execution/executeOperation.ts'), 'utf8'), /DIY_COMPLETION_RECOVER: \['DIY_PROJECT_GUIDE', 'DIY_PROJECTS'\]/);
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/ask/handlers/diyCompletionRecover.handler.ts'), 'utf8');
  assert.match(source, /launchContext\.surface === 'ASK_REFRESH'/);
  assert.match(source, /retryCompletionEffects\(/);
  assert.match(source, /retryTaskReconciliation\(/);
  assert.doesNotMatch(source, /prisma\./);
  assert.doesNotMatch(source, /analyticsEmitter/);
});
