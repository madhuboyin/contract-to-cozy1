const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// FRD ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md §14.2 ATT-104 / T03
// fix (docs/architecture/ASK_COZY_PHASE5_ATTENTION_ACCEPTANCE_VERIFICATION.md).
// Pure (no DB access), so this imports it directly from
// askOrchestrator.service.ts, same convention as parseRefinanceScenarioEdit
// and mergeMaintenanceViewContinuation.
const { isAllPropertyAttentionRequest } = require('../../src/services/ask/askOrchestrator.service.ts');

test('several "all properties" phrasings are recognized', () => {
  const phrasings = [
    'What needs attention across all my properties?',
    'Show me everything across all my homes',
    'What needs attention at all properties?',
    'Show me all my properties',
    'What needs attention across every property?',
    'What needs attention across our properties?',
  ];
  for (const message of phrasings) {
    assert.equal(isAllPropertyAttentionRequest(message), true, `expected "${message}" to be recognized as an all-property request`);
  }
});

test('an ordinary single-property question is not treated as an all-property request', () => {
  assert.equal(isAllPropertyAttentionRequest('What needs my attention right now?'), false);
  assert.equal(isAllPropertyAttentionRequest('What is urgent at this property?'), false);
  assert.equal(isAllPropertyAttentionRequest('Show me my Home Actions'), false);
});

test('a question that merely mentions "property" without "all"/"every" is not treated as an all-property request', () => {
  assert.equal(isAllPropertyAttentionRequest('What does this property need?'), false);
});
