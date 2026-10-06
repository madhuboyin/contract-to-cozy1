const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

const { inventoryAddItemAction, inventoryViewItemAction, inventoryShowAllAction, INVENTORY_ADD_MESSAGE } = require('../../src/services/ask/handlers/inventoryAskActions.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');

const read = (file) => fs.readFileSync(path.resolve(__dirname, '../../src/services/ask/handlers', file), 'utf8');

test('inventory next-step actions declare the operation their own message routes to', () => {
  for (const action of [inventoryAddItemAction(), inventoryViewItemAction('HVAC Furnace'), inventoryShowAllAction()]) {
    assert.equal(action.interactionType, 'START_WORKFLOW');
    assert.equal(resolveAskOperation(action.message).operationId, action.operationId, action.id);
    assert.equal(action.href, undefined, 'an in-Ask action must not also navigate');
  }
  assert.equal(inventoryAddItemAction().message, INVENTORY_ADD_MESSAGE);
});

test('the actions validate as response-level block actions', () => {
  const block = { type: 'SUMMARY', id: 's', title: 't', body: 'b', tone: 'DEFAULT', actions: [inventoryViewItemAction('Water heater'), inventoryAddItemAction()] };
  const parsed = AskPresentationBlockSchema.safeParse(block);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues ?? []).slice(0, 300));
});

test('inventory receipts and empty states no longer link out to the desktop inventory page', () => {
  for (const file of ['recordConfirm.handler.ts', 'captureConfirm.handler.ts', 'hvacDecision.handler.ts', 'capitalPlanning.handler.ts', 'miscHandlers.handler.ts']) {
    // (capitalPlanning keeps one /inventory fallbackHref on its property-context capture form; that is not an action.)
    assert.doesNotMatch(read(file), /id: 'open-inventory'|id: 'open-attached-record', label: 'Open home inventory'|openItemId/, `${file} still links to the desktop inventory page`);
  }
  assert.doesNotMatch(read('inventory.handler.ts'), /action=add-item/);
});

test('the repair-or-replace picker declares the operation each item sentence routes to', () => {
  const source = read('miscHandlers.handler.ts');
  assert.match(source, /operationId: resolveAskOperation\(message\)\.operationId/);
  // HVAC-type items route to the HVAC decision flow; a fixed REPLACEMENT_GUIDANCE would override that.
  assert.equal(resolveAskOperation('Should I repair or replace HVAC Furnace?').operationId, 'HVAC_DECISION_START');
  assert.equal(resolveAskOperation('Should I repair or replace Oven Range?').operationId, 'REPLACEMENT_GUIDANCE');
});
