const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "DIY": the caller's own skill profile and a note on a project (FRD v1.344). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { diyService } = require('../../src/services/diy.service.ts');
const command = require('../../src/services/ask/support/diyCommand.ts');
const { diyProjectsFromView } = require('../../src/services/ask/handlers/diyProjectCenter.handler.ts');

const PROFILE = 'DIY_SKILL_PROFILE_COMMAND';
const NOTE = 'DIY_PROJECT_NOTE_COMMAND';
const T = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const levels = (over = {}) => ({ hvac: 'BEGINNER', plumbing: 'BEGINNER', electrical: 'BEGINNER', painting: 'INTERMEDIATE', general: 'BEGINNER', exterior: 'BEGINNER', flooring: 'BEGINNER', appliance: 'BEGINNER', landscaping: 'BEGINNER', ...over });
const profileVersion = (p) => sha(`diy-skill-profile:u1:${p?.assessedAt ? new Date(p.assessedAt).toISOString() : 'none'}`);

function install(role, { profile = null, project = { id: 'p1', title: 'Fix faucet', status: 'IN_PROGRESS', updatedAt: T, notesJson: [] } } = {}) {
  const saved = { a: propertyAccess.resolvePropertyAccess, g: diyService.getSkillProfile, u: diyService.upsertSkillProfile, up: diyService.updateProject, d: prisma.diyProject, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  diyService.getSkillProfile = async (userId) => { calls.push(['get', userId]); return profile; };
  diyService.upsertSkillProfile = async (...a) => { calls.push(['upsert', ...a]); return {}; };
  diyService.updateProject = async (...a) => { calls.push(['update', ...a]); return {}; };
  prisma.diyProject = { findFirst: async ({ where }) => (project && project.id === where.id ? project : null) };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; diyService.getSkillProfile = saved.g; diyService.upsertSkillProfile = saved.u; diyService.updateProject = saved.up; prisma.diyProject = saved.d; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (operationId, over = {}) => ({ operationId, surface: 'ASK_PAGE', ...over });
const invoke = (operationId, message, launchContext) => capabilityInvoke(operationId, { userId: 'u1', propertyId: 'prop-1', message, launchContext });
const ctx = (operationId, parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'VIEWER' }, parameters, command: getAskDomainCommandByOperation(operationId) });

test('the profile command is caller-scoped (viewer floor), the note command is a contributor command; neither is typed', () => {
  assert.equal(getAskDomainCommandByOperation(PROFILE).roleFloor, 'VIEWER');
  assert.equal(getAskDomainCommandByOperation(PROFILE).authorization, 'CALLER_SCOPED');
  assert.equal(getAskDomainCommandByOperation(NOTE).roleFloor, 'CONTRIBUTOR');
  for (const message of [command.DIY_PROFILE_MESSAGE, command.DIY_NOTE_MESSAGE]) {
    const op = resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;
    assert.ok(op !== PROFILE && op !== NOTE, message);
  }
});

