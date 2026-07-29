const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  canTransitionMaterialLifecycle,
} = require('../../src/services/materialSpec.service.ts');
const {
  transitionMaterialLifecycleBodySchema,
  substituteMaterialBodySchema,
  createMaterialExtractionBodySchema,
} = require('../../src/validators/materialSpec.validators.ts');

const materialSource = fs.readFileSync(
  path.join(__dirname, '../../src/services/materialSpec.service.ts'),
  'utf8',
);
const projectSource = fs.readFileSync(
  path.join(__dirname, '../../src/services/projectTracker.service.ts'),
  'utf8',
);

test('material lifecycle cannot skip approval, installation, or terminal history', () => {
  assert.equal(canTransitionMaterialLifecycle('PROPOSED', 'APPROVED'), true);
  assert.equal(canTransitionMaterialLifecycle('PROPOSED', 'INSTALLED'), false);
  assert.equal(canTransitionMaterialLifecycle('APPROVED', 'INSTALLED'), true);
  assert.equal(canTransitionMaterialLifecycle('INSTALLED', 'AS_BUILT'), true);
  assert.equal(canTransitionMaterialLifecycle('AS_BUILT', 'PROPOSED'), false);
  assert.equal(canTransitionMaterialLifecycle('SUBSTITUTED', 'INSTALLED'), false);
});

test('lifecycle requests require notes and constrain writable target states', () => {
  assert.equal(transitionMaterialLifecycleBodySchema.safeParse({
    toStatus: 'AS_BUILT',
    evidenceDocumentIds: [],
    notes: '',
  }).success, false);
  assert.equal(transitionMaterialLifecycleBodySchema.safeParse({
    toStatus: 'SUBSTITUTED',
    evidenceDocumentIds: [],
    notes: 'Bypass substitution workflow.',
  }).success, false);
});

test('substitutions retain comparison, impact, and evidence', () => {
  const parsed = substituteMaterialBodySchema.safeParse({
    replacement: { label: 'Replacement tile' },
    comparison: {
      identityChanges: ['manufacturer', 'sku'],
      reason: 'Original product unavailable.',
    },
    complianceImpact: {
      permitRelevant: false,
      hoaRelevant: true,
      changedAttributes: ['color'],
      explanation: 'Exterior-visible finish changed.',
    },
    evidenceDocumentIds: ['11111111-1111-4111-8111-111111111111'],
    sourceChangeOrderId: '22222222-2222-4222-8222-222222222222',
    notes: 'Association reapproval attached to the linked change order.',
  });
  assert.equal(parsed.success, true);
});

test('extraction candidates always enter homeowner review before applying', () => {
  assert.equal(createMaterialExtractionBodySchema.safeParse({
    extractionMethod: 'DOCUMENT_OCR',
    candidateFields: { manufacturer: 'Example', sku: 'SKU-1' },
  }).success, false);
  assert.match(materialSource, /status: 'NEEDS_REVIEW'/);
  assert.match(materialSource, /EXTRACTION_CONFIRMED/);
  assert.match(materialSource, /allowed = new Set/);
});

test('approval, installation, and as-built gates preserve evidence semantics', () => {
  assert.match(materialSource, /MATERIAL_APPROVAL_EVIDENCE_REQUIRED/);
  assert.match(materialSource, /MATERIAL_INSTALLATION_EVIDENCE_REQUIRED/);
  assert.match(materialSource, /MATERIAL_AS_BUILT_EVIDENCE_REQUIRED/);
  assert.match(materialSource, /MATERIAL_AS_BUILT_IDENTITY_IMMUTABLE/);
  assert.match(materialSource, /MATERIAL_COMPLIANCE_CHECK_REQUIRED/);
});

test('Project delivery creates proposed material and completion requires verified as-built identity', () => {
  assert.match(projectSource, /lifecycleStatus: 'PROPOSED'/);
  assert.match(projectSource, /materials_verified_as_built/);
  assert.match(projectSource, /material\.lifecycleStatus === 'AS_BUILT'/);
  assert.match(projectSource, /material\.verificationConfidence === 'VERIFIED'/);
});
