const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  validateExtractionEnvelope,
} = require('../../src/services/intelligence/extractionEnvelope.contract.ts');
const {
  documentInsightsToExtractionEnvelope,
  DOCUMENT_INTELLIGENCE_EXTRACTOR_ID,
} = require('../../src/services/documentIntelligenceExtractionEnvelope.adapter.ts');

function baseEnvelope(overrides = {}) {
  return {
    documentId: 'doc-1',
    documentVersionId: 'version-1',
    extractorId: 'test-extractor',
    extractorVersion: '1.0',
    modelId: 'test-model',
    candidateEntityType: 'WARRANTY',
    fields: [{ fieldKey: 'providerName', value: 'Acme', confidence: 0.8 }],
    overallConfidence: 0.8,
    parseStatus: 'PARSED',
    warnings: [],
    extractedAt: new Date().toISOString(),
    ...overrides,
  };
}

test('validateExtractionEnvelope passes cleanly on a well-formed PARSED envelope', () => {
  assert.deepEqual(validateExtractionEnvelope(baseEnvelope()), []);
});

test('validateExtractionEnvelope fails when extractorId or extractorVersion is blank', () => {
  assert.ok(validateExtractionEnvelope(baseEnvelope({ extractorId: '' })).some((i) => i.includes('extractorId')));
  assert.ok(validateExtractionEnvelope(baseEnvelope({ extractorVersion: '' })).some((i) => i.includes('extractorVersion')));
});

test('validateExtractionEnvelope fails when PARSED declares no fields', () => {
  const issues = validateExtractionEnvelope(baseEnvelope({ fields: [] }));
  assert.ok(issues.some((i) => i.includes('PARSED but declares no candidate fields')));
});

test('validateExtractionEnvelope fails when FAILED declares fields', () => {
  const issues = validateExtractionEnvelope(baseEnvelope({ parseStatus: 'FAILED', fields: [{ fieldKey: 'x', value: 'y', confidence: null }] }));
  assert.ok(issues.some((i) => i.includes('FAILED but declares candidate fields')));
});

test('validateExtractionEnvelope fails on out-of-range confidence values', () => {
  assert.ok(validateExtractionEnvelope(baseEnvelope({ overallConfidence: 1.5 })).some((i) => i.includes('overallConfidence')));
  assert.ok(validateExtractionEnvelope(baseEnvelope({
    fields: [{ fieldKey: 'x', value: 'y', confidence: -0.1 }],
  })).some((i) => i.includes('confidence must be a 0..1 ratio')));
});

test('validateExtractionEnvelope fails on an unknown parseStatus', () => {
  assert.ok(validateExtractionEnvelope(baseEnvelope({ parseStatus: 'BOGUS' })).some((i) => i.includes('unknown parseStatus')));
});

// documentInsightsToExtractionEnvelope — wraps the real AI extractor's
// DocumentInsights shape without altering its behavior.

function insights(overrides = {}) {
  return {
    documentType: 'WARRANTY',
    confidence: 0.85,
    extractedData: { manufacturer: 'Acme', warrantyExpiration: new Date('2027-01-01T00:00:00.000Z') },
    suggestedActions: ['Review this warranty'],
    ...overrides,
  };
}

test('a normally parsed DocumentInsights maps to a PARSED envelope with mapped fields', () => {
  const envelope = documentInsightsToExtractionEnvelope(insights(), { documentId: 'doc-1' });
  assert.equal(envelope.parseStatus, 'PARSED');
  assert.equal(envelope.extractorId, DOCUMENT_INTELLIGENCE_EXTRACTOR_ID);
  assert.equal(envelope.candidateEntityType, 'WARRANTY');
  assert.equal(envelope.documentId, 'doc-1');
  assert.ok(envelope.fields.some((f) => f.fieldKey === 'manufacturer' && f.value === 'Acme'));
  assert.ok(envelope.fields.some((f) => f.fieldKey === 'warrantyExpiration' && f.value === '2027-01-01T00:00:00.000Z'));
  assert.equal(envelope.warnings.length, 0);
  assert.equal(validateExtractionEnvelope(envelope).length, 0);
});

test('the exact catch-block fallback DocumentInsights maps to a FAILED envelope with no fields', () => {
  const fallback = insights({
    documentType: 'UNKNOWN',
    confidence: 0,
    extractedData: {},
    suggestedActions: ['Manual review required - AI response format was invalid'],
  });
  const envelope = documentInsightsToExtractionEnvelope(fallback);
  assert.equal(envelope.parseStatus, 'FAILED');
  assert.equal(envelope.fields.length, 0);
  assert.equal(envelope.overallConfidence, 0);
  assert.deepEqual(envelope.warnings, ['Manual review required - AI response format was invalid']);
  assert.equal(validateExtractionEnvelope(envelope).length, 0);
});

test('a legitimately AI-classified UNKNOWN document (not the fallback signature) is still PARSED', () => {
  const legitimateUnknown = insights({
    documentType: 'UNKNOWN',
    confidence: 0.6,
    extractedData: { productName: 'Mystery gadget' },
    suggestedActions: ['This document type could not be determined'],
  });
  const envelope = documentInsightsToExtractionEnvelope(legitimateUnknown);
  assert.equal(envelope.parseStatus, 'PARSED');
  assert.ok(envelope.fields.some((f) => f.fieldKey === 'productName'));
});

test('a low-confidence PARSED result carries a warning', () => {
  const lowConfidence = insights({ confidence: 0.3 });
  const envelope = documentInsightsToExtractionEnvelope(lowConfidence);
  assert.equal(envelope.parseStatus, 'PARSED');
  assert.equal(envelope.warnings.length, 1);
  assert.ok(envelope.warnings[0].includes('Low extraction confidence'));
});

test('undefined/null extractedData fields are excluded from the envelope\'s field list', () => {
  const envelope = documentInsightsToExtractionEnvelope(insights({
    extractedData: { manufacturer: 'Acme', vendor: undefined, amount: undefined },
  }));
  assert.equal(envelope.fields.length, 1);
  assert.equal(envelope.fields[0].fieldKey, 'manufacturer');
});
