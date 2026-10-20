const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// FRD v1.3: Retry / Dismiss from Work and Archive / Restore from Saved, as declared row actions that confirm first. The real handlers run
// with prisma, the access check and the existing writes (retryAskExecution, cancelAskExecution, setAskSavedArchive) stubbed.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const prismaModule = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const retryModule = require('../../src/services/ask/execution/askRetry.ts');
const confirmModule = require('../../src/services/ask/execution/askConfirm.ts');
const savedService = require('../../src/services/ask/askSaved.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { workOverviewFromPage, buildWorkViewState } = require('../../src/services/ask/handlers/workOverview.handler.ts');
const { savedResultsFromPage, buildSavedViewState } = require('../../src/services/ask/handlers/savedResults.handler.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { AskPresentationBlockSchema, AskConfirmationSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const support = require('../../src/services/ask/support/workSavedCommands.ts');

const WORK = 'WORK_REQUEST_COMMAND';
const SAVED = 'SAVED_ARCHIVE_COMMAND';
const launch = (over = {}) => ({ operationId: WORK, surface: 'ASK_PAGE', entityType: support.WORK_REQUEST_ENTITY_TYPE, entityId: 'e1', ...over });
const T = new Date('2026-10-20T12:00:00Z');
const request = (over = {}) => ({ id: 'e1', propertyId: 'p1', message: 'Add a water heater', status: 'FAILED_RETRYABLE', reasonCode: null, updatedAt: T, ...over });
const ctx = (operationId, parameters) => ({ userId: 'u1', execution: { id: 'x1', propertyId: 'p1', createdAt: T }, access: { role: 'VIEWER' }, parameters, command: getAskDomainCommandByOperation(operationId) });

function install({ row = request(), artifact } = {}) {
  const saved = { prisma: prismaModule.prisma, access: propertyAccess.resolvePropertyAccess, reconcile: executeOperation.reconcileAskExecutionSideEffects, retry: retryModule.retryAskExecution, cancel: confirmModule.cancelAskExecution, resolve: savedService.resolveAskSavedArtifactForUser, archive: savedService.setAskSavedArchive };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'VIEWER', userId: 'u1', propertyId: 'p1' });
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  retryModule.retryAskExecution = async (...args) => { calls.push(['retry', ...args]); return {}; };
  confirmModule.cancelAskExecution = async (...args) => { calls.push(['cancel', ...args]); return {}; };
  savedService.resolveAskSavedArtifactForUser = async () => (artifact ? { outcome: 'AVAILABLE', artifact, message: '' } : { outcome: 'DELETED', artifact: null, message: 'This was removed.' });
  savedService.setAskSavedArchive = async (...args) => { calls.push(['archive', ...args]); return { outcome: 'AVAILABLE', artifact, message: '' }; };
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'askExecution') return { findFirst: async () => row };
    return new Proxy({}, { get: (_x, method) => async () => { throw new Error(`Unexpected prisma.${String(model)}.${String(method)} call`); } });
  } });
  return { calls, restore() { prismaModule.prisma = saved.prisma; propertyAccess.resolvePropertyAccess = saved.access; executeOperation.reconcileAskExecutionSideEffects = saved.reconcile; retryModule.retryAskExecution = saved.retry; confirmModule.cancelAskExecution = saved.cancel; savedService.resolveAskSavedArtifactForUser = saved.resolve; savedService.setAskSavedArchive = saved.archive; } };
}
const propose = (kind, over) => capabilityInvoke(WORK, { userId: 'u1', propertyId: 'p1', message: support.workRequestMessage(kind, 'Add a water heater'), launchContext: launch(over) });

