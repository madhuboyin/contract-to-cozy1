const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { decideClarificationLoop, mayAssumeInterpretation, sameIntentOverlap } = require('../../src/services/ask/support/clarificationLoop.ts');

// BICC-UND-007/008/009: one consecutive clarification per unresolved intent; then a labelled best interpretation for plain reads only.
const NOW = new Date('2026-11-22T12:00:00Z');
const previous = (extra = {}) => ({ status: 'NEEDS_CLARIFICATION', reasonCode: 'ASK_ROUTING_AMBIGUOUS', message: 'what is coming up for my house', createdAt: new Date('2026-11-22T11:55:00Z'), ...extra });
const read = [{ operationId: 'MAINTENANCE_STATUS', confidence: 0.7 }, { operationId: 'PROPERTY_SUMMARY', confidence: 0.5 }];
const decide = (extra = {}) => decideClarificationLoop({ previous: previous(), message: 'what is coming up for my house?', candidates: read, entityAmbiguous: false, now: NOW, ...extra });

test('the first clarification is always asked', () => {
  assert.deepEqual(decide({ previous: null }), { kind: 'ASK' });
  assert.deepEqual(decide({ previous: previous({ status: 'ANSWERED', reasonCode: null }) }), { kind: 'ASK' });
});

test('repeating the same request after a clarification gets the best-supported read, not a second clarification', () => {
  assert.deepEqual(decide(), { kind: 'ASSUME', operationId: 'MAINTENANCE_STATUS', reason: 'CLARIFICATION_LIMIT_REACHED' });
  assert.deepEqual(decide({ message: 'what is coming up around my house' }).kind, 'ASSUME');
});

test('the highest-confidence read candidate is the interpretation', () => {
  const out = decide({ candidates: [{ operationId: 'PROPERTY_SUMMARY', confidence: 0.4 }, { operationId: 'MAINTENANCE_STATUS', confidence: 0.9 }] });
  assert.equal(out.operationId, 'MAINTENANCE_STATUS');
});

test('a different request is new information and starts a fresh clarification budget', () => {
  assert.deepEqual(decide({ message: 'which warranties expire this year' }), { kind: 'ASK' });
});

test('a clarification older than the window is not a loop', () => {
  assert.deepEqual(decide({ previous: previous({ createdAt: new Date('2026-11-22T10:00:00Z') }) }), { kind: 'ASK' });
});

test('UND-009: an unresolved entity is never guessed', () => {
  assert.deepEqual(decide({ entityAmbiguous: true }), { kind: 'ASK' });
});

test('UND-009: a write, a material decision and a boundary are never assumed', () => {
  for (const operationId of ['MAINTENANCE_TASK_CREATE', 'INVENTORY_ITEM_CREATE', 'EMERGENCY_BOUNDARY', 'OUT_OF_SCOPE_BOUNDARY']) {
    assert.equal(decide({ candidates: [{ operationId, confidence: 0.9 }] }).kind, 'ASK', operationId);
  }
  assert.equal(mayAssumeInterpretation('MAINTENANCE_STATUS'), true);
  assert.equal(mayAssumeInterpretation('GROUNDED_GUIDANCE'), false, 'a remote-generation operation is not a plain read');
  assert.deepEqual(decide({ candidates: [] }), { kind: 'ASK' });
});

test('only routing and skill ambiguity count as a clarification to break', () => {
  assert.deepEqual(decide({ previous: previous({ reasonCode: 'SOMETHING_ELSE' }) }), { kind: 'ASK' });
  assert.equal(decide({ previous: previous({ reasonCode: 'ASK_SKILL_AMBIGUOUS' }) }).kind, 'ASSUME');
});

test('the same-intent overlap is high for a rephrase and low for a new request', () => {
  assert.ok(sameIntentOverlap('what is coming up for my house', 'what is coming up for my house?') >= 0.99);
  assert.ok(sameIntentOverlap('what is coming up for my house', 'which warranties expire this year') < 0.2);
  assert.equal(sameIntentOverlap('', 'anything'), 0);
});
