const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Renovation: create the execution project from a ready case in Ask (FRD v1.374; owner rulings D-H1 to D-H8, slice 4 of
// docs/architecture/RENOVATION_PROJECT_HANDOFF_IN_ASK_DESIGN.md). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const service = require('../../src/services/renovationReadiness.service.ts');
const command = require('../../src/services/ask/support/renovationReadinessCommand.ts');

const OP = 'RENOVATION_READINESS_COMMAND';
const M = command.READINESS_COMMAND_MESSAGES;
const CASE = '11111111-1111-4111-8111-111111111111';
const prefillFor = (over = {}) => ({
  caseName: 'Kitchen remodel', lifecycle: 'PREPARING_TO_START', scopeVersionId: 'scope-1', scopeVersion: 2, readinessState: 'READY', readinessStale: false,
  fulfillmentMode: 'PROVIDER', project: null, contractAmountCents: 4_500_000, contractAmountSource: 'QUOTE', contractorName: 'Apex Builders', contractorLicense: 'L-77',
  quoteId: 'quote-1', openConditionCount: 2, openDependencyCount: 3, version: 'v1', ...over,
});
const form = (over = {}) => ({ projectType: 'KITCHEN_REMODEL', contractorName: 'Apex Builders', fundingMode: 'UNDECIDED', startDate: '2026-11-01', contractAmount: 45000, ...over });

function install(role, prefill = prefillFor()) {
  const saved = { a: propertyAccess.resolvePropertyAccess, p: service.loadHandoffPrefill, h: service.handoffToProject, r: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  const state = { prefill, outcome: { id: 'proj-1', handoff: { outcome: 'CREATED', workItemSynced: true } } };
  service.loadHandoffPrefill = async () => state.prefill;
  service.handoffToProject = async (...args) => { calls.push(args); return state.outcome; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, state, restore() {
    propertyAccess.resolvePropertyAccess = saved.a; service.loadHandoffPrefill = saved.p; service.handoffToProject = saved.h; executeOperation.reconcileAskExecutionSideEffects = saved.r;
  } };
}
const launch = { operationId: OP, surface: 'ASK_PAGE', entityId: CASE, entityType: command.RENOVATION_READINESS_CASE_ENTITY_TYPE };
const invoke = (role) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: M.HANDOFF, launchContext: launch }, { propertyAccess: { role } });
const handler = require('../../src/services/ask/handlers/renovationReadinessCommands.handler.ts');
const review = (supplied) => handler.readinessCommandResult('u1', 'prop-1', { kind: 'HANDOFF', entityId: CASE, sourceExecutionId: null }, supplied);
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-9', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'OWNER' }, parameters, command: getAskDomainCommandByOperation(OP) });

test('the form mirrors the handoff: planned only, no documents, funding chosen, an unknown amount stays unknown and a typed zero stays zero', () => {
  const p = command.parseReadinessFormAnswer;
  assert.equal(p('HANDOFF', form()).success, true);
  assert.equal(p('HANDOFF', form({ fundingMode: undefined })).success, false, 'funding is chosen or left undecided, never assumed');
  assert.equal(p('HANDOFF', form({ projectType: 'MOON_BASE' })).success, false);
  assert.equal(p('HANDOFF', form({ startDate: undefined })).success, false);
  assert.equal(p('HANDOFF', form({ startDate: '2026-11-10', expectedEndDate: '2026-11-01' })).success, false);
  assert.equal(p('HANDOFF', { ...form(), intakeMode: 'HISTORICAL' }).success, false, 'no readiness-bypass mode is accepted');
  assert.equal(p('HANDOFF', { ...form(), contractDocumentIds: ['x'] }).success, false, 'no document step');
  const unknown = command.handoffServiceInput(p('HANDOFF', form({ contractAmount: '' })).data, 'PROVIDER', 'k');
  assert.equal('contractAmountCents' in unknown, false);
  const zero = command.handoffServiceInput(p('HANDOFF', form({ contractAmount: 0 })).data, 'PROVIDER', 'k');
  assert.equal(zero.contractAmountCents, 0);
  const typed = command.handoffServiceInput(p('HANDOFF', form({ contractAmount: '$12,500.50' })).data, 'DIY', 'k');
  assert.deepEqual([typed.contractAmountCents, typed.fulfillmentMode, typed.intakeMode, typed.contractDocumentIds, typed.idempotencyKey], [1_250_050, 'DIY', 'PLANNED', [], 'k']);
});