test('the commands are declared-action only, caller-scoped, and agree with the registries', () => {
  for (const message of [support.workRequestMessage('RETRY', 'Add a water heater'), support.workRequestMessage('DISMISS', 'x'), support.savedArchiveMessage('ARCHIVE', 'Roofing quotes'), support.savedArchiveMessage('RESTORE', 'Roofing quotes')]) {
    assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, WORK, message);
    assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, SAVED, message);
  }
  for (const id of [WORK, SAVED]) assert.deepEqual([getAskDomainCommandByOperation(id).roleFloor, getAskDomainCommandByOperation(id).authorization], ['VIEWER', 'CALLER_SCOPED']);
  assert.equal(support.workRequestKindFromMessage(support.workRequestMessage('DISMISS', 'x')), 'DISMISS');
  assert.equal(support.savedArchiveKindFromMessage(support.savedArchiveMessage('RESTORE', 'x')), 'RESTORE');
});

test('retry: a review first, nothing done; the confirmed retry carries a stable client request id and the receipt says where the answer is', async () => {
  const w = install();
  try {
    const proposal = await propose('RETRY');
    assert.equal(proposal.status, 'NEEDS_CONFIRMATION');
    assert.equal(proposal.confirmation.fields[0].value, 'Add a water heater');
    AskConfirmationSchema.parse(proposal.confirmation);
    assert.equal(w.calls.length, 0);
    const done = await confirmCapabilityInvoke(WORK, ctx(WORK, proposal.parameters));
    assert.deepEqual(w.calls, [['retry', 'u1', 'e1', { clientRequestId: 'work-retry:e1' }]]);
    assert.equal(done.result.status, 'COMPLETED');
    assert.match(done.result.blocks[0].description, /conversation it came from/);
    for (const block of done.result.blocks) AskPresentationBlockSchema.parse(block);
  } finally { w.restore(); }
});

test('dismiss: allowed only for a waiting request; a finished or running one is refused with nothing done', async () => {
  let w = install({ row: request({ status: 'NEEDS_CONFIRMATION' }) });
  try {
    const proposal = await propose('DISMISS');
    assert.equal(proposal.status, 'NEEDS_CONFIRMATION');
    await confirmCapabilityInvoke(WORK, ctx(WORK, proposal.parameters));
    assert.deepEqual(w.calls, [['cancel', 'u1', 'e1']]);
  } finally { w.restore(); }
  w = install({ row: request({ status: 'RUNNING' }) });
  try { assert.equal((await propose('DISMISS')).reasonCode, 'WORK_REQUEST_NOT_ACTIONABLE'); assert.equal(w.calls.length, 0); } finally { w.restore(); }
  w = install({ row: request({ status: 'ANSWERED' }) });
  try { assert.equal((await propose('RETRY')).reasonCode, 'WORK_REQUEST_NOT_ACTIONABLE'); } finally { w.restore(); }
  w = install({ row: null });
  try { assert.equal((await propose('RETRY')).reasonCode, 'WORK_REQUEST_NOT_FOUND'); } finally { w.restore(); }
});

