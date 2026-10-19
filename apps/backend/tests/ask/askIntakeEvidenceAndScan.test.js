const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

require('ts-node/register');
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-placeholder-key';

const evidence = require('../../src/services/documentLocationEvidence.ts');
const scan = require('../../src/services/contentScan.service.ts');
const { documentInsightsToExtractionEnvelope } = require('../../src/services/documentIntelligenceExtractionEnvelope.adapter.ts');

test('a reported page must be a whole 1-based page and a box four ordered numbers on the 0-1000 scale', () => {
  assert.equal(evidence.sanitizePage(2), 2);
  for (const bad of [0, -1, 1.5, '2', null, 99999]) assert.equal(evidence.sanitizePage(bad), null, String(bad));
  assert.deepEqual(evidence.sanitizeBox([100, 50, 140.4, 400]), [100, 50, 140, 400]);
  for (const bad of [[1, 2, 3], [10, 10, 5, 20], [0, 0, 0, 0], [-1, 0, 5, 5], [0, 0, 1001, 5], ['a', 0, 5, 5], 'box', null]) assert.equal(evidence.sanitizeBox(bad), null, JSON.stringify(bad));
});

test('a value is found on the page that really contains it, in any common spelling of a number or date', () => {
  const pages = ['Welcome\nInvoice total due', 'Water heater installed on September 30, 2026\nTotal: $1,200.00\nProvider: Acme Plumbing'];
  assert.equal(evidence.locateValueInPages(pages, 'Acme Plumbing').page, 2);
  assert.equal(evidence.locateValueInPages(pages, 1200).page, 2, '1200 is found as $1,200.00');
  assert.equal(evidence.locateValueInPages(pages, '2026-09-30').page, 2, 'an ISO date is found as a written date');
  assert.equal(evidence.locateValueInPages(pages, 'not in the document'), null);
  const found = evidence.locateValueInPages(pages, 'Acme Plumbing');
  assert.equal(found.basis, 'TEXT_MATCH');
  assert.match(found.excerpt, /Acme Plumbing/);
  assert.equal(evidence.locateValueInPages(pages, 'x'), null, 'a one-character value matches everything and is never trusted');
});

test('a text match is trusted over the reader; the reader\'s claim is kept only when it agrees or there is no text to check', () => {
  const pages = ['one', 'The policy number is HO-12345 here'];
  const box = [100, 100, 200, 500];
  const agreed = evidence.resolveLocation(pages, 'HO-12345', { page: 2, box });
  assert.deepEqual([agreed.page, agreed.box, agreed.basis], [2, box, 'TEXT_MATCH']);
  const disagreed = evidence.resolveLocation(pages, 'HO-12345', { page: 1, box });
  assert.deepEqual([disagreed.page, disagreed.box], [2, null], 'the page is the checked one and the box for another page is dropped');
  assert.equal(evidence.resolveLocation(pages, 'HO-99999', { page: 1, box }), null, 'with a text layer, a value that is not in it gets no location at all');
  const scanned = evidence.resolveLocation([], 'HO-12345', { page: 1, box });
  assert.deepEqual([scanned.page, scanned.box, scanned.basis, scanned.excerpt], [1, box, 'MODEL_REPORTED', null]);
  assert.equal(evidence.resolveLocation([], 'HO-12345', null), null);
  assert.equal(evidence.resolveLocation([], 'HO-12345', { page: null, box: null }), null);
});

test('locations read as plain words and the excerpt hash ignores case and spacing', () => {
  assert.equal(evidence.describeLocation({ page: 2, box: [100, 50, 140, 400] }), 'Page 2, upper left');
  assert.equal(evidence.describeLocation({ page: 1, box: [800, 700, 950, 980] }), 'Page 1, lower right');
  assert.equal(evidence.describeLocation({ page: 3, box: [400, 400, 600, 600] }), 'Page 3, center');
  assert.equal(evidence.describeLocation({ page: 3, box: null }), 'Page 3');
  assert.equal(evidence.describeLocation({ page: null, box: null }), '');
  assert.equal(evidence.excerptHash('Total:  $1,200'), evidence.excerptHash(' total: $1,200 '));
  assert.notEqual(evidence.excerptHash('Total: $1,200'), evidence.excerptHash('Total: $1,300'));
});

