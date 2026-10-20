const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Sole Homeowner Interface FRD v1.2 §1.2: exporting the home record as a conversation. The grammar and the status answer are pure; the
// proposal and the confirm run the real handlers with the access check, the review, the create service and the prisma reads stubbed.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const prismaModule = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const reviewService = require('../../src/services/ask/askRecordExportReview.service.ts');
const contextModule = require('../../src/services/aggregationContext/context.ts');
const createService = require('../../src/services/homeReportExportCreate.service.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { isHomeRecordExportRequest, isHomeRecordExportStatusRequest, parseExportSections } = require('../../src/services/ask/support/homeRecordExport.ts');
const { homeRecordExportStatusFromRows } = require('../../src/services/ask/handlers/homeRecordExport.handler.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { AskPresentationBlockSchema, AskConfirmationSchema } = require('../../src/productFramework/ask/ask.contract.ts');

const OP = 'HOME_RECORD_EXPORT';
const PROPERTY = { name: null, address: '94 Ashford Dr', city: 'Town', state: 'NJ' };
const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;

function install(role = 'CONTRIBUTOR', { inFlight = null, contextStatus = 'APPLICABLE', existing = null, createOutcome } = {}) {
  const saved = { prisma: prismaModule.prisma, access: propertyAccess.resolvePropertyAccess, review: reviewService.getAskRecordExportReview, context: contextModule.getAggregationContextEnvelope, create: createService.createHomeReportExportRecord, reconcile: executeOperation.reconcileAskExecutionSideEffects };
  const creates = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  reviewService.getAskRecordExportReview = async () => reviewService.composeAskRecordExportReview({ propertyId: 'p1', accessRole: role, operatingMode: 'OWNING', property: PROPERTY });
  contextModule.getAggregationContextEnvelope = async () => ({ decision: { status: contextStatus } });
  createService.createHomeReportExportRecord = async (input) => { creates.push(input); return createOutcome ?? { kind: 'CREATED', export: { id: 'exp-1' }, selection: {}, propertyContext: {} }; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'homeReportExport') return { findFirst: async (args) => (args.where.status?.in ? inFlight : existing), findMany: async () => [] };
    return new Proxy({}, { get: (_x, method) => async () => { throw new Error(`Unexpected prisma.${String(model)}.${String(method)} call`); } });
  } });
  return { creates, restore() { Object.assign(prismaModule, { prisma: saved.prisma }); propertyAccess.resolvePropertyAccess = saved.access; reviewService.getAskRecordExportReview = saved.review; contextModule.getAggregationContextEnvelope = saved.context; createService.createHomeReportExportRecord = saved.create; executeOperation.reconcileAskExecutionSideEffects = saved.reconcile; } };
}
const propose = (message) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'p1', message, launchContext: { surface: 'ASK_PAGE' } });
const field = (result, label) => result.confirmation.fields.find((entry) => entry.label === label)?.value;
const confirmCtx = (parameters, role = 'CONTRIBUTOR') => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'p1', createdAt: new Date('2026-10-20T12:00:00Z') }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });

test('the grammar needs an explicit export request, names sections in the homeowner\'s words, and treats "everything" as the whole pack', () => {
  for (const message of ['Export my home record', 'Export my warranties and appliances', 'Download a PDF of my home record', 'Save my home record as a PDF', 'export everything', 'Get a printable copy of my home record']) assert.equal(isHomeRecordExportRequest(message), true, message);
  for (const message of ['Show my home report', 'Download the inspection report', 'Show my warranties', 'What is the environment report?', 'Is my home record export ready?']) assert.equal(isHomeRecordExportRequest(message), false, message);
  for (const message of ['Is my home record export ready?', 'Check my export status', 'How is my export going?']) assert.equal(isHomeRecordExportStatusRequest(message), true, message);
  assert.deepEqual(parseExportSections('Export my warranties and appliances'), ['warranties', 'inventory']);
  assert.deepEqual(parseExportSections('Export my maintenance history'), ['maintenance-history']);
  assert.deepEqual(parseExportSections('Export my insurance'), ['coverage']);
  assert.equal(parseExportSections('Export my home record'), null);
  assert.equal(parseExportSections('Export everything, including warranties'), null);
});

test('routing: the export and its status route by typed question; the contributor floor and the command registry agree', () => {
  assert.equal(route('Export my warranties and appliances'), OP);
  assert.equal(route('Is my home record export ready?'), 'HOME_RECORD_EXPORT_STATUS');
  assert.equal(route('Show my warranties'), 'WARRANTY_LOOKUP');
  assert.notEqual(route('Download the inspection report'), OP);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
});

