const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Quote extraction for Home Records (design §3.2, §3.7, §3.9; FRD v1.361). No model call, database or storage.
const quote = require('../../src/services/serviceQuoteExtraction.ts');
const { validateExtractionEnvelope } = require('../../src/services/intelligence/extractionEnvelope.contract.ts');

const goodReply = (over = {}) => JSON.stringify({
  documentKind: 'QUOTE', confidence: 0.9, provider: { name: 'Acme HVAC', licenseNumber: 'L-123' }, totalAmount: 8200, currency: 'usd',
  quoteDate: '2026-09-01T00:00:00Z', expirationDate: '2026-10-01', serviceCategory: 'hvac', serviceLocation: 'Basement', scopeKind: 'replacement', scopeSummary: 'Replace furnace',
  lineItems: [
    { kind: 'equipment', description: 'Furnace unit', quantity: 1, unit: 'ea', unitPrice: 6000, total: 6000, sourceText: 'Furnace 96% AFUE', sourcePage: 1 },
    { kind: 'LABOR', description: 'Installation', total: 2200 },
    { description: '' },
    'not an object',
  ],
  terms: [{ type: 'warranty', value: '10 years parts', included: true, sourcePage: 2 }, { type: 'PAYMENT', value: '' }],
  ...over,
});

test('a valid reply is parsed, normalised and bounded; unreadable entries are dropped and counted, not kept', () => {
  const parse = quote.parseServiceQuoteResponse(`\`\`\`json\n${goodReply()}\n\`\`\``);
  assert.equal(parse.status, 'PARSED');
  const e = parse.extraction;
  assert.equal(e.documentKind, 'QUOTE');
  assert.equal(e.currency, 'USD');
  assert.equal(e.quoteDate, '2026-09-01');
  assert.equal(e.serviceCategory, 'HVAC');
  assert.equal(e.scopeKind, 'REPLACEMENT');
  assert.deepEqual(e.lineItems.map((i) => [i.kind, i.description]), [['EQUIPMENT', 'Furnace unit'], ['LABOR', 'Installation']]);
  assert.equal(e.droppedLineItems, 2);
  assert.deepEqual(e.terms.map((t) => [t.type, t.value]), [['WARRANTY', '10 years parts']]);
  assert.equal(e.droppedTerms, 1);
});

test('an empty, non-JSON or off-schema reply fails; it never becomes an empty quote', () => {
  for (const reply of [null, '', '   ', 'I could not read this', '[1,2]', '"text"']) {
    assert.equal(quote.parseServiceQuoteResponse(reply).status, 'FAILED', String(reply));
  }
  const envelope = quote.serviceQuoteToExtractionEnvelope(quote.parseServiceQuoteResponse('nope'));
  assert.equal(envelope.parseStatus, 'FAILED');
  assert.equal(envelope.fields.length, 0);
  assert.deepEqual(validateExtractionEnvelope(envelope), []);
  const overCap = quote.parseServiceQuoteResponse(goodReply({ lineItems: Array.from({ length: 130 }, (_, i) => ({ description: `Item ${i}`, total: 1 })) }));
  assert.equal(overCap.extraction.lineItems.length, 100);
  assert.equal(overCap.extraction.droppedLineItems, 30);
});

test('a label alone is never enough: a quote needs a provider and a price, and a confident classification', () => {
  const parsed = (over) => quote.parseServiceQuoteResponse(goodReply(over)).extraction;
  assert.deepEqual(quote.quoteMinimumEvidence(parsed({})), { sufficient: true, classifiedAsQuote: true, missing: [] });
  assert.deepEqual(quote.quoteMinimumEvidence(parsed({ provider: { name: null, licenseNumber: null } })).missing, ['provider name']);
  const noPrice = quote.quoteMinimumEvidence(parsed({ totalAmount: null, lineItems: [{ description: 'Something' }] }));
  assert.deepEqual(noPrice.missing, ['a total or a priced line item']);
  assert.equal(noPrice.sufficient, false);
  assert.equal(quote.quoteMinimumEvidence(parsed({ totalAmount: null })).sufficient, true, 'a priced line item can stand for the total');
  assert.equal(quote.quoteMinimumEvidence(parsed({ documentKind: 'INVOICE' })).classifiedAsQuote, false);
  assert.equal(quote.quoteMinimumEvidence(parsed({ confidence: 0.3 })).classifiedAsQuote, false);
  assert.equal(quote.quoteMinimumEvidence(parsed({ documentKind: 'nonsense' })).classifiedAsQuote, false, 'an unknown kind is not a quote');
});

test('candidates carry the headline facts, every line item and every term, with their pages, and the envelope validates', () => {
  const parse = quote.parseServiceQuoteResponse(goodReply());
  const candidates = quote.serviceQuoteCandidates(parse.extraction);
  const byKey = Object.fromEntries(candidates.map((c) => [c.fieldKey, c]));
  assert.equal(byKey.vendorName.proposedValue, 'Acme HVAC');
  assert.equal(byKey.quoteAmount.proposedValue, '8200');
  assert.equal(byKey.quoteDate.proposedValue, '2026-09-01');
  assert.ok(byKey['lineItem:001'] && byKey['lineItem:002'] && byKey['term:001']);
  assert.deepEqual(JSON.parse(byKey['lineItem:001'].proposedValue), { kind: 'EQUIPMENT', description: 'Furnace unit', quantity: 1, unit: 'ea', unitPrice: 6000, total: 6000 });
  assert.match(byKey['lineItem:001'].sourceCitation, /page 1.*Furnace 96% AFUE/);
  assert.match(byKey['term:001'].sourceCitation, /page 2/);
  const envelope = quote.serviceQuoteToExtractionEnvelope(parse, { documentVersionId: 'v-1', modelId: 'm' });
  assert.deepEqual(validateExtractionEnvelope(envelope), []);
  assert.equal(envelope.candidateEntityType, 'SERVICE_QUOTE');
  assert.equal(envelope.documentVersionId, 'v-1');
  assert.ok(envelope.warnings.length >= 2, 'dropped entries are reported');
});

