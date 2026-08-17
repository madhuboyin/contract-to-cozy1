const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  BuyerWalkthroughWorkspaceUpdateSchema,
  BuyerWalkthroughObservationCreateSchema,
  BuyerWalkthroughIssueCreateSchema,
  BuyerWalkthroughIssueUpdateSchema,
} = require('../../src/productFramework/buyerAcquisition.contract.ts');

const backendRoot = path.resolve(__dirname, '../..');
const schema = fs.readFileSync(path.join(backendRoot, 'prisma/schema.prisma'), 'utf8');
const service = fs.readFileSync(path.join(backendRoot, 'src/services/buyerWalkthrough.service.ts'), 'utf8');
const routes = fs.readFileSync(path.join(backendRoot, 'src/routes/homeBuyerTask.routes.ts'), 'utf8');
const center = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/BuyerWalkthroughCenter.tsx'), 'utf8');

test('walkthrough observations and escalations have property-scoped persistence', () => {
  assert.match(schema, /model BuyerWalkthroughWorkspace/);
  assert.match(schema, /model BuyerWalkthroughObservation/);
  assert.match(schema, /model BuyerWalkthroughIssue/);
  assert.match(schema, /walkthroughWorkspace\s+BuyerWalkthroughWorkspace\?/);
  assert.match(schema, /inspectionFindingId\s+String\?/);
  assert.match(schema, /negotiationFindingId\s+String\?/);
  assert.match(schema, /evidenceDocumentId\s+String\?/);
});

test('walkthrough contracts are strict, bounded, and require a professional route', () => {
  assert.equal(BuyerWalkthroughWorkspaceUpdateSchema.safeParse({}).success, false);
  assert.equal(BuyerWalkthroughWorkspaceUpdateSchema.safeParse({ started: true, conditionCertified: true }).success, false);
  assert.equal(BuyerWalkthroughObservationCreateSchema.safeParse({ area: 'Kitchen', category: 'PLUMBING', status: 'ACCEPTABLE' }).success, true);
  assert.equal(BuyerWalkthroughObservationCreateSchema.safeParse({ area: '', category: 'PLUMBING', status: 'SAFE' }).success, false);
  assert.equal(BuyerWalkthroughIssueCreateSchema.safeParse({ category: 'NEW_DAMAGE', title: 'New ceiling stain', blocking: true }).success, true);
  assert.equal(BuyerWalkthroughIssueUpdateSchema.safeParse({ status: 'ROUTED_TO_PROFESSIONAL' }).success, false);
  assert.equal(BuyerWalkthroughIssueUpdateSchema.safeParse({ status: 'ROUTED_TO_PROFESSIONAL', routedToRole: 'BUYER_AGENT' }).success, true);
});

test('service reads canonical transaction evidence and keeps completion evidence bounded', () => {
  assert.match(service, /prisma\.inspectionFinding\.findMany/);
  assert.match(service, /negotiationCaseLinks/);
  assert.match(service, /type: 'CONTRACT'/);
  assert.match(service, /prisma\.document\.count/);
  assert.match(service, /Every issue observation must have a recorded escalation item/);
  assert.match(service, /Route or disposition every walkthrough issue before completing/);
  assert.match(service, /BUYER_ACTION_KEYS\.WALKTHROUGH_PREP/);
  assert.match(service, /BUYER_ACTION_KEYS\.WALKTHROUGH_ISSUES/);
  assert.match(service, /BUYER_MILESTONE_KEYS\.FINAL_WALKTHROUGH/);
  assert.match(service, /no condition, repair, safety, or legal certification/);
});

test('mobile walkthrough UI supports evidence and professional escalation without certification claims', () => {
  assert.match(routes, /final-walkthrough\/observations\/\:observationId/);
  assert.match(routes, /final-walkthrough\/issues\/\:issueId/);
  assert.match(routes, /final-walkthrough\/complete/);
  assert.match(center, /capture="environment"/);
  assert.match(center, /Stop unsafe testing/);
  assert.match(center, /Route to buyer agent/);
  assert.match(center, /Route to attorney/);
  assert.match(center, /does not confirm closing or waive contractual rights/);
  assert.doesNotMatch(center, /repair certified|safe to close|condition approved/i);
});
