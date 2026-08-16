const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { isIncompleteInventoryRequest, matchesIncompleteInventoryAnswerContract } = require('../../src/services/ask/askInventoryIntent.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { validateAskSemanticAnswerRelevance } = require('../../src/services/ask/askSemanticAnswerValidator.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const {
  attachAskAuthoritativeSourceEvidence,
  completedAskAuthoritativeSourceEvidence,
} = require('../../src/services/ask/askAnswerTrustPolicy.ts');

const QUESTION = 'Show missing inventory details';
const FIRST_PARTY_QUESTION = 'Show incomplete inventory records';

test('first-party missing-inventory suggestion binds to incomplete inventory intent', () => {
  assert.equal(isIncompleteInventoryRequest(QUESTION), true);
  assert.equal(isIncompleteInventoryRequest('Show incomplete inventory records'), true);
  assert.equal(isIncompleteInventoryRequest('Which inventory details are missing?'), true);
  assert.equal(isIncompleteInventoryRequest('List all appliances'), false);

  const routing = resolveAskRoutingCascade(QUESTION);
  assert.equal(routing.operation.operationId, 'INVENTORY_LOOKUP');
  assert.equal(routing.requiresClarification, false);
});

test('incomplete inventory answer passes semantic relevance for the first-party suggestion', () => {
  const result = {
    status: 'READY_WITH_LIMITATIONS',
    reasonCode: 'INVENTORY_RECORD_INCOMPLETE',
    blocks: [{
      type: 'SUMMARY', id: 'inventory-summary',
      title: 'Here is what the Home Record contains for Refrigerator',
      body: 'Four important inventory details are still missing. Unknown fields remain unknown and are not inferred.',
      tone: 'CAUTION', actions: [],
    }, {
      type: 'GROUPED_LIST', id: 'inventory-results', title: 'Incomplete inventory records',
      sections: [{
        id: 'items', title: 'Living Home Record', count: 1,
        items: [{
          id: 'refrigerator', title: 'Refrigerator',
          description: 'Missing: brand or manufacturer, model, install or purchase date, and documents',
          meta: ['Brand/model not recorded', 'Install/purchase date not recorded'], status: 'UNKNOWN', href: null,
        }],
      }], actions: [],
    }],
    suggestions: [],
  };
  const relevance = validateAskSemanticAnswerRelevance({
    question: QUESTION,
    operationId: 'INVENTORY_LOOKUP',
    result,
  });
  assert.equal(relevance.outcome, 'PASS');

  const afterClarification = validateAskAnswerTrustPipeline({
    question: `${QUESTION}\nClarification: look up appliance, system, or equipment details`,
    operationId: 'INVENTORY_LOOKUP',
    propertyId: 'property-1',
    semanticEnabled: true,
    recoveryAttempted: true,
    result: attachAskAuthoritativeSourceEvidence(
      result,
      [completedAskAuthoritativeSourceEvidence('INVENTORY_LOOKUP')],
    ),
  });
  assert.equal(afterClarification.semantic.outcome, 'PASS');
  assert.equal(afterClarification.result.status, 'READY_WITH_LIMITATIONS');
  assert.notEqual(afterClarification.result.reasonCode, 'ASK_ANSWER_RELEVANCE_UNRESOLVED_AFTER_CLARIFICATION');
});

test('exact first-party prompt accepts every canonical incomplete-inventory result shape after synthesis and clarification', () => {
  const canonicalResults = [{
    status: 'READY_WITH_LIMITATIONS', reasonCode: 'INVENTORY_NOT_RECORDED',
    blocks: [{
      type: 'SUMMARY', id: 'inventory-empty', title: 'No inventory items are recorded for this home yet',
      body: 'The generated summary can use different words without changing the canonical empty-record outcome.',
      tone: 'CAUTION', actions: [],
    }], suggestions: [],
  }, {
    status: 'ANSWERED', reasonCode: 'INVENTORY_MATCH_NOT_FOUND',
    blocks: [{
      type: 'SUMMARY', id: 'inventory-no-match', title: 'I could not find incomplete inventory records',
      body: 'The generated summary can use different words without changing the canonical no-match outcome.',
      tone: 'DEFAULT', actions: [],
    }], suggestions: [],
  }, {
    status: 'ANSWERED',
    blocks: [{
      type: 'SUMMARY', id: 'inventory-summary', title: '2 inventory records match this request',
      body: 'A concise generated overview of the records follows.', tone: 'DEFAULT', actions: [],
    }, {
      type: 'GROUPED_LIST', id: 'inventory-results', title: 'Incomplete inventory records', description: null,
      sections: [{
        id: 'items', title: 'Living Home Record', count: 2,
        items: [{ id: 'fridge', title: 'Refrigerator', description: 'Missing: Model', meta: [], status: 'UNKNOWN', href: null }],
      }], actions: [],
    }], suggestions: [],
  }];

  for (const result of canonicalResults) {
    assert.equal(matchesIncompleteInventoryAnswerContract(result), true);
    const initial = validateAskSemanticAnswerRelevance({
      question: FIRST_PARTY_QUESTION, operationId: 'INVENTORY_LOOKUP', result,
    });
    assert.equal(initial.outcome, 'PASS');
    assert.deepEqual(initial.reasonCodes, ['CANONICAL_TYPED_ANSWER_CONTRACT_MATCH']);

    const afterClarification = validateAskAnswerTrustPipeline({
      question: `${FIRST_PARTY_QUESTION}\nClarification: look up appliance, system, or equipment details`,
      operationId: 'INVENTORY_LOOKUP', propertyId: 'property-1', semanticEnabled: true, recoveryAttempted: true,
      result: attachAskAuthoritativeSourceEvidence(
        result,
        [completedAskAuthoritativeSourceEvidence('INVENTORY_LOOKUP')],
      ),
    });
    assert.equal(afterClarification.semantic.outcome, 'PASS');
    assert.notEqual(afterClarification.result.reasonCode, 'ASK_ANSWER_RELEVANCE_UNRESOLVED_AFTER_CLARIFICATION');
  }
});
