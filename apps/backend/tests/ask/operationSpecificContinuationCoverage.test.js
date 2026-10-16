const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

require('ts-node/register');

// Suggested Next Actions plan §17, step 1: exhaustive executable baseline. The hash makes a registry addition fail until its
// continuation classification is reviewed; MIGRATION_REQUIRED is an explicit temporary backlog, never a claim of completion.
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { CURATED_STARTER_OUTCOME_KEYS } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const {
  OPERATION_SPECIFIC_CONTINUATION_COVERAGE_CLASSES,
  OPERATION_SPECIFIC_CONTINUATION_EXEMPTIONS,
  REVIEWED_CONTEXTUAL_CONTINUATION_OPERATIONS,
  buildOperationSpecificContinuationCoverage,
  governedOperationSpecificOutcomes,
  validateOperationSpecificContinuationCoverage,
} = require('../../src/services/ask/suggestedActions/operationSpecificContinuationCoverage.ts');

const REVIEWED_OPERATION_REGISTRY_HASH = '0e95239c203d425bae361cfe50d4a4afc799c3120635e6e8f00a15d157bd1de2';
const registryIds = () => Object.keys(ASK_OPERATION_DEFINITIONS).sort();
const registryHash = () => createHash('sha256').update(registryIds().join('\n')).digest('hex');

test('every registered operation has exactly one continuation-coverage classification', () => {
  assert.equal(registryHash(), REVIEWED_OPERATION_REGISTRY_HASH, 'Ask operation registry changed: review continuation coverage and update the reviewed hash');
  const ledger = buildOperationSpecificContinuationCoverage();
  assert.deepEqual(ledger.map((entry) => entry.operationId), registryIds());
  for (const entry of ledger) {
    assert.ok(OPERATION_SPECIFIC_CONTINUATION_COVERAGE_CLASSES.includes(entry.coverageClass), entry.operationId);
    assert.ok(entry.evidence.length > 20, `${entry.operationId}: missing evidence`);
  }
});

test('generic starters and recovery-only retries do not count as operation-specific coverage', () => {
  assert.ok(CURATED_STARTER_OUTCOME_KEYS.length > 0, 'the test must exercise a real generic starter inventory');
  assert.deepEqual(governedOperationSpecificOutcomes('MAINTENANCE_TASK_CREATE'), []);
  assert.deepEqual(governedOperationSpecificOutcomes('REFINANCE_RATE_MONITOR'), []);
  assert.deepEqual(governedOperationSpecificOutcomes('QUOTE_COMPARISON_CREATE'), []);
});

test('reviewed contextual surfaces and state exemptions are explicit and registered', () => {
  assert.ok(REVIEWED_CONTEXTUAL_CONTINUATION_OPERATIONS.SEASONAL_HOME_CARE);
  assert.ok(REVIEWED_CONTEXTUAL_CONTINUATION_OPERATIONS.HOME_HABITS);
  assert.deepEqual(Object.keys(OPERATION_SPECIFIC_CONTINUATION_EXEMPTIONS).sort(), [
    'CAPABILITY_DISCOVERY', 'EMERGENCY_BOUNDARY', 'GROUNDED_GUIDANCE', 'OUT_OF_SCOPE_BOUNDARY', 'UNSAFE_RESTRICTED_BOUNDARY',
  ]);
  for (const operationId of [...Object.keys(REVIEWED_CONTEXTUAL_CONTINUATION_OPERATIONS), ...Object.keys(OPERATION_SPECIFIC_CONTINUATION_EXEMPTIONS)]) {
    assert.ok(ASK_OPERATION_DEFINITIONS[operationId], operationId);
  }
});

test('the strict completion validator exposes the bounded migration backlog', () => {
  const ledger = buildOperationSpecificContinuationCoverage();
  const missing = ledger.filter((entry) => entry.coverageClass === 'MIGRATION_REQUIRED');
  const issues = validateOperationSpecificContinuationCoverage();
  assert.ok(missing.length > 0, 'remove this backlog assertion when Phase 17 reaches zero');
  assert.deepEqual(issues, missing.map((entry) => `${entry.operationId}: operation-specific continuation required`));
});

