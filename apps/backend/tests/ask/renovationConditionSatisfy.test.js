const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register/transpile-only');

// Mark a compliance condition satisfied with a Home Record, from Ask (Renovations parity, slice 3b). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const inventory = require('../../src/services/propertyDocuments/propertyDocumentInventory.service.ts');
const complianceService = require('../../src/services/renovationComplianceWorkflow.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const command = require('../../src/services/ask/support/renovationReadinessCommand.ts');
const handler = require('../../src/services/ask/handlers/renovationReadinessCommands.handler.ts');
const { renovationComplianceSections } = require('../../src/services/ask/support/renovationCaseOverview.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');

const OP = 'RENOVATION_READINESS_COMMAND';
const M = command.READINESS_COMMAND_MESSAGES;
const CASE = '11111111-1111-4111-8111-111111111111';
const COND = '44444444-4444-4444-8444-444444444444';
const UPDATED = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const version = (status = 'OPEN') => sha(`compliance:SATISFY_CONDITION:${COND}:${status}:${UPDATED.toISOString()}`);
const FORM = { evidenceDocumentId: 'rec-1', notes: 'Matches the inspection sign-off.' };

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withData({ condition = { id: COND, renovationCaseId: CASE, title: 'Inspect framing', status: 'OPEN', isBlocking: true, updatedAt: UPDATED }, records } = {}) {
  const entry = (over) => ({ id: 'rec-1', source: 'HOME_RECORD', title: 'Inspection sign-off', kind: 'INSPECTION', kindLabel: 'Inspection', addedAt: new Date('2026-08-01'), sensitivity: 'STANDARD', visibility: 'HOUSEHOLD', lifecycle: 'ACTIVE', ...over });
  const saved = { k: prisma.renovationComplianceCondition, c: prisma.renovationCase, l: inventory.listPropertyDocuments, u: complianceService.updateCondition, r: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  prisma.renovationComplianceCondition = { findFirst: async (args) => (condition && args.where.id === condition.id ? condition : null) };
  prisma.renovationCase = { findFirst: async () => ({ id: CASE, name: 'Kitchen remodel', updatedAt: UPDATED, readinessSummary: null, currentScopeVersionId: 's1' }) };
  inventory.listPropertyDocuments = async () => ({ items: records ?? [entry(), entry({ id: 'rec-private', title: 'Owner only', visibility: 'OWNER_ONLY' }), entry({ id: 'doc-legacy', source: 'LEGACY_DOCUMENT' })] });
  complianceService.updateCondition = async (...args) => { calls.push(args); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { prisma.renovationComplianceCondition = saved.k; prisma.renovationCase = saved.c; inventory.listPropertyDocuments = saved.l; complianceService.updateCondition = saved.u; executeOperation.reconcileAskExecutionSideEffects = saved.r; } };
}
const invoke = (launchContext, role = 'CONTRIBUTOR') => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: M.SATISFY_CONDITION, launchContext }, { propertyAccess: { role } });
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId: COND, entityType: command.RENOVATION_COMPLIANCE_CONDITION_ENTITY_TYPE, ...over });
const ctx = (parameters, role = 'CONTRIBUTOR') => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });

test('the kind is a contributor step on a condition, reached only by its declared action, and builds the route\'s own input', () => {
  assert.equal(command.readinessKindNeedsOwner('SATISFY_CONDITION'), false);
  assert.equal(command.readinessCommandEntityType('SATISFY_CONDITION'), command.RENOVATION_COMPLIANCE_CONDITION_ENTITY_TYPE);
  assert.equal(command.readinessCommandKindFromMessage(M.SATISFY_CONDITION), 'SATISFY_CONDITION');
  assert.notEqual(resolveAskRoutingCascade(M.SATISFY_CONDITION, { localRoutingEnabled: true }).operation?.operationId, OP);
  assert.equal(command.parseReadinessFormAnswer('SATISFY_CONDITION', { evidenceDocumentId: 'rec-1' }).success, false);
  assert.deepEqual(command.readinessServiceInput('SATISFY_CONDITION', FORM), { status: 'SATISFIED', verificationNotes: 'Matches the inspection sign-off.', sourceDocumentId: 'rec-1' });
  assert.equal(handler.conditionCanBeSatisfied({ status: 'OPEN' }), true);
  for (const status of ['SATISFIED', 'EXPIRED', 'WAIVED_WITH_ACKNOWLEDGMENT']) assert.equal(handler.conditionCanBeSatisfied({ status }), false, status);
});

