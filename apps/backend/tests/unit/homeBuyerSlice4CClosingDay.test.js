const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  BuyerClosingDayUpdateSchema,
  BuyerClosingDayConfirmSchema,
  BuyerLifecycleUpdateSchema,
} = require('../../src/productFramework/buyerAcquisition.contract.ts');

const backendRoot = path.resolve(__dirname, '../..');
const schema = fs.readFileSync(path.join(backendRoot, 'prisma/schema.prisma'), 'utf8');
const service = fs.readFileSync(path.join(backendRoot, 'src/services/buyerClosingDay.service.ts'), 'utf8');
const acquisitionService = fs.readFileSync(path.join(backendRoot, 'src/services/buyerAcquisition.service.ts'), 'utf8');
const routes = fs.readFileSync(path.join(backendRoot, 'src/routes/homeBuyerTask.routes.ts'), 'utf8');
const center = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/BuyerClosingDayCenter.tsx'), 'utf8');
const page = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/page.tsx'), 'utf8');

test('Closing Day owns normalized property-scoped session state and signed-copy evidence', () => {
  assert.match(schema, /model BuyerClosingDayWorkspace/);
  assert.match(schema, /checklistId String @unique/);
  assert.match(schema, /propertyId\s+String @unique/);
  assert.match(schema, /signedClosingDocument Document\? @relation\("BuyerClosingDaySignedDocument"/);
  assert.match(schema, /professionalClosingConfirmedAt DateTime\?/);
  assert.match(service, /CLOSING_DAY_DOCUMENT_NOT_FOUND/);
});

test('manual preparation contracts are strict and never accept identity or wire secrets', () => {
  assert.equal(BuyerClosingDayUpdateSchema.safeParse({ identificationReady: true }).success, true);
  assert.equal(BuyerClosingDayUpdateSchema.safeParse({}).success, false);
  for (const unsafe of [
    { identityDocumentNumber: 'A1234' }, { accountNumber: '1234' },
    { routingNumber: '021000021' }, { wireInstructions: 'send here' }, { securityCode: '999999' },
  ]) assert.equal(BuyerClosingDayUpdateSchema.safeParse(unsafe).success, false);
  assert.doesNotMatch(schema.slice(schema.indexOf('model BuyerClosingDayWorkspace'), schema.indexOf('model BuyerPurchaseLenderReadiness')), /identityDocumentNumber|accountNumber|routingNumber|wireInstructions|securityCode/);
});

test('explicit close contract requires a literal confirmation and a non-future timestamp', () => {
  const closedAt = new Date(Date.now() - 1_000).toISOString();
  assert.equal(BuyerClosingDayConfirmSchema.safeParse({ professionalClosingComplete: true, closedAt }).success, true);
  assert.equal(BuyerClosingDayConfirmSchema.safeParse({ professionalClosingComplete: false, closedAt }).success, false);
  assert.equal(BuyerClosingDayConfirmSchema.safeParse({ professionalClosingComplete: true, closedAt: new Date(Date.now() + 60 * 60_000).toISOString() }).success, false);
  assert.equal(BuyerLifecycleUpdateSchema.safeParse({ ownershipStartedAt: closedAt }).success, false);
  assert.equal(BuyerLifecycleUpdateSchema.safeParse({ stage: 'CLOSED' }).success, false);
});

test('professional close reuses appointment context and atomically reveals recent-owner state', () => {
  assert.match(service, /buyerTitleEscrowWorkspace\.findUnique/);
  assert.match(service, /CLOSING_DAY_APPOINTMENT_INCOMPLETE/);
  assert.match(service, /assertBuyerJourneyStageTransition\(checklist\.stage, 'CLOSED'\)/);
  assert.match(service, /BuyerAcquisitionService\.applyConfirmedClose/);
  assert.match(acquisitionService, /stage: 'CLOSED', ownershipStartedAt: closedAt/);
  assert.match(acquisitionService, /ownershipState: 'RECENT_OWNER'/);
  assert.match(acquisitionService, /ensureClosingRepairHandoff/);
  assert.match(acquisitionService, /anchorOffsetDays/);
  assert.match(service, /BUYER_MILESTONE_KEYS\.CLOSING/);
  assert.match(service, /BUYER_ACTION_KEYS\.CLOSING_DAY_CONFIRM/);
});

test('Buyer Plan exposes preparation, blocker review, signed copies, access, and explicit confirmation', () => {
  assert.match(routes, /closing-day\/confirm-professional-close/);
  assert.match(center, /Trusted last-minute contact/);
  assert.match(center, /recorded blocker/);
  assert.match(center, /Signed closing record/);
  assert.match(center, /Keys/);
  assert.match(center, /Possession arrangements confirmed/);
  assert.match(center, /I explicitly confirm that the professional closing process is complete/);
  assert.match(center, /scheduled date, signing appointment, funds transfer, or clear-to-close status does not confirm legal closing/i);
  assert.match(page, /Ownership begins only after explicit professional-close confirmation/);
  assert.doesNotMatch(page, /name="ownershipStartedAt"/);
});
