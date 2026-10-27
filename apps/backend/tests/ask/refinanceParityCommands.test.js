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

// ───────────────────────────── OFFER_SELECTED, link removal, missed window ─────────────────────────────

const { resolveDecisionLinks } = require('../../src/refinanceRadar/refinanceDecision.service.ts');
const { recordRefinanceDecisionSchema } = require('../../src/refinanceRadar/validators/refinanceRadar.validators.ts');
const { refinanceMissedWindowBlock } = require('../../src/services/ask/handlers/refinance.handler.ts');

test('OFFER_SELECTED is a form choice and needs both the comparison and the offer', () => {
  assert.equal(handler.fieldsFor('RECORD_DECISION').find((f) => f.key === 'status').inputSchema.options.some((o) => o.value === 'OFFER_SELECTED'), true);
  assert.equal(refinanceDecisionAnswerSchema.safeParse({ status: 'OFFER_SELECTED', loanEstimateComparisonId: 'cmp-1', selectedOfferId: 'a-1' }).success, true);
  assert.equal(refinanceDecisionAnswerSchema.safeParse({ status: 'OFFER_SELECTED', loanEstimateComparisonId: 'cmp-1' }).success, false);
  assert.equal(refinanceDecisionAnswerSchema.safeParse({ status: 'OFFER_SELECTED' }).success, false);
  assert.equal(refinanceDecisionAnswerSchema.safeParse({ status: 'OFFER_SELECTED', loanEstimateComparisonId: 'NONE', selectedOfferId: 'a-1' }).success, false, 'removing the comparison cannot also select an offer');
});

test('the "no link" choice is kept through validation as a removal; blank still means unchanged', () => {
  const removed = refinanceDecisionAnswerSchema.safeParse({ status: 'EXPLORING', scenarioSnapshotId: 'NONE', loanEstimateComparisonId: 'NONE', selectedOfferId: 'NONE' });
  assert.equal(removed.success, true);
  assert.deepEqual([removed.data.scenarioSnapshotId, removed.data.loanEstimateComparisonId, removed.data.selectedOfferId], [null, null, null]);
  const options = handler.fieldsFor('RECORD_DECISION', { scenarios: [{ value: 'sc-1', label: 'S' }], comparisons: [{ value: 'cmp-1', label: 'C', offerIds: ['a-1'] }], offers: [{ value: 'a-1', label: 'A', comparisonId: 'cmp-1' }] });
  for (const key of ['scenarioSnapshotId', 'loanEstimateComparisonId', 'selectedOfferId']) {
    assert.equal(options.find((f) => f.key === key).inputSchema.options.some((o) => o.value === 'NONE'), true, key);
  }
});

test('the confirmation says which links are removed, kept as saved, or dropped with their comparison', () => {
  const links = { scenarios: [{ value: 'sc-1', label: 'Scenario one' }], comparisons: [{ value: 'cmp-1', label: 'October', offerIds: ['a-1'] }, { value: 'cmp-2', label: 'November', offerIds: ['c-1'] }], offers: [{ value: 'a-1', label: 'Lender A', comparisonId: 'cmp-1' }, { value: 'c-1', label: 'Lender C', comparisonId: 'cmp-2' }] };
  const saved = { scenarioSnapshotId: 'sc-1', loanEstimateComparisonId: 'cmp-1', selectedOfferId: 'a-1' };
  const by = (fields) => Object.fromEntries(fields.map((f) => [f.label, f.value]));
  const cleared = by(handler.decisionConfirmationFields({ status: 'EXPLORING', scenarioSnapshotId: 'NONE', loanEstimateComparisonId: 'NONE' }, links, saved));
  assert.equal(cleared['Saved scenario'], 'Removed');
  assert.equal(cleared['Loan Estimate comparison'], 'Removed');
  assert.match(cleared.Offer, /Removed/);
  const kept = by(handler.decisionConfirmationFields({ status: 'PROCEEDING' }, links, saved));
  assert.match(kept['Saved scenario'], /kept as saved/);
  assert.match(kept.Offer, /Lender A.*kept as saved/);
  const moved = by(handler.decisionConfirmationFields({ status: 'PROCEEDING', loanEstimateComparisonId: 'cmp-2' }, links, saved));
  assert.match(moved.Offer, /earlier comparison/);
});

