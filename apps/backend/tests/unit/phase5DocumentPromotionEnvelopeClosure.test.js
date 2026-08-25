const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { claimDocumentToExtractionEnvelope } = require('../../src/services/claims/claimDocumentExtractionEnvelope.adapter.ts');
const { propertyTaxFieldsToExtractionEnvelope } = require('../../src/services/propertyTax/propertyTaxExtractionEnvelope.adapter.ts');
const { validateExtractionEnvelope } = require('../../src/services/intelligence/extractionEnvelope.contract.ts');

test('homeowner-categorized claim upload returns a valid common extraction envelope', () => {
  const envelope = claimDocumentToExtractionEnvelope({
    documentId: 'document-1',
    claimDocumentType: 'DAMAGE_PHOTO',
    fileName: 'roof.jpg',
    mimeType: 'image/jpeg',
    title: 'Roof damage',
    extractedAt: new Date('2026-08-24T12:00:00.000Z'),
  });
  assert.deepEqual(validateExtractionEnvelope(envelope), []);
  assert.equal(envelope.documentId, 'document-1');
  assert.equal(envelope.candidateEntityType, 'CLAIM');
  assert.equal(envelope.overallConfidence, 1);
  assert.equal(envelope.fields.find((field) => field.fieldKey === 'claimDocumentType').value, 'DAMAGE_PHOTO');
});

test('property-tax staged fields return a valid common extraction envelope without losing structured values', () => {
  const envelope = propertyTaxFieldsToExtractionEnvelope({
    documentId: 'document-tax-1',
    method: 'MANUAL',
    fields: [
      { fieldKey: 'taxYear', value: 2026 },
      { fieldKey: 'dueDates', value: ['2026-10-01', '2027-01-01'] },
      { fieldKey: 'exemptions', value: { homestead: true } },
    ],
    extractedAt: new Date('2026-08-24T12:00:00.000Z'),
  });
  assert.deepEqual(validateExtractionEnvelope(envelope), []);
  assert.deepEqual(envelope.fields[1].value, ['2026-10-01', '2027-01-01']);
  assert.equal(envelope.fields[2].value, '{"homestead":true}');
});
