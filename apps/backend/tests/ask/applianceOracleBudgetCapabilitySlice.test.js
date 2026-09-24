const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.70 (product decision, option A for the Gemini-backed tools): APPLIANCE_FAILURE_RISK
// (Appliance Oracle) and MAINTENANCE_BUDGET_FORECAST (Budget Planner) show only the calculated part of each page. The
// real services run with their recommendation methods counted (the services swallow client errors and fall back, so a
// broken client alone would not show a model call); Ask must make none.

const prismaModule = require('../../src/lib/prisma.ts');
const { applianceFailureRiskFromView, maintenanceBudgetFromView, oracleLifespanItem, oracleApplianceLabel } = require('../../src/services/ask/askOrchestrator.service.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { InventoryService } = require('../../src/services/inventory.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const { applianceOracleService } = require('../../src/services/applianceOracle.service.ts');
const { budgetForecasterService } = require('../../src/services/budgetForecaster.service.ts');
const protectionContext = require('../../src/services/protection/context.ts');
const applianceInventory = require('../../src/services/propertyApplianceInventory.service.ts');

const YEAR = new Date().getFullYear();
const originals = {
  prisma: prismaModule.prisma, oracleRecs: applianceOracleService.getAIRecommendations, budgetRecs: budgetForecasterService.getAIRecommendations,
  protection: protectionContext.getProtectionContextDecisions, inventory: applianceInventory.listPropertyApplianceInventory,
};
let aiCalls;

function install({ owner = true, yearBuilt = 1996, appliances } = {}) {
  aiCalls = 0;
  applianceOracleService.getAIRecommendations = async () => { aiCalls += 1; return []; };
  budgetForecasterService.getAIRecommendations = async () => { aiCalls += 1; return []; };
  protectionContext.getProtectionContextDecisions = async () => ({ contextVersion: 'v1', decisions: { applianceOracle: { status: 'APPLICABLE' } } });
  applianceInventory.listPropertyApplianceInventory = async () => appliances ?? [
    { id: 'item-dishwasher', assetType: 'Dishwasher', installationYear: YEAR - 12 },
    { id: 'item-fridge', assetType: 'Refrigerator', installationYear: YEAR - 4 },
    { id: 'item-dryer', assetType: 'Dryer', installationYear: null },
  ];
  prismaModule.prisma = {
    property: { findFirst: async () => (owner ? { id: 'p1', address: '1 Main St', yearBuilt, dwellingType: 'SINGLE_FAMILY', homeownerProfile: {}, inventoryItems: [{}, {}] } : null) },
  };
}

test.beforeEach(() => install());
test.afterEach(() => {
  prismaModule.prisma = originals.prisma;
  applianceOracleService.getAIRecommendations = originals.oracleRecs;
  budgetForecasterService.getAIRecommendations = originals.budgetRecs;
  protectionContext.getProtectionContextDecisions = originals.protection;
  applianceInventory.listPropertyApplianceInventory = originals.inventory;
});

const invoke = (operationId, message) => capabilityInvoke(operationId, { userId: 'u1', propertyId: 'p1', message }, { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' } });

test('Appliance Oracle: lifespan bars labelled with the Oracle\'s risk level, no model call, and appliances without an age named with an inline purchase-date capture (FRD v1.78)', async () => {
  const result = await invoke('APPLIANCE_FAILURE_RISK', 'Show my appliance oracle');
  assert.equal(result.reasonCode, 'APPLIANCE_ORACLE_READY');
  assert.equal(aiCalls, 0);
  assert.deepEqual(result.blocks.map((block) => `${block.type}:${block.id}`), ['SUMMARY:appliance-oracle-summary', 'LIFESPAN:appliance-oracle-items', 'BOUNDARY:appliance-oracle-boundary']);
  const [summary, lifespan] = result.blocks;
  assert.equal(summary.title, '2 appliances analysed');
  assert.equal(summary.body, '1 critical and 0 high risk. Replacing those would cost an estimated $800. Replacement model suggestions are on the Appliance Oracle page.');
  assert.equal(summary.tone, 'CAUTION');
  assert.deepEqual([summary.actions[0].label, summary.actions[0].href], ['Open Appliance Oracle for AI replacement picks', '/dashboard/oracle?propertyId=p1']);
  assert.match(lifespan.basis, /purchase date/);
  assert.deepEqual(lifespan.items.map((item) => [item.id, item.label, item.ageYears, item.typicalLifeYears, item.status, item.statusLabel, item.entityType]), [
    ['item-dishwasher', 'Dishwasher', 12, { min: 8, max: 12 }, 'PAST_RANGE', 'Critical · 64% failure risk', 'INVENTORY_ITEM'],
    ['item-fridge', 'Refrigerator', 4, { min: 11, max: 15 }, 'WITHIN_RANGE', 'Low · 3% failure risk', 'INVENTORY_ITEM'],
  ]);
  assert.deepEqual(lifespan.items[0].meta, ['Past its expected life', 'Replacement about $800', 'Replace immediately to avoid emergency failure and higher costs']);
  assert.equal(lifespan.missingAgeTitle, 'No purchase date yet for this appliance');
  assert.deepEqual(lifespan.missingAge.map((item) => [item.id, item.label, item.entityType, item.actions.map((action) => [action.id, action.label, action.operationId, action.interactionType])]), [
    ['item-dryer', 'Dryer', 'INVENTORY_ITEM', [['correct-purchasedOn', 'Add purchase date', 'INVENTORY_ITEM_CORRECT', 'MUTATE_RECORD']]],
  ]);
  assert.equal(result.blocks.some((block) => block.id === 'appliance-oracle-skipped'), false);
  assert.match(result.blocks.at(-1).body, /educational estimates/i);
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
});

test('Appliance Oracle: nothing with an age is not an all-clear and still offers the capture; a non-owner is told who can see it', async () => {
  install({ appliances: [{ id: 'item-dryer', assetType: 'DRYER', installationYear: null }] });
  const none = await invoke('APPLIANCE_FAILURE_RISK', 'Show my appliance oracle');
  assert.equal(none.reasonCode, 'APPLIANCE_ORACLE_EMPTY');
  assert.equal(none.blocks[0].title, 'No appliance ages recorded yet');
  assert.match(none.blocks[0].body, /Add a purchase date below/);
  const lifespan = none.blocks.find((block) => block.id === 'appliance-oracle-items');
  assert.deepEqual(lifespan.items, []);
  assert.deepEqual(lifespan.missingAge.map((item) => [item.id, item.label]), [['item-dryer', 'Dryer']]);
  install({ owner: false });
  const blocked = await invoke('APPLIANCE_FAILURE_RISK', 'Show my appliance oracle');
  assert.equal(blocked.reasonCode, 'APPLIANCE_ORACLE_PRIMARY_OWNER_ONLY');
});

test('Appliance Oracle service: a this-year purchase is analysed at age 0 (it used to be skipped), a future year is skipped, and each prediction carries its item and typical range', async () => {
  install({ appliances: [
    { id: 'item-new', assetType: 'MICROWAVE_HOOD', installationYear: YEAR },
    { id: 'item-future', assetType: 'Washer', installationYear: YEAR + 1 },
    { id: 'item-unknown', assetType: 'Dryer', installationYear: null },
  ] });
  const report = await applianceOracleService.generateOracleReport('p1', 'u1', { includeRecommendations: false });
  assert.deepEqual(report.predictions.map((prediction) => [prediction.inventoryItemId, prediction.currentAge, prediction.urgency, prediction.typicalLifeYears]), [['item-new', 0, 'LOW', { min: 8, max: 10 }]]);
  assert.equal(report.appliancesWithoutAge, 2);
  assert.deepEqual(report.appliancesWithoutAgeItems, [{ inventoryItemId: 'item-future', applianceName: 'Washer' }, { inventoryItemId: 'item-unknown', applianceName: 'Dryer' }]);
  const answer = applianceFailureRiskFromView(report, 'p1');
  assert.deepEqual(answer.blocks.find((block) => block.id === 'appliance-oracle-items').items.map((item) => [item.label, item.ageYears]), [['Microwave hood', 0]]);
});

test('Appliance Oracle: status follows the Oracle risk level, a legacy report without names keeps the count notice, and labels read as words', () => {
  const prediction = (urgency, overrides = {}) => ({
    applianceName: 'Water Heater', category: 'PLUMBING', currentAge: 9, expectedLife: 10, remainingLife: 1, failureRisk: 35, urgency,
    estimatedFailureDate: new Date('2027-09-01T00:00:00Z'), replacementCost: 1500, recommendations: [], maintenanceImpact: 'Plan replacement in 1-2 years. Start researching options',
    inventoryItemId: 'item-wh', typicalLifeYears: { min: 8, max: 12 }, ...overrides,
  });
  assert.deepEqual(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((urgency) => [oracleLifespanItem(prediction(urgency), 0).status, oracleLifespanItem(prediction(urgency), 0).statusLabel]), [
    ['PAST_RANGE', 'Critical · 35% failure risk'], ['PLAN_AHEAD', 'High · 35% failure risk'], ['PLAN_AHEAD', 'Medium · 35% failure risk'], ['WITHIN_RANGE', 'Low · 35% failure risk'],
  ]);
  const legacy = oracleLifespanItem(prediction('HIGH', { inventoryItemId: undefined, typicalLifeYears: undefined }), 3);
  assert.deepEqual([legacy.id, legacy.typicalLifeYears, 'entityType' in legacy], ['appliance-3', { min: 10, max: 10 }, false]);
  assert.equal(oracleApplianceLabel('OVEN_RANGE'), 'Oven range');
  assert.equal(oracleApplianceLabel('Water Heater (Tank)'), 'Water Heater (Tank)');
  const report = { totalAppliances: 1, criticalCount: 0, highRiskCount: 1, estimatedTotalCost: 1500, predictions: [prediction('HIGH')], appliancesWithoutAge: 2, meta: { disclaimer: 'Educational estimates.' } };
  const answer = applianceFailureRiskFromView(report, 'p1');
  assert.equal(answer.blocks.find((block) => block.id === 'appliance-oracle-skipped').title, '2 appliances left out');
  assert.match(answer.blocks.find((block) => block.id === 'appliance-oracle-skipped').body, /purchase date/);
  assert.deepEqual(answer.blocks.find((block) => block.id === 'appliance-oracle-items').missingAge, []);
});

test('Add purchase date opens the existing inventory correction for that exact appliance, as a date, with its confirmation', async () => {
  const originalList = InventoryService.prototype.listItems;
  const originalAccess = propertyAccess.resolvePropertyAccess;
  InventoryService.prototype.listItems = async () => [
    { id: 'item-dryer', name: 'Dryer', purchasedOn: null, installedOn: null, updatedAt: new Date('2026-09-01T00:00:00Z'), category: 'APPLIANCE', condition: 'GOOD', room: null },
    { id: 'item-fridge', name: 'Refrigerator', purchasedOn: new Date('2022-01-01T00:00:00Z'), installedOn: null, updatedAt: new Date('2026-09-01T00:00:00Z'), category: 'APPLIANCE', condition: 'GOOD', room: null },
  ];
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', userId: 'u1', propertyId: 'p1' });
  try {
    const oracle = await invoke('APPLIANCE_FAILURE_RISK', 'Show my appliance oracle');
    const action = oracle.blocks.find((block) => block.id === 'appliance-oracle-items').missingAge[0].actions[0];
    const proposal = await capabilityInvoke('INVENTORY_ITEM_CORRECT', {
      userId: 'u1', propertyId: 'p1', message: action.message,
      launchContext: { surface: 'ASK_WORKSPACE', entityType: 'INVENTORY_ITEM', entityId: 'item-dryer', operationId: action.operationId },
    }, { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' } });
    assert.equal(proposal.status, 'NEEDS_CONFIRMATION');
    assert.equal(proposal.confirmation.title, 'Correct purchase date for Dryer?');
    assert.equal(proposal.confirmation.editableFields[0].type, 'DATE');
  } finally {
    InventoryService.prototype.listItems = originalList;
    propertyAccess.resolvePropertyAccess = originalAccess;
  }
});

test('Budget Planner: the calculated yearly and monthly forecast by category and month, no model call', async () => {
  const result = await invoke('MAINTENANCE_BUDGET_FORECAST', 'Show my budget planner');
  assert.equal(result.reasonCode, 'BUDGET_FORECAST_READY');
  assert.equal(aiCalls, 0);
  const [summary, list] = result.blocks;
  assert.match(summary.title, /^About \$[\d,]+ a year for upkeep$/);
  assert.match(summary.body, /^That is about \$[\d,]+ a month on average, highest in \w+ \(\$[\d,]+\)\. Confidence 70%\. Money-saving tips are on the Budget Planner page\.$/);
  assert.equal(summary.actions[0].label, 'Open Budget Planner for AI tips');
  assert.equal(result.blocks.some((block) => block.id === 'budget-forecast-assumed-age'), false);
  assert.deepEqual(list.sections.map((section) => section.title), ['By category', 'By month']);
  assert.equal(list.sections[1].count, 12);
  assert.equal(result.blocks.at(-1).title, 'A typical-cost estimate, not your spending');
});

test('Budget Planner: an assumed home age is disclosed; a non-owner is told who can see it', async () => {
  install({ yearBuilt: null });
  const assumed = await invoke('MAINTENANCE_BUDGET_FORECAST', 'Show my budget planner');
  assert.equal(assumed.blocks.find((block) => block.id === 'budget-forecast-assumed-age').title, 'Home age assumed');
  install({ owner: false });
  const blocked = await invoke('MAINTENANCE_BUDGET_FORECAST', 'Show my budget planner');
  assert.equal(blocked.reasonCode, 'BUDGET_PLANNER_PRIMARY_OWNER_ONLY');
});

test('the pages keep their Gemini recommendations by default', async () => {
  await applianceOracleService.generateOracleReport('p1', 'u1');
  assert.equal(aiCalls, 2);
  await budgetForecasterService.generateBudgetForecast('p1', 'u1');
  assert.equal(aiCalls, 3);
});

test('every block survives the answer-trust validator, and each page link the whitelist', async () => {
  for (const [operationId, message, sourceId] of [
    ['APPLIANCE_FAILURE_RISK', 'Show my appliance oracle', 'appliance-oracle.risk'],
    ['MAINTENANCE_BUDGET_FORECAST', 'Show my budget planner', 'budget-planner.forecast'],
  ]) {
    install({ yearBuilt: null });
    const raw = await invoke(operationId, message);
    const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId, operationId, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-24T00:00:00.000Z' }] } } };
    const { result: validated } = validateAskAnswerTrust({ question: message, operationId, result, propertyId: 'p1' });
    assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id), operationId);
    assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId, propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true, operationId);
  }
});

test('failure-risk and upkeep-budget questions route here; buying, inventory, one-item and ownership-cost questions do not', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true });
  for (const message of ['Show my appliance oracle', 'Which appliances are likely to fail soon?', 'Which of our appliances are closest to failing?', 'Which of our systems are past their expected life?']) {
    assert.equal(route(message).operation?.operationId, 'APPLIANCE_FAILURE_RISK', message);
  }
  for (const message of ['Show my budget planner', 'How much should we budget for home maintenance this year?', 'What does the budget planner say we will spend on maintenance?']) {
    assert.equal(route(message).operation?.operationId, 'MAINTENANCE_BUDGET_FORECAST', message);
  }
  assert.equal(route('Show my inventory').operation?.operationId, 'INVENTORY_LOOKUP');
  assert.equal(route('What are my monthly ownership costs?').operation?.operationId, 'OWNERSHIP_COSTS');
  assert.equal(route('Show my maintenance forecast').operation?.operationId, 'MAINTENANCE_FORECAST');
  // Each of these matches a pattern, so only the exclusion keeps the deterministic pattern from claiming them.
  for (const message of ['Which appliances are likely to fail and which brand should I buy?', 'Set up a maintenance budget of $300 a month', 'What renovation budget do we need?']) {
    const resolution = route(message);
    const claimed = resolution.stage === 'DETERMINISTIC' && ['APPLIANCE_FAILURE_RISK', 'MAINTENANCE_BUDGET_FORECAST'].includes(resolution.operation?.operationId);
    assert.equal(claimed, false, message);
  }
});

