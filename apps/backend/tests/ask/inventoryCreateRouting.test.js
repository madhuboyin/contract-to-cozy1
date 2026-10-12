const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;

// inventoryCreatePattern is "add|record|create <anything>" minus a list of other record types. It runs before most create commands,
// so a record type missing from the list is silently turned into an inventory-item form.

test('a create phrasing that has its own message route reaches that command, not an inventory item', () => {
  const expected = [
    ['Create an insurance claim for the water damage', 'CLAIM_FILE'],
    ['Create a guided plan for replacing the roof', 'GUIDANCE_JOURNEY_CREATE'],
    ['Add a household member', 'HOUSEHOLD_INVITATION'],
    ['Create a quote comparison for my roof', 'QUOTE_COMPARISON_CREATE'],
    ['Create a maintenance task to clean the gutters', 'MAINTENANCE_TASK_CREATE'],
  ];
  for (const [message, operationId] of expected) assert.equal(route(message), operationId, message);
});

test('other record types are never offered as an inventory item, even where their command is launched from an action', () => {
  for (const message of [
    'Create a project for the kitchen remodel',
    'Add a project to track the bathroom renovation',
    'Create a DIY project for building a fence',
    'Add a material spec for the kitchen paint',
    'Create a material record for the living room flooring',
    'Add a plant to the living room',
    'Add a fiddle leaf fig plant to my home',
    'Create a property brief for the buyer',
    'Create a seasonal home care checklist',
    'Create a document for my insurance policy',
    'Create a negotiation shield case for this quote',
    'Add a deposit to my reserve fund',
    'Record a $500 reserve contribution',
    'Add a closing task to schedule the final walkthrough',
    'Create a reminder to service the furnace',
    'Create habits for my home',
  ]) assert.notEqual(route(message), 'INVENTORY_ITEM_CREATE', message);
});

test('real inventory additions still start the inventory command', () => {
  for (const message of [
    'Add a Samsung dishwasher',
    'Add a dishwasher to my inventory',
    'Create an inventory item for my water heater',
    'Record a new heat pump',
    'Add a refrigerator in the kitchen',
    'Please add a Bosch washing machine',
    'Add a Rheem water heater in the garage',
    'Create a record for my water heater',
  ]) assert.equal(route(message), 'INVENTORY_ITEM_CREATE', message);
});
