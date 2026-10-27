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
const { inspectionFindingDecisionResult } = require('../../src/services/ask/handlers/inspectionFindingDecisionCommands.handler.ts');

const CMD = 'INSPECTION_FINDING_DECISION_COMMAND';
const M = command.INSPECTION_FINDING_DECISION_MESSAGES;
const T = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const finding = (over = {}) => ({
  id: 'f1', reportId: 'r1', homeSystem: 'ROOF', subsystem: 'Flashing', severity: 'MAJOR', inspectorDescription: 'Flashing is lifting.', status: 'OPEN', workDisposition: 'PENDING_REVIEW',
  resolutionNotes: null, aiInterpretation: 'The flashing may leak.', estimatedCostCentsLow: 50000, estimatedCostCentsHigh: 90000, updatedAt: T, report: { status: 'CONFIRMED', reportType: 'PRE_LISTING' }, ...over,
});
const version = (kind, f) => sha(`inspection-finding-decision:${kind}:${f.id}:${f.status}:${f.workDisposition}:${f.updatedAt.toISOString()}:${sha(f.resolutionNotes ?? '')}:${f.report.status}`);

function install(role, row = finding()) {
  const saved = { u: hubService.updateFinding, a: propertyAccess.resolvePropertyAccess, f: prisma.inspectionFinding, r: prisma.inspectionReport, d: hubService.dispositionFindingAsWork, s: hubService.saveFixDisclosureDecisions, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  prisma.inspectionFinding = { findFirst: async () => row, findMany: async () => (Array.isArray(row) ? row : [row]), count: async () => (Array.isArray(row) ? row.length : 1) };
  prisma.inspectionReport = { findFirst: async () => ({ id: 'r1', reportType: 'PRE_LISTING', status: 'CONFIRMED', inspectionDate: new Date('2026-08-01T12:00:00Z') }) };
  hubService.dispositionFindingAsWork = async (...a) => { calls.push(['disposition', ...a]); return {}; };
  hubService.saveFixDisclosureDecisions = async (...a) => { calls.push(['plan', ...a]); return { saved: 1 }; };
  hubService.updateFinding = async (...a) => { calls.push(['edit', ...a]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { hubService.updateFinding = saved.u; propertyAccess.resolvePropertyAccess = saved.a; prisma.inspectionFinding = saved.f; prisma.inspectionReport = saved.r; hubService.dispositionFindingAsWork = saved.d; hubService.saveFixDisclosureDecisions = saved.s; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (operationId, entityType, entityId, over = {}) => ({ operationId, surface: 'ASK_PAGE', entityType, entityId, ...over });
const invoke = (operationId, message, launchContext) => capabilityInvoke(operationId, { userId: 'u1', propertyId: 'prop-1', message, launchContext });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(CMD) });
const p = (kind, version2, entityId = 'f1') => ({ inspectionFindingDecisionCommand: { kind, entityId }, inspectionFindingDecisionContextVersion: version2 });

test('which decisions a finding allows: monitor when open and not yet accepted or monitored; a plan only on a pre-listing report with no notes of its own', () => {
  const k = command.inspectionFindingDecisionKinds;
  const pre = { status: 'CONFIRMED', reportType: 'PRE_LISTING' };
  assert.deepEqual(k(pre, { status: 'OPEN', workDisposition: 'PENDING_REVIEW', resolutionNotes: null }), ['MONITOR', 'ALREADY_RESOLVED', 'NOT_APPLICABLE', 'DUPLICATE', 'FIX', 'DISCLOSE_PRICE_ADJUST', 'DISCLOSE_CREDIT', 'CORRECT']);
  assert.deepEqual(k(pre, { status: 'OPEN', workDisposition: 'MONITOR', resolutionNotes: JSON.stringify({ fixDisclosure: 'FIX' }) }), ['DUPLICATE', 'DISCLOSE_PRICE_ADJUST', 'DISCLOSE_CREDIT', 'CORRECT']);
  assert.deepEqual(k(pre, { status: 'OPEN', workDisposition: 'ACCEPTED', resolutionNotes: 'Roofer fixed the flashing' }), ['DUPLICATE', 'CORRECT'], 'their own notes are not replaced, and a wrong extraction can still be corrected');
  assert.deepEqual(k(pre, { status: 'RESOLVED', workDisposition: 'PENDING_REVIEW', resolutionNotes: null }), ['FIX', 'DISCLOSE_PRICE_ADJUST', 'DISCLOSE_CREDIT']);
  assert.deepEqual(k({ status: 'CONFIRMED', reportType: 'PRE_PURCHASE' }, { status: 'OPEN', workDisposition: 'PENDING_REVIEW', resolutionNotes: null }), ['MONITOR', 'ALREADY_RESOLVED', 'NOT_APPLICABLE', 'DUPLICATE', 'CORRECT']);
  assert.ok(!k({ status: 'CONFIRMED', reportType: 'PRE_PURCHASE' }, { status: 'OPEN', workDisposition: 'DUPLICATE', resolutionNotes: null }).includes('DUPLICATE'), 'already a duplicate');
  assert.ok(!k({ status: 'CONFIRMED', reportType: 'PRE_PURCHASE' }, { status: 'OPEN', workDisposition: 'PENDING_REVIEW', resolutionNotes: null, severity: 'INFORMATIONAL' }).includes('DUPLICATE'), 'an informational finding never becomes work');
  assert.ok(k({ status: 'CONFIRMED', reportType: 'PRE_PURCHASE' }, { status: 'OPEN', workDisposition: 'ACCEPTED', resolutionNotes: 'their notes' }).includes('DUPLICATE'), 'the page offers it whatever the notes say; it writes none');
  assert.deepEqual(k({ status: 'REVIEW_PENDING', reportType: 'PRE_LISTING' }, { status: 'OPEN', workDisposition: 'PENDING_REVIEW', resolutionNotes: null }), ['EDIT'], 'before confirming, only the details can be edited');
  assert.deepEqual(k({ status: 'REVIEW_PENDING', reportType: 'PRE_LISTING' }, { status: 'DISMISSED', workDisposition: 'PENDING_REVIEW', resolutionNotes: null }), [], 'a dismissed finding cannot be edited');
  assert.deepEqual(k({ status: 'ARCHIVED', reportType: 'PRE_LISTING' }, { status: 'OPEN', workDisposition: 'PENDING_REVIEW', resolutionNotes: null }), []);
  assert.deepEqual(k(pre, { status: 'DISMISSED', workDisposition: 'NOT_APPLICABLE', resolutionNotes: null }), []);
});

test('the report row offers its findings once confirmed; the findings list shows the plan and offers decisions to contributors only', async () => {
  const rows = [{ id: 'r1', reportType: 'PRE_LISTING', inspectionDate: new Date('2026-08-01T12:00:00Z'), inspectorName: null, inspectorCompany: null, status: 'CONFIRMED', totalFindings: 1, openFindings: 1, safetyFindings: 0, majorFindings: 1 },
    { id: 'r2', reportType: 'PRE_LISTING', inspectionDate: new Date('2026-08-02T12:00:00Z'), inspectorName: null, inspectorCompany: null, status: 'REVIEW_PENDING', totalFindings: 1, openFindings: 1, safetyFindings: 0, majorFindings: 0 }];
  const list = inspectionReportsFromRows(rows, false).blocks[1].sections[0].items;
  assert.ok(list.find((i) => i.id === 'r1').actions.some((a) => a.id === 'inspection-report-findings'));
  assert.ok(list.find((i) => i.id === 'r2').actions.some((a) => a.id === 'inspection-report-findings'), 'a report awaiting review lists its findings so they can be edited');
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
  assert.deepEqual(await ids('CONTRIBUTOR'), ['inspection-finding-monitor', 'inspection-finding-duplicate', 'inspection-finding-disclose-price', 'inspection-finding-disclose-credit', 'inspection-finding-correct']);
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

// ── v1.341: open-items filters and the negotiation package ─────────────────────────────────────────────────────
const report = require('../../src/services/ask/support/inspectionReportCommand.ts');
const { negotiationVersion } = require('../../src/services/ask/handlers/inspectionNegotiationPackage.handler.ts');

test('the open findings answer reads severity and system filters from the message and passes them to the query', async () => {
  assert.deepEqual(command.inspectionFindingFilters('Show my major roof inspection findings'), { severity: 'MAJOR', homeSystem: 'ROOF', label: 'major roof' });
  assert.deepEqual(command.inspectionFindingFilters('Show my open inspection findings'), { severity: null, homeSystem: null, label: '' });
  let seenWhere;
  const saved = { a: propertyAccess.resolvePropertyAccess, f: prisma.inspectionFinding };
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'CONTRIBUTOR', userId: 'u1', propertyId: 'prop-1' });
  prisma.inspectionFinding = { findMany: async ({ where }) => { seenWhere = where; return []; }, count: async () => 0 };
  try {
    const out = await invoke('INSPECTION_FINDINGS', 'Show my safety plumbing inspection findings', undefined);
    assert.equal(seenWhere.severity, 'SAFETY');
    assert.equal(seenWhere.homeSystem, 'PLUMBING');
    assert.match(out.blocks[0].title, /safety plumbing/);
  } finally { propertyAccess.resolvePropertyAccess = saved.a; prisma.inspectionFinding = saved.f; }
});

const NEG = 'INSPECTION_NEGOTIATION_PACKAGE';
const negFindings = [
  { id: 'n1', homeSystem: 'ROOF', subsystem: null, severity: 'MAJOR', inspectorDescription: 'Flashing', updatedAt: T },
  { id: 'n2', homeSystem: 'HVAC', subsystem: 'Furnace', severity: 'MINOR', inspectorDescription: 'Filter', updatedAt: T },
];
function installNeg(role, { reportType = 'PRE_PURCHASE', status = 'CONFIRMED', open = negFindings } = {}) {
  const saved = { a: propertyAccess.resolvePropertyAccess, f: prisma.inspectionFinding, r: prisma.inspectionReport, g: hubService.generateNegotiationPackage };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  prisma.inspectionReport = { findFirst: async () => ({ id: 'r1', reportType, status, inspectionDate: new Date('2026-08-01T12:00:00Z') }) };
  prisma.inspectionFinding = { findMany: async () => open, count: async () => open.length };
  hubService.generateNegotiationPackage = async (...a) => {
    calls.push(a);
    return {
      negotiateCredit: [{ findingId: 'n1', homeSystem: 'ROOF', subsystem: null, severity: 'MAJOR', inspectorDescription: 'Flashing', estimatedCostCentsLow: 100000, estimatedCostCentsHigh: 200000 }],
      requestRepair: [], acceptAsIs: [{ findingId: 'n2', homeSystem: 'HVAC', subsystem: 'Furnace', severity: 'MINOR', inspectorDescription: 'Filter', estimatedCostCentsLow: null, estimatedCostCentsHigh: null }],
      requestedCreditTotalCents: 150000, requestedCreditTotalDollars: '1500.00',
    };
  };
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; prisma.inspectionFinding = saved.f; prisma.inspectionReport = saved.r; hubService.generateNegotiationPackage = saved.g; } };
}
const negLaunch = (over = {}) => launch(NEG, 'INSPECTION_REPORT', 'r1', over);

test('the negotiation package opens a one-choice-per-finding form, then calculates; nothing is saved; it needs a confirmed pre-purchase report', async () => {
  const { negotiationPackageResult } = require('../../src/services/ask/handlers/inspectionNegotiationPackage.handler.ts');
  let w = installNeg('VIEWER');
  try { assert.equal((await invoke(NEG, report.NEGOTIATION_PACKAGE_MESSAGE, negLaunch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = installNeg('CONTRIBUTOR');
  try {
    assert.equal((await invoke(NEG, report.NEGOTIATION_PACKAGE_MESSAGE, negLaunch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_INSPECTION_NEGOTIATION_NOT_DIRECTLY_ROUTABLE');
    const form = await invoke(NEG, report.NEGOTIATION_PACKAGE_MESSAGE, negLaunch());
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.deepEqual(form.captureRequests[0].inputSchema.fields.map((f) => f.key), ['f0', 'f1']);
    assert.deepEqual(form.parameters.negotiationLaunch.findingIds, ['n1', 'n2']);
    const version2 = negotiationVersion('r1', negFindings);
    const done = await negotiationPackageResult('u1', 'prop-1', { entityId: 'r1', sourceExecutionId: null }, { answer: { f0: 'negotiate_credit', f1: 'accept_as_is' }, expectedContextVersion: version2, findingIds: ['n1', 'n2'] });
    assert.equal(done.status, 'ANSWERED');
    assert.deepEqual(done.blocks.find((block) => block.id === 'inspection-negotiation-lists').collection, { sourceTotal: 2, fetchedCount: 2, deliveredCount: 2, nextPageAvailable: false, deliveryTruncated: false });
    assert.deepEqual(w.calls[0], ['r1', 'prop-1', ['n1', 'n2'], { n1: 'negotiate_credit', n2: 'accept_as_is' }]);
    assert.match(done.blocks[0].title, /\$1,500/);
    const staleForm = await negotiationPackageResult('u1', 'prop-1', { entityId: 'r1', sourceExecutionId: null }, { answer: { f0: 'negotiate_credit', f1: 'accept_as_is' }, expectedContextVersion: 'old', findingIds: ['n1', 'n2'] });
    assert.equal(staleForm.status, 'NEEDS_CONTEXT');
    const incomplete = await negotiationPackageResult('u1', 'prop-1', { entityId: 'r1', sourceExecutionId: null }, { answer: { f0: 'negotiate_credit' }, expectedContextVersion: version2, findingIds: ['n1', 'n2'] });
    assert.equal(incomplete.status, 'NEEDS_CONTEXT');
    assert.equal(w.calls.length, 1, 'stale or incomplete answers do not calculate');
  } finally { w.restore(); }
  for (const opts of [{ reportType: 'PRE_LISTING' }, { status: 'REVIEW_PENDING' }]) {
    w = installNeg('CONTRIBUTOR', opts);
    try { assert.equal((await invoke(NEG, report.NEGOTIATION_PACKAGE_MESSAGE, negLaunch())).reasonCode, 'INSPECTION_NEGOTIATION_NOT_AVAILABLE'); } finally { w.restore(); }
  }
  w = installNeg('CONTRIBUTOR', { open: [] });
  try { assert.equal((await invoke(NEG, report.NEGOTIATION_PACKAGE_MESSAGE, negLaunch())).reasonCode, 'INSPECTION_NEGOTIATION_NO_OPEN_FINDINGS'); } finally { w.restore(); }
});

test('the answer shape: positional keys parse, anything else does not; the action id is allowlisted on the reports list', () => {
  assert.equal(report.parseNegotiationAnswer({ f0: 'request_repair', f1: 'accept_as_is' }, 2).success, true);
  assert.equal(report.parseNegotiationAnswer({ f0: 'request_repair' }, 2).success, false);
  assert.equal(report.parseNegotiationAnswer({ f0: 'x', f1: 'accept_as_is' }, 2).success, false);
  assert.equal(report.parseNegotiationAnswer({ f0: 'request_repair', f1: 'accept_as_is', extra: 1 }, 2).success, false);
  assert.equal(isAskActionApplicable({ action: { id: report.NEGOTIATION_PACKAGE_ACTION_ID, label: 'x', interactionType: 'CONVERSATION_CONTINUE', message: 'm', operationId: NEG, style: 'QUIET' }, operationId: 'INSPECTION_REPORTS', propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true);
});

test('already resolved and not applicable: offered on an open finding with no notes, reviewed honestly, written through the page\'s own disposition call', async () => {
  const k = command.inspectionFindingDecisionKinds;
  const report = { status: 'CONFIRMED', reportType: 'PRE_PURCHASE' };
  assert.deepEqual(k(report, { status: 'RESOLVED', workDisposition: 'ALREADY_RESOLVED', resolutionNotes: null }), [], 'a closed finding cannot be closed again');
  assert.deepEqual(k(report, { status: 'OPEN', workDisposition: 'ACCEPTED', resolutionNotes: 'Roofer fixed it' }), ['DUPLICATE', 'CORRECT'], 'their notes are not replaced, and a duplicate writes none'); // the allowlist loop above covers the duplicate action id
  let w = install('CONTRIBUTOR');
  try {
    for (const [kind, copy] of [['ALREADY_RESOLVED', /closes the finding as resolved/], ['NOT_APPLICABLE', /dismisses the finding as not applying/]]) {
      const review = await invoke(CMD, M[kind], launch(CMD, 'INSPECTION_FINDING', 'f1'));
      assert.equal(review.status, 'NEEDS_CONFIRMATION');
      assert.match(review.confirmation.description, copy);
      assert.match(review.confirmation.description, /contacts no one/);
    }
    assert.equal(w.calls.length, 0);
    for (const kind of ['ALREADY_RESOLVED', 'NOT_APPLICABLE']) {
      const out = await confirmCapabilityInvoke(CMD, ctx(p(kind, version(kind, finding()))));
      assert.equal(out.result.status, 'COMPLETED');
    }
    assert.deepEqual(w.calls.map((c) => c[5]), [{ disposition: 'ALREADY_RESOLVED' }, { disposition: 'NOT_APPLICABLE' }]);
    await assert.rejects(() => confirmCapabilityInvoke(CMD, ctx(p('NOT_APPLICABLE', 'old'))), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  } finally { w.restore(); }
  w = install('VIEWER');
  try { assert.equal((await invoke(CMD, M.NOT_APPLICABLE, launch(CMD, 'INSPECTION_FINDING', 'f1'))).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', finding({ status: 'DISMISSED' }));
  try { assert.equal((await invoke(CMD, M.ALREADY_RESOLVED, launch(CMD, 'INSPECTION_FINDING', 'f1'))).reasonCode, 'INSPECTION_FINDING_DECISION_NOT_AVAILABLE'); } finally { w.restore(); }
});

const pending = { status: 'REVIEW_PENDING', reportType: 'PRE_PURCHASE' };
const reviewEdit = (kind, answer) => inspectionFindingDecisionResult('u1', 'prop-1', { kind, entityId: 'f1', sourceExecutionId: null }, answer);

test('edit and correct: a seeded form of the page\'s edit sheet, a review of exactly what changes, and the cents the service stores', async () => {
  let w = install('CONTRIBUTOR', finding({ report: pending }));
  try {
    const form = await invoke(CMD, M.EDIT, launch(CMD, 'INSPECTION_FINDING', 'f1'));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    const request = form.captureRequests[0];
    assert.deepEqual(request.inputSchema.fields.map((f) => f.key), ['severity', 'homeSystem', 'aiInterpretation', 'costLow', 'costHigh']);
    assert.deepEqual(request.currentAnswer, { severity: 'MAJOR', homeSystem: 'ROOF', aiInterpretation: 'The flashing may leak.', costLow: 500, costHigh: 900 });
    assert.equal(form.contextVersion, version('EDIT', finding({ report: pending })));
    const out = await reviewEdit('EDIT', { severity: 'SAFETY', homeSystem: 'ROOF', costLow: '600', costHigh: '' });
    assert.equal(out.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(out.confirmation.fields, [{ label: 'Severity', value: 'Major → Safety' }, { label: 'Estimated cost, low', value: '$500 → $600' }], 'unchanged and blank values are not listed');
    assert.doesNotMatch(out.confirmation.description, /correction requested/);
    assert.equal((await reviewEdit('EDIT', { severity: 'MAJOR', costLow: '500' })).reasonCode, 'INSPECTION_FINDING_EDIT_UNCHANGED');
    assert.equal((await reviewEdit('EDIT', { costLow: '950' })).reasonCode, 'INSPECTION_FINDING_EDIT_RANGE_INVERTED');
    assert.equal((await reviewEdit('EDIT', { severity: 'NOPE' })).reasonCode, 'INSPECTION_FINDING_EDIT_INPUT_INVALID');
    assert.equal((await reviewEdit('CORRECT', { severity: 'SAFETY' })).reasonCode, 'INSPECTION_FINDING_DECISION_NOT_AVAILABLE', 'correcting an extraction is for a confirmed report');
    assert.equal(w.calls.length, 0, 'review writes nothing');
  } finally { w.restore(); }
  w = install('VIEWER', finding({ report: pending }));
  try { assert.equal((await invoke(CMD, M.EDIT, launch(CMD, 'INSPECTION_FINDING', 'f1'))).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', finding({ report: pending, status: 'DISMISSED' }));
  try { assert.equal((await invoke(CMD, M.EDIT, launch(CMD, 'INSPECTION_FINDING', 'f1'))).reasonCode, 'INSPECTION_FINDING_DECISION_NOT_AVAILABLE'); } finally { w.restore(); }
});

test('confirming an edit calls the page\'s own update with only what changed; a correction also marks it correction requested, and says so if that mark fails', async () => {
  const f = finding({ report: pending });
  let w = install('CONTRIBUTOR', f);
  try {
    await confirmCapabilityInvoke(CMD, { ...ctx(p('EDIT', version('EDIT', f))), parameters: { ...p('EDIT', version('EDIT', f)), inspectionFindingEditForm: { severity: 'SAFETY', costLow: '600', aiInterpretation: '' } } });
    assert.deepEqual(w.calls, [['edit', 'f1', 'r1', 'prop-1', { severity: 'SAFETY', estimatedCostCentsLow: 60000 }]]);
    await assert.rejects(() => confirmCapabilityInvoke(CMD, { ...ctx(p('EDIT', 'old')), parameters: { ...p('EDIT', 'old'), inspectionFindingEditForm: { severity: 'SAFETY' } } }), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(w.calls.length, 1);
  } finally { w.restore(); }
  const confirmed = finding();
  w = install('CONTRIBUTOR', confirmed);
  try {
    const out = await reviewEdit('CORRECT', { homeSystem: 'PLUMBING' });
    assert.match(out.confirmation.description, /marks the finding as correction requested/);
    const params = { ...p('CORRECT', version('CORRECT', confirmed)), inspectionFindingEditForm: { homeSystem: 'PLUMBING' } };
    await confirmCapabilityInvoke(CMD, { ...ctx(params), parameters: params });
    assert.deepEqual(w.calls[0], ['edit', 'f1', 'r1', 'prop-1', { homeSystem: 'PLUMBING' }]);
    assert.deepEqual(w.calls[1], ['disposition', 'f1', 'r1', 'prop-1', 'u1', { disposition: 'CORRECTION_REQUESTED' }], 'details first, then the mark');
  } finally { w.restore(); }
  const monitored = finding({ workDisposition: 'MONITOR' });
  w = install('CONTRIBUTOR', monitored);
  try {
    assert.doesNotMatch((await reviewEdit('CORRECT', { homeSystem: 'PLUMBING' })).confirmation.description, /correction requested/, 'an earlier decision is not overwritten');
    const params = { ...p('CORRECT', version('CORRECT', monitored)), inspectionFindingEditForm: { homeSystem: 'PLUMBING' } };
    await confirmCapabilityInvoke(CMD, { ...ctx(params), parameters: params });
    assert.deepEqual(w.calls.map((c) => c[0]), ['edit']);
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', confirmed);
  try {
    hubService.dispositionFindingAsWork = async () => { throw new Error('work item service down'); };
    const params = { ...p('CORRECT', version('CORRECT', confirmed)), inspectionFindingEditForm: { homeSystem: 'PLUMBING' } };
    const out = await confirmCapabilityInvoke(CMD, { ...ctx(params), parameters: params });
    assert.equal(out.result.status, 'COMPLETED');
    assert.ok(out.result.blocks.some((b) => /not marked as correction requested/.test(b.title || '')), 'a failed mark is reported, not hidden');
    assert.equal(w.calls[0][0], 'edit', 'the details stay saved');
  } finally { w.restore(); }
});

test('duplicate: a picker of the home\'s other open work (never the finding\'s own), a review naming the pick, and the page\'s own disposition call with that id', async () => {
  const wiRepo = require('../../src/modules/homeOperations/infrastructure/workItemRepository.ts');
  const list = require('../../src/modules/homeOperations/application/listWorkItems.usecase.ts');
  const get = require('../../src/modules/homeOperations/application/getWorkItem.usecase.ts');
  const saved = { f: wiRepo.findWorkItemByWorkKey, l: list.listWorkItems, g: get.getWorkItem };
  const items = [
    { id: 'own', propertyId: 'prop-1', title: 'Fix flashing', state: 'ACCEPTED', supersededByWorkItemId: null, dueAt: null },
    { id: 'w2', propertyId: 'prop-1', title: 'Reflash the roof', state: 'ACCEPTED', supersededByWorkItemId: null, dueAt: null },
    { id: 'w3', propertyId: 'prop-1', title: 'Old job', state: 'CLOSED', supersededByWorkItemId: null, dueAt: null },
  ];
  wiRepo.findWorkItemByWorkKey = async () => ({ id: 'own' });
  list.listWorkItems = async () => items;
  get.getWorkItem = async (id) => items.find((i) => i.id === id) ?? null;
  const w = install('CONTRIBUTOR', finding({ report: { status: 'CONFIRMED', reportType: 'PRE_PURCHASE' } }));
  try {
    const first = await invoke(CMD, M.DUPLICATE, launch(CMD, 'INSPECTION_FINDING', 'f1'));
    assert.equal(first.status, 'NEEDS_CONTEXT');
    assert.deepEqual(first.captureRequests[0].inputSchema.fields[0].inputSchema.options, [{ label: 'Reflash the roof', value: 'w2' }], 'not its own item, not finished work');
    assert.equal(first.captureRequests[0].captureKey, command.INSPECTION_FINDING_DUPLICATE_CAPTURE_KEY);
    const launchArg = { kind: 'DUPLICATE', entityId: 'f1', sourceExecutionId: null };
    for (const bad of [{ target: 'own' }, { target: 'w3' }, { target: 'nope' }, {}]) {
      assert.equal((await inspectionFindingDecisionResult('u1', 'prop-1', launchArg, bad)).status, 'NOT_APPLICABLE', JSON.stringify(bad));
    }
    const review = await inspectionFindingDecisionResult('u1', 'prop-1', launchArg, { target: 'w2' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.ok(review.confirmation.fields.some((f) => f.label === 'Repeats' && f.value === 'Reflash the roof'));
    assert.equal(w.calls.length, 0, 'review writes nothing');
    const ver = version('DUPLICATE', finding({ report: { status: 'CONFIRMED', reportType: 'PRE_PURCHASE' } }));
    const params = { ...p('DUPLICATE', ver), inspectionFindingDuplicateOf: 'w2' };
    await confirmCapabilityInvoke(CMD, ctx(params));
    assert.deepEqual(w.calls[0].slice(1, 5).concat([w.calls[0][5]]), ['f1', 'r1', 'prop-1', 'u1', { disposition: 'DUPLICATE', duplicateOfWorkItemId: 'w2' }]);
    for (const target of ['own', 'w3', undefined]) {
      await assert.rejects(() => confirmCapabilityInvoke(CMD, ctx({ ...params, inspectionFindingDuplicateOf: target })), /no longer available|invalid/);
    }
    assert.equal(w.calls.length, 1, 'a target that went stale writes nothing');
    list.listWorkItems = async () => [items[0]];
    assert.equal((await invoke(CMD, M.DUPLICATE, launch(CMD, 'INSPECTION_FINDING', 'f1'))).reasonCode, 'INSPECTION_FINDING_DUPLICATE_NO_CHOICES');
  } finally { w.restore(); wiRepo.findWorkItemByWorkKey = saved.f; list.listWorkItems = saved.l; get.getWorkItem = saved.g; }
});
