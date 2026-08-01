const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const refinanceSource = [
  'refinanceScenarioMarkdown.ts',
  'refinanceLoanEstimateMarkdown.ts',
  'refinanceProgramGuidance.ts',
  'refinanceTrustContent.ts',
].map((name) => fs.readFileSync(
  path.resolve(__dirname, '../../src/refinanceRadar', name),
  'utf8',
)).join('\n');

test('material-financial guidance has maintained primary sources and commercial boundaries', () => {
  assert.match(refinanceSource, /consumerfinance\.gov\/consumer-tools\/credit-reports-and-scores/);
  assert.match(refinanceSource, /consumerfinance\.gov\/owning-a-home\/loan-estimate/);
  assert.match(refinanceSource, /consumerfinance\.gov\/owning-a-home\/compare/);
  assert.match(refinanceSource, /does not endorse a lender/);
  assert.match(refinanceSource, /rank lenders for compensation/);
  assert.match(refinanceSource, /not an overall lender ranking or recommendation/);
});

test('material-financial guidance avoids prohibited urgency, guarantees, and universal document rules', () => {
  assert.doesNotMatch(
    refinanceSource,
    /Credit Karma|guaranteed approval|guaranteed savings|act now|must act today|all lenders require|lenders will ask for (?:tax returns|pay stubs|bank statements)/i,
  );
});
