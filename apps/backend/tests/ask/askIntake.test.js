const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// The document reader is constructed on import; every call is replaced below, so no request is ever made with this placeholder.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-placeholder-key';

const { prisma } = require('../../src/lib/prisma.ts');
const storage = require('../../src/services/storage/reportStorage.ts');
const labelScan = require('../../src/services/inventoryLabelScan.service.ts');
const inspection = require('../../src/services/inspectionExtraction.service.ts');
const { documentIntelligenceService } = require('../../src/services/documentIntelligence.service.ts');
const { homeRecordsService } = require('../../src/services/homeRecords.service.ts');
const { homeRecordsExtractionService } = require('../../src/services/homeRecordsExtraction.service.ts');
const { InventoryDraftService } = require('../../src/services/inventoryDraft.service.ts');
const intake = require('../../src/services/ask/askIntake.service.ts');
const { ASK_INTAKE_KIND_OPTIONS, ASK_INTAKE_DISCLOSURES } = require('../../src/services/ask/askIntake.contract.ts');

const ctx = { propertyId: 'p1', userId: 'u1', role: 'CONTRIBUTOR' };
const calls = [];
let state;

function version(overrides = {}) {
  return { id: 'v1', originalFileName: 'receipt.pdf', mimeType: 'application/pdf', fileSizeBytes: 1200, sha256: 'abc', createdAt: new Date('2026-10-01T12:00:00Z'), scanStatus: 'CLEAN', storageKey: 'k/receipt.pdf', extractedFacts: [], ...overrides };
}
function fact(fieldKey, proposedValue, overrides = {}) {
  return { id: `f-${fieldKey}`, fieldKey, proposedValue, reviewedValue: null, reviewStatus: 'PENDING', confidence: 0.9, sourceCitation: 'AI extraction from "receipt.pdf"', promotedEntityId: null, promotedEntityType: null, createdAt: new Date('2026-10-01T12:00:01Z'), ...overrides };
}

function install(initial = {}) {
  calls.length = 0;
  state = { record: { id: 'r1', title: 'receipt', recordType: 'OTHER', lifecycleStatus: 'ACTIVE', currentVersion: version(), ...initial.record }, draft: initial.draft ?? null, report: initial.report ?? null, item: initial.item ?? null };
  prisma.propertyRecord = {
    findFirst: async () => state.record,
    update: async ({ data }) => { calls.push(['record.update', data]); Object.assign(state.record, data); return state.record; },
  };
  prisma.inventoryDraftItem = {
    findFirst: async () => state.draft,
    update: async ({ where, data }) => { calls.push(['draft.update', data]); state.draft = { ...(state.draft ?? { id: where.id }), ...data }; return state.draft; },
  };
  prisma.inspectionReport = { findFirst: async () => state.report };
  prisma.inventoryItem = { findFirst: async () => state.item };
  storage.downloadObjectBuffer = async () => { calls.push(['download']); return Buffer.from('%PDF-1.4'); };
  process.env.S3_BUCKET = 'bucket';
  documentIntelligenceService.analyzeDocument = async () => { calls.push(['model']); return { documentType: 'RECEIPT', confidence: 0.92, extractedData: {}, suggestedActions: [] }; };
  homeRecordsExtractionService.runExtraction = async (args) => { calls.push(['extract', args]); return []; };
  homeRecordsExtractionService.reviewCandidate = async (args) => { calls.push(['review', args]); };
  homeRecordsExtractionService.promoteExpense = async () => { calls.push(['promote']); };
  homeRecordsService.trash = async (args) => { calls.push(['trash', args]); state.record.lifecycleStatus = 'TRASHED'; };
  homeRecordsService.create = async (args) => { calls.push(['create', args]); return { record: { id: 'r1' } }; };
  homeRecordsService.addLink = async (args) => { calls.push(['link', args]); };
  InventoryDraftService.prototype.dismissDraft = async () => { calls.push(['dismissDraft']); };
  InventoryDraftService.prototype.confirmDraftToInventoryItem = async () => { calls.push(['confirmDraft']); return { id: 'item-1' }; };
  labelScan.scanLabelToDraft = async () => { calls.push(['ocr']); return { draft: { id: 'd1' } }; };
  inspection.ingestInspectionReport = async (args) => { calls.push(['ingest', args]); return { reportId: 'rep1', findingCount: 3 }; };
}
const names = () => calls.map((call) => call[0]);

