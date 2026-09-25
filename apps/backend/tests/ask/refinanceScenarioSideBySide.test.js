const test = require('node:test');
const { readAskOrchestratorSources } = require('../helpers/askOrchestratorSources.js');
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

const orchestratorSource = readAskOrchestratorSources();

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

test('the scenario branch renders the canonical comparison alongside the scenario, in one strip, in the same response (FRD v1.87)', () => {
  const body = functionBody(orchestratorSource, /async function refinanceAnalysisResult\(/);
  const scenarioBranchStart = body.indexOf('if (scenarioEdit) {');
  assert.ok(scenarioBranchStart >= 0, 'expected to find the scenarioEdit branch');
  const scenarioBranch = body.slice(scenarioBranchStart);
  // The branch hands the canonical `result` and the hypothetical `scenario` to the strip builder, in that order.
  assert.match(scenarioBranch, /refinanceScenarioComparison\(\s*result, scenario, targetRatePct, termLabel,/);
  assert.doesNotMatch(scenarioBranch, /id: 'refinance-scenario-current-comparison'/, 'the separate current-comparison table was folded into the strip');
});

const { refinanceScenarioComparison } = require('../../src/services/ask/askOrchestrator.service.ts');

// The strip builder is given deliberately different numbers for the canonical evaluation and the hypothetical, so a
// value read from the wrong source cannot pass. This replaces the earlier source-shape check that the current
// comparison "reads from result, never from scenario".
test('the current option reads only the canonical evaluation and the scenario option only the recalculation', () => {
  const current = { currentRatePct: 6.875, marketRatePct: 6.125, monthlySavings: 210, lifetimeSavings: 41000, breakEvenMonths: 28 };
  const scenario = { monthlySavings: 333, lifetimeSavings: 77000, closingCostUsd: 6400, breakEvenMonths: null };
  const block = refinanceScenarioComparison(current, scenario, 5.5, '15-year');
  const values = (index) => Object.fromEntries(block.options[index].attributes.map((attribute) => [attribute.label, attribute.value]));
  assert.deepEqual(values(0), {
    'Your recorded mortgage rate': '6.875%', 'Market benchmark rate': '6.125%', 'Modeled monthly savings': '$210',
    'Modeled lifetime savings': '$41,000', 'Estimated break-even': '28 months',
  });
  assert.deepEqual(values(1), {
    'Illustrative target rate': '5.500%', 'Illustrative target term': '15-year', 'Modeled monthly savings': '$333',
    'Modeled lifetime savings': '$77,000', 'Modeled closing costs': '$6,400', 'Estimated break-even': 'Not reached',
  });
  assert.equal(block.options[0].label, 'Your current comparison (unchanged)');
  for (const entry of block.options) {
    assert.equal(entry.badge, undefined);
    assert.equal(entry.badges, undefined);
    assert.equal(entry.amount, undefined);
    assert.ok(entry.attributes.every((attribute) => attribute.leading === undefined));
  }
  require('../../src/productFramework/ask/ask.contract.ts').AskPresentationBlockSchema.parse(block);
});

test('COMPARISON is allowed for the operation in the registry and the refinance skill', () => {
  const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
  assert.ok(ASK_OPERATION_DEFINITIONS.REFINANCE_ANALYSIS.allowedBlockTypes.includes('COMPARISON'));
  assert.ok(require('../../src/services/skills/skillRegistry.ts').getSkillForOperation('REFINANCE_ANALYSIS').allowedResultBlocks.includes('COMPARISON'));
});

test('the answer checker, with answer relevance on, keeps a scenario answer that carries the strip', () => {
  const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
  const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
  const answer = {
    status: 'ANSWERED', suggestions: [],
    blocks: [
      { type: 'SUMMARY', id: 'refinance-scenario-summary', title: 'Illustrative 15-year scenario at 5.500%', tone: 'DEFAULT', actions: [],
        body: 'This is a hypothetical recalculation only. Nothing was saved, and your recorded mortgage rate and term are unchanged.' },
      refinanceScenarioComparison({ currentRatePct: 6.875, marketRatePct: 6.125, monthlySavings: 210, lifetimeSavings: 41000, breakEvenMonths: 28 }, { monthlySavings: 333, lifetimeSavings: 77000, closingCostUsd: 6400, breakEvenMonths: 19 }, 5.5, '15-year'),
      { type: 'EVIDENCE', id: 'refinance-scenario-evidence', title: 'Sources used', items: [{ label: 'Current mortgage details', source: 'Property Financing Profile', observedAt: '2026-09-01T00:00:00.000Z' }] },
      { type: 'BOUNDARY', id: 'refinance-scenario-boundary', title: 'Illustrative scenario—not a lender quote or a saved plan', body: 'This models a hypothetical rate and term only.', severity: 'INFO', suggestions: [] },
    ],
  };
  const checked = validateAskAnswerTrustPipeline({
    question: 'What if I refinanced at 5.5% for 15 years?', operationId: 'REFINANCE_ANALYSIS', propertyId: 'p1', semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence(answer, [completedAskAuthoritativeSourceEvidence('REFINANCE_ANALYSIS')]),
  });
  assert.equal(checked.result.status, 'ANSWERED', JSON.stringify(checked.semantic));
  assert.ok(checked.result.blocks.some((block) => block.type === 'COMPARISON'));
});

// Found while testing (FRD v1.87): answer relevance already turned this scenario answer into a clarification with the old
// two-table answer too (INSUFFICIENT_RELEVANCE_SIGNAL), so the branch's own envelope is matched by a typed contract.
test('the typed scenario contract accepts only the scenario envelope, led by its own summary', () => {
  const { matchesRefinanceScenarioAnswerContract } = require('../../src/services/ask/askRefinanceScenarioIntent.ts');
  const summary = { type: 'SUMMARY', id: 'refinance-scenario-summary', title: 'x', body: 'y', tone: 'DEFAULT', actions: [] };
  const table = { type: 'TABLE', id: 'refinance-scenario-table', title: 'x', columns: [], rows: [], actions: [] };
  assert.equal(matchesRefinanceScenarioAnswerContract({ status: 'ANSWERED', blocks: [summary, table] }), true);
  assert.equal(matchesRefinanceScenarioAnswerContract({ status: 'NEEDS_CONFIRMATION', blocks: [summary, table] }), false);
  assert.equal(matchesRefinanceScenarioAnswerContract({ status: 'ANSWERED', blocks: [table] }), false);
  assert.equal(matchesRefinanceScenarioAnswerContract({ status: 'ANSWERED', blocks: [summary, { ...table, id: 'something-else' }] }), false);
});