test('a request that changed while the confirmation was open is stale, and a typed or refreshed request reaches nothing', async () => {
  const w = install();
  try {
    const proposal = await propose('RETRY');
    await assert.rejects(confirmCapabilityInvoke(WORK, ctx(WORK, { ...proposal.parameters, workRequestContextVersion: 'old' })), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(confirmCapabilityInvoke(WORK, ctx(WORK, { workRequestCommand: { kind: 'NOPE', entityId: 'e1' } })), /invalid/);
    assert.equal(w.calls.length, 0);
    const typed = await capabilityInvoke(WORK, { userId: 'u1', propertyId: 'p1', message: 'Dismiss everything', launchContext: { surface: 'ASK_PAGE' } });
    assert.equal(typed.reasonCode, 'ASK_WORK_REQUEST_NOT_DIRECTLY_ROUTABLE');
    const refreshed = await propose('RETRY', { surface: 'ASK_REFRESH' });
    assert.equal(refreshed.reasonCode, 'ASK_WORK_REQUEST_NOT_DIRECTLY_ROUTABLE');
  } finally { w.restore(); }
});

const artifact = (over = {}) => ({
  artifactKey: 'comparison:q1', artifactType: 'QUOTE_COMPARISON', title: 'Roofing quotes', summary: null, updatedAt: '2026-10-07T12:00:00.000Z', sourceAsOf: '2026-10-07T12:00:00.000Z',
  version: { label: 'Decided' }, freshness: { state: 'CURRENT', reason: null }, visibility: { sensitivity: 'STANDARD' }, archived: { byOwner: false, byYou: false },
  reopen: { operationId: 'QUOTE_COMPARISON_REVIEW', entityType: 'QUOTE_COMPARISON_WORKSPACE', entityId: 'q1', decisionThreadId: null, contextVersion: 'v1' }, reopenUnavailableReason: null, ...over,
});
const proposeSaved = (kind, over) => capabilityInvoke(SAVED, { userId: 'u1', propertyId: 'p1', message: support.savedArchiveMessage(kind, 'Roofing quotes'), launchContext: { operationId: SAVED, surface: 'ASK_PAGE', entityType: support.SAVED_ARTIFACT_ENTITY_TYPE, entityId: 'comparison:q1', ...over } });

test('archive and restore: reviewed first, confirmed once, and refused when already so, owner-archived, or gone', async () => {
  let w = install({ artifact: artifact() });
  try {
    const proposal = await proposeSaved('ARCHIVE');
    assert.equal(proposal.status, 'NEEDS_CONFIRMATION');
    assert.equal(proposal.confirmation.fields[0].value, 'Roofing quotes');
    assert.equal(w.calls.length, 0);
    const done = await confirmCapabilityInvoke(SAVED, ctx(SAVED, proposal.parameters));
    assert.deepEqual(w.calls, [['archive', 'u1', 'p1', 'comparison:q1', true]]);
    assert.equal(done.result.blocks[0].title, 'Archived');
    assert.equal((await proposeSaved('RESTORE')).reasonCode, 'SAVED_ARCHIVE_ALREADY');
  } finally { w.restore(); }
  w = install({ artifact: artifact({ archived: { byOwner: false, byYou: true } }) });
  try {
    const restore = await proposeSaved('RESTORE');
    assert.equal(restore.status, 'NEEDS_CONFIRMATION');
    await confirmCapabilityInvoke(SAVED, ctx(SAVED, restore.parameters));
    assert.deepEqual(w.calls, [['archive', 'u1', 'p1', 'comparison:q1', false]]);
    assert.equal((await proposeSaved('ARCHIVE')).reasonCode, 'SAVED_ARCHIVE_ALREADY');
  } finally { w.restore(); }
  w = install({ artifact: artifact({ archived: { byOwner: true, byYou: false } }) });
  try { assert.equal((await proposeSaved('RESTORE')).reasonCode, 'SAVED_ARCHIVE_OWNER_ARCHIVED'); } finally { w.restore(); }
  w = install({});
  try {
    assert.equal((await proposeSaved('ARCHIVE')).reasonCode, 'SAVED_ARCHIVE_NOT_AVAILABLE');
    const typed = await capabilityInvoke(SAVED, { userId: 'u1', propertyId: 'p1', message: 'Archive everything', launchContext: { surface: 'ASK_PAGE' } });
    assert.equal(typed.reasonCode, 'ASK_SAVED_ARCHIVE_NOT_DIRECTLY_ROUTABLE');
  } finally { w.restore(); }
});

test('a change to the saved result while the confirmation was open is stale', async () => {
  const w = install({ artifact: artifact() });
  try {
    const proposal = await proposeSaved('ARCHIVE');
    await assert.rejects(confirmCapabilityInvoke(SAVED, ctx(SAVED, { ...proposal.parameters, savedArchiveContextVersion: 'old' })), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('the Work and Saved answers offer the row actions, each acting on the right entity, and pass the schema', () => {
  const launchOf = (over) => ({ operationId: null, entityType: null, entityId: null, actionId: null, decisionThreadId: null, workItemId: null, journeyId: null, contextVersion: null, ...over });
  const row = (over) => ({
    workKey: 'execution:e1', sourceAliases: [], providerId: 'RETRYABLE_EXECUTIONS', workType: 'RETRYABLE_EXECUTION', propertyId: 'p1', entity: { type: 'AskExecution', id: 'e1' }, title: 'Add a water heater', summary: null,
    status: { canonical: 'FAILED_RETRYABLE', label: 'Did not finish' }, lifecycleView: 'NEEDS_YOU', nextAction: { label: 'Try this again', operationId: null, allowed: true, retryExecutionId: 'e1' }, sortAt: T.toISOString(), dueAt: null,
    freshness: { version: 'v', asOf: T.toISOString() }, sourceOwner: 'ask-executions', resume: { kind: 'CONVERSATION', executionId: 'e1', sessionId: 's1', launch: launchOf({ entityType: 'AskExecution', entityId: 'e1' }) }, ...over,
  });
  const state = { view: 'NEEDS_YOU', kind: null, limit: 10 };
  const page = (rows) => ({ propertyId: 'p1', view: 'NEEDS_YOU', total: rows.length, totalScope: 'COMPLETE', partial: false, nextCursor: null, viewCounts: { NEEDS_YOU: rows.length, ACTIVE: 0, WAITING: 0, SCHEDULED: 0, COMPLETED: 0, ARCHIVED: 0 }, providers: [], filterOptions: { workTypes: [], statusesByWorkType: {} }, rows });
  const pending = row({ workKey: 'execution:e2', providerId: 'PENDING_EXECUTIONS', workType: 'PENDING_EXECUTION', status: { canonical: 'NEEDS_CONFIRMATION', label: 'Waiting' }, nextAction: null, resume: { kind: 'CONFIRMATION', executionId: 'e2', sessionId: 's1', launch: launchOf({}) } });
  const running = row({ workKey: 'execution:e3', providerId: 'PENDING_EXECUTIONS', workType: 'PENDING_EXECUTION', status: { canonical: 'RUNNING', label: 'Running' }, nextAction: null, resume: { kind: 'CONFIRMATION', executionId: 'e3', sessionId: 's1', launch: launchOf({}) } });
  const work = workOverviewFromPage({ page: page([row(), pending, running]), state, viewState: buildWorkViewState(null, state) });
  const items = work.blocks.find((b) => b.id === 'work-overview-results').sections[0].items;
  assert.deepEqual(items[0].actions.map((a) => [a.id, a.entityType, a.entityId, a.operationId]), [['work-request-retry', 'AskExecution', 'e1', 'WORK_REQUEST_COMMAND']]);
  assert.deepEqual(items[1].actions.map((a) => [a.id, a.entityId]), [['work-request-dismiss', 'e2']]);
  assert.deepEqual(items[2].actions, []);
  for (const block of work.blocks) AskPresentationBlockSchema.parse(block);

  const savedPage = (rows) => ({ propertyId: 'p1', archived: false, total: rows.length, totalScope: 'COMPLETE', partial: false, nextCursor: null, counts: { active: rows.length, archived: 0 }, filterOptions: { types: [], freshness: [] }, types: [], rows });
  const sstate = { archived: false, type: null, freshness: null, limit: 10 };
  const saved = savedResultsFromPage({ page: savedPage([artifact(), artifact({ artifactKey: 'comparison:q2', archived: { byOwner: false, byYou: true } }), artifact({ artifactKey: 'comparison:q3', archived: { byOwner: true, byYou: false } })]), state: sstate, viewState: buildSavedViewState(null, sstate) });
  const rows = saved.blocks.find((b) => b.id === 'saved-results-list').sections[0].items;
  assert.deepEqual(rows[0].actions.map((a) => [a.id, a.entityType, a.entityId]), [['saved-open', undefined, undefined], ['saved-archive', 'SAVED_ARTIFACT', 'comparison:q1']]);
  assert.deepEqual(rows[1].actions.map((a) => a.id), ['saved-open', 'saved-restore']);
  assert.deepEqual(rows[2].actions.map((a) => a.id), ['saved-open']);
  for (const block of saved.blocks) AskPresentationBlockSchema.parse(block);
  const applicable = (id, operationId) => isAskActionApplicable({ action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true });
  assert.equal(applicable('work-request-back', WORK), true);
  assert.equal(applicable('saved-back', SAVED), true);
});
