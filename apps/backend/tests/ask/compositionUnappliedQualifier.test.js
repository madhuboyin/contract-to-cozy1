// FR-PLAN-5: a composed part whose explicit qualifier no operation applies is named as not answered, never run as the unfiltered subset.
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { decomposeForComposition } = require('../../src/services/ask/composition/decompose.ts');
const { unappliedQualifier } = require('../../src/services/ask/composition/unappliedQualifiers.ts');

test('detects relative windows, age thresholds and amount thresholds the operation cannot apply', () => {
  assert.equal(unappliedQualifier('WARRANTY_LOOKUP', 'show my warranties expiring in the next 90 days')?.kind, 'RELATIVE_WINDOW');
  assert.equal(unappliedQualifier('INVENTORY_LOOKUP', 'list my appliances older than 10 years')?.kind, 'AGE_THRESHOLD');
  assert.equal(unappliedQualifier('INVENTORY_LOOKUP', 'items worth more than $500')?.kind, 'AMOUNT_THRESHOLD');
  assert.equal(unappliedQualifier('WARRANTY_LOOKUP', 'show my warranties'), null);
  assert.equal(unappliedQualifier('ITEM_REPLACEMENT_COST', 'how much is my roof replacement in 5 years'), null);
});

test('a composed part with an unapplied window is deferred with the qualifier; the clean part is not run as a composite of one', () => {
  const outcome = decomposeForComposition('show my warranties expiring in the next 90 days and how much is my roof replacement');
  assert.notEqual(outcome.kind, 'COMPOSE', 'the filtered facet must not be composed as if complete');
  assert.match(outcome.detail ?? '', /next 90 days/);
});
