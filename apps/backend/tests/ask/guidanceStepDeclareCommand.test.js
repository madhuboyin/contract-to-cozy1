const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'x';
require('ts-node/register');

// The Ask manual declaration command (continuation FRD section 51): tightly allowlisted, server-owned wording, confirmation required.
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const handler = require('../../src/services/ask/handlers/guidanceStepDeclare.handler.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const { askGuidanceStepMode } = require('../../src/services/ask/askGuidanceStepHandlers.ts');
const { GUIDANCE_STEP_DECLARE_MESSAGE } = require('../../src/services/ask/support/guidanceStepDeclare.ts');

const OP = 'GUIDANCE_STEP_DECLARE';
let role; let step; let reports; let saved; let rec; let rc;
const stepRow = (key = 'prepare_property_access', over = {}) => ({ id: 's1', stepKey: key, toolKey: 'guidance-overview', status: 'PENDING', journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: null, primarySignal: { id: 'sig1', signalIntentFamily: 'service_needed', updatedAt: new Date('2026-10-02T00:00:00Z') } }, ...over });
const launch = { operationId: OP, entityType: 'GUIDANCE_STEP', entityId: 's1' };
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'e1', propertyId: 'p1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });
test.beforeEach(() => {
  role = 'CONTRIBUTOR'; step = stepRow(); reports = [];
  saved = ['guidanceSignal', 'guidanceJourney', 'guidanceJourneyEvent', 'guidanceStepEvidence', 'guidanceJourneyStep'].map((n) => [n, prisma[n]]);
  rec = guidanceJourneyService.recordToolCompletion; rc = executeOperation.reconcileAskExecutionSideEffects;
  prisma.guidanceSignal = {}; prisma.guidanceJourney = {}; prisma.guidanceJourneyEvent = {}; prisma.guidanceStepEvidence = {};
  prisma.guidanceJourneyStep = { findFirst: async () => step };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  guidanceJourneyService.recordToolCompletion = async (p) => { reports.push(p); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
});
test.afterEach(() => { for (const [n, m] of saved) prisma[n] = m; guidanceJourneyService.recordToolCompletion = rec; executeOperation.reconcileAskExecutionSideEffects = rc; });

test('exactly the two manual steps open this command, carrying the step', () => {
  for (const key of ['prepare_property_access', 'select_cleaning_type']) {
    const m = askGuidanceStepMode('guidance-overview', key);
    assert.deepEqual([m.inAsk?.operationId, m.inAsk?.carriesStep], [OP, 'ENTITY'], key);
  }
  for (const key of ['update_budget', 'confirm_cleaning_complete', 'review_signal']) assert.notEqual(askGuidanceStepMode('guidance-overview', key).inAsk?.operationId, OP, key);
});

test('it is not message-routable: only the declared step action opens it', async () => {
  assert.equal((await handler.guidanceStepDeclareResult('u1', 'p1', 'I prepared access', undefined)).reasonCode, 'GUIDANCE_STEP_DECLARE_STEP_REQUIRED');
  assert.equal((await handler.guidanceStepDeclareResult('u1', 'p1', 'I prepared access', launch)).reasonCode, 'GUIDANCE_STEP_DECLARE_STEP_REQUIRED');
});

test('only the two allowlisted open steps can be declared; a viewer cannot', async () => {
  step = stepRow('update_budget');
  assert.equal((await handler.guidanceStepDeclareResult('u1', 'p1', GUIDANCE_STEP_DECLARE_MESSAGE, launch)).reasonCode, 'GUIDANCE_STEP_DECLARE_STEP_UNAVAILABLE');
  step = stepRow('prepare_property_access', { status: 'COMPLETED' });
  assert.equal((await handler.guidanceStepDeclareResult('u1', 'p1', GUIDANCE_STEP_DECLARE_MESSAGE, launch)).reasonCode, 'GUIDANCE_STEP_DECLARE_STEP_UNAVAILABLE');
  step = stepRow(); role = 'VIEWER';
  assert.equal((await handler.guidanceStepDeclareResult('u1', 'p1', GUIDANCE_STEP_DECLARE_MESSAGE, launch)).status, 'BLOCKED');
});

test('access is declared with the server\'s exact words and recorded only after confirmation', async () => {
  const proposal = await handler.guidanceStepDeclareResult('u1', 'p1', GUIDANCE_STEP_DECLARE_MESSAGE, launch);
  assert.equal(proposal.status, 'NEEDS_CONFIRMATION');
  assert.equal(proposal.confirmation.fields[0].value, 'I have prepared access to the property for this service.');
  assert.equal(reports.length, 0, 'proposing records nothing');
  const done = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.equal(reports[0].producedData.declarationText, 'I have prepared access to the property for this service.');
  assert.ok(done.result.blocks[0].details.some((d) => /recorded as done/.test(d.value)));
});

test('the cleaning type asks for a catalog key, never free text, then confirms that exact choice', async () => {
  step = stepRow('select_cleaning_type');
  const ask = await handler.guidanceStepDeclareResult('u1', 'p1', GUIDANCE_STEP_DECLARE_MESSAGE, launch);
  assert.equal(ask.status, 'NEEDS_CONTEXT');
  assert.deepEqual(ask.captureRequests[0].inputSchema.fields[0].inputSchema.options.map((o) => o.value), ['standard_clean', 'deep_clean', 'move_clean', 'post_construction']);
  const unknown = await handler.guidanceStepDeclareResult('u1', 'p1', GUIDANCE_STEP_DECLARE_MESSAGE, launch, 'make up my own words');
  assert.equal(unknown.reasonCode, 'GUIDANCE_STEP_DECLARE_UNKNOWN');
  const proposal = await handler.guidanceStepDeclareResult('u1', 'p1', GUIDANCE_STEP_DECLARE_MESSAGE, launch, 'deep_clean');
  await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.deepEqual([reports[0].producedData.selectedCleaningType, reports[0].producedData.declarationText], ['deep_clean', 'I choose: One-time deep clean.']);
});

test('a tampered confirmation (another key) is refused', async () => {
  const proposal = await handler.guidanceStepDeclareResult('u1', 'p1', GUIDANCE_STEP_DECLARE_MESSAGE, launch);
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...proposal.parameters, guidanceDeclarationKey: 'other' })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
});
