const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Register "Permits": records lookup, unpermitted-work scan, record work, research a flag, start a plan, and inspection steps from Ask (FRD v1.488).
// No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const trackerService = require('../../src/services/permitTracker.service.ts');
const fetchService = require('../../src/services/permitFetch.service.ts');
const detectionService = require('../../src/services/permitDetection.service.ts');
const compliance = require('../../src/services/projectCompliance/context.ts');
const extra = require('../../src/services/ask/support/permitTrackerExtra.ts');
const { permitTrackerFromView } = require('../../src/services/ask/handlers/permitTracker.handler.ts');

const OP = 'PERMIT_TRACKER_COMMAND';
const IDS = extra.PERMIT_EXTRA_ACTION_IDS;
const T = new Date('2026-10-01T00:00:00Z');
const FLAG = { id: 'f-1', status: 'FLAGGED', workType: 'ROOF_REPLACEMENT', remediationCaseId: null, updatedAt: T };
const MILESTONE = { id: 'm-1', permitRecordId: 'p-1', stageName: 'Framing', status: 'NOT_SCHEDULED', scheduledDate: null, inspectedDate: null, updatedAt: T };

function stubs({ role = 'CONTRIBUTOR', flag = FLAG, milestone = MILESTONE, permit = { id: 'p-1', updatedAt: T } } = {}) {
  const saved = {
    a: propertyAccess.resolvePropertyAccess, f: prisma.permitUnpermittedFlag, m: prisma.permitInspectionMilestone, p: prisma.propertyPermitRecord,
    ts: { ...trackerService.permitTrackerService }, fs: fetchService.permitFetchService.triggerFetch, ds: detectionService.permitDetectionService.detectUnpermittedWork,
    c: compliance.assertProjectComplianceApplicable, q: executeOperation.reconcileAskExecutionSideEffects,
  };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  prisma.permitUnpermittedFlag = { findFirst: async (args) => (flag && args.where.id === flag.id && args.where.propertyId === 'prop-1' ? flag : null) };
  prisma.permitInspectionMilestone = { findFirst: async (args) => (milestone && args.where.id === milestone.id && args.where.permitRecordId === milestone.permitRecordId ? milestone : null) };
  prisma.propertyPermitRecord = { findFirst: async (args) => (permit && args.where.id === permit.id && args.where.isActive ? permit : null) };
  const svc = trackerService.permitTrackerService;
  svc.createManualFlag = async (...args) => { calls.push(['createManualFlag', ...args]); return { id: 'f-9' }; };
  svc.updateFlag = async (...args) => { calls.push(['updateFlag', ...args]); return {}; };
  svc.createRemediationCase = async (...args) => { calls.push(['createRemediationCase', ...args]); return { id: 'case-1' }; };
  svc.addInspectionMilestone = async (...args) => { calls.push(['addInspectionMilestone', ...args]); return { id: 'm-9' }; };
  svc.updateInspectionMilestone = async (...args) => { calls.push(['updateInspectionMilestone', ...args]); return {}; };
  svc.deleteInspectionMilestone = async (...args) => { calls.push(['deleteInspectionMilestone', ...args]); };
  fetchService.permitFetchService.triggerFetch = async (...args) => { calls.push(['triggerFetch', ...args]); return { fetchJobId: 'job-1' }; };
  detectionService.permitDetectionService.detectUnpermittedWork = async (...args) => { calls.push(['detect', ...args]); return 2; };
  compliance.assertProjectComplianceApplicable = async (...args) => { calls.push(['gate', ...args.slice(0, 3)]); };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore: () => {
    propertyAccess.resolvePropertyAccess = saved.a; prisma.permitUnpermittedFlag = saved.f; prisma.permitInspectionMilestone = saved.m; prisma.propertyPermitRecord = saved.p;
    Object.assign(trackerService.permitTrackerService, saved.ts); fetchService.permitFetchService.triggerFetch = saved.fs; detectionService.permitDetectionService.detectUnpermittedWork = saved.ds;
    compliance.assertProjectComplianceApplicable = saved.c; executeOperation.reconcileAskExecutionSideEffects = saved.q;
  } };
}
const ENTITY = { PROPERTY: ['PERMIT_TRACKER_PROPERTY', 'prop-1'], PERMIT: ['PERMIT_RECORD', 'p-1'], FLAG: ['PERMIT_UNPERMITTED_FLAG', 'f-1'], INSPECTION: ['PERMIT_INSPECTION_MILESTONE', 'p-1:m-1'] };
const launch = (actionId) => { const [entityType, entityId] = ENTITY[extra.PERMIT_EXTRA_TARGETS[actionId]]; return { operationId: OP, surface: 'ASK_PAGE', actionId, entityType, entityId }; };
const invoke = (actionId, role = 'CONTRIBUTOR') => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: extra.PERMIT_EXTRA_MESSAGES[actionId], launchContext: launch(actionId) }, { propertyAccess: { role } });
const ctx = (parameters, role = 'CONTRIBUTOR') => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role }, parameters });
const handler = require('../../src/services/ask/handlers/permitTrackerExtraCommands.handler.ts');
const review = (actionId, supplied) => handler.permitExtraCommandResult('user-1', 'prop-1', { actionId, entityId: launch(actionId).entityId, sourceExecutionId: null }, supplied);

