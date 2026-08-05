const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Malware "scanning" was previously just the magic-byte/mimetype check —
// scanStatus was marked CLEAN immediately, with no actual content threat
// detection. This adds a real (if heuristic, not signature-database-backed)
// content-inspection layer: embedded executables disguised under an
// accepted MIME type, PDF active-content actions, and the industry-standard
// EICAR antivirus test string.

const auditCalls = [];

const loggerPath = require.resolve('../../src/lib/logger.ts');
require.cache[loggerPath] = {
  id: loggerPath,
  filename: loggerPath,
  loaded: true,
  exports: {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    auditLog: (event, userId, meta) => auditCalls.push({ event, userId, meta }),
  },
};

const {
  scanBufferForThreats,
  validateDocumentUpload,
  validatePdfUpload,
} = require('../../src/utils/documentValidator.util.ts');

const PDF_HEADER = Buffer.from('%PDF-1.4\n');

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test('scanBufferForThreats flags an embedded PE executable inside an otherwise-valid buffer', () => {
  const buffer = Buffer.concat([PDF_HEADER, Buffer.from('some content'), Buffer.from([0x4d, 0x5a, 0x90, 0x00])]);
  const finding = scanBufferForThreats(buffer, 'application/pdf');
  assert.ok(finding);
  assert.equal(finding.reason, 'EMBEDDED_PE_EXECUTABLE');
});

test('scanBufferForThreats flags the EICAR antivirus test string', () => {
  const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
  const buffer = Buffer.concat([PDF_HEADER, Buffer.from(eicar)]);
  const finding = scanBufferForThreats(buffer, 'application/pdf');
  assert.ok(finding);
  assert.equal(finding.reason, 'EICAR_TEST_SIGNATURE');
});

test('scanBufferForThreats flags PDF active-content actions', () => {
  const buffer = Buffer.concat([PDF_HEADER, Buffer.from('1 0 obj << /OpenAction 2 0 R >> endobj')]);
  const finding = scanBufferForThreats(buffer, 'application/pdf');
  assert.ok(finding);
  assert.equal(finding.reason, 'PDF_ACTIVE_CONTENT');
});

test('scanBufferForThreats does not flag a clean PDF', () => {
  const buffer = Buffer.concat([PDF_HEADER, Buffer.from('a perfectly ordinary document with no active content')]);
  assert.equal(scanBufferForThreats(buffer, 'application/pdf'), null);
});

test('scanBufferForThreats does not apply PDF-only keyword checks to non-PDF files', () => {
  // The literal string "/JavaScript" appearing in, say, an image's metadata
  // should not trip the PDF-specific active-content check.
  const buffer = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff]), // JPEG magic bytes
    Buffer.from('/JavaScript some unrelated jpeg comment content'),
  ]);
  assert.equal(scanBufferForThreats(buffer, 'image/jpeg'), null);
});

test('validateDocumentUpload rejects an upload whose content trips a threat heuristic and audit-logs it', () => {
  const maliciousBuffer = Buffer.concat([PDF_HEADER, Buffer.from([0x4d, 0x5a, 0x90, 0x00])]);
  const req = {
    file: {
      buffer: maliciousBuffer,
      mimetype: 'application/pdf',
      originalname: 'warranty.pdf',
      size: maliciousBuffer.length,
    },
    user: { userId: 'user-1' },
    ip: '127.0.0.1',
  };
  const res = createRes();
  let nextCalled = false;
  auditCalls.length = 0;

  validateDocumentUpload(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].event, 'SUSPICIOUS_FILE_UPLOAD');
  assert.equal(auditCalls[0].meta.reason, 'EMBEDDED_PE_EXECUTABLE');
});

test('validatePdfUpload allows a clean PDF through to next()', () => {
  const buffer = Buffer.concat([PDF_HEADER, Buffer.from('ordinary content')]);
  const req = {
    file: { buffer, mimetype: 'application/pdf', originalname: 'inspection.pdf', size: buffer.length },
    user: { userId: 'user-1' },
    ip: '127.0.0.1',
  };
  const res = createRes();
  let nextCalled = false;

  validatePdfUpload(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
});
