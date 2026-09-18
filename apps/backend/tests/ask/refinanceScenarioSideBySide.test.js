const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// F02 fix, round 2 (docs/architecture/ASK_COZY_PHASE3_PHASE7_FINANCIAL_ACCEPTANCE_VERIFICATION.md,
// external review): the scenario branch previously returned the hypothetical
// alone, with a text pointer back to a separate question to see the
// canonical comparison -- external review found this didn't satisfy
// "revision shown alongside the original" the way HVAC_DECISION_SCENARIO's
// D02 comparator does (current + scenario together, one response). This is
// a governance/source-shape test, not a DB integration test:
// refinanceAnalysisResult composes getProfile/getFinancialContextDecisions/
// mortgageRateService/refinanceRadarService, none of which are mocked in
// this suite, same STATIC-verification boundary applied throughout this
// audit series.

const orchestratorSource = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');

function functionBody(source, functionSignaturePattern) {
  const match = source.match(functionSignaturePattern);
  assert.ok(match, `expected to find a function matching ${functionSignaturePattern}`);
  const start = match.index;
  const braceStart = source.indexOf('{\n', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('Unbalanced braces while extracting function body');
}

test('the scenario branch renders a current-comparison table alongside the scenario table, in the same response', () => {
  const body = functionBody(orchestratorSource, /async function refinanceAnalysisResult\(/);
  const scenarioBranchStart = body.indexOf('if (scenarioEdit) {');
  assert.ok(scenarioBranchStart >= 0, 'expected to find the scenarioEdit branch');
  const scenarioBranch = body.slice(scenarioBranchStart);
  assert.match(scenarioBranch, /id: 'refinance-scenario-table'/);
  assert.match(scenarioBranch, /id: 'refinance-scenario-current-comparison'/);
});

test('the current-comparison table reads from the canonical `result` (evaluateProperty output), never from the hypothetical `scenario`', () => {
  const body = functionBody(orchestratorSource, /async function refinanceAnalysisResult\(/);
  const tableStart = body.indexOf("id: 'refinance-scenario-current-comparison'");
  assert.ok(tableStart >= 0);
  const tableEnd = body.indexOf("id: 'refinance-scenario-evidence'", tableStart);
  assert.ok(tableEnd > tableStart);
  const table = body.slice(tableStart, tableEnd);
  assert.match(table, /result\.currentRatePct/);
  assert.match(table, /result\.marketRatePct/);
  assert.match(table, /result\.monthlySavings/);
  assert.doesNotMatch(table, /scenario\.\w/, 'the current-comparison table must not read any field from the hypothetical scenario object');
});