test('the forms validate: flag, inspection add and update; steps are addressed by permit and step', () => {
  const ok = extra.parsePermitExtraForm(IDS.FLAG_ADD, { workType: 'ROOF_REPLACEMENT', disclosureRisk: 'HIGH', workOrigin: 'PRIOR_OWNER', workStage: 'COMPLETED', workStartedAt: { precision: 'EXACT_DATE', value: '2015-05-01' }, flagReason: '' });
  assert.equal(ok.success, true);
  assert.deepEqual(extra.permitFlagCreateBody(ok.data), { workType: 'ROOF_REPLACEMENT', disclosureRisk: 'HIGH', workOrigin: 'PRIOR_OWNER', workStage: 'COMPLETED', workStartedAt: '2015-05-01', recordSearchOutcome: 'NOT_SEARCHED', evidenceDocumentIds: [], researchChannel: 'NONE' });
  assert.equal(extra.parsePermitExtraForm(IDS.FLAG_ADD, { workType: 'NOPE', disclosureRisk: 'HIGH', workOrigin: 'UNKNOWN', workStage: 'UNKNOWN' }).success, false);
  assert.equal(extra.parsePermitExtraForm(IDS.FLAG_ADD, { workType: 'FENCE', disclosureRisk: 'LOW', workOrigin: 'UNKNOWN', workStage: 'UNKNOWN', workStartedAt: '2020-02-02', workCompletedAt: '2019-01-01' }).success, false);
  const add = extra.parsePermitExtraForm(IDS.INSPECTION_ADD, { stageName: ' Framing ', stageType: 'FRAMING', scheduledDate: '2026-11-02' });
  assert.deepEqual(extra.permitInspectionCreateBody(add.data), { stageName: 'Framing', stageType: 'FRAMING', status: 'SCHEDULED', isRequired: true, scheduledDate: '2026-11-02T12:00:00.000Z' });
  assert.equal(extra.parsePermitExtraForm(IDS.INSPECTION_ADD, { stageName: '', stageType: 'FRAMING' }).success, false);
  assert.equal(extra.parsePermitExtraForm(IDS.INSPECTION_UPDATE, { status: 'PASSED', inspectedDate: '2026-11-03', extra: 1 }).success, false);
  assert.deepEqual(extra.parseInspectionEntityId('p-1:m-1'), { permitId: 'p-1', milestoneId: 'm-1' });
  assert.equal(extra.parseInspectionEntityId('nope'), null);
});