test('a reading points to a kind only when it is confident and the file can be that kind', () => {
  const read = (documentType, confidence, mime = 'application/pdf') => intake.classifyReading({ documentType, confidence }, mime);
  assert.equal(read('RECEIPT', 0.9).kind, 'RECEIPT');
  assert.equal(read('INVOICE', 0.9).kind, 'RECEIPT');
  assert.equal(read('INSURANCE', 0.9).kind, 'INSURANCE_POLICY');
  assert.equal(read('WARRANTY', 0.6).kind, 'WARRANTY');
  assert.equal(read('WARRANTY', 0.59).kind, null, 'below the floor the person is asked');
  assert.equal(read('UNKNOWN', 0.99).kind, null);
  assert.match(read('MANUAL', 0.99).reason, /manual/);
  assert.equal(read('INSPECTION', 0.9).kind, 'INSPECTION_REPORT');
  assert.equal(read('INSPECTION', 0.9, 'image/jpeg').kind, null, 'an inspection report has to be a PDF');
});

test('the kinds offered match the file: a PDF is never offered as a label, and an inspection is never offered for a photo', async () => {
  install();
  const view = await intake.analyzeAskIntake(ctx, 'r1', { kind: 'AUTO', acknowledgedProcessing: true }).then(() => null);
  void view;
  install();
  documentIntelligenceService.analyzeDocument = async () => ({ documentType: 'UNKNOWN', confidence: 0.2, extractedData: {}, suggestedActions: [] });
  const pdf = await intake.analyzeAskIntake(ctx, 'r1', { kind: 'AUTO', acknowledgedProcessing: true });
  assert.ok(pdf.choice);
  assert.ok(!pdf.choice.options.some((option) => option.kind === 'APPLIANCE_LABEL'));
  install({ record: { currentVersion: version({ mimeType: 'image/jpeg' }) } });
  documentIntelligenceService.analyzeDocument = async () => ({ documentType: 'UNKNOWN', confidence: 0.2, extractedData: {}, suggestedActions: [] });
  const photo = await intake.analyzeAskIntake(ctx, 'r1', { kind: 'AUTO', acknowledgedProcessing: true });
  assert.ok(photo.choice.options.some((option) => option.kind === 'APPLIANCE_LABEL'));
  assert.ok(!photo.choice.options.some((option) => option.kind === 'INSPECTION_REPORT'));
});

test('nothing is sent to a model until the disclosure is acknowledged; a label is read locally and needs none', async () => {
  install();
  for (const kind of [undefined, 'AUTO', 'RECEIPT', 'INSPECTION_REPORT']) {
    await assert.rejects(() => intake.analyzeAskIntake(ctx, 'r1', { kind }), (error) => error.code === 'ASK_INTAKE_DISCLOSURE_NOT_ACKNOWLEDGED', String(kind));
  }
  assert.deepEqual(names(), [], 'no download, no model call, no write');
  install({ record: { currentVersion: version({ mimeType: 'image/png' }) } });
  const view = await intake.analyzeAskIntake(ctx, 'r1', { kind: 'APPLIANCE_LABEL' });
  assert.ok(names().includes('ocr'));
  assert.ok(!names().includes('model'), 'a label is never sent to the AI service');
  assert.deepEqual(view.provenance.reader, { status: 'AVAILABLE', value: { kind: 'LOCAL_OCR', name: 'Text recognition on our server' } });
  assert.equal(view.kind, 'APPLIANCE_LABEL');
});

