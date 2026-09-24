const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.70 (product decision, option A for the Gemini-backed tools): APPLIANCE_FAILURE_RISK
// (Appliance Oracle) and MAINTENANCE_BUDGET_FORECAST (Budget Planner) show only the calculated part of each page. The
// real services run with their recommendation methods counted (the services swallow client errors and fall back, so a
// broken client alone would not show a model call); Ask must make none.

const prismaModule = require('../../src/lib/prisma.ts');
const { applianceFailureRiskFromView, maintenanceBudgetFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
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
    { assetType: 'Dishwasher', installationYear: YEAR - 12 },
    { assetType: 'Refrigerator', installationYear: YEAR - 4 },
    { assetType: 'Dryer', installationYear: null },
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

test('Appliance Oracle: calculated failure risk by urgency, no model call, appliances without an age disclosed', async () => {
  const result = await invoke('APPLIANCE_FAILURE_RISK', 'Show my appliance oracle');
  assert.equal(result.reasonCode, 'APPLIANCE_ORACLE_READY');
  assert.equal(aiCalls, 0);
  const [summary, skipped, list] = result.blocks;
  assert.equal(summary.title, '2 appliances analysed');
  assert.equal(summary.body, '1 critical and 0 high risk. Replacing those would cost an estimated $800. Replacement model suggestions are on the Appliance Oracle page.');
  assert.equal(summary.tone, 'CAUTION');
  assert.deepEqual([summary.actions[0].label, summary.actions[0].href], ['Open Appliance Oracle for AI replacement picks', '/dashboard/oracle?propertyId=p1']);
  assert.equal(skipped.title, '1 appliance left out');
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((item) => item.title)]), [['Critical', ['Dishwasher']], ['Low', ['Refrigerator']]]);
  const [dishwasher] = list.sections[0].items;
  assert.equal(dishwasher.description, '12 years old of about 10 expected · 64% failure risk');
  assert.equal(dishwasher.meta[0], 'Past its expected life');
  assert.equal(dishwasher.meta[1], 'Replacement about $800');
  assert.match(result.blocks.at(-1).body, /educational estimates/i);
});

test('Appliance Oracle: nothing with an age is not an all-clear; a non-owner is told who can see it', async () => {
  install({ appliances: [{ assetType: 'Dryer', installationYear: null }] });
  const none = await invoke('APPLIANCE_FAILURE_RISK', 'Show my appliance oracle');
  assert.equal(none.reasonCode, 'APPLIANCE_ORACLE_EMPTY');
  assert.equal(none.blocks[0].title, 'No appliance ages recorded yet');
  install({ owner: false });
  const blocked = await invoke('APPLIANCE_FAILURE_RISK', 'Show my appliance oracle');
  assert.equal(blocked.reasonCode, 'APPLIANCE_ORACLE_PRIMARY_OWNER_ONLY');
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
