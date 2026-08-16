const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { validateAskSemanticAnswerRelevance } = require('../../src/services/ask/askSemanticAnswerValidator.ts');
const { matchesSavingsOpportunitiesAnswerContract } = require('../../src/services/ask/askSavingsIntent.ts');
const {
  attachAskAuthoritativeSourceEvidence,
  completedAskAuthoritativeSourceEvidence,
} = require('../../src/services/ask/askAnswerTrustPolicy.ts');

const QUESTION = 'Where could I save money on this home?';

function savingsResult({ status = 'ANSWERED', populated = false } = {}) {
  const blocks = [{
    type: 'SUMMARY', id: 'savings-summary',
    title: populated
      ? '3 savings opportunities are ready to review'
      : 'No current savings opportunity is recorded—not the same as zero savings',
    body: populated
      ? 'Available estimates and recorded outcomes are separated below.'
      : 'Ask will not infer that no savings exist from an empty record.',
    tone: populated ? 'POSITIVE' : 'DEFAULT',
    actions: [{
      id: 'open-savings', label: 'Open Savings and Benefits',
      href: '/dashboard/properties/property-1/tools/savings-benefits', style: 'PRIMARY',
    }],
  }];
  if (populated) blocks.push({
    type: 'GROUPED_LIST', id: 'savings-opportunity-groups', title: 'Savings and benefits',
    description: 'Available estimates are planning signals.',
    sections: [{
      id: 'recurring', title: 'Recurring-cost opportunities', count: 1,
      items: [{
        id: 'recurring-1', title: 'UTILITY_RATE_SWITCH',
        description: 'A recorded recurring-cost opportunity.', meta: ['$240/year'],
        status: 'FOUND_SAVINGS', href: null,
      }],
    }], actions: [],
  });
  return { status, blocks, suggestions: [] };
}

test('the exact first-party savings prompt routes directly', () => {
  const routing = resolveAskRoutingCascade(QUESTION);
  assert.equal(routing.operation.operationId, 'SAVINGS_OPPORTUNITIES');
  assert.equal(routing.requiresClarification, false);
});

test('canonical savings outcomes pass relevance initially and after clarification', () => {
  for (const result of [
    savingsResult(),
    savingsResult({ populated: true }),
    savingsResult({ status: 'READY_WITH_LIMITATIONS' }),
  ]) {
    assert.equal(matchesSavingsOpportunitiesAnswerContract(result), true);
    const relevance = validateAskSemanticAnswerRelevance({
      question: QUESTION, operationId: 'SAVINGS_OPPORTUNITIES', result,
    });
    assert.equal(relevance.outcome, 'PASS');
    assert.deepEqual(relevance.reasonCodes, ['CANONICAL_TYPED_ANSWER_CONTRACT_MATCH']);

    const afterClarification = validateAskAnswerTrustPipeline({
      question: `${QUESTION}\nClarification: find ways to lower home costs`,
      operationId: 'SAVINGS_OPPORTUNITIES', propertyId: 'property-1',
      semanticEnabled: true, recoveryAttempted: true, operationConfirmedByUser: true,
      result: attachAskAuthoritativeSourceEvidence(
        result,
        [completedAskAuthoritativeSourceEvidence('SAVINGS_OPPORTUNITIES')],
      ),
    });
    assert.equal(afterClarification.semantic.outcome, 'PASS');
    assert.equal(afterClarification.result.status, result.status);
    assert.notEqual(afterClarification.result.reasonCode, 'ASK_ANSWER_RELEVANCE_UNRESOLVED_AFTER_CLARIFICATION');
  }
});

test('the savings contract rejects unrelated canonical response blocks', () => {
  assert.equal(matchesSavingsOpportunitiesAnswerContract({
    status: 'ANSWERED', suggestions: [],
    blocks: [{
      type: 'SUMMARY', id: 'ownership-costs-summary', title: 'Ownership costs',
      body: 'Recorded monthly expenses.', tone: 'DEFAULT', actions: [],
    }],
  }), false);
});
