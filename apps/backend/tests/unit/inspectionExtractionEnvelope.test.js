const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  validateExtractionEnvelope,
} = require('../../src/services/intelligence/extractionEnvelope.contract.ts');
const {
  inspectionExtractionToEnvelope,
  INSPECTION_EXTRACTOR_ID,
} = require('../../src/services/inspectionExtractionEnvelope.adapter.ts');

function finding(overrides = {}) {
  return {
    homeSystem: 'ROOF',
    severity: 'MAJOR',
    inspectorDescription: 'Missing shingles on the north slope.',
    extractionConfidence: 'HIGH',
    ...overrides,
  };
}

test('multiple accepted findings map to a PARSED, isBatch envelope with one field per finding', () => {
  const findings = [
    finding(),
    finding({ homeSystem: 'HVAC', severity: 'MINOR', inspectorDescription: 'Filter overdue.', extractionConfidence: 'MEDIUM' }),
  ];
  const envelope = inspectionExtractionToEnvelope(findings, 2);
  assert.equal(envelope.parseStatus, 'PARSED');
  assert.equal(envelope.extractorId, INSPECTION_EXTRACTOR_ID);
  assert.equal(envelope.candidateEntityType, 'INSPECTION_FINDING');
  assert.equal(envelope.isBatch, true);
  assert.equal(envelope.fields.length, 2);
  assert.ok(envelope.fields[0].value.includes('Missing shingles'));
  assert.equal(envelope.warnings.length, 0);
  assert.equal(validateExtractionEnvelope(envelope).length, 0);
});

test('a genuinely clean inspection (zero raw, zero accepted) is PARSED with zero fields — a legitimate batch outcome, not a bug', () => {
  const envelope = inspectionExtractionToEnvelope([], 0);
  assert.equal(envelope.parseStatus, 'PARSED');
  assert.equal(envelope.fields.length, 0);
  assert.equal(envelope.warnings.length, 0);
  assert.equal(validateExtractionEnvelope(envelope).length, 0);
});

test('the AI returning findings that all fail validation reports FALLBACK_UNSTRUCTURED with a warning, not a silent clean report', () => {
  const envelope = inspectionExtractionToEnvelope([], 5);
  assert.equal(envelope.parseStatus, 'FALLBACK_UNSTRUCTURED');
  assert.equal(envelope.fields.length, 0);
  assert.equal(envelope.warnings.length, 1);
  assert.ok(envelope.warnings[0].includes('5 finding'));
  assert.equal(validateExtractionEnvelope(envelope).length, 0);
});

test('overallConfidence is the average of the accepted findings\' confidence tiers', () => {
  const envelope = inspectionExtractionToEnvelope([
    finding({ extractionConfidence: 'HIGH' }),
    finding({ extractionConfidence: 'LOW' }),
  ], 2);
  assert.ok(Math.abs(envelope.overallConfidence - 0.625) < 1e-9);
});

test('overallConfidence is null when there are no accepted findings', () => {
  const envelope = inspectionExtractionToEnvelope([], 0);
  assert.equal(envelope.overallConfidence, null);
});