test('owner only: a contributor or viewer is told before any form, and nothing is read or written', async () => {
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  for (const [role, code] of [['VIEWER', 'ASK_PERMISSION_REQUIRED'], ['CONTRIBUTOR', 'ASK_OWNER_REQUIRED']]) {
    const w = install(role);
    try {
      assert.equal((await invoke(role)).reasonCode, code);
      assert.equal(w.calls.length, 0);
    } finally { w.restore(); }
  }
});

test('the form is offered only when a planned start is allowed: a Project that exists, stale readiness and open blockers are explained', async () => {
  let w = install('OWNER');
  try {
    const form1 = await invoke('OWNER');
    assert.equal(form1.status, 'NEEDS_CONTEXT');
    assert.equal(form1.contextVersion, 'v1');
    const fields = form1.captureRequests[0].inputSchema.fields;
    assert.deepEqual(fields.map((f) => f.key), ['projectType', 'contractorName', 'contractorLicense', 'contractAmount', 'fundingMode', 'startDate', 'expectedEndDate']);
    assert.equal(form1.captureRequests[0].currentAnswer.fundingMode, 'UNDECIDED');
    assert.equal(form1.captureRequests[0].currentAnswer.contractAmount, 45000, 'prefilled from the selected quote');
    assert.equal(form1.captureRequests[0].currentAnswer.contractorName, 'Apex Builders');
  } finally { w.restore(); }
  for (const [over, code] of [
    [{ project: { id: 'p', name: 'Kitchen' } }, 'RENOVATION_PROJECT_ALREADY_CREATED'],
    [{ readinessState: 'NOT_EVALUATED' }, 'RENOVATION_READINESS_NOT_CURRENT'],
    [{ readinessStale: true }, 'RENOVATION_READINESS_NOT_CURRENT'],
    [{ readinessState: 'NOT_READY' }, 'RENOVATION_PROJECT_NOT_READY'],
  ]) {
    w = install('OWNER', prefillFor(over));
    try { assert.equal((await invoke('OWNER')).reasonCode, code); } finally { w.restore(); }
  }
});

test('the review shows the resolved amount and its source, "not set" when none, the funding, and what carries over; it writes nothing', async () => {
  let w = install('OWNER');
  try {
    const result = await review(form({ contractAmount: undefined }));
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    const byLabel = Object.fromEntries(result.confirmation.fields.map((f) => [f.label, f.value]));
    assert.match(byLabel['Contract amount'], /\$45,000 · From the selected quote/);
    assert.equal(byLabel.Funding, 'Not decided yet');
    assert.equal(byLabel['Open conditions to block'], '2');
    assert.equal(byLabel['Open dependencies carried over'], '3');
    assert.match(result.confirmation.description, /No contractor is contacted and nothing is booked/);
    assert.match(result.confirmation.description, /nothing you entered here is applied/);
    assert.equal(result.contextVersion, 'v1');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  w = install('OWNER', prefillFor({ contractAmountCents: null, contractAmountSource: null }));
  try {
    const result = await review(form({ contractAmount: undefined }));
    assert.equal(result.confirmation.fields.find((f) => f.label === 'Contract amount').value, 'Not set (recorded as unknown, not $0)');
    const entered = await review(form({ contractAmount: 0 }));
    assert.match(entered.confirmation.fields.find((f) => f.label === 'Contract amount').value, /^\$0 · Entered$/);
  } finally { w.restore(); }
  w = install('OWNER');
  try {
    assert.equal((await review(form({ contractorName: undefined }))).reasonCode, 'RENOVATION_HANDOFF_CONTRACTOR_REQUIRED');
    assert.equal((await review(form({ fundingMode: undefined }))).reasonCode, 'RENOVATION_HANDOFF_INPUT_INVALID');
  } finally { w.restore(); }
});

test('confirming calls the canonical handoff once with a planned request keyed to the execution; a changed case, or a tampered form, writes nothing', async () => {
  const w = install('OWNER');
  try {
    const parameters = { readinessCommand: { kind: 'HANDOFF', entityId: CASE }, readinessContextVersion: 'v1', readinessForm: form({ contractAmount: 45000 }) };
    const done = await confirmCapabilityInvoke(OP, ctx(parameters));
    assert.equal(done.result.reasonCode, 'RENOVATION_READINESS_HANDOFF_COMPLETED');
    assert.equal(done.artifactType, 'PROJECT_RECORD');
    assert.equal(w.calls.length, 1);
    const [propertyId, caseId, userId, request] = w.calls[0];
    assert.deepEqual([propertyId, caseId, userId], ['prop-1', CASE, 'u1']);
    assert.deepEqual(request, {
      projectType: 'KITCHEN_REMODEL', fulfillmentMode: 'PROVIDER', fundingMode: 'UNDECIDED', contractorName: 'Apex Builders', contractAmountCents: 4_500_000,
      startDate: '2026-11-01', intakeMode: 'PLANNED', contractDocumentIds: [], idempotencyKey: 'ask:exec-9:handoff',
    });
    // Each binding: the version covers the case, scope, readiness, mode, quote and project, so any change stales it.
    w.state.prefill = prefillFor({ version: 'v2' });
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    w.state.prefill = prefillFor();
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...parameters, readinessForm: { ...parameters.readinessForm, intakeMode: 'HISTORICAL' } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 1);
  } finally { w.restore(); }
});

