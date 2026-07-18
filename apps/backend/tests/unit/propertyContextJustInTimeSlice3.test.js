const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { getCaptureDefinition } = require('../../src/modules/propertyContext/catalog/captureRegistry.ts');
const { getFeatureContextRequirement } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('relational registry exposes backend-owned select/create schemas without domain endpoints', () => {
  for (const [captureKey, adapterKey, entityType] of [
    ['INVENTORY_ITEM_SELECT_OR_CREATE', 'INVENTORY_ITEM', 'INVENTORY_ITEM'],
    ['INSURANCE_POLICY_SELECT_OR_CREATE', 'INSURANCE_POLICY', 'INSURANCE_POLICY'],
  ]) {
    const definition = getCaptureDefinition(captureKey);
    assert.equal(definition.mode, 'RELATIONAL');
    assert.equal(definition.relationalAdapterKey, adapterKey);
    assert.equal(definition.inputSchema.type, 'RELATIONAL_SELECT_CREATE');
    assert.equal(definition.inputSchema.entityType, entityType);
    assert.ok(definition.inputSchema.createFields.length >= 3);
    assert.doesNotMatch(definition.actionKey, /^\//);
  }
});

test('initial relational feature policies distinguish blocking and enhancement collection requirements', () => {
  const maintenance = getFeatureContextRequirement('MAINTENANCE', 'SET_UP_INSTALLED_SYSTEMS');
  assert.equal(maintenance.required[0].classification, 'REQUIRED_CALCULATION');
  assert.equal(maintenance.required[0].minimumItems, 1);
  const coverage = getFeatureContextRequirement('COVERAGE_INTELLIGENCE', 'ASSESS_PROPERTY_COVERAGE');
  assert.equal(coverage.enhancements[0].classification, 'ENHANCEMENT_ACCURACY');
  assert.equal(coverage.enhancements[0].minimumItems, 1);
});

test('relational adapters enforce property-scoped selection, duplicate prevention, and canonical creates', () => {
  const adapters = read('../../src/modules/propertyContext/application/relationalCaptureAdapters.ts');
  assert.match(adapters, /findFirst\(\{ where: \{ id: entityId, propertyId \}/);
  assert.match(adapters, /matching inventory item already exists/i);
  assert.match(adapters, /matching insurance policy already exists/i);
  assert.match(adapters, /tx\.inventoryItem\.create/);
  assert.match(adapters, /tx\.insurancePolicy\.create/);
  assert.match(adapters, /homeownerProfileId: property\.homeownerProfileId/);
});

test('shared panel renders selection and minimal creation and consumes returned selection in place', () => {
  const panel = read('../../../frontend/src/components/property-context/PropertyContextCapturePanel.tsx');
  const hook = read('../../../frontend/src/components/property-context/useFeatureContextCapture.ts');
  assert.match(panel, /RELATIONAL_SELECT_CREATE/);
  assert.match(panel, /Use selected record/);
  assert.match(panel, /Add and continue/);
  assert.match(hook, /onCaptured/);
  assert.doesNotMatch(`${panel}\n${hook}`, /window\.location\.reload/);
});
