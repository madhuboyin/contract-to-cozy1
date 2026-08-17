const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  BuyerInsuranceWorkspaceUpdateSchema,
  BuyerInsuranceQuoteCreateSchema,
  BuyerInsuranceQuoteUpdateSchema,
  BuyerInsuranceBindSchema,
  BuyerInsuranceRequirementCreateSchema,
} = require('../../src/productFramework/buyerAcquisition.contract.ts');

const backendRoot = path.resolve(__dirname, '../..');
const schema = fs.readFileSync(path.join(backendRoot, 'prisma/schema.prisma'), 'utf8');
const service = fs.readFileSync(path.join(backendRoot, 'src/services/buyerInsurance.service.ts'), 'utf8');
const homeownerService = fs.readFileSync(path.join(backendRoot, 'src/services/home-management.service.ts'), 'utf8');
const routes = fs.readFileSync(path.join(backendRoot, 'src/routes/homeBuyerTask.routes.ts'), 'utf8');
const center = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/BuyerInsuranceCenter.tsx'), 'utf8');

test('buyer quotes, preparation, and requirements are separate from canonical bound policies', () => {
  assert.match(schema, /model BuyerInsuranceWorkspace/);
  assert.match(schema, /model BuyerInsuranceQuote/);
  assert.match(schema, /model BuyerInsuranceRequirement/);
  assert.match(schema, /boundPolicyId\s+String\?/);
  assert.match(schema, /insuranceWorkspace\s+BuyerInsuranceWorkspace\?/);
  assert.match(schema, /BuyerInsuranceQuoteStatus/);
});

test('buyer insurance contracts are strict, bounded, and preserve explicit selection', () => {
  assert.equal(BuyerInsuranceWorkspaceUpdateSchema.safeParse({}).success, false);
  assert.equal(BuyerInsuranceWorkspaceUpdateSchema.safeParse({ platformRecommendedCoverage: true }).success, false);
  assert.equal(BuyerInsuranceQuoteCreateSchema.safeParse({ carrierName: 'Example Carrier', annualPremiumCents: 180000, replacementCostBasis: true }).success, true);
  assert.equal(BuyerInsuranceQuoteCreateSchema.safeParse({ carrierName: '', annualPremiumCents: -1 }).success, false);
  assert.equal(BuyerInsuranceQuoteUpdateSchema.safeParse({ status: 'SELECTED' }).success, false);
  assert.equal(BuyerInsuranceQuoteUpdateSchema.safeParse({ status: 'REVIEWED' }).success, true);
  assert.equal(BuyerInsuranceBindSchema.safeParse({ quoteId: '11111111-1111-4111-8111-111111111111', policyNumber: 'P-1', effectiveAt: '2026-10-01T12:00:00.000Z', expiresAt: '2027-10-01T12:00:00.000Z' }).success, true);
  assert.equal(BuyerInsuranceBindSchema.safeParse({ quoteId: '11111111-1111-4111-8111-111111111111', policyNumber: 'P-1', effectiveAt: '2027-10-01T12:00:00.000Z', expiresAt: '2026-10-01T12:00:00.000Z' }).success, false);
  assert.equal(BuyerInsuranceRequirementCreateSchema.safeParse({ category: 'ROOF', title: 'Roof age evidence', blocking: true }).success, true);
});

test('binding promotes only the selected current quote into canonical Coverage', () => {
  assert.match(service, /BUYER_INSURANCE_SELECTION_REQUIRED/);
  assert.match(service, /if \(workspace\.boundPolicyId\) return this\.get/);
  assert.match(service, /BUYER_INSURANCE_QUOTE_EXPIRED/);
  assert.match(service, /createInsurancePolicy\(property\.homeownerProfileId/);
  assert.match(service, /boundPolicyId: policy!\.id/);
  assert.match(service, /data: \{ policyId: policy!\.id \}/);
  assert.match(homeownerService, /confirmedByUserId \?\? profile\?\.userId/);
  assert.match(service, /BUYER_ACTION_KEYS\.COVERAGE_BIND/);
  assert.match(service, /BUYER_MILESTONE_KEYS\.INSURANCE_EFFECTIVE/);
  assert.match(service, /did not recommend or bind coverage/);
});

test('Buyer Plan compares recorded facts without presenting advice or a quote as coverage', () => {
  assert.match(routes, /buyer-insurance\/quotes\/\:quoteId\/select/);
  assert.match(routes, /buyer-insurance\/bind/);
  assert.match(center, /does not recommend coverage, determine adequacy, quote premiums, or bind a policy/);
  assert.match(center, /This does not mean the quote is bound coverage/);
  assert.match(center, /I confirmed binding/);
  assert.match(center, /creates the canonical Coverage policy/);
  assert.doesNotMatch(center, /best quote|recommended limit|adequate coverage/i);
});
