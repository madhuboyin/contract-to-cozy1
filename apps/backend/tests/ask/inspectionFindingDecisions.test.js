const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Inspection Hub": one report's findings, keep an eye on a finding, and the seller's fix-or-disclose plan (FRD v1.340). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const hubService = require('../../src/services/inspectionHub.service.ts');
const command = require('../../src/services/ask/support/inspectionFindingDecisionCommand.ts');
const { inspectionReportsFromRows } = require('../../src/services/ask/handlers/inspectionReports.handler.ts');

const CMD = 'INSPECTION_FINDING_DECISION_COMMAND';
const M = command.INSPECTION_FINDING_DECISION_MESSAGES;
const T = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const finding = (over = {}) => ({
  id: 'f1', reportId: 'r1', homeSystem: 'ROOF', subsystem: 'Flashing', severity: 'MAJOR', inspectorDescription: 'Flashing is lifting.', status: 'OPEN', workDisposition: 'PENDING_REVIEW',
  resolutionNotes: null, estimatedCostCentsLow: 50000, estimatedCostCentsHigh: 90000, updatedAt: T, report: { status: 'CONFIRMED', reportType: 'PRE_LISTING' }, ...over,
});
const version = (kind, f) => sha(`inspection-finding-decision:${kind}:${f.id}:${f.status}:${f.workDisposition}:${f.updatedAt.toISOString()}:${sha(f.resolutionNotes ?? '')}:${f.report.status}`);

