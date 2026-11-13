// D17 (reliability FRD): the pure repair-or-replace verdict computes in preview mode, raises no capture, starts no HVAC decision, and writes nothing.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const evaluateModule = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
const analysisModule = require('../../src/services/replaceRepairAnalysis.service.ts');
const { repairReplaceVerdictResult } = require('../../src/services/ask/handlers/repairReplaceVerdict.handler.ts');
const { repairReplaceSaveResult } = require('../../src/services/ask/handlers/miscHandlers.handler.ts');
const { REPAIR_REPLACE_SAVE_MESSAGE, REPAIR_REPLACE_SAVE_ACTION_ID, REPAIR_REPLACE_START_HVAC_ACTION_ID } = require('../../src/services/ask/support/repairReplaceSave.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { isAskActionAllowedForHouseholdRole } = require('../../src/services/ask/askAudiencePresentation.ts');
const { projectForDelivery, isWriteOffer } = require('../../src/services/ask/composition/compositeResult.ts');
const { getAskOperationDefinition, COMPOSABLE_READ_OPERATION_IDS, COMPOSITION_PURE_VARIANTS } = require('../../src/services/ask/askOperationRegistry.ts');

const ITEM = { id: 'i1', name: 'Water Heater', category: 'WATER_HEATER', assetType: null, brand: 'Rheem', model: 'X1', condition: 'FAIR', installedOn: new Date('2012-01-01T12:00:00Z'), purchasedOn: null, expectedExpiryDate: null, updatedAt: new Date() };
const ANALYSIS = { verdict: 'REPLACE_SOON', confidence: 'HIGH', summary: 'Replace soon.', estimatedNextRepairCostCents: 40000, estimatedReplacementCostCents: 150000, expectedAnnualRepairRiskCents: 20000, decisionTrace: [], remainingYears: 2 };
function setup(items, role = 'OWNER') {
  const calls = { preview: [], writes: 0 };
  propertyAccess.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role, isOwner: role === 'OWNER' });
  prisma.inventoryItem = { findMany: async () => items, findFirst: async ({ where }) => items.find((i) => i.id === where.id) ?? null };
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

const actionsOf = (r) => r.blocks.flatMap((b) => b.actions ?? []);
const LAUNCH = { operationId: 'REPLACEMENT_GUIDANCE', entityType: 'INVENTORY_ITEM', entityId: 'i1', surface: 'ASK_WORKSPACE' };

test('D17: the pure verdict offers an explicit "Save this analysis" action to a contributor, never to a viewer, and writes nothing itself', async () => {
  const calls = setup([ITEM]);
  const save = actionsOf(await repairReplaceVerdictResult('u1', 'p1', 'should I repair or replace my water heater')).find((a) => a.id === REPAIR_REPLACE_SAVE_ACTION_ID);
  assert.deepEqual(calls.preview, [{ preview: true }]);
  assert.equal(save.label, 'Save this analysis'); assert.equal(save.operationId, 'REPLACEMENT_GUIDANCE'); assert.equal(save.entityId, 'i1'); assert.equal(save.message, REPAIR_REPLACE_SAVE_MESSAGE); assert.equal(save.style, 'SECONDARY');
  setup([ITEM], 'VIEWER');
  assert.equal(actionsOf(await repairReplaceVerdictResult('u1', 'p1', 'should I repair or replace my water heater')).some((a) => a.id === REPAIR_REPLACE_SAVE_ACTION_ID), false);
});
test('D17: an HVAC item gets a separate "Start the HVAC decision" action and no save action; the standalone persisting turn offers no save action', async () => {
  setup([{ ...ITEM, id: 'h1', name: 'Furnace', category: 'HVAC' }]);
  const ids = actionsOf(await repairReplaceVerdictResult('u1', 'p1', 'should I repair or replace my furnace')).map((a) => a.id);
  assert.deepEqual(ids, [REPAIR_REPLACE_START_HVAC_ACTION_ID]);
  setup([ITEM]);
  const standalone = await require('../../src/services/ask/handlers/miscHandlers.handler.ts').replacementGuidanceResult('u1', 'p1', 'should I repair or replace my water heater', null, 'e1');
  assert.equal(actionsOf(standalone).some((a) => a.id === REPAIR_REPLACE_SAVE_ACTION_ID), false);
});
test('D17: the save turn persists through the canonical analysis (not preview), raises no capture, and says it saved', async () => {
  const calls = setup([ITEM]);
  const r = await repairReplaceSaveResult('u1', 'p1', LAUNCH, 'e1');
  assert.deepEqual(calls.preview, [{ preview: false }]);
  assert.equal(r.reasonCode, 'REPAIR_REPLACE_ANALYSIS_SAVED'); assert.equal(r.captureRequests.length, 0);
  assert.match(r.blocks.find((b) => b.id === 'repair-replace-guidance').body, /^Saved to this item/);
});
test('D17: the save turn refuses a viewer, a refresh/replay, a missing target, a missing item and an HVAC item, and writes nothing in any of them', async () => {
  let calls = setup([ITEM], 'VIEWER');
  assert.equal((await repairReplaceSaveResult('u1', 'p1', LAUNCH, 'e1')).reasonCode, 'ASK_PERMISSION_REQUIRED');
  calls = setup([ITEM]);
  assert.equal((await repairReplaceSaveResult('u1', 'p1', { ...LAUNCH, surface: 'ASK_REFRESH' }, 'e1')).reasonCode, 'REPAIR_REPLACE_SAVE_TARGET_REQUIRED');
  assert.equal((await repairReplaceSaveResult('u1', 'p1', undefined, 'e1')).reasonCode, 'REPAIR_REPLACE_SAVE_TARGET_REQUIRED');
  assert.equal((await repairReplaceSaveResult('u1', 'p1', { ...LAUNCH, entityId: 'nope' }, 'e1')).reasonCode, 'REPAIR_REPLACE_ITEM_NOT_FOUND');
  setup([{ ...ITEM, category: 'HVAC' }]);
  assert.equal((await repairReplaceSaveResult('u1', 'p1', LAUNCH, 'e1')).reasonCode, 'REPAIR_REPLACE_SAVE_HVAC');
  assert.deepEqual(calls.preview, []);
});
test('D17: both new actions are allowlisted for REPLACEMENT_GUIDANCE, are contributor-only, and survive composition (not a COMMAND write offer)', () => {
  for (const id of [REPAIR_REPLACE_SAVE_ACTION_ID, REPAIR_REPLACE_START_HVAC_ACTION_ID]) {
    const action = { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId: 'REPLACEMENT_GUIDANCE', entityType: 'INVENTORY_ITEM', entityId: 'i1', style: 'SECONDARY' };
    assert.equal(isAskActionApplicable({ action, operationId: 'REPLACEMENT_GUIDANCE', propertyId: 'p1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true, id);
    assert.equal(isAskActionApplicable({ action, operationId: 'ITEM_REPAIR_REPLACE_VERDICT', propertyId: 'p1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true, `${id} under the composed child's own operation id`);
    assert.equal(isAskActionAllowedForHouseholdRole(action, 'CONTRIBUTOR'), true, id); assert.equal(isAskActionAllowedForHouseholdRole(action, 'VIEWER'), false, id);
    assert.equal(isWriteOffer(action), false, `${id} must not be stripped from a composite`);
  }
  void projectForDelivery;
});