test('a viewer is refused and nothing is written; a wrong entity type is not routable', async () => {
  const s = stubs({ role: 'VIEWER' });
  try {
    assert.equal((await invoke(IDS.SCAN, 'VIEWER')).status, 'BLOCKED');
    assert.equal(s.calls.length, 0);
  } finally { s.restore(); }
  const t = stubs();
  try {
    const out = await capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: extra.PERMIT_EXTRA_MESSAGES[IDS.SCAN], launchContext: { ...launch(IDS.SCAN), entityType: 'PERMIT_RECORD' } }, { propertyAccess: { role: 'CONTRIBUTOR' } });
    assert.equal(out.reasonCode, 'ASK_PERMIT_COMMAND_NOT_DIRECTLY_ROUTABLE');
  } finally { t.restore(); }
});

test('look for records and scan: reviewed, then the canonical calls behind the compliance gate', async () => {
  const s = stubs();
  try {
    for (const [id, call, title] of [[IDS.FETCH, 'triggerFetch', 'Looking for permit records'], [IDS.SCAN, 'detect', '2 possible unpermitted items flagged']]) {
      s.calls.length = 0;
      const out = await invoke(id);
      assert.equal(out.status, 'NEEDS_CONFIRMATION');
      assert.equal(s.calls.length, 0);
      const done = await confirmCapabilityInvoke(OP, ctx(out.parameters));
      assert.deepEqual(s.calls.map((c) => c[0]), ['gate', call]);
      assert.equal(done.result.blocks[0].title, title);
    }
    const again = await invoke(IDS.SCAN);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...again.parameters, permitExtraContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  } finally { s.restore(); }
});

test('record work: the form, a review that says it files nothing, then createManualFlag with Desktop defaults', async () => {
  const s = stubs();
  try {
    const form = await invoke(IDS.FLAG_ADD);
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].captureKey, extra.PERMIT_EXTRA_CAPTURE_KEY);
    assert.equal((await review(IDS.FLAG_ADD, { workType: 'NOPE' })).reasonCode, 'PERMIT_EXTRA_INPUT_INVALID');
    const out = await review(IDS.FLAG_ADD, { workType: 'FENCE', disclosureRisk: 'LOW', workOrigin: 'UNKNOWN', workStage: 'UNKNOWN' });
    assert.equal(out.status, 'NEEDS_CONFIRMATION');
    assert.match(out.confirmation.description, /does not say the work was or was not permitted/);
    assert.equal(s.calls.length, 0);
    const done = await confirmCapabilityInvoke(OP, ctx(out.parameters));
    assert.equal(s.calls[0][0], 'createManualFlag');
    assert.equal(s.calls[0][3].recordSearchOutcome, 'NOT_SEARCHED');
    assert.equal(done.artifactId, 'f-9');
  } finally { s.restore(); }
});

test('research a flag and start a plan: only when open / without a plan, bound to the flag version, canonical calls', async () => {
  let s = stubs();
  try {
    const research = await invoke(IDS.FLAG_RESEARCH);
    assert.equal(research.status, 'NEEDS_CONFIRMATION');
    await confirmCapabilityInvoke(OP, ctx(research.parameters));
    assert.deepEqual(s.calls[0].slice(0, 5), ['updateFlag', 'f-1', 'prop-1', 'user-1', { status: 'INVESTIGATING' }]);
    const plan = await invoke(IDS.FLAG_REMEDIATE);
    await confirmCapabilityInvoke(OP, ctx(plan.parameters));
    assert.equal(s.calls[1][0], 'createRemediationCase');
    assert.match(plan.confirmation.description, /does not start work, apply for a permit or contact anyone/);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...research.parameters, permitExtraContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  } finally { s.restore(); }
  s = stubs({ flag: { ...FLAG, status: 'INVESTIGATING', remediationCaseId: 'c-1' } });
  try {
    assert.equal((await invoke(IDS.FLAG_RESEARCH)).reasonCode, 'PERMIT_FLAG_NOT_OPEN');
    assert.equal((await invoke(IDS.FLAG_REMEDIATE)).reasonCode, 'PERMIT_FLAG_HAS_PLAN');
  } finally { s.restore(); }
});

