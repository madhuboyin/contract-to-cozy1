const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { getFeatureContextRequirement } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');
const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

const financialSurfaces = [
  ['DO_NOTHING', 'RUN_SIMULATION', '../../../frontend/src/components/ai/DoNothingSimulatorPanel.tsx'],
  ['HOME_SAVINGS', 'RUN_ANALYSIS', '../../../frontend/src/components/ai/HomeSavingsCheckPanel.tsx'],
  ['BUDGET_PLANNER', 'VIEW_FORECAST', '../../../frontend/src/app/(dashboard)/dashboard/components/BudgetForecaster.tsx'],
  ['TRUE_COST', 'VIEW_ANALYSIS', '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/true-cost/TrueCostClient.tsx'],
  ['COST_GROWTH', 'VIEW_ANALYSIS', '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/cost-growth/HomeCostGrowthClient.tsx'],
  ['COST_VOLATILITY', 'VIEW_ANALYSIS', '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/cost-volatility/CostVolatilityClient.tsx'],
  ['COST_EXPLAINER', 'VIEW_ANALYSIS', '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/cost-explainer/CostExplainerClient.tsx'],
  ['BREAK_EVEN', 'VIEW_ANALYSIS', '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/break-even/BreakEvenClient.tsx'],
  ['SELL_HOLD_RENT', 'VIEW_ANALYSIS', '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/sell-hold-rent/SellHoldRentClient.tsx'],
  ['PROPERTY_TAX', 'VIEW_ESTIMATE', '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/property-tax/PropertyTaxClient.tsx'],
  ['HIDDEN_ASSETS', 'VIEW_MATCHES', '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/hidden-asset-finder/HiddenAssetFinderClient.tsx'],
];

test('remaining financial tools expose only nonblocking accuracy enhancements', () => {
  for (const [featureKey, operationKey] of financialSurfaces) {
    const contract = getFeatureContextRequirement(featureKey, operationKey);
    assert.equal(contract.required.length, 0, `${featureKey} must preserve default-backed results`);
    assert.ok(contract.enhancements.length > 0);
    assert.ok(contract.enhancements.every((item) => item.classification === 'ENHANCEMENT_ACCURACY'));
  }
});

test('remaining financial tools capture and re-evaluate in place with explicit property identity', () => {
  for (const [featureKey, operationKey, file] of financialSurfaces) {
    const client = read(file);
    assert.match(client, /PropertyContextCapturePanel/);
    assert.match(client, /propertyId=\{propertyId\}/);
    assert.match(client, new RegExp(`featureKey="${featureKey}"`));
    assert.match(client, new RegExp(`operationKey="${operationKey}"`));
    assert.match(client, /onCaptured=/);
    assert.doesNotMatch(client, /<PropertyContextNotice/);
    assert.doesNotMatch(client, /window\.location\.reload/);
  }
});

test('maintenance template capture covers presence and responsibility and is rechecked before writes', () => {
  const contract = getFeatureContextRequirement('MAINTENANCE', 'PREPARE_TEMPLATE');
  for (const factKey of ['systems.heatingType', 'systems.waterHeaterType', 'systems.installedItemTypes', 'exterior.hasLawn', 'exterior.hasTreesOrShrubs', 'exterior.hasIrrigation', 'responsibility.hvac', 'responsibility.plumbing', 'responsibility.roof', 'responsibility.landscaping']) {
    assert.ok(contract.required.some((item) => item.factKey === factKey), factKey);
  }
  const service = read('../../src/services/PropertyMaintenanceTask.service.ts');
  const evaluation = service.indexOf("operationKey: 'PREPARE_TEMPLATE'");
  const legacyPolicy = service.indexOf('evaluateMaintenanceTemplateApplicability(context, template)', evaluation);
  assert.ok(evaluation >= 0 && legacyPolicy > evaluation);
  const page = read('../../../frontend/src/app/(dashboard)/dashboard/maintenance-setup/page.tsx');
  assert.match(page, /operationKey="PREPARE_TEMPLATE"/);
  assert.match(page, /operationInput=\{unknownTemplate\.contextInput\}/);
  assert.doesNotMatch(page, /window\.location\.reload/);
});

test('aggregate notices use the explanation-only status renderer', () => {
  const notice = read('../../../frontend/src/components/property-context/PropertyContextStatusNotice.tsx');
  assert.doesNotMatch(notice, /captureFeatureContext|capturePropertyContext|<button|<input/);
  assert.match(notice, /correctionPaths/);
  for (const file of [
    '../../../frontend/src/app/(dashboard)/dashboard/actions/ActionsClient.tsx',
    '../../../frontend/src/app/(dashboard)/dashboard/components/MorningHomePulseCard.tsx',
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/guidance-overview/GuidanceOverviewClient.tsx',
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-gazette/HomeGazetteClient.tsx',
    '../../../frontend/src/components/knowledge/KnowledgeTargetingNotice.tsx',
  ]) assert.match(read(file), /<PropertyContextStatusNotice/);
});

test('environment and energy retain their explicit evidence-owned capture paths', () => {
  const environment = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/environment-report/page.tsx');
  assert.match(environment, /InlineInsightQuestions/);
  assert.match(environment, /propertyId/);
  assert.match(environment, /await onSaved\(question\.prompt\)/);
  const energy = read('../../../frontend/src/components/EnergyAuditor.tsx');
  assert.match(energy, /FormData/);
  assert.match(energy, /getEnergyAudit\(formData\)/);
  assert.doesNotMatch(energy, /PropertyContextNotice/);
});