// ── runExtraction routing ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
let versionForRecord = null;
const createManyCalls = [];
let analyzeQuoteReply = null;
let analyzeQuoteCalls = 0;
let generalCalls = 0;
const prismaMock = {
  propertyRecord: { findFirst: async () => ({ id: 'r1' }) },
  propertyRecordVersion: { findFirst: async () => versionForRecord },
  extractedFactCandidate: {
    findMany: async () => (createManyCalls.length ? createManyCalls[createManyCalls.length - 1].data.map((row, i) => ({ id: `c${i}`, ...row })) : []),
    createMany: async (args) => { createManyCalls.push(args); return { count: args.data.length }; },
  },
};
const mockModule = (path, exports) => { const resolved = require.resolve(path); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports }; };
mockModule('../../src/lib/prisma.ts', { prisma: prismaMock });
mockModule('../../src/services/storage/reportStorage.ts', { downloadObjectBuffer: async () => Buffer.from('pdf') });
mockModule('../../src/services/documentIntelligence.service.ts', {
  documentIntelligenceService: {
    analyzeDocument: async () => { generalCalls += 1; return { documentType: 'UNKNOWN', confidence: 0, extractedData: {}, suggestedActions: ['x'] }; },
    analyzeServiceQuote: async () => { analyzeQuoteCalls += 1; return { ...quote.parseServiceQuoteResponse(analyzeQuoteReply), modelId: 'model-1' }; },
  },
});
mockModule('../../src/services/insurancePolicyRecord.service.ts', { stageExtractedPolicyTerm: async () => ({}) });
mockModule('../../src/propertyChanges/propertyChange.service.ts', { emitPropertyChangeWithTransaction: async () => ({}) });
mockModule('../../src/services/decisionPlatform/outcomeObservationService.ts', { recordDocumentPromotionOutcome: async () => ({}) });
mockModule('../../src/modules/homeOperations/adapters/propertyRecord.adapter.ts', { syncPropertyRecordWorkItem: async () => undefined });

const { HomeRecordsExtractionService } = require('../../src/services/homeRecordsExtraction.service.ts');
const service = new HomeRecordsExtractionService();
process.env.S3_BUCKET = 'bucket-1';
const forType = (recordType) => { versionForRecord = { id: 'ver-1', storageKey: 'k', mimeType: 'application/pdf', originalFileName: 'quote.pdf', scanStatus: 'CLEAN', record: { lifecycleStatus: 'ACTIVE', recordType } }; };
const run = () => service.runExtraction({ role: 'OWNER', propertyId: 'p1', recordId: 'r1', versionId: 'ver-1' });

test('a QUOTE record is extracted with the quote contract, not the general analyzer, and stores reviewable candidates', async () => {
  forType('QUOTE'); analyzeQuoteReply = goodReply(); createManyCalls.length = 0; generalCalls = 0; analyzeQuoteCalls = 0;
  const rows = await run();
  assert.equal(analyzeQuoteCalls, 1);
  assert.equal(generalCalls, 0);
  const keys = createManyCalls[0].data.map((row) => row.fieldKey);
  assert.ok(keys.includes('_documentType') && keys.includes('vendorName') && keys.includes('lineItem:001') && keys.includes('term:001'));
  assert.ok(createManyCalls[0].data.every((row) => row.targetDomain === 'SERVICE_QUOTE'));
  assert.ok(rows.length > 0);
});

test('an existing CONTRACT or OTHER record is accepted only when the file reads as a quote', async () => {
  for (const type of ['CONTRACT', 'OTHER']) {
    forType(type); analyzeQuoteReply = goodReply(); createManyCalls.length = 0;
    assert.ok((await run()).length > 0, type);
    forType(type); analyzeQuoteReply = goodReply({ documentKind: 'CONTRACT' }); createManyCalls.length = 0;
    await assert.rejects(run, (e) => e.code === 'PROPERTY_RECORD_EXTRACTION_NOT_A_QUOTE', type);
    assert.equal(createManyCalls.length, 0, 'a refusal stores nothing, so the type can be corrected and tried again');
  }
});

test('an invoice is refused without a model call; an unreadable reply and a low-confidence label are refused and store nothing', async () => {
  forType('INVOICE'); analyzeQuoteCalls = 0; createManyCalls.length = 0;
  await assert.rejects(run, (e) => e.code === 'PROPERTY_RECORD_EXTRACTION_INVOICE_NOT_QUOTE');
  assert.equal(analyzeQuoteCalls, 0);
  forType('QUOTE'); analyzeQuoteReply = 'not json';
  await assert.rejects(run, (e) => e.code === 'PROPERTY_RECORD_EXTRACTION_UNREADABLE');
  analyzeQuoteReply = goodReply({ confidence: 0.2 });
  await assert.rejects(run, (e) => e.code === 'PROPERTY_RECORD_EXTRACTION_NOT_A_QUOTE');
  assert.equal(createManyCalls.length, 0);
});

test('a quote missing a required fact is stored with what was found; the import, not extraction, refuses to build from it', async () => {
  forType('QUOTE'); createManyCalls.length = 0;
  analyzeQuoteReply = goodReply({ provider: { name: null, licenseNumber: null } });
  const rows = await run();
  assert.ok(rows.length > 0);
  assert.ok(!createManyCalls[0].data.some((row) => row.fieldKey === 'vendorName'));
  assert.ok(createManyCalls[0].data.some((row) => row.fieldKey === 'quoteAmount'));
});
