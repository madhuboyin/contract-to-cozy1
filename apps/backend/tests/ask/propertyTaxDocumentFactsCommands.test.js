const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Property Tax": confirmed tax facts from a tax document already in Home Records (FRD v1.370; owner rulings D-T3, D-T4, D-T6).
// No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { propertyTaxDocumentIntakeService: Intake, PropertyTaxDocumentIntakeService, PROPERTY_TAX_EXISTING_RECORD_AFFIRMATION_VERSION, PROPERTY_TAX_PRIVACY_CONSENT_VERSION } = require('../../src/services/propertyTax/propertyTaxDocumentIntake.service.ts');
const command = require('../../src/services/ask/support/propertyTaxDocumentFactsCommand.ts');
const { documentFactsResult } = require('../../src/services/ask/handlers/propertyTaxDocumentFactsCommands.handler.ts');

const OP = 'PROPERTY_TAX_COMPARABLE_COMMAND';
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const T = new Date('2026-09-01T00:00:00Z');
const RECORD = { id: 'rec-1', title: 'Notice 2026.pdf', currentVersionId: 'ver-1', createdAt: new Date('2026-05-01T00:00:00Z') };
const form = (over = {}) => ({ sourceRecordId: 'rec-1', kind: 'ASSESSMENT_NOTICE', taxYear: 2026, parcelId: 'P-100', valuationDate: '2026-01-01', totalAssessedValue: '250000', assessmentRatio: 0.06, affirmed: 'YES', ...over });
const versionFor = (intake) => sha(`tax-doc-facts:prop-1:rec-1:ver-1:${intake ? `${intake.id}:${intake.status}:${intake.updatedAt.toISOString()}` : 'none:none:none'}`);

function install(role, { primary = true, records = [RECORD], intakes = [] } = {}) {
  const saved = { a: propertyAccess.resolvePropertyAccess, p: prisma.property, r: prisma.propertyRecord, i: prisma.propertyTaxDocumentIntake, c: Intake.confirmFromRecord, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  let where = null;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  prisma.property = { findFirst: async () => (primary ? { id: 'prop-1' } : null) };
  prisma.propertyRecord = { findMany: async (args) => { where = args.where; return records; } };
  prisma.propertyTaxDocumentIntake = { findMany: async () => intakes };
  Intake.confirmFromRecord = async (input) => { calls.push(input); return { id: 'intake-9' }; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, get where() { return where; }, restore() {
    propertyAccess.resolvePropertyAccess = saved.a; prisma.property = saved.p; prisma.propertyRecord = saved.r; prisma.propertyTaxDocumentIntake = saved.i;
    Intake.confirmFromRecord = saved.c; executeOperation.reconcileAskExecutionSideEffects = saved.e;
  } };
}
const invoke = () => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: command.DOCUMENT_FACTS_MESSAGE, launchContext: { operationId: OP, surface: 'ASK_PAGE' } });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters });

test('the form becomes the staged fields the service validates; the affirmation, a value and a past date are required', () => {
  const p = command.parseDocumentFactsAnswer;
  const ok = p(form({ exemptions: 'STAR, Veteran ,' }));
  assert.equal(ok.success, true);
  assert.deepEqual(ok.data.fields.map((f) => f.fieldKey), ['taxYear', 'parcelId', 'valuationDate', 'totalAssessedValue', 'assessmentRatio', 'exemptions']);
  assert.deepEqual(ok.data.fields.at(-1).value, ['STAR', 'Veteran']);
  assert.equal(p(form({ affirmed: undefined })).reason, 'AFFIRMATION');
  assert.equal(p(form({ affirmed: 'NO' })).reason, 'AFFIRMATION');
  assert.equal(p({ sourceRecordId: 'rec-1', kind: 'TAX_BILL', taxYear: 2026, affirmed: 'YES' }).reason, 'NO_FACTS');
  assert.equal(p(form({ valuationDate: '2999-01-01' })).reason, 'FUTURE_DATE');
  assert.equal(p(form({ assessmentRatio: 6 })).reason, 'INVALID');
  assert.equal(p(form({ kind: 'DEED' })).reason, 'INVALID');
  assert.equal(p({ ...form(), status: 'DONE' }).reason, 'INVALID');
});

