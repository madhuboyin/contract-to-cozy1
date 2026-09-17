const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// B01/B10 fixes (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md).
// buyerJourneyStageLabel is pure, extracted for direct unit testing, same
// convention as formatUnavailableHomeActionProducers/parseBuyerDeadlineLaneFilter.
// The suggestion-suppression logic in buyerPlanStatusResult/
// buyerCostReadinessResult itself is not independently testable here (it
// composes loadBuyerPlanContext, DB-dependent) -- same STATIC-verification
// boundary applied throughout this audit series.
const { buyerJourneyStageLabel } = require('../../src/services/ask/askOrchestrator.service.ts');

test('every declared BuyerJourneyStage value gets its own explicit, homeowner-facing label', () => {
  const expected = {
    EXPLORING: 'Exploring',
    OFFER_CONTRACT: 'Contract',
    DUE_DILIGENCE: 'Due Diligence',
    CLOSING_PREP: 'Closing Preparation',
    CLOSED: 'Closed',
    MOVE_IN: 'Move-In',
    FIRST_30_DAYS: 'First 30 Days',
    DAYS_31_TO_90: 'Days 31-90',
    HANDED_OFF: 'Handed Off',
  };
  for (const [stage, label] of Object.entries(expected)) {
    assert.equal(buyerJourneyStageLabel(stage), label, `stage ${stage}`);
  }
});

test('an unrecognized stage value falls back to a humanized version of the raw enum rather than throwing or returning nothing', () => {
  assert.equal(buyerJourneyStageLabel('SOME_FUTURE_STAGE'), 'SOME FUTURE STAGE');
});
