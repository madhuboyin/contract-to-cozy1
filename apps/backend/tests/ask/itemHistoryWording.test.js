const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { INVENTORY_ITEM_ALIASES, findSpecificInventoryAlias } = require('../../src/services/ask/support/inventoryItemAliases.ts');
const { containsWholeWord } = require('../../src/services/ask/support/wholeWord.ts');

// Review screenshot (2026-11-07): "show me the history of my washing machine repairs" ended in "Nothing in your home record answers this". The inventory
// answer already lists one item's recorded events; the message was never routed there, and "washing machine" was not among the names it could find.

const owner = Object.values(ASK_OPERATION_DEFINITIONS).filter((definition) => !definition.safetyClass.endsWith('_BOUNDARY') && !definition.operationId.startsWith('BUYER_')).map((definition) => definition.operationId);
const op = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'p1', eligibleOperationIds: owner }).operation.operationId;

test('the repair or service history of one named appliance or system reaches the inventory answer', () => {
  for (const message of [
    'show me the history of my washing machine repairs',
    'service history for my furnace',
    'what repairs has my dishwasher had',
    'when was my water heater last serviced',
    'has my dryer ever been repaired',
    'history of my roof repairs',
    'repair history of my refrigerator',
  ]) assert.equal(op(message), 'INVENTORY_LOOKUP', message);
});

test('the home’s own history, maintenance and writes keep their routes', () => {
  assert.equal(op('show me the history of my home'), 'HOME_TIMELINE_EVENTS');
  assert.equal(op('what is the repair history of my house'), 'HOME_TIMELINE_EVENTS');
  assert.equal(op('what maintenance is due this month'), 'MAINTENANCE_STATUS');
  assert.equal(op('show my service history'), 'MAINTENANCE_STATUS');
  assert.notEqual(op('add a repair to my washing machine history'), 'INVENTORY_LOOKUP');
});

test('"washing machine" and other common appliances are names the inventory answer can find', () => {
  const find = (message) => findSpecificInventoryAlias(message)?.terms ?? null;
  assert.deepEqual(find('history of my washing machine repairs'), ['washer', 'washing machine']);
  assert.deepEqual(find('show my microwave details'), ['microwave']);
  assert.deepEqual(find('when did i buy the oven'), ['oven', 'stove', 'cooktop']);
  assert.deepEqual(find('what is the model of my dishwasher'), ['dishwasher'], '"dishwasher" is not "washer"');
  assert.equal(find('show me my kitchen'), null);
  assert.ok(INVENTORY_ITEM_ALIASES.length >= 12);
});

test('the washing machine is found by whole word: a Washer Dryer matches, a Dishwasher does not', () => {
  const terms = findSpecificInventoryAlias('show me the history of my washing machine repairs').terms;
  const matches = (itemText) => terms.some((term) => containsWholeWord(itemText, term));
  assert.equal(matches('Washer Dryer appliance'), true);
  assert.equal(matches('Samsung washing machine'), true);
  assert.equal(matches('Dishwasher appliance'), false);
});
