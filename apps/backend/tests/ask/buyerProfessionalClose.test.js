const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Recording that the professional closing is complete, from Ask (FRD v1.461; owner ruling D2, 2026-10-28): Desktop's contributor floor and prerequisites,
// the buyer's own report and nothing more. No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { isAskActionAllowedForHouseholdRole } = require('../../src/services/ask/askAudiencePresentation.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { impactedReadOperationIds } = require('../../src/services/ask/governance/askMutationImpactRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { BuyerClosingDayService: Closing } = require('../../src/services/buyerClosingDay.service.ts');
const { APIError } = require('../../src/middleware/error.middleware.ts');
const { analyticsEmitter } = require('../../src/services/analytics');
const { HomeBuyerTaskService } = require('../../src/services/HomeBuyerTask.service.ts');
const command = require('../../src/services/ask/support/buyerProfessionalCloseCommand.ts');
const { professionalCloseResult } = require('../../src/services/ask/handlers/buyerProfessionalClose.handler.ts');

const OP = 'BUYER_CLOSING_ITEM_COMMAND';
const MESSAGE = command.PROFESSIONAL_CLOSE_MESSAGE;
const READY = {
  workspace: { id: 'w1', updatedAt: '2026-10-20T00:00:00.000Z', professionalClosingConfirmedAt: null, identificationReady: true, requiredDocumentsReady: true, fundsReadinessReviewed: true,
    blockersReviewed: true, questionsResolved: true, signingCompleted: true, copiesReceived: true, possessionConfirmed: true, signedClosingDocumentId: 'rec-1',
    keysStatus: 'RECEIVED', remotesStatus: 'NOT_NEEDED', accessCodesStatus: 'RECEIVED', mailboxAccessStatus: 'RECEIVED', warrantiesManualsStatus: 'RECEIVED' },
  appointment: { scheduledAt: '2026-10-25T15:00:00.000Z', format: 'IN_PERSON', trustedContact: { id: 'c1' } },
  signedDocument: { id: 'rec-1' }, lifecycle: { stage: 'CLOSING' }, blockers: [],
};
const view = (over = {}) => ({ ...READY, ...over, workspace: over.workspace === null ? null : { ...READY.workspace, ...(over.workspace ?? {}) } });

function install(role, current = READY) {
  const saved = { a: propertyAccess.resolvePropertyAccess, g: Closing.get, c: Closing.confirmProfessionalClose, e: executeOperation.reconcileAskExecutionSideEffects, t: analyticsEmitter.track };
  const state = { view: current, calls: [], events: [] };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  Closing.get = async () => state.view;
  Closing.confirmProfessionalClose = async (...a) => { state.calls.push(a); return state.view; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  analyticsEmitter.track = (event) => { state.events.push(event); };
  state.restore = () => { propertyAccess.resolvePropertyAccess = saved.a; Closing.get = saved.g; Closing.confirmProfessionalClose = saved.c; executeOperation.reconcileAskExecutionSideEffects = saved.e; analyticsEmitter.track = saved.t; };
  return state;
}
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityType: command.PROFESSIONAL_CLOSE_ENTITY_TYPE, entityId: 'prop-1', ...over });
const invoke = (launchContext, message = MESSAGE) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message, launchContext });
const ctx = (parameters, role = 'CONTRIBUTOR') => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });
const confirmParams = async (state, form = { closedDate: '2026-10-20', confirmationNotes: 'Keys in hand' }) => (await professionalCloseResult('u1', 'prop-1', { sourceExecutionId: null }, form)).parameters;

test('the form refuses a bad or future date, and the timestamp is midday UTC but never later than now', () => {
  const now = new Date('2026-10-28T09:00:00.000Z');
  assert.equal(command.parseProfessionalCloseAnswer({ closedDate: '2026-10-20' }, now).success, true);
  assert.equal(command.parseProfessionalCloseAnswer({ closedDate: { precision: 'EXACT_DATE', value: '2026-10-20' }, confirmationNotes: ' ok ' }, now).data.confirmationNotes, 'ok');
  assert.deepEqual(command.parseProfessionalCloseAnswer({ closedDate: '2026-12-01' }, now), { success: false, reason: 'FUTURE' });
  for (const bad of [{}, { closedDate: 'soon' }, { closedDate: '2026-02-31' }, { closedDate: '2026-10-20', extra: 1 }]) assert.equal(command.parseProfessionalCloseAnswer(bad, now).success, false, JSON.stringify(bad));
  assert.equal(command.professionalCloseTimestamp('2026-10-20', now), '2026-10-20T12:00:00.000Z');
  assert.equal(command.professionalCloseTimestamp('2026-10-28', now), now.toISOString(), 'today at midday is still ahead: clamped to now');
});

