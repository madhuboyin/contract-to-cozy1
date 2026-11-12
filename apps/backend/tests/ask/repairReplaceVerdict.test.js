// D17 (reliability FRD): the pure repair-or-replace verdict computes in preview mode, raises no capture, starts no HVAC decision, and writes nothing.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const evaluateModule = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
const analysisModule = require('../../src/services/replaceRepairAnalysis.service.ts');
const { repairReplaceVerdictResult } = require('../../src/services/ask/handlers/repairReplaceVerdict.handler.ts');
const { getAskOperationDefinition, COMPOSABLE_READ_OPERATION_IDS, COMPOSITION_PURE_VARIANTS } = require('../../src/services/ask/askOperationRegistry.ts');

const ITEM = { id: 'i1', name: 'Water Heater', category: 'WATER_HEATER', assetType: null, brand: 'Rheem', model: 'X1', condition: 'FAIR', installedOn: new Date('2012-01-01T12:00:00Z'), purchasedOn: null, expectedExpiryDate: null, updatedAt: new Date() };
const ANALYSIS = { verdict: 'REPLACE_SOON', confidence: 'HIGH', summary: 'Replace soon.', estimatedNextRepairCostCents: 40000, estimatedReplacementCostCents: 150000, expectedAnnualRepairRiskCents: 20000, decisionTrace: [], remainingYears: 2 };
function setup(items) {
  const calls = { preview: [], writes: 0 };
  propertyAccess.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role: 'OWNER', isOwner: true });
  prisma.inventoryItem = { findMany: async () => items };
  evaluateModule.evaluateFeatureContext = async () => ({ contextVersion: 'ctx-1', requirements: [{ requirementId: 'r', capture: { captureKey: 'k', title: 't', question: 'q', inputSchema: { type: 'TEXT' }, allowNotSure: true, sensitivity: 'HOME' }, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN' }] });
  analysisModule.ReplaceRepairService.prototype.runItemAnalysis = async function (...args) { calls.preview.push(args[5]); return ANALYSIS; };
  return calls;
}

test('registry: the pure variant is a composable read reached only through composition, and replaces the persisting operation there', () => {
  const def = getAskOperationDefinition('ITEM_REPAIR_REPLACE_VERDICT');
  assert.equal(def.safetyClass, 'STANDARD'); assert.equal(def.composableRead, true); assert.equal(def.messageRoutable, false);
  assert.ok(COMPOSABLE_READ_OPERATION_IDS.has('ITEM_REPAIR_REPLACE_VERDICT'));
  assert.equal(COMPOSITION_PURE_VARIANTS.REPLACEMENT_GUIDANCE, 'ITEM_REPAIR_REPLACE_VERDICT');
  assert.equal(getAskOperationDefinition('REPLACEMENT_GUIDANCE').composableRead, false, 'the persisting operation is still not composable');
});
test('a recorded item: the analysis runs in preview mode and no capture request is raised even though context is missing', async () => {
  const calls = setup([ITEM]);
  const r = await repairReplaceVerdictResult('u1', 'p1', 'should I repair or replace my water heater');
  assert.deepEqual(calls.preview, [{ preview: true }]);
  assert.equal(r.captureRequests.length, 0);
  assert.equal(r.parameters.inventoryItemId, 'i1');
  assert.ok(r.blocks.some((b) => b.id === 'repair-replace-guidance'));
});
test('an HVAC item is named, never started as a decision thread', async () => {
  const calls = setup([{ ...ITEM, id: 'h1', name: 'Furnace', category: 'HVAC' }]);
  const r = await repairReplaceVerdictResult('u1', 'p1', 'should I repair or replace my furnace');
  assert.equal(r.reasonCode, 'REPAIR_REPLACE_HVAC_OWN_DECISION');
  assert.equal(calls.preview.length, 0);
});
