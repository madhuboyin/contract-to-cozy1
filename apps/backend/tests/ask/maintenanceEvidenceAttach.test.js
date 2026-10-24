const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'x';
require('ts-node/register');

// Attaching Home Record evidence to a maintenance task in Ask (continuation FRD section 41).
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const handler = require('../../src/services/ask/handlers/maintenanceEvidenceAttach.handler.ts');
const ops = require('../../src/services/maintenanceTaskJourneyOperations.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { askGuidanceStepMode } = require('../../src/services/ask/askGuidanceStepHandlers.ts');

const OP = 'MAINTENANCE_EVIDENCE_ATTACH';
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'e1', propertyId: 'p1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });
let role; let task; let links; let step; let records; let attached; let savedAttach; let saved; let savedReconcile;
const stepRow = (over = {}) => ({ id: 's1', stepKey: 'complete_compliance_task', toolKey: 'maintenance', status: 'PENDING', journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: null, primarySignal: null }, ...over });
test.beforeEach(() => {
  role = 'CONTRIBUTOR'; step = stepRow(); attached = [];
  task = { id: 't1', propertyId: 'p1', title: 'Annual fire inspection', status: 'COMPLETED', updatedAt: new Date('2026-10-01T00:00:00Z') };
  links = [{ stepId: 's1', maintenanceTaskId: 't1', propertyId: 'p1', createdAt: new Date() }];
  records = [{ id: 'r1', title: 'Fire inspection certificate', recordType: 'INSPECTION_REPORT', sensitivity: 'STANDARD', currentVersionId: 'v1', currentVersion: { mimeType: 'application/pdf' } }];
  saved = ['guidanceSignal', 'guidanceJourney', 'guidanceJourneyEvent', 'guidanceStepEvidence', 'guidanceJourneyStep', 'guidanceStepMaintenanceTaskLink', 'propertyMaintenanceTask', 'propertyRecord'].map((n) => [n, prisma[n]]);
  savedAttach = ops.attachMaintenanceTaskEvidence; savedReconcile = executeOperation.reconcileAskExecutionSideEffects;
  prisma.guidanceSignal = {}; prisma.guidanceJourney = {}; prisma.guidanceJourneyEvent = {}; prisma.guidanceStepEvidence = {};
  prisma.guidanceJourneyStep = { findFirst: async () => step };
  prisma.guidanceStepMaintenanceTaskLink = { findMany: async () => links };
  prisma.propertyMaintenanceTask = { findMany: async () => [task], findFirst: async () => task };
  prisma.propertyRecord = { findMany: async ({ where }) => (where.id?.in ? records.filter((r) => where.id.in.includes(r.id)) : records) };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  ops.attachMaintenanceTaskEvidence = async (...args) => { attached.push(args); return { evidence: [{ source: 'HOME_RECORD', id: 'r1', versionId: 'v1' }], reportedStepIds: ['s1'] }; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
});
test.afterEach(() => { for (const [n, m] of saved) prisma[n] = m; ops.attachMaintenanceTaskEvidence = savedAttach; executeOperation.reconcileAskExecutionSideEffects = savedReconcile; });

test('the compliance step is an in-Ask step for the evidence operation, carrying the step', () => {
  const mode = askGuidanceStepMode('maintenance', 'complete_compliance_task');
  assert.deepEqual([mode.inAsk?.operationId, mode.inAsk?.carriesStep], [OP, 'ENTITY']);
});

test('a step with no linked task offers to create one for it, and never picks a task by title', async () => {
  links = [];
  const out = await handler.maintenanceEvidenceAttachResult('u1', 'p1', { stepId: 's1', taskId: null, sourceExecutionId: null });
  assert.equal(out.reasonCode, 'MAINTENANCE_EVIDENCE_NO_LINKED_TASK');
  const action = out.blocks.flatMap((b) => b.actions ?? []).find((a) => a.id === 'maintenance-create-for-step');
  assert.deepEqual([action.operationId, action.entityType, action.entityId], ['MAINTENANCE_TASK_CREATE', 'GUIDANCE_STEP', 's1']);
});

test('a linked task opens a form with Home Records to choose from and upload straight into Home Records', async () => {
  const out = await handler.maintenanceEvidenceAttachResult('u1', 'p1', { stepId: 's1', taskId: null, sourceExecutionId: null });
  assert.equal(out.status, 'NEEDS_CONTEXT');
  const field = out.captureRequests[0].inputSchema.fields[0];
  assert.deepEqual([field.inputSchema.type, field.inputSchema.allowUpload, field.inputSchema.uploadTarget], ['DOCUMENT_MULTI_SELECT', true, 'HOME_RECORDS']);
  assert.deepEqual(field.inputSchema.options.map((o) => o.value), ['r1']);
});

test('a closed or wrong-tool step, and a viewer, are refused before anything is offered', async () => {
  step = stepRow({ status: 'COMPLETED' });
  assert.equal((await handler.maintenanceEvidenceAttachResult('u1', 'p1', { stepId: 's1', taskId: null, sourceExecutionId: null })).reasonCode, 'MAINTENANCE_EVIDENCE_STEP_UNAVAILABLE');
  step = stepRow(); role = 'VIEWER';
  assert.equal((await handler.maintenanceEvidenceAttachResult('u1', 'p1', { stepId: 's1', taskId: null, sourceExecutionId: null })).status, 'BLOCKED');
});

test('chosen records are re-validated through the Home Records resolver before the confirmation', async () => {
  const bad = await handler.maintenanceEvidenceAttachResult('u1', 'p1', { stepId: 's1', taskId: 't1', sourceExecutionId: null }, { recordIds: ['legacy-doc'] });
  assert.equal(bad.reasonCode, 'MAINTENANCE_EVIDENCE_RECORDS_UNAVAILABLE');
  const good = await handler.maintenanceEvidenceAttachResult('u1', 'p1', { stepId: 's1', taskId: 't1', sourceExecutionId: null }, { recordIds: ['r1'] });
  assert.equal(good.status, 'NEEDS_CONFIRMATION');
  assert.ok(good.confirmation.fields.some((f) => f.label === 'Evidence' && f.value === 'Fire inspection certificate'));
});

test('confirming attaches through the shared service and says the step is recorded; a changed task is refused', async () => {
  const proposal = await handler.maintenanceEvidenceAttachResult('u1', 'p1', { stepId: 's1', taskId: 't1', sourceExecutionId: null }, { recordIds: ['r1'] });
  const done = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.deepEqual(attached[0], ['u1', 't1', ['r1']]);
  assert.ok(done.result.blocks[0].details.some((d) => d.label === 'Guided journey' && /recorded as done/.test(d.value)));
  task.updatedAt = new Date('2026-10-02T00:00:00Z');
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(proposal.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
});
