const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  BuyerJourneyCancelSchema,
} = require('../../src/productFramework/buyerAcquisition.contract.ts');
const {
  assertBuyerJourneyStatusTransition,
  canTransitionBuyerJourneyStatus,
} = require('../../src/productFramework/buyerJourneyLifecycle.contract.ts');

const backendRoot = path.resolve(__dirname, '../..');
const service = fs.readFileSync(path.join(backendRoot, 'src/services/buyerAcquisition.service.ts'), 'utf8');
const routes = fs.readFileSync(path.join(backendRoot, 'src/routes/homeBuyerTask.routes.ts'), 'utf8');
const controller = fs.readFileSync(path.join(backendRoot, 'src/controllers/homeBuyerTask.controller.ts'), 'utf8');
const client = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/lib/api/client.ts'), 'utf8');
const page = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/page.tsx'), 'utf8');

test('cancellation requires an explicit confirmation and durable reason', () => {
  assert.equal(BuyerJourneyCancelSchema.safeParse({ confirmed: true, reason: 'Contract terminated' }).success, true);
  assert.equal(BuyerJourneyCancelSchema.safeParse({ confirmed: false, reason: 'Contract terminated' }).success, false);
  assert.equal(BuyerJourneyCancelSchema.safeParse({ confirmed: true, reason: 'no' }).success, false);
  assert.equal(BuyerJourneyCancelSchema.safeParse({ confirmed: true, reason: 'Valid reason', extra: true }).success, false);
});

test('status policy permits cancellation only from active or paused journeys', () => {
  assert.equal(canTransitionBuyerJourneyStatus('ACTIVE', 'CANCELLED'), true);
  assert.equal(canTransitionBuyerJourneyStatus('PAUSED', 'CANCELLED'), true);
  assert.equal(canTransitionBuyerJourneyStatus('HANDED_OFF', 'CANCELLED'), false);
  assert.throws(() => assertBuyerJourneyStatusTransition('CANCELLED', 'ACTIVE'), /INVALID_BUYER_STATUS_TRANSITION/);
});

test('cancel atomically stops active work while retaining completed evidence and owner history', () => {
  assert.match(service, /homeBuyerChecklist\.updateMany/);
  assert.match(service, /status: \{ in: \['ACTIVE', 'PAUSED'\] \}/);
  assert.match(service, /ownershipStartedAt: null/);
  assert.match(service, /homeBuyerTask\.updateMany/);
  assert.match(service, /status: \{ in: \['PENDING', 'IN_PROGRESS', 'BLOCKED'\] \}/);
  assert.match(service, /buyerJourneyMilestone\.updateMany/);
  assert.doesNotMatch(service, /document\.delete|inspectionFinding\.delete|completionEvidenceJson: null/);
  assert.match(service, /ownershipState: 'SHOPPING'/);
});

test('close and cancel use mutually exclusive conditional lifecycle claims', () => {
  assert.match(service, /BUYER_CLOSE_TRANSITION_UNAVAILABLE/);
  assert.match(service, /BUYER_CANCEL_TRANSITION_CONFLICT/);
  assert.match(service, /stage: 'CLOSING_PREP'/);
  assert.match(service, /cancelledAt: null/);
});

test('the property-scoped cancellation route is available from Buyer Plan', () => {
  assert.match(routes, /properties\/:propertyId\/cancel/);
  assert.match(controller, /BuyerJourneyCancelSchema\.parse\(req\.body\)/);
  assert.match(controller, /buyer_journey_cancelled/);
  assert.match(client, /cancelBuyerJourney/);
  assert.match(page, /Cancel this purchase journey/);
  assert.match(page, /completed work, documents, findings, and evidence will be preserved/i);
  assert.match(page, /window\.confirm/);
});