test('the proposal names exactly what is included and left out, creates nothing, and passes the schema and the trust validator', async () => {
  const w = install();
  try {
    const result = await propose('Export my warranties and appliances');
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    // The pack's own order, not the order the homeowner said them in.
    assert.equal(field(result, 'Includes'), 'Systems and inventory, Warranties');
    assert.match(field(result, 'Who can download it'), /Only you/);
    assert.match(field(result, 'Kept for'), /30 days/);
    assert.match(field(result, 'On the cover'), /street address/);
    assert.ok(result.confirmation.fields.length <= 12);
    AskConfirmationSchema.parse(result.confirmation);
    for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
    assert.equal(w.creates.length, 0);
    const evidence = { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'home-record-export.command', operationId: OP, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-20T00:00:00.000Z' }] } };
    const { result: validated } = validateAskAnswerTrust({ question: 'Export my warranties', operationId: OP, result: { ...result, parameters: { ...result.parameters, ...evidence } }, propertyId: 'p1' });
    assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  } finally { w.restore(); }
});

test('the whole record exports every section the pack carries and discloses the ones it does not', async () => {
  const w = install();
  try {
    const result = await propose('Export my home record');
    assert.equal(result.parameters.homeRecordExport.sections, null);
    assert.equal(result.parameters.homeRecordExport.included.length, 6);
    assert.match(field(result, 'Not in the export'), /Documents/);
    assert.equal(result.blocks[0].title, 'Export your home record?');
  } finally { w.restore(); }
});

test('a section the pack cannot carry is disclosed with its reason; naming only such sections exports nothing and says what can be exported', async () => {
  const w = install();
  try {
    const mixed = await propose('Export my warranties and documents');
    assert.equal(field(mixed, 'Includes'), 'Warranties');
    assert.match(field(mixed, 'Left out'), /Documents \(/);
    const none = await propose('Export my documents');
    assert.equal(none.status, 'NOT_APPLICABLE');
    assert.equal(none.reasonCode, 'HOME_RECORD_EXPORT_NOTHING_EXPORTABLE');
    assert.match(none.blocks[0].body, /The export can carry: .*Warranties/);
    assert.equal(w.creates.length, 0);
  } finally { w.restore(); }
});

test('a viewer, an export already in progress, a report that is not ready, and a refresh each create nothing and say why', async () => {
  let w = install('VIEWER');
  try { assert.equal((await propose('Export my home record')).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', { inFlight: { id: 'exp-0' } });
  try {
    const result = await propose('Export my home record');
    assert.equal(result.reasonCode, 'HOME_RECORD_EXPORT_IN_PROGRESS');
    assert.equal(result.blocks[0].actions[0].operationId, 'HOME_RECORD_EXPORT_STATUS');
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', { contextStatus: 'NOT_APPLICABLE' });
  try { assert.equal((await propose('Export my home record')).reasonCode, 'HOME_RECORD_EXPORT_CONTEXT_NOT_READY'); } finally { w.restore(); }
  w = install();
  try {
    const refreshed = await capabilityInvoke(OP, { userId: 'u1', propertyId: 'p1', message: 'Export my home record', launchContext: { surface: 'ASK_REFRESH' } });
    assert.equal(refreshed.reasonCode, 'HOME_RECORD_EXPORT_NOT_REFRESHABLE');
    assert.equal(w.creates.length, 0);
  } finally { w.restore(); }
});

test('confirm creates the export once, with exactly the confirmed sections, and the receipt offers the status check', async () => {
  const w = install();
  try {
    const proposal = await propose('Export my warranties and appliances');
    const done = await confirmCapabilityInvoke(OP, confirmCtx(proposal.parameters));
    assert.deepEqual(w.creates, [{ userId: 'u1', propertyId: 'p1', sections: ['warranties', 'inventory'] }]);
    assert.equal(done.artifactType, 'HOME_REPORT_EXPORT');
    assert.equal(done.artifactId, 'exp-1');
    assert.equal(done.result.status, 'COMPLETED');
    const receipt = done.result.blocks.find((block) => block.type === 'WORKFLOW_PROGRESS');
    assert.equal(receipt.id, 'home-record-export-exp-1');
    assert.equal(receipt.actions[0].operationId, 'HOME_RECORD_EXPORT_STATUS');
    for (const block of done.result.blocks) AskPresentationBlockSchema.parse(block);
  } finally { w.restore(); }
});

test('a retry after an unknown outcome finds the export already created and makes no second one', async () => {
  const w = install('CONTRIBUTOR', { existing: { id: 'exp-9', status: 'PENDING' } });
  try {
    const proposal = await propose('Export my home record');
    const done = await confirmCapabilityInvoke(OP, confirmCtx(proposal.parameters));
    assert.equal(w.creates.length, 0);
    assert.equal(done.artifactId, 'exp-9');
    assert.equal(done.result.reasonCode, 'HOME_RECORD_EXPORT_ALREADY_CREATED');
  } finally { w.restore(); }
});

test('confirm fails closed: a changed role or selection, a viewer, an export in progress and an unready report are all stale, and nothing is created', async () => {
  const w = install();
  try {
    const proposal = await propose('Export my warranties');
    await assert.rejects(confirmCapabilityInvoke(OP, confirmCtx({ ...proposal.parameters, homeRecordExportContextVersion: 'old' })), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(confirmCapabilityInvoke(OP, confirmCtx(proposal.parameters, 'OWNER')), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(confirmCapabilityInvoke(OP, confirmCtx(proposal.parameters, 'VIEWER')), (error) => error.code === 'ASK_PERMISSION_REQUIRED');
    await assert.rejects(confirmCapabilityInvoke(OP, confirmCtx({ homeRecordExport: { sections: 'nope' } })), /invalid/);
    assert.equal(w.creates.length, 0);
  } finally { w.restore(); }
  let inFlight = install('CONTRIBUTOR', { createOutcome: { kind: 'IN_FLIGHT', exportId: 'exp-0' } });
  try {
    const proposal = await propose('Export my home record');
    await assert.rejects(confirmCapabilityInvoke(OP, confirmCtx(proposal.parameters)), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  } finally { inFlight.restore(); }
  const notReady = install('CONTRIBUTOR', { createOutcome: { kind: 'CONTEXT_NOT_READY', propertyContext: {} } });
  try {
    const proposal = await propose('Export my home record');
    await assert.rejects(confirmCapabilityInvoke(OP, confirmCtx(proposal.parameters)), /Not enough is recorded/);
  } finally { notReady.restore(); }
});

test('status: the latest export leads, an expired file reads as expired, a failure is said plainly, and none yet offers to start one', () => {
  const NOW = new Date('2026-10-20T12:00:00Z');
  const row = (id, status, extra = {}) => ({ id, status, requestedAt: new Date('2026-10-19T12:00:00Z'), expiresAt: new Date('2026-11-18T12:00:00Z'), sections: { included: ['warranties', 'inventory'] }, errorMessage: null, ...extra });
  const ready = homeRecordExportStatusFromRows([row('a', 'READY'), row('b', 'FAILED')], NOW);
  assert.match(ready.blocks[0].headline, /is ready to download\.$/);
  assert.equal(ready.blocks[1].sections[0].items[0].entityType, 'HOME_REPORT_EXPORT');
  assert.ok(ready.blocks[1].sections[0].items[0].meta.includes('2 sections'));
  assert.match(homeRecordExportStatusFromRows([row('a', 'READY', { expiresAt: new Date('2026-10-01T00:00:00Z') })], NOW).blocks[0].headline, /has expired\.$/);
  const preparing = homeRecordExportStatusFromRows([row('a', 'GENERATING')], NOW);
  assert.match(preparing.blocks[0].headline, /is being prepared\.$/);
  assert.equal(preparing.blocks[0].actions[0].operationId, 'HOME_RECORD_EXPORT_STATUS');
  const failed = homeRecordExportStatusFromRows([row('a', 'FAILED', { errorMessage: 'Template error' })], NOW);
  assert.equal(failed.status, 'READY_WITH_LIMITATIONS');
  assert.equal(failed.blocks[1].sections[0].items[0].description, 'Template error');
  const none = homeRecordExportStatusFromRows([], NOW);
  assert.equal(none.blocks[0].headline, 'No exports yet.');
  assert.equal(none.blocks[0].actions[0].operationId, 'HOME_RECORD_EXPORT');
  for (const result of [ready, preparing, failed, none]) for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
});

test('the declared action ids are allowlisted: the status check on the proposal receipt and in-progress answer, and the start on the empty status answer', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'p1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  assert.equal(applicable('home-record-export-status', OP), true);
  assert.equal(applicable('home-record-export-status', 'HOME_RECORD_EXPORT_STATUS'), true);
  assert.equal(applicable('home-record-export-start', 'HOME_RECORD_EXPORT_STATUS'), true);
  assert.equal(applicable('home-record-export-start', OP), false);
});
