const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// `name` in INVENTORY_ITEM_CORRECT (FRD v1.176). The name is a homeowner-facing label, not the appliance classification.

let itemRow = null;
let ownerRow = null;
const lookups = [];
const prismaMock = { inventoryItem: { findFirst: async ({ where }) => { lookups.push(where); return where.id ? itemRow : ownerRow; } } };
function mockModule(relativePath, exports) {
  const modulePath = require.resolve(relativePath);
  require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
}
mockModule('../../src/lib/prisma.ts', { prisma: prismaMock });

const {
  INVENTORY_CORRECTION_FIELDS, inventoryCorrectionItemActions, inventoryFieldValueError, inventoryFieldNormalized,
  inventoryFieldPatch, inventoryFieldCurrent, inventoryCorrectionCombinedBlocker, inventoryNameClassificationBlocker, inventoryCorrectionBlocker,
} = require('../../src/services/ask/handlers/inventory.handler.ts');
const { InventoryItemCorrectionInputSchema } = require('../../src/services/ask/support/commandInputs.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');

const item = (overrides = {}) => ({ id: 'item-1', name: 'Fridge', category: 'APPLIANCE', roomId: 'room-1', tags: [], sourceHash: null, ...overrides });
function reset({ existing = null, owner = null } = {}) { itemRow = existing; ownerRow = owner; lookups.length = 0; }

test('name is a correctable text field, offered first, capped like the inventory update validator', () => {
  assert.equal(Object.keys(INVENTORY_CORRECTION_FIELDS)[0], 'name');
  assert.deepEqual({ ...INVENTORY_CORRECTION_FIELDS.name, options: undefined }, { label: 'name', action: 'Rename item', message: 'Rename this inventory item.', kind: 'TEXT', max: 120, options: undefined });
  assert.equal(InventoryItemCorrectionInputSchema.safeParse({ itemId: 'i', field: 'name', value: 'Basement freezer' }).success, true);
  const actions = inventoryCorrectionItemActions(true);
  assert.equal(actions[0].label, 'Rename item');
  assert.equal(actions[0].operationId, 'INVENTORY_ITEM_CORRECT');
  assert.equal(actions[0].interactionType, 'MUTATE_RECORD');
  assert.equal(inventoryCorrectionItemActions(false), undefined, 'a viewer is never offered a write control');
});

test('a rename must be non-blank and at most 120 characters after trimming', async () => {
  for (const blank of ['', '   ', null, undefined]) assert.match(await inventoryFieldValueError('p1', 'name', blank), /Enter the corrected name before confirming/);
  assert.equal(await inventoryFieldValueError('p1', 'name', '  Basement freezer  '), null);
  assert.equal(await inventoryFieldValueError('p1', 'name', 'x'.repeat(120)), null);
  assert.match(await inventoryFieldValueError('p1', 'name', 'x'.repeat(121)), /Use at most 120 characters/);
  assert.equal(inventoryFieldNormalized('name', '  Basement freezer  '), 'Basement freezer');
  assert.deepEqual(inventoryFieldPatch('name', 'Basement freezer'), { name: 'Basement freezer' }, 'only the name is written');
  assert.equal(inventoryFieldCurrent({ name: 'Fridge' }, 'name'), 'Fridge');
});

test('messages route to the operation: a rename verb or the name noun, and only with an inventory/appliance noun', () => {
  for (const message of ['Rename this inventory item.', 'Rename my appliance to Basement freezer', 'Change the name of this inventory item', 'Correct the name of my appliance']) {
    assert.equal(resolveAskOperation(message).operationId, 'INVENTORY_ITEM_CORRECT', message);
  }
  // Not captured: a rename of something that is not inventory, or a message clearly about a task, event, warranty or room
  // that merely mentions an appliance.
  for (const message of [
    'Rename this room', 'Rename my checklist item', 'Rename the appliance filter maintenance task',
    'Change the name of my maintenance task for the appliance', 'Update the name of the warranty on my appliance',
    'Edit the name of the home event about my appliance', 'Rename the room the appliance is in',
  ]) assert.notEqual(resolveAskOperation(message).operationId, 'INVENTORY_ITEM_CORRECT', message);
});

