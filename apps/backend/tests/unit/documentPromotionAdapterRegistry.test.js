const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  validateDocumentPromotionAdapterRegistry,
  DOCUMENT_PROMOTION_TARGET_DOMAINS,
} = require('../../src/services/intelligence/documentPromotionAdapterRegistry.contract.ts');
const {
  DOCUMENT_PROMOTION_ADAPTER_REGISTRY,
} = require('../../src/services/intelligence/documentPromotionAdapterRegistry.ts');

test('the real document promotion adapter registry validates cleanly and covers every target domain', () => {
  assert.deepEqual(validateDocumentPromotionAdapterRegistry(DOCUMENT_PROMOTION_ADAPTER_REGISTRY), []);
  const declared = new Set(DOCUMENT_PROMOTION_ADAPTER_REGISTRY.map((e) => e.targetDomain));
  for (const domain of DOCUMENT_PROMOTION_TARGET_DOMAINS) {
    assert.ok(declared.has(domain), `missing registry row for ${domain}`);
  }
});

test('the real registry has a promotion adapter for every target domain', () => {
  const implemented = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.filter((e) => e.adapterExists).map((e) => e.targetDomain).sort();
  const missing = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.filter((e) => !e.adapterExists).map((e) => e.targetDomain).sort();
  assert.deepEqual(implemented, ['CLAIM', 'EXPENSE', 'INSPECTION_FINDING', 'INSURANCE_POLICY', 'INVENTORY', 'LOAN_ESTIMATE', 'MATERIAL_SPEC', 'PROPERTY_TAX', 'WARRANTY']);
  assert.deepEqual(missing, []);
});

test('domains with competing canonical facts declare conflict detection', () => {
  const withConflictDetection = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.filter((e) => e.conflictDetection).map((e) => e.targetDomain).sort();
  assert.deepEqual(withConflictDetection, ['EXPENSE', 'INSURANCE_POLICY', 'PROPERTY_TAX', 'WARRANTY']);
});

test('validateDocumentPromotionAdapterRegistry fails fast on a missing target domain', () => {
  const missingWarranty = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.filter((e) => e.targetDomain !== 'WARRANTY');
  const issues = validateDocumentPromotionAdapterRegistry(missingWarranty);
  assert.ok(issues.some((i) => i.includes('missing a row for target domain "WARRANTY"')));
});

test('validateDocumentPromotionAdapterRegistry fails fast on a duplicate target domain', () => {
  const dup = [...DOCUMENT_PROMOTION_ADAPTER_REGISTRY, DOCUMENT_PROMOTION_ADAPTER_REGISTRY[0]];
  const issues = validateDocumentPromotionAdapterRegistry(dup);
  assert.ok(issues.some((i) => i.includes('Duplicate documentPromotionAdapterRegistry entry')));
});

test('validateDocumentPromotionAdapterRegistry fails fast when adapterExists and adapterFunction disagree', () => {
  const missingFn = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.map((e) =>
    e.targetDomain === 'WARRANTY' ? { ...e, adapterFunction: null } : e);
  assert.ok(validateDocumentPromotionAdapterRegistry(missingFn).some((i) => i.includes('WARRANTY') && i.includes('no adapterFunction')));

  const unexpectedFn = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.map((e) =>
    e.targetDomain === 'PROPERTY_TAX' ? { ...e, adapterExists: false } : e);
  assert.ok(validateDocumentPromotionAdapterRegistry(unexpectedFn).some((i) => i.includes('PROPERTY_TAX') && i.includes('adapterExists=false')));
});

test('validateDocumentPromotionAdapterRegistry fails fast when a disabled adapter claims REVIEW_GATED_CANDIDATE', () => {
  const bad = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.map((e) =>
    e.targetDomain === 'PROPERTY_TAX' ? { ...e, adapterExists: false, adapterFunction: null } : e);
  const issues = validateDocumentPromotionAdapterRegistry(bad);
  assert.ok(issues.some((i) => i.includes('PROPERTY_TAX') && i.includes('REVIEW_GATED_CANDIDATE')));
});

test('validateDocumentPromotionAdapterRegistry fails fast when an existing adapter declares reviewGate NONE', () => {
  const bad = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.map((e) =>
    e.targetDomain === 'WARRANTY' ? { ...e, reviewGate: 'NONE' } : e);
  const issues = validateDocumentPromotionAdapterRegistry(bad);
  assert.ok(issues.some((i) => i.includes('WARRANTY') && i.includes('reviewGate NONE')));
});

test('validateDocumentPromotionAdapterRegistry fails fast when a disabled adapter claims to consume the extraction envelope', () => {
  const bad = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.map((e) =>
    e.targetDomain === 'CLAIM' ? { ...e, adapterExists: false, adapterFunction: null } : e);
  const issues = validateDocumentPromotionAdapterRegistry(bad);
  assert.ok(issues.some((i) => i.includes('CLAIM') && i.includes('extraction envelope')));
});

test('validateDocumentPromotionAdapterRegistry fails fast on empty notes', () => {
  const bad = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.map((e) =>
    e.targetDomain === 'WARRANTY' ? { ...e, notes: '' } : e);
  const issues = validateDocumentPromotionAdapterRegistry(bad);
  assert.ok(issues.some((i) => i.includes('WARRANTY') && i.includes('no notes')));
});

// Phase 5 remediation item (d): the prior "no persisted review-gated
// candidate" characterization was wrong — InventoryDraftItem already is one.
test('INVENTORY is now a real, registered REVIEW_GATED_CANDIDATE adapter', () => {
  const inventory = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.find((e) => e.targetDomain === 'INVENTORY');
  assert.equal(inventory.adapterExists, true);
  assert.equal(inventory.reviewGate, 'REVIEW_GATED_CANDIDATE');
  assert.equal(inventory.consumesExtractionEnvelope, true);
});

// Phase 5 remediation item (d): CLIENT_FORM_PREFILL_ONLY can legitimately
// coexist with adapterExists:true — the homeowner's save action, not a
// separate persisted candidate, is the review step, and that save is now
// the registered promotion adapter.
test('LOAN_ESTIMATE is now a real, registered adapter, still CLIENT_FORM_PREFILL_ONLY', () => {
  const loanEstimate = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.find((e) => e.targetDomain === 'LOAN_ESTIMATE');
  assert.equal(loanEstimate.adapterExists, true);
  assert.equal(loanEstimate.reviewGate, 'CLIENT_FORM_PREFILL_ONLY');
  assert.equal(loanEstimate.consumesExtractionEnvelope, true);
});
