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
const version = (r) => sha(`home-record:${r.id}:${r.lifecycleStatus}:${r.verificationStatus}:${iso(r.effectiveFrom)}:${iso(r.effectiveTo)}:${iso(r.updatedAt)}:${r.legalHoldReason ?? ''}:${iso(r.retainUntil)}:${r.links?.length ?? 0}`);

function install(role, record = rec()) {
  const saved = { a: propertyAccess.resolvePropertyAccess, g: Records.get, ar: Records.archive, tr: Records.trash, rs: Records.restore, rt: Records.setRetention, v: Records.setVerification, p: Records.setEffectivePeriod, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  Records.get = async (_p, id) => { if (!record || record.id !== id) throw new Error('not found'); return record; };
  Records.archive = async (...a) => { calls.push(['archive', ...a]); };
  Records.trash = async (a) => { calls.push(['trash', a]); };
  Records.restore = async (...a) => { calls.push(['restore', ...a]); };
  Records.setRetention = async (a) => { calls.push(['retention', a]); };
  Records.setVerification = async (a) => { calls.push(['verification', a]); return {}; };
  Records.setEffectivePeriod = async (a) => { calls.push(['period', a]); };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; Records.get = saved.g; Records.archive = saved.ar; Records.trash = saved.tr; Records.restore = saved.rs; Records.setRetention = saved.rt; Records.setVerification = saved.v; Records.setEffectivePeriod = saved.p; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
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
  const A = command.HOME_RECORD_ACTION_IDS;
  for (const id of [A.ARCHIVE, A.VERIFICATION, A.EFFECTIVE_PERIOD, A.OPTIONS]) assert.equal(applicable(id, 'DOCUMENT_LOOKUP'), true, id);
  for (const id of ['home-record-back', A.TRASH, A.RETENTION, A.RESTORE]) assert.equal(applicable(id, OP), true, id);
});

// ---- Move to trash, restore, retention and legal hold (FRD v1.452) --------------------------------------------------------------------------------
const linked = (n, over = {}) => rec({ links: Array.from({ length: n }, (_, i) => ({ id: `l${i}` })), ...over });
const cp = (kind, record, form) => ({ homeRecordCommand: { kind, entityId: 'rec1' }, ...(form ? { homeRecordForm: form } : {}), homeRecordContextVersion: version(record) });

