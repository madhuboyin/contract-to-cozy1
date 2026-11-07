const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { parseReserveFundMessage } = require('../../src/services/ask/support/reserveFundMessage.ts');

const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;

// Routing sweep (2026-11-07): a request to record something was answered as a lookup, or turned into an inventory form, so
// nothing was recorded or the wrong record was proposed. These are the phrasings that sweep found, plus the neighbours that must not move.

test('"add <anything>" for another governed domain is never an inventory item', () => {
  for (const [message, expected] of [
    ['add a refinance scenario', 'INVENTORY_ITEM_CREATE'],
    ['record my loan estimate', 'INVENTORY_ITEM_CREATE'],
    ['add my spouse to my account', 'INVENTORY_ITEM_CREATE'],
    ['add my wife to the home', 'INVENTORY_ITEM_CREATE'],
    ['add 200 to my reserve fund', 'INVENTORY_ITEM_CREATE'],
  ]) assert.notEqual(route(message), expected, message);
  assert.equal(route('add my spouse to my account'), 'HOUSEHOLD_INVITATION');
  assert.equal(route('add 200 to my reserve fund'), 'RESERVE_FUND_COMMAND');
});

test('a bare amount is a reserve-fund deposit only when the fund is named', () => {
  assert.deepEqual(parseReserveFundMessage('add 200 to my reserve fund'), { kind: 'CONTRIBUTION', type: 'DEPOSIT', amountDollars: 200 });
  assert.deepEqual(parseReserveFundMessage('withdraw 1,500 from the reserve fund'), { kind: 'CONTRIBUTION', type: 'WITHDRAWAL', amountDollars: 1500 });
  assert.equal(parseReserveFundMessage('add my roof to my reserve fund'), null);
  assert.equal(parseReserveFundMessage('should I add 200 to my reserve fund?'), null);
  assert.deepEqual(parseReserveFundMessage('change my reserve fund contribution'), { kind: 'CHOOSE' });
});

test('maintenance completion, creation and rescheduling phrased naturally reach their write commands', () => {
  for (const [message, expected] of [
    ['the gutter task is complete', 'MAINTENANCE_TASK_COMPLETE'],
    ['check off the furnace service', 'MAINTENANCE_TASK_COMPLETE'],
    ['remind me to change the furnace filter', 'MAINTENANCE_TASK_CREATE'],
    ['new maintenance task replace water filter', 'MAINTENANCE_TASK_CREATE'],
    ['put dryer vent cleaning on my list', 'MAINTENANCE_TASK_CREATE'],
    ['postpone dryer vent cleaning', 'MAINTENANCE_TASK_UPDATE'],
  ]) assert.equal(route(message), expected, message);
});

test('questions and reads about the same nouns are not turned into writes', () => {
  assert.notEqual(route('is the gutter task complete?'), 'MAINTENANCE_TASK_COMPLETE');
  assert.notEqual(route('what is the status of my closing task'), 'BUYER_TASK_COMPLETE');
  assert.notEqual(route('remind me when my warranty expires'), 'MAINTENANCE_TASK_CREATE');
  assert.notEqual(route('should I add 200 to my reserve fund?'), 'RESERVE_FUND_COMMAND');
  for (const message of ['Add a Samsung dishwasher', 'Add a refrigerator in the kitchen', 'Record a new heat pump', 'Add a Rheem water heater in the garage']) {
    assert.equal(route(message), 'INVENTORY_ITEM_CREATE', message);
  }
});

test('closing-checklist steps are named by the step, not only by the words "closing task"', () => {
  for (const [message, expected] of [
    ['check off the appraisal task', 'BUYER_TASK_COMPLETE'],
    ['tick off the homeowners insurance task', 'BUYER_TASK_COMPLETE'],
    ['i finished the walkthrough task', 'BUYER_TASK_COMPLETE'],
    ['new closing task call the utilities', 'BUYER_TASK_CREATE'],
    ['add a task to my closing checklist', 'BUYER_TASK_CREATE'],
    ['add custom closing task', 'BUYER_TASK_CREATE'],
    ['reschedule my closing task', 'BUYER_TASK_UPDATE'],
    ['move the appraisal task to friday', 'BUYER_TASK_UPDATE'],
    ['push the survey task out a week', 'BUYER_TASK_UPDATE'],
    ['change my closing date', 'BUYER_LIFECYCLE_UPDATE'],
  ]) assert.equal(route(message), expected, message);
});

test('naming a bid comparison or having bids to compare starts the comparison, not the read', () => {
  for (const message of ['set up a bid comparison', 'new quote comparison for the deck', 'i have three roofing bids to compare', 'Create a quote comparison for my roof']) {
    assert.equal(route(message), 'QUOTE_COMPARISON_CREATE', message);
  }
  assert.equal(route('compare these two contractor quotes'), 'QUOTE_COMPARISON_REVIEW');
  assert.equal(route('which contractor bid is better'), 'QUOTE_COMPARISON_REVIEW');
});
