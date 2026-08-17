const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  BuyerJourneyPauseSchema,
  BuyerJourneyResumeSchema,
} = require('../../src/productFramework/buyerAcquisition.contract.ts');
const {
  canTransitionBuyerJourneyStatus,
} = require('../../src/productFramework/buyerJourneyLifecycle.contract.ts');

const backendRoot = path.resolve(__dirname, '../..');
const service = fs.readFileSync(path.join(backendRoot, 'src/services/buyerAcquisition.service.ts'), 'utf8');
const overviewService = fs.readFileSync(path.join(backendRoot, 'src/services/HomeBuyerTask.service.ts'), 'utf8');
const routes = fs.readFileSync(path.join(backendRoot, 'src/routes/homeBuyerTask.routes.ts'), 'utf8');
const controller = fs.readFileSync(path.join(backendRoot, 'src/controllers/homeBuyerTask.controller.ts'), 'utf8');
const client = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/lib/api/client.ts'), 'utf8');
const page = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/page.tsx'), 'utf8');

test('pause and resume commands require explicit confirmation', () => {
  assert.equal(BuyerJourneyPauseSchema.safeParse({ confirmed: true }).success, true);
  assert.equal(BuyerJourneyPauseSchema.safeParse({ confirmed: false }).success, false);
  assert.equal(BuyerJourneyPauseSchema.safeParse({ confirmed: true, extra: true }).success, false);
  assert.equal(BuyerJourneyResumeSchema.safeParse({ confirmed: true }).success, true);
  assert.equal(BuyerJourneyResumeSchema.safeParse({}).success, false);
});

test('lifecycle policy permits only active-to-paused and paused-to-active continuation', () => {
  assert.equal(canTransitionBuyerJourneyStatus('ACTIVE', 'PAUSED'), true);
  assert.equal(canTransitionBuyerJourneyStatus('PAUSED', 'ACTIVE'), true);
  assert.equal(canTransitionBuyerJourneyStatus('CANCELLED', 'ACTIVE'), false);
  assert.equal(canTransitionBuyerJourneyStatus('HANDED_OFF', 'PAUSED'), false);
});

test('pause and resume are owner-only atomic status claims that preserve work', () => {
  const lifecycleSlice = service.slice(service.indexOf('static async pauseJourney'), service.indexOf('static async getPurchaseFinancingPlan'));
  assert.match(lifecycleSlice, /assertAccess\(userId, propertyId, 'OWNER'\)/);
  assert.match(lifecycleSlice, /status: 'ACTIVE'/);
  assert.match(lifecycleSlice, /data: \{ status: 'PAUSED', pausedAt: new Date\(\) \}/);
  assert.match(lifecycleSlice, /status: 'PAUSED'/);
  assert.match(lifecycleSlice, /data: \{ status: 'ACTIVE', pausedAt: null \}/);
  assert.match(lifecycleSlice, /BUYER_PAUSE_TRANSITION_CONFLICT/);
  assert.match(lifecycleSlice, /BUYER_RESUME_TRANSITION_CONFLICT/);
  assert.doesNotMatch(lifecycleSlice, /homeBuyerTask\.updateMany|buyerJourneyMilestone\.updateMany|document\.delete|inspectionFinding\.delete/);
});

test('paused overview suppresses next action while retaining the saved plan', () => {
  assert.match(overviewService, /plan\.status === 'PAUSED' \? null/);
  assert.match(overviewService, /pausedAt: plan\.pausedAt\?\.toISOString\(\) \?\? null/);
});

test('property-scoped routes, client commands, and Buyer Plan controls expose pause and resume', () => {
  assert.match(routes, /properties\/:propertyId\/pause/);
  assert.match(routes, /properties\/:propertyId\/resume/);
  assert.match(controller, /BuyerJourneyPauseSchema\.parse\(req\.body\)/);
  assert.match(controller, /BuyerJourneyResumeSchema\.parse\(req\.body\)/);
  assert.match(controller, /buyer_journey_paused/);
  assert.match(controller, /buyer_journey_resumed/);
  assert.match(client, /pauseBuyerJourney/);
  assert.match(client, /resumeBuyerJourney/);
  assert.match(page, /Pause plan/);
  assert.match(page, /Resume closing plan/);
  assert.match(page, /Deadline and task reminders are stopped/);
  assert.match(page, /overview\.accessRole === 'OWNER'/);
});
