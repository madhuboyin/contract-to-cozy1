const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { resolveAskOperation, ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { canonicalCapabilityRegistry, matchCapabilityGoal } = require('../../src/productFramework/capabilities/index.ts');

const eligible = Object.values(ASK_OPERATION_DEFINITIONS).map((definition) => definition.operationId).filter((id) => !id.startsWith('BUYER_'));
const route = (message) => resolveAskRoutingCascade(message, { propertyId: 'p1', eligibleOperationIds: eligible });

// Review follow-ups 6-10 (2026-11-07).
test('writing down work done on an item is neither a new inventory item nor a history lookup', () => {
  for (const message of ['add a repair to my water heater history', 'log a repair on my dishwasher', 'add a service record to my furnace', 'record a repair for my furnace', 'add a repair event']) {
    const id = resolveAskOperation(message).operationId;
    assert.ok(id !== 'INVENTORY_ITEM_CREATE' && id !== 'INVENTORY_LOOKUP', `${message} -> ${id}`);
  }
  assert.equal(resolveAskOperation('add a new water heater').operationId, 'INVENTORY_ITEM_CREATE');
  assert.equal(resolveAskOperation('what repairs has my furnace had').operationId, 'INVENTORY_LOOKUP');
});

test('"how much value does a new roof add" and similar reach the value-growth choices', () => {
  for (const message of ['how much value does a new roof add', 'does a kitchen remodel add value', 'will a new deck add resale value', 'how much value would a pool bring']) {
    const decision = route(message);
    assert.equal(decision.stage, 'CLARIFICATION', message);
    assert.deepEqual(decision.candidates.map((candidate) => candidate.operationId).sort(), ['HOME_UPGRADE_SCENARIOS', 'SELLER_PREP_CHECKLIST'], message);
  }
  assert.notEqual(route('does my warranty add value').stage, 'CLARIFICATION');
});

test('rent amount wording reaches the sell / hold / rent analysis', () => {
  for (const message of ['how much rent can i charge', 'how much could i rent my house for', 'what rent could i charge for my home', 'how much rental income would i make']) {
    assert.equal(resolveAskOperation(message).operationId, 'SELL_HOLD_RENT_ANALYSIS', message);
  }
});

test('a colour question about a room finds Material Specs among the tools', () => {
  const ids = (goal) => matchCapabilityGoal({ registry: canonicalCapabilityRegistry, goal, limit: 3 }).matches.map((match) => match.capabilityId);
  assert.ok(ids('where can i keep my bedroom color').includes('material-specs'));
  assert.ok(ids('a place for wall color and room details').includes('material-specs'));
});

test('the repair-or-replace "item not in your home record" answer offers adding the item, alongside viewing the inventory', () => {
  const { readFileSync } = require('node:fs');
  const { resolve } = require('node:path');
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/miscHandlers.handler.ts'), 'utf8');
  assert.match(source, /actions: allItems\.length \? \[inventoryShowAllAction\(\), \{ \.\.\.inventoryAddItemAction\(\), label: 'Add this item to my home' \}\]/);
  const { OPERATION_ACTION_IDS } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
  if (OPERATION_ACTION_IDS) assert.ok(OPERATION_ACTION_IDS.REPLACEMENT_GUIDANCE.has('add-inventory-item'));
});