test('an unconfident or unreadable reading asks one question and writes nothing', async () => {
  install();
  documentIntelligenceService.analyzeDocument = async () => ({ documentType: 'RECEIPT', confidence: 0.3, extractedData: {}, suggestedActions: [] });
  const view = await intake.analyzeAskIntake(ctx, 'r1', { kind: 'AUTO', acknowledgedProcessing: true });
  assert.match(view.choice.reason, /not sure/);
  assert.ok(view.choice.options.length >= 3);
  assert.ok(!names().includes('record.update'), 'the record type is unchanged');
  assert.ok(!names().includes('extract'));
  install();
  documentIntelligenceService.analyzeDocument = async () => ({ documentType: 'UNKNOWN', confidence: 0, extractedData: {}, suggestedActions: ['Manual review required - AI response format was invalid'] });
  const unreadable = await intake.analyzeAskIntake(ctx, 'r1', { kind: 'AUTO', acknowledgedProcessing: true });
  assert.match(unreadable.choice.reason, /could not read/);
  assert.ok(!names().includes('extract'));
});

test('a confident reading is used for the extraction, so one file costs one model call', async () => {
  install();
  const view = await intake.analyzeAskIntake(ctx, 'r1', { kind: 'AUTO', acknowledgedProcessing: true });
  assert.equal(calls.filter((call) => call[0] === 'model').length, 1);
  const extract = calls.find((call) => call[0] === 'extract')[1];
  assert.equal(extract.insights.documentType, 'RECEIPT');
  assert.equal(calls.find((call) => call[0] === 'record.update')[1].recordType, 'RECEIPT');
  assert.equal(view.kind, 'RECEIPT');
  const explicit = (install(), await intake.analyzeAskIntake(ctx, 'r1', { kind: 'WARRANTY', acknowledgedProcessing: true }));
  assert.equal(explicit.kind, 'WARRANTY');
  assert.equal(calls.find((call) => call[0] === 'extract')[1].insights, undefined, 'a chosen kind lets the extraction read the file itself');
});

test('an inspection report needs its type and date, keeps the one stored original, and creates a report to review', async () => {
  install();
  const asked = await intake.analyzeAskIntake(ctx, 'r1', { kind: 'INSPECTION_REPORT', acknowledgedProcessing: true });
  assert.ok(asked.needsDetails);
  assert.ok(!names().includes('ingest'));
  await assert.rejects(() => intake.analyzeAskIntake(ctx, 'r1', { kind: 'INSPECTION_REPORT', acknowledgedProcessing: true, inspection: { reportType: 'GENERAL', inspectionDate: 'not a date' } }), (error) => error.code === 'ASK_INTAKE_INSPECTION_DETAILS_INVALID');
  await assert.rejects(() => intake.analyzeAskIntake(ctx, 'r1', { kind: 'INSPECTION_REPORT', acknowledgedProcessing: true, inspection: { reportType: 'GENERAL', inspectionDate: '2999-01-01' } }), (error) => error.code === 'ASK_INTAKE_INSPECTION_DETAILS_INVALID', 'a future date is refused');
  state.report = null;
  await intake.analyzeAskIntake(ctx, 'r1', { kind: 'INSPECTION_REPORT', acknowledgedProcessing: true, inspection: { reportType: 'PRE_PURCHASE', inspectionDate: '2026-09-01' } });
  const ingest = calls.find((call) => call[0] === 'ingest')[1];
  assert.equal(ingest.existingSourceFileKey, 'k/receipt.pdf', 'the original is not uploaded a second time');
  assert.equal(ingest.sourceEntityType, 'PROPERTY_RECORD');
  assert.equal(ingest.sourceEntityId, 'r1');
  install({ record: { currentVersion: version({ mimeType: 'image/jpeg' }) } });
  await assert.rejects(() => intake.analyzeAskIntake(ctx, 'r1', { kind: 'INSPECTION_REPORT', acknowledgedProcessing: true }), (error) => error.code === 'ASK_INTAKE_KIND_NOT_FOR_FILE');
});

test('reading an already-read file shows what exists instead of reading it again', async () => {
  install({ record: { recordType: 'RECEIPT', currentVersion: version({ extractedFacts: [fact('description', 'Water heater')] }) } });
  const view = await intake.analyzeAskIntake(ctx, 'r1', { kind: 'AUTO', acknowledgedProcessing: true });
  assert.equal(view.state, 'REVIEW');
  assert.deepEqual(names(), []);
});

