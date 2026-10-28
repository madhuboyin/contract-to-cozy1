const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Repair or replace: try different numbers (FRD v1.466). The service's `preview` computes the analysis from the given numbers and saves nothing; the Ask
// layer offers it to a contributor on a non-HVAC item through a declared action, a form prefilled from the recorded analysis, and an answer that says it
// used the homeowner's numbers and saved nothing. No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { isAskActionAllowedForHouseholdRole } = require('../../src/services/ask/askAudiencePresentation.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const evaluate = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { ReplaceRepairService } = require('../../src/services/replaceRepairAnalysis.service.ts');
const { analyticsEmitter } = require('../../src/services/analytics');
const what = require('../../src/services/ask/support/repairReplaceWhatIf.ts');

const OP = 'REPLACEMENT_GUIDANCE';
const ITEM = { id: 'item-1', name: 'Water heater', category: 'WATER_HEATER', brand: null, model: null, condition: 'FAIR', installedOn: null, purchasedOn: null, expectedExpiryDate: null, updatedAt: new Date(), assetType: null, isVerified: true };
const analysis = (over = {}) => ({
  id: 'a1', verdict: 'REPAIR_AND_MONITOR', confidence: 'HIGH', summary: 'Repair it for now.', nextSteps: [], decisionTrace: [], breakEvenMonths: 18,
  estimatedNextRepairCostCents: 40000, estimatedReplacementCostCents: 180000, expectedAnnualRepairRiskCents: 22000, remainingYears: 6, computedAt: '2026-10-28T00:00:00.000Z', ...over,
});

