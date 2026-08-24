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

test('the real registry reflects verified adapter status: 5 implemented, 4 missing', () => {
  const implemented = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.filter((e) => e.adapterExists).map((e) => e.targetDomain).sort();
  const missing = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.filter((e) => !e.adapterExists).map((e) => e.targetDomain).sort();
  assert.deepEqual(implemented, ['EXPENSE', 'INSPECTION_FINDING', 'INSURANCE_POLICY', 'MATERIAL_SPEC', 'WARRANTY']);
  assert.deepEqual(missing, ['CLAIM', 'INVENTORY', 'LOAN_ESTIMATE', 'PROPERTY_TAX']);
});

test('only INSURANCE_POLICY declares conflict detection today', () => {
  const withConflictDetection = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.filter((e) => e.conflictDetection).map((e) => e.targetDomain);
  assert.deepEqual(withConflictDetection, ['INSURANCE_POLICY']);
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
    e.targetDomain === 'PROPERTY_TAX' ? { ...e, adapterFunction: 'madeUpFn' } : e);
  assert.ok(validateDocumentPromotionAdapterRegistry(unexpectedFn).some((i) => i.includes('PROPERTY_TAX') && i.includes('adapterExists=false')));
});

test('validateDocumentPromotionAdapterRegistry fails fast when a domain with no adapter claims REVIEW_GATED_CANDIDATE', () => {
  const bad = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.map((e) =>
    e.targetDomain === 'PROPERTY_TAX' ? { ...e, reviewGate: 'REVIEW_GATED_CANDIDATE' } : e);
  const issues = validateDocumentPromotionAdapterRegistry(bad);
  assert.ok(issues.some((i) => i.includes('PROPERTY_TAX') && i.includes('REVIEW_GATED_CANDIDATE')));
});

test('validateDocumentPromotionAdapterRegistry fails fast when an existing adapter declares reviewGate NONE', () => {
  const bad = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.map((e) =>
    e.targetDomain === 'WARRANTY' ? { ...e, reviewGate: 'NONE' } : e);
  const issues = validateDocumentPromotionAdapterRegistry(bad);
  assert.ok(issues.some((i) => i.includes('WARRANTY') && i.includes('reviewGate NONE')));
});

test('validateDocumentPromotionAdapterRegistry fails fast when a domain with no adapter claims to consume the extraction envelope', () => {
  const bad = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.map((e) =>
    e.targetDomain === 'CLAIM' ? { ...e, consumesExtractionEnvelope: true } : e);
  const issues = validateDocumentPromotionAdapterRegistry(bad);
  assert.ok(issues.some((i) => i.includes('CLAIM') && i.includes('extraction envelope')));
});

test('validateDocumentPromotionAdapterRegistry fails fast on empty notes', () => {
  const bad = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.map((e) =>
    e.targetDomain === 'WARRANTY' ? { ...e, notes: '' } : e);
  const issues = validateDocumentPromotionAdapterRegistry(bad);
  assert.ok(issues.some((i) => i.includes('WARRANTY') && i.includes('no notes')));
});

test('a CLIENT_FORM_PREFILL_ONLY domain with no adapter is valid (INVENTORY, LOAN_ESTIMATE)', () => {
  const inventory = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.find((e) => e.targetDomain === 'INVENTORY');
  const loanEstimate = DOCUMENT_PROMOTION_ADAPTER_REGISTRY.find((e) => e.targetDomain === 'LOAN_ESTIMATE');
  assert.equal(inventory.adapterExists, false);
  assert.equal(inventory.reviewGate, 'CLIENT_FORM_PREFILL_ONLY');
  assert.equal(loanEstimate.adapterExists, false);
  assert.equal(loanEstimate.reviewGate, 'CLIENT_FORM_PREFILL_ONLY');
});
