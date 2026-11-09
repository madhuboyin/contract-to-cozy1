const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { splitQuestionClauses, findAlsoAnswerOffer, alsoAnswerAction, isAlsoAnswerAction, withAlsoAnswerAction } = require('../../src/services/ask/support/alsoAnswer.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const compound = require('../fixtures/askCompoundCorpus.js');

test('a question is split at its joining words, and a single question stays whole', () => {
  assert.deepEqual(splitQuestionClauses('How old is my roof, and what would a new one cost?'), ['How old is my roof', 'what would a new one cost']);
  assert.deepEqual(splitQuestionClauses('How old is my roof?'), ['How old is my roof']);
  assert.equal(splitQuestionClauses('Show my capital plan for major replacements').length, 1);
});

test('the second part is offered as a different read operation, never the one already answering', () => {
  // "a new one" borrows the item named in the first part, so the part can be routed on its own.
  const roof = findAlsoAnswerOffer('How old is my roof, what condition is it in, and what would a new one cost?', 'INVENTORY_LOOKUP');
  assert.equal(roof.operationId, 'REPLACEMENT_GUIDANCE');
  assert.equal(roof.clause, 'What would a new roof cost?');
  // The whole message routed to its second part, so the dropped part is the first one.
  const recall = findAlsoAnswerOffer('Are there any recalls on my appliances and are those items still under warranty?', 'WARRANTY_LOOKUP');
  assert.equal(recall.operationId, 'RECALL_REVIEW');
  // An answer that already states timing and cost does not offer a repair-or-replace read for "when will it need replacing".
  assert.equal(findAlsoAnswerOffer('When will my roof probably need replacing and how much should I have set aside by then?', 'CAPITAL_ITEM_FUNDING_GOAL'), null);
  assert.equal(findAlsoAnswerOffer('How old is my roof?', 'INVENTORY_LOOKUP'), null);
  assert.equal(findAlsoAnswerOffer('Is my dishwasher still under warranty?', 'WARRANTY_LOOKUP'), null);
});

test('single-clause controls in the compound corpus are never offered a button', () => {
  for (const row of compound.filter((r) => r.needs.length === 1 && r.full.length === 1)) {
    assert.equal(findAlsoAnswerOffer(row.prompt, row.full[0]), null, row.prompt);
  }
});

test('the button is a typed in-Ask question that the trust policy accepts on any answer, and only exactly that shape', () => {
  const offer = findAlsoAnswerOffer('Are there any recalls on my appliances and are those items still under warranty?', 'WARRANTY_LOOKUP');
  const action = alsoAnswerAction(offer);
  assert.equal(action.interactionType, 'START_WORKFLOW');
  assert.equal(action.message, offer.clause);
  assert.equal(isAlsoAnswerAction(action), true);
  assert.equal(isAlsoAnswerAction({ ...action, message: 'Delete my roof record.' }), false, 'a changed message is not the offered clause');
  assert.equal(isAlsoAnswerAction({ ...action, href: '/dashboard' }), false);
  assert.equal(isAlsoAnswerAction({ ...action, operationId: 'MAINTENANCE_TASK_CREATE' }), false, 'a write operation is never offered');
  assert.equal(isAskActionApplicable({ action, operationId: 'WARRANTY_LOOKUP', propertyId: 'p1', authoritativeSourceAvailable: true, householdRole: 'OWNER' }), true);
});

test('the button is added to the first summary only, once, and the rest of the result is untouched', () => {
  const result = { status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 's', actions: [] }, { type: 'TABLE', id: 't' }] };
  const out = withAlsoAnswerAction(result, 'Are there any recalls on my appliances and are those items still under warranty?', 'WARRANTY_LOOKUP');
  assert.equal(out.blocks[0].actions.length, 1);
  assert.equal(out.blocks[1], result.blocks[1]);
  assert.equal(withAlsoAnswerAction(out, 'Are there any recalls on my appliances and are those items still under warranty?', 'WARRANTY_LOOKUP').blocks[0].actions.length, 1);
  assert.equal(withAlsoAnswerAction(result, 'Is my dishwasher still under warranty?', 'WARRANTY_LOOKUP'), result);
});

