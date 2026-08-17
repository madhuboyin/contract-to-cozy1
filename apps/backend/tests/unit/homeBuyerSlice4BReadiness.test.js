const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  BuyerPurchaseLenderReadinessUpdateSchema,
  BuyerLenderConditionCreateSchema,
  BuyerLenderConditionUpdateSchema,
} = require('../../src/productFramework/buyerAcquisition.contract.ts');

const backendRoot = path.resolve(__dirname, '../..');
const schema = fs.readFileSync(path.join(backendRoot, 'prisma/schema.prisma'), 'utf8');
const service = fs.readFileSync(path.join(backendRoot, 'src/services/buyerPurchaseLenderReadiness.service.ts'), 'utf8');
const loanEstimateService = fs.readFileSync(path.join(backendRoot, 'src/services/buyerPurchaseLoanEstimate.service.ts'), 'utf8');
const routes = fs.readFileSync(path.join(backendRoot, 'src/routes/homeBuyerTask.routes.ts'), 'utf8');
const center = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/BuyerPurchaseLenderReadinessCenter.tsx'), 'utf8');

test('purchase appraisal and lender conditions have dedicated canonical persistence', () => {
  assert.match(schema, /model BuyerPurchaseLenderReadiness/);
  assert.match(schema, /model BuyerPurchaseLenderCondition/);
  assert.match(schema, /planId\s+String @unique/);
  assert.match(schema, /selectedLoanEstimateRevisionId\s+String/);
  assert.match(schema, /BuyerPurchaseUnderwritingStatus/);
  assert.match(schema, /BuyerLenderConditionStatus/);
});

test('readiness and condition contracts are strict and bounded', () => {
  assert.equal(BuyerPurchaseLenderReadinessUpdateSchema.safeParse({}).success, false);
  assert.equal(BuyerPurchaseLenderReadinessUpdateSchema.safeParse({ underwritingStatus: 'PLATFORM_APPROVED' }).success, false);
  assert.equal(BuyerPurchaseLenderReadinessUpdateSchema.safeParse({ appraisalStatus: 'SCHEDULED', appraisalScheduledAt: '2026-09-01T12:00:00.000Z' }).success, true);
  assert.equal(BuyerLenderConditionCreateSchema.safeParse({ category: 'TITLE', title: 'Updated title document', blocking: true }).success, true);
  assert.equal(BuyerLenderConditionCreateSchema.safeParse({ category: 'UNKNOWN_KIND', title: 'Anything', blocking: false }).success, false);
  assert.equal(BuyerLenderConditionUpdateSchema.safeParse({ status: 'SATISFIED' }).success, true);
});

test('service requires a current selected revision and reconciles one task and milestone', () => {
  assert.match(service, /PURCHASE_LOAN_SELECTION_REQUIRED/);
  assert.match(service, /PURCHASE_LOAN_SELECTION_STALE/);
  assert.match(service, /stored\.selectedLoanEstimateRevisionId !== plan\.selectedLoanEstimateRevisionId/);
  assert.match(loanEstimateService, /const selectionChanged = revision\.offer\.plan\.selectedLoanEstimateRevisionId !== revision\.id/);
  assert.match(loanEstimateService, /milestoneKey: BUYER_MILESTONE_KEYS\.APPRAISAL/);
  assert.match(loanEstimateService, /Reset after the buyer selected a different confirmed lender revision/);
  assert.match(service, /actionKey: BUYER_ACTION_KEYS\.APPRAISAL_TRACKING/);
  assert.match(service, /milestoneKey: BUYER_MILESTONE_KEYS\.APPRAISAL/);
  assert.match(service, /taskStatus = appraisalBlocked \|\| blocking\.length \? 'BLOCKED'/);
  assert.match(service, /condition\.blocking \|\| Boolean\(condition\.dueAt && condition\.dueAt < now\)/);
  assert.match(service, /USER_RECORDED_CLEAR_TO_CLOSE/);
  assert.match(service, /completionMethod: allComplete \? 'USER_ATTESTATION'/);
});

test('property-scoped UI keeps appraisal and clear-to-close authority with the buyer and professionals', () => {
  assert.match(routes, /purchase-financing\/readiness/);
  assert.match(routes, /readiness\/conditions\/\:conditionId/);
  assert.match(center, /ContractToCozy does not perform the appraisal, approve underwriting, or certify clear-to-close status/);
  assert.match(center, /Blocks closing readiness/);
  assert.match(center, /I was told clear to close/);
  assert.doesNotMatch(center, /We approved|platform appraisal|certified clear/);
});
