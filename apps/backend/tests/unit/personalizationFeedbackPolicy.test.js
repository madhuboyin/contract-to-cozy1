const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { decideSuppressionForFeedback, DISMISSED_SUPPRESSION_DAYS } = require('../../src/modules/personalization/domain/feedbackPolicy.ts');

test('implicit feedback never suppresses, regardless of type', () => {
  assert.equal(decideSuppressionForFeedback('VIEWED', false), null);
  assert.equal(decideSuppressionForFeedback('NOT_RELEVANT', false), null);
  assert.equal(decideSuppressionForFeedback('DISMISSED', false), null);
});

test('explicit NOT_RELEVANT suppresses the property/definition indefinitely', () => {
  const directive = decideSuppressionForFeedback('NOT_RELEVANT', true);
  assert.deepEqual(directive, { until: null, reason: 'USER_DISMISSED' });
});

test('explicit DISMISSED suppresses the property/definition for a bounded window', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const directive = decideSuppressionForFeedback('DISMISSED', true, now);
  assert.equal(directive.reason, 'USER_DISMISSED');
  assert.equal(directive.until.getTime(), now.getTime() + DISMISSED_SUPPRESSION_DAYS * 24 * 60 * 60 * 1000);
});

test('explicit feedback of an unhandled type does not suppress', () => {
  assert.equal(decideSuppressionForFeedback('VIEWED', true), null);
  assert.equal(decideSuppressionForFeedback('ACCEPTED', true), null);
  assert.equal(decideSuppressionForFeedback('COMPLETED', true), null);
});

test('PER-FDBK-001: explicit negative has a nonzero effect, implicit always has none', () => {
  const explicitNotRelevant = decideSuppressionForFeedback('NOT_RELEVANT', true);
  const implicitNotRelevant = decideSuppressionForFeedback('NOT_RELEVANT', false);
  assert.notEqual(explicitNotRelevant, null);
  assert.equal(implicitNotRelevant, null);
});

test('graduated severity: NOT_RELEVANT is indefinite, DISMISSED is bounded', () => {
  const notRelevant = decideSuppressionForFeedback('NOT_RELEVANT', true);
  const dismissed = decideSuppressionForFeedback('DISMISSED', true);
  assert.equal(notRelevant.until, null);
  assert.notEqual(dismissed.until, null);
});
