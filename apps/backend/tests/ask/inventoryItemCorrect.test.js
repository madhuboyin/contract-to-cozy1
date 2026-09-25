const test = require('node:test');
const { readAskOrchestratorSources } = require('../helpers/askOrchestratorSources.js');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD Phase 3 write slice: INVENTORY_ITEM_CORRECT.

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { isValidDateEditInput } = require('../../src/services/ask/askOrchestrator.service.ts');

const source = readAskOrchestratorSources();
const routeOf = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId;

function body(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start > 0, `${startMarker} not found`);
  return source.slice(start, source.indexOf(endMarker, start));
}

test('the three declared item-action messages and natural phrasing route to INVENTORY_ITEM_CORRECT', () => {
  for (const message of [
    'Correct the install date of this inventory item.',
    'Correct the purchase date of this inventory item.',
    'Correct the last serviced date of this inventory item.',
    'The install date on my water heater item is wrong, please fix the install date',
  ]) {
    assert.equal(routeOf(message), 'INVENTORY_ITEM_CORRECT', message);
  }
});

test('maintenance rescheduling and inventory reads are not captured by the new route', () => {
  assert.notEqual(routeOf('Reschedule the gutter cleaning task'), 'INVENTORY_ITEM_CORRECT');
  assert.notEqual(routeOf('Show my home inventory'), 'INVENTORY_ITEM_CORRECT');
});

test('registered as a contributor-floor confirmed command with edit/stop correction modes', () => {
  const definition = ASK_OPERATION_DEFINITIONS.INVENTORY_ITEM_CORRECT;
  assert.equal(definition.propertyRoleFloor, 'CONTRIBUTOR');
  assert.equal(definition.adapterKey, 'inventory.item-correct');
  const command = getAskDomainCommandByOperation('INVENTORY_ITEM_CORRECT');
  assert.equal(command.roleFloor, 'CONTRIBUTOR');
  assert.deepEqual([...command.correctionModes].sort(), ['EDIT', 'STOP']);
});

test('propose never writes; only the confirm handler calls the canonical updateItem writer', () => {
  const propose = body('async function inventoryItemCorrectResult(', "registerCapabilityHandler('inventory.item-correct'");
  assert.doesNotMatch(propose, /updateItem\(/);
  assert.match(propose, /NEEDS_CONFIRMATION/);
  const confirm = body('async function confirmInventoryItemCorrect(', "registerConfirmCapabilityHandler('inventory.item-correct'");
  assert.match(confirm, /inventoryService\.updateItem\(/);
  assert.match(confirm, /reconcileAskExecutionSideEffects/);
  assert.match(confirm, /inventoryItemContextVersion\(item\)/, 'confirm must recheck freshness');
  assert.match(confirm, /alreadyApplied/, 'a lease-reclaim retry must not be misreported as a conflict');
});

test('confirm rejects a missing/invalid date and edit path validates through the shared date validator', () => {
  const confirm = body('async function confirmInventoryItemCorrect(', "registerConfirmCapabilityHandler('inventory.item-correct'");
  assert.match(confirm, /ASK_INVALID_CONFIRMATION_EDIT/);
  assert.match(source, /INVENTORY_ITEM_CORRECT: editInventoryItemCorrectConfirmation/);
  assert.equal(isValidDateEditInput('2024-02-15'), true);
  assert.equal(isValidDateEditInput('not-a-date'), false);
});

test('declared item-action messages and natural phrasing route to INVENTORY_ITEM_CORRECT for the room and category fields', () => {
  for (const message of ['Correct the room of this inventory item.', 'Correct the category of this inventory item.']) {
    assert.equal(routeOf(message), 'INVENTORY_ITEM_CORRECT', message);
  }
  assert.notEqual(routeOf('What room is my dishwasher in?'), 'INVENTORY_ITEM_CORRECT');
});

test('correction item actions are only declared for contributor-and-up on all three inventory producers', () => {
  const helper = body('function inventoryCorrectionItemActions(', 'function inventoryCorrectionConfirmation(');
  assert.match(helper, /if \(!canManage\) return undefined;/);
  const uses = source.match(/actions: inventoryCorrectionItemActions\(access\.role !== HouseholdRole\.VIEWER\)/g) ?? [];
  assert.equal(uses.length, 3, 'inventory-entity-selection, inventory-results, property-inventory');
});