test('the document reading carries the reader\'s locations into the envelope as unverified evidence', () => {
  const insights = { documentType: 'RECEIPT', confidence: 0.9, extractedData: { vendor: 'Acme', amount: 1200 }, suggestedActions: [], fieldLocations: { vendor: { page: 2, box: [10, 10, 50, 300] } } };
  const envelope = documentInsightsToExtractionEnvelope(insights);
  const vendor = envelope.fields.find((field) => field.fieldKey === 'vendor');
  assert.deepEqual(vendor.evidence, { page: 2, box: [10, 10, 50, 300], basis: 'MODEL_REPORTED' });
  assert.equal(envelope.fields.find((field) => field.fieldKey === 'amount').evidence, undefined, 'no location is invented for a field the reader did not locate');
});

test('clamd replies are read exactly: OK is clean, FOUND names the signature, anything else is an error', () => {
  assert.deepEqual(scan.parseClamdReply('stream: OK\0'), { status: 'CLEAN' });
  assert.deepEqual(scan.parseClamdReply('stream: Win.Test.EICAR_HDB-1 FOUND\0'), { status: 'REJECTED', signature: 'Win.Test.EICAR_HDB-1' });
  assert.equal(scan.parseClamdReply('INSTREAM size limit exceeded. ERROR\0').status, 'ERROR');
  assert.equal(scan.parseClamdReply('').status, 'ERROR');
});

function fakeClamd(reply) {
  return new Promise((resolve) => {
    const received = [];
    const server = net.createServer((socket) => {
      let data = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        data = Buffer.concat([data, chunk]);
        if (data.length >= 4 && data.subarray(data.length - 4).equals(Buffer.alloc(4))) { received.push(data); socket.end(reply); }
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, received, close: () => new Promise((done) => server.close(done)) }));
  });
}

test('without an engine the upload is UNSCANNED and the product says so; with one it is scanned and never skipped', async () => {
  delete process.env.CLAMAV_HOST;
  assert.equal(scan.contentScanEngine(), 'NONE');
  assert.match(scan.contentScanStatement(), /No antivirus engine is connected/);
  assert.deepEqual(await scan.scanContent(Buffer.from('hello')), { status: 'UNSCANNED', engine: 'NONE' });

  const clean = await fakeClamd('stream: OK\0');
  process.env.CLAMAV_HOST = '127.0.0.1';
  process.env.CLAMAV_PORT = String(clean.port);
  try {
    assert.equal(scan.contentScanEngine(), 'CLAMD');
    assert.match(scan.contentScanStatement(), /scanned by an antivirus engine/);
    assert.deepEqual(await scan.scanContent(Buffer.from('hello')), { status: 'CLEAN', engine: 'CLAMD' });
    assert.ok(clean.received[0].toString('latin1').startsWith('zINSTREAM\0'), 'the file is streamed to the engine');
    assert.ok(clean.received[0].includes(Buffer.from('hello')));
  } finally { await clean.close(); }

  const infected = await fakeClamd('stream: Eicar-Test-Signature FOUND\0');
  process.env.CLAMAV_PORT = String(infected.port);
  try { assert.deepEqual(await scan.scanContent(Buffer.from('x')), { status: 'REJECTED', engine: 'CLAMD', signature: 'Eicar-Test-Signature' }); } finally { await infected.close(); }

  const broken = await fakeClamd('INSTREAM size limit exceeded. ERROR\0');
  process.env.CLAMAV_PORT = String(broken.port);
  try { await assert.rejects(() => scan.scanContent(Buffer.from('x')), (error) => error.code === 'ASK_INTAKE_SCAN_UNAVAILABLE' && error.statusCode === 503); } finally { await broken.close(); }

  process.env.CLAMAV_PORT = '1';
  await assert.rejects(() => scan.scanContent(Buffer.from('x')), (error) => error.code === 'ASK_INTAKE_SCAN_UNAVAILABLE', 'a configured engine that cannot be reached fails closed');
  delete process.env.CLAMAV_HOST;
  delete process.env.CLAMAV_PORT;
});

