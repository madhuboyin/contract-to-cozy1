const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  BuyerContractRevisionCreateSchema,
  BuyerContractRevisionUpdateSchema,
  BuyerContractRevisionConfirmSchema,
} = require('../../src/productFramework/buyerAcquisition.contract.ts');

const backendRoot = path.resolve(__dirname, '../..');
const schema = fs.readFileSync(path.join(backendRoot, 'prisma/schema.prisma'), 'utf8');
const service = fs.readFileSync(path.join(backendRoot, 'src/services/buyerContract.service.ts'), 'utf8');
const routes = fs.readFileSync(path.join(backendRoot, 'src/routes/homeBuyerTask.routes.ts'), 'utf8');
const center = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/BuyerContractContingencyCenter.tsx'), 'utf8');

test('contract tracker has normalized property-scoped revision, confirmation, and contingency records', () => {
  assert.match(schema, /model BuyerContractWorkspace/);
  assert.match(schema, /model BuyerContractRevision/);
  assert.match(schema, /model BuyerContractFieldConfirmation/);
  assert.match(schema, /model BuyerContractContingency/);
  assert.match(schema, /propertyId\s+String\s+@unique/);
  assert.match(schema, /@@unique\(\[workspaceId, revisionNumber\]\)/);
  assert.match(schema, /@@unique\(\[revisionId, fieldKey\]\)/);
  assert.match(schema, /@@unique\(\[revisionId, contingencyKey\]\)/);
  assert.match(schema, /targetClosingDate\s+DateTime\?\s+@db\.Date/);
  assert.match(schema, /sellerCreditsCents\s+Int\?/);
});

test('strict contracts allow manual drafts and require explicit field-level confirmation', () => {
  const draft = {
    propertyAddress: '12 Main St',
    buyerNames: ['Buyer One'],
    sellerNames: ['Seller One'],
    acceptedAt: '2026-08-17',
    targetClosingDate: '2026-09-17',
    possessionTerms: 'At closing',
    contingencies: [{
      contingencyKey: 'contract:inspection',
      type: 'INSPECTION',
      label: 'Inspection contingency',
      dueAt: '2026-08-24T12:00:00.000Z',
    }],
  };
  assert.equal(BuyerContractRevisionCreateSchema.safeParse(draft).success, true);
  assert.equal(BuyerContractRevisionCreateSchema.safeParse({ ...draft, legalAdvice: 'waive it' }).success, false);
  assert.equal(BuyerContractRevisionUpdateSchema.safeParse({}).success, false);
  assert.equal(BuyerContractRevisionConfirmSchema.safeParse({ confirmed: false, fieldConfirmations: [] }).success, false);
  assert.equal(BuyerContractRevisionConfirmSchema.safeParse({
    confirmed: true,
    fieldConfirmations: [{ fieldKey: 'ACCEPTANCE_DATE', sourceLabel: 'Reviewed against signed contract' }],
  }).success, true);
});

test('confirmation supersedes revisions and performs guarded Buyer Plan write-back', () => {
  assert.match(service, /status: 'SUPERSEDED'/);
  assert.match(service, /BUYER_CONTRACT_PROPERTY_UNCONFIRMED/);
  assert.match(service, /confirmedFields\.has\('TARGET_CLOSING_DATE'\)/);
  assert.match(service, /targetCanMove = !checklist\.targetCloseDate \|\| sameInstant/);
  assert.match(service, /userEditedAt: null/);
  assert.match(service, /BUYER_MILESTONE_KEYS\.CONTRACT_ACCEPTED/);
  assert.match(service, /BUYER_MILESTONE_KEYS\.CLOSING/);
  assert.match(service, /BUYER_ACTION_KEYS\.CONTRACT_CONTINGENCIES_REVIEW/);
  assert.match(service, /status: overdue\.length \? 'BLOCKED'/);
  assert.match(service, /sourceType: 'BUYER_CONTRACT_REVISION'/);
});

test('property-scoped API and Buyer Plan UI support resumable revisions without legal conclusions', () => {
  assert.match(routes, /properties\/:propertyId\/contract-contingencies/);
  assert.match(routes, /contract-contingencies\/revisions\/:revisionId\/confirm/);
  assert.match(center, /Contract dates that guide your plan/);
  assert.match(center, /Upload or photograph contract/);
  assert.match(center, /View extracted contract details/);
  assert.match(center, /Save reviewed dates/);
  assert.match(center, /Confirm dates and update my plan/);
  assert.match(center, /not legal review/);
  assert.doesNotMatch(center, /waive this contingency|contract is compliant|legally approved/i);
});
