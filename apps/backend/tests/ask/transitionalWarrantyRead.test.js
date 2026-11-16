const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const {
  classifyTransitionalWarrantyLinks,
  WARRANTY_RELATION_MEANINGS,
  validateTransitionalWarrantyLinkWrite,
  assertValidTransitionalWarrantyLinkWrite,
  extractWarrantyReconciliationCases,
} = require('../../src/services/ask/semantic/transitionalWarrantyRead.ts');

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

test('item-specific warranties and property whole-home plans have distinct business meanings and cardinalities', () => {
  assert.equal(WARRANTY_RELATION_MEANINGS.ITEM_SPECIFIC_WARRANTY.cardinality, 'ONE_ITEM_TO_MANY_WARRANTIES');
  assert.equal(WARRANTY_RELATION_MEANINGS.ITEM_SPECIFIC_WARRANTY.newWriteStatus, 'CANONICAL_ALLOWED');
  assert.equal(WARRANTY_RELATION_MEANINGS.PROPERTY_WHOLE_HOME_PLAN.cardinality, 'ONE_PLAN_TO_MANY_ITEMS_BY_APPLICABILITY');
  assert.equal(WARRANTY_RELATION_MEANINGS.PROPERTY_WHOLE_HOME_PLAN.newWriteStatus, 'CANONICAL_ALLOWED');
});

test('write containment prohibits new ambiguous legacy InventoryItem.warrantyId writes and captures reconciliation cases', () => {
  const legacyWrite = validateTransitionalWarrantyLinkWrite({
    targetModel: 'InventoryItem',
    targetField: 'warrantyId',
    inventoryItemId: 'item-1',
    warrantyId: 'w-1',
  });
  assert.equal(legacyWrite.allowed, false);
  assert.equal(legacyWrite.reasonCode, 'AMBIGUOUS_LEGACY_INVENTORY_WARRANTY_ID_WRITE_PROHIBITED');
  assert.throws(() => assertValidTransitionalWarrantyLinkWrite({
    targetModel: 'InventoryItem',
    targetField: 'warrantyId',
    inventoryItemId: 'item-1',
    warrantyId: 'w-1',
  }), /AMBIGUOUS_LEGACY_INVENTORY_WARRANTY_ID_WRITE_PROHIBITED/);

  const canonicalWrite = validateTransitionalWarrantyLinkWrite({
    targetModel: 'Warranty',
    targetField: 'inventoryItemId',
    inventoryItemId: 'item-1',
    warrantyId: 'w-1',
  });
  assert.equal(canonicalWrite.allowed, true);
  assert.equal(canonicalWrite.reasonCode, 'CANONICAL_ITEM_WARRANTY_WRITE_ALLOWED');

  const cases = extractWarrantyReconciliationCases([
    classify({ inventoryItemId: 'item-conflict', propertyPlanWarrantyId: 'w-1', itemWarrantyIds: ['w-2'] }),
    classify({ inventoryItemId: 'item-multi', itemWarrantyIds: ['w-1', 'w-2'] }),
    classify({ inventoryItemId: 'item-legacy', propertyPlanWarrantyId: 'w-1' }),
    classify({ inventoryItemId: 'item-unknown', coverageEvidenceStatus: 'NOT_SURE' }),
  ]);
  assert.deepEqual(cases.map((c) => c.reason), [
    'CONFLICTED_LINKS',
    'MULTIPLE_ITEM_WARRANTIES',
    'LEGACY_PROPERTY_PLAN_POINTER_ONLY',
    'UNKNOWN_COVERAGE_EVIDENCE',
  ]);
});
