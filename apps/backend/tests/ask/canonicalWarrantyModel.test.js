const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const {
  assertCanonicalWarrantyScope,
  assertCanonicalWarrantyApplicability,
  recordedWarrantyState,
} = require('../../src/services/warrantyCanonicalModel.ts');

test('item warranties require one item while whole-home plans remain property scoped', () => {
  assert.equal(assertCanonicalWarrantyScope({ category: 'APPLIANCE', propertyId: 'p1', inventoryItemId: 'i1' }), 'ITEM_SPECIFIC');
  assert.equal(assertCanonicalWarrantyScope({ category: 'HOME_WARRANTY_PLAN', propertyId: 'p1', inventoryItemId: null }), 'PROPERTY_PLAN');
  assert.throws(() => assertCanonicalWarrantyScope({ category: 'APPLIANCE', propertyId: 'p1', inventoryItemId: null }), /inventory item/);
  assert.throws(() => assertCanonicalWarrantyScope({ category: 'HOME_WARRANTY_PLAN', propertyId: 'p1', inventoryItemId: 'i1' }), /cannot link directly/);
  assert.throws(() => assertCanonicalWarrantyScope({ category: 'OTHER', propertyId: 'p1' }), /explicitly declare/);
});

test('whole-home applicability has one typed target and confirmed coverage requires evidence', () => {
  assert.doesNotThrow(() => assertCanonicalWarrantyApplicability({
    scope: 'INVENTORY_ITEM', status: 'COVERED', inventoryItemId: 'i1', evidenceSource: 'contract-page-4',
  }));
  assert.throws(() => assertCanonicalWarrantyApplicability({ scope: 'INVENTORY_ITEM', status: 'COVERED', inventoryItemId: 'i1' }), /requires recorded evidence/);
  assert.throws(() => assertCanonicalWarrantyApplicability({
    scope: 'INVENTORY_ITEM', status: 'UNKNOWN', inventoryItemId: 'i1', inventoryCategory: 'APPLIANCE',
  }), /exactly one/);
});

test('recorded link, applicability, explicit absence, and conflict states remain distinct', () => {
  assert.equal(recordedWarrantyState({ itemWarrantyCount: 1, applicablePropertyPlanCount: 0, coverageEvidenceStatus: 'UNKNOWN' }), 'ITEM_WARRANTY_RECORDED');
  assert.equal(recordedWarrantyState({ itemWarrantyCount: 0, applicablePropertyPlanCount: 1, coverageEvidenceStatus: 'UNKNOWN' }), 'PROPERTY_PLAN_APPLICABLE');
  assert.equal(recordedWarrantyState({ itemWarrantyCount: 0, applicablePropertyPlanCount: 0, coverageEvidenceStatus: 'NONE' }), 'EXPLICIT_NO_COVERAGE');
  assert.equal(recordedWarrantyState({ itemWarrantyCount: 1, applicablePropertyPlanCount: 0, coverageEvidenceStatus: 'NONE' }), 'CONFLICTED');
  assert.equal(recordedWarrantyState({ itemWarrantyCount: 0, applicablePropertyPlanCount: 0, unknownPropertyPlanCount: 1, coverageEvidenceStatus: 'UNKNOWN' }), 'UNKNOWN');
});
