const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Intelligence Functional Completeness FRD Phase 4 (HI-OUT-002) — the
// consequence-based completion evidence gate. Pure (no DB), mirrors
// COMPLETION_EVIDENCE_POLICY (services/intelligence/completionEvidencePolicy
// .registry.ts) verbatim.

const {
  assertCompletionEvidenceSatisfied,
  CompletionEvidencePolicyViolationError,
} = require('../../src/services/homeActionCompletion.service.ts');

test('LOW_CONSEQUENCE work completes with no cost or observed result', () => {
  assert.doesNotThrow(() => assertCompletionEvidenceSatisfied('LOW_CONSEQUENCE', {}));
});

test('MATERIAL_FINANCIAL work requires a cost or an observed result', () => {
  assert.throws(
    () => assertCompletionEvidenceSatisfied('MATERIAL_FINANCIAL', {}),
    CompletionEvidencePolicyViolationError,
  );
  assert.doesNotThrow(() => assertCompletionEvidenceSatisfied('MATERIAL_FINANCIAL', { costCents: 5000 }));
  assert.doesNotThrow(() => assertCompletionEvidenceSatisfied('MATERIAL_FINANCIAL', { observedResult: 'CONFIRMED_HEALTHY' }));
});

test('REGULATED_COVERAGE work cannot be completed by simple attestation regardless of cost/result supplied', () => {
  assert.throws(
    () => assertCompletionEvidenceSatisfied('REGULATED_COVERAGE', { costCents: 5000, observedResult: 'CONFIRMED_HEALTHY' }),
    CompletionEvidencePolicyViolationError,
  );
});

test('SAFETY_EMERGENCY work cannot be completed by simple attestation', () => {
  assert.throws(
    () => assertCompletionEvidenceSatisfied('SAFETY_EMERGENCY', {}),
    CompletionEvidencePolicyViolationError,
  );
});