test('the upload middleware refuses a flagged file before anything is stored, and passes a clean or unscanned one on', async () => {
  const run = async (file) => {
    let nextCalled = null;
    let status = null;
    let body = null;
    const res = { status(code) { status = code; return this; }, json(payload) { body = payload; return this; } };
    await scan.scanIntakeUpload({ file }, res, (error) => { nextCalled = error ?? true; });
    return { nextCalled, status, body };
  };
  delete process.env.CLAMAV_HOST;
  assert.deepEqual((await run({ buffer: Buffer.from('x') })).nextCalled, true);
  assert.deepEqual((await run(undefined)).nextCalled, true);
  const infected = await fakeClamd('stream: Eicar-Test-Signature FOUND\0');
  process.env.CLAMAV_HOST = '127.0.0.1';
  process.env.CLAMAV_PORT = String(infected.port);
  try {
    const result = await run({ buffer: Buffer.from('x') });
    assert.equal(result.nextCalled, null, 'the request never reaches storage');
    assert.equal(result.status, 422);
    assert.equal(result.body.error.code, 'ASK_INTAKE_MALWARE_DETECTED');
    assert.ok(!JSON.stringify(result.body).includes('Eicar'), 'the signature name is not exposed');
  } finally { await infected.close(); delete process.env.CLAMAV_HOST; delete process.env.CLAMAV_PORT; }
  process.env.CLAMAV_HOST = '127.0.0.1';
  process.env.CLAMAV_PORT = '1';
  const unavailable = await run({ buffer: Buffer.from('x') });
  assert.equal(unavailable.nextCalled.code, 'ASK_INTAKE_SCAN_UNAVAILABLE');
  delete process.env.CLAMAV_HOST; delete process.env.CLAMAV_PORT;
});

test('extraction stores each detail\'s page, place and excerpt hash; a located detail and an unlocated one are told apart', async () => {
  const { prisma } = require('../../src/lib/prisma.ts');
  const storage = require('../../src/services/storage/reportStorage.ts');
  const { documentIntelligenceService } = require('../../src/services/documentIntelligence.service.ts');
  const { homeRecordsExtractionService } = require('../../src/services/homeRecordsExtraction.service.ts');
  process.env.S3_BUCKET = 'bucket';
  const created = [];
  prisma.propertyRecordVersion = { findFirst: async () => ({ id: 'v1', recordId: 'r1', mimeType: 'application/pdf', originalFileName: 'receipt.pdf', storageKey: 'k', scanStatus: 'CLEAN', record: { recordType: 'RECEIPT', lifecycleStatus: 'ACTIVE' } }) };
  prisma.extractedFactCandidate = { findMany: async () => (created.length ? created[0] : []), createMany: async ({ data }) => { created.push(data); return { count: data.length }; } };
  storage.downloadObjectBuffer = async () => Buffer.from('%PDF');
  evidence.pdfPageTexts = async () => ['cover page', 'Paid to Acme Plumbing\nTotal: $1,200.00\nDate: September 30, 2026'];
  const insights = {
    documentType: 'RECEIPT', confidence: 0.9, suggestedActions: [],
    extractedData: { vendor: 'Acme Plumbing', amount: 1200, purchaseDate: new Date('2026-09-30T00:00:00Z'), category: 'ROOFING' },
    fieldLocations: { vendor: { page: 2, box: [100, 50, 140, 400] }, category: { page: 1, box: null } },
  };
  documentIntelligenceService.analyzeDocument = async () => { throw new Error('the reading is passed in, the model is not called again'); };
  await homeRecordsExtractionService.runExtraction({ propertyId: 'p1', recordId: 'r1', versionId: 'v1', role: 'CONTRIBUTOR', insights });
  const rows = Object.fromEntries(created[0].map((row) => [row.fieldKey, row]));
  assert.equal(rows.description.sourcePage, 2);
  assert.deepEqual(rows.description.sourceRegionJson, { box: [100, 50, 140, 400], excerpt: rows.description.sourceRegionJson.excerpt, basis: 'TEXT_MATCH' });
  assert.match(rows.description.sourceRegionJson.excerpt, /Acme Plumbing/);
  assert.equal(rows.description.sourceExcerptHash, evidence.excerptHash(rows.description.sourceRegionJson.excerpt));
  assert.equal(rows.amount.sourcePage, 2, 'the amount is found as $1,200.00 on page 2');
  assert.equal(rows.transactionDate.sourcePage, 2, 'the date is found as a written date on page 2');
  assert.equal(rows.category.sourcePage, null, 'the reader claimed page 1 but the value is not in the text, so no location is kept');
  assert.equal(rows._documentType.sourcePage ?? null, null);
});