test('declared-action only; viewers and non-owners are told first; with no tax document waiting the answer says so and that Ask cannot upload', async () => {
  assert.notEqual(resolveAskRoutingCascade(command.DOCUMENT_FACTS_MESSAGE, { localRoutingEnabled: true }).operation?.operationId, OP);
  let w = install('VIEWER');
  try { assert.equal((await invoke()).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', { primary: false });
  try { assert.equal((await invoke()).reasonCode, 'PROPERTY_TAX_DOCUMENT_FACTS_OWNER_ONLY'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', { records: [] });
  try {
    const none = await invoke();
    assert.equal(none.reasonCode, 'PROPERTY_TAX_DOCUMENT_NONE_ON_FILE');
    assert.match(none.blocks[0].body, /Ask cannot upload a file/);
  } finally { w.restore(); }
});

test('only an active, clean-scanned TAX_DOCUMENT that is not already confirmed is offered (D-T3)', async () => {
  const w = install('CONTRIBUTOR', { records: [RECORD, { ...RECORD, id: 'rec-2', title: 'Done.pdf' }], intakes: [{ id: 'i-2', documentId: 'rec-2', status: 'CONFIRMED', updatedAt: T }] });
  try {
    const result = await invoke();
    assert.equal(result.status, 'NEEDS_CONTEXT');
    assert.equal(w.where.recordType, 'TAX_DOCUMENT');
    assert.equal(w.where.lifecycleStatus, 'ACTIVE');
    assert.deepEqual(w.where.currentVersion, { is: { scanStatus: 'CLEAN' } });
    const field = result.captureRequests[0].inputSchema.fields.find((f) => f.key === 'sourceRecordId');
    assert.deepEqual(field.inputSchema.options.map((o) => o.value), ['rec-1']);
    const affirmation = result.captureRequests[0].inputSchema.fields.find((f) => f.key === 'affirmed');
    assert.equal(affirmation.label, command.DOCUMENT_FACTS_AFFIRMATION, 'a workflow affirmation, not the storage consent (D-T4)');
    assert.doesNotMatch(affirmation.label, /store/i);
  } finally { w.restore(); }
});

test('the review shows every value and the affirmation, and says nothing was read or verified automatically; nothing is written', async () => {
  const w = install('CONTRIBUTOR');
  try {
    const review = await documentFactsResult('u1', 'prop-1', { sourceExecutionId: null }, form());
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(review.confirmation.fields.map((f) => f.label), ['Document', 'Kind', 'Tax year', 'Parcel ID', 'Valuation date', 'Assessed value', 'Assessment ratio']);
    assert.match(review.confirmation.description, /mark the record verified/);
    assert.match(review.confirmation.description, /has not automatically read or verified the document/);
    assert.equal(review.contextVersion, versionFor(null));
    assert.equal((await documentFactsResult('u1', 'prop-1', { sourceExecutionId: null }, form({ sourceRecordId: 'rec-9' }))).reasonCode, 'PROPERTY_TAX_DOCUMENT_NOT_OFFERED');
    assert.equal((await documentFactsResult('u1', 'prop-1', { sourceExecutionId: null }, form({ affirmed: 'NO' }))).reasonCode, 'PROPERTY_TAX_DOCUMENT_FACTS_AFFIRMATION');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('confirming calls the one transactional service operation with the affirmed fields; a changed document or a tampered form writes nothing', async () => {
  const w = install('CONTRIBUTOR');
  try {
    const parameters = { documentFactsForm: form(), documentFactsContextVersion: versionFor(null) };
    const done = await confirmCapabilityInvoke(OP, ctx(parameters));
    assert.equal(done.result.reasonCode, 'PROPERTY_TAX_DOCUMENT_FACTS_CONFIRMED');
    assert.equal(done.artifactType, 'PROPERTY_TAX_DOCUMENT_INTAKE');
    assert.equal(w.calls.length, 1);
    assert.deepEqual([w.calls[0].propertyId, w.calls[0].userId, w.calls[0].recordId, w.calls[0].kind, w.calls[0].affirmed], ['prop-1', 'u1', 'rec-1', 'ASSESSMENT_NOTICE', true]);
    assert.deepEqual(w.calls[0].fields.map((f) => f.fieldKey), ['taxYear', 'parcelId', 'valuationDate', 'totalAssessedValue', 'assessmentRatio']);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...parameters, documentFactsContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...parameters, documentFactsForm: form({ affirmed: 'NO' }) })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...parameters, documentFactsForm: form({ sourceRecordId: 'rec-9' }) })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 1);
  } finally { w.restore(); }
});

function fakeTx({ record = { id: 'rec-1', currentVersionId: 'ver-1' }, intake = null, failAt = null } = {}) {
  const log = [];
  const tx = {
    property: { findFirst: async () => ({ id: 'prop-1' }) },
    propertyRecord: { findFirst: async (args) => { log.push(['record.findFirst', args.where]); return record; }, findUnique: async () => ({ currentVersionId: 'ver-1' }), update: async () => ({}) },
    propertyTaxDocumentIntake: {
      findUnique: async () => intake,
      create: async (args) => { log.push(['intake.create', args.data]); return { id: 'intake-new', status: 'UPLOADED', updatedAt: T }; },
      findFirst: async () => ({ id: 'intake-new', propertyId: 'prop-1', documentId: 'rec-1', kind: 'ASSESSMENT_NOTICE', status: 'NEEDS_REVIEW', document: {}, fields: [
        { id: 'f-year', fieldKey: 'taxYear', proposedValueJson: 2026 }, { id: 'f-parcel', fieldKey: 'parcelId', proposedValueJson: 'P-100' }], confirmedAssessmentRecord: null, confirmedBillRecord: null }),
      update: async (args) => { log.push(['intake.update', args.data.status]); return { id: 'intake-new', fields: [] }; },
    },
    propertyTaxExtractedField: { upsert: async (args) => { log.push(['field.upsert', args.create.fieldKey]); if (failAt === args.create.fieldKey) throw new Error('boom'); return { id: 'x' }; }, update: async () => ({}) },
    propertyTaxJurisdiction: { findUniqueOrThrow: async () => ({ id: 'j-1' }) },
    propertyTaxParcelMatch: { findFirst: async () => null, create: async () => ({ id: 'pm-1' }) },
    propertyTaxFieldEvidence: { create: async () => ({}) },
  };
  tx.property.findUniqueOrThrow = async () => ({ id: 'prop-1', address: 'a', city: 'c', state: 'NY', zipCode: '1', county: null, countyFips: null, taxAssessmentRecords: [{ jurisdictionId: 'j-1' }] });
  return { tx, log };
}

test('the service creates the intake from the record under its own affirmation version, then stages and confirms in one transaction (D-T4, D-T6)', async () => {
  const { tx, log } = fakeTx();
  const links = [];
  let transactions = 0;
  const service = new PropertyTaxDocumentIntakeService({ $transaction: async (callback) => { transactions += 1; return callback(tx); } }, undefined, async () => {}, async (_tx, link) => { links.push(link); });
  const result = await service.confirmFromRecord({
    propertyId: 'prop-1', userId: 'u1', recordId: 'rec-1', kind: 'ASSESSMENT_NOTICE', affirmed: true,
    fields: [{ fieldKey: 'taxYear', value: 2026 }, { fieldKey: 'parcelId', value: 'P-100' }], now: T,
  });
  assert.equal(transactions, 1, 'one transaction for the whole action');
  const created = log.find((entry) => entry[0] === 'intake.create')[1];
  assert.equal(created.privacyConsentVersion, PROPERTY_TAX_EXISTING_RECORD_AFFIRMATION_VERSION);
  assert.notEqual(created.privacyConsentVersion, PROPERTY_TAX_PRIVACY_CONSENT_VERSION);
  assert.deepEqual(log.find((entry) => entry[0] === 'record.findFirst')[1].recordType, 'TAX_DOCUMENT');
  assert.deepEqual(links.map((link) => [link.entityType, link.recordId]), [['PROPERTY_TAX_INTAKE', 'rec-1']]);
  assert.ok(result);
});

test('the service refuses without the affirmation, for a confirmed intake, and for a record that is not an eligible tax document; a failure mid-way stages nothing it can keep', async () => {
  const noop = async () => {};
  let ran = 0;
  const base = (tx) => new PropertyTaxDocumentIntakeService({ $transaction: async (callback) => { ran += 1; return callback(tx); } }, undefined, noop, noop);
  const input = { propertyId: 'prop-1', userId: 'u1', recordId: 'rec-1', kind: 'TAX_BILL', affirmed: true, fields: [{ fieldKey: 'taxYear', value: 2026 }, { fieldKey: 'parcelId', value: 'P-100' }], now: T };
  await assert.rejects(() => base(fakeTx().tx).confirmFromRecord({ ...input, affirmed: false }), /affirmation is required/);
  assert.equal(ran, 0, 'refused before any transaction');
  await assert.rejects(() => base(fakeTx({ intake: { id: 'i', status: 'CONFIRMED', updatedAt: T } }).tx).confirmFromRecord(input), /already been confirmed/);
  await assert.rejects(() => base(fakeTx({ record: null }).tx).confirmFromRecord(input), /active tax document/);
  await assert.rejects(() => base(fakeTx({ intake: { id: 'i', status: 'NEEDS_REVIEW', updatedAt: T } }).tx).confirmFromRecord({ ...input, expectedIntakeUpdatedAt: new Date('2026-01-01') }), /changed after the values were reviewed/);
  // A failure inside the one transaction propagates, so the surrounding transaction rolls the whole action back (nothing is committed separately).
  await assert.rejects(() => base(fakeTx({ failAt: 'parcelId' }).tx).confirmFromRecord(input), /boom/);
});

test('the action is allowlisted on the appeal answer', () => {
  assert.equal(isAskActionApplicable({
    action: { id: command.DOCUMENT_FACTS_ACTION_ID, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId: 'PROPERTY_TAX_APPEAL_READINESS', style: 'QUIET' },
    operationId: 'PROPERTY_TAX_APPEAL_READINESS', propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  }), true);
});
