const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { getFeatureContextRequirement } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('Capital Timeline registers a nonblocking minimum path for partial planning', () => {
  const contract = getFeatureContextRequirement('CAPITAL_TIMELINE', 'RUN_TIMELINE');
  assert.equal(contract.promptStrategy, 'MINIMUM_PATH');
  assert.deepEqual(contract.required, []);
  assert.equal(contract.enhancements.length, 2);
  assert.deepEqual(contract.enhancements.map((requirement) => requirement.captureKey), [
    'INVENTORY_ITEM_SELECT_OR_CREATE',
    'INVENTORY_ITEM_LIFECYCLE_UPDATE',
  ]);
  assert.equal(contract.enhancements[0].minimumItems, 1);
  assert.equal(contract.enhancements[1].collectionPredicate, 'SELECTED_ITEM_LIFECYCLE_INCOMPLETE');
  assert.ok(contract.enhancements.every((requirement) => requirement.classification === 'ENHANCEMENT_ACCURACY'));
});

test('an unselected collection does not activate a lifecycle update without explicit item identity', () => {
  const evaluator = read('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
  assert.match(evaluator, /typeof itemId !== 'string' \|\| !itemId\.trim\(\)\) return 'KNOWN'/);
  assert.match(evaluator, /candidate as \{ id\?: unknown \}\)\.id === itemId/);
});

test('Capital Timeline replaces its notice with progressive in-place capture', () => {
  const client = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/capital-timeline/CapitalTimelineClient.tsx');
  assert.match(client, /featureKey="CAPITAL_TIMELINE"/);
  assert.match(client, /operationKey="RUN_TIMELINE"/);
  assert.match(client, /operationInput=\{propertyContextOperationInput\}/);
  assert.match(client, /contextInventoryItemId = items\.find/);
  assert.match(client, /onCaptured=\{\(\) => doRun\(horizonYears, activeAssumptionSetId\)\}/);
  assert.doesNotMatch(client, /PropertyContextNotice/);
  assert.doesNotMatch(client, /window\.location\.reload/);
});

test('timeline overrides and inventory details remain canonical correction paths', () => {
  const client = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/capital-timeline/CapitalTimelineClient.tsx');
  for (const command of ['createOverride', 'updateOverride', 'deleteOverride', 'InventoryItemDrawer']) {
    assert.match(client, new RegExp(command));
  }
  const service = read('../../src/services/homeCapitalTimeline.service.ts');
  assert.match(service, /prisma\.homeCapitalTimelineOverride\.findMany/);
  assert.match(service, /item\.installedOn \|\| item\.purchasedOn/);
  assert.match(service, /item\.replacementCostCents \|\| costOverride/);
});

test('interactive timeline runs enforce shared context before canonical computation', () => {
  const controller = read('../../src/controllers/homeCapitalTimeline.controller.ts');
  const start = controller.indexOf('export async function runTimeline');
  const financial = controller.indexOf('assertFinancialContextApplicable', start);
  const shared = controller.indexOf('evaluateFeatureContext', financial);
  const canonical = controller.indexOf('service.runTimeline', shared);
  assert.ok(start >= 0 && financial > start && shared > financial && canonical > shared);
  assert.match(controller, /featureKey: 'CAPITAL_TIMELINE'/);
  assert.match(controller, /operationKey: 'RUN_TIMELINE'/);
});

test('background reserve-fund recomputation does not launch interactive capture', () => {
  const worker = read('../../../workers/src/jobs/recalculateReserveFunds.job.ts');
  assert.doesNotMatch(worker, /evaluateFeatureContext/);
  assert.doesNotMatch(worker, /captureFeatureContext/);
});
