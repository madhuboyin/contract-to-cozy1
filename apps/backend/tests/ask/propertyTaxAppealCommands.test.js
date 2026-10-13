const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P1 "Property Tax": the appeal lifecycle inside Ask (FRD v1.322). No database, browser or native module.

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
const { propertyTaxAppealCaseService } = require('../../src/services/propertyTax/propertyTaxAppealCase.service.ts');
const { propertyTaxAppealReadinessService } = require('../../src/services/propertyTax/propertyTaxAppealReadiness.service.ts');
const command = require('../../src/services/ask/support/propertyTaxAppealCommand.ts');
const handler = require('../../src/services/ask/handlers/propertyTaxAppealCommands.handler.ts');
const { propertyTaxAppealCaseBlocks } = require('../../src/services/ask/handlers/capitalPlanning.handler.ts');

const OP = 'PROPERTY_TAX_APPEAL_COMMAND';
const M = command.APPEAL_COMMAND_MESSAGES;
const CASE = '11111111-1111-4111-8111-111111111111';
const REMINDER = '22222222-2222-4222-8222-222222222222';
const UPDATED = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

test('each form validates what its route validates, and past events cannot be dated in the future', () => {
  const p = command.parseAppealFormAnswer;
  assert.equal(p('START', { ground: 'ASSESSED_VALUE' }).success, true);
  assert.equal(p('START', { ground: 'VIBES' }).success, false);
  assert.equal(p('PACKET', { narrative: 'short', reviewed: 'YES' }).success, false, 'a narrative needs 50 characters');
  assert.equal(p('PACKET', { narrative: 'x'.repeat(60), checklist: ['REWRITE'], reviewed: 'YES' }).success, false, 'only the packet\'s own checklist codes');
  assert.equal(p('PACKET', { narrative: 'x'.repeat(60), checklist: ['VERIFY_CANONICAL_FACTS'], reviewed: 'NO' }).success, true);
  assert.equal(p('FILING', { filedOn: '2999-01-01', externalReference: 'ABC-1' }).reason, 'FUTURE');
  assert.equal(p('FILING', { filedOn: '2026-01-01', externalReference: 'ab' }).success, false, 'a reference needs 3 characters');
  assert.equal(p('EVENT', { type: 'HEARING_SCHEDULED', occurredOn: '2999-01-01', summary: 'Set for spring' }).success, true, 'a hearing is in the future');
  assert.equal(p('EVENT', { type: 'RESPONSE_RECEIVED', occurredOn: '2999-01-01', summary: 'Got a letter' }).reason, 'FUTURE');
  const decision = p('DETERMINATION', { determination: 'REDUCED', determinedOn: '2026-05-01', reference: 'Order 7', summary: 'Reduced by the board', closeCase: 'NO' });
  assert.equal(decision.success, true);
  assert.ok(decision.data.refundAmount == null && decision.data.refundAmount !== 0, 'a blank amount is not zero');
  assert.equal(p('DETERMINATION', { determination: 'REDUCED', determinedOn: '2026-05-01', reference: 'Order 7', summary: 'x'.repeat(3), closeCase: 'MAYBE' }).success, false);
});

test('the order of an appeal is one function: which step a case offers now', () => {
  const kinds = (status, filed, packet) => command.appealCaseAvailableKinds({ status, filedAt: filed ? new Date() : null, packetStatus: packet });
  assert.deepEqual(kinds('PREPARING', false, 'INCOMPLETE'), ['PACKET', 'REMINDER_ADD']);
  assert.deepEqual(kinds('PACKET_READY', false, 'READY'), ['PACKET', 'FILING', 'REMINDER_ADD']);
  assert.deepEqual(kinds('AWAITING_RESPONSE', true, 'FILED'), ['EVENT', 'DETERMINATION', 'REMINDER_ADD']);
  assert.deepEqual(kinds('DETERMINED', true, 'FILED'), ['REMINDER_ADD']);
  assert.deepEqual(kinds('CLOSED', true, 'FILED'), []);
});