test('the readiness check lists exactly what Desktop requires and is empty only when everything is in place', () => {
  assert.deepEqual(command.professionalCloseGaps(READY), []);
  assert.deepEqual(command.professionalCloseGaps({ ...READY, workspace: null }), ['The Closing Day checklist has not been started.']);
  assert.deepEqual(command.professionalCloseGaps(view({ workspace: { signingCompleted: false, keysStatus: 'UNKNOWN' } })), ['Signing completed', 'Keys status']);
  assert.deepEqual(command.professionalCloseGaps({ ...READY, signedDocument: null, appointment: { scheduledAt: null, format: 'UNKNOWN', trustedContact: null } }),
    ['A current signed closing record', 'The closing appointment time', 'The closing appointment method', 'A trusted title or escrow contact']);
});

test('the command is declared-action only, a contributor floor, and its action is allowlisted and hidden from a viewer', () => {
  assert.notEqual(resolveAskRoutingCascade(MESSAGE, { localRoutingEnabled: true }).operation?.operationId, OP);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  const action = { id: command.PROFESSIONAL_CLOSE_ACTION_ID, label: 'Record that my closing is complete', interactionType: 'START_WORKFLOW', message: MESSAGE, operationId: OP, style: 'SECONDARY' };
  assert.equal(isAskActionApplicable({ action, operationId: 'BUYER_CLOSING_DAY_READINESS', propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true);
  assert.equal(isAskActionAllowedForHouseholdRole(action, 'CONTRIBUTOR'), true);
  assert.equal(isAskActionAllowedForHouseholdRole(action, 'VIEWER'), false);
  assert.ok(impactedReadOperationIds(OP).includes('BUYER_CLOSING_DAY_READINESS'), 'the readiness answer refreshes after the close is recorded');
});

test('a typed message, a refresh, or a wrong entity type never reaches the close', async () => {
  const s = install('CONTRIBUTOR');
  try {
    for (const bad of [launch({ surface: 'ASK_REFRESH' }), launch({ entityType: 'BUYER_LENDER_CONDITION' }), null]) {
      assert.equal((await invoke(bad)).reasonCode, 'ASK_BUYER_CLOSING_ITEM_NOT_DIRECTLY_ROUTABLE');
    }
    assert.deepEqual(s.calls, []);
  } finally { s.restore(); }
});

test('a viewer is refused, and an already-recorded close is reported without a form', async () => {
  let s = install('VIEWER');
  try { assert.equal((await invoke(launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { s.restore(); }
  s = install('CONTRIBUTOR', view({ workspace: { professionalClosingConfirmedAt: '2026-10-21T00:00:00.000Z' } }));
  try {
    const result = await invoke(launch());
    assert.equal(result.reasonCode, 'BUYER_PROFESSIONAL_CLOSE_ALREADY_RECORDED');
    assert.equal(result.captureRequests, undefined);
  } finally { s.restore(); }
});

test('with a prerequisite missing, Ask lists what is missing and offers neither a form nor a confirmation', async () => {
  const s = install('CONTRIBUTOR', view({ workspace: { signingCompleted: false }, signedDocument: null }));
  try {
    const result = await invoke(launch());
    assert.equal(result.reasonCode, 'BUYER_PROFESSIONAL_CLOSE_NOT_READY');
    assert.deepEqual(result.blocks[0].sections[0].items.map((i) => i.title), ['Signing completed', 'A current signed closing record']);
    assert.equal(result.confirmation, undefined);
    assert.equal(result.captureRequests, undefined);
    assert.ok(result.blocks[0].sections[0].items.every((i) => i.href === null), 'no link anywhere');
  } finally { s.restore(); }
});

test('when ready, it asks for the day, then reviews a report-only confirmation; nothing is written yet', async () => {
  const s = install('CONTRIBUTOR');
  try {
    const open = await invoke(launch());
    assert.equal(open.status, 'NEEDS_CONTEXT');
    assert.equal(open.captureRequests[0].captureKey, command.PROFESSIONAL_CLOSE_CAPTURE_KEY);
    assert.deepEqual(open.captureRequests[0].inputSchema.fields.map((f) => f.key), ['closedDate', 'confirmationNotes']);
    assert.equal(open.captureRequests[0].inputSchema.fields[0].inputSchema.allowFuture, false);

    const review = await professionalCloseResult('u1', 'prop-1', { sourceExecutionId: null }, { closedDate: '2026-10-20', confirmationNotes: 'Keys in hand' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.equal(review.confirmation.confirmLabel, 'Record the close');
    assert.match(review.confirmation.consentText, /my professional closing process is complete/);
    assert.match(review.confirmation.description, /records your report/);
    assert.match(review.confirmation.description, /has not verified it/);
    assert.match(review.confirmation.description, /does not decide whether you should close/);
    assert.doesNotMatch(JSON.stringify(review), /you should proceed|we recommend|safe to close/i, 'Ask never recommends closing');
    assert.deepEqual(review.confirmation.fields.map((f) => f.label), ['Closing completed', 'Notes']);
    assert.deepEqual(s.calls, []);

    const future = await professionalCloseResult('u1', 'prop-1', { sourceExecutionId: null }, { closedDate: '2099-01-01' });
    assert.equal(future.reasonCode, 'BUYER_PROFESSIONAL_CLOSE_FUTURE_DATE');
    assert.equal(future.confirmation, undefined);
  } finally { s.restore(); }
});

test('confirming calls the canonical close with the reported day and notes, and records the report as an Ask action', async () => {
  const s = install('CONTRIBUTOR');
  try {
    const parameters = await confirmParams(s);
    const out = await confirmCapabilityInvoke(OP, ctx(parameters));
    assert.equal(s.calls.length, 1);
    const [userId, propertyId, input] = s.calls[0];
    assert.deepEqual([userId, propertyId, input.professionalClosingComplete, input.closedAt, input.confirmationNotes], ['u1', 'prop-1', true, '2026-10-20T12:00:00.000Z', 'Keys in hand']);
    assert.equal(out.result.blocks[0].title, 'Professional close recorded');
    assert.match(out.result.blocks[0].description, /did not verify the closing/);
    assert.equal(out.artifactType, 'BUYER_CLOSING_DAY_WORKSPACE');
    assert.deepEqual(s.events.map((e) => [e.metadataJson.actionType, e.metadataJson.surface]), [['buyer_professional_close_confirmed', 'ask']]);
  } finally { s.restore(); }
});

test('confirming is refused for a viewer, a changed purchase, a close already recorded, and a service refusal is carried as is', async () => {
  const s = install('CONTRIBUTOR');
  try {
    const parameters = await confirmParams(s);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(parameters, 'VIEWER')), /contributor or owner/);
    s.view = view({ appointment: { ...READY.appointment, scheduledAt: '2026-10-26T15:00:00.000Z' } });
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    s.view = READY;
    const fresh = await confirmParams(s);
    s.view = view({ workspace: { professionalClosingConfirmedAt: '2026-10-21T00:00:00.000Z' } });
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(fresh)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    s.view = READY;
    Closing.confirmProfessionalClose = async () => { throw new APIError('Attach a current signed closing record before confirming close.', 409, 'CLOSING_DAY_SIGNED_RECORD_REQUIRED'); };
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(fresh)), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE' && /signed closing record/.test(e.message));
    assert.deepEqual(s.events, [], 'no completion event when the close was refused');
  } finally { s.restore(); }
});

test('the closing-day readiness answer offers the action to a contributor until the close is recorded, and never to a viewer', async () => {
  const savedPresentation = HomeBuyerTaskService.getClosingHomePresentation;
  HomeBuyerTaskService.getClosingHomePresentation = async () => ({ presentationMode: 'ACTIVE', overview: { nextAction: null, blockers: [], milestones: [] } });
  const readiness = async (role, current) => {
    const s = install(role, current);
    try { return await capabilityInvoke('BUYER_CLOSING_DAY_READINESS', { userId: 'u1', propertyId: 'prop-1', message: 'What do I need for closing day?', launchContext: null }, { propertyAccess: { role } }); } finally { s.restore(); }
  };
  try {
    const summary = (result) => result.blocks.find((b) => b.id === 'buyer-closing-day-summary');
    assert.deepEqual(summary(await readiness('CONTRIBUTOR', READY)).actions.map((a) => [a.id, a.message, a.operationId, a.entityType, a.entityId]),
      [[command.PROFESSIONAL_CLOSE_ACTION_ID, MESSAGE, OP, command.PROFESSIONAL_CLOSE_ENTITY_TYPE, 'prop-1']]);
    assert.deepEqual(summary(await readiness('VIEWER', READY)).actions, []);
    assert.deepEqual(summary(await readiness('CONTRIBUTOR', view({ workspace: { professionalClosingConfirmedAt: '2026-10-21T00:00:00.000Z' } }))).actions, []);
    assert.deepEqual(summary(await readiness('CONTRIBUTOR', view({ workspace: null }))).actions, []);
  } finally { HomeBuyerTaskService.getClosingHomePresentation = savedPresentation; }
});