function install(role, row = finding()) {
  const saved = { a: propertyAccess.resolvePropertyAccess, f: prisma.inspectionFinding, r: prisma.inspectionReport, d: hubService.dispositionFindingAsWork, s: hubService.saveFixDisclosureDecisions, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  prisma.inspectionFinding = { findFirst: async () => row, findMany: async () => (Array.isArray(row) ? row : [row]) };
  prisma.inspectionReport = { findFirst: async () => ({ id: 'r1', reportType: 'PRE_LISTING', status: 'CONFIRMED', inspectionDate: new Date('2026-08-01T12:00:00Z') }) };
  hubService.dispositionFindingAsWork = async (...a) => { calls.push(['disposition', ...a]); return {}; };
  hubService.saveFixDisclosureDecisions = async (...a) => { calls.push(['plan', ...a]); return { saved: 1 }; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; prisma.inspectionFinding = saved.f; prisma.inspectionReport = saved.r; hubService.dispositionFindingAsWork = saved.d; hubService.saveFixDisclosureDecisions = saved.s; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (operationId, entityType, entityId, over = {}) => ({ operationId, surface: 'ASK_PAGE', entityType, entityId, ...over });
const invoke = (operationId, message, launchContext) => capabilityInvoke(operationId, { userId: 'u1', propertyId: 'prop-1', message, launchContext });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(CMD) });
const p = (kind, version2, entityId = 'f1') => ({ inspectionFindingDecisionCommand: { kind, entityId }, inspectionFindingDecisionContextVersion: version2 });

test('which decisions a finding allows: monitor when open and not yet accepted or monitored; a plan only on a pre-listing report with no notes of its own', () => {
  const k = command.inspectionFindingDecisionKinds;
  const pre = { status: 'CONFIRMED', reportType: 'PRE_LISTING' };
  assert.deepEqual(k(pre, { status: 'OPEN', workDisposition: 'PENDING_REVIEW', resolutionNotes: null }), ['MONITOR', 'FIX', 'DISCLOSE_PRICE_ADJUST', 'DISCLOSE_CREDIT']);
  assert.deepEqual(k(pre, { status: 'OPEN', workDisposition: 'MONITOR', resolutionNotes: JSON.stringify({ fixDisclosure: 'FIX' }) }), ['DISCLOSE_PRICE_ADJUST', 'DISCLOSE_CREDIT']);
  assert.deepEqual(k(pre, { status: 'OPEN', workDisposition: 'ACCEPTED', resolutionNotes: 'Roofer fixed the flashing' }), [], 'their own notes are not replaced');
  assert.deepEqual(k(pre, { status: 'RESOLVED', workDisposition: 'PENDING_REVIEW', resolutionNotes: null }), ['FIX', 'DISCLOSE_PRICE_ADJUST', 'DISCLOSE_CREDIT']);
  assert.deepEqual(k({ status: 'CONFIRMED', reportType: 'PRE_PURCHASE' }, { status: 'OPEN', workDisposition: 'PENDING_REVIEW', resolutionNotes: null }), ['MONITOR']);
  assert.deepEqual(k({ status: 'REVIEW_PENDING', reportType: 'PRE_LISTING' }, { status: 'OPEN', workDisposition: 'PENDING_REVIEW', resolutionNotes: null }), []);
  assert.deepEqual(k(pre, { status: 'DISMISSED', workDisposition: 'NOT_APPLICABLE', resolutionNotes: null }), []);
});

test('the report row offers its findings once confirmed; the findings list shows the plan and offers decisions to contributors only', async () => {
  const rows = [{ id: 'r1', reportType: 'PRE_LISTING', inspectionDate: new Date('2026-08-01T12:00:00Z'), inspectorName: null, inspectorCompany: null, status: 'CONFIRMED', totalFindings: 1, openFindings: 1, safetyFindings: 0, majorFindings: 1 },
    { id: 'r2', reportType: 'PRE_LISTING', inspectionDate: new Date('2026-08-02T12:00:00Z'), inspectorName: null, inspectorCompany: null, status: 'REVIEW_PENDING', totalFindings: 1, openFindings: 1, safetyFindings: 0, majorFindings: 0 }];
  const list = inspectionReportsFromRows(rows, false).blocks[1].sections[0].items;
  assert.ok(list.find((i) => i.id === 'r1').actions.some((a) => a.id === 'inspection-report-findings'));
  assert.ok(!list.find((i) => i.id === 'r2').actions.some((a) => a.id === 'inspection-report-findings'));
  const row = finding({ resolutionNotes: JSON.stringify({ fixDisclosure: 'FIX', estimatedFixCostCents: 120000, sellerNote: 'Roofer quoted' }) });
  const ids = async (role) => {
    const w = install(role, [row]);
    try {
      const out = await invoke('INSPECTION_REPORT_FINDINGS', command.INSPECTION_FINDINGS_OF_REPORT_MESSAGE, launch('INSPECTION_REPORT_FINDINGS', 'INSPECTION_REPORT', 'r1'));
      assert.equal(out.reasonCode, 'INSPECTION_REPORT_FINDINGS_FOUND');
      const item = out.blocks[1].sections[0].items[0];
      assert.match(item.description, /Plan: Plan to fix, about \$1,200 to fix\./);
      return item.actions.map((a) => a.id);
    } finally { w.restore(); }
  };
  assert.deepEqual(await ids('CONTRIBUTOR'), ['inspection-finding-monitor', 'inspection-finding-disclose-price', 'inspection-finding-disclose-credit']);
  assert.deepEqual(await ids('VIEWER'), []);
});

test('review is declared-action only, contributor-only, shows the plan before and after, and writes nothing', async () => {
  assert.equal(getAskDomainCommandByOperation(CMD).roleFloor, 'CONTRIBUTOR');
  let w = install('VIEWER');
  try { assert.equal((await invoke(CMD, M.MONITOR, launch(CMD, 'INSPECTION_FINDING', 'f1'))).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR');
  try {
    assert.equal((await invoke(CMD, M.MONITOR, launch(CMD, 'INSPECTION_FINDING', 'f1', { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_INSPECTION_FINDING_DECISION_NOT_DIRECTLY_ROUTABLE');
    const monitor = await invoke(CMD, M.MONITOR, launch(CMD, 'INSPECTION_FINDING', 'f1'));
    assert.equal(monitor.status, 'NEEDS_CONFIRMATION');
    assert.equal(monitor.contextVersion, version('MONITOR', finding()));
    assert.match(monitor.confirmation.description, /does not accept the work or contact anyone/);
    const credit = await invoke(CMD, M.DISCLOSE_CREDIT, launch(CMD, 'INSPECTION_FINDING', 'f1'));
    assert.deepEqual(credit.confirmation.fields[1], { label: 'Plan', value: 'None recorded → Disclose with a credit' });
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', finding({ workDisposition: 'MONITOR' }));
  try { assert.equal((await invoke(CMD, M.MONITOR, launch(CMD, 'INSPECTION_FINDING', 'f1'))).reasonCode, 'INSPECTION_FINDING_DECISION_NOT_AVAILABLE'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', finding({ resolutionNotes: 'Roofer fixed it' }));
  try { assert.equal((await invoke(CMD, M.FIX, launch(CMD, 'INSPECTION_FINDING', 'f1'))).reasonCode, 'INSPECTION_FINDING_DECISION_NOT_AVAILABLE'); } finally { w.restore(); }
});

test('confirming calls the routes\' own writes and keeps an earlier estimate and note; stale or no-longer-allowed writes nothing', async () => {
  let w = install('CONTRIBUTOR');
  try {
    await confirmCapabilityInvoke(CMD, ctx(p('MONITOR', version('MONITOR', finding()))));
    assert.deepEqual(w.calls[0], ['disposition', 'f1', 'r1', 'prop-1', 'u1', { disposition: 'MONITOR' }]);
    await confirmCapabilityInvoke(CMD, ctx(p('DISCLOSE_CREDIT', version('DISCLOSE_CREDIT', finding()))));
    assert.deepEqual(w.calls[1], ['plan', 'r1', 'prop-1', [{ findingId: 'f1', decision: 'DISCLOSE_CREDIT' }]]);
    await assert.rejects(() => confirmCapabilityInvoke(CMD, ctx(p('MONITOR', 'old'))), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(w.calls.length, 2);
  } finally { w.restore(); }
  const earlier = finding({ resolutionNotes: JSON.stringify({ fixDisclosure: 'FIX', estimatedFixCostCents: 120000, sellerNote: 'Quoted' }) });
  w = install('CONTRIBUTOR', earlier);
  try {
    await confirmCapabilityInvoke(CMD, ctx(p('DISCLOSE_PRICE_ADJUST', version('DISCLOSE_PRICE_ADJUST', earlier))));
    assert.deepEqual(w.calls[0][3], [{ findingId: 'f1', decision: 'DISCLOSE_PRICE_ADJUST', estimatedFixCostCents: 120000, sellerNote: 'Quoted' }]);
  } finally { w.restore(); }
  const notes = finding({ resolutionNotes: 'Roofer fixed it' });
  w = install('CONTRIBUTOR', notes);
  try {
    await assert.rejects(() => confirmCapabilityInvoke(CMD, ctx(p('FIX', version('FIX', notes)))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('the decision ids are allowlisted on the findings list and the back action on the command', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.INSPECTION_FINDING_DECISION_ACTION_IDS)) assert.equal(applicable(id, 'INSPECTION_REPORT_FINDINGS'), true, id);
  assert.equal(applicable('inspection-report-findings', 'INSPECTION_REPORTS'), true);
  assert.equal(applicable('inspection-reports-back', CMD), true);
});