test('the skill profile: a viewer may set their own; the form is seeded; the review names each change; an unchanged form is refused; nothing is written', async () => {
  const { diySkillProfileResult } = require('../../src/services/ask/handlers/diyCommands.handler.ts');
  const existing = { ...levels(), assessedAt: T };
  const w = install('VIEWER', { profile: existing });
  try {
    assert.equal((await invoke(PROFILE, command.DIY_PROFILE_MESSAGE, launch(PROFILE, { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_DIY_SKILL_PROFILE_NOT_DIRECTLY_ROUTABLE');
    const form = await invoke(PROFILE, command.DIY_PROFILE_MESSAGE, launch(PROFILE));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].currentAnswer.painting, 'INTERMEDIATE');
    assert.equal(form.captureRequests[0].inputSchema.fields.length, 9);
    const review = await diySkillProfileResult('u1', 'prop-1', { sourceExecutionId: null }, levels({ plumbing: 'ADVANCED' }));
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(review.confirmation.fields, [{ label: 'Plumbing', value: 'Beginner → Advanced' }]);
    assert.equal((await diySkillProfileResult('u1', 'prop-1', { sourceExecutionId: null }, levels())).reasonCode, 'DIY_SKILL_PROFILE_NO_CHANGE');
    assert.equal((await diySkillProfileResult('u1', 'prop-1', { sourceExecutionId: null }, { ...levels(), hvac: 'EXPERT' })).reasonCode, 'DIY_SKILL_PROFILE_INPUT_INVALID');
    assert.ok(w.calls.every(([name]) => name === 'get'), 'nothing written at review');
  } finally { w.restore(); }
});

test('confirming writes only the session user\'s own profile, with the nine levels; a changed profile or invalid levels write nothing', async () => {
  const existing = { ...levels(), assessedAt: T };
  const w = install('VIEWER', { profile: existing });
  try {
    const params = (answer, v = profileVersion(existing)) => ({ diyProfile: answer, diyProfileContextVersion: v });
    await confirmCapabilityInvoke(PROFILE, ctx(PROFILE, params(levels({ plumbing: 'ADVANCED' }))));
    assert.deepEqual(w.calls.find(([n]) => n === 'upsert'), ['upsert', 'u1', levels({ plumbing: 'ADVANCED' })]);
    await assert.rejects(() => confirmCapabilityInvoke(PROFILE, ctx(PROFILE, params(levels({ plumbing: 'ADVANCED' }), 'old'))), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(PROFILE, ctx(PROFILE, params({ hvac: 'BEGINNER' }))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.filter(([n]) => n === 'upsert').length, 1);
  } finally { w.restore(); }
});

test('the project note: contributor only, open projects only, appended after the notes already there; stale or finished writes nothing', async () => {
  const { diyProjectNoteResult } = require('../../src/services/ask/handlers/diyCommands.handler.ts');
  const L = (entityId = 'p1') => launch(NOTE, { entityType: 'DIY_PROJECT', entityId });
  let w = install('VIEWER');
  try { assert.equal((await invoke(NOTE, command.DIY_NOTE_MESSAGE, L())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  const project = { id: 'p1', title: 'Fix faucet', status: 'IN_PROGRESS', updatedAt: T, notesJson: [{ text: 'Bought a washer', createdAt: '2026-08-30T00:00:00.000Z' }] };
  w = install('CONTRIBUTOR', { project });
  try {
    assert.equal((await invoke(NOTE, command.DIY_NOTE_MESSAGE, L())).status, 'NEEDS_CONTEXT');
    const review = await diyProjectNoteResult('u1', 'prop-1', { entityId: 'p1', sourceExecutionId: null }, { note: 'Needs a 3/8 inch washer' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.equal(review.contextVersion, sha(`diy-note:p1:IN_PROGRESS:${T.toISOString()}:1`));
    assert.equal((await diyProjectNoteResult('u1', 'prop-1', { entityId: 'p1', sourceExecutionId: null }, { note: 'x' })).reasonCode, 'DIY_PROJECT_NOTE_INVALID');
    const params = (v) => ({ diyNote: { note: 'Needs a 3/8 inch washer' }, diyNoteCommand: { entityId: 'p1' }, diyNoteContextVersion: v });
    await confirmCapabilityInvoke(NOTE, ctx(NOTE, params(review.contextVersion)));
    const update = w.calls.find(([n]) => n === 'update');
    assert.equal(update[1], 'p1');
    assert.equal(update[2], 'prop-1');
    assert.equal(update[3].notesJson.length, 2);
    assert.equal(update[3].notesJson[0].text, 'Bought a washer');
    assert.equal(update[3].notesJson[1].text, 'Needs a 3/8 inch washer');
    await assert.rejects(() => confirmCapabilityInvoke(NOTE, ctx(NOTE, params('old'))), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', { project: { ...project, status: 'COMPLETED' } });
  try { assert.equal((await invoke(NOTE, command.DIY_NOTE_MESSAGE, L())).reasonCode, 'DIY_PROJECT_NOT_OPEN'); } finally { w.restore(); }
});

test('the DIY projects answer offers the skill levels to everyone and a note to contributors on open projects; ids are allowlisted', () => {
  const view = { items: [{ id: 'p1', title: 'Fix faucet', status: 'IN_PROGRESS', category: 'PLUMBING', completedStepCount: 1, requiredStepCount: 3, decisionVerdict: null, templateId: null, aiGuideId: null, templateRevisionId: null, updatedAt: T }], nextCursor: null };
  const actionsOf = (canChange) => {
    const out = diyProjectsFromView(view, 'prop-1', canChange);
    const summary = out.blocks.find((b) => b.id === 'diy-summary').actions.map((a) => a.id);
    const row = out.blocks.find((b) => b.id === 'diy-projects').sections[0].items[0].actions?.map((a) => a.id) ?? [];
    return { summary, row };
  };
  assert.deepEqual(actionsOf(true), { summary: ['diy-skill-profile'], row: ['diy-project-note'] });
  assert.deepEqual(actionsOf(false), { summary: ['diy-skill-profile'], row: [] });
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  assert.equal(applicable('diy-skill-profile', 'DIY_PROJECTS'), true);
  assert.equal(applicable('diy-project-note', 'DIY_PROJECTS'), true);
  assert.equal(applicable('diy-projects-back', PROFILE), true);
  assert.equal(applicable('diy-projects-back', NOTE), true);
});