test('inspection steps: add, update and remove are reviewed and call the canonical service with both ids', async () => {
  const s = stubs();
  try {
    assert.equal((await invoke(IDS.INSPECTION_ADD)).status, 'NEEDS_CONTEXT');
    const add = await review(IDS.INSPECTION_ADD, { stageName: 'Final', stageType: 'FINAL' });
    await confirmCapabilityInvoke(OP, ctx(add.parameters));
    assert.deepEqual(s.calls[0].slice(0, 3), ['addInspectionMilestone', 'p-1', 'prop-1']);
    assert.equal(s.calls[0][3].status, 'NOT_SCHEDULED');
    const upd = await review(IDS.INSPECTION_UPDATE, { status: 'PASSED', inspectedDate: '2026-11-03' });
    assert.match(upd.confirmation.description, /does not book or cancel anything/);
    await confirmCapabilityInvoke(OP, ctx(upd.parameters));
    assert.deepEqual(s.calls[1].slice(0, 4), ['updateInspectionMilestone', 'm-1', 'p-1', 'prop-1']);
    assert.equal(s.calls[1][4].status, 'PASSED');
    const del = await invoke(IDS.INSPECTION_REMOVE);
    await confirmCapabilityInvoke(OP, ctx(del.parameters));
    assert.deepEqual(s.calls[2].slice(0, 4), ['deleteInspectionMilestone', 'm-1', 'p-1', 'prop-1']);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...del.parameters, permitExtraContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  } finally { s.restore(); }
  const missing = stubs({ milestone: null });
  try { assert.equal((await invoke(IDS.INSPECTION_REMOVE)).reasonCode, 'PERMIT_INSPECTION_NOT_FOUND'); } finally { missing.restore(); }
});

test('the answer offers the steps only to a contributor or owner, with no link, and every id is allowlisted', () => {
  const permit = { id: 'p-1', permitNumber: 'B-1', category: 'ROOFING', status: 'ISSUED', reportedStatus: 'ISSUED_REPORTED', workTypes: ['ROOF_REPLACEMENT'], hasOpenInspections: true, isVerified: false };
  const flag = { id: 'f-1', workType: 'FENCE', flagReason: 'No record', disclosureRisk: 'LOW', status: 'FLAGGED', remediationCaseId: null };
  const summary = { totalPermits: 1, activePermits: 1, finaledPermits: 0, openFlags: 1 };
  const step = { id: 'm-1', permitRecordId: 'p-1', stageName: 'Framing', stageType: 'FRAMING', status: 'SCHEDULED', scheduledDate: new Date('2026-11-02T12:00:00Z'), inspectedDate: null };
  const own = permitTrackerFromView([permit], summary, [flag], false, true, 'prop-1', [step]);
  const ids = (list) => list.flatMap((block) => [...(block.actions ?? []), ...((block.sections ?? []).flatMap((section) => section.items.flatMap((item) => item.actions ?? [])))]).map((a) => a.id);
  assert.deepEqual([...new Set(ids(own.blocks))].sort(), [IDS.FETCH, IDS.SCAN, IDS.FLAG_ADD, IDS.FLAG_RESEARCH, IDS.FLAG_REMEDIATE, IDS.INSPECTION_ADD, IDS.INSPECTION_UPDATE, IDS.INSPECTION_REMOVE, 'permit-tracker-add', 'permit-tracker-edit', 'permit-tracker-remove'].sort());
  assert.ok(own.blocks.some((block) => block.id === 'permit-tracker-inspections'));
  const viewer = permitTrackerFromView([permit], summary, [flag], false, false, 'prop-1', [step]);
  assert.deepEqual(ids(viewer.blocks), []);
  assert.ok(!JSON.stringify(own.blocks).includes('/dashboard'));
  for (const id of Object.values(IDS)) {
    assert.equal(isAskActionApplicable({
      action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId: OP, style: 'SECONDARY' }, operationId: 'PERMIT_TRACKER_STATUS', propertyId: 'prop-1', householdRole: 'OWNER', authoritativeSourceAvailable: true,
    }), true, id);
  }
});
