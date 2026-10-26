const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register/transpile-only');

// Attach a permit or HOA record to a renovation case, from Ask (Renovations parity, slice 3c). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const complianceService = require('../../src/services/renovationComplianceWorkflow.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const command = require('../../src/services/ask/support/renovationReadinessCommand.ts');
const capital = require('../../src/services/ask/handlers/capitalPlanning.handler.ts');

const OP = 'RENOVATION_READINESS_COMMAND';
const M = command.READINESS_COMMAND_MESSAGES;
const CASE = '11111111-1111-4111-8111-111111111111';
const SCOPE = '33333333-3333-4333-8333-333333333333';
const UPDATED = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const version = (linked = 0) => sha(`compliance:ATTACH_RECORD:${CASE}:${SCOPE}:${linked}:${UPDATED.toISOString()}`);

const PERMIT = { id: 'p1', permitNumber: 'BP-2041', category: 'BUILDING', status: 'ISSUED' };
const PERMIT_HELD = { id: 'p2', permitNumber: 'BP-0001', category: 'BUILDING', status: 'FINALED' };
const HOA = { id: 'h1', workType: 'EXTERIOR_CHANGE', reportedStatus: 'APPROVED', decisionStatus: 'PENDING' };

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withData({ scope = SCOPE, permits = [PERMIT, PERMIT_HELD], approvals = [HOA], linked = 0, held = [{ linkType: 'PERMIT', targetId: 'p2', renovationCaseId: 'other-case' }] } = {}) {
  const saved = { c: prisma.renovationCase, p: prisma.propertyPermitRecord, h: prisma.hoaApprovalRecord, l: prisma.renovationCaseLink, a: complianceService.attachComplianceRecord, r: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  prisma.renovationCase = {
    findFirst: async (args) => (args.where.id === CASE ? { id: CASE, name: 'Kitchen remodel', updatedAt: UPDATED, readinessSummary: null, currentScopeVersionId: scope } : null),
    findMany: async () => [{ id: 'other-case', name: 'Deck' }],
  };
  prisma.propertyPermitRecord = { findMany: async () => permits };
  prisma.hoaApprovalRecord = { findMany: async () => approvals };
  prisma.renovationCaseLink = {
    // The held permit is attached to another case; the count is this case's own links.
    findMany: async () => held,
    count: async () => linked,
  };
  complianceService.attachComplianceRecord = async (...args) => { calls.push(args); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { prisma.renovationCase = saved.c; prisma.propertyPermitRecord = saved.p; prisma.hoaApprovalRecord = saved.h; prisma.renovationCaseLink = saved.l; complianceService.attachComplianceRecord = saved.a; executeOperation.reconcileAskExecutionSideEffects = saved.r; } };
}
const invoke = (launchContext, role = 'CONTRIBUTOR') => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: M.ATTACH_RECORD, launchContext }, { propertyAccess: { role } });
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId: CASE, entityType: command.readinessCommandEntityType('ATTACH_RECORD'), ...over });
const ctx = (parameters, role = 'CONTRIBUTOR') => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });

test('the kind is a case-level contributor step reached only by its declared action, and splits the choice into the route\'s input', () => {
  assert.equal(command.readinessKindNeedsOwner('ATTACH_RECORD'), false);
  assert.equal(command.readinessCommandEntityType('ATTACH_RECORD'), command.RENOVATION_READINESS_CASE_ENTITY_TYPE);
  assert.equal(command.readinessCommandKindFromMessage(M.ATTACH_RECORD), 'ATTACH_RECORD');
  assert.notEqual(resolveAskRoutingCascade(M.ATTACH_RECORD, { localRoutingEnabled: true }).operation?.operationId, OP);
  assert.equal(command.parseReadinessFormAnswer('ATTACH_RECORD', { record: 'PERMIT:p1' }).success, true);
  assert.equal(command.parseReadinessFormAnswer('ATTACH_RECORD', { record: 'HOA_APPROVAL:h1' }).success, true);
  for (const bad of ['p1', 'DOCUMENT:p1', 'PERMIT:', 'PERMIT:a b', '']) assert.equal(command.parseReadinessFormAnswer('ATTACH_RECORD', { record: bad }).success, false, bad);
  assert.deepEqual(command.attachRecordServiceInput({ record: 'HOA_APPROVAL:h1' }), { subjectType: 'HOA_APPROVAL', subjectId: 'h1' });
});

