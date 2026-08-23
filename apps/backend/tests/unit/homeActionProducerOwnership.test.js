const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  HOME_ACTION_PRODUCER_OWNERSHIP,
  validateHomeActionProducerOwnership,
  validateHomeActionProducerKindConsistency,
  HOME_ACTION_ADAPTER_OWNERSHIP,
} = require('../../src/services/intelligence/index.ts');

test('validateHomeActionProducerOwnership passes cleanly on the real registry', () => {
  assert.deepEqual(validateHomeActionProducerOwnership(HOME_ACTION_PRODUCER_OWNERSHIP), []);
});

test('validateHomeActionProducerKindConsistency passes cleanly on the real registry', () => {
  assert.deepEqual(
    validateHomeActionProducerKindConsistency(HOME_ACTION_PRODUCER_OWNERSHIP, HOME_ACTION_ADAPTER_OWNERSHIP),
    [],
  );
});

test('validateHomeActionProducerOwnership fails fast on a duplicate producerId', () => {
  const dup = [...HOME_ACTION_PRODUCER_OWNERSHIP, HOME_ACTION_PRODUCER_OWNERSHIP[0]];
  const issues = validateHomeActionProducerOwnership(dup);
  assert.ok(issues.some((issue) => issue.includes('Duplicate homeActionProducerOwnership entry')));
});

test('validateHomeActionProducerKindConsistency fails fast when a producer silently disagrees with its kind default', () => {
  const bad = HOME_ACTION_PRODUCER_OWNERSHIP.map((entry) =>
    entry.producerId === 'loadIncidentActions'
      ? { ...entry, hasCompletionAdapter: true, completionAdapterOwner: 'made up for this test' }
      : entry);
  const issues = validateHomeActionProducerKindConsistency(bad, HOME_ACTION_ADAPTER_OWNERSHIP);
  assert.ok(issues.some((issue) => issue.includes('loadIncidentActions') && issue.includes('disagrees')));
});

/**
 * Loaders aren't dynamically enumerable from any object in the codebase —
 * homeActionSourcePromotion.service.ts's ~19 producer functions are plain
 * module-level declarations, not entries in a registry. This is the CI-time
 * completeness guardrail Phase 0 needs in place of a boot-time check: it
 * reads the real producer source files and asserts every declared
 * Home-Action-producing function has a row in HOME_ACTION_PRODUCER_OWNERSHIP,
 * so a new loader added without registering it fails here instead of
 * silently missing ownership.
 */
const PRODUCER_SOURCE_FILES = [
  '../../src/services/homeActionSourcePromotion.service.ts',
  '../../src/services/orchestration.service.ts',
  '../../src/services/entryContext.service.ts',
  '../../src/services/homeActions.service.ts',
];

const PRODUCER_FUNCTION_PATTERN = /(?:export\s+)?(?:async\s+)?function\s+((?:load\w+Actions)|adaptEnvironmentInsightsToHomeActions|adaptOrchestratedActionToHomeAction|getActivationFirstValue|appendAcceptedOperationalWork)\s*\(/g;

test('every Home-Action-producing function declared in the source files has a homeActionProducerOwnership entry', () => {
  const declaredProducerIds = new Set(HOME_ACTION_PRODUCER_OWNERSHIP.map((entry) => entry.producerId));
  const foundProducerIds = new Set();

  for (const relativePath of PRODUCER_SOURCE_FILES) {
    const filePath = path.join(__dirname, relativePath);
    const source = fs.readFileSync(filePath, 'utf8');
    for (const match of source.matchAll(PRODUCER_FUNCTION_PATTERN)) {
      foundProducerIds.add(match[1]);
    }
  }

  const missing = [...foundProducerIds].filter((id) => !declaredProducerIds.has(id));
  assert.deepEqual(missing, [], `Producer function(s) found in source but missing a homeActionProducerOwnership entry: ${missing.join(', ')}`);

  const stale = [...declaredProducerIds].filter((id) => !foundProducerIds.has(id));
  assert.deepEqual(stale, [], `homeActionProducerOwnership entry/entries reference producer function(s) no longer found in source: ${stale.join(', ')}`);
});
