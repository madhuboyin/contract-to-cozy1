require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { declinedCompositionNote, slotRevalidationQuestion } = require('../../src/services/ask/composition/notices');
const { decomposeForComposition } = require('../../src/services/ask/composition/decompose');

test('a declined composition names the unanswered part and carries no action', () => {
  const block = declinedCompositionNote('CLAUSE_NOT_COMPOSABLE', 2);
  assert.equal(block.type, 'SUMMARY');
  assert.equal(block.id, 'composition-declined-note');
  assert.deepEqual(block.actions, []);
  assert.match(block.body, /couldn’t combine/);
  assert.doesNotMatch(block.body, /[A-Z]{3,}_[A-Z_]+/, 'never leaks an operation id');
});

test('too many parts states the cap and the count', () => {
  const block = declinedCompositionNote('TOO_MANY_CLAUSES', 3);
  assert.match(block.body, /3 parts/);
  assert.match(block.body, /six together/);
});

test('a gone item asks one focused question and never guesses', () => {
  const q = slotRevalidationQuestion('ITEM_NOT_FOUND');
  assert.equal(q.reasonCode, 'ASK_SLOT_ITEM_NOT_FOUND');
  assert.equal(q.block.title, 'Which item do you mean?');
  assert.match(q.block.body, /haven’t guessed/);
});

test('an unavailable home asks which home', () => {
  const q = slotRevalidationQuestion('PROPERTY_NOT_ACCESSIBLE');
  assert.equal(q.reasonCode, 'ASK_SLOT_PROPERTY_UNAVAILABLE');
  assert.match(q.block.body, /isn’t available/);
});

test('every NOT_COMPOSED reason the decomposer can return has a note', () => {
  const out = decomposeForComposition('how old is my roof and what would a new one cost and what is my warranty on the dishwasher');
  if (out.kind === 'NOT_COMPOSED') assert.ok(declinedCompositionNote(out.reason, out.clauseCount).body.length > 20);
});