test('the canonical decision patch distinguishes unchanged, link, and remove', () => {
  const current = { scenarioSnapshotId: 'sc-1', loanEstimateComparisonId: 'cmp-1', selectedOfferId: 'a-1' };
  assert.deepEqual(resolveDecisionLinks(current, {}), current);
  assert.deepEqual(resolveDecisionLinks(current, { scenarioSnapshotId: null }), { ...current, scenarioSnapshotId: null });
  assert.deepEqual(resolveDecisionLinks(current, { loanEstimateComparisonId: null }), { scenarioSnapshotId: 'sc-1', loanEstimateComparisonId: null, selectedOfferId: null }, 'removing the comparison removes its offer');
  assert.equal(resolveDecisionLinks(current, { loanEstimateComparisonId: 'cmp-2' }).selectedOfferId, null, 'a different comparison drops the old offer');
  assert.equal(resolveDecisionLinks(current, { loanEstimateComparisonId: 'cmp-2', selectedOfferId: 'c-1' }).selectedOfferId, 'c-1');
  assert.equal(resolveDecisionLinks(current, { loanEstimateComparisonId: 'cmp-1' }).selectedOfferId, 'a-1', 'the same comparison keeps its offer');
  assert.deepEqual(resolveDecisionLinks(null, {}), { scenarioSnapshotId: null, loanEstimateComparisonId: null, selectedOfferId: null });
  const uuid = '11111111-1111-4111-8111-111111111111';
  assert.equal(recordRefinanceDecisionSchema.safeParse({ status: 'EXPLORING', clientMutationId: 'abcdefgh1', scenarioSnapshotId: null }).success, true);
  assert.equal(recordRefinanceDecisionSchema.safeParse({ status: 'PROCEEDING', clientMutationId: 'abcdefgh1', loanEstimateComparisonId: null, selectedOfferId: 'a-1' }).success, false);
  assert.equal(recordRefinanceDecisionSchema.safeParse({ status: 'OFFER_SELECTED', clientMutationId: 'abcdefgh1', loanEstimateComparisonId: uuid, selectedOfferId: 'a-1' }).success, true);
});

test('the missed-window card carries the summary, best rate, date and peak savings, and is absent when there was no missed window', () => {
  assert.equal(refinanceMissedWindowBlock(null), null);
  assert.equal(refinanceMissedWindowBlock({ hasMissedOpportunity: false, summary: 'x', bestHistoricalRate30yr: null, bestHistoricalDate: null, bestMonthlySavingsAtPeak: null }), null);
  const block = refinanceMissedWindowBlock({ hasMissedOpportunity: true, summary: 'Rates were lower in March.', bestHistoricalRate30yr: 5.9, bestHistoricalDate: '2026-03-12', bestMonthlySavingsAtPeak: 240 });
  assert.equal(block.type, 'SUMMARY');
  assert.match(block.body, /Rates were lower in March\./);
  assert.match(block.body, /5\.900%/);
  assert.match(block.body, /2026-03-12/);
  assert.match(block.body, /\$240/);
});

// ───────────────────────────── lender discussion brief (a read; three acknowledgements) ─────────────────────────────

const briefSupport = require('../../src/services/ask/support/refinanceCommand.ts');
const refinanceReads = require('../../src/services/ask/handlers/refinance.handler.ts');
const { RefinanceRadarService } = require('../../src/refinanceRadar/refinanceRadar.service.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');