const saved = { items: prisma.inventoryItem, access: propertyAccess.resolvePropertyAccess, evaluate: evaluate.evaluateFeatureContext, run: ReplaceRepairService.prototype.runItemAnalysis, latest: ReplaceRepairService.prototype.getLatestForItem };
let role; let runs;
function install(over = {}) {
  runs = [];
  role = over.role ?? 'CONTRIBUTOR';
  const item = over.item ?? ITEM;
  prisma.inventoryItem = { findFirst: async ({ where }) => (where.id === item.id && where.propertyId === 'prop-1' ? item : null), findMany: async () => [item] };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  evaluate.evaluateFeatureContext = async () => ({ requirements: [{ requirementId: 'r', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', capture: { captureKey: 'LIFECYCLE', title: 't', question: 'q', inputSchema: { type: 'SHORT_TEXT' }, allowNotSure: false, sensitivity: 'STANDARD' } }], contextVersion: 'ctx-1' });
  ReplaceRepairService.prototype.runItemAnalysis = async (...args) => { runs.push(args); return analysis(args[5]?.preview ? { id: 'preview' } : {}); };
  ReplaceRepairService.prototype.getLatestForItem = async () => analysis();
}
test.beforeEach(() => install());
test.afterEach(() => { prisma.inventoryItem = saved.items; propertyAccess.resolvePropertyAccess = saved.access; evaluate.evaluateFeatureContext = saved.evaluate; Object.assign(ReplaceRepairService.prototype, { runItemAnalysis: saved.run, getLatestForItem: saved.latest }); });

const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_WORKSPACE', entityType: 'INVENTORY_ITEM', entityId: 'item-1', ...over });
const invoke = (message, launchContext, accessRole = role) => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext }, { propertyAccess: { role: accessRole } });
const WHAT_IF = what.REPAIR_REPLACE_WHAT_IF_MESSAGE;
const { repairReplaceWhatIfResult } = require('../../src/services/ask/handlers/miscHandlers.handler.ts');

test('the form answer becomes the overrides the canonical service takes, leaving blanks to the model', () => {
  const parse = (answer) => what.RepairReplaceWhatIfAnswerSchema.parse(answer);
  assert.deepEqual(what.whatIfOverrides(parse({ estimatedNextRepairCostUsd: '450.5', estimatedReplacementCostUsd: 2000, expectedRemainingYears: '3', cashBufferUsd: '', riskTolerance: 'HIGH', usageIntensity: '' })),
    { estimatedNextRepairCostCents: 45050, estimatedReplacementCostCents: 200000, expectedRemainingYears: 3, riskTolerance: 'HIGH' });
  assert.deepEqual(what.whatIfOverrides(parse({})), {});
  for (const bad of [{ estimatedNextRepairCostUsd: -1 }, { expectedRemainingYears: 41 }, { riskTolerance: 'EXTREME' }, { cashBufferUsd: 'lots' }, { extra: 1 }]) assert.equal(what.RepairReplaceWhatIfAnswerSchema.safeParse(bad).success, false, JSON.stringify(bad));
  assert.deepEqual(what.whatIfSummary({ estimatedNextRepairCostCents: 45050, expectedRemainingYears: 1, riskTolerance: 'HIGH', cashBufferCents: 100000 }), ['next repair $450.5', '1 year of life left', '$1,000 set aside', 'High risk tolerance']);
});

test('the ordinary analysis offers Try different numbers to a contributor and owner, and not to a viewer', async () => {
  const result = await invoke('Should I repair or replace my water heater?', undefined);
  const actions = result.blocks[0].actions;
  const action = actions.find((a) => a.id === 'repair-replace-what-if');
  assert.deepEqual([action.label, action.message, action.operationId, action.entityType, action.entityId], ['Try different numbers', WHAT_IF, OP, 'INVENTORY_ITEM', 'item-1']);
  assert.equal(runs[0][5].preview, false, 'the ordinary analysis still saves, as before');
  role = 'VIEWER';
  const viewer = await invoke('Should I repair or replace my water heater?', undefined, 'VIEWER');
  assert.equal(viewer.blocks[0].actions.some((a) => a.id === 'repair-replace-what-if'), false);
});

test('it is declared-action only, and typed wording never starts it', async () => {
  // The message names the analysis, so typing it does reach this operation; with no declared launch it is refused and nothing runs.
  assert.equal(resolveAskRoutingCascade(WHAT_IF, { localRoutingEnabled: true }).operation?.operationId, OP);
  for (const bad of [launch({ surface: 'ASK_REFRESH' }), launch({ operationId: 'HOME_ACTIONS' }), launch({ entityType: 'WARRANTY' }), launch({ entityId: '' }), undefined]) {
    assert.equal((await invoke(WHAT_IF, bad)).reasonCode, 'REPAIR_REPLACE_WHAT_IF_TARGET_REQUIRED');
  }
  assert.deepEqual(runs, []);
});

test('a viewer is refused, an unknown item is reported, and an HVAC item is pointed to its own decision', async () => {
  role = 'VIEWER';
  assert.equal((await invoke(WHAT_IF, launch(), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
  install();
  assert.equal((await invoke(WHAT_IF, launch({ entityId: 'nope' }))).reasonCode, 'REPAIR_REPLACE_ITEM_NOT_FOUND');
  install({ item: { ...ITEM, category: 'HVAC' } });
  assert.equal((await invoke(WHAT_IF, launch())).reasonCode, 'REPAIR_REPLACE_WHAT_IF_HVAC');
  assert.deepEqual(runs, []);
});

test('the form is prefilled from the recorded analysis, every field optional, and nothing is run yet', async () => {
  const form = await invoke(WHAT_IF, launch());
  assert.equal(form.status, 'NEEDS_CONTEXT');
  const request = form.captureRequests[0];
  assert.equal(request.captureKey, what.REPAIR_REPLACE_WHAT_IF_CAPTURE_KEY);
  assert.deepEqual(request.inputSchema.fields.map((f) => [f.key, f.required]), [['estimatedNextRepairCostUsd', false], ['estimatedReplacementCostUsd', false], ['expectedRemainingYears', false], ['cashBufferUsd', false], ['riskTolerance', false], ['usageIntensity', false]]);
  assert.deepEqual(request.currentAnswer, { estimatedNextRepairCostUsd: 400, estimatedReplacementCostUsd: 1800, expectedRemainingYears: 6 });
  assert.match(request.helpText, /nothing is saved/);
  assert.deepEqual(form.parameters, { inventoryItemId: 'item-1' });
  assert.deepEqual(runs, []);
});

test('a submitted form runs the analysis as a preview with the overrides, says so, and offers a way back', async () => {
  const result = await repairReplaceWhatIfResult('user-1', 'prop-1', launch(), 'exec-1', { estimatedNextRepairCostUsd: 900, riskTolerance: 'HIGH' });
  assert.equal(runs.length, 1);
  const [propertyId, itemId, userId, overrides, , options] = runs[0];
  assert.deepEqual([propertyId, itemId, userId, overrides, options], ['prop-1', 'item-1', 'user-1', { estimatedNextRepairCostCents: 90000, riskTolerance: 'HIGH' }, { preview: true }]);
  assert.equal(result.reasonCode, 'REPAIR_REPLACE_WHAT_IF');
  assert.equal(result.captureRequests.length, 0, 'no lifecycle prompt on a what-if');
  const summary = result.blocks[0];
  assert.match(summary.body, /^This is a what-if using next repair \$900, High risk tolerance\. Nothing was saved, and the item's recorded analysis is unchanged\./);
  assert.deepEqual(summary.actions.map((a) => [a.id, a.label]), [['repair-replace-check-warranty', 'Is it under warranty?'], ['repair-replace-what-if', 'Change the numbers'], ['repair-replace-back-to-recorded', 'Back to the recorded analysis']]);
  assert.equal(summary.actions[2].message, 'Should I repair or replace Water heater?');
  assert.match(result.blocks.find((b) => b.id === 'repair-replace-evidence').items[0].source, /not saved/);
});

test('nothing valid to run keeps the form open and runs nothing', async () => {
  for (const answer of [{}, { riskTolerance: 'EXTREME' }, { expectedRemainingYears: 99 }]) {
    const result = await repairReplaceWhatIfResult('user-1', 'prop-1', launch(), 'exec-1', answer);
    assert.equal(result.reasonCode, 'REPAIR_REPLACE_WHAT_IF_INPUT_INVALID');
    assert.equal(result.captureRequests[0].captureKey, what.REPAIR_REPLACE_WHAT_IF_CAPTURE_KEY);
  }
  assert.deepEqual(runs, []);
});

test('the actions are allowlisted for the analysis and the what-if is refused to a viewer', () => {
  for (const id of ['repair-replace-what-if', 'repair-replace-back-to-recorded']) {
    const action = { id, label: 'x', interactionType: 'START_WORKFLOW', message: WHAT_IF, operationId: OP, style: 'SECONDARY' };
    assert.equal(isAskActionApplicable({ action, operationId: OP, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true, id);
  }
  const action = { id: 'repair-replace-what-if', label: 'Try different numbers', interactionType: 'START_WORKFLOW', message: WHAT_IF, operationId: OP, style: 'SECONDARY' };
  assert.equal(isAskActionAllowedForHouseholdRole(action, 'CONTRIBUTOR'), true);
  assert.equal(isAskActionAllowedForHouseholdRole(action, 'VIEWER'), false);
});

// ───────────────────────────── the service: a preview writes nothing ─────────────────────────────

test('the service computes a preview from the overrides without writing a row, superseding one or tracking an outcome', async () => {
  const touched = [];
  const savedPrisma = prisma;
  const savedEmitter = analyticsEmitter.outcomeGenerated;
  analyticsEmitter.outcomeGenerated = (...a) => touched.push(['outcome', ...a]);
  const realItem = { ...ITEM, propertyId: 'prop-1', roomId: null, installedOn: null, purchasedOn: null, lastServicedOn: null, purchaseCostCents: null, replacementCostCents: null };
  const stub = {
    property: { findFirst: async () => ({ id: 'prop-1', homeownerProfileId: 'hp-1', riskReport: { riskScore: 60 } }) },
    inventoryItem: { findFirst: async () => realItem },
    homeEvent: { findMany: async () => [] },
    $transaction: async () => { touched.push(['transaction']); throw new Error('a preview must not write'); },
    replaceRepairAnalysis: new Proxy({}, { get: (_t, name) => async () => { touched.push(['replaceRepairAnalysis', String(name)]); throw new Error('a preview must not write'); } }),
  };
  const originals = Object.fromEntries(Object.keys(stub).map((key) => [key, savedPrisma[key]]));
  Object.assign(savedPrisma, stub);
  const real = new (require('../../src/services/replaceRepairAnalysis.service.ts').ReplaceRepairService)();
  try {
    ReplaceRepairService.prototype.runItemAnalysis = saved.run;
    const out = await real.runItemAnalysis('prop-1', 'item-1', 'user-1', { estimatedNextRepairCostCents: 90000, estimatedReplacementCostCents: 120000, expectedRemainingYears: 1 }, 'ctx', { preview: true });
    assert.equal(out.id, 'preview');
    assert.equal(out.estimatedReplacementCostCents, 120000, 'the homeowner\'s number is used');
    assert.ok(['REPLACE_NOW', 'REPLACE_SOON', 'REPAIR_AND_MONITOR', 'REPAIR_ONLY'].includes(out.verdict));
    assert.deepEqual(touched, [], 'nothing was written and no outcome tracked');
  } finally { Object.assign(savedPrisma, originals); analyticsEmitter.outcomeGenerated = savedEmitter; }
});
