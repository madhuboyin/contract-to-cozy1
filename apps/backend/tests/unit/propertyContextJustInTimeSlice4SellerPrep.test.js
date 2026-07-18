const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { getFeatureContextRequirement } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('Seller Prep locks its minimum planning inputs to canonical property facts', () => {
  const contract = getFeatureContextRequirement('SELLER_PREP', 'OPEN_PLAN');
  assert.equal(contract.promptStrategy, 'MINIMUM_PATH');
  assert.deepEqual(contract.required.map((requirement) => requirement.factKey), ['core.propertyUse', 'location.state']);
  assert.equal(contract.required[0].classification, 'REQUIRED_APPLICABILITY');
  assert.equal(contract.required[0].captureKey, 'CORE_PROPERTY_USE');
  assert.equal(contract.required[1].classification, 'REQUIRED_CALCULATION');
  assert.equal(contract.required[1].captureKey, 'LOCATION_STATE');
});

test('Seller Prep replaces its compatibility notice with an entry boundary and in-place continuation', () => {
  const page = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/seller-prep/page.tsx');
  assert.match(page, /featureKey="SELLER_PREP"/);
  assert.match(page, /operationKey="OPEN_PLAN"/);
  assert.match(page, /enabled: !!propertyId && contextReady/);
  assert.match(page, /onReady=\{\(\) => setContextReady\(true\)\}/);
  assert.doesNotMatch(page, /PropertyContextNotice/);
  assert.doesNotMatch(page, /property-context.*reload/i);
});

test('Seller Prep enforces shared readiness before plan reads or creation paths', () => {
  const controller = read('../../src/sellerPrep/sellerPrep.controller.ts');
  const overview = controller.indexOf('static async getOverview');
  const overviewShared = controller.indexOf('requirePlanContext', overview);
  const overviewCanonical = controller.indexOf('SellerPrepService.getOverview', overviewShared);
  const report = controller.indexOf('static async getReadinessReport');
  const reportShared = controller.indexOf('requirePlanContext', report);
  const reportCanonical = controller.indexOf('SellerPrepService.getSellerReadinessReport', reportShared);
  const preferences = controller.indexOf('static async savePreferences');
  const preferencesShared = controller.indexOf('requirePlanContext', preferences);
  const preferencesCanonical = controller.indexOf('prisma.sellerPrepPlan.findFirst', preferencesShared);
  assert.ok(overviewShared > overview && overviewCanonical > overviewShared);
  assert.ok(reportShared > report && reportCanonical > reportShared);
  assert.ok(preferencesShared > preferences && preferencesCanonical > preferencesShared);
  assert.match(controller, /PROPERTY_CONTEXT_INCOMPLETE/);
});

test('inspection adoption audit keeps evidence lifecycle operations free of generic prompts', () => {
  const controller = read('../../src/controllers/inspectionHub.controller.ts');
  const upload = controller.slice(controller.indexOf('export async function uploadReport'), controller.indexOf('export async function getReport'));
  const confirm = controller.slice(controller.indexOf('export async function confirmReport'), controller.indexOf('// ── Open items'));
  assert.match(upload, /ingestInspectionReport/);
  assert.match(confirm, /applyWriteBacks/);
  assert.doesNotMatch(upload, /evaluateFeatureContext/);
  assert.doesNotMatch(confirm, /evaluateFeatureContext/);
});
