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
const { permitTrackerFromView, permitFetchStatusAnswer, permitDisclosureStatusAnswer } = require('../../src/services/ask/handlers/permitTracker.handler.ts');
const { isPermitTrackerReadRequest } = require('../../src/services/ask/support/permitTrackerRead.ts');

const OP = 'PERMIT_TRACKER_COMMAND';
const IDS = extra.PERMIT_EXTRA_ACTION_IDS;
const T = new Date('2026-10-01T00:00:00Z');
const FLAG = { id: 'f-1', status: 'FLAGGED', workType: 'ROOF_REPLACEMENT', remediationCaseId: null, evidenceDocumentIds: [], updatedAt: T };
const MILESTONE = { id: 'm-1', permitRecordId: 'p-1', stageName: 'Framing', status: 'NOT_SCHEDULED', scheduledDate: null, inspectedDate: null, updatedAt: T };

function stubs({ role = 'CONTRIBUTOR', flag = FLAG, milestone = MILESTONE, permit = { id: 'p-1', updatedAt: T }, documents = [{ id: 'doc-1', name: 'Letter from the building department' }], authorityPermits = [{ id: 'p-1', permitNumber: 'B-1', category: 'ROOFING' }] } = {}) {
  const saved = {
    a: propertyAccess.resolvePropertyAccess, d: prisma.document, f: prisma.permitUnpermittedFlag, m: prisma.permitInspectionMilestone, p: prisma.propertyPermitRecord,
    ts: { ...trackerService.permitTrackerService }, fs: fetchService.permitFetchService.triggerFetch, ds: detectionService.permitDetectionService.detectUnpermittedWork,
    c: compliance.assertProjectComplianceApplicable, q: executeOperation.reconcileAskExecutionSideEffects,
  };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  prisma.permitUnpermittedFlag = { findFirst: async (args) => (flag && args.where.id === flag.id && args.where.propertyId === 'prop-1' ? flag : null) };
  prisma.permitInspectionMilestone = { findFirst: async (args) => (milestone && args.where.id === milestone.id && args.where.permitRecordId === milestone.permitRecordId ? milestone : null) };
  prisma.document = { findMany: async () => documents };
  prisma.propertyPermitRecord = { findFirst: async (args) => (permit && args.where.id === permit.id && args.where.isActive ? permit : null), findMany: async () => authorityPermits };
  const svc = trackerService.permitTrackerService;
  svc.createManualFlag = async (...args) => { calls.push(['createManualFlag', ...args]); return { id: 'f-9' }; };
  svc.updateFlag = async (...args) => { calls.push(['updateFlag', ...args]); return {}; };
  svc.createRemediationCase = async (...args) => { calls.push(['createRemediationCase', ...args]); return { id: 'case-1' }; };
  svc.addInspectionMilestone = async (...args) => { calls.push(['addInspectionMilestone', ...args]); return { id: 'm-9' }; };
  svc.updateInspectionMilestone = async (...args) => { calls.push(['updateInspectionMilestone', ...args]); return {}; };
  svc.getPermitSummary = async () => ({ totalPermits: 4, openFlags: 2 });
  svc.requestDisclosureExport = async (...args) => { calls.push(['requestDisclosureExport', ...args]); return { exportId: 'exp-1' }; };
  svc.recordOfficialStatus = async (...args) => { calls.push(['recordOfficialStatus', ...args]); return {}; };
  svc.deleteInspectionMilestone = async (...args) => { calls.push(['deleteInspectionMilestone', ...args]); };
  fetchService.permitFetchService.triggerFetch = async (...args) => { calls.push(['triggerFetch', ...args]); return { fetchJobId: 'job-1' }; };
  detectionService.permitDetectionService.detectUnpermittedWork = async (...args) => { calls.push(['detect', ...args]); return 2; };
  compliance.assertProjectComplianceApplicable = async (...args) => { calls.push(['gate', ...args.slice(0, 3)]); };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore: () => {
    propertyAccess.resolvePropertyAccess = saved.a; prisma.document = saved.d; prisma.permitUnpermittedFlag = saved.f; prisma.permitInspectionMilestone = saved.m; prisma.propertyPermitRecord = saved.p;
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
    for (const [id, call, title] of [[IDS.FETCH, 'triggerFetch', 'Permit-record search started'], [IDS.SCAN, 'detect', '2 possible unpermitted items flagged']]) {
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
  assert.deepEqual([...new Set(ids(own.blocks))].sort(), [IDS.FETCH, IDS.SCAN, IDS.FLAG_ADD, IDS.FLAG_RESEARCH, IDS.FLAG_REMEDIATE, IDS.INSPECTION_ADD, IDS.INSPECTION_UPDATE, IDS.INSPECTION_REMOVE, IDS.FLAG_RESOLVE, IDS.OFFICIAL_STATUS, IDS.DISCLOSURE_EXPORT, 'permit-tracker-add', 'permit-tracker-edit', 'permit-tracker-remove'].sort());
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

test('closing a flag needs proof from this home: the picker lists its records and authority permits, refuses what the service would, and the update carries the proof', async () => {
  const s = stubs();
  try {
    const form = await invoke(IDS.FLAG_RESOLVE);
    assert.equal(form.status, 'NEEDS_CONTEXT');
    const fields = form.captureRequests[0].inputSchema.fields;
    assert.deepEqual(fields.find((f) => f.key === 'evidence').inputSchema.options, [{ label: 'Letter from the building department', value: 'doc-1' }]);
    assert.deepEqual(fields.find((f) => f.key === 'matchedPermit').inputSchema.options.map((o) => o.value), ['p-1']);
    // A record from another home, or an unproven outcome, is refused before any review.
    assert.equal((await review(IDS.FLAG_RESOLVE, { outcome: 'DISMISSED', evidence: 'doc-from-elsewhere', notes: 'x' })).reasonCode, 'PERMIT_EXTRA_INPUT_INVALID');
    const noProof = await review(IDS.FLAG_RESOLVE, { outcome: 'CONFIRMED_UNPERMITTED' });
    assert.equal(noProof.reasonCode, 'PERMIT_EXTRA_EVIDENCE_MISSING');
    assert.match(noProof.blocks[0].body, /“No permit found” is not enough/);
    assert.equal((await review(IDS.FLAG_RESOLVE, { outcome: 'DISMISSED', evidence: 'doc-1' })).reasonCode, 'PERMIT_EXTRA_EVIDENCE_MISSING');
    assert.equal((await review(IDS.FLAG_RESOLVE, { outcome: 'REMEDIATED', evidence: 'doc-1', matchedPermit: 'p-1' })).reasonCode, 'PERMIT_EXTRA_EVIDENCE_MISSING');
    assert.equal(s.calls.length, 0);
    const matched = await review(IDS.FLAG_RESOLVE, { outcome: 'CONFIRMED_PERMITTED', matchedPermit: 'p-1' });
    assert.equal(matched.status, 'NEEDS_CONFIRMATION');
    assert.match(matched.confirmation.description, /cannot be undone from Ask/);
    await confirmCapabilityInvoke(OP, ctx(matched.parameters));
    assert.deepEqual(s.calls[0].slice(0, 4), ['updateFlag', 'f-1', 'prop-1', 'user-1']);
    assert.deepEqual(s.calls[0][4], { status: 'CONFIRMED_PERMITTED', evidenceDocumentIds: [], resolvedByPermitId: 'p-1' });
    const unpermitted = await review(IDS.FLAG_RESOLVE, { outcome: 'CONFIRMED_UNPERMITTED', evidence: 'doc-1', sourceReference: 'Building dept letter 2026-09-01', observedAt: '2026-09-01' });
    await confirmCapabilityInvoke(OP, ctx(unpermitted.parameters));
    assert.deepEqual(s.calls[1][4], { status: 'CONFIRMED_UNPERMITTED', evidenceDocumentIds: ['doc-1'], researchChannel: 'MUNICIPAL_AUTHORITY', authorityOutcome: 'CONFIRMED_UNPERMITTED', authorityObservedAt: '2026-09-01', researchSourceReference: 'Building dept letter 2026-09-01' });
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...matched.parameters, permitExtraContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  } finally { s.restore(); }
  const closed = stubs({ flag: { ...FLAG, status: 'DISMISSED' } });
  try { assert.equal((await invoke(IDS.FLAG_RESOLVE)).reasonCode, 'PERMIT_FLAG_CLOSED'); } finally { closed.restore(); }
  const bare = stubs({ documents: [], authorityPermits: [] });
  try {
    const none = await invoke(IDS.FLAG_RESOLVE);
    assert.equal(none.reasonCode, 'PERMIT_EXTRA_NO_EVIDENCE');
    assert.ok(none.blocks[0].actions.some((a) => a.interactionType === 'OPEN_FILE_INTAKE'));
  } finally { bare.restore(); }
});

test('an official status keeps the authority apart from the reported status and needs its proof; the role is passed to the service', async () => {
  const s = stubs();
  try {
    const base = { status: 'FINALED', truthLayer: 'AUTHORITY_CONFIRMED', sourceType: 'AUTHORITY_DOCUMENT', sourceReference: 'Letter dated 2026-09-01', observedAt: '2026-09-01', finaledDate: '2026-08-30' };
    assert.equal((await review(IDS.OFFICIAL_STATUS, { ...base, finaledDate: '' })).reasonCode, 'PERMIT_EXTRA_EVIDENCE_MISSING');
    assert.equal((await review(IDS.OFFICIAL_STATUS, base)).reasonCode, 'PERMIT_EXTRA_EVIDENCE_MISSING');
    const ok = await review(IDS.OFFICIAL_STATUS, { ...base, evidence: 'doc-1' });
    assert.equal(ok.status, 'NEEDS_CONFIRMATION');
    assert.match(ok.confirmation.description, /separately from the status you reported/);
    await confirmCapabilityInvoke(OP, ctx(ok.parameters));
    assert.deepEqual(s.calls[0].slice(0, 4), ['recordOfficialStatus', 'p-1', 'prop-1', 'user-1']);
    assert.equal(s.calls[0][4].evidenceDocumentId, 'doc-1');
    assert.equal(s.calls[0][4].finaledDate, '2026-08-30T12:00:00.000Z');
    assert.equal(s.calls[0][5], 'CONTRIBUTOR');
    // The authority's own public data needs no document.
    const open = await review(IDS.OFFICIAL_STATUS, { ...base, sourceType: 'AUTHORITY_OPEN_DATA' });
    assert.equal(open.status, 'NEEDS_CONFIRMATION');
  } finally { s.restore(); }
});

test('the permit-record search status: each state is answered plainly, a missing record is never read as no permit, and the receipt offers the check', async () => {
  assert.equal(isPermitTrackerReadRequest(extra.PERMIT_FETCH_STATUS_MESSAGE), true);
  const answer = (job, canChange = true) => permitFetchStatusAnswer(job, canChange, 'prop-1').blocks[0];
  assert.match(answer(null).title, /No permit-record search has been run/);
  assert.match(answer({ status: 'QUEUED', startedAt: T.toISOString() }).title, /waiting to start/);
  assert.match(answer({ status: 'RUNNING', dataSourceName: 'City of Austin', startedAt: T.toISOString() }).body, /City of Austin/);
  assert.equal(answer({ status: 'RUNNING', startedAt: T.toISOString() }).actions[0].message, extra.PERMIT_FETCH_STATUS_MESSAGE);
  const done = answer({ status: 'COMPLETED', permitsFound: 3, permitsInserted: 2, startedAt: T.toISOString() });
  assert.match(done.title, /found 3 records/); assert.match(done.body, /2 were new/);
  assert.match(answer({ status: 'COMPLETED', permitsFound: 0, startedAt: T.toISOString() }).body, /not proof that no permit exists/);
  const failed = answer({ status: 'FAILED', errorMessage: 'Timed out.', startedAt: T.toISOString() });
  assert.match(failed.body, /does not mean there are no records/); assert.deepEqual(failed.actions.map((a) => a.id), [IDS.FETCH]);
  assert.deepEqual(answer({ status: 'FAILED', startedAt: T.toISOString() }, false).actions, []);
  assert.match(answer({ status: 'NO_DATA_SOURCE', startedAt: T.toISOString() }).body, /add the permits you know about by hand/);
  const s = stubs();
  try {
    const out = await invoke(IDS.FETCH);
    const done2 = await confirmCapabilityInvoke(OP, ctx(out.parameters));
    assert.match(done2.result.blocks[0].description, /may take a few minutes/);
    assert.equal(done2.result.blocks[0].actions[0].id, extra.PERMIT_FETCH_STATUS_ACTION_ID);
    assert.equal(isAskActionApplicable({ action: { id: extra.PERMIT_FETCH_STATUS_ACTION_ID, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId: 'PERMIT_TRACKER_STATUS', style: 'PRIMARY' }, operationId: OP, propertyId: 'prop-1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true);
  } finally { s.restore(); }
});

test('the disclosure report: reviewed with the counts and the as-of time, bound to those counts, requested through the canonical service, and its status read from the household\'s own list', async () => {
  const s = stubs();
  try {
    const out = await invoke(IDS.DISCLOSURE_EXPORT);
    assert.equal(out.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(out.confirmation.fields.slice(0, 2), [{ label: 'Permit records', value: '4' }, { label: 'Open flags', value: '2 still unresolved' }]);
    assert.match(out.confirmation.description, /not a legal opinion/);
    assert.equal(s.calls.length, 0);
    const done = await confirmCapabilityInvoke(OP, ctx(out.parameters));
    assert.deepEqual(s.calls.map((c) => c[0]), ['gate', 'requestDisclosureExport']);
    assert.equal(done.artifactId, 'exp-1');
    assert.equal(done.result.blocks[0].actions[0].message, extra.PERMIT_DISCLOSURE_STATUS_MESSAGE);
    // The records changed since the review: the confirmation is refused rather than making a report of something else.
    s.calls.length = 0;
    trackerService.permitTrackerService.getPermitSummary = async () => ({ totalPermits: 5, openFlags: 2 });
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(out.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(s.calls.length, 0);
  } finally { s.restore(); }
  assert.equal(isPermitTrackerReadRequest(extra.PERMIT_DISCLOSURE_STATUS_MESSAGE), true);
  const now = new Date('2026-10-29T12:00:00Z');
  const ready = permitDisclosureStatusAnswer([{ id: 'e1', status: 'COMPLETED', totalPermits: 4, openFlags: 2, expiresAt: '2026-11-10T00:00:00Z', createdAt: '2026-10-29T10:00:00Z' }], true, 'prop-1', now);
  const row = ready.blocks[1].sections[0].items[0];
  assert.equal(row.status, 'Ready'); assert.equal(row.entityType, extra.PERMIT_DISCLOSURE_ENTITY_TYPE); assert.equal(row.href, null);
  assert.ok(row.meta.some((m) => /2 flags still unresolved/.test(m)));
  assert.match(ready.blocks[0].body, /snapshot as of the time shown/);
  assert.equal(permitDisclosureStatusAnswer([{ id: 'e1', status: 'COMPLETED', expiresAt: '2026-10-01T00:00:00Z', createdAt: '2026-09-01T00:00:00Z' }], true, 'prop-1', now).blocks[1].sections[0].items[0].status, 'Expired');
  const pending = permitDisclosureStatusAnswer([{ id: 'e1', status: 'GENERATING', createdAt: '2026-10-29T11:00:00Z' }], true, 'prop-1', now);
  assert.equal(pending.blocks[0].actions[0].message, extra.PERMIT_DISCLOSURE_STATUS_MESSAGE);
  assert.equal(permitDisclosureStatusAnswer([{ id: 'e1', status: 'FAILED', errorMessage: 'Could not render.', createdAt: '2026-10-29T11:00:00Z' }], false, 'prop-1', now).reasonCode, 'PERMIT_DISCLOSURE_FAILED');
  assert.match(permitDisclosureStatusAnswer([], false).blocks[0].title, /No permit disclosure report/);
});