test('more options offers trash to a contributor and retention only to an owner; nothing is written', async () => {
  let w = install('CONTRIBUTOR');
  try {
    const card = (await invoke('OPTIONS', launch())).blocks[0];
    assert.deepEqual(card.actions.map((a) => a.id), ['home-record-trash', 'home-record-back']);
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  w = install('OWNER');
  try { assert.deepEqual((await invoke('OPTIONS', launch())).blocks[0].actions.map((a) => a.id), ['home-record-trash', 'home-record-retention', 'home-record-back']); } finally { w.restore(); }
  w = install('VIEWER');
  try { assert.equal((await invoke('OPTIONS', launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
});

test('trash: no links goes straight to a confirmation; links ask what to do with them first, and the choice reaches the service', async () => {
  let record = rec();
  let w = install('CONTRIBUTOR', record);
  try {
    const review = await invoke('TRASH', launch());
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /30 days/);
    await confirmCapabilityInvoke(OP, ctx(cp('TRASH', record)));
    assert.deepEqual(w.calls, [['trash', { propertyId: 'prop-1', recordId: 'rec1', userId: 'u1', role: 'CONTRIBUTOR' }]]);
  } finally { w.restore(); }
  record = linked(2);
  w = install('CONTRIBUTOR', record);
  try {
    const ask = await invoke('TRASH', launch());
    assert.equal(ask.status, 'NEEDS_CONTEXT');
    assert.match(ask.captureRequests[0].question, /2 links/);
    const review = await homeRecordStateResult('u1', 'prop-1', { kind: 'TRASH', entityId: 'rec1', sourceExecutionId: null }, { impact: 'REMOVE_LINKS' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /2 links to it will be removed/);
    await confirmCapabilityInvoke(OP, ctx(cp('TRASH', record, { impact: 'REMOVE_LINKS' })));
    assert.equal(w.calls[0][1].impactDecision, 'REMOVE_LINKS');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(cp('TRASH', record))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 1, 'a trash of a linked record without a decision writes nothing');
  } finally { w.restore(); }
});

test('the trash receipt offers the undo, and restore works only on a trashed record', async () => {
  const record = rec();
  let w = install('CONTRIBUTOR', record);
  try {
    const done = await confirmCapabilityInvoke(OP, ctx(cp('TRASH', record)));
    const action = done.result.blocks[0].actions.find((a) => a.id === 'home-record-restore');
    assert.equal(action.message, M.RESTORE);
    assert.equal((await invoke('RESTORE', launch())).reasonCode, 'HOME_RECORD_NOT_TRASHED');
  } finally { w.restore(); }
  const trashed = rec({ lifecycleStatus: 'TRASHED' });
  w = install('CONTRIBUTOR', trashed);
  try {
    assert.equal((await invoke('RESTORE', launch())).status, 'NEEDS_CONFIRMATION');
    await confirmCapabilityInvoke(OP, ctx(cp('RESTORE', trashed)));
    assert.deepEqual(w.calls, [['restore', 'prop-1', 'rec1', 'CONTRIBUTOR']]);
    assert.equal((await invoke('ARCHIVE', launch())).reasonCode, 'HOME_RECORD_TRASHED');
  } finally { w.restore(); }
});

test('retention and legal hold are owner-only at the review and at the confirmation, and a hold needs a reason', async () => {
  const p = command.parseHomeRecordAnswer;
  assert.equal(p('RETENTION', { legalHold: 'HOLD' }).success, false);
  assert.equal(p('RETENTION', { legalHold: 'NO_CHANGE' }).success, false);
  assert.equal(p('RETENTION', { legalHold: 'HOLD', reason: 'Insurance claim' }).success, true);
  assert.equal(p('RETENTION', { legalHold: 'NO_CHANGE', retainUntil: '2030-01-01' }).success, true);
  let w = install('CONTRIBUTOR');
  try {
    assert.equal((await invoke('RETENTION', launch())).reasonCode, 'ASK_PERMISSION_REQUIRED');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(cp('RETENTION', rec(), { legalHold: 'HOLD', reason: 'x' }))), (e) => e.code === 'ASK_PERMISSION_REQUIRED');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  const record = rec({ legalHoldReason: 'Old claim' });
  w = install('OWNER', record);
  try {
    assert.equal((await invoke('RETENTION', launch())).status, 'NEEDS_CONTEXT');
    const review = await homeRecordStateResult('u1', 'prop-1', { kind: 'RETENTION', entityId: 'rec1', sourceExecutionId: null }, { legalHold: 'RELEASE' });
    assert.match(review.confirmation.fields.find((f) => f.label === 'Legal hold').value, /On hold → No hold/);
    const ownerCtx = (parameters) => ({ ...ctx(parameters), access: { role: 'OWNER' } });
    await confirmCapabilityInvoke(OP, ownerCtx(cp('RETENTION', record, { legalHold: 'RELEASE' })));
    assert.deepEqual(w.calls[0][1], { propertyId: 'prop-1', recordId: 'rec1', role: 'OWNER', legalHoldReason: null });
    await confirmCapabilityInvoke(OP, ownerCtx(cp('RETENTION', record, { legalHold: 'HOLD', reason: 'Insurance claim', retainUntil: '2030-01-01' })));
    assert.equal(w.calls[1][1].legalHoldReason, 'Insurance claim');
    assert.equal(w.calls[1][1].retainUntil.toISOString(), '2030-01-01T12:00:00.000Z');
  } finally { w.restore(); }
});
