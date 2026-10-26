const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register/transpile-only');

// Slice 2b of the Renovations parity review: generating requirements research from Ask. No database, browser or native module.

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
const requirementService = require('../../src/services/renovationRequirement.service.ts');
const command = require('../../src/services/ask/support/renovationReadinessCommand.ts');

const OP = 'RENOVATION_READINESS_COMMAND';
const M = command.READINESS_COMMAND_MESSAGES;
const CASE = '11111111-1111-4111-8111-111111111111';
const SCOPE = '33333333-3333-4333-8333-333333333333';
const UPDATED = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const version = (count) => sha(`readiness:GENERATE:${CASE}:${SCOPE}:${count}:${UPDATED.toISOString()}`);

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withData({ scope = SCOPE, count = 0 } = {}) {
  const saved = { c: prisma.renovationCase, r: prisma.renovationRequirement };
  const renovationCase = { id: CASE, name: 'Kitchen remodel', updatedAt: UPDATED, readinessSummary: null, currentScopeVersionId: scope };
  prisma.renovationCase = { findFirst: async (args) => (args.where.id === CASE ? renovationCase : null) };
  prisma.renovationRequirement = { count: async () => count };
  return () => { prisma.renovationCase = saved.c; prisma.renovationRequirement = saved.r; };
}
function installService() {
  const saved = requirementService.generateRequirementCandidates;
  const calls = [];
  requirementService.generateRequirementCandidates = async (...args) => { calls.push(args); return []; };
  const savedReconcile = executeOperation.reconcileAskExecutionSideEffects;
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { requirementService.generateRequirementCandidates = saved; executeOperation.reconcileAskExecutionSideEffects = savedReconcile; } };
}
const invoke = (launchContext, role = 'CONTRIBUTOR') => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: M.GENERATE, launchContext }, { propertyAccess: { role } });
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId: CASE, entityType: command.readinessCommandEntityType('GENERATE'), ...over });
const ctx = (parameters, role = 'CONTRIBUTOR') => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });

test('generate is a case-level contributor step reached only by its declared action', async () => {
  assert.equal(command.readinessKindNeedsOwner('GENERATE'), false);
  assert.equal(command.readinessCommandEntityType('GENERATE'), command.RENOVATION_READINESS_CASE_ENTITY_TYPE);
  assert.equal(command.readinessCommandKindFromMessage(M.GENERATE), 'GENERATE');
  assert.notEqual(resolveAskRoutingCascade(M.GENERATE, { localRoutingEnabled: true }).operation?.operationId, OP);
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withData();
  try {
    assert.equal((await invoke(launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_RENOVATION_READINESS_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(launch({ entityType: command.RENOVATION_READINESS_ITEM_ENTITY_TYPE }))).reasonCode, 'ASK_RENOVATION_READINESS_COMMAND_NOT_DIRECTLY_ROUTABLE');
    restoreRole(); const viewer = withRole('VIEWER');
    assert.equal((await invoke(launch(), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
    viewer();
  } finally { restore(); }
});

test('the review says what is created, that nothing is determined and what leaves the household; nothing is saved yet', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withData();
  try {
    const result = await invoke(launch());
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    assert.equal(result.contextVersion, version(0));
    assert.match(result.confirmation.description, /candidates, not requirements/);
    assert.match(result.confirmation.description, /city, state, ZIP and this case.s scope summary are sent/);
    assert.match(result.confirmation.description, /never duplicates/);
  } finally { restore(); restoreRole(); }
});

test('no scope and already-researched cases are refused without a confirmation', async () => {
  const restoreRole = withRole('CONTRIBUTOR');
  let restore = withData({ scope: null });
  try {
    assert.equal((await invoke(launch())).reasonCode, 'RENOVATION_SCOPE_MISSING');
    restore(); restore = withData({ count: 4 });
    assert.equal((await invoke(launch())).reasonCode, 'RENOVATION_REQUIREMENTS_ALREADY_RESEARCHED');
  } finally { restore(); restoreRole(); }
});

test('confirming calls the canonical generator once with the actor; a changed case writes nothing', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withData();
  const w = installService();
  try {
    const done = await confirmCapabilityInvoke(OP, ctx({ readinessCommand: { kind: 'GENERATE', entityId: CASE }, readinessContextVersion: version(0) }));
    assert.deepEqual(w.calls, [['prop-1', CASE, 'user-1', {}]]);
    assert.equal(done.result.reasonCode, 'RENOVATION_READINESS_GENERATE_COMPLETED');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ readinessCommand: { kind: 'GENERATE', entityId: CASE }, readinessContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(w.calls.length, 1);
  } finally { w.restore(); restore(); restoreRole(); }
});

test('the action id is allowlisted for the readiness answer', () => {
  const action = { id: command.READINESS_COMMAND_ACTION_IDS.GENERATE, label: 'x', interactionType: 'START_WORKFLOW', message: M.GENERATE, operationId: OP, style: 'PRIMARY' };
  assert.equal(isAskActionApplicable({ action, operationId: 'RENOVATION_PERMIT_READINESS', propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true);
});

test('the requirements answer offers Generate only to a contributor, and only while nothing is researched', async () => {
  const { renovationRequirementsResult } = require('../../src/services/ask/handlers/capitalPlanning.handler.ts');
  const saved = { c: prisma.renovationCase, r: prisma.renovationRequirement, a: prisma.renovationAuthorityProfile };
  const selected = { id: CASE, name: 'Kitchen remodel', updatedAt: UPDATED };
  const stub = (rows) => {
    prisma.renovationCase = { findFirst: async () => ({ id: CASE, currentScopeVersion: { id: SCOPE } }) };
    prisma.renovationRequirement = { findMany: async () => rows };
    prisma.renovationAuthorityProfile = { findMany: async () => [] };
  };
  const summary = (result) => result.blocks.find((block) => block.id === 'renovation-requirements-summary');
  try {
    stub([]);
    const offered = summary(await renovationRequirementsResult('prop-1', selected, null, true));
    const generate = offered.actions.find((action) => action.id === command.READINESS_COMMAND_ACTION_IDS.GENERATE);
    assert.deepEqual([generate.operationId, generate.message, generate.entityId, generate.entityType], [OP, M.GENERATE, CASE, command.RENOVATION_READINESS_CASE_ENTITY_TYPE]);
    assert.deepEqual(offered.actions.map((action) => action.id), [command.READINESS_COMMAND_ACTION_IDS.AUTHORITY_PROFILE, command.READINESS_COMMAND_ACTION_IDS.GENERATE], 'the jurisdiction step is offered beside it');
    assert.equal(summary(await renovationRequirementsResult('prop-1', selected, null, false)).actions.length, 0, 'a viewer is not offered either');
    stub([{ id: 'r1', family: 'PERMIT', question: 'q', advisoryLikelihood: 'UNKNOWN', determination: 'UNDETERMINED', truthLayer: 'ADVISORY', confidence: 'LOW', exactNextAction: 'n', isBlocking: true }]);
    assert.deepEqual(summary(await renovationRequirementsResult('prop-1', selected, null, true)).actions.map((action) => action.id), [command.READINESS_COMMAND_ACTION_IDS.AUTHORITY_PROFILE], 'researched cases are not offered Generate again');
  } finally { prisma.renovationCase = saved.c; prisma.renovationRequirement = saved.r; prisma.renovationAuthorityProfile = saved.a; }
});
