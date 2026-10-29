const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Regression: "Show my capital reserve outlook" matched no route (the pattern needed "capital reserve plan"), so it reached the model-backed fallback, whose
// answer could not be verified and was replaced by "I need one detail to verify this answer". The reserve-fund read is the deterministic answer to it.

const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');

test('the capital reserve questions reach the reserve plan read, not the grounded-guidance fallback', () => {
  for (const m of ['Show my capital reserve outlook', 'What is my capital reserve outlook?', 'Show my capital reserve', 'Capital reserve outlook', 'Show my reserve outlook',
    'Show my capital reserve plan', 'How is my reserve fund doing?', 'Show my reserve fund', 'How much should I save for repairs?']) {
    assert.equal(resolveAskOperation(m).operationId, 'CAPITAL_RESERVE_PLAN', m);
  }
});

test('a contribution change is still not the read', () => {
  assert.notEqual(resolveAskOperation('Set my reserve contribution to $500 a month').operationId, 'CAPITAL_RESERVE_PLAN');
});
