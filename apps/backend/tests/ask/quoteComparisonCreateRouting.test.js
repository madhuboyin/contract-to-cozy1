const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;

test('every create/start/set-up phrasing of a quote comparison starts the workspace command, not an inventory item', () => {
  for (const message of [
    'Create a quote comparison workspace',
    'Create a quote comparison',
    'Create a quote comparison workspace for plumbing bids',
    'Create a quote comparison for my roof',
    'Start a quote comparison',
    'Set up a quote comparison',
    'Start a quote comparison workspace',
    'Open a comparison workspace for my quotes',
  ]) assert.equal(route(message), 'QUOTE_COMPARISON_CREATE', message);
});

test('ordinary inventory additions are unaffected, and reading quotes is still a review', () => {
  assert.equal(route('Add a Samsung dishwasher'), 'INVENTORY_ITEM_CREATE');
  assert.equal(route('Create a record for my water heater'), 'INVENTORY_ITEM_CREATE');
  assert.equal(route('Compare my roofing quotes'), 'QUOTE_COMPARISON_REVIEW');
});
