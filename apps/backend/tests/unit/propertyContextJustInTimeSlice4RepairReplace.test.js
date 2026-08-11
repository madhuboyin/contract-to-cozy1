const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { getCaptureDefinition } = require('../../src/modules/propertyContext/catalog/captureRegistry.ts');
const { getFeatureContextRequirement } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('Repair vs Replace lifecycle context is a nonblocking accuracy enhancement', () => {
  const contract = getFeatureContextRequirement('REPAIR_REPLACE', 'RUN_ANALYSIS');
  assert.deepEqual(contract.required, []);
  assert.equal(contract.enhancements.length, 1);
  assert.equal(contract.enhancements[0].factKey, 'inventory.items');
  assert.equal(contract.enhancements[0].classification, 'ENHANCEMENT_ACCURACY');
  assert.equal(contract.enhancements[0].collectionPredicate, 'SELECTED_ITEM_LIFECYCLE_INCOMPLETE');
  assert.equal(contract.enhancements[0].captureKey, 'INVENTORY_ITEM_LIFECYCLE_UPDATE');
});

test('lifecycle capture is backend-owned and scoped to the explicit operation item', () => {
  const capture = getCaptureDefinition('INVENTORY_ITEM_LIFECYCLE_UPDATE');
  assert.equal(capture.mode, 'RELATIONAL');
  assert.equal(capture.canonicalOwner, 'InventoryItem');
  assert.equal(capture.relationalAdapterKey, 'INVENTORY_ITEM_LIFECYCLE');
  assert.equal(capture.relationalEntityInputKey, 'inventoryItemId');
  assert.equal(capture.inputSchema.type, 'RELATIONAL_UPDATE');
  assert.deepEqual(capture.inputSchema.fields.map((field) => field.key), ['condition', 'installedOn', 'purchasedOn']);
  assert.equal(capture.inputSchema.fields.find((field) => field.key === 'installedOn').inputSchema.type, 'APPROXIMATE_DATE');
  assert.equal(capture.inputSchema.fields.find((field) => field.key === 'purchasedOn').inputSchema.type, 'APPROXIMATE_DATE');
  assert.equal(capture.allowNotSure, true);
});

test('relational update verifies property and operation identity before canonical persistence', () => {
  const adapters = read('../../src/modules/propertyContext/application/relationalCaptureAdapters.ts');
  assert.match(adapters, /answer\.entityId !== scopedEntityId/);
  assert.match(adapters, /findFirst\(\{ where: \{ id: entityId, propertyId \}/);
  assert.match(adapters, /tx\.inventoryItem\.update/);
  assert.match(adapters, /installedOn: installed\.date/);
  assert.match(adapters, /installedOnPrecision: installed\.precision/);
  assert.match(adapters, /purchasedOn: purchased\.date/);
  assert.match(adapters, /purchasedOnPrecision: purchased\.precision/);
});

test('Repair vs Replace captures in place without replacing calculator overrides', () => {
  const client = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/items/[itemId]/replace-repair/ReplaceRepairClient.tsx');
  assert.match(client, /featureKey="REPAIR_REPLACE"/);
  assert.match(client, /operationKey="RUN_ANALYSIS"/);
  assert.match(client, /operationInput=\{propertyContextOperationInput\}/);
  assert.match(client, /onCaptured=\{handlePropertyContextCaptured\}/);
  assert.match(client, /Promise\.allSettled\(\[\s*getInventoryItem\(propertyId, itemId\),\s*runAnalysis\(\)/);
  assert.doesNotMatch(client, /PropertyContextNotice/);
  assert.doesNotMatch(client, /window\.location\.reload/);
  for (const input of [
    'estimatedNextRepairCostUsd',
    'estimatedReplacementCostUsd',
    'expectedRemainingYears',
    'cashBufferUsd',
    'riskTolerance',
    'usageIntensity',
  ]) assert.match(client, new RegExp(input));
});

test('direct analysis runs evaluate shared context before canonical analysis', () => {
  const controller = read('../../src/controllers/replaceRepairAnalysis.controller.ts');
  const start = controller.indexOf('export async function runReplaceRepairAnalysis');
  const shared = controller.indexOf('evaluateFeatureContext', start);
  const canonical = controller.indexOf('service.runItemAnalysis', start);
  assert.ok(start >= 0 && shared > start && canonical > shared);
  assert.match(controller, /operationInput: \{ inventoryItemId: itemId \}/);
});