test('an instant for a date: noon UTC for a past day, now for today', () => {
  const now = new Date('2026-10-12T08:30:00.000Z');
  assert.equal(command.appealInstant('2026-10-01', now), '2026-10-01T12:00:00.000Z');
  assert.equal(command.appealInstant('2026-10-12', now), now.toISOString());
  assert.match(command.appealReminderKey('File by May 1', sha), /^ask-[0-9a-f]{24}$/);
  assert.equal(command.appealReminderKey('File by May 1', sha), command.appealReminderKey(' file by may 1 ', sha));
});

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
const baseCase = (over = {}) => ({
  id: CASE, title: 'Assessed value appeal preparation', ground: 'ASSESSED_VALUE', status: 'PACKET_READY', filedAt: null, taxYear: 2026, updatedAt: UPDATED,
  packet: { status: 'READY', narrative: 'x'.repeat(80), completedChecklistJson: ['VERIFY_CANONICAL_FACTS'], placeholderValuesJson: { APPLICANT_NAME: 'A. Owner' }, updatedAt: UPDATED },
  reminders: [], ...over,
});
function withData({ primary = true, appealCase = baseCase(), reminder = null } = {}) {
  const saved = { p: prisma.property, c: prisma.propertyTaxAppealCase, r: prisma.propertyTaxAppealReminder };
  prisma.property = { findFirst: async () => (primary ? { id: 'prop-1' } : null) };
  prisma.propertyTaxAppealCase = { findFirst: async (args) => (appealCase && (!args.where.id || args.where.id === appealCase.id) ? appealCase : null) };
  prisma.propertyTaxAppealReminder = { findFirst: async (args) => (reminder && args.where.id === reminder.id ? reminder : null) };
  return () => { prisma.property = saved.p; prisma.propertyTaxAppealCase = saved.c; prisma.propertyTaxAppealReminder = saved.r; };
}
const invoke = (message, launchContext, role = 'CONTRIBUTOR') => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext }, { propertyAccess: { role } });
const launch = (kind, entityId, over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId, entityType: command.appealCommandEntityType(kind), ...over });

test('declared-action only, a contributor command; viewers, refreshes and a non-primary owner are refused', async () => {
  for (const message of Object.values(M)) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withData();
  try {
    assert.equal((await invoke(M.PACKET, launch('PACKET', CASE, { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_PROPERTY_TAX_APPEAL_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.PACKET, launch('PACKET', CASE, { entityType: command.APPEAL_PROPERTY_ENTITY_TYPE }))).reasonCode, 'ASK_PROPERTY_TAX_APPEAL_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.PACKET, launch('PACKET', CASE), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
  } finally { restore(); restoreRole(); }
  const restoreRole2 = withRole('CONTRIBUTOR'); const restore2 = withData({ primary: false });
  try {
    assert.equal((await invoke(M.PACKET, launch('PACKET', CASE))).reasonCode, 'PROPERTY_TAX_APPEAL_PRIMARY_OWNER_ONLY');
  } finally { restore2(); restoreRole2(); }
});

test('a step opens a form seeded with what is recorded; a step the case does not allow now is refused', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); let restore = withData();
  try {
    const packet = await invoke(M.PACKET, launch('PACKET', CASE));
    assert.equal(packet.status, 'NEEDS_CONTEXT');
    assert.equal(packet.captureRequests[0].captureKey, command.APPEAL_FORM_CAPTURE_KEYS.PACKET);
    assert.equal(packet.captureRequests[0].currentAnswer.APPLICANT_NAME, 'A. Owner');
    assert.equal(packet.parameters.propertyTaxAppealLaunch.kind, 'PACKET');
    assert.equal((await invoke(M.EVENT, launch('EVENT', CASE))).reasonCode, 'APPEAL_STEP_NOT_AVAILABLE', 'nothing to respond to before filing');
    assert.equal((await invoke(M.DETERMINATION, launch('DETERMINATION', CASE))).reasonCode, 'APPEAL_STEP_NOT_AVAILABLE');
    restore(); restore = withData({ appealCase: null });
    assert.equal((await invoke(M.PACKET, launch('PACKET', CASE))).reasonCode, 'APPEAL_CASE_NOT_FOUND');
  } finally { restore(); restoreRole(); }
});

test('submitting a filing shows the review with the not-filed-by-Cozy disclosure, and writes nothing yet', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withData();
  const saved = propertyTaxAppealCaseService.confirmExternalFiling; let writes = 0;
  propertyTaxAppealCaseService.confirmExternalFiling = async () => { writes += 1; };
  try {
    const parsed = command.parseAppealFormAnswer('FILING', { filedOn: '2026-05-02', externalReference: 'CONF-2026-77' });
    const result = await handler.appealCommandResult('user-1', 'prop-1', { kind: 'FILING', entityId: CASE, sourceExecutionId: null }, parsed.data);
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    assert.match(result.confirmation.description, /Cozy does not file anything with the authority/);
    assert.deepEqual(Object.fromEntries(result.confirmation.fields.map((f) => [f.label, f.value])), { 'Filed on': 'May 2, 2026', Reference: 'CONF-2026-77' });
    assert.equal(command.parseAppealFormAnswer('FILING', result.parameters.appealForm).success, true);
    assert.equal(writes, 0);
  } finally { propertyTaxAppealCaseService.confirmExternalFiling = saved; restore(); restoreRole(); }
});

