const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('Slice 2 models policy identity, terms, and typed facts separately', () => {
  const schema = read('apps/backend/prisma/schema.prisma');

  assert.match(schema, /model InsurancePolicyTerm \{/);
  assert.match(schema, /insurancePolicyId String/);
  assert.match(schema, /termStart\s+DateTime\?/);
  assert.match(schema, /verificationStatus String\s+@default\("UNVERIFIED"\)/);
  assert.match(schema, /model InsurancePolicyFact \{/);
  assert.match(schema, /amountValue\s+Decimal\?/);
  assert.match(schema, /textValue\s+String\?/);
  assert.match(schema, /booleanValue\s+Boolean\?/);
  assert.match(schema, /jsonValue\s+Json\?/);
  assert.match(schema, /sourcePage\s+Int\?/);
  assert.match(schema, /sourceExcerptHash\s+String\?/);
  assert.match(schema, /confirmationStatus\s+String\s+@default\("PENDING"\)/);
});

test('document extraction stages unverified facts without invented premium or dates', () => {
  const intelligence = read('apps/backend/src/services/documentIntelligence.service.ts');
  const recordService = read('apps/backend/src/services/insurancePolicyRecord.service.ts');

  assert.match(intelligence, /stageExtractedPolicyTerm/);
  assert.doesNotMatch(intelligence, /premiumAmount:\s*extractedData\.premiumAmount\s*\|\|\s*0/);
  assert.doesNotMatch(intelligence, /new Date\(Date\.now\(\) \+ 365/);
  assert.match(recordService, /premiumAmount: null/);
  assert.match(recordService, /startDate: null/);
  assert.match(recordService, /expiryDate: null/);
  assert.match(recordService, /confirmationStatus: 'PENDING'/);
  assert.match(recordService, /verificationStatus: 'UNVERIFIED'/);
});

test('confirmation is authorized, audited, and updates the canonical record', () => {
  const service = read('apps/backend/src/services/insurancePolicyRecord.service.ts');
  const management = read('apps/backend/src/services/home-management.service.ts');

  assert.match(service, /insurancePolicy: \{ homeownerProfileId: params\.homeownerProfileId \}/);
  assert.match(service, /id: input\.propertyId, homeownerProfileId: input\.homeownerProfileId/);
  assert.match(management, /id: data\.propertyId, homeownerProfileId/);
  assert.match(service, /insurance_policy_fact_confirmed/);
  assert.match(service, /insurance_policy_fact_rejected/);
  assert.match(service, /policyPatch\.premiumAmount = updated\.amountValue/);
  assert.match(service, /policyPatch\.coverageType = updated\.textValue/);
});

test('workspace shows provenance, confirmation controls, unknowns, and advice boundary', () => {
  const panel = read(
    'apps/frontend/src/components/coverage/PolicyRecordReadinessPanel.tsx',
  );
  const workspace = read(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/coverage-intelligence/CoverageIntelligenceToolClient.tsx',
  );

  assert.match(workspace, /<PolicyRecordReadinessPanel propertyId=\{propertyId\} \/>/);
  assert.match(panel, /Source:/);
  assert.match(panel, /page not captured/);
  assert.match(panel, /\n\s+Confirm\n/);
  assert.match(panel, /\n\s+Not correct\n/);
  assert.match(panel, /Still unknown/);
  assert.match(panel, /not a coverage determination or licensed/);
});
