const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildInventoryCoveragePresentation,
  getResponsibilityScopeForAsset,
  isAssetOwnerActionable,
} = require('../../src/services/inventoryCoverageState.service.ts');
const {
  getCaptureDefinition,
} = require('../../src/modules/propertyContext/catalog/captureRegistry.ts');
const {
  getFeatureContextRequirement,
} = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');
const {
  selectedItemCoverageEvidenceState,
} = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');

function system(overrides = {}) {
  return {
    assetType: 'ROOF_SHINGLE',
    name: 'Roof Shingle',
    category: 'ROOF_EXTERIOR',
    condition: 'UNKNOWN',
    coverageEvidenceStatus: 'UNKNOWN',
    coverageNotRequired: false,
    installedOn: null,
    purchasedOn: null,
    isVerified: false,
    verificationSource: 'PROPERTY_DETAILS',
    sourceHash: 'RISK_REPORT_SYSTEM:ROOF_SHINGLE',
    sourceType: 'INTEGRATION',
    tags: ['RISK_REPORT_INFERRED', 'PROPERTY_LEVEL_SYSTEM'],
    replacementCostCents: null,
    roomId: null,
    warranty: null,
    insurancePolicy: null,
    ...overrides,
  };
}

test('inferred systems remain incomplete until applicability and evidence are confirmed', () => {
  const result = buildInventoryCoveragePresentation(system(), []);
  assert.equal(result.displayName, 'Roof');
  assert.equal(result.recordGroup, 'SYSTEMS_STRUCTURE');
  assert.equal(result.locationLabel, 'Whole home');
  assert.equal(result.coverageState, 'INCOMPLETE');
  assert.equal(result.coverageActionable, false);
  assert.match(result.coverageStateLabel, /incomplete/i);
  assert.ok(result.missingContext.includes('ITEM_CONFIRMATION'));
  assert.ok(result.missingContext.includes('RESPONSIBILITY'));
  assert.ok(result.missingContext.includes('INSTALLATION_YEAR'));
});

test('association-managed systems stay in the record without homeowner gap actions', () => {
  const result = buildInventoryCoveragePresentation(system(), [{ scope: 'ROOF', party: 'ASSOCIATION' }]);
  assert.equal(result.coverageState, 'MANAGED_ELSEWHERE');
  assert.equal(result.coverageStateLabel, 'Managed by your HOA');
  assert.equal(result.coverageActionable, false);
});

test('responsibility scopes are consistent for risk, provider, and coverage asset labels', () => {
  assert.equal(getResponsibilityScopeForAsset('ROOF_SHINGLE', 'ROOF_EXTERIOR'), 'ROOF');
  assert.equal(getResponsibilityScopeForAsset('HVAC_FURNACE', 'SYSTEMS'), 'HVAC');
  assert.equal(getResponsibilityScopeForAsset('WATER_HEATER_TANK', 'PLUMBING'), 'PLUMBING');
  assert.equal(getResponsibilityScopeForAsset('DISHWASHER', 'APPLIANCE'), null);
});

test('owner actions exclude systems managed by an association, landlord, or shared party', () => {
  const responsibilities = [
    { scope: 'ROOF', party: 'ASSOCIATION' },
    { scope: 'HVAC', party: 'LANDLORD' },
    { scope: 'PLUMBING', party: 'SHARED' },
  ];

  assert.equal(isAssetOwnerActionable('ROOF_SHINGLE', 'ROOF_EXTERIOR', responsibilities), false);
  assert.equal(isAssetOwnerActionable('HVAC_FURNACE', 'HVAC', responsibilities), false);
  assert.equal(isAssetOwnerActionable('WATER_HEATER_TANK', 'PLUMBING', responsibilities), false);
  assert.equal(isAssetOwnerActionable('DISHWASHER', 'APPLIANCE', responsibilities), true);
  assert.equal(isAssetOwnerActionable('ROOF_SHINGLE', 'ROOF_EXTERIOR', []), true);
});

