const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { classifyTransitionalWarrantyLinks } = require('../../src/services/ask/semantic/transitionalWarrantyRead.ts');

const classify = (overrides = {}) => classifyTransitionalWarrantyLinks({
  inventoryItemId: 'item-1', propertyPlanWarrantyId: null, itemWarrantyIds: [], coverageEvidenceStatus: 'UNKNOWN', ...overrides,
});

test('the transitional adapter keeps link topology, explicit absence, and uncertainty distinct', () => {
  assert.equal(classify().state, 'NO_LINK_RECORDED');
  assert.equal(classify({ coverageEvidenceStatus: 'NOT_SURE' }).state, 'UNKNOWN');
  assert.equal(classify({ coverageEvidenceStatus: 'NONE' }).state, 'EXPLICIT_NO_COVERAGE');
  assert.equal(classify({ itemWarrantyIds: ['w-1'] }).state, 'ITEM_WARRANTY_LINKED');
  assert.equal(classify({ propertyPlanWarrantyId: 'w-1' }).state, 'PROPERTY_PLAN_LINKED');
  assert.equal(classify({ propertyPlanWarrantyId: 'w-1', itemWarrantyIds: ['w-1'] }).state, 'BOTH_CONSISTENT');
});

test('different dual links and explicit-no evidence with a link require reconciliation', () => {
  const dual = classify({ propertyPlanWarrantyId: 'w-1', itemWarrantyIds: ['w-2'] });
  assert.equal(dual.state, 'CONFLICTED_LINKS');
  assert.equal(dual.reconciliationRequired, true);
  assert.deepEqual(dual.warrantyIds, ['w-1', 'w-2']);

  const contradictedAbsence = classify({ coverageEvidenceStatus: 'NONE', itemWarrantyIds: ['w-2'] });
  assert.equal(contradictedAbsence.state, 'CONFLICTED_LINKS');
  assert.equal(contradictedAbsence.reconciliationRequired, true);
});
