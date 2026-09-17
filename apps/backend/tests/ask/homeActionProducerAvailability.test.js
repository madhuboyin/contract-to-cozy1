const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// FRD ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md §14.2 ATT-102/ATT-105
// / T08 fix (docs/architecture/ASK_COZY_PHASE5_ATTENTION_ACCEPTANCE_VERIFICATION.md).
// Pure (no DB access), so this imports it directly from
// askOrchestrator.service.ts, same convention as mergeEvidence and
// isCapitalTimelineAnalysisStale.
const { formatUnavailableHomeActionProducers } = require('../../src/services/ask/askOrchestrator.service.ts');

test('a single known producer is labeled by its homeowner-facing name, not its internal code', () => {
  assert.equal(formatUnavailableHomeActionProducers(['ENVIRONMENT_REPORT']), 'environment and severe-weather insight');
  assert.equal(formatUnavailableHomeActionProducers(['PERSONALIZATION']), 'personalized recommendation');
});

test('two unavailable producers are joined into one readable disclosure', () => {
  const result = formatUnavailableHomeActionProducers(['ENVIRONMENT_REPORT', 'PERSONALIZATION']);
  assert.equal(result, 'environment and severe-weather insight and personalized recommendation');
});

test('an unrecognized producer code falls back to a lowercased label rather than throwing or showing raw uppercase', () => {
  assert.equal(formatUnavailableHomeActionProducers(['SOME_NEW_PRODUCER']), 'some_new_producer');
});

test('an empty list produces an empty string (the caller only renders the disclosure block when the list is non-empty)', () => {
  assert.equal(formatUnavailableHomeActionProducers([]), '');
});