test('viewers and misrouted launches are refused; the picker offers only household-visible Home Records', async () => {
  const w = withData(); let restoreRole = withRole('VIEWER');
  try {
    assert.equal((await invoke(launch(), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
    restoreRole(); restoreRole = withRole('CONTRIBUTOR');
    assert.equal((await invoke(launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_RENOVATION_READINESS_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(launch({ entityType: command.RENOVATION_READINESS_ITEM_ENTITY_TYPE }))).reasonCode, 'ASK_RENOVATION_READINESS_COMMAND_NOT_DIRECTLY_ROUTABLE');
    const form = await invoke(launch());
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].captureKey, command.READINESS_FORM_CAPTURE_KEYS.SATISFY_CONDITION);
    assert.deepEqual(form.captureRequests[0].inputSchema.fields[0].inputSchema.options.map((option) => option.value), ['rec-1']);
    assert.equal(w.calls.length, 0);
  } finally { restoreRole(); w.restore(); }
});

test('the review names the document and what was checked and saves nothing; a hidden document, a settled condition and no records are refused', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); let w = withData();
  try {
    const review = await handler.readinessCommandResult('user-1', 'prop-1', { kind: 'SATISFY_CONDITION', entityId: COND, sourceExecutionId: null }, FORM);
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.equal(review.contextVersion, version());
    assert.match(review.confirmation.description, /does not read or verify the file, and a satisfied condition no longer blocks closeout/);
    assert.deepEqual(review.confirmation.fields.map((field) => field.label), ['Condition', 'Document', 'Kind', 'What you checked']);
    assert.equal((await handler.readinessCommandResult('user-1', 'prop-1', { kind: 'SATISFY_CONDITION', entityId: COND, sourceExecutionId: null }, { ...FORM, evidenceDocumentId: 'rec-private' })).reasonCode, 'RENOVATION_READINESS_EVIDENCE_NOT_OFFERED');
    assert.equal(w.calls.length, 0);
    w.restore(); w = withData({ condition: { id: COND, renovationCaseId: CASE, title: 'x', status: 'SATISFIED', isBlocking: true, updatedAt: UPDATED } });
    assert.equal((await invoke(launch())).reasonCode, 'RENOVATION_CONDITION_STEP_NOT_AVAILABLE');
    w.restore(); w = withData({ condition: null });
    assert.equal((await invoke(launch())).reasonCode, 'RENOVATION_CONDITION_NOT_FOUND');
    w.restore(); w = withData({ records: [] });
    assert.equal((await invoke(launch())).reasonCode, 'RENOVATION_READINESS_NO_EVIDENCE_RECORD');
  } finally { w.restore(); restoreRole(); }
});

test('confirming calls the canonical condition update once with the route\'s input; stale, invalid, hidden-document and settled steps write nothing', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); let w = withData();
  try {
    const done = await confirmCapabilityInvoke(OP, ctx({ readinessCommand: { kind: 'SATISFY_CONDITION', entityId: COND }, readinessContextVersion: version(), readinessForm: FORM }));
    assert.deepEqual(w.calls[0], ['prop-1', CASE, COND, 'user-1', { status: 'SATISFIED', verificationNotes: 'Matches the inspection sign-off.', sourceDocumentId: 'rec-1' }, 'CONTRIBUTOR']);
    assert.equal(done.result.reasonCode, 'RENOVATION_READINESS_SATISFY_CONDITION_COMPLETED');
    assert.equal(done.result.blocks[0].actions[0].label, 'See approvals');
    assert.equal(done.result.blocks[0].actions[0].message, 'Show the compliance status for my renovation Kitchen remodel.');
    const reject = (parameters) => assert.rejects(() => confirmCapabilityInvoke(OP, ctx(parameters)), (error) => ['ASK_CONTEXT_VERSION_CONFLICT', 'ASK_CONFIRMATION_NOT_ACTIVE'].includes(error.code));
    await reject({ readinessCommand: { kind: 'SATISFY_CONDITION', entityId: COND }, readinessContextVersion: 'old', readinessForm: FORM });
    await reject({ readinessCommand: { kind: 'SATISFY_CONDITION', entityId: COND }, readinessContextVersion: version(), readinessForm: { evidenceDocumentId: 'rec-1' } });
    await reject({ readinessCommand: { kind: 'SATISFY_CONDITION', entityId: COND }, readinessContextVersion: version(), readinessForm: { ...FORM, evidenceDocumentId: 'rec-private' } });
    w.restore(); w = withData({ condition: { id: COND, renovationCaseId: CASE, title: 'x', status: 'SATISFIED', isBlocking: true, updatedAt: UPDATED } });
    await reject({ readinessCommand: { kind: 'SATISFY_CONDITION', entityId: COND }, readinessContextVersion: version('SATISFIED'), readinessForm: FORM });
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); restoreRole(); }
});

test('the compliance answer puts the action on open conditions only, for a contributor only, and the action id is allowlisted', () => {
  const workflow = { permits: [], hoaApprovals: [], hoaDocumentReviews: [], alerts: [], coverage: { permit: { state: 'x', message: 'm' }, hoa: { state: 'x', message: 'm' } },
    conditions: [{ id: COND, title: 'Inspect framing', status: 'OPEN', isBlocking: true }, { id: 'c2', title: 'Paint', status: 'SATISFIED', isBlocking: false }] };
  const withAction = renovationComplianceSections(workflow, () => 'x', true);
  assert.equal(withAction.openConditions[0].actions.length, 1);
  assert.deepEqual([withAction.openConditions[0].actions[0].operationId, withAction.openConditions[0].actions[0].message, withAction.openConditions[0].actions[0].entityId, withAction.openConditions[0].actions[0].entityType],
    [OP, M.SATISFY_CONDITION, COND, command.RENOVATION_COMPLIANCE_CONDITION_ENTITY_TYPE]);
  assert.equal(withAction.satisfiedConditions[0].actions, undefined);
  assert.equal(renovationComplianceSections(workflow, () => 'x', false).openConditions[0].actions, undefined);
  const list = { type: 'GROUPED_LIST', filters: [], id: 'renovation-compliance', title: 'x', sections: [{ id: 'open-conditions', title: 'Open', count: 1, items: withAction.openConditions }], actions: [] };
  assert.ok(AskPresentationBlockSchema.safeParse(list).success);
  const action = { id: command.READINESS_COMMAND_ACTION_IDS.SATISFY_CONDITION, label: 'x', interactionType: 'MUTATE_RECORD', message: M.SATISFY_CONDITION, operationId: OP, style: 'SECONDARY' };
  assert.equal(isAskActionApplicable({ action, operationId: 'RENOVATION_PERMIT_READINESS', propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true);
});