test('the receipt tells created, replayed and already-created apart, and never claims a work item that was not synchronized', async () => {
  const w = install('OWNER');
  const parameters = { readinessCommand: { kind: 'HANDOFF', entityId: CASE }, readinessContextVersion: 'v1', readinessForm: form() };
  try {
    w.state.outcome = { id: 'proj-1', handoff: { outcome: 'ALREADY_CREATED', workItemSynced: true } };
    const already = await confirmCapabilityInvoke(OP, ctx(parameters));
    assert.equal(already.result.blocks[0].title, 'A project already existed');
    assert.match(already.result.blocks[0].description, /nothing you entered here was applied/);
    w.state.outcome = { id: 'proj-1', handoff: { outcome: 'IDEMPOTENT_REPLAY', workItemSynced: true } };
    assert.equal((await confirmCapabilityInvoke(OP, ctx(parameters))).result.blocks[0].title, 'Project already created by this request');
    w.state.outcome = { id: 'proj-1', handoff: { outcome: 'CREATED', workItemSynced: false } };
    const created = await confirmCapabilityInvoke(OP, ctx(parameters));
    assert.equal(created.result.blocks[0].title, 'Project created and linked');
    assert.ok(created.result.blocks.some((block) => /work item is not synchronized/.test(block.title)));
    w.state.outcome = { id: 'proj-1', handoff: { outcome: 'CREATED', workItemSynced: true } };
    assert.equal((await confirmCapabilityInvoke(OP, ctx(parameters))).result.blocks.some((block) => block.type === 'LIMITATION'), false);
  } finally { w.restore(); }
});

test('the action is allowlisted on the readiness answer, and is offered only to an owner of a ready case with no project (source check)', () => {
  assert.equal(isAskActionApplicable({
    action: { id: command.READINESS_COMMAND_ACTION_IDS.HANDOFF, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId: 'RENOVATION_PERMIT_READINESS', style: 'PRIMARY' },
    operationId: 'RENOVATION_PERMIT_READINESS', propertyId: 'prop-1', householdRole: 'OWNER', authoritativeSourceAvailable: true,
  }), true);
  const source = require('node:fs').readFileSync(require.resolve('../../src/services/ask/handlers/capitalPlanning.handler.ts'), 'utf8');
  assert.match(source, /isOwner && !readiness\.project && \['READY', 'READY_WITH_ACKNOWLEDGED_OPEN_ITEMS'\]\.includes\(summary\.state\)/);
});