test('the lender brief is not a command: it needs the offer and each of the three acknowledgements, separately', () => {
  assert.equal(refinanceKindFromAction('refinance-lender-brief'), null, 'not routed through the contributor-only command');
  const all = { selectedOfferId: 'a-1', figuresVerified: true, sameLoanRequestConfirmed: true, manualSharingUnderstood: true };
  assert.equal(briefSupport.refinanceLenderBriefAnswerSchema.safeParse(all).success, true);
  for (const key of ['figuresVerified', 'sameLoanRequestConfirmed', 'manualSharingUnderstood']) {
    assert.equal(briefSupport.refinanceLenderBriefAnswerSchema.safeParse({ ...all, [key]: false }).success, false, key);
    const { [key]: _omitted, ...rest } = all;
    assert.equal(briefSupport.refinanceLenderBriefAnswerSchema.safeParse(rest).success, false, `${key} missing`);
  }
  assert.equal(briefSupport.refinanceLenderBriefAnswerSchema.safeParse({ ...all, selectedOfferId: '' }).success, false);
});

test('the brief form states where it goes; the brief is shown only after all acknowledgements, with an Ask-attributed analytics event, for any role', async () => {
  const restore = withSavedRecords();
  const analytics = require('../../src/services/analytics');
  const events = [];
  const savedTrack = analytics.analyticsEmitter.track;
  analytics.analyticsEmitter.track = (event) => { events.push(event); };
  const savedProp = prisma.property;
  prisma.property = { findUnique: async () => ({ address: '1 Main St', city: 'Austin', state: 'TX', zipCode: '78701' }) };
  try {
    const form = await refinanceReads.refinanceLenderBriefStart('prop-1', 'cmp-1');
    assert.equal(form.status, 'NEEDS_CONTEXT');
    const capture = form.captureRequests[0];
    assert.equal(capture.captureKey, 'REFINANCE_LENDER_BRIEF_INPUTS');
    assert.match(capture.destinationLabel, /Shown only in this conversation/);
    assert.doesNotMatch(capture.destinationLabel, /Saved to the canonical/);
    assert.deepEqual(capture.inputSchema.fields.map((f) => f.key), ['selectedOfferId', 'figuresVerified', 'sameLoanRequestConfirmed', 'manualSharingUnderstood']);
    assert.deepEqual(capture.inputSchema.fields[0].inputSchema.options.map((o) => o.label), ['Lender A', 'Lender B']);
    assert.equal(form.parameters.refinanceBriefLaunch.comparisonId, 'cmp-1');
    assert.equal((await refinanceReads.refinanceLenderBriefStart('prop-1', 'cmp-other')).status, 'NOT_APPLICABLE');

    const answer = { selectedOfferId: 'a-1', figuresVerified: true, sameLoanRequestConfirmed: true, manualSharingUnderstood: true };
    for (const bad of [{ ...answer, manualSharingUnderstood: false }, { ...answer, selectedOfferId: 'z-9' }]) {
      const again = await refinanceReads.refinanceLenderBriefResult('viewer-1', 'prop-1', 'cmp-1', bad);
      assert.equal(again.status, 'NEEDS_CONTEXT');
      assert.equal(JSON.stringify(again).includes('Lender discussion brief: '), false);
    }
    assert.equal(events.length, 0, 'no event before the brief is shown');

    const done = await refinanceReads.refinanceLenderBriefResult('viewer-1', 'prop-1', 'cmp-1', answer);
    assert.equal(done.status, 'ANSWERED');
    assert.match(JSON.stringify(done.blocks), /Lender discussion brief: Lender A/);
    for (const block of done.blocks) assert.equal(AskPresentationBlockSchema.safeParse(block).success, true, block.id);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventName, 'refinance_loan_estimate_handoff_package_exported');
    assert.equal(events[0].metadataJson.acknowledgementVersion, '2026-07-25');
    assert.equal(events[0].metadataJson.externallyTransmitted, false);
    assert.equal(events[0].metadataJson.surface, 'ASK');
    assert.equal(events[0].metadataJson.selectedOfferPosition, 1);
  } finally { analytics.analyticsEmitter.track = savedTrack; prisma.property = savedProp; restore(); }
});

test('the lender brief action is allowlisted on the read operation, not on the command', () => {
  const src = require('node:fs').readFileSync(require.resolve('../../src/services/ask/askAnswerTrustPolicy.ts'), 'utf8');
  const commandList = src.slice(src.indexOf("'refinance-save-scenario'"), src.indexOf("'refinance-save-scenario'") + 260);
  assert.equal(commandList.includes('refinance-lender-brief'), false);
  assert.equal(src.includes("'refinance-lender-brief'"), true);
});

