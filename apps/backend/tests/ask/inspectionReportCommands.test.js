const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Inspection Hub": the report list, the comparison, and review-and-confirm (FRD v1.339). No database, browser or native module.

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
const hubService = require('../../src/services/inspectionHub.service.ts');
const writeBack = require('../../src/services/inspectionWriteBack.service.ts');
const command = require('../../src/services/ask/support/inspectionReportCommand.ts');
const { inspectionReportsFromRows } = require('../../src/services/ask/handlers/inspectionReports.handler.ts');

const CMD = 'INSPECTION_REPORT_COMMAND';
const M = command.INSPECTION_REPORT_MESSAGES;
const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';
const T = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const report = (over = {}) => ({ id: R1, reportType: 'PRE_PURCHASE', inspectionDate: new Date('2026-08-01T12:00:00Z'), inspectorName: 'Pat', inspectorCompany: null, status: 'REVIEW_PENDING', totalFindings: 3, openFindings: 3, safetyFindings: 1, majorFindings: 1, updatedAt: T, ...over });
const findings = [{ id: 'f1', severity: 'SAFETY', status: 'OPEN', updatedAt: T }, { id: 'f2', severity: 'MAJOR', status: 'OPEN', updatedAt: T }, { id: 'f3', severity: 'MINOR', status: 'OPEN', updatedAt: T }];
const version = (r, fs = findings) => sha(`inspection-report:${r.id}:${r.status}:${r.updatedAt.toISOString()}:${fs.map((f) => `${f.id}:${f.status}:${f.updatedAt.toISOString()}`).join('|')}`);

