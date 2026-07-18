const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { getFeatureContextRequirement } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('Reserve Fund distinguishes required calculation input from lifecycle enhancements', () => {
  const contract = getFeatureContextRequirement('RESERVE_FUND', 'RECALCULATE');
  assert.equal(contract.promptStrategy, 'MINIMUM_PATH');
  assert.equal(contract.required.length, 1);
  assert.equal(contract.required[0].factKey, 'inventory.items');
  assert.equal(contract.required[0].classification, 'REQUIRED_CALCULATION');
  assert.equal(contract.required[0].captureKey, 'INVENTORY_ITEM_SELECT_OR_CREATE');
  assert.equal(contract.required[0].minimumItems, 1);
  assert.equal(contract.enhancements.length, 1);
  assert.equal(contract.enhancements[0].classification, 'ENHANCEMENT_ACCURACY');
  assert.equal(contract.enhancements[0].captureKey, 'INVENTORY_ITEM_LIFECYCLE_UPDATE');
  assert.equal(contract.enhancements[0].collectionPredicate, 'SELECTED_ITEM_LIFECYCLE_INCOMPLETE');
});

test('Reserve Fund replaces redirects and compatibility notice with in-place plan construction', () => {
  const client = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/reserve-fund/ReserveFundClient.tsx');
  assert.match(client, /featureKey="RESERVE_FUND"/);
  assert.match(client, /operationKey="RECALCULATE"/);
  assert.match(client, /operationInput=\{propertyContextOperationInput\}/);
  assert.match(client, /onCaptured=\{handleBuildPlan\}/);
  assert.match(client, /synchronizeReserveFund: true/);
  assert.match(client, /Build reserve plan/);
  assert.doesNotMatch(client, /PropertyContextNotice/);
  assert.doesNotMatch(client, /window\.location\.reload/);
  assert.doesNotMatch(client, /href=\{`\/dashboard\/properties\/\$\{propertyId\}\/tools\/capital-timeline`\}/);
});

test('Reserve Fund lifecycle prompts use explicit canonical item identity', () => {
  const client = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/reserve-fund/ReserveFundClient.tsx');
  assert.match(client, /contextInventoryItemId = activeLineItems\.find/);
  assert.match(client, /item\.condition === 'UNKNOWN'/);
  assert.match(client, /!item\.installedOn && !item\.purchasedOn/);
  const service = read('../../src/services/homeReserveFund.service.ts');
  for (const field of ['condition', 'installedOn', 'purchasedOn']) assert.match(service, new RegExp(`${field}: true`));
});

test('interactive recalculation and posture changes enforce shared context before canonical writes', () => {
  const controller = read('../../src/controllers/homeReserveFund.controller.ts');
  const recalculate = controller.indexOf('export async function recalculateFund');
  const recalcShared = controller.indexOf('requireInteractiveReserveContext', recalculate);
  const recalcCanonical = controller.indexOf('homeReserveFundService.recalculate', recalcShared);
  assert.ok(recalculate >= 0 && recalcShared > recalculate && recalcCanonical > recalcShared);

  const update = controller.indexOf('export async function updateFund');
  const updateShared = controller.indexOf('requireInteractiveReserveContext', update);
  const updateCanonical = controller.indexOf('homeReserveFundService.updatePosture', updateShared);
  assert.ok(update >= 0 && updateShared > update && updateCanonical > updateShared);
});

test('Capital Timeline can await reserve synchronization only for the inline workflow', () => {
  const timeline = read('../../src/services/homeCapitalTimeline.service.ts');
  assert.match(timeline, /awaitReserveFundSync\?: boolean/);
  assert.match(timeline, /if \(options\?\.awaitReserveFundSync\) \{\s*await reserveSync/);
  assert.match(timeline, /reserveSync\.catch/);
  const api = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/capital-timeline/capitalTimelineApi.ts');
  assert.match(api, /synchronizeReserveFund\?: boolean/);
});

test('Reserve Fund workers retain noninteractive context checks', () => {
  const worker = read('../../../workers/src/jobs/recalculateReserveFunds.job.ts');
  assert.match(worker, /checkReserveFundWorkerContext/);
  assert.doesNotMatch(worker, /evaluateFeatureContext/);
  assert.doesNotMatch(worker, /captureFeatureContext/);
});
