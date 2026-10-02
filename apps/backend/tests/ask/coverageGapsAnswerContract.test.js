const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { validateAskSemanticAnswerRelevance } = require('../../src/services/ask/askSemanticAnswerValidator.ts');

test('the exposure follow-up accepts the canonical coverage-gap envelope', () => {
  const result = {
    status: 'ANSWERED',
    blocks: [
      { type: 'SUMMARY', id: 'coverage-summary', title: '2 items match this coverage review', body: 'One confirmed gap and one unclear record.', tone: 'CAUTION', actions: [] },
      { type: 'GROUPED_LIST', id: 'coverage-groups', title: 'Coverage review', description: null, filters: [], sections: [], actions: [] },
      { type: 'BOUNDARY', id: 'coverage-boundary', title: 'Record review—not a coverage determination', body: 'Review current terms.', severity: 'INFO', suggestions: [] },
    ],
    suggestions: [],
  };
  const relevance = validateAskSemanticAnswerRelevance({
    question: 'Which gaps have the largest exposure?',
    operationId: 'COVERAGE_GAPS',
    result,
  });
  assert.equal(relevance.outcome, 'PASS');
  assert.deepEqual(relevance.reasonCodes, ['CANONICAL_TYPED_ANSWER_CONTRACT_MATCH']);
});
