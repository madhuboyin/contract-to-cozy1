const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  runNonFatalPostCreateStep,
  shouldClearExistingPrimary,
  shouldCreatePropertyAsPrimary,
} = require('../../src/services/propertySetupPolicy.ts');
const { createPropertySchema, updatePropertySchema } = require('../../src/utils/validators.ts');
const {
  hasInsufficientRiskDetails,
  isInsufficientRiskDetail,
} = require('../../src/services/riskReportSemantics.ts');

const repositoryRoot = path.resolve(__dirname, '../../../..');
const source = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

test('the first Property is primary regardless of a missing or false client default', () => {
  assert.equal(shouldCreatePropertyAsPrimary(0, undefined), true);
  assert.equal(shouldCreatePropertyAsPrimary(0, false), true);
  assert.equal(shouldCreatePropertyAsPrimary(1, false), false);
  assert.equal(shouldCreatePropertyAsPrimary(1, undefined), false);
  assert.equal(shouldCreatePropertyAsPrimary(2, true), true);
  assert.equal(shouldClearExistingPrimary(0, true), false);
  assert.equal(shouldClearExistingPrimary(1, undefined), false);
  assert.equal(shouldClearExistingPrimary(1, false), false);
  assert.equal(shouldClearExistingPrimary(1, true), true);
});

test('the API contract accepts address-only create and preserves explicit false', () => {
  const minimum = { address: '1 Main St', city: 'Knoxville', state: 'TN', zipCode: '37902' };
  const parsedMinimum = createPropertySchema.parse(minimum);
  assert.deepEqual(parsedMinimum, minimum);
  assert.equal(Object.hasOwn(parsedMinimum, 'hasSmokeDetectors'), false);

  const parsedUpdate = updatePropertySchema.parse({ hasSmokeDetectors: false });
  assert.deepEqual(parsedUpdate, { hasSmokeDetectors: false });
});

test('auxiliary post-create failure is observable but non-fatal', async () => {
  const expected = new Error('queue unavailable');
  let observed = null;

  await assert.doesNotReject(() => runNonFatalPostCreateStep(
    async () => { throw expected; },
    (error) => { observed = error; },
  ));
  assert.equal(observed, expected);
});

test('legacy missing-data and calculation-error rows are never risk assets', () => {
  assert.equal(isInsufficientRiskDetail({ assetName: 'Data Missing', riskLevel: 'HIGH' }), true);
  assert.equal(isInsufficientRiskDetail({ assetName: 'Fatal Error', riskLevel: 'HIGH' }), true);
  assert.equal(hasInsufficientRiskDetails([{ systemType: 'System', actionCta: 'Complete property details' }]), true);
  assert.equal(isInsufficientRiskDetail({ assetName: 'ROOF', systemType: 'ROOF', riskLevel: 'HIGH' }), false);
});

test('ordinary Add Property submits identity facts only and keeps manual fallback visible', () => {
  const page = source('apps/frontend/src/app/(dashboard)/dashboard/properties/new/page.tsx');
  assert.match(page, /buildAddressPropertyCreatePayload\(normalized, hasExistingProperty, makePrimary\)/);
  assert.match(page, /Enter address manually/);
  assert.match(page, /getProperties\(\{ force: true \}\)/);
  assert.match(page, /isAmbiguousNetworkError\(caught\)/);
});

test('onboarding recovery cannot reinterpret a duplicate-address response as a successful create', () => {
  const page = source('apps/frontend/src/app/onboarding/confirm/page.tsx');
  assert.match(page, /createdPropertyId \|\| isAmbiguousNetworkError\(error\)/);
  assert.match(page, /description: error instanceof Error \? error\.message/);
});

test('established-owner onboarding no longer requires home type', () => {
  const page = source('apps/frontend/src/app/onboarding/address/page.tsx');
  assert.match(page, /situation !== 'own' && !dwellingType/);
  assert.match(page, /dwellingType \? \{ dwellingType \} : \{\}/);
});

test('Property Details has no UI-only required system-type validators', () => {
  const page = source('apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/edit/page.tsx');
  assert.doesNotMatch(page, /Heating Type is required|Cooling Type is required|Water Heater Type is required|Roof Type is required/);
  assert.match(page, /buildSparsePropertyUpdatePayload/);
  assert.match(page, /sparsePayload as Parameters/);
});

test('Property creation owns the commit boundary and serializable primary invariant', () => {
  const service = source('apps/backend/src/services/property.service.ts');
  assert.match(service, /TransactionIsolationLevel\.Serializable/);
  assert.match(service, /error\.code === 'P2034'/);
  assert.match(service, /runPostCreateStep\(property\.id, 'radar-reconciliation'/);
  assert.match(service, /runPostCreateStep\(property\.id, 'property-intelligence-enqueue'/);
});

test('risk calculation does not persist synthetic high-risk missing-data rows', () => {
  const service = source('apps/backend/src/services/RiskAssessment.service.ts');
  assert.doesNotMatch(service, /assetName: 'Data Missing'|assetName: 'Fatal Error'/);
  assert.match(service, /throw new RiskAssessmentContextError/);
});