test('candidates carry confidence, citation and the person\'s correction; required details that are missing or rejected are named', async () => {
  install({ record: { recordType: 'RECEIPT', currentVersion: version({ extractedFacts: [
    fact('_documentType', 'RECEIPT', { confidence: 0.92 }),
    fact('description', 'Water heater'),
    fact('amount', '1200', { reviewStatus: 'REJECTED', reviewedValue: null }),
    fact('transactionDate', '2026-09-30', { reviewStatus: 'CORRECTED', reviewedValue: '2026-09-29' }),
  ] }) } });
  const view = await intake.getAskIntake(ctx, 'r1');
  assert.equal(view.state, 'REVIEW');
  assert.equal(view.candidates.length, 3, 'the classification row is informational, not a candidate');
  const date = view.candidates.find((candidate) => candidate.fieldKey === 'transactionDate');
  assert.equal(date.effectiveValue, '2026-09-29');
  assert.equal(date.label, 'Date');
  assert.equal(view.candidates.find((candidate) => candidate.fieldKey === 'amount').effectiveValue, null);
  assert.deepEqual(view.missingRequired, ['Amount']);
  assert.equal(view.classification.confidence, 0.92);
  assert.equal(view.provenance.pageAndRegion.status, 'NOT_RECORDED');
  assert.match(view.provenance.pageAndRegion.reason, /do not say where/);
  assert.equal(view.provenance.original.sha256, 'abc');
  assert.equal(view.provenance.reader.status, 'AVAILABLE');
});

test('rejecting every detail writes nothing: no promotion, and the state stays in review', async () => {
  install({ record: { recordType: 'WARRANTY', currentVersion: version({ extractedFacts: [fact('providerName', 'Acme', { reviewStatus: 'REJECTED' }), fact('startDate', '2026-01-01', { reviewStatus: 'REJECTED' }), fact('expiryDate', '2030-01-01', { reviewStatus: 'REJECTED' })] }) } });
  const view = await intake.reviewAskIntakeCandidate(ctx, 'r1', 'f-providerName', { action: 'REJECT' });
  assert.equal(view.state, 'REVIEW');
  assert.equal(view.result, null);
  assert.deepEqual(view.missingRequired, ['Provider', 'Start date', 'End date']);
  assert.deepEqual(names(), ['review'], 'only the review decision was recorded; no canonical write');
});

test('a promoted detail completes the file and names what was created', async () => {
  install({ record: { recordType: 'RECEIPT', currentVersion: version({ extractedFacts: [fact('description', 'Water heater', { promotedEntityId: 'exp-1', promotedEntityType: 'EXPENSE', reviewStatus: 'CONFIRMED' })] }) } });
  const view = await intake.getAskIntake(ctx, 'r1');
  assert.equal(view.state, 'COMPLETED');
  assert.deepEqual(view.result, { entityType: 'EXPENSE', entityId: 'exp-1' });
  await assert.rejects(() => intake.discardAskIntake(ctx, 'r1'), (error) => error.code === 'ASK_INTAKE_ALREADY_USED');
  assert.ok(!names().includes('trash'));
});

test('a label becomes a draft; confirming creates the item and links the original, rejecting leaves inventory alone', async () => {
  install({ record: { recordType: 'PHOTO', currentVersion: version({ mimeType: 'image/png' }) }, draft: { id: 'd1', status: 'DRAFT', manufacturer: 'Rheem', modelNumber: 'XE50', serialNumber: null, upc: null, sku: null, confidenceJson: { manufacturer: 0.8 }, sessionId: 's1' } });
  let view = await intake.getAskIntake(ctx, 'r1');
  assert.equal(view.kind, 'APPLIANCE_LABEL');
  assert.equal(view.state, 'REVIEW');
  assert.deepEqual(view.labelDraft.fields.find((field) => field.key === 'manufacturer'), { key: 'manufacturer', label: 'Brand', value: 'Rheem', confidence: 0.8 });
  assert.equal(view.labelDraft.fields.find((field) => field.key === 'serialNumber').value, null);
  await intake.confirmAskIntakeLabel(ctx, 'r1');
  assert.deepEqual(names(), ['confirmDraft', 'link']);
  const link = calls.find((call) => call[0] === 'link')[1];
  assert.equal(link.entityType, 'INVENTORY_ITEM');
  assert.equal(link.entityId, 'item-1');
  install({ record: { recordType: 'PHOTO' }, draft: { id: 'd1', status: 'DRAFT', confidenceJson: {} } });
  await intake.dismissAskIntakeLabel(ctx, 'r1');
  assert.deepEqual(names(), ['dismissDraft']);
});