test('follow-up shapes work only inside a two-part question; standalone routing does not claim them', () => {
  const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
  for (const alone of ['what happens if I skip them', 'what would that do to my monthly budget', 'is that more than I spent last year']) {
    assert.equal(resolveAskOperation(alone).operationId, 'GROUNDED_GUIDANCE', alone);
  }
  assert.equal(findAlsoAnswerOffer('What are the top three things I should spend money on this year and what happens if I skip them?', 'HOME_ACTIONS').operationId, 'DO_NOTHING_SIMULATION');
  assert.equal(findAlsoAnswerOffer('Should I repair my dishwasher or replace it, and what would that do to my monthly budget?', 'REPLACEMENT_GUIDANCE').operationId, 'OWNERSHIP_COSTS');
  assert.equal(findAlsoAnswerOffer('How much should I budget for maintenance this year and is that more than I spent last year?', 'MAINTENANCE_BUDGET_FORECAST').operationId, 'OWNERSHIP_COSTS');
  const saving = findAlsoAnswerOffer('How old is my roof in 5 years, and what should I save per month for it?', 'INVENTORY_LOOKUP');
  assert.equal(saving.operationId, 'CAPITAL_ITEM_FUNDING_GOAL');
  assert.match(saving.clause, /my roof in 5 years/i, 'the date and the item travel with the part');
  const action = alsoAnswerAction(findAlsoAnswerOffer('What are the top three things I should spend money on this year and what happens if I skip them?', 'HOME_ACTIONS'));
  assert.equal(isAlsoAnswerAction(action), true);
  assert.equal(isAlsoAnswerAction({ ...action, operationId: 'OWNERSHIP_COSTS' }), false, 'a shape only vouches for the operation it names');
});

test('whole-home money, failure-risk and replacement-cost follow-up shapes (second batch)', () => {
  const cases = [
    ['Is my reserve fund enough for the big replacements coming over the next 5 years, and how much more per month would close the gap?', 'CAPITAL_ITEM_FUNDING_GOAL', 'CAPITAL_RESERVE_PLAN'],
    ['How much am I spending on the house each month and how much more should I be setting aside for big repairs?', 'OWNERSHIP_COSTS', 'CAPITAL_RESERVE_PLAN'],
    ['What does it cost me per year to keep the house maintained, and how does that compare to my reserve contributions?', 'MAINTENANCE_BUDGET_FORECAST', 'CAPITAL_RESERVE_PLAN'],
    ['Which warranties expire this year and which of those items are old enough to fail?', 'WARRANTY_LOOKUP', 'APPLIANCE_FAILURE_RISK'],
  ];
  for (const [message, answered, expected] of cases) {
    const offer = findAlsoAnswerOffer(message, answered);
    assert.equal(offer && offer.operationId, expected, message);
    assert.equal(isAlsoAnswerAction(alsoAnswerAction(offer)), true, message);
  }
  // "a replacement" borrows the first part's item and drops the trailing "if it is not".
  const water = findAlsoAnswerOffer('Is my water heater covered by warranty, and how much would a replacement cost if it is not?', 'WARRANTY_LOOKUP');
  assert.equal(water.operationId, 'REPLACEMENT_GUIDANCE');
  assert.equal(water.clause, 'How much would a replacement water heater cost?');
  // Never on the answered operation itself, and never on a single question.
  assert.equal(findAlsoAnswerOffer('Which warranties expire this year and which of those items are old enough to fail?', 'APPLIANCE_FAILURE_RISK').operationId, 'WARRANTY_LOOKUP', 'the dropped part is the other one');
  assert.equal(findAlsoAnswerOffer('How much more per month would close the gap?', 'CAPITAL_RESERVE_PLAN'), null);
  // The shapes live only inside a two-part question: standalone routing does not claim them.
  const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
  for (const alone of ['how much more per month would close the gap', 'which of those items are old enough to fail', 'how does that compare to my reserve contributions']) {
    assert.equal(resolveAskOperation(alone).operationId, 'GROUNDED_GUIDANCE', alone);
  }
});
