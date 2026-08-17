const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  BuyerPurchaseLoanEstimateCreateSchema,
  BuyerPurchaseLoanEstimateUpdateSchema,
  BuyerPurchaseLoanSelectionSchema,
} = require('../../src/productFramework/buyerAcquisition.contract.ts');

const backendRoot = path.resolve(__dirname, '../..');
const schema = fs.readFileSync(path.join(backendRoot, 'prisma/schema.prisma'), 'utf8');
const service = fs.readFileSync(path.join(backendRoot, 'src/services/buyerPurchaseLoanEstimate.service.ts'), 'utf8');
const routes = fs.readFileSync(path.join(backendRoot, 'src/routes/homeBuyerTask.routes.ts'), 'utf8');
const center = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/BuyerPurchaseLoanEstimateCenter.tsx'), 'utf8');

test('purchase Loan Estimates own separate lender offers and numbered revisions', () => {
  assert.match(schema, /model BuyerPurchaseLoanOffer/);
  assert.match(schema, /model BuyerPurchaseLoanEstimateRevision/);
  assert.match(schema, /@@unique\(\[offerId, revisionNumber\]\)/);
  assert.match(schema, /sourceDocument Document\?\s+@relation\("BuyerPurchaseLoanEstimateSourceDocument"/);
  assert.doesNotMatch(
    schema.slice(schema.indexOf('model RefinanceLoanEstimateComparisonSnapshot'), schema.indexOf('model RefinanceDecision')),
    /BuyerPurchaseLoanOffer|BuyerPurchaseLoanEstimateRevision/,
  );
});

test('manual entry supports strict partial drafts while rejecting unsafe values', () => {
  const draft = BuyerPurchaseLoanEstimateCreateSchema.parse({ lenderName: 'Local Credit Union', aprBps: 675 });
  assert.equal(draft.aprBps, 675);
  assert.equal(BuyerPurchaseLoanEstimateCreateSchema.safeParse({ lenderName: 'Lender', loanAmountCents: -1 }).success, false);
  assert.equal(BuyerPurchaseLoanEstimateCreateSchema.safeParse({ lenderName: 'Lender', platformApproved: true }).success, false);
  assert.equal(BuyerPurchaseLoanEstimateUpdateSchema.safeParse({}).success, false);
  assert.equal(BuyerPurchaseLoanEstimateUpdateSchema.safeParse({ issuedDate: '08/17/2026' }).success, false);
});

test('confirmation supersedes prior revisions, compares current offers, and writes checklist completion', () => {
  assert.match(service, /compareRefinanceLoanEstimates\(comparableOffers\)/);
  assert.match(service, /comparableOffers\.length >= 2/);
  assert.match(service, /CONFIRMATION_FIELDS\.filter/);
  assert.match(service, /status: 'SUPERSEDED'/);
  assert.match(service, /confirmed\.length >= 2/);
  assert.match(service, /actionKey: BUYER_ACTION_KEYS\.LOAN_ESTIMATES/);
  assert.match(service, /completionEvidenceJson: \{ confirmedRevisionIds:/);
});

test('property-scoped APIs and Buyer Plan expose save, resume, revision, and confirm paths', () => {
  assert.match(routes, /purchase-financing\/loan-estimates/);
  assert.match(routes, /offers\/:offerId\/revisions/);
  assert.match(routes, /revisions\/:revisionId\/confirm/);
  assert.match(center, /Save draft/);
  assert.match(center, /Resume/);
  assert.match(center, /Add revision/);
  assert.match(center, /Confirm/);
  assert.match(center, /do not recommend a lender or determine eligibility/);
});

test('document extraction remains a review-required proposal with field provenance', () => {
  const extractedDraft = BuyerPurchaseLoanEstimateCreateSchema.parse({
    lenderName: 'Community Bank',
    sourceType: 'DOCUMENT_EXTRACTION',
    loanAmountCents: 42500000,
    extractionMetadata: { method: 'PDF_TEXT', warnings: ['Review every field.'] },
  });
  assert.equal(extractedDraft.sourceType, 'DOCUMENT_EXTRACTION');
  assert.match(service, /mapPurchaseLoanEstimateExtraction/);
  assert.match(service, /fieldConfidence/);
  assert.match(service, /required: true as const/);
  assert.match(routes, /purchase-financing\/loan-estimates\/extract/);
  assert.match(center, /Extraction never confirms or saves values for you/);
  assert.match(center, /Review required/);
});

test('buyer lender selection requires a confirmed revision and advances appraisal follow-up without approval claims', () => {
  assert.equal(BuyerPurchaseLoanSelectionSchema.safeParse({ revisionId: 'not-a-uuid', intentToProceed: true }).success, false);
  assert.equal(BuyerPurchaseLoanSelectionSchema.safeParse({ revisionId: '123e4567-e89b-12d3-a456-426614174000', intentToProceed: true }).success, true);
  assert.match(schema, /selectedLoanEstimateRevisionId/);
  assert.match(service, /status: 'CONFIRMED'/);
  assert.match(service, /PURCHASE_LOAN_SELECTION_REQUIRES_CONFIRMED_REVISION/);
  assert.match(service, /actionKey: BUYER_ACTION_KEYS\.APPRAISAL_TRACKING/);
  assert.match(service, /status: 'IN_PROGRESS'/);
  assert.match(routes, /purchase-financing\/loan-estimates\/select/);
  assert.match(center, /Select for planning/);
  assert.match(center, /Record intent to proceed/);
  assert.doesNotMatch(center, /recommended lender|approved lender/);
});
