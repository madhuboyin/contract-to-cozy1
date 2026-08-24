const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  validateExtractionEnvelope,
} = require('../../src/services/intelligence/extractionEnvelope.contract.ts');
const {
  loanEstimateExtractionToEnvelope,
  LOAN_ESTIMATE_EXTRACTOR_ID,
} = require('../../src/refinanceRadar/refinanceLoanEstimateExtractionEnvelope.adapter.ts');

function field(value, confidence, sourceLabel = 'Page 1') {
  return { value, confidence, sourceLabel };
}

function missingField(sourceLabel = 'Page 1') {
  return { value: null, confidence: 'MISSING', sourceLabel };
}

function baseExtraction(overrides = {}) {
  return {
    fields: {
      loanAmountUsd: field(350000, 'HIGH', 'Loan Amount line'),
      loanTermYears: field(30, 'HIGH', 'Loan Term line'),
      loanType: field('FIXED', 'MEDIUM', 'Product line'),
      noteRatePct: field(6.125, 'HIGH', 'Interest Rate line'),
      aprPct: missingField(),
      monthlyPrincipalAndInterestUsd: field(2128, 'HIGH', 'Monthly Payment line'),
      monthlyMortgageInsuranceUsd: missingField(),
      estimatedTotalMonthlyPaymentUsd: field(2400, 'MEDIUM', 'Total Monthly Payment line'),
      loanCostsUsd: missingField(),
      lenderCreditsUsd: missingField(),
      discountPointsPct: missingField(),
      discountPointsUsd: missingField(),
      cashToCloseUsd: field(12000, 'HIGH', 'Cash to Close line'),
      cashToCloseDirection: field('FROM_BORROWER', 'HIGH', 'Cash to Close line'),
      fiveYearTotalPaidUsd: missingField(),
      fiveYearPrincipalPaidUsd: missingField(),
      issuedDate: field('2026-08-01', 'HIGH', 'Date Issued line'),
    },
    extractedFieldCount: 8,
    requiredFieldCount: 8,
    requiredFieldsFound: 8,
    textLayerDetected: true,
    extractionMethod: 'PDF_TEXT',
    documentConfidencePct: 85,
    pageCount: 3,
    pageIntegrity: { status: 'COMPLETE', detectedPages: [1, 2, 3], missingPages: [], duplicatePages: [], outOfOrder: false },
    reviewRequired: true,
    warnings: [],
    ...overrides,
  };
}

test('a complete, high-confidence extraction maps to a PARSED envelope with mapped fields and evidence', () => {
  const envelope = loanEstimateExtractionToEnvelope(baseExtraction());
  assert.equal(envelope.parseStatus, 'PARSED');
  assert.equal(envelope.extractorId, LOAN_ESTIMATE_EXTRACTOR_ID);
  assert.equal(envelope.modelId, null, 'deterministic parser, no AI model');
  assert.equal(envelope.candidateEntityType, 'LOAN_ESTIMATE');
  assert.equal(envelope.overallConfidence, 0.85);
  const loanAmount = envelope.fields.find((f) => f.fieldKey === 'loanAmountUsd');
  assert.equal(loanAmount.value, 350000);
  assert.equal(loanAmount.confidence, 0.9);
  assert.equal(loanAmount.evidence.excerpt, 'Loan Amount line');
  assert.equal(validateExtractionEnvelope(envelope).length, 0);
});

test('MISSING-confidence fields are excluded from the envelope\'s field list', () => {
  const envelope = loanEstimateExtractionToEnvelope(baseExtraction());
  assert.ok(!envelope.fields.some((f) => f.fieldKey === 'aprPct'));
  assert.ok(!envelope.fields.some((f) => f.fieldKey === 'monthlyMortgageInsuranceUsd'));
});

test('a MEDIUM-confidence field maps to a 0.6 confidence ratio', () => {
  const envelope = loanEstimateExtractionToEnvelope(baseExtraction());
  const loanType = envelope.fields.find((f) => f.fieldKey === 'loanType');
  assert.equal(loanType.value, 'FIXED');
  assert.equal(loanType.confidence, 0.6);
});

test('an UNVERIFIED page set maps to FAILED with no fields, regardless of what was matched', () => {
  const envelope = loanEstimateExtractionToEnvelope(baseExtraction({
    pageIntegrity: { status: 'UNVERIFIED', detectedPages: [], missingPages: [1, 2, 3], duplicatePages: [], outOfOrder: false },
  }));
  assert.equal(envelope.parseStatus, 'FAILED');
  assert.equal(envelope.fields.length, 0);
  assert.equal(envelope.overallConfidence, 0);
  assert.equal(validateExtractionEnvelope(envelope).length, 0);
});

test('zero required fields found maps to FAILED', () => {
  const envelope = loanEstimateExtractionToEnvelope(baseExtraction({ requiredFieldsFound: 0 }));
  assert.equal(envelope.parseStatus, 'FAILED');
});

test('a PARTIAL page set with some required fields still found maps to FALLBACK_UNSTRUCTURED, not PARSED', () => {
  const envelope = loanEstimateExtractionToEnvelope(baseExtraction({
    pageIntegrity: { status: 'PARTIAL', detectedPages: [1, 2], missingPages: [3], duplicatePages: [], outOfOrder: false },
    requiredFieldsFound: 5,
  }));
  assert.equal(envelope.parseStatus, 'FALLBACK_UNSTRUCTURED');
  assert.ok(envelope.fields.length > 0, 'a partial result still carries whatever fields it found');
  assert.equal(validateExtractionEnvelope(envelope).length, 0);
});

test('requiredFieldsFound below requiredFieldCount on an otherwise COMPLETE page set is still FALLBACK_UNSTRUCTURED', () => {
  const envelope = loanEstimateExtractionToEnvelope(baseExtraction({ requiredFieldsFound: 6 }));
  assert.equal(envelope.parseStatus, 'FALLBACK_UNSTRUCTURED');
});

test('the extraction\'s own warnings array passes straight through to the envelope', () => {
  const envelope = loanEstimateExtractionToEnvelope(baseExtraction({ warnings: ['Page 2 appears to be a duplicate of Page 1'] }));
  assert.deepEqual(envelope.warnings, ['Page 2 appears to be a duplicate of Page 1']);
});