test('starting an appeal that is not ready says what is still needed and offers no confirmation; a ready one asks for it', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withData();
  const saved = propertyTaxAppealReadinessService.evaluate;
  try {
    propertyTaxAppealReadinessService.evaluate = async () => ({ status: 'NEEDS_EVIDENCE', reason: 'Two comparable sales are needed.', gaps: ['Add a comparable sale', 'Confirm the valuation date'] });
    const parsed = command.parseAppealFormAnswer('START', { ground: 'ASSESSED_VALUE' });
    const notReady = await handler.appealCommandResult('user-1', 'prop-1', { kind: 'START', entityId: 'prop-1', sourceExecutionId: null }, parsed.data);
    assert.equal(notReady.reasonCode, 'PROPERTY_TAX_APPEAL_NOT_READY_NEEDS_EVIDENCE');
    assert.equal(notReady.confirmation, undefined);
    assert.match(notReady.blocks[0].body, /Add a comparable sale; Confirm the valuation date/);
    propertyTaxAppealReadinessService.evaluate = async () => ({ status: 'READY', gaps: [], ruleProfile: { title: 'County rule 2026' } });
    const ready = await handler.appealCommandResult('user-1', 'prop-1', { kind: 'START', entityId: 'prop-1', sourceExecutionId: null }, parsed.data);
    assert.equal(ready.status, 'NEEDS_CONFIRMATION');
    assert.ok(ready.confirmation.fields.some((f) => f.label === 'Jurisdiction rule' && f.value === 'County rule 2026'));
  } finally { propertyTaxAppealReadinessService.evaluate = saved; restore(); restoreRole(); }
});

const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
const caseVersion = (c) => sha(`appeal-case:${c.id}:${c.updatedAt.toISOString()}:${c.packet?.updatedAt.toISOString() ?? ''}:${c.reminders.map((r) => `${r.id}${r.status}${r.updatedAt.toISOString()}`).join(',')}`);
function installService() {
  const svc = propertyTaxAppealCaseService;
  const names = ['createOrResume', 'updatePacket', 'confirmExternalFiling', 'recordTrackingEvent', 'upsertReminder', 'decideReminder', 'recordDetermination'];
  const saved = Object.fromEntries(names.map((n) => [n, svc[n]]));
  const calls = [];
  for (const n of names) svc[n] = async (arg) => { calls.push([n, arg]); return { id: CASE }; };
  const savedReconcile = executeOperation.reconcileAskExecutionSideEffects;
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, svc, restore() { for (const n of names) svc[n] = saved[n]; executeOperation.reconcileAskExecutionSideEffects = savedReconcile; } };
}

test('confirming each step calls the canonical service with its inputs; stale, invalid and refused steps write nothing', async () => {
  const filedCase = baseCase({ status: 'AWAITING_RESPONSE', filedAt: new Date('2026-05-02T12:00:00Z'), reminders: [{ id: REMINDER, title: 'File by May 1', status: 'PENDING', updatedAt: UPDATED }] });
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withData({ appealCase: filedCase, reminder: { id: REMINDER, title: 'File by May 1', status: 'PENDING', updatedAt: UPDATED, caseId: CASE } });
  const w = installService();
  try {
    const version = caseVersion(filedCase);
    const command_ = (kind) => ({ kind, entityId: CASE });
    await confirmCapabilityInvoke(OP, ctx({ appealForm: { type: 'RESPONSE_RECEIVED', occurredOn: '2026-05-20', summary: 'Board replied' }, appealCommand: command_('EVENT'), appealContextVersion: version }));
    assert.deepEqual(w.calls[0], ['recordTrackingEvent', { caseId: CASE, propertyId: 'prop-1', userId: 'user-1', type: 'RESPONSE_RECEIVED', occurredAt: new Date('2026-05-20T12:00:00.000Z'), summary: 'Board replied' }]);
    await confirmCapabilityInvoke(OP, ctx({ appealForm: { title: 'File by May 1', dueOn: '2027-05-01' }, appealCommand: command_('REMINDER_ADD'), appealContextVersion: version }));
    assert.equal(w.calls[1][0], 'upsertReminder');
    assert.equal(w.calls[1][1].title, 'File by May 1');
    assert.match(w.calls[1][1].reminderKey, /^ask-/);
    assert.equal(w.calls[1][1].dueAt.toISOString(), '2027-05-01T12:00:00.000Z');
    await confirmCapabilityInvoke(OP, ctx({
      appealForm: { determination: 'REDUCED', determinedOn: '2026-06-01', reference: 'Order 7', summary: 'Reduced', finalAssessedValue: 410000, refundAmount: null, creditAmount: null, closeCase: 'YES' },
      appealCommand: command_('DETERMINATION'), appealContextVersion: version,
    }));
    const [, determination] = w.calls[2];
    assert.equal(determination.closeCase, true);
    assert.equal(determination.finalAssessedValue, 410000);
    assert.equal('refundAmount' in determination, false, 'a blank amount is omitted, not zero');
    await confirmCapabilityInvoke(OP, ctx({ appealCommand: { kind: 'REMINDER_DONE', entityId: REMINDER }, appealContextVersion: sha(`appeal-reminder:${REMINDER}:PENDING:${UPDATED.toISOString()}`) }));
    assert.deepEqual(w.calls[3], ['decideReminder', { caseId: CASE, propertyId: 'prop-1', userId: 'user-1', reminderId: REMINDER, status: 'COMPLETED' }]);
    const before = w.calls.length;
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ appealForm: { type: 'RESPONSE_RECEIVED', occurredOn: '2026-05-20', summary: 'Board replied' }, appealCommand: command_('EVENT'), appealContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ appealForm: { type: 'NOPE' }, appealCommand: command_('EVENT'), appealContextVersion: version })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ appealForm: { filedOn: '2026-05-02', externalReference: 'CONF-1' }, appealCommand: command_('FILING'), appealContextVersion: version })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE', 'a filed case cannot be filed again');
    assert.equal(w.calls.length, before);
  } finally { w.restore(); restore(); restoreRole(); }
});

