const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  REFINANCE_COMMAND_ACTIONS,
  refinanceAlertAnswerSchema,
  refinanceComparisonAnswerSchema,
  refinanceDecisionAnswerSchema,
  refinanceFormKindFromCaptureKey,
  refinanceKindFromAction,
} = require('../../src/services/ask/support/refinanceCommand.ts');
const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };
const { prisma } = require('../../src/lib/prisma.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { ASK_DOMAIN_COMMAND_REGISTRY } = require('../../src/services/ask/askDomainCommandRegistry.ts');

test('refinance parity actions resolve to one governed confirmed command', () => {
  for (const [kind, actionId] of Object.entries(REFINANCE_COMMAND_ACTIONS)) {
    assert.equal(refinanceKindFromAction(actionId), kind);
  }
  assert.equal(ASK_OPERATION_DEFINITIONS.REFINANCE_COMMAND.family, 'COMMAND');
  assert.equal(ASK_DOMAIN_COMMAND_REGISTRY.REFINANCE_COMMAND.adapterKey, 'refinance.command');
});

test('refinance parity forms validate alert settings and two reviewed offers', () => {
  assert.equal(refinanceFormKindFromCaptureKey('REFINANCE_ALERT_SETTINGS_INPUTS'), 'ALERT_SETTINGS');
  assert.equal(refinanceAlertAnswerSchema.safeParse({ emailEnabled: true, pushEnabled: false, cadence: 'IMMEDIATE', sensitivity: 'CONSERVATIVE', quietStart: '21:00', quietEnd: '07:00', timezone: 'America/New_York' }).success, true);
  const offer = (prefix, lender, rate) => ({ [`${prefix}Lender`]: lender, [`${prefix}Amount`]: 320000, [`${prefix}TermYears`]: 30, [`${prefix}LoanType`]: 'FIXED', [`${prefix}Rate`]: rate, [`${prefix}Apr`]: rate + 0.2, [`${prefix}MonthlyPI`]: 1850, [`${prefix}LoanCosts`]: 8000, [`${prefix}LenderCredits`]: 0, [`${prefix}CashToClose`]: 8000, [`${prefix}CashDirection`]: 'FROM_BORROWER' });
  assert.equal(refinanceComparisonAnswerSchema.safeParse({ label: 'Reviewed offers', ...offer('a', 'Lender A', 5.5), ...offer('b', 'Lender B', 5.625) }).success, true);
});

test('verified closing requires the new canonical mortgage facts', () => {
  assert.equal(refinanceDecisionAnswerSchema.safeParse({ status: 'CLOSED' }).success, false);
  assert.equal(refinanceDecisionAnswerSchema.safeParse({ status: 'CLOSED', currentMortgageBalanceUsd: 315000, interestRatePct: 5.5, remainingTermMonths: 360, monthlyPaymentUsd: 1788, closingCostUsd: 8250 }).success, true);
});

// ───────────────────────────── decision links (Desktop's saved scenario / comparison / offer) ─────────────────────────────

const handler = require('../../src/services/ask/handlers/refinanceCommands.handler.ts');
const OFFER = (id, lender) => ({ id, lenderName: lender, loanAmountUsd: 320000, loanTermYears: 30, loanType: 'FIXED', noteRatePct: 5.5, aprPct: 5.7, monthlyPrincipalAndInterestUsd: 1817, loanCostsUsd: 4200, lenderCreditsUsd: 0, cashToCloseUsd: 6000, cashToCloseDirection: 'FROM_BORROWER' });

const dec = (n) => ({ toNumber: () => n });
function withSavedRecords() {
  const saved = { scenario: prisma.refinanceScenarioSnapshot, comparison: prisma.refinanceLoanEstimateComparisonSnapshot };
  prisma.refinanceScenarioSnapshot = { findMany: async () => [{ id: 'sc-1', propertyId: 'prop-1', targetRate: 5.5, targetTerm: 'THIRTY_YEAR', closingCost: dec(6000), monthlySavings: dec(210), breakEvenMonths: 28, lifetimeSavings: dec(40000), isSaved: true, createdAt: new Date('2026-10-01T00:00:00Z'), metadataJson: null }] };
  prisma.refinanceLoanEstimateComparisonSnapshot = { findMany: async () => [{ id: 'cmp-1', propertyId: 'prop-1', label: 'October offers', offersJson: [OFFER('a-1', 'Lender A'), OFFER('b-1', 'Lender B')], createdAt: new Date('2026-10-05T00:00:00Z'), updatedAt: new Date('2026-10-05T00:00:00Z') }] };
  return () => { prisma.refinanceScenarioSnapshot = saved.scenario; prisma.refinanceLoanEstimateComparisonSnapshot = saved.comparison; };
}

test('a decision answer carries optional links; an offer needs its comparison; blanks are no link', () => {
  const ok = refinanceDecisionAnswerSchema.safeParse({ status: 'PROCEEDING', scenarioSnapshotId: 'sc-1', loanEstimateComparisonId: 'cmp-1', selectedOfferId: 'a-1' });
  assert.equal(ok.success, true);
  assert.deepEqual([ok.data.scenarioSnapshotId, ok.data.loanEstimateComparisonId, ok.data.selectedOfferId], ['sc-1', 'cmp-1', 'a-1']);
  const blank = refinanceDecisionAnswerSchema.safeParse({ status: 'EXPLORING', scenarioSnapshotId: '', loanEstimateComparisonId: '', selectedOfferId: '' });
  assert.equal(blank.success, true);
  assert.deepEqual([blank.data.scenarioSnapshotId, blank.data.loanEstimateComparisonId, blank.data.selectedOfferId], [undefined, undefined, undefined]);
  assert.equal(refinanceDecisionAnswerSchema.safeParse({ status: 'PROCEEDING', selectedOfferId: 'a-1' }).success, false, 'an offer without its comparison');
});

test('the decision form offers this home\'s saved scenarios, comparisons and offers by label, and omits a list that is empty', async () => {
  const restore = withSavedRecords();
  try {
    const links = await handler.loadDecisionLinkOptions('prop-1');
    assert.deepEqual(links.scenarios, [{ value: 'sc-1', label: '30-year at 5.500% (saved 2026-10-01)' }]);
    assert.deepEqual(links.comparisons.map((c) => [c.value, c.label, c.offerIds]), [['cmp-1', 'October offers', ['a-1', 'b-1']]]);
    assert.deepEqual(links.offers.map((o) => [o.value, o.label, o.comparisonId]), [['a-1', 'Lender A (October offers)', 'cmp-1'], ['b-1', 'Lender B (October offers)', 'cmp-1']]);
    const keys = (fields) => fields.map((f) => f.key);
    assert.deepEqual(keys(handler.fieldsFor('RECORD_DECISION', links)).slice(-3), ['scenarioSnapshotId', 'loanEstimateComparisonId', 'selectedOfferId']);
    assert.equal(keys(handler.fieldsFor('RECORD_DECISION', { scenarios: [], comparisons: [], offers: [] })).some((k) => /scenarioSnapshotId|loanEstimateComparisonId|selectedOfferId/.test(k)), false);
    assert.equal(keys(handler.fieldsFor('RECORD_DECISION')).includes('selectedOfferId'), false);
    assert.equal(JSON.stringify(handler.fieldsFor('RECORD_DECISION', links)).includes('Lender A'), true);
  } finally { restore(); }
});

test('a link to a record this home does not have, or an offer from another comparison, is refused before anything is saved', async () => {
  const restore = withSavedRecords();
  try {
    const links = await handler.loadDecisionLinkOptions('prop-1');
    assert.equal(handler.decisionLinksUnavailable({ scenarioSnapshotId: 'sc-1', loanEstimateComparisonId: 'cmp-1', selectedOfferId: 'b-1' }, links), false);
    assert.equal(handler.decisionLinksUnavailable({}, links), false);
    assert.equal(handler.decisionLinksUnavailable({ scenarioSnapshotId: 'sc-other-home' }, links), true);
    assert.equal(handler.decisionLinksUnavailable({ loanEstimateComparisonId: 'cmp-other' }, links), true);
    assert.equal(handler.decisionLinksUnavailable({ loanEstimateComparisonId: 'cmp-1', selectedOfferId: 'x-9' }, links), true);
    assert.equal(handler.decisionLinksUnavailable({ selectedOfferId: 'a-1' }, links), true, 'an offer with no comparison chosen');
  } finally { restore(); }
});
