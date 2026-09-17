const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// FRD ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md §11.3 F05 fix
// (docs/architecture/ASK_COZY_PHASE3_PHASE7_FINANCIAL_ACCEPTANCE_VERIFICATION.md).
// Pure (no DB access), so this imports it directly from
// askOrchestrator.service.ts, same convention as parseRefinanceScenarioEdit
// and isAllPropertyAttentionRequest.
const { isCapitalTimelineAnalysisStale } = require('../../src/services/ask/askOrchestrator.service.ts');

test('no analysis at all is not "stale" -- it is absent, a different case the caller handles separately', () => {
  assert.equal(isCapitalTimelineAnalysisStale(null, 'context-v1'), false);
  assert.equal(isCapitalTimelineAnalysisStale(undefined, 'context-v1'), false);
});

test('a matching stored contextVersion is not stale', () => {
  const analysis = { inputsSnapshot: { _propertyContextVersion: 'context-v1', inventoryItemCount: 3 } };
  assert.equal(isCapitalTimelineAnalysisStale(analysis, 'context-v1'), false);
});

test('a changed contextVersion (e.g. inventory item added/edited) is stale', () => {
  const analysis = { inputsSnapshot: { _propertyContextVersion: 'context-v1', inventoryItemCount: 3 } };
  assert.equal(isCapitalTimelineAnalysisStale(analysis, 'context-v2'), true);
});

test('an analysis with no inputsSnapshot at all is treated as stale (fails toward recomputing, not silently serving unknown freshness)', () => {
  assert.equal(isCapitalTimelineAnalysisStale({ inputsSnapshot: null }, 'context-v1'), true);
  assert.equal(isCapitalTimelineAnalysisStale({ inputsSnapshot: undefined }, 'context-v1'), true);
});

test('an inputsSnapshot with no _propertyContextVersion field is treated as stale', () => {
  const analysis = { inputsSnapshot: { inventoryItemCount: 3 } };
  assert.equal(isCapitalTimelineAnalysisStale(analysis, 'context-v1'), true);
});

test('a malformed (array) inputsSnapshot is treated as stale, not thrown', () => {
  const analysis = { inputsSnapshot: ['not', 'an', 'object'] };
  assert.equal(isCapitalTimelineAnalysisStale(analysis, 'context-v1'), true);
});