test('the water-heater rule applies to a new name on an appliance, and nowhere else', () => {
  assert.match(inventoryCorrectionCombinedBlocker(item(), 'name', 'Water heater'), /plumbing system/);
  assert.equal(inventoryCorrectionCombinedBlocker(item({ category: 'PLUMBING' }), 'name', 'Water heater'), null);
  assert.equal(inventoryCorrectionCombinedBlocker(item(), 'name', 'Basement freezer'), null);
  // The existing category/room rules are unchanged.
  assert.match(inventoryCorrectionCombinedBlocker(item({ name: 'Water heater' }), 'category', 'APPLIANCE'), /plumbing/i);
});

test('a classified appliance can be renamed to anything: it keeps its type and cannot conflict', async () => {
  reset({ owner: { id: 'other-item' } });
  const classified = item({ sourceHash: 'property_appliance::FRIDGE', tags: ['PROPERTY_APPLIANCE', 'APPLIANCE_TYPE:FRIDGE'] });
  assert.equal(await inventoryNameClassificationBlocker('p1', classified, 'Basement freezer'), null);
  assert.equal(lookups.length, 0, 'no lookup: nothing can conflict');
  // Tag-only classification counts too.
  assert.equal(await inventoryNameClassificationBlocker('p1', item({ tags: ['APPLIANCE_TYPE:WASHER'] }), 'Dryer'), null);
});

test('an unclassified appliance renamed to a type another item already owns is blocked with a plain reason', async () => {
  reset({ owner: { id: 'other-item' } });
  assert.equal(await inventoryNameClassificationBlocker('p1', item(), 'Dishwasher'), 'A dishwasher already exists for this property.');
  assert.deepEqual(lookups, [{ propertyId: 'p1', sourceHash: 'property_appliance::DISHWASHER' }]);
  // Nobody else owns it, or this item is the owner, or the name implies no type, or it is not an appliance.
  reset({ owner: null });
  assert.equal(await inventoryNameClassificationBlocker('p1', item(), 'Dishwasher'), null);
  reset({ owner: { id: 'item-1' } });
  assert.equal(await inventoryNameClassificationBlocker('p1', item(), 'Dishwasher'), null);
  reset({ owner: { id: 'other-item' } });
  assert.equal(await inventoryNameClassificationBlocker('p1', item(), 'Mystery gadget'), null);
  assert.equal(await inventoryNameClassificationBlocker('p1', item({ category: 'FURNITURE' }), 'Dishwasher'), null);
});

test('the combined blocker checks the pure rules first and only queries for a rename', async () => {
  reset({ owner: { id: 'other-item' } });
  // Pure rule wins and short-circuits the live lookup.
  assert.match(await inventoryCorrectionBlocker('p1', item(), 'name', 'Water heater'), /plumbing system/);
  assert.equal(lookups.length, 0);
  // A rename that trips only the live rule.
  assert.match(await inventoryCorrectionBlocker('p1', item(), 'name', 'Dishwasher'), /already exists/);
  // Other fields never query.
  lookups.length = 0;
  assert.equal(await inventoryCorrectionBlocker('p1', item(), 'brand', 'Bosch'), null);
  assert.equal(lookups.length, 0);
});

test('the confirm and edit paths both use the async blocker before writing, and the write goes through the canonical service', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/recordConfirm.handler.ts'), 'utf8');
  const confirm = source.slice(source.indexOf('async function confirmInventoryItemCorrect('), source.indexOf("registerConfirmCapabilityHandler('inventory.item-correct'"));
  assert.match(confirm, /await inventoryCorrectionBlocker\(execution\.propertyId!, item, field, normalized\)/);
  assert.ok(confirm.indexOf('inventoryCorrectionBlocker(') < confirm.indexOf('inventoryService.updateItem('), 'checked before the write');
  assert.match(confirm, /inventoryItemContextVersion\(item\)/, 'freshness is re-verified');
  for (const stale of ['markCoverageAnalysisStale', 'markItemCoverageAnalysesStale', 'markReplaceRepairStale', 'markRiskPremiumOptimizerStale', 'markDoNothingRunsStale']) assert.ok(confirm.includes(stale), stale);
  assert.match(confirm, /reconcileAskExecutionSideEffects\(userId, execution, parameters\)/, 'receipt and result reconciliation');
  const edit = source.slice(source.indexOf('export async function editInventoryItemCorrectConfirmation('), source.indexOf('export async function editHomeEventCorrectConfirmation('));
  assert.match(edit, /await inventoryCorrectionBlocker\(execution\.propertyId!, item, existing\.data\.field, valueEdit\)/);
});
