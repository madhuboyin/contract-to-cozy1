const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Intelligence Functional Completeness FRD Phase 3 review finding 4.

const {
  validateDecisionLineagePolicyReferences,
} = require('../../src/services/intelligence/homeActionProducerOwnership.contract.ts');
const { HOME_ACTION_PRODUCER_OWNERSHIP } = require('../../src/services/intelligence/homeActionProducerOwnership.ts');

test('validateDecisionLineagePolicyReferences passes cleanly on the real registry', () => {
  assert.deepEqual(validateDecisionLineagePolicyReferences(HOME_ACTION_PRODUCER_OWNERSHIP), []);
});

test('every producer declares a decisionLineagePolicy', () => {
  for (const producer of HOME_ACTION_PRODUCER_OWNERSHIP) {
    assert.ok(producer.decisionLineagePolicy, `${producer.producerId} has no decisionLineagePolicy`);
    assert.ok(
      ['NOT_REQUIRED', 'CONTEXT_CAPTURE_ONLY', 'DECISION_REQUIRED', 'VARIES_BY_INSTANCE'].includes(producer.decisionLineagePolicy.kind),
      `${producer.producerId} declares an unknown decisionLineagePolicy.kind`,
    );
  }
});

test('fails fast on an unregistered decisionDefinitionId', () => {
  const issues = validateDecisionLineagePolicyReferences([
    { producerId: 'fakeProducer', decisionLineagePolicy: { kind: 'DECISION_REQUIRED', decisionDefinitionId: 'NOT_A_REAL_FAMILY' } },
  ]);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /fakeProducer/);
});

test('fails fast on a VARIES_BY_INSTANCE policy with no rationale', () => {
  const issues = validateDecisionLineagePolicyReferences([
    { producerId: 'fakeProducer', decisionLineagePolicy: { kind: 'VARIES_BY_INSTANCE', rationale: '   ' } },
  ]);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /fakeProducer/);
});