test('a homeowner-rejected inferred system is not treated as a coverage problem', () => {
  const result = buildInventoryCoveragePresentation(system({
    tags: ['RISK_REPORT_INFERRED', 'PROPERTY_LEVEL_SYSTEM', 'INFERRED_NOT_PRESENT'],
    verificationSource: 'USER_CONFIRMED_ABSENT',
    isVerified: true,
  }), []);
  assert.equal(result.coverageState, 'NOT_REQUIRED');
  assert.equal(result.coverageStateLabel, 'System not present');
  assert.equal(result.coverageActionable, false);
});

test('explicit no-coverage evidence becomes actionable only with sufficient owner context', () => {
  const result = buildInventoryCoveragePresentation(system({
    isVerified: true,
    verificationSource: 'USER_CONFIRMED',
    installedOn: new Date('2014-01-01T00:00:00.000Z'),
    condition: 'FAIR',
    coverageEvidenceStatus: 'NONE',
  }), [{ scope: 'ROOF', party: 'OWNER' }]);
  assert.equal(result.coverageState, 'MISSING');
  assert.equal(result.coverageActionable, true);
  assert.equal(result.replacementValueSource, 'ESTIMATED');
});

test('an explicit not-sure answer remains incomplete without becoming a coverage gap', () => {
  const result = buildInventoryCoveragePresentation(system({
    isVerified: true,
    verificationSource: 'USER_CONFIRMED',
    installedOn: new Date('2018-01-01T00:00:00.000Z'),
    condition: 'GOOD',
    coverageEvidenceStatus: 'NOT_SURE',
  }), [{ scope: 'ROOF', party: 'OWNER' }]);
  assert.equal(result.coverageState, 'INCOMPLETE');
  assert.equal(result.coverageActionable, false);
  assert.ok(result.missingContext.includes('COVERAGE_EVIDENCE'));
  assert.match(result.coverageStateDetail, /previously said you were not sure/i);
});

test('the JIT evidence gate keeps not-sure actionable while accepting definitive evidence', () => {
  assert.equal(selectedItemCoverageEvidenceState({ coverageEvidenceStatus: 'NOT_SURE' }), 'UNKNOWN');
  assert.equal(selectedItemCoverageEvidenceState({ coverageEvidenceStatus: 'UNKNOWN' }), 'UNKNOWN');
  assert.equal(selectedItemCoverageEvidenceState({ coverageEvidenceStatus: 'NONE' }), 'KNOWN');
  assert.equal(selectedItemCoverageEvidenceState({ warrantyId: 'warranty-1' }), 'KNOWN');
  assert.equal(selectedItemCoverageEvidenceState({ insurancePolicyId: 'policy-1' }), 'KNOWN');
});

test('active linked coverage is valid without an exact lifecycle date', () => {
  const result = buildInventoryCoveragePresentation(system({
    warranty: {
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      expiryDate: new Date('2027-01-01T00:00:00.000Z'),
    },
  }), [], new Date('2026-07-21T00:00:00.000Z'));
  assert.equal(result.coverageState, 'CONFIRMED');
  assert.equal(result.coverageActionable, false);
});

test('item coverage JIT contract captures confirmation, responsibility, lifecycle, evidence, and value', () => {
  const contract = getFeatureContextRequirement('COVERAGE_INTELLIGENCE', 'ASSESS_ITEM_COVERAGE');
  assert.deepEqual(contract.required.map((entry) => entry.priority), [10, 20, 20, 20, 20, 20, 20, 30, 40, 50]);
  assert.equal(contract.required[0].captureKey, 'INVENTORY_ITEM_CONFIRMATION');
  assert.equal(contract.required.at(-2).captureKey, 'INVENTORY_ITEM_COVERAGE_EVIDENCE');
  assert.equal(contract.required.at(-1).captureKey, 'INVENTORY_ITEM_VALUE');

  for (const key of [
    'INVENTORY_ITEM_CONFIRMATION',
    'INVENTORY_ITEM_COVERAGE_LIFECYCLE',
    'INVENTORY_ITEM_COVERAGE_EVIDENCE',
    'INVENTORY_ITEM_VALUE',
  ]) {
    const capture = getCaptureDefinition(key);
    assert.equal(capture.mode, 'RELATIONAL');
    assert.equal(capture.relationalEntityInputKey, 'inventoryItemId');
  }
});
