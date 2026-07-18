const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { getCaptureDefinition } = require('../../src/modules/propertyContext/catalog/captureRegistry.ts');
const { getFeatureContextRequirement } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('claims register active policy and warranty requirements separately', () => {
  const insurance = getFeatureContextRequirement('CLAIMS', 'FILE_INSURANCE_CLAIM');
  const warranty = getFeatureContextRequirement('CLAIMS', 'FILE_WARRANTY_CLAIM');
  assert.equal(insurance.required[0].captureKey, 'INSURANCE_POLICY_SELECT_OR_CREATE');
  assert.equal(warranty.required[0].captureKey, 'WARRANTY_SELECT_OR_CREATE');
  assert.equal(insurance.required[0].collectionPredicate, 'ACTIVE_DATE_RANGE');
  assert.equal(warranty.required[0].collectionPredicate, 'ACTIVE_DATE_RANGE');
});

test('warranty capture is backend-owned and uses the canonical Warranty owner', () => {
  const capture = getCaptureDefinition('WARRANTY_SELECT_OR_CREATE');
  assert.equal(capture.mode, 'RELATIONAL');
  assert.equal(capture.canonicalOwner, 'Warranty');
  assert.equal(capture.relationalAdapterKey, 'WARRANTY');
  assert.equal(capture.inputSchema.type, 'RELATIONAL_SELECT_CREATE');
  assert.deepEqual(capture.factKeys, ['coverage.warranties']);
});

test('warranty adapter scopes selection, filters active records, validates dates, and prevents duplicates', () => {
  const adapter = read('../../src/modules/propertyContext/application/relationalCaptureAdapters.ts');
  assert.match(adapter, /tx\.warranty\.findFirst\(\{ where: \{ id: entityId, propertyId \}/);
  assert.match(adapter, /prisma\.warranty\.findMany/);
  assert.match(adapter, /expiryDate: \{ gte: new Date\(\) \}/);
  assert.match(adapter, /Warranty expiry date must be after the start date/);
  assert.match(adapter, /matching warranty already exists/i);
  assert.match(adapter, /tx\.warranty\.create/);
});

test('claim modal captures missing coverage inline and consumes the returned selection', () => {
  const modal = read('../../../frontend/src/app/(dashboard)/dashboard/components/claims/ClaimCreateModal.tsx');
  assert.match(modal, /operationKey="FILE_INSURANCE_CLAIM"/);
  assert.match(modal, /operationKey="FILE_WARRANTY_CLAIM"/);
  assert.match(modal, /setInsurancePolicyId\(result\.selection\.entityId\)/);
  assert.match(modal, /setWarrantyId\(result\.selection\.entityId\)/);
  assert.match(modal, /max-h-\[90vh\]/);
  assert.doesNotMatch(modal, /window\.location\.reload/);
});

test('claim creation enforces shared readiness before canonical coverage validation', () => {
  const service = read('../../src/services/claims/claims.service.ts');
  const createStart = service.indexOf('static async createClaim');
  const shared = service.indexOf('assertSharedClaimCoverage', createStart);
  const canonical = service.indexOf('assertClaimCoverage', shared);
  assert.ok(createStart >= 0 && shared > createStart && canonical > shared);
  assert.match(service, /code: 'CLAIM_CONTEXT_REQUIRED'/);
  assert.match(service, /statusCode: 422/);
});
