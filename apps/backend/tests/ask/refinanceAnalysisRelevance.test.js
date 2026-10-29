const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Regression: "Is refinancing worth reviewing now?" routes to REFINANCE_ANALYSIS and the handler builds the analysis answer (summary, scenario planner, table,
// evidence, boundary), but the typed answer contract only knew the hypothetical-scenario blocks, so a correct answer scored on word similarity, lost to the rate
// monitor ("monitor mortgage rates"), and was replaced by "Let's make sure I answer the right home question".

const { validateAskSemanticAnswerRelevance } = require('../../src/services/ask/askSemanticAnswerValidator.ts');
const { matchesRefinanceAnalysisAnswerContract, matchesRefinanceScenarioAnswerContract } = require('../../src/services/ask/askRefinanceScenarioIntent.ts');

const OP = 'REFINANCE_ANALYSIS';
const action = (id) => ({ id, label: 'Compare Loan Estimates', interactionType: 'START_WORKFLOW', message: 'Help me compare official Loan Estimates for this refinance.', operationId: OP, style: 'SECONDARY' });
const analysis = [
  { type: 'SUMMARY', id: 'refinance-analysis-summary', title: 'Refinancing may be worth comparing now', body: 'The benchmark is 0.62 points below your recorded rate; modeled break-even is 31 months.', tone: 'POSITIVE', actions: [action('refinance-compare-offers')] },
  { type: 'SUMMARY', id: 'refinance-scenario-planner', title: 'Test loan scenarios', headline: 'Test loan scenarios', supportLine: 'Change the rate, term and closing costs.', body: 'Open the Scenario Planner to compare a hypothetical refinance with your current mortgage.', tone: 'DEFAULT', actions: [action('refinance-test-scenario')] },
  { type: 'TABLE', id: 'refinance-analysis-table', title: 'Current loan versus governed benchmark', description: 'The benchmark is not a personalized lender offer.', columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Estimate' }, { key: 'meaning', label: 'What it represents' }], rows: [{ id: 'current-rate', values: { metric: 'Your recorded mortgage rate', value: '6.875%', meaning: 'Existing loan note rate' } }], actions: [] },
  { type: 'SUMMARY', id: 'refinance-missed-window', title: 'Missed window insight', body: 'Rates were lower in March.', tone: 'CAUTION', actions: [] },
  { type: 'SUMMARY', id: 'refinance-more-tools', title: 'More refinance tools', body: 'Look back at mortgage rates, recalculate a saved scenario, or review your Loan Estimate comparisons.', tone: 'DEFAULT', actions: [action('refinance-history-52')] },
  { type: 'EVIDENCE', id: 'refinance-evidence', title: 'Sources used', items: [{ label: '30-year market benchmark', source: 'Freddie Mac', observedAt: '2026-10-22T00:00:00.000Z' }] },
  { type: 'BOUNDARY', id: 'refinance-boundary', title: 'Planning estimate—not a loan offer', body: 'Actual eligibility, APR and closing costs depend on the lender.', severity: 'INFO', suggestions: [] },
];
const result = (blocks, status = 'ANSWERED') => ({ status, reasonCode: undefined, blocks, suggestions: [] });
const relevance = (question, blocks, status) => validateAskSemanticAnswerRelevance({ question, operationId: OP, result: result(blocks, status) });

test('the analysis answer the handler builds is accepted for the questions that reach it', () => {
  for (const question of ['Is refinancing worth reviewing now?', 'Is refinancing worth it?', 'Should I refinance my mortgage?']) {
    const out = relevance(question, analysis);
    assert.equal(out.outcome, 'PASS', `${question}: ${JSON.stringify(out.reasonCodes)} ${out.competingOperationId ?? ''}`);
  }
  assert.equal(matchesRefinanceAnalysisAnswerContract(result(analysis)), true);
  // the closed-radar variant leaves out the missed window and keeps the rest
  assert.equal(matchesRefinanceAnalysisAnswerContract(result(analysis.filter((block) => block.id !== 'refinance-missed-window'))), true);
});

test('the contract is still narrow: it needs the analysis summary and nothing foreign, and the scenario contract is unchanged', () => {
  assert.equal(matchesRefinanceAnalysisAnswerContract(result(analysis.slice(1))), false, 'no analysis summary');
  assert.equal(matchesRefinanceAnalysisAnswerContract(result([...analysis, { type: 'SUMMARY', id: 'maintenance-summary', title: 'x', body: 'y', tone: 'DEFAULT', actions: [] }])), false, 'a foreign block');
  assert.equal(matchesRefinanceAnalysisAnswerContract(result(analysis, 'NEEDS_CONTEXT')), false, 'not a success');
  assert.equal(matchesRefinanceAnalysisAnswerContract(result([{ ...analysis[0], type: 'TABLE' }, ...analysis.slice(1)])), false, 'the summary id must carry its own type');
  assert.equal(matchesRefinanceScenarioAnswerContract(result(analysis)), false, 'the scenario contract does not accept the analysis answer');
});