test('discarding an unused file dismisses its draft and moves it to the recoverable trash', async () => {
  install({ record: { recordType: 'PHOTO' }, draft: { id: 'd1', status: 'DRAFT', confidenceJson: {} } });
  const view = await intake.discardAskIntake(ctx, 'r1');
  assert.deepEqual(names(), ['dismissDraft', 'trash']);
  assert.equal(view.state, 'DISCARDED');
  install({ record: { recordType: 'INSPECTION_REPORT' }, report: { id: 'rep1', status: 'REVIEW_PENDING', totalFindings: 4 } });
  await assert.rejects(() => intake.discardAskIntake(ctx, 'r1'), (error) => error.code === 'ASK_INTAKE_ALREADY_USED');
});

test('adding a file keeps the original as an unplaced Home Record first and validates type, size and sensitivity', async () => {
  install();
  const file = (overrides = {}) => ({ buffer: Buffer.from('x'), originalname: 'Policy 2026.pdf', mimetype: 'application/pdf', size: 1200, ...overrides });
  await intake.stageAskIntakeFile(ctx, file(), { sensitivity: 'INSURANCE' });
  const create = calls.find((call) => call[0] === 'create')[1];
  assert.equal(create.recordType, 'OTHER');
  assert.equal(create.title, 'Policy 2026');
  assert.equal(create.sensitivity, 'INSURANCE');
  for (const [bad, options, code] of [[file({ mimetype: 'application/zip' }), {}, 'ASK_INTAKE_TYPE_UNSUPPORTED'], [file({ size: 11 * 1024 * 1024 }), {}, 'ASK_INTAKE_TOO_LARGE'], [file(), { sensitivity: 'PUBLIC' }, 'ASK_INVALID_REQUEST']]) {
    await assert.rejects(() => intake.stageAskIntakeFile(ctx, bad, options), (error) => error.code === code, code);
  }
});

test('every kind is declared with how it is read, and the disclosures cover retention, sharing, model use and confirmation', () => {
  assert.deepEqual(ASK_INTAKE_KIND_OPTIONS.map((option) => option.kind).sort(), ['APPLIANCE_LABEL', 'INSPECTION_REPORT', 'INSURANCE_POLICY', 'RECEIPT', 'WARRANTY']);
  assert.equal(ASK_INTAKE_KIND_OPTIONS.find((option) => option.kind === 'APPLIANCE_LABEL').readsWith, 'LOCAL_OCR');
  assert.deepEqual(Object.keys(ASK_INTAKE_DISCLOSURES).sort(), ['confirmation', 'localProcessing', 'modelProcessing', 'retention', 'sharing']);
  assert.match(ASK_INTAKE_DISCLOSURES.modelProcessing, /Nothing is sent until you choose/);
});

test('every intake route is property-scoped behind a contributor floor, and the upload is validated before it is stored', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../../src/routes/ask.routes.ts'), 'utf8');
  const lines = routes.split('\n').filter((line) => line.includes('/properties/:propertyId/intake/'));
  assert.equal(lines.length, 9);
  for (const line of lines) assert.match(line, /\.\.\.intakeContributor/, line);
  const upload = lines.find((line) => line.includes('/intake/files'));
  assert.ok(upload.indexOf('uploadRateLimiter') < upload.indexOf('intakeUpload.single') && upload.indexOf('intakeUpload.single') < upload.indexOf('validateDocumentUpload') && upload.indexOf('validateDocumentUpload') < upload.indexOf('postAskIntakeFile'));
  assert.match(routes, /const intakeContributor = \[propertyAuthMiddleware, requireHouseholdRole\('CONTRIBUTOR'\)\]/);
});
