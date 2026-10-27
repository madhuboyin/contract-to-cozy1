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

// ───────────────────────────── lender discussion brief (three acknowledgements) ─────────────────────────────

test('the lender brief needs the selected offer and each of the three acknowledgements, separately', () => {
  assert.equal(refinanceKindFromAction('refinance-lender-brief'), 'LENDER_BRIEF');
  assert.equal(refinanceFormKindFromCaptureKey('REFINANCE_LENDER_BRIEF_INPUTS'), 'LENDER_BRIEF');
  const all = { selectedOfferId: 'a-1', figuresVerified: true, sameLoanRequestConfirmed: true, manualSharingUnderstood: true };
  assert.equal(handler.parseRefinanceCommandAnswer('LENDER_BRIEF', all).success, true);
  for (const key of ['figuresVerified', 'sameLoanRequestConfirmed', 'manualSharingUnderstood']) {
    assert.equal(handler.parseRefinanceCommandAnswer('LENDER_BRIEF', { ...all, [key]: false }).success, false, key);
    const { [key]: _omitted, ...rest } = all;
    assert.equal(handler.parseRefinanceCommandAnswer('LENDER_BRIEF', rest).success, false, `${key} missing`);
  }
  assert.equal(handler.parseRefinanceCommandAnswer('LENDER_BRIEF', { ...all, selectedOfferId: '' }).success, false);
  const fields = handler.fieldsFor('LENDER_BRIEF', { scenarios: [], comparisons: [], offers: [{ value: 'a-1', label: 'Lender A', comparisonId: 'cmp-1' }] });
  assert.deepEqual(fields.map((f) => f.key), ['selectedOfferId', 'figuresVerified', 'sameLoanRequestConfirmed', 'manualSharingUnderstood']);
  assert.equal(fields.every((f) => f.required), true);
});

test('the lender brief is shown only after the confirmation, from the saved comparison, with the selected lender', async () => {
  const restore = withSavedRecords();
  const propertyAccess = require('../../src/services/propertyAccess.service.ts');
  const financial = require('../../src/services/financialContext/context.ts');
  const prefs = require('../../src/refinanceRadar/refinanceAlertPreference.service.ts');
  const decisions = require('../../src/refinanceRadar/refinanceDecision.service.ts');
  const { RefinanceRadarService } = require('../../src/refinanceRadar/refinanceRadar.service.ts');
  const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
  const saved = { a: propertyAccess.resolvePropertyAccess, f: financial.getFinancialContextDecisions, p: prefs.getRefinanceAlertPreference, d: decisions.getCurrentRefinanceDecision, s: RefinanceRadarService.prototype.getSavedScenarios, prop: prisma.property };
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'CONTRIBUTOR', userId: 'u1', propertyId: 'prop-1' });
  financial.getFinancialContextDecisions = async () => ({ contextVersion: 'ctx-1' });
  prefs.getRefinanceAlertPreference = async () => null;
  decisions.getCurrentRefinanceDecision = async () => null;
  RefinanceRadarService.prototype.getSavedScenarios = async () => [];
  prisma.property = { findUnique: async () => ({ address: '1 Main St', city: 'Austin', state: 'TX', zipCode: '78701' }) };
  try {
    const form = await handler.refinanceCommandResult('u1', 'prop-1', 'LENDER_BRIEF', 'cmp-1', 'Prepare a lender discussion brief.');
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.deepEqual(form.captureRequests[0].inputSchema.fields.find((f) => f.key === 'selectedOfferId').inputSchema.options.map((o) => o.label), ['Lender A', 'Lender B']);
    assert.equal(JSON.stringify(form).includes('Lender discussion brief:'), false, 'no brief before the acknowledgements');
    const answer = { selectedOfferId: 'a-1', figuresVerified: true, sameLoanRequestConfirmed: true, manualSharingUnderstood: true };
    const refused = await handler.refinanceCommandResult('u1', 'prop-1', 'LENDER_BRIEF', 'cmp-1', 'x', { ...answer, manualSharingUnderstood: false });
    assert.equal(refused.status, 'NOT_APPLICABLE');
    const wrongOffer = await handler.refinanceCommandResult('u1', 'prop-1', 'LENDER_BRIEF', 'cmp-1', 'x', { ...answer, selectedOfferId: 'z-9' });
    assert.equal(wrongOffer.status, 'NEEDS_CONTEXT');
    const review = await handler.refinanceCommandResult('u1', 'prop-1', 'LENDER_BRIEF', 'cmp-1', 'x', answer);
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.equal(review.confirmation.fields.filter((f) => f.label === 'You confirmed').length, 3);
    assert.equal(review.confirmation.fields[0].value, 'Lender A');
    const done = await confirmCapabilityInvoke('REFINANCE_COMMAND', { userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters: review.parameters, command: null });
    assert.equal(done.result.status, 'COMPLETED');
    const text = JSON.stringify(done.result.blocks);
    assert.match(text, /Lender discussion brief: Lender A/);
    assert.match(text, /Ask has not sent it to anyone/);
    const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
    for (const block of done.result.blocks) assert.equal(AskPresentationBlockSchema.safeParse(block).success, true, block.id);
  } finally {
    propertyAccess.resolvePropertyAccess = saved.a; financial.getFinancialContextDecisions = saved.f; prefs.getRefinanceAlertPreference = saved.p; decisions.getCurrentRefinanceDecision = saved.d; RefinanceRadarService.prototype.getSavedScenarios = saved.s; prisma.property = saved.prop; restore();
  }
});
