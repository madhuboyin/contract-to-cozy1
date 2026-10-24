const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'x';
require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const handler = require('../../src/services/ask/handlers/coverageRecordCheck.handler.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const { askGuidanceStepMode } = require('../../src/services/ask/askGuidanceStepHandlers.ts');
const { COVERAGE_RECORD_CHECK_MESSAGE } = require('../../src/services/ask/support/coverageRecordCheck.ts');

const OP = 'COVERAGE_RECORD_CHECK';
let role; let warranties; let reports; let saved; let rec; let rc;
const stepRow = () => ({ id: 's1', stepKey: 'activate_warranty_coverage', toolKey: 'documents', status: 'PENDING', journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: 'item-1', primarySignal: null } });
const launch = { operationId: OP, entityType: 'GUIDANCE_STEP', entityId: 's1' };
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'e1', propertyId: 'p1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });
test.beforeEach(() => {
  role = 'CONTRIBUTOR'; reports = []; warranties = [];
  saved = ['guidanceSignal', 'guidanceJourney', 'guidanceJourneyEvent', 'guidanceStepEvidence', 'guidanceJourneyStep', 'insurancePolicy', 'warranty'].map((n) => [n, prisma[n]]);
  rec = guidanceJourneyService.recordToolCompletion; rc = executeOperation.reconcileAskExecutionSideEffects;
  prisma.guidanceSignal = {}; prisma.guidanceJourneyEvent = {}; prisma.guidanceStepEvidence = {};
  prisma.guidanceJourney = { findFirst: async () => ({ createdAt: new Date('2026-10-01') }) };
  prisma.guidanceJourneyStep = { findFirst: async () => stepRow() };
  prisma.warranty = { findMany: async () => warranties }; prisma.insurancePolicy = { findMany: async () => [] };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  guidanceJourneyService.recordToolCompletion = async (p) => { reports.push(p); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
});
test.afterEach(() => { for (const [n, m] of saved) prisma[n] = m; guidanceJourneyService.recordToolCompletion = rec; executeOperation.reconcileAskExecutionSideEffects = rc; });

test('both coverage-record steps open this check carrying the step', () => {
  for (const key of ['activate_warranty_coverage', 'bind_policy_and_record_documents']) {
    const m = askGuidanceStepMode('documents', key);
    assert.deepEqual([m.inAsk?.operationId, m.inAsk?.carriesStep], [OP, 'ENTITY'], key);
  }
});

test('with no saved plan it explains and proposes nothing; with one it proposes completing the step on that record', async () => {
  assert.equal((await handler.coverageRecordCheckResult('u1', 'p1', COVERAGE_RECORD_CHECK_MESSAGE, launch)).reasonCode, 'COVERAGE_RECORD_CHECK_NO_RECORD');
  warranties = [{ id: 'w1', providerName: 'Shield', updatedAt: new Date('2026-10-05') }];
  const out = await handler.coverageRecordCheckResult('u1', 'p1', COVERAGE_RECORD_CHECK_MESSAGE, launch);
  assert.equal(out.status, 'NEEDS_CONFIRMATION');
  assert.equal(out.confirmation.fields[0].value, 'Shield');
});

test('confirming completes the step on the shown record; a different record at confirmation is refused', async () => {
  warranties = [{ id: 'w1', providerName: 'Shield', updatedAt: new Date('2026-10-05') }];
  const proposal = await handler.coverageRecordCheckResult('u1', 'p1', COVERAGE_RECORD_CHECK_MESSAGE, launch);
  const done = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.equal(reports[0].producedData.recordId, 'w1');
  assert.ok(done.result.blocks[0].details.some((d) => /recorded as done/.test(d.value)));
  warranties = [{ id: 'w2', providerName: 'Other', updatedAt: new Date('2026-10-06') }];
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(proposal.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
});

test('not declared by the step, or a viewer: nothing is offered', async () => {
  assert.equal((await handler.coverageRecordCheckResult('u1', 'p1', 'check my warranty', undefined)).reasonCode, 'COVERAGE_RECORD_CHECK_STEP_REQUIRED');
  role = 'VIEWER';
  assert.equal((await handler.coverageRecordCheckResult('u1', 'p1', COVERAGE_RECORD_CHECK_MESSAGE, launch)).status, 'BLOCKED');
});
