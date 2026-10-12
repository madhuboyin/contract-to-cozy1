const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// D-R1 batch 1, homeBuyerTask. This router has no propertyAuthMiddleware and no household-role floor: every Buyer service method resolves the caller's
// access itself (resolvePropertyAccess + ROLE_RANK). Because the router cannot carry the guarantee, this test pins it where it lives: with the caller
// resolved as a VIEWER, every mutating service method the router exposes must refuse BEFORE touching the database. A method that forgot its check would
// get past the access step and fail differently (or hang on the database), which this test reports as "no floor".

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
propertyAccess.resolvePropertyAccess = async (_userId, propertyId) => ({ propertyId, role: 'VIEWER' });

const { HomeBuyerTaskService } = require('../../src/services/HomeBuyerTask.service.ts');
const { BuyerAcquisitionService } = require('../../src/services/buyerAcquisition.service.ts');
const { BuyerPurchaseLoanEstimateService } = require('../../src/services/buyerPurchaseLoanEstimate.service.ts');
const { BuyerPurchaseLenderReadinessService } = require('../../src/services/buyerPurchaseLenderReadiness.service.ts');
const { BuyerContractService } = require('../../src/services/buyerContract.service.ts');
const { BuyerTitleEscrowService } = require('../../src/services/buyerTitleEscrow.service.ts');
const { BuyerInsuranceService } = require('../../src/services/buyerInsurance.service.ts');
const { BuyerWalkthroughService } = require('../../src/services/buyerWalkthrough.service.ts');
const { BuyerClosingDisclosureService } = require('../../src/services/buyerClosingDisclosure.service.ts');
const { BuyerClosingDayService } = require('../../src/services/buyerClosingDay.service.ts');

const U = 'user-1';
const P = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';

// [service, method, arguments after (userId, propertyId)] — one row per mutating homeBuyerTask route (apps/backend/src/routes/homeBuyerTask.routes.ts).
const MUTATIONS = [
  [HomeBuyerTaskService, 'applyChecklistComposition', [{}]],
  [HomeBuyerTaskService, 'createTask', [{ title: 'x' }]],
  [HomeBuyerTaskService, 'updateTask', [ID, {}]],
  [HomeBuyerTaskService, 'updateTaskStatus', [ID, 'COMPLETED']],
  [HomeBuyerTaskService, 'deleteTask', [ID]],
  [HomeBuyerTaskService, 'linkToBooking', [ID, ID]],
  [BuyerAcquisitionService, 'updateInspectionPlan', [{}]],
  [BuyerAcquisitionService, 'updatePurchaseFinancingPlan', [{}]],
  [BuyerAcquisitionService, 'updateLifecycle', [{}]],
  [BuyerAcquisitionService, 'pauseJourney', [{}]],
  [BuyerAcquisitionService, 'resumeJourney', [{}]],
  [BuyerAcquisitionService, 'cancelJourney', [{}]],
  [BuyerAcquisitionService, 'verifyDocument', [ID, {}]],
  [BuyerAcquisitionService, 'dispositionFinding', [ID, {}]],
  [BuyerAcquisitionService, 'ensureRecurringHandoff', []],
  [BuyerPurchaseLoanEstimateService, 'createOffer', [{}]],
  [BuyerPurchaseLoanEstimateService, 'addRevision', [ID, {}]],
  [BuyerPurchaseLoanEstimateService, 'updateDraft', [ID, {}]],
  [BuyerPurchaseLoanEstimateService, 'confirm', [ID, {}]],
  [BuyerPurchaseLoanEstimateService, 'selectOffer', [{}]],
  [BuyerPurchaseLoanEstimateService, 'extractPrefill', [[]]],
  [BuyerPurchaseLenderReadinessService, 'updateReadiness', [{}]],
  [BuyerPurchaseLenderReadinessService, 'createCondition', [{}]],
  [BuyerPurchaseLenderReadinessService, 'updateCondition', [ID, {}]],
  [BuyerContractService, 'createRevision', [{}]],
  [BuyerContractService, 'updateDraft', [ID, {}]],
  [BuyerContractService, 'confirm', [ID, {}]],
  [BuyerTitleEscrowService, 'update', [{}]],
  [BuyerTitleEscrowService, 'createIssue', [{}]],
  [BuyerTitleEscrowService, 'updateIssue', [ID, {}]],
  [BuyerInsuranceService, 'update', [{}]],
  [BuyerInsuranceService, 'createQuote', [{}]],
  [BuyerInsuranceService, 'updateQuote', [ID, {}]],
  [BuyerInsuranceService, 'selectQuote', [ID, {}]],
  [BuyerInsuranceService, 'bind', [{}]],
  [BuyerInsuranceService, 'createRequirement', [{}]],
  [BuyerInsuranceService, 'updateRequirement', [ID, {}]],
  [BuyerWalkthroughService, 'update', [{}]],
  [BuyerWalkthroughService, 'createObservation', [{}]],
  [BuyerWalkthroughService, 'updateObservation', [ID, {}]],
  [BuyerWalkthroughService, 'createIssue', [{}]],
  [BuyerWalkthroughService, 'updateIssue', [ID, {}]],
  [BuyerWalkthroughService, 'complete', [{}]],
  [BuyerClosingDisclosureService, 'createRevision', [{}]],
  [BuyerClosingDisclosureService, 'updateDraft', [ID, {}]],
  [BuyerClosingDisclosureService, 'confirm', [ID, {}]],
  [BuyerClosingDisclosureService, 'updateFundsReadiness', [{}]],
  [BuyerClosingDayService, 'update', [{}]],
  [BuyerClosingDayService, 'confirmProfessionalClose', [{}]],
];

async function outcome(promise) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve('TIMEOUT'), 4000); });
  try {
    const value = await Promise.race([promise.then(() => 'RESOLVED'), timeout]);
    return value;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timer);
  }
}

test('every mutating homeBuyerTask service method refuses a viewer before touching the database', async () => {
  const noFloor = [];
  for (const [service, method, args] of MUTATIONS) {
    assert.equal(typeof service[method], 'function', `${service.name}.${method} exists`);
    const result = await outcome(Promise.resolve().then(() => service[method](U, P, ...args)));
    if (!/not found|access denied|does not have access|requires/i.test(result)) noFloor.push(`${service.name}.${method}: ${result.slice(0, 80)}`);
  }
  assert.deepEqual(noFloor, [], 'these methods did not refuse a viewer at the access step');
});
