const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractLoanEstimateFieldsFromText,
  extractLoanEstimateFieldsFromOcrText,
  combineLoanEstimateExtractions,
} = require('../../dist/refinanceRadar/refinanceLoanEstimateExtraction.service');

const sample = `
LOAN ESTIMATE
Loan Terms
Loan Amount $300,000
Loan Term 30 years
Product Fixed Rate
Interest Rate 5.750%
Monthly Principal & Interest $1,905.42

Closing Cost Details
D. TOTAL LOAN COSTS (A + B + C) $8,427.00
Lender Credits -$1,250.00
Cash to Close $12,054.00

Comparisons
In 5 Years $125,582 Total you will have paid in principal, interest,
mortgage insurance, and loan costs.
$26,773 Principal you will have paid off.
Annual Percentage Rate (APR) 5.982%
`;

test('extracts standardized Loan Estimate comparison fields for review', () => {
  const result = extractLoanEstimateFieldsFromText(sample);
  assert.equal(result.fields.loanAmountUsd.value, 300000);
  assert.equal(result.fields.loanTermYears.value, 30);
  assert.equal(result.fields.loanType.value, 'FIXED');
  assert.equal(result.fields.noteRatePct.value, 5.75);
  assert.equal(result.fields.aprPct.value, 5.982);
  assert.equal(result.fields.monthlyPrincipalAndInterestUsd.value, 1905.42);
  assert.equal(result.fields.loanCostsUsd.value, 8427);
  assert.equal(result.fields.lenderCreditsUsd.value, 1250);
  assert.equal(result.fields.cashToCloseUsd.value, 12054);
  assert.equal(result.fields.fiveYearTotalPaidUsd.value, 125582);
  assert.equal(result.fields.fiveYearPrincipalPaidUsd.value, 26773);
  assert.equal(result.requiredFieldsFound, result.requiredFieldCount);
  assert.equal(result.reviewRequired, true);
});

test('fails open to manual review when a scanned PDF has no text layer', () => {
  const result = extractLoanEstimateFieldsFromText(' ');
  assert.equal(result.textLayerDetected, false);
  assert.equal(result.extractedFieldCount, 0);
  assert.ok(result.warnings.some((warning) => /OCR is not enabled/i.test(warning)));
});

test('marks fallback five-year values as medium confidence', () => {
  const result = extractLoanEstimateFieldsFromText(
    `${'Loan Estimate '.repeat(10)} In 5 Years $100,000 details $20,000 details`,
  );
  assert.equal(result.fields.fiveYearTotalPaidUsd.value, 100000);
  assert.equal(result.fields.fiveYearTotalPaidUsd.confidence, 'MEDIUM');
  assert.equal(result.fields.fiveYearPrincipalPaidUsd.value, 20000);
});

test('supports PDF text layers that place values before labels', () => {
  const result = extractLoanEstimateFieldsFromText(`
    ${'Loan Estimate '.repeat(10)}
    5.982% Annual Percentage Rate (APR)
    $1,905.42 Monthly Principal & Interest
    $300,000 Loan Amount
    $8,427 D. TOTAL LOAN COSTS
    -$1,250 Lender Credits
    $12,054 Estimated Cash to Close
  `);
  assert.equal(result.fields.aprPct.value, 5.982);
  assert.equal(result.fields.monthlyPrincipalAndInterestUsd.value, 1905.42);
  assert.equal(result.fields.loanAmountUsd.value, 300000);
  assert.equal(result.fields.loanCostsUsd.value, 8427);
  assert.equal(result.fields.lenderCreditsUsd.value, 1250);
  assert.equal(result.fields.cashToCloseUsd.value, 12054);
  assert.equal(result.fields.aprPct.confidence, 'MEDIUM');
});

test('caps OCR-derived fields at medium confidence and identifies the method', () => {
  const result = extractLoanEstimateFieldsFromOcrText(sample, 87.5);
  assert.equal(result.extractionMethod, 'IMAGE_OCR');
  assert.equal(result.documentConfidencePct, 87.5);
  assert.equal(result.fields.loanAmountUsd.confidence, 'MEDIUM');
  assert.match(result.fields.loanAmountUsd.sourceLabel, /OCR/);
  assert.ok(result.warnings.some((warning) => /OCR can confuse/i.test(warning)));
});

test('merges the strongest fields across image pages and preserves page provenance', () => {
  const pageOne = extractLoanEstimateFieldsFromOcrText(`
    ${'Loan Estimate '.repeat(10)}
    Loan Amount $300,000
    Loan Term 30 years
    Product Fixed Rate
    Interest Rate 5.750%
    Monthly Principal & Interest $1,905.42
  `, 90);
  const pageThree = extractLoanEstimateFieldsFromOcrText(`
    ${'Loan Estimate '.repeat(10)}
    Annual Percentage Rate (APR) 5.982%
    In 5 Years $125,582 Total you will have paid.
    $26,773 Principal you will have paid off.
  `, 80);
  const result = combineLoanEstimateExtractions([pageOne, pageThree]);
  assert.equal(result.pageCount, 2);
  assert.equal(result.fields.loanAmountUsd.value, 300000);
  assert.equal(result.fields.aprPct.value, 5.982);
  assert.match(result.fields.aprPct.sourceLabel, /page 2/);
  assert.equal(result.documentConfidencePct, 85);
  assert.ok(result.warnings.some((warning) => /same Loan Estimate revision/i.test(warning)));
});

test('warns when equally confident pages contain conflicting values', () => {
  const pageOne = extractLoanEstimateFieldsFromOcrText(`
    ${'Loan Estimate '.repeat(10)}
    Loan Amount $300,000
  `, 90);
  const pageTwo = extractLoanEstimateFieldsFromOcrText(`
    ${'Loan Estimate '.repeat(10)}
    Loan Amount $310,000
  `, 90);
  const result = combineLoanEstimateExtractions([pageOne, pageTwo]);
  assert.equal(result.fields.loanAmountUsd.value, 300000);
  assert.ok(result.warnings.some((warning) => /Conflicting loan amount values/i.test(warning)));
});