function install(role, { reports = [report()], fs = findings } = {}) {
  const saved = { a: propertyAccess.resolvePropertyAccess, r: prisma.inspectionReport, f: prisma.inspectionFinding, p: writeBack.getWriteBackPreview, w: writeBack.applyWriteBacks, c: hubService.compareReports, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  prisma.inspectionReport = {
    findMany: async ({ where }) => reports.filter((r) => (!where.status || (where.status.not ? r.status !== where.status.not : r.status === where.status))),
    findFirst: async ({ where }) => reports.find((r) => r.id === where.id) ?? null,
  };
  prisma.inspectionFinding = { findMany: async () => fs };
  writeBack.getWriteBackPreview = async () => ({ digitalTwinUpdates: 2, permitFlagsToCreate: 1, coverageGapsToFlag: 0, findingCount: fs.length });
  writeBack.applyWriteBacks = async (...a) => { calls.push(['apply', ...a]); return { writeBackCount: 4 }; };
  hubService.compareReports = async (...a) => { calls.push(['compare', ...a]); return { reportA: { reportType: 'PRE_PURCHASE', inspectionDate: new Date('2026-01-01') }, reportB: { reportType: 'ANNUAL', inspectionDate: new Date('2026-08-01') }, resolved: [{ id: 'a', homeSystem: 'ROOF', subsystem: null, severity: 'MAJOR', inspectorDescription: 'Fixed' }], persisted: [], newFindings: [], worsened: [] }; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; prisma.inspectionReport = saved.r; prisma.inspectionFinding = saved.f; writeBack.getWriteBackPreview = saved.p; writeBack.applyWriteBacks = saved.w; hubService.compareReports = saved.c; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (operationId, over = {}) => ({ operationId, surface: 'ASK_PAGE', entityId: R1, entityType: command.INSPECTION_REPORT_ENTITY_TYPE, ...over });
const invoke = (operationId, message, launchContext) => capabilityInvoke(operationId, { userId: 'u1', propertyId: 'prop-1', message, launchContext });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(CMD) });

test('the report list is message-routable; the command and the comparison are not typed into', () => {
  assert.equal(resolveAskRoutingCascade('Show my inspection reports', { localRoutingEnabled: true }).operation?.operationId, 'INSPECTION_REPORTS');
  assert.equal(resolveAskRoutingCascade('Show my open inspection findings', { localRoutingEnabled: true }).operation?.operationId, 'INSPECTION_FINDINGS');
  assert.notEqual(resolveAskRoutingCascade(M.CONFIRM, { localRoutingEnabled: true }).operation?.operationId, CMD);
  assert.equal(getAskDomainCommandByOperation(CMD).roleFloor, 'CONTRIBUTOR');
});

test('the list offers confirm to a contributor on a report waiting for review, and compare only where an earlier confirmed report exists', () => {
  const rows = [
    report({ id: R1, status: 'REVIEW_PENDING' }),
    report({ id: R2, status: 'CONFIRMED', inspectionDate: new Date('2026-09-01T12:00:00Z') }),
    report({ id: 'r3', status: 'CONFIRMED', inspectionDate: new Date('2026-01-01T12:00:00Z') }),
    report({ id: 'r4', status: 'ARCHIVED' }),
    report({ id: 'r5', status: 'PROCESSING', totalFindings: 0 }),
  ];
  const ids = (viewer) => Object.fromEntries(inspectionReportsFromRows(rows, !viewer).blocks[1].sections[0].items.map((i) => [i.id, i.actions.map((a) => a.id)]));
  const contributor = ids(false);
  assert.deepEqual(contributor[R1], ['inspection-report-confirm']);
  assert.deepEqual(contributor[R2], ['inspection-report-negotiation', 'inspection-report-findings', 'inspection-report-compare']);
  assert.deepEqual(contributor.r3, ['inspection-report-negotiation', 'inspection-report-findings']);
  assert.deepEqual(contributor.r5, []);
  assert.equal('r4' in contributor, false, 'archived reports are not listed');
  const viewer = ids(true);
  assert.deepEqual(viewer[R1], []);
  assert.deepEqual(viewer[R2], ['inspection-report-findings', 'inspection-report-compare']);
  assert.equal(inspectionReportsFromRows([], true).reasonCode, 'NO_INSPECTION_REPORTS');
});

test('review shows what confirming writes back and the findings by severity; nothing is written; viewers, a refresh and non-reviewable reports are refused', async () => {
  let w = install('VIEWER');
  try { assert.equal((await invoke(CMD, M.CONFIRM, launch(CMD))).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR');
  try {
    assert.equal((await invoke(CMD, M.CONFIRM, launch(CMD, { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_INSPECTION_REPORT_NOT_DIRECTLY_ROUTABLE');
    const review = await invoke(CMD, M.CONFIRM, launch(CMD));
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.equal(review.contextVersion, version(report()));
    assert.deepEqual(review.confirmation.fields.map((f) => f.value).slice(1), ['3', '2 updated', '1 added', '0 flagged']);
    assert.match(review.confirmation.description, /accepts no work, contacts nobody/);
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  for (const [status, code] of [['CONFIRMED', 'INSPECTION_REPORT_NOT_REVIEWABLE'], ['PROCESSING', 'INSPECTION_REPORT_NOT_REVIEWABLE']]) {
    w = install('CONTRIBUTOR', { reports: [report({ status })] });
    try { assert.equal((await invoke(CMD, M.CONFIRM, launch(CMD))).reasonCode, code, status); } finally { w.restore(); }
  }
  w = install('CONTRIBUTOR', { reports: [] });
  try { assert.equal((await invoke(CMD, M.CONFIRM, launch(CMD))).reasonCode, 'INSPECTION_REPORT_NOT_FOUND'); } finally { w.restore(); }
});

test('confirming runs the route\'s own write-back; a changed report or finding, or a confirmed report, writes nothing', async () => {
  const params = (contextVersion) => ({ inspectionReportCommand: { kind: 'CONFIRM', entityId: R1 }, inspectionReportContextVersion: contextVersion });
  let w = install('CONTRIBUTOR');
  try {
    const out = await confirmCapabilityInvoke(CMD, ctx(params(version(report()))));
    assert.deepEqual(w.calls[0], ['apply', R1, 'prop-1', 'u1']);
    assert.equal(out.result.reasonCode, 'INSPECTION_REPORT_CONFIRMED');
    await assert.rejects(() => confirmCapabilityInvoke(CMD, ctx(params('old'))), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(w.calls.length, 1);
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', { reports: [report({ status: 'CONFIRMED' })] });
  try {
    await assert.rejects(() => confirmCapabilityInvoke(CMD, ctx(params(version(report({ status: 'CONFIRMED' }))))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', { fs: [...findings, { id: 'f4', severity: 'MINOR', status: 'OPEN', updatedAt: T }] });
  try {
    await assert.rejects(() => confirmCapabilityInvoke(CMD, ctx(params(version(report())))), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('the comparison pairs the report with the confirmed one before it, for any member, and refuses without an earlier report', async () => {
  const rows = [report({ id: R2, status: 'CONFIRMED', inspectionDate: new Date('2026-09-01T12:00:00Z') }), report({ id: R1, status: 'CONFIRMED' })];
  let w = install('VIEWER', { reports: rows });
  try {
    const result = await invoke('INSPECTION_REPORT_COMPARE', M.COMPARE, launch('INSPECTION_REPORT_COMPARE', { entityId: R2 }));
    assert.equal(result.reasonCode, 'INSPECTION_REPORTS_COMPARED');
    assert.deepEqual(w.calls[0], ['compare', 'prop-1', R1, R2]);
    const none = await invoke('INSPECTION_REPORT_COMPARE', M.COMPARE, launch('INSPECTION_REPORT_COMPARE', { entityId: R1 }));
    assert.equal(none.reasonCode, 'INSPECTION_REPORT_NO_EARLIER_REPORT');
  } finally { w.restore(); }
});

test('the action ids are allowlisted on the list and the back action on the others', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.INSPECTION_REPORT_ACTION_IDS)) assert.equal(applicable(id, 'INSPECTION_REPORTS'), true, id);
  assert.equal(applicable('inspection-reports-back', CMD), true);
  assert.equal(applicable('inspection-reports-back', 'INSPECTION_REPORT_COMPARE'), true);
});
