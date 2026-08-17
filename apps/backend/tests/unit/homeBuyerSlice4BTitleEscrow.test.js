const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  BuyerTitleEscrowWorkspaceUpdateSchema,
  BuyerTitleEscrowIssueCreateSchema,
  BuyerTitleEscrowIssueUpdateSchema,
} = require('../../src/productFramework/buyerAcquisition.contract.ts');

const backendRoot = path.resolve(__dirname, '../..');
const schema = fs.readFileSync(path.join(backendRoot, 'prisma/schema.prisma'), 'utf8');
const service = fs.readFileSync(path.join(backendRoot, 'src/services/buyerTitleEscrow.service.ts'), 'utf8');
const routes = fs.readFileSync(path.join(backendRoot, 'src/routes/homeBuyerTask.routes.ts'), 'utf8');
const center = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/BuyerTitleEscrowCenter.tsx'), 'utf8');

test('title and escrow readiness has property-scoped canonical persistence', () => {
  assert.match(schema, /model BuyerTitleEscrowWorkspace/);
  assert.match(schema, /model BuyerTitleEscrowIssue/);
  assert.match(schema, /propertyId\s+String\s+@unique/);
  assert.match(schema, /BuyerTitleReviewStatus/);
  assert.match(schema, /BuyerTitleIssueStatus/);
  assert.match(schema, /titleEscrowWorkspace\s+BuyerTitleEscrowWorkspace\?/);
});

test('title, contact, and issue contracts are strict and reject clearance authority', () => {
  assert.equal(BuyerTitleEscrowWorkspaceUpdateSchema.safeParse({}).success, false);
  assert.equal(BuyerTitleEscrowWorkspaceUpdateSchema.safeParse({ titleCleared: true }).success, false);
  assert.equal(BuyerTitleEscrowWorkspaceUpdateSchema.safeParse({ wireInstructions: 'send funds here' }).success, false);
  assert.equal(BuyerTitleEscrowWorkspaceUpdateSchema.safeParse({
    contact: { role: 'TITLE_ESCROW', name: 'Closing Professional' },
    titleReviewStatus: 'REVIEWED_WITH_PROFESSIONAL',
    surveyRequirement: 'NOT_REQUIRED',
  }).success, true);
  assert.equal(BuyerTitleEscrowIssueCreateSchema.safeParse({ category: 'EASEMENT', title: 'Ask about recorded access', blocking: true }).success, true);
  assert.equal(BuyerTitleEscrowIssueCreateSchema.safeParse({ category: 'PLATFORM_DEFECT', title: 'Anything', blocking: false }).success, false);
  assert.equal(BuyerTitleEscrowIssueUpdateSchema.safeParse({ status: 'RESOLVED' }).success, true);
});

test('service reuses canonical contacts and documents and reconciles stable plan records', () => {
  assert.match(service, /buyerJourneyContact\.findFirst/);
  assert.match(service, /buyerJourneyContact\.create/);
  assert.match(service, /prisma\.document\.count/);
  assert.match(service, /propertyId, deletedAt: null/);
  assert.match(service, /BUYER_ACTION_KEYS\.TITLE_CONTACT_CONFIRM/);
  assert.match(service, /BUYER_ACTION_KEYS\.TITLE_DOCUMENT_REVIEW/);
  assert.match(service, /BUYER_ACTION_KEYS\.TITLE_ISSUE_RESOLUTION/);
  assert.match(service, /BUYER_MILESTONE_KEYS\.TITLE_SURVEY/);
  assert.match(service, /Boolean\(workspace\.titleCommitmentDocumentId\) && titleReviewed/);
  assert.match(service, /no title clearance is certified/);
});

test('property-scoped UI exposes professional routing and wire-fraud boundaries', () => {
  assert.match(routes, /properties\/:propertyId\/title-escrow/);
  assert.match(routes, /title-escrow\/issues\/:issueId/);
  assert.match(center, /does not interpret exceptions, give legal advice, certify clear title, or validate wiring instructions/);
  assert.match(center, /never store wire instructions here/);
  assert.match(center, /Reviewed with professional/);
  assert.match(center, /With professional/);
  assert.doesNotMatch(center, /title cleared|We approved title|safe to wire/i);
});