// ───────────────────────────── saved scenario rerun uses every saved assumption ─────────────────────────────

test('rerunning a saved scenario reconstructs credit band, objective, costs, escrow, penalty, principal, recast and cash-out', async () => {
  const saved = prisma.refinanceScenarioSnapshot;
  const calls = [];
  const original = RefinanceRadarService.prototype.runScenario;
  RefinanceRadarService.prototype.runScenario = async function (propertyId, input) { calls.push(input); return { ok: true }; };
  const row = (metadataJson, over = {}) => ({ id: 'sc-1', propertyId: 'prop-1', targetRate: 5.25, targetTerm: 'FIFTEEN_YEAR', closingCost: dec(7200), isSaved: true, metadataJson, ...over });
  try {
    const service = new RefinanceRadarService();
    prisma.refinanceScenarioSnapshot = { findFirst: async () => row({
      closingCostSource: 'PROVIDED_AMOUNT', closingCostPctUsed: 0.02, discountPoints: 0.5, additionalFeesUsd: 300, lenderCreditsUsd: 500,
      costBreakdown: { baseClosingCostsUsd: 6000, discountPoints: 0.5, discountPointsUsd: 1500, additionalFeesUsd: 300, lenderCreditsUsd: 500, grossClosingCostsUsd: 7800, netClosingCostsUsd: 7300 },
      escrowFundingUsd: 1200, prepaymentPenaltyUsd: 900, extraPrincipalUsd: 20000, recastPrincipalUsd: 15000, recastFeeUsd: 250, cashOutAmountUsd: 30000, borrowerCreditBand: 'EXCELLENT', objective: 'LOWER_TOTAL_COST',
    }) };
    await service.rerunSavedScenario('prop-1', 'sc-1', 'ctx-9');
    assert.deepEqual(calls[0], {
      targetRate: 5.25, targetTerm: 'FIFTEEN_YEAR', closingCostAmount: 6000, discountPoints: 0.5, additionalFeesAmount: 300, lenderCreditsAmount: 500,
      escrowFundingAmount: 1200, prepaymentPenaltyAmount: 900, extraPrincipalAmount: 20000, recastPrincipalAmount: 15000, recastFeeAmount: 250, cashOutAmount: 30000,
      borrowerCreditBand: 'EXCELLENT', objective: 'LOWER_TOTAL_COST', saveScenario: false, propertyContextVersion: 'ctx-9',
    });
    // a percentage stays a percentage, the default stays the default, and a scenario saved before these fields existed still reruns
    prisma.refinanceScenarioSnapshot = { findFirst: async () => row({ closingCostSource: 'PROVIDED_PCT', closingCostPctUsed: 0.03, borrowerCreditBand: 'GOOD' }) };
    await service.rerunSavedScenario('prop-1', 'sc-1', 'ctx-9');
    assert.equal(calls[1].closingCostPercent, 0.03); assert.equal(calls[1].closingCostAmount, undefined); assert.equal(calls[1].borrowerCreditBand, 'GOOD'); assert.equal(calls[1].objective, 'BALANCED');
    prisma.refinanceScenarioSnapshot = { findFirst: async () => row({ closingCostSource: 'DEFAULT_2_5_PCT' }) };
    await service.rerunSavedScenario('prop-1', 'sc-1', 'ctx-9');
    assert.equal(calls[2].closingCostAmount, undefined); assert.equal(calls[2].closingCostPercent, undefined);
    prisma.refinanceScenarioSnapshot = { findFirst: async () => row(null) };
    await service.rerunSavedScenario('prop-1', 'sc-1', 'ctx-9');
    assert.equal(calls[3].closingCostAmount, 7200); assert.equal(calls[3].borrowerCreditBand, 'UNKNOWN');
    prisma.refinanceScenarioSnapshot = { findFirst: async () => null };
    assert.equal(await service.rerunSavedScenario('prop-1', 'other', 'ctx-9'), null);
  } finally { prisma.refinanceScenarioSnapshot = saved; RefinanceRadarService.prototype.runScenario = original; }
});