test('a service refusal reaches the person in its own words', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const appealCase = baseCase();
  const restore = withData({ appealCase });
  const w = installService();
  w.svc.confirmExternalFiling = async () => { throw new Error('Packet must be ready before external filing can be confirmed'); };
  try {
    await assert.rejects(
      () => confirmCapabilityInvoke(OP, ctx({ appealForm: { filedOn: '2026-05-02', externalReference: 'CONF-1' }, appealCommand: { kind: 'FILING', entityId: CASE }, appealContextVersion: caseVersion(appealCase) })),
      (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE' && /Packet must be ready/.test(e.message),
    );
  } finally { w.restore(); restore(); restoreRole(); }
});

test('the answer lists cases with the one step each can take now, and a viewer is offered none', async () => {
  const cases = [
    { ...baseCase(), externalFilingReference: null, reminders: [] },
    { ...baseCase({ id: 'case-2', title: 'Filed appeal', status: 'AWAITING_RESPONSE', filedAt: '2026-05-02T12:00:00.000Z' }), externalFilingReference: 'CONF-9', hearingAt: null, determination: null,
      reminders: [{ id: REMINDER, title: 'Bring photos', status: 'PENDING', dueAt: '2026-06-01T12:00:00.000Z' }] },
  ];
  const saved = propertyTaxAppealCaseService.list;
  propertyTaxAppealCaseService.list = async () => cases;
  try {
    const blocks = await propertyTaxAppealCaseBlocks('user-1', 'prop-1', true);
    const list = blocks[0];
    const [first, second] = list.sections[0].items;
    assert.deepEqual(first.actions.map((a) => a.id), ['property-tax-appeal-packet', 'property-tax-appeal-filing', 'property-tax-appeal-reminder-add']);
    assert.deepEqual(second.actions.map((a) => a.id), ['property-tax-appeal-event', 'property-tax-appeal-determination', 'property-tax-appeal-reminder-add']);
    assert.ok(second.meta.some((m) => /Filed May 2, 2026 \(CONF-9\)/.test(m)));
    assert.deepEqual(list.sections[1].items[0].actions.map((a) => a.id), ['property-tax-appeal-reminder-done', 'property-tax-appeal-reminder-dismiss']);
    const viewer = await propertyTaxAppealCaseBlocks('user-1', 'prop-1', false);
    assert.ok(viewer[0].sections.flatMap((s) => s.items).every((item) => item.actions.length === 0));
    propertyTaxAppealCaseService.list = async () => { throw new Error('Property not found'); };
    assert.deepEqual(await propertyTaxAppealCaseBlocks('user-1', 'prop-1', true), [], 'not the primary owner: the section is absent');
  } finally { propertyTaxAppealCaseService.list = saved; }
});

test('the ids are allowlisted for the answer that emits them', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'PRIMARY' },
    operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.APPEAL_COMMAND_ACTION_IDS)) assert.equal(applicable(id, 'PROPERTY_TAX_APPEAL_READINESS'), true, id);
  assert.equal(applicable('property-tax-appeal-back', OP), true);
});

test('every writing property-tax route under a property has the contributor floor', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/routes/propertyTax.routes.ts'), 'utf8');
  const statements = source.split(/\nrouter\./).slice(1);
  const writing = statements.filter((s) => /^(post|put|patch|delete)\(\s*'\/properties\/:propertyId\//.test(s));
  assert.ok(writing.length >= 15);
  const open = writing.filter((s) => !s.includes("requireHouseholdRole('CONTRIBUTOR')")).map((s) => s.slice(0, 90));
  assert.deepEqual(open, []);
});