test('viewers and misrouted launches are refused; only records no case holds are offered', async () => {
  const w = withData(); let restoreRole = withRole('VIEWER');
  try {
    assert.equal((await invoke(launch(), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
    restoreRole(); restoreRole = withRole('CONTRIBUTOR');
    assert.equal((await invoke(launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_RENOVATION_READINESS_COMMAND_NOT_DIRECTLY_ROUTABLE');
    const form = await invoke(launch());
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].captureKey, command.READINESS_FORM_CAPTURE_KEYS.ATTACH_RECORD);
    assert.deepEqual(form.captureRequests[0].inputSchema.fields[0].inputSchema.options.map((option) => option.value), ['PERMIT:p1', 'HOA_APPROVAL:h1'], 'the permit another case holds is not offered');
    assert.equal(w.calls.length, 0);
  } finally { restoreRole(); w.restore(); }
});

test('the review names the record and what attaching does; refusals happen before any confirmation', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); let w = withData();
  try {
    const result = await require('../../src/services/ask/handlers/renovationReadinessCommands.handler.ts').readinessCommandResult('user-1', 'prop-1', { kind: 'ATTACH_RECORD', entityId: CASE, sourceExecutionId: null }, { record: 'PERMIT:p1' });
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    assert.equal(result.contextVersion, version(0));
    assert.match(result.confirmation.description, /cannot be attached to another/);
    assert.match(result.confirmation.description, /granted with conditions, those conditions are added as a blocking item/);
    assert.match(result.confirmation.description, /does not change the record.s status/);
    assert.deepEqual(result.confirmation.fields.map((field) => field.label), ['Case', 'Record']);
    const held = await require('../../src/services/ask/handlers/renovationReadinessCommands.handler.ts').readinessCommandResult('user-1', 'prop-1', { kind: 'ATTACH_RECORD', entityId: CASE, sourceExecutionId: null }, { record: 'PERMIT:p2' });
    assert.equal(held.reasonCode, 'RENOVATION_ATTACH_RECORD_NOT_OFFERED');
    assert.equal(w.calls.length, 0);
    w.restore(); w = withData({ scope: null });
    assert.equal((await invoke(launch())).reasonCode, 'RENOVATION_SCOPE_MISSING');
    w.restore(); w = withData({ permits: [PERMIT_HELD], approvals: [] });
    const allHeld = await invoke(launch());
    assert.equal(allHeld.reasonCode, 'RENOVATION_NO_ATTACHABLE_RECORD');
    assert.match(allHeld.blocks[0].body, /1 record is not listed because it is attached to another case \(Deck\)\. A record belongs to one case at a time\./);
    w.restore(); w = withData({ permits: [], approvals: [], held: [] });
    assert.match((await invoke(launch())).blocks[0].body, /No permit or HOA approval is recorded for this home, so there is nothing to attach/);
  } finally { w.restore(); restoreRole(); }
});

test('confirming calls the canonical attach once with the route\'s input; stale, invalid and no-longer-offered choices write nothing', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const w = withData();
  try {
    const done = await confirmCapabilityInvoke(OP, ctx({ readinessCommand: { kind: 'ATTACH_RECORD', entityId: CASE }, readinessContextVersion: version(0), readinessForm: { record: 'HOA_APPROVAL:h1' } }));
    assert.deepEqual(w.calls, [['prop-1', CASE, 'user-1', { subjectType: 'HOA_APPROVAL', subjectId: 'h1' }]]);
    assert.equal(done.result.reasonCode, 'RENOVATION_READINESS_ATTACH_RECORD_COMPLETED');
    assert.equal(done.result.blocks[0].actions[0].label, 'See approvals');
    const reject = (parameters) => assert.rejects(() => confirmCapabilityInvoke(OP, ctx(parameters)), (error) => ['ASK_CONTEXT_VERSION_CONFLICT', 'ASK_CONFIRMATION_NOT_ACTIVE'].includes(error.code));
    await reject({ readinessCommand: { kind: 'ATTACH_RECORD', entityId: CASE }, readinessContextVersion: 'old', readinessForm: { record: 'PERMIT:p1' } });
    await reject({ readinessCommand: { kind: 'ATTACH_RECORD', entityId: CASE }, readinessContextVersion: version(0), readinessForm: { record: 'nonsense' } });
    await reject({ readinessCommand: { kind: 'ATTACH_RECORD', entityId: CASE }, readinessContextVersion: version(0), readinessForm: { record: 'PERMIT:p2' } });
    assert.equal(w.calls.length, 1);
  } finally { w.restore(); restoreRole(); }
});

test('the compliance answer offers Attach only to a contributor, and the action id is allowlisted', async () => {
  const saved = { s: prisma.renovationScopeVersion, c: prisma.renovationCase, l: prisma.renovationCaseLink, p: prisma.propertyPermitRecord, h: prisma.hoaApprovalRecord, k: prisma.renovationComplianceCondition, r: prisma.hoaApprovalDocumentReview };
  prisma.renovationCase = { findFirst: async () => ({ id: CASE, currentScopeVersionId: SCOPE }) };
  prisma.renovationScopeVersion = { findFirst: async () => ({ id: SCOPE }) };
  prisma.renovationCaseLink = { findMany: async () => [] };
  prisma.propertyPermitRecord = { findMany: async () => [] };
  prisma.hoaApprovalRecord = { findMany: async () => [] };
  prisma.renovationComplianceCondition = { findMany: async () => [] };
  prisma.hoaApprovalDocumentReview = { findMany: async () => [] };
  try {
    const summary = async (canChange) => (await capital.renovationComplianceResult('prop-1', { id: CASE, name: 'Kitchen remodel', updatedAt: UPDATED }, null, canChange)).blocks.find((block) => block.id === 'renovation-compliance-summary');
    const offered = await summary(true);
    assert.equal(offered.actions.length, 1);
    assert.deepEqual([offered.actions[0].operationId, offered.actions[0].message, offered.actions[0].entityId, offered.actions[0].entityType], [OP, M.ATTACH_RECORD, CASE, command.RENOVATION_READINESS_CASE_ENTITY_TYPE]);
    assert.equal((await summary(false)).actions.length, 0);
    assert.match((await summary(false)).body, /A contributor or owner can attach records/);
    assert.equal(isAskActionApplicable({ action: { ...offered.actions[0] }, operationId: 'RENOVATION_PERMIT_READINESS', propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true);
  } finally { Object.assign(prisma, { renovationScopeVersion: saved.s, renovationCase: saved.c, renovationCaseLink: saved.l, propertyPermitRecord: saved.p, hoaApprovalRecord: saved.h, renovationComplianceCondition: saved.k, hoaApprovalDocumentReview: saved.r }); }
});

test('the note says why records are missing: on this case, on another case (named), or both; and nothing when none was left out', () => {
  const note = command.attachExclusionNote;
  assert.equal(note({ thisCase: 0, otherCases: 0, otherCaseNames: [] }), null);
  assert.equal(note({ thisCase: 1, otherCases: 0, otherCaseNames: [] }), '1 record is not listed because it is already attached to this case.');
  assert.equal(note({ thisCase: 2, otherCases: 0, otherCaseNames: [] }), '2 records are not listed because they are already attached to this case.');
  assert.equal(note({ thisCase: 0, otherCases: 1, otherCaseNames: ['Deck'] }), '1 record is not listed because it is attached to another case (Deck). A record belongs to one case at a time.');
  assert.equal(note({ thisCase: 0, otherCases: 3, otherCaseNames: ['Deck', 'Roof'] }), '3 records are not listed because they are attached to other cases (Deck, Roof). A record belongs to one case at a time.');
  assert.equal(note({ thisCase: 1, otherCases: 1, otherCaseNames: ['Deck'] }), '2 records are not listed: 1 already attached to this case and 1 attached to another case (Deck). A record belongs to one case at a time.');
  assert.match(note({ thisCase: 0, otherCases: 5, otherCaseNames: ['A', 'B', 'C', 'D', 'E'] }), /\(A, B, C, and 2 more\)/);
  assert.equal(note({ thisCase: 0, otherCases: 1, otherCaseNames: [] }), '1 record is not listed because it is attached to another case. A record belongs to one case at a time.', 'a case that is gone is not named');
});

test('the picker says what it left out, and the held record is still not offered', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); let w = withData();
  try {
    const form = await invoke(launch());
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.match(form.blocks[0].body, /1 record is not listed because it is attached to another case \(Deck\)\. A record belongs to one case at a time\. Nothing has been saved yet\./);
    assert.deepEqual(form.captureRequests[0].inputSchema.fields[0].inputSchema.options.map((option) => option.value), ['PERMIT:p1', 'HOA_APPROVAL:h1']);
    w.restore(); w = withData({ held: [{ linkType: 'PERMIT', targetId: 'p2', renovationCaseId: CASE }] });
    assert.match((await invoke(launch())).blocks[0].body, /1 record is not listed because it is already attached to this case\./);
    w.restore(); w = withData({ permits: [PERMIT], held: [] });
    assert.doesNotMatch((await invoke(launch())).blocks[0].body, /not listed/, 'nothing is said when nothing was left out');
  } finally { w.restore(); restoreRole(); }
});
