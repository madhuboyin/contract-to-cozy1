require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');

const { unmatchedPhrases, agreementRefusalCopy } = require('../../src/services/ask/support/unmatchedWords.ts');

// "I need a clearer question" was shown when the typed-grammar agreement gate declined a read. The question was clear; the capability was missing. The refusal now names what could not be matched.
test('live #9: the unmatched status and the amount comparison are named; the headline no longer asks for a clearer question', () => {
  const copy = agreementRefusalCopy('which completed maintenance tasks cost over $1000?');
  assert.equal(copy.title, 'I can’t answer that as asked');
  assert.match(copy.body, /“completed” and “over \$1000”/);
  assert.match(copy.body, /didn’t run this and haven’t guessed/);
  assert.match(copy.body, /without those parts/);
  assert.doesNotMatch(copy.title + copy.body, /clearer question/);
});

test('live #20: adjacent unresolved words are merged into one phrase', () => {
  assert.deepEqual(unmatchedPhrases('show maintenance tasks scheduled for next spring that require a licensed professional'), ['scheduled', 'next spring', 'licensed professional']);
});

test('live #17: three phrases at most, in the order written', () => {
  assert.deepEqual(unmatchedPhrases('which appliances have an estimated replacement cost over $1000 and high failure risk?'), ['estimated', 'over $1000', 'high failure risk']);
});

test('one phrase reads "that part"; a span that covers the message names nothing and the copy stays generic and truthful', () => {
  assert.match(agreementRefusalCopy('which appliances have an estimated replacement cost').body, /without that part/);
  const generic = agreementRefusalCopy('which maintenance tasks cost over $1000?');
  assert.doesNotMatch(generic.body, /“/);
  assert.match(generic.body, /one part at a time/);
});
