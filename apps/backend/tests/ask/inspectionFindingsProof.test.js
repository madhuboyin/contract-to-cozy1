const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'x';
require('ts-node/register');

// "Act on findings" is completed by the findings' decisions (continuation FRD section 46).
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const ops = require('../../src/services/inspectionFindingsProofOperations.ts');
const handler = require('../../src/services/ask/handlers/inspectionFindingsCheck.handler.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const { INSPECTION_FINDINGS_CHECK_MESSAGE } = require('../../src/services/ask/support/inspectionFindingsCheck.ts');

const OP = 'INSPECTION_FINDINGS_CHECK';
let role; let step; let findings; let reports; let saved; let rec; let rc;
const stepRow = (src) => ({ id: 's1', stepKey: 'act_on_inspection_findings', toolKey: 'guidance-overview', status: 'PENDING', journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: null,
  primarySignal: src ?? { signalIntentFamily: 'inspection_followup_needed', sourceToolKey: 'inspection-hub', sourceEntityType: 'INSPECTION_FINDING', sourceEntityId: 'f1' } } });
const f = (id, over = {}) => ({ id, reportId: 'r1', propertyId: 'p1', status: 'OPEN', workDisposition: 'PENDING_REVIEW', inspectorDescription: `Finding ${id}`, ...over });
const launch = { operationId: OP, entityType: 'GUIDANCE_STEP', entityId: 's1' };
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'e1', propertyId: 'p1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });
test.beforeEach(() => {
  role = 'CONTRIBUTOR'; step = stepRow(); findings = [f('f1')]; reports = [];
  saved = ['guidanceSignal', 'guidanceJourney', 'guidanceJourneyEvent', 'guidanceStepEvidence', 'guidanceJourneyStep', 'inspectionFinding', 'inspectionReport'].map((n) => [n, prisma[n]]);
  rec = guidanceJourneyService.recordToolCompletion; rc = executeOperation.reconcileAskExecutionSideEffects;
  prisma.guidanceSignal = {}; prisma.guidanceJourney = {}; prisma.guidanceJourneyEvent = {}; prisma.guidanceStepEvidence = {};
  prisma.guidanceJourneyStep = { findFirst: async () => step };
  prisma.inspectionFinding = { findFirst: async ({ where }) => findings.find((x) => x.id === where.id) ?? null, findMany: async () => findings };
  prisma.inspectionReport = { findFirst: async () => ({ id: 'r1', propertyId: 'p1' }) };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  guidanceJourneyService.recordToolCompletion = async (p) => { reports.push(p); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
});
test.afterEach(() => { for (const [n, m] of saved) prisma[n] = m; guidanceJourneyService.recordToolCompletion = rec; executeOperation.reconcileAskExecutionSideEffects = rc; });

test('a finding still open and pending review blocks the step and reports nothing', async () => {
  await assert.rejects(() => ops.checkFindingDecisionsWithEffects('p1', 'u1', 's1'), (e) => e.code === 'INSPECTION_FINDINGS_PENDING' && e.details.pending[0].id === 'f1');
  assert.equal(reports.length, 0);
});

test('a finding journey is completed by that one finding\'s decision (accepted as work, monitored, dismissed or resolved all count)', async () => {
  for (const over of [{ workDisposition: 'ACCEPTED' }, { workDisposition: 'MONITOR' }, { status: 'DISMISSED' }, { status: 'RESOLVED' }]) {
    reports.length = 0; findings = [f('f1', over)];
    const out = await ops.checkFindingDecisionsWithEffects('p1', 'u1', 's1');
    assert.equal(out.guidanceReported, true, JSON.stringify(over));
    assert.deepEqual([reports[0].producedData.proofType, reports[0].producedData.findingIds], ['inspection_findings_decided', ['f1']]);
  }
});

test('a report journey needs EVERY finding decided: one decision never completes a step about the whole report', async () => {
  step = stepRow({ signalIntentFamily: 'inspection_followup_needed', sourceToolKey: 'inspection-report', sourceEntityType: 'INSPECTION_REPORT', sourceEntityId: 'r1' });
  findings = [f('f1', { workDisposition: 'ACCEPTED' }), f('f2')];
  await assert.rejects(() => ops.checkFindingDecisionsWithEffects('p1', 'u1', 's1'), (e) => e.code === 'INSPECTION_FINDINGS_PENDING');
  findings = [f('f1', { workDisposition: 'ACCEPTED' }), f('f2', { workDisposition: 'MONITOR' })];
  const out = await ops.checkFindingDecisionsWithEffects('p1', 'u1', 's1');
  assert.deepEqual([out.state.total, out.state.decided], [2, 2]);
});

test('Ask: pending findings are listed with nothing proposed; decided ones propose and confirm; a changed set is refused', async () => {
  const pending = await handler.inspectionFindingsCheckResult('u1', 'p1', INSPECTION_FINDINGS_CHECK_MESSAGE, launch);
  assert.equal(pending.reasonCode, 'INSPECTION_FINDINGS_CHECK_PENDING');
  findings = [f('f1', { workDisposition: 'ACCEPTED' })];
  const proposal = await handler.inspectionFindingsCheckResult('u1', 'p1', INSPECTION_FINDINGS_CHECK_MESSAGE, launch);
  assert.equal(proposal.status, 'NEEDS_CONFIRMATION');
  findings = [f('f1', { workDisposition: 'ACCEPTED' }), f('f9', { workDisposition: 'ACCEPTED' })];
  step = stepRow({ signalIntentFamily: 'x', sourceToolKey: 'inspection-report', sourceEntityType: 'INSPECTION_REPORT', sourceEntityId: 'r1' });
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(proposal.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  step = stepRow(); findings = [f('f1', { workDisposition: 'ACCEPTED' })];
  const done = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.ok(done.result.blocks[0].details.some((d) => /recorded as done/.test(d.value)));
});
