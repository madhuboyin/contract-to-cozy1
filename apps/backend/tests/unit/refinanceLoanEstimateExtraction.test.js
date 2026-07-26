const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractLoanEstimateFieldsFromText,
  extractLoanEstimateFieldsFromOcrText,
  combineLoanEstimateExtractions,
  extractLoanEstimateFromPdf,
  detectLoanEstimatePages,
  analyzeLoanEstimatePageSet,
} = require('../../dist/refinanceRadar/refinanceLoanEstimateExtraction.service');

const sample = `
LOAN ESTIMATE
Date Issued 07/20/2026
Loan Terms
Loan Amount $300,000
Loan Term 30 years
Product Fixed Rate
Interest Rate 5.750%
Monthly Principal & Interest $1,905.42
Mortgage Insurance $120.00
Estimated Total Payment $2,425.42

Closing Cost Details
0.500% of Loan Amount (Points) $1,500.00
D. TOTAL LOAN COSTS (A + B + C) $8,427.00
Lender Credits -$1,250.00
Cash to Close $12,054.00 From Borrower

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
  assert.equal(result.fields.monthlyMortgageInsuranceUsd.value, 120);
  assert.equal(result.fields.estimatedTotalMonthlyPaymentUsd.value, 2425.42);
  assert.equal(result.fields.loanCostsUsd.value, 8427);
  assert.equal(result.fields.discountPointsPct.value, 0.5);
  assert.equal(result.fields.discountPointsUsd.value, 1500);
  assert.equal(result.fields.lenderCreditsUsd.value, 1250);
  assert.equal(result.fields.cashToCloseUsd.value, 12054);
  assert.equal(result.fields.cashToCloseDirection.value, 'FROM_BORROWER');
  assert.equal(result.fields.fiveYearTotalPaidUsd.value, 125582);
  assert.equal(result.fields.fiveYearPrincipalPaidUsd.value, 26773);
  assert.equal(result.fields.issuedDate.value, '2026-07-20');
  assert.equal(result.requiredFieldsFound, result.requiredFieldCount);
  assert.deepEqual(result.pageIntegrity.detectedPages, [1, 2, 3]);
  assert.equal(result.pageIntegrity.status, 'COMPLETE');
  assert.equal(result.reviewRequired, true);
});

test('identifies documents that require OCR when no text layer is present', () => {
  const result = extractLoanEstimateFieldsFromText(' ');
  assert.equal(result.textLayerDetected, false);
  assert.equal(result.extractedFieldCount, 0);
  assert.ok(result.warnings.some((warning) => /OCR is required/i.test(warning)));
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

test('distinguishes scanned PDF OCR from uploaded page-image OCR', () => {
  const result = extractLoanEstimateFieldsFromOcrText(sample, 82, 'PDF_OCR');
  assert.equal(result.extractionMethod, 'PDF_OCR');
  assert.equal(result.documentConfidencePct, 82);
  assert.equal(result.fields.loanAmountUsd.confidence, 'MEDIUM');
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
  assert.equal(result.pageIntegrity.status, 'PARTIAL');
  assert.deepEqual(result.pageIntegrity.missingPages, [2]);
  assert.ok(result.warnings.some((warning) => /same Loan Estimate revision/i.test(warning)));
  assert.ok(result.warnings.some((warning) => /Page 2 was not detected/i.test(warning)));
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

test('classifies duplicate and out-of-order Loan Estimate page sets', () => {
  assert.deepEqual(
    detectLoanEstimatePages(`
      Loan Terms
      Loan Amount $300,000
      Interest Rate 5.75%
    `),
    [1],
  );
  const duplicate = analyzeLoanEstimatePageSet([1, 2, 2, 3]);
  assert.equal(duplicate.status, 'DUPLICATE');
  assert.deepEqual(duplicate.duplicatePages, [2]);

  const outOfOrder = analyzeLoanEstimatePageSet([3, 1, 2]);
  assert.equal(outOfOrder.status, 'OUT_OF_ORDER');
  assert.equal(outOfOrder.outOfOrder, true);
  assert.deepEqual(outOfOrder.missingPages, []);
});

test('renders and OCRs a scanned Loan Estimate PDF in memory', async () => {
  const sharp = require('sharp');
  const { PDFDocument } = require('pdf-lib');
  const svg = Buffer.from(`
    <svg width="1600" height="2100" xmlns="http://www.w3.org/2000/svg">
      <rect width="1600" height="2100" fill="white"/>
      <g fill="black" font-family="Arial, sans-serif" font-size="64">
        <text x="100" y="180">Loan Estimate</text>
        <text x="100" y="360">Loan Amount $300,000</text>
        <text x="100" y="500">Loan Term 30 years</text>
        <text x="100" y="640">Product Fixed Rate</text>
        <text x="100" y="780">Interest Rate 5.750%</text>
        <text x="100" y="920">Monthly Principal &amp; Interest $1,905.42</text>
      </g>
    </svg>
  `);
  const png = await sharp(svg).png().toBuffer();
  const document = await PDFDocument.create();
  const image = await document.embedPng(png);
  const page = document.addPage([612, 792]);
  page.drawImage(image, { x: 0, y: 0, width: 612, height: 792 });

  const result = await extractLoanEstimateFromPdf(
    Buffer.from(await document.save()),
  );
  assert.equal(result.extractionMethod, 'PDF_OCR');
  assert.equal(result.pageCount, 1);
  assert.equal(result.fields.loanAmountUsd.value, 300000);
  assert.equal(result.fields.noteRatePct.value, 5.75);
  assert.ok(result.warnings.some((warning) => /scanned PDF/i.test(warning)));
});