test('both operations are fully registered: own skills, the owner floor, the bridge, and the card launches', () => {
  for (const [operationId, skillId, capabilityId] of [
    ['APPLIANCE_FAILURE_RISK', 'appliance-oracle', 'oracle'],
    ['MAINTENANCE_BUDGET_FORECAST', 'budget-planner', 'budget'],
  ]) {
    const skill = getSkillForOperation(operationId);
    assert.equal(skill.id, skillId);
    assert.equal(skill.authorizationFloor, 'OWNER');
    assert.equal(ASK_OPERATION_CAPABILITY[operationId], capabilityId);
    const launch = capabilityCardLaunch(capabilityId).inlineLaunch;
    assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, operationId);
  }
});

test('the full answer checker, with answer relevance on, keeps the lifespan answer and its purchase-date capture (FRD v1.78)', async () => {
  const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
  const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
  for (const question of ['Show my appliance oracle', 'Which appliances are likely to fail soon?']) {
    const result = await invoke('APPLIANCE_FAILURE_RISK', question);
    const checked = validateAskAnswerTrustPipeline({
      question, operationId: 'APPLIANCE_FAILURE_RISK', propertyId: 'p1', semanticEnabled: true,
      result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('APPLIANCE_FAILURE_RISK')]),
    });
    assert.equal(checked.result.status, 'ANSWERED', `${question}: ${JSON.stringify(checked.semantic)} ${JSON.stringify(checked.trust.reasonCodes)}`);
    const lifespan = checked.result.blocks.find((block) => block.id === 'appliance-oracle-items');
    assert.deepEqual(lifespan.missingAge[0].actions.map((action) => action.id), ['correct-purchasedOn'], question);
    assert.equal(checked.trust.reasonCodes.includes('INAPPLICABLE_ACTION_REMOVED'), false, JSON.stringify(checked.trust.reasonCodes));
  }
});

test('the missing-age heading is Ask copy, so the checker catches an internal code leaking into it (FRD v1.78)', async () => {
  const raw = await invoke('APPLIANCE_FAILURE_RISK', 'Show my appliance oracle');
  const leak = { ...raw, blocks: raw.blocks.map((block) => (block.id === 'appliance-oracle-items' ? { ...block, missingAgeTitle: 'APPLIANCE_ORACLE_MISSING_AGE' } : block)) };
  const evidence = { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'appliance-oracle.risk', operationId: 'APPLIANCE_FAILURE_RISK', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-24T00:00:00.000Z' }] } };
  const clean = validateAskAnswerTrust({ question: 'Show my appliance oracle', operationId: 'APPLIANCE_FAILURE_RISK', result: { ...raw, parameters: evidence }, propertyId: 'p1' });
  const leaked = validateAskAnswerTrust({ question: 'Show my appliance oracle', operationId: 'APPLIANCE_FAILURE_RISK', result: { ...leak, parameters: evidence }, propertyId: 'p1' });
  assert.equal(clean.result.status, 'ANSWERED');
  assert.notEqual(leaked.result.status, 'ANSWERED');
});
