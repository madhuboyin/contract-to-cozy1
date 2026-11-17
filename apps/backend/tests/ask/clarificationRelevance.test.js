require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');

const { relevantCandidates, distinctiveWords, operationIsRelevantTo } = require('../../src/services/ask/support/clarificationRelevance.ts');
const { didYouMeanOptions, buildDidYouMeanResult } = require('../../src/services/ask/support/didYouMean.ts');
const { routingClarificationResult } = require('../../src/services/ask/execution/createAskExecution.ts');
const { findClarificationViolations } = require('../../src/services/ask/support/clarificationContract.ts');

// A "Did you mean…" / "What would you like to focus on?" card offers the router's nearest operations. Nearest is not related: these are the live prompts that were offered options
// the homeowner could not connect to their own words. An option is offered only when the message shares a distinctive word with that operation's own vocabulary.
const c = (...ids) => ids.map((operationId, i) => ({ operationId, confidence: 0.5 - i * 0.01 }));
const ids = (list) => list.map((x) => x.operationId);

test('live prompt #15 "missing receipts…": the claims option is dropped, the document options stay', () => {
  const kept = ids(relevantCandidates('show items with missing receipts in the kitchen or laundry room', c('BUYER_DOCUMENT_READINESS', 'COVERAGE_REVIEW_STATUS', 'INCIDENT_CLAIM_STATUS', 'INVENTORY_LOOKUP')));
  assert.ok(!kept.includes('INCIDENT_CLAIM_STATUS'));
  assert.ok(kept.includes('INVENTORY_LOOKUP'));
});

test('live prompt #4 "appliances with missing documents…": the claims option is dropped, the document options stay', () => {
  const kept = ids(relevantCandidates('list appliances that have missing documents and are high risk', c('BUYER_DOCUMENT_READINESS', 'INCIDENT_CLAIM_STATUS', 'DOCUMENT_PROMOTION_REVIEW', 'DOCUMENT_LOOKUP')));
  assert.deepEqual(kept, ['BUYER_DOCUMENT_READINESS', 'DOCUMENT_PROMOTION_REVIEW', 'DOCUMENT_LOOKUP']);
});

test('generic words prove nothing: "show", "items", "and", "have" are not distinctive', () => {
  assert.deepEqual(distinctiveWords('show me the items that have'), []);
  assert.equal(operationIsRelevantTo('show items and have', 'INCIDENT_CLAIM_STATUS'), false);
});

test('a message with no distinctive words, or one that shares a word with no candidate (a paraphrase), is not judged: nothing is removed', () => {
  assert.deepEqual(ids(relevantCandidates('what should I do', c('MAINTENANCE_STATUS', 'HOME_ACTIONS'))), ['MAINTENANCE_STATUS', 'HOME_ACTIONS']);
  // "chores" and "fridge" are not in any vocabulary the candidates share, so the gate cannot tell paraphrase from unrelated.
  assert.deepEqual(ids(relevantCandidates('any chores i havent done yet', c('MAINTENANCE_FORECAST', 'MAINTENANCE_STATUS'))).length, 2);
  assert.deepEqual(ids(relevantCandidates(null, c('MAINTENANCE_STATUS', 'HOME_ACTIONS'))), ['MAINTENANCE_STATUS', 'HOME_ACTIONS']);
});

test('the three-option limit applies after the gate, so an unrelated first choice no longer uses up a slot', () => {
  const eligible = new Set(['INCIDENT_CLAIM_STATUS', 'BUYER_DOCUMENT_READINESS', 'DOCUMENT_PROMOTION_REVIEW', 'DOCUMENT_LOOKUP', 'INVENTORY_LOOKUP']);
  const options = didYouMeanOptions(
    [{ operationId: 'INCIDENT_CLAIM_STATUS', confidence: 0.9 }, { operationId: 'BUYER_DOCUMENT_READINESS', confidence: 0.5 }, { operationId: 'DOCUMENT_PROMOTION_REVIEW', confidence: 0.4 }, { operationId: 'DOCUMENT_LOOKUP', confidence: 0.3 }],
    eligible,
    'list appliances that have missing documents and are high risk',
  );
  assert.deepEqual(options, ['BUYER_DOCUMENT_READINESS', 'DOCUMENT_PROMOTION_REVIEW', 'DOCUMENT_LOOKUP']);
});

test('one related option is named in a question, never offered as a lone button (the card contract)', () => {
  const card = buildDidYouMeanResult(['DOCUMENT_LOOKUP']);
  assert.equal(card.status, 'NEEDS_CLARIFICATION');
  assert.deepEqual(card.clarification.options, []);
  assert.equal(card.clarification.allowFreeText, true);
  assert.deepEqual(findClarificationViolations(card).map((v) => v.code), []);
  assert.match(card.blocks[0].body, /Did you mean to ask: “/);
  const two = buildDidYouMeanResult(['DOCUMENT_LOOKUP', 'INVENTORY_LOOKUP']);
  assert.equal(two.clarification.options.length, 2);
  assert.deepEqual(findClarificationViolations(two).map((v) => v.code), []);
});

const decision = (...ids2) => ({ language: 'en', candidates: c(...ids2), requiresClarification: true });

test('the routing clarification ("What would you like to focus on?") drops unrelated options and satisfies the contract at every size', () => {
  const message = 'list appliances that have missing documents and are high risk';
  const three = routingClarificationResult(decision('BUYER_DOCUMENT_READINESS', 'INCIDENT_CLAIM_STATUS', 'DOCUMENT_PROMOTION_REVIEW', 'DOCUMENT_LOOKUP'), 'ASK_ROUTING_AMBIGUOUS', message);
  assert.deepEqual(three.clarification.options.map((o) => o.operationId), ['BUYER_DOCUMENT_READINESS', 'DOCUMENT_PROMOTION_REVIEW', 'DOCUMENT_LOOKUP']);
  assert.deepEqual(findClarificationViolations(three).map((v) => v.code), []);
  const one = routingClarificationResult(decision('INCIDENT_CLAIM_STATUS', 'DOCUMENT_LOOKUP'), 'ASK_ROUTING_AMBIGUOUS', 'where is my closing documents');
  assert.deepEqual(one.clarification.options, []);
  assert.match(one.blocks[0].body, /This sounds like it is about “/);
  assert.deepEqual(findClarificationViolations(one).map((v) => v.code), []);
  const unfiltered = routingClarificationResult(decision('INCIDENT_CLAIM_STATUS', 'DOCUMENT_LOOKUP'), 'ASK_ROUTING_AMBIGUOUS');
  assert.equal(unfiltered.clarification.options.length, 2, 'no message, no gate (callers that have none behave as before)');
});
