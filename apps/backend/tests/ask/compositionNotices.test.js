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

// The note says a part of the question was not answered. It must not be added to a typed answer that applied every part ("kitchen appliances with no warranty and over 5 years old"
// splits into two clauses, one of which does not route alone, yet the typed plan applies all three conditions).
const { typedAnswerCoversWholeMessage } = require('../../src/services/ask/composition/notices');
const { executeSemanticSlice, SLICE_SEEDED_PROPERTY_SNAPSHOT, SLICE_OWNER_AUTH } = require('../../src/services/ask/semantic/slice');
const { executeCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain');

test('the live prompt: the decomposer declines it, but the typed answer covers all three conditions, so no note', () => {
  const message = 'which kitchen appliances have no warranty and are over 5 years old?';
  assert.equal(decomposeForComposition(message, { eligibleOperationIds: new Set(['INVENTORY_LOOKUP', 'DATA_POINT_READ']), knownNames: [] }).kind, 'NOT_COMPOSED');
  const answered = executeSemanticSlice({ rawText: message, snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT, auth: SLICE_OWNER_AUTH }).operationResult;
  assert.equal(answered.status, 'ANSWERED');
  assert.equal(typedAnswerCoversWholeMessage(answered), true);
});

test('a cross-domain answer with a named gap (PARTIAL, overflow facet) still gets the note; a complete one does not', async () => {
  const partial = await executeCrossDomainSnapshot({ rawText: 'are there any open claims or pending permits for this home?', snapshot: buildSeededCrossDomainSnapshot(), role: 'OWNER', propertyAuthorized: true });
  assert.equal(partial.status, 'PARTIAL');
  assert.equal(typedAnswerCoversWholeMessage({ status: 'ANSWERED', parameters: { crossDomainExecution: partial } }), false);
  assert.equal(typedAnswerCoversWholeMessage({ status: 'ANSWERED', parameters: { crossDomainExecution: { status: 'ANSWERED', overflowFacets: [] } } }), true);
});

test('anything that is not a typed, complete answer keeps the note: legacy operations, non-answers', () => {
  assert.equal(typedAnswerCoversWholeMessage({ status: 'ANSWERED', parameters: { operationId: 'WARRANTY_LOOKUP' } }), false);
  assert.equal(typedAnswerCoversWholeMessage({ status: 'ANSWERED' }), false);
  assert.equal(typedAnswerCoversWholeMessage({ status: 'NEEDS_CLARIFICATION', parameters: { semanticExecutionReceipt: {} } }), false);
  assert.equal(typedAnswerCoversWholeMessage({ status: 'UNSUPPORTED', parameters: { semanticExecutionReceipt: {} } }), false);
});
