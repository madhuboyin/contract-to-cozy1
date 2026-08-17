const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  BuyerClosingDisclosureCreateSchema,
  BuyerClosingDisclosureUpdateSchema,
  BuyerClosingFundsReadinessUpdateSchema,
} = require('../../src/productFramework/buyerAcquisition.contract.ts');

const backendRoot = path.resolve(__dirname, '../..');
const schema = fs.readFileSync(path.join(backendRoot, 'prisma/schema.prisma'), 'utf8');
const service = fs.readFileSync(path.join(backendRoot, 'src/services/buyerClosingDisclosure.service.ts'), 'utf8');
const routes = fs.readFileSync(path.join(backendRoot, 'src/routes/homeBuyerTask.routes.ts'), 'utf8');
const center = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/BuyerClosingDisclosureCenter.tsx'), 'utf8');

test('Closing Disclosure uses property-scoped numbered revisions with a resumable manual draft', () => {
  assert.match(schema, /model BuyerClosingDisclosureWorkspace/);
  assert.match(schema, /model BuyerClosingDisclosureRevision/);
  assert.match(schema, /@@unique\(\[workspaceId, revisionNumber\]\)/);
  assert.match(service, /CLOSING_DISCLOSURE_REVISION_CONFLICT/);
  assert.match(service, /status: 'SUPERSEDED'/);
  assert.match(center, /Save partial draft/);
  assert.match(center, /Start new revision/);
});

test('strict manual contracts support partial save and reject wire credentials', () => {
  assert.equal(BuyerClosingDisclosureCreateSchema.safeParse({ aprBps: 688 }).success, true);
  assert.equal(BuyerClosingDisclosureUpdateSchema.safeParse({}).success, false);
  assert.equal(BuyerClosingDisclosureCreateSchema.safeParse({ routingNumber: '021000021' }).success, false);
  assert.equal(BuyerClosingFundsReadinessUpdateSchema.safeParse({ accountNumber: '1234' }).success, false);
  assert.equal(BuyerClosingFundsReadinessUpdateSchema.safeParse({ fundsReady: true }).success, true);
  assert.doesNotMatch(schema.slice(schema.indexOf('model BuyerClosingDisclosureWorkspace'), schema.indexOf('model BuyerPurchaseLenderReadiness')), /accountNumber|routingNumber|wireInstructions|credential/i);
});

test('confirmed disclosure compares selected Loan Estimate and canonical contract credits', () => {
  assert.match(service, /selectedLoanEstimateRevisionId/);
  assert.match(service, /COMPARISON_FIELDS\.map/);
  assert.match(service, /negotiationShieldBuyerFinding\.findMany/);
  assert.match(service, /sellerCreditDeltaCents/);
  assert.match(center, /Selected Loan Estimate/);
  assert.match(center, /Recorded contract credits/);
});

test('review and funds readiness reconcile stable tasks and Closing Disclosure milestone', () => {
  assert.match(service, /BUYER_ACTION_KEYS\.CLOSING_DISCLOSURE_REVIEW/);
  assert.match(service, /BUYER_ACTION_KEYS\.FUNDS_READINESS_CONFIRM/);
  assert.match(service, /BUYER_MILESTONE_KEYS\.CLOSING_DISCLOSURE/);
  assert.match(service, /instructionsVerified.*verificationChannel/s);
  assert.match(routes, /closing-disclosure\/funds-readiness/);
});

test('UI repeats persistent wire-fraud safeguards and has no credential inputs', () => {
  assert.match(center, /Never enter account numbers, routing numbers, passwords, security codes, or full wire instructions here/);
  assert.match(center, /independently verified/i);
  assert.doesNotMatch(center, /name="(?:accountNumber|routingNumber|wireInstructions|password|securityCode)"/);
});
