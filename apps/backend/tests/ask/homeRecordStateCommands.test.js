const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Documents and Home Records": archive, verification mark and effective period (FRD v1.350). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { homeRecordsService: Records } = require('../../src/services/homeRecords.service.ts');
const command = require('../../src/services/ask/support/homeRecordStateCommand.ts');
const { homeRecordStateResult } = require('../../src/services/ask/handlers/homeRecordStateCommands.handler.ts');

const OP = 'HOME_RECORD_STATE_COMMAND';
const M = command.HOME_RECORD_MESSAGES;
const T = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const rec = (over = {}) => ({ id: 'rec1', title: 'Roof warranty', lifecycleStatus: 'ACTIVE', verificationStatus: 'UNVERIFIED', verificationNotes: null, effectiveFrom: null, effectiveTo: null, updatedAt: T, ...over });
const iso = (v) => (v ? new Date(v).toISOString() : '');
const version = (r) => sha(`home-record:${r.id}:${r.lifecycleStatus}:${r.verificationStatus}:${iso(r.effectiveFrom)}:${iso(r.effectiveTo)}:${iso(r.updatedAt)}`);

function install(role, record = rec()) {
  const saved = { a: propertyAccess.resolvePropertyAccess, g: Records.get, ar: Records.archive, v: Records.setVerification, p: Records.setEffectivePeriod, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  Records.get = async (_p, id) => { if (!record || record.id !== id) throw new Error('not found'); return record; };
  Records.archive = async (...a) => { calls.push(['archive', ...a]); };
  Records.setVerification = async (a) => { calls.push(['verification', a]); return {}; };
  Records.setEffectivePeriod = async (a) => { calls.push(['period', a]); };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; Records.get = saved.g; Records.archive = saved.ar; Records.setVerification = saved.v; Records.setEffectivePeriod = saved.p; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityType: 'PROPERTY_RECORD', entityId: 'rec1', ...over });
const invoke = (kind, launchContext) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: M[kind], launchContext });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });

test('declared-action only; contributor floor; viewers refused; needs a Home Record entity; trashed or archived are not offered', async () => {
  for (const kind of Object.keys(M)) assert.notEqual(resolveAskRoutingCascade(M[kind], { localRoutingEnabled: true }).operation?.operationId, OP, kind);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  let w = install('VIEWER');
  try { assert.equal((await invoke('ARCHIVE', launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR');
  try {
    assert.equal((await invoke('ARCHIVE', launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_HOME_RECORD_STATE_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('ARCHIVE', launch({ entityType: 'DOCUMENT' }))).reasonCode, 'ASK_HOME_RECORD_STATE_NOT_DIRECTLY_ROUTABLE');
    const review = await invoke('ARCHIVE', launch());
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /It is not deleted/);
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', rec({ lifecycleStatus: 'ARCHIVED' }));
  try { assert.equal((await invoke('ARCHIVE', launch())).reasonCode, 'HOME_RECORD_NOT_ACTIVE'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', rec({ lifecycleStatus: 'TRASHED' }));
  try { assert.equal((await invoke('VERIFICATION', launch())).reasonCode, 'HOME_RECORD_TRASHED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', null);
  try { assert.equal((await invoke('ARCHIVE', launch())).reasonCode, 'HOME_RECORD_NOT_FOUND'); } finally { w.restore(); }
});

test('verification and period: forms validate, the review names the change and what Ask did not do; nothing is written', async () => {
  const p = command.parseHomeRecordAnswer;
  assert.equal(p('VERIFICATION', { status: 'MAYBE' }).success, false);
  assert.equal(p('VERIFICATION', { status: 'VERIFIED' }).success, true);
  assert.equal(p('EFFECTIVE_PERIOD', {}).success, false);
  const w = install('CONTRIBUTOR');
  try {
    assert.equal((await invoke('VERIFICATION', launch())).status, 'NEEDS_CONTEXT');
    const v = await homeRecordStateResult('u1', 'prop-1', { kind: 'VERIFICATION', entityId: 'rec1', sourceExecutionId: null }, { status: 'VERIFIED' });
    assert.match(v.confirmation.description, /Ask did not read or verify it/);
    assert.equal(v.confirmation.fields[1].value, 'Not verified → Verified by you');
    const period = await homeRecordStateResult('u1', 'prop-1', { kind: 'EFFECTIVE_PERIOD', entityId: 'rec1', sourceExecutionId: null }, { effectiveFrom: '2026-01-01', effectiveTo: '2025-01-01' });
    assert.equal(period.reasonCode, 'HOME_RECORD_INPUT_INVALID');
    const ok = await homeRecordStateResult('u1', 'prop-1', { kind: 'EFFECTIVE_PERIOD', entityId: 'rec1', sourceExecutionId: null }, { effectiveFrom: '2026-01-01', effectiveTo: '2027-01-01' });
    assert.equal(ok.confirmation.fields.length, 2);
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('confirming calls the service the route calls; a changed record, a trashed record or invalid details write nothing', async () => {
  const record = rec();
  const w = install('CONTRIBUTOR', record);
  try {
    const v = version(record);
    const p = (kind, form, cv = v) => ({ homeRecordCommand: { kind, entityId: 'rec1' }, homeRecordForm: form, homeRecordContextVersion: cv });
    await confirmCapabilityInvoke(OP, ctx(p('ARCHIVE')));
    assert.deepEqual(w.calls[0], ['archive', 'prop-1', 'rec1', 'CONTRIBUTOR']);
    await confirmCapabilityInvoke(OP, ctx(p('VERIFICATION', { status: 'VERIFIED', notes: 'Checked the PDF' })));
    assert.deepEqual(w.calls[1], ['verification', { propertyId: 'prop-1', recordId: 'rec1', userId: 'u1', role: 'CONTRIBUTOR', status: 'VERIFIED', notes: 'Checked the PDF' }]);
    await confirmCapabilityInvoke(OP, ctx(p('EFFECTIVE_PERIOD', { effectiveTo: '2027-01-01' })));
    assert.equal(w.calls[2][0], 'period');
    assert.equal(w.calls[2][1].effectiveTo.toISOString(), '2027-01-01T12:00:00.000Z');
    assert.equal('effectiveFrom' in w.calls[2][1], false);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('ARCHIVE', undefined, 'old'))), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('VERIFICATION', { status: 'MAYBE' }))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 3);
  } finally { w.restore(); }
  const trashed = rec({ lifecycleStatus: 'TRASHED' });
  const w2 = install('CONTRIBUTOR', trashed);
  try {
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ homeRecordCommand: { kind: 'ARCHIVE', entityId: 'rec1' }, homeRecordContextVersion: version(trashed) })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w2.calls.length, 0);
  } finally { w2.restore(); }
});

test('the action ids are allowlisted on the document answer and the back action on the command', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'MUTATE_RECORD', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.HOME_RECORD_ACTION_IDS)) assert.equal(applicable(id, 'DOCUMENT_LOOKUP'), true, id);
  assert.equal(applicable('home-record-back', OP), true);
});
