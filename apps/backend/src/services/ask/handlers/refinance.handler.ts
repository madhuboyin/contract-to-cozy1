// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { planningHomeValueRequestResult } from '../support/planningHomeValueRequest';
import { HouseholdRole, RefinanceRateMonitorProduct, RefinanceScenarioTerm } from '@prisma/client';
import { logger } from '../../../lib/logger';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { getFinancialContextDecisions } from '../../financialContext/context';
import { getProfile } from '../../financing.service';
import { RefinanceRadarService } from '../../../refinanceRadar/refinanceRadar.service';
import { MortgageRateService } from '../../../refinanceRadar/engine/mortgageRate.service';
import { getRefinanceAlertPreference } from '../../../refinanceRadar/refinanceAlertPreference.service';
import { listRefinanceRateMonitors, type RefinanceRateMonitorDTO } from '../../../refinanceRadar/refinanceRateMonitor.service';
import { getCurrentRefinanceDecision } from '../../../refinanceRadar/refinanceDecision.service';
import { listSavedRefinanceLoanEstimateComparisons } from '../../../refinanceRadar/refinanceLoanEstimateSnapshot.service';
import { BreakEvenService, type BreakEvenDTO } from '../../breakEven.service';
import { money } from '../askFormatting';
import { BREAK_EVEN_WHAT_IF_LABELS, parseBreakEvenWhatIf, type BreakEvenWhatIf } from '../support/breakEvenWhatIf';
import { askContextFingerprint, durableFreeTextClarification, ensurePropertyAccess } from '../askHandlerSupport';
import { FINANCING_PROFILE_ACTION_ID, FINANCING_PROFILE_COMMAND_MESSAGE, FINANCING_PROFILE_ENTITY_TYPE } from '../support/financingProfileCommand';

const refinanceRadarService = new RefinanceRadarService();

const mortgageRateService = new MortgageRateService();

type RefinanceScenarioEdit = {
  targetRatePct: number | null;
  targetTerm: RefinanceScenarioTerm | null;
  closingCostAmount?: number;
  discountPoints?: number;
  additionalFeesAmount?: number;
  lenderCreditsAmount?: number;
  escrowFundingAmount?: number;
  prepaymentPenaltyAmount?: number;
  extraPrincipalAmount?: number;
  recastPrincipalAmount?: number;
  cashOutAmount?: number;
  borrowerCreditBand: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'LIMITED' | 'UNKNOWN';
  objective: 'BALANCED' | 'LOWER_PAYMENT' | 'FASTER_PAYOFF' | 'LOWER_TOTAL_COST';
};

function refinanceWorkflowAction(id: string, label: string, message: string, operationId = 'REFINANCE_ANALYSIS', style: 'PRIMARY' | 'SECONDARY' | 'QUIET' = 'SECONDARY') {
  return { id, label, interactionType: 'START_WORKFLOW' as const, message, operationId, style };
}

function refinanceNextActions(favorable: boolean, triggerRatePct: number | null) {
  const threshold = triggerRatePct == null ? 5.5 : Number(triggerRatePct.toFixed(3));
  return favorable
    ? [
        refinanceWorkflowAction('refinance-test-scenario', 'Test another scenario', 'What if I refinanced at 5.5% for 15 years with $6,000 closing costs?', 'REFINANCE_ANALYSIS', 'PRIMARY'),
        refinanceWorkflowAction('refinance-compare-offers', 'Compare Loan Estimates', 'Help me compare official Loan Estimates for this refinance.'),
        refinanceWorkflowAction('refinance-record-decision', 'Record my decision', 'Help me record what I plan to do about refinancing.'),
      ]
    : [
        refinanceWorkflowAction('refinance-test-scenario', 'Test another scenario', `What if I refinanced at ${threshold}% for 15 years with $6,000 closing costs?`, 'REFINANCE_ANALYSIS', 'PRIMARY'),
        refinanceWorkflowAction('refinance-start-monitor', 'Notify me at this rate', `Notify me when 30-year mortgage rates reach ${threshold}%.`, 'REFINANCE_RATE_MONITOR'),
        refinanceWorkflowAction('refinance-record-decision', 'Keep or revisit this decision', 'Help me record what I plan to do about refinancing.'),
      ];
}

export function refinanceJourneyIntent(message: string): 'COMPARE_OFFERS' | 'RECORD_DECISION' | 'RATE_HISTORY' | null {
  if (/\b(?:compare|review|upload|official)\b.*\b(?:loan estimates?|lender offers?|quotes?)\b/i.test(message)) return 'COMPARE_OFFERS';
  if (/\b(?:record|update|review|help me)\b.*\b(?:refinance )?(?:decision|plan|what i plan)\b/i.test(message)) return 'RECORD_DECISION';
  if (/\b(?:rate|market)\b.*\b(?:history|trend|movement|changed)\b/i.test(message)) return 'RATE_HISTORY';
  return null;
}

async function refinanceJourneyResult(propertyId: string, intent: NonNullable<ReturnType<typeof refinanceJourneyIntent>>): Promise<AskOperationResult> {
  if (intent === 'COMPARE_OFFERS') {
    const comparisons = await listSavedRefinanceLoanEstimateComparisons(propertyId);
    return {
      status: 'ANSWERED', reasonCode: 'REFINANCE_LOAN_ESTIMATES',
      blocks: [{
        type: 'SUMMARY', id: 'refinance-offers-summary', title: comparisons.length ? `${comparisons.length} saved Loan Estimate comparison${comparisons.length === 1 ? '' : 's'}` : 'No Loan Estimate comparison is saved yet',
        body: comparisons.length ? 'Your saved comparisons are listed below. Adding or reviewing Loan Estimates is not currently available in Ask. Ask keeps official lender terms separate from modeled scenarios.' : 'No Loan Estimate comparison is saved yet. Adding official lender disclosures to compare is not currently available in Ask.',
        tone: 'DEFAULT', actions: [],
      }, ...(comparisons.length ? [{
        type: 'TABLE' as const, id: 'refinance-saved-offers', title: 'Saved official-offer comparisons',
        columns: [{ key: 'label', label: 'Comparison' }, { key: 'offers', label: 'Lenders' }, { key: 'updated', label: 'Last updated' }],
        rows: comparisons.map((comparison) => ({ id: comparison.id, values: { label: comparison.label ?? 'Saved comparison', offers: comparison.offers.map((offer) => offer.lenderName).join(' · '), updated: comparison.updatedAt.slice(0, 10) } })), actions: [],
      }] : []), {
        type: 'BOUNDARY', id: 'refinance-offers-boundary', title: 'Official disclosures still require homeowner review',
        body: 'ContractToCozy compares the disclosures you review; it does not select, endorse, contact, or transmit information to a lender.', severity: 'INFO', suggestions: [],
      }], suggestions: [],
    };
  }
  if (intent === 'RECORD_DECISION') {
    const [decision, scenarios, comparisons] = await Promise.all([
      getCurrentRefinanceDecision(propertyId),
      refinanceRadarService.getSavedScenarios(propertyId),
      listSavedRefinanceLoanEstimateComparisons(propertyId),
    ]);
    return {
      status: 'ANSWERED', reasonCode: 'REFINANCE_DECISION_JOURNEY',
      blocks: [{
        type: 'SUMMARY', id: 'refinance-decision-summary', title: decision ? `Current refinance decision: ${decision.status.replace(/_/g, ' ').toLowerCase()}` : 'No refinance decision is recorded yet',
        body: decision ? `This decision was updated ${decision.updatedAt.slice(0, 10)}. ${scenarios.length} saved scenario${scenarios.length === 1 ? '' : 's'} and ${comparisons.length} saved offer comparison${comparisons.length === 1 ? '' : 's'} are available to support the next step.` : 'No refinance decision is recorded yet. Recording what you plan to do is not currently available in Ask.',
        tone: 'DEFAULT', actions: [],
      }, ...(decision?.history?.length ? [{
        type: 'TABLE' as const, id: 'refinance-decision-history', title: 'Decision history',
        columns: [{ key: 'date', label: 'Date' }, { key: 'from', label: 'From' }, { key: 'to', label: 'To' }],
        rows: decision.history.map((item: { id: string; occurredAt: string; fromStatus: string | null; toStatus: string }) => ({ id: item.id, values: { date: item.occurredAt.slice(0, 10), from: item.fromStatus?.replace(/_/g, ' ').toLowerCase() ?? 'Started', to: item.toStatus.replace(/_/g, ' ').toLowerCase() } })), actions: [],
      }] : []), {
        type: 'BOUNDARY', id: 'refinance-decision-boundary', title: 'A verified closing is consequential',
        body: 'Recording a closed refinance updates the canonical Financing Profile only after you review and confirm the new mortgage facts.', severity: 'INFO', suggestions: [],
      }], suggestions: [],
    };
  }
  const history = await refinanceRadarService.getRateHistory(propertyId, 12);
  return {
    status: 'ANSWERED', reasonCode: 'REFINANCE_RATE_HISTORY',
    blocks: [{
      type: 'SUMMARY', id: 'refinance-rate-history-summary', title: history.trendSummary.trendLabel,
      body: `Latest governed benchmarks: ${history.trendSummary.current30yr?.toFixed(3) ?? '—'}% for 30-year fixed and ${history.trendSummary.current15yr?.toFixed(3) ?? '—'}% for 15-year fixed.`, tone: 'DEFAULT', actions: [],
    }, {
      type: 'TABLE', id: 'refinance-rate-history', title: 'Recent governed mortgage-rate history',
      columns: [{ key: 'date', label: 'Date' }, { key: 'thirty', label: '30-year fixed' }, { key: 'fifteen', label: '15-year fixed' }, { key: 'source', label: 'Source' }],
      rows: history.snapshots.map((snapshot) => ({ id: snapshot.id, values: { date: snapshot.date, thirty: `${snapshot.rate30yr.toFixed(3)}%`, fifteen: `${snapshot.rate15yr.toFixed(3)}%`, source: snapshot.source } })), actions: [],
    }, {
      type: 'BOUNDARY', id: 'refinance-rate-history-boundary', title: 'National benchmark—not personalized pricing', body: 'These snapshots describe governed national benchmarks. Eligibility and available lender pricing depend on underwriting.', severity: 'INFO', suggestions: [],
    }], suggestions: [],
  };
}

export async function refinanceMonitorContextVersion(userId: string, propertyId: string): Promise<string> {
  const [preference, snapshot] = await Promise.all([getRefinanceAlertPreference(userId, propertyId), mortgageRateService.getLatestSnapshot()]);
  return askContextFingerprint({ preference, snapshotId: snapshot?.id ?? null, snapshotDate: snapshot?.date ?? null });
}

// Presentation Quality 2B: what a refinance scenario assumed, and whether each input is the homeowner's own figure or a default, so the
// strip's numbers are never read as a quote. Pure: it reads only the parsed edit and the values the engine was given.
export function refinanceScenarioAssumptions(input: {
  edit: RefinanceScenarioEdit; targetRatePct: number; termLabel: string; benchmarkDate: string; mortgageAsOf: string | null;
}): string[] {
  const { edit, targetRatePct, termLabel, benchmarkDate, mortgageAsOf } = input;
  const stated = (value: unknown) => value !== undefined && value !== null;
  const dollars = (label: string, value: number | null | undefined) => (value != null ? [`${label}: ${money(value)}, as you stated.`] : []);
  return [
    stated(edit.targetRatePct)
      ? `Target rate ${targetRatePct.toFixed(3)}%, the rate you gave. It is not a lender quote.`
      : `Target rate ${targetRatePct.toFixed(3)}%, the latest 30-year benchmark as of ${benchmarkDate}, because you gave none. It is not a lender quote.`,
    stated(edit.targetTerm) ? `Term ${termLabel}, as you stated.` : `Term ${termLabel}, assumed because you gave none.`,
    edit.closingCostAmount != null ? `Closing costs: ${money(edit.closingCostAmount)}, as you stated.` : 'Closing costs: the scenario engine\u2019s default planning assumption, because you gave none.',
    ...dollars('Additional fees', edit.additionalFeesAmount),
    ...dollars('Lender credits', edit.lenderCreditsAmount),
    ...dollars('Escrow funding', edit.escrowFundingAmount),
    ...dollars('Prepayment penalty', edit.prepaymentPenaltyAmount),
    ...dollars('Extra principal', edit.extraPrincipalAmount),
    ...dollars('Recast principal', edit.recastPrincipalAmount),
    ...dollars('Cash out', edit.cashOutAmount),
    ...(stated(edit.discountPoints) ? [`Discount points: ${edit.discountPoints}, as you stated.`] : []),
    `Your recorded mortgage balance, rate and remaining term are used as recorded${mortgageAsOf ? ` (as of ${mortgageAsOf.slice(0, 10)})` : ''}; asking this changed none of them.`,
  ];
}

// FRD ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md Phase 3 exit
// criterion / F02 fix (docs/architecture/ASK_COZY_PHASE3_PHASE7_FINANCIAL_ACCEPTANCE_VERIFICATION.md):
// REFINANCE_ANALYSIS previously had no way to edit a scenario assumption at
// all -- the handler took no `message` parameter, so nothing a homeowner
// typed could reach a what-if calculation, and the only writable input
// (captureRequests) is a canonical-fact write, not a revisable assumption.
// Gated on an explicit edit-intent framing ("what if"/"suppose"/"instead
// of"/"if i refinanced") PLUS a parseable rate or term, deliberately
// narrower than a bare number mention -- a homeowner asking "is refinancing
// worth it at 6%" is asking a question about THIS number being relevant,
// not necessarily requesting a recalculation, so an explicit hypothetical
// framing is required before this reinterprets the turn as an edit.
export function parseRefinanceScenarioEdit(message: string): RefinanceScenarioEdit | null {
  const isScenarioFraming = /\b(?:what if|suppose|hypothetically|instead of my (?:current|recorded) (?:rate|term|loan)|if i (?:refinanc(?:e|ed)?|got|get|took|take))\b/i.test(message);
  if (!isScenarioFraming) return null;
  const rateMatch = message.match(/(\d{1,2}(?:\.\d{1,3})?)\s*%/);
  const targetRatePct = rateMatch ? Number(rateMatch[1]) : null;
  const targetTerm = /\b(?:15|fifteen)[- ]?years?\b/i.test(message)
    ? RefinanceScenarioTerm.FIFTEEN_YEAR
    : /\b(?:20|twenty)[- ]?years?\b/i.test(message)
      ? RefinanceScenarioTerm.TWENTY_YEAR
      : /\b(?:30|thirty)[- ]?years?\b/i.test(message)
        ? RefinanceScenarioTerm.THIRTY_YEAR
        : null;
  if (targetRatePct == null && !targetTerm) return null;
  const amount = (patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) return Number(match[1].replace(/,/g, ''));
    }
    return undefined;
  };
  const objective = /lower (?:my )?(?:monthly )?payment/i.test(message)
    ? 'LOWER_PAYMENT'
    : /(?:pay off|payoff|faster payoff)/i.test(message)
      ? 'FASTER_PAYOFF'
      : /(?:lower|reduce) (?:the )?(?:total )?(?:cost|interest)/i.test(message)
        ? 'LOWER_TOTAL_COST'
        : 'BALANCED';
  const credit = message.match(/\b(excellent|good|fair|limited) credit\b/i)?.[1].toUpperCase() as RefinanceScenarioEdit['borrowerCreditBand'] | undefined;
  return {
    targetRatePct,
    targetTerm,
    closingCostAmount: amount([/\$([\d,]+(?:\.\d+)?)\s+(?:in\s+)?closing costs?/i, /closing costs?\s+(?:of\s+)?\$([\d,]+(?:\.\d+)?)/i]),
    discountPoints: amount([/([\d.]+)\s+(?:discount\s+)?points?\b/i]),
    additionalFeesAmount: amount([/\$([\d,]+(?:\.\d+)?)\s+(?:in\s+)?additional fees?/i]),
    lenderCreditsAmount: amount([/\$([\d,]+(?:\.\d+)?)\s+(?:in\s+)?lender credits?/i]),
    escrowFundingAmount: amount([/\$([\d,]+(?:\.\d+)?)\s+(?:for\s+)?escrow/i]),
    prepaymentPenaltyAmount: amount([/\$([\d,]+(?:\.\d+)?)\s+prepayment penalt(?:y|ies)/i]),
    extraPrincipalAmount: amount([/\$([\d,]+(?:\.\d+)?)\s+(?:of\s+)?extra principal/i]),
    recastPrincipalAmount: amount([/recast(?:ing)?\s+\$([\d,]+(?:\.\d+)?)/i]),
    cashOutAmount: amount([/\$([\d,]+(?:\.\d+)?)\s+cash[ -]?out/i, /cash[ -]?out(?: of)?\s+\$([\d,]+(?:\.\d+)?)/i]),
    borrowerCreditBand: credit ?? 'UNKNOWN',
    objective,
  };
}

// Mortgage-refinance-radar capability-card slice (FRD v1.45). The MONITOR block both the monitor confirmation and the
// refinance analysis show. MonitorBlock renders its own Pause / Resume / Stop (PATCH /api/ask/monitors/:id), so the
// block carries only the delivery-settings link. The earlier "Pause" and "Stop" links added ?monitorAction=, which no
// page reads, and "Edit settings" pointed at ?section=alerts, which the radar page does not read either; the radar page
// has no monitor controls, only the alert delivery preferences in its settings section.
export function refinanceMonitorBlock(monitor: RefinanceRateMonitorDTO, title: string): AskPresentationBlock {
  return {
    type: 'MONITOR', id: `rate-monitor-${monitor.id}`, monitorId: monitor.id,
    title, status: monitor.status,
    threshold: `${monitor.thresholdPct.toFixed(3)}% or lower`,
    product: monitor.product === 'FIXED_15_YEAR' ? '15-year fixed national benchmark' : '30-year fixed national benchmark',
    channel: 'Email plus in-app', cadence: monitor.cadence,
    quietHours: monitor.quietStart && monitor.quietEnd ? `${monitor.quietStart}–${monitor.quietEnd} (${monitor.timezone})` : null,
    sourceBoundary: 'Evaluates governed national benchmark snapshots; this is not a personalized lender offer.',
    actions: [],
  };
}

// FRD v1.45: the refinance analysis also shows the homeowner's own ACTIVE or PAUSED rate monitors for this home, so
// they can be paused, resumed or stopped from Ask (and from the alert email, which continues into this analysis).
// Before this, a monitor was reachable only from the conversation that created it. A failed monitor read does not
// fail the analysis.
// Break-even capability-card slice (FRD v1.48): the first new operation for a capability the Appendix D audit found
// with no Ask operation. Reads BreakEvenService.compute, the same call the Break-Even page's route makes, for the
// 5- or 10-year horizon the page offers (default 10, as the service). The page's assumption overrides are not exposed.
const breakEvenService = new BreakEvenService();

export function breakEvenHorizonYears(message: string): 5 | 10 {
  return /\b(?:5|five)[- ]?years?\b/i.test(message) ? 5 : 10;
}

export function breakEvenAnalysisFromDto(dto: BreakEvenDTO, propertyId: string, options: { canEditFinancing?: boolean } = {}): AskOperationResult {
  const years = dto.input.years;
  const { breakEven, rollup, sensitivity, current } = dto;
  const yearLabel = (index: number | null) => index == null ? `Not within ${years} years` : `Year ${index}`;
  const reachedScenarios = (['conservative', 'base', 'optimistic'] as const).filter((key) => sensitivity[key].breakEvenYearIndex != null).length;
  const title = breakEven.status === 'ALREADY_BREAKEVEN'
    ? 'This home has already broken even'
    : breakEven.status === 'PROJECTED'
      ? `Projected to break even in ${breakEven.breakEvenCalendarYear} (year ${breakEven.breakEvenYearIndex} of ${years})`
      : `Not projected to break even within ${years} years`;
  const body = breakEven.status === 'NOT_REACHED'
    ? `Over ${years} years, projected ownership costs of ${money(rollup.cumulativeExpensesAtHorizon)} stay ahead of projected appreciation of ${money(rollup.cumulativeAppreciationAtHorizon)}, a net of ${money(rollup.netAtHorizon)}.`
    : `${breakEven.status === 'ALREADY_BREAKEVEN' ? 'Appreciation has outpaced cumulative ownership costs.' : 'Appreciation catches up with cumulative ownership costs.'} Over ${years} years the net is ${money(rollup.netAtHorizon)}.`;
  // The service's own disclosures, e.g. the labeled $350,000 fallback it uses when no purchase price is recorded.
  const notes = dto.meta.notes.filter((note) => note.trim());
  const limited = notes.length > 0 || dto.meta.confidence === 'LOW';
  const debtOn = current.debtMode === 'ON';
  const otherYears = years === 10 ? 5 : 10;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'break-even-summary', title, body: `${body} To test other assumptions, ask \u201Cwhat if appreciation is 5%?\u201D; nothing you try is saved.`,
    tone: breakEven.status === 'NOT_REACHED' ? 'CAUTION' : 'DEFAULT',
    chips: [
      { label: `${dto.meta.confidence.toLowerCase()} confidence`, tone: dto.meta.confidence === 'LOW' ? 'CAUTION' : 'DEFAULT' },
      { label: debtOn ? 'Mortgage included' : 'Mortgage not modeled', tone: debtOn ? 'DEFAULT' : 'CAUTION' },
      { label: `${years}-year horizon`, tone: 'DEFAULT' },
    ],
    actions: [],
  }, {
    type: 'METRIC_ROW', id: 'break-even-metrics', title: 'Key figures',
    metrics: [
      { label: 'Break-even', value: breakEven.status === 'ALREADY_BREAKEVEN' ? 'Already' : breakEven.breakEvenYearIndex == null ? 'Not reached' : `Year ${breakEven.breakEvenYearIndex}`, detail: breakEven.breakEvenCalendarYear ? String(breakEven.breakEvenCalendarYear) : null, tone: breakEven.status === 'NOT_REACHED' ? 'CAUTION' : 'POSITIVE' },
      { label: `Net at year ${years}`, value: money(rollup.netAtHorizon), tone: rollup.netAtHorizon >= 0 ? 'POSITIVE' : 'CAUTION' },
      { label: 'Home value', value: money(current.homeValueNow), tone: 'DEFAULT' },
      { label: 'Annual expenses', value: money(current.annualExpensesNow), tone: 'DEFAULT' },
      { label: `Costs, ${years} years`, value: money(rollup.cumulativeExpensesAtHorizon), tone: 'DEFAULT' },
      { label: `Appreciation, ${years} years`, value: money(rollup.cumulativeAppreciationAtHorizon), tone: 'DEFAULT' },
    ],
  }, {
    type: 'TREND_CHART', id: 'break-even-chart', title: 'Cost vs appreciation',
    description: 'Cumulative ownership costs against cumulative projected appreciation.',
    basis: `Planning projection over ${years} years; ${debtOn ? 'mortgage interest counts as a cost and principal paydown as gain' : 'mortgage costs are not included'}.`,
    valueFormat: 'CURRENCY',
    categories: dto.projection.map((row) => String(row.year)),
    series: [
      { id: 'costs', label: 'Cumulative costs', style: 'SOLID', tone: 'CAUTION', values: dto.projection.map((row) => row.cumulativeExpenses) },
      { id: 'appreciation', label: 'Cumulative appreciation', style: 'DASHED', tone: 'POSITIVE', values: dto.projection.map((row) => row.cumulativeAppreciationGain) },
    ],
    markers: breakEven.breakEvenYearIndex != null && breakEven.breakEvenYearIndex >= 1 && breakEven.breakEvenYearIndex <= dto.projection.length
      ? [{ id: 'break-even', label: `Break-even, year ${breakEven.breakEvenYearIndex}`, categoryIndex: breakEven.breakEvenYearIndex - 1 }] : [],
    actions: [
      { id: `rerun-break-even-${otherYears}`, label: `Show ${otherYears}-year horizon`, interactionType: 'START_WORKFLOW' as const, message: `Show my home break-even analysis for a ${otherYears}-year horizon.`, operationId: 'BREAK_EVEN_ANALYSIS', style: 'SECONDARY' as const },
    ],
  }];
  if (notes.length) {
    blocks.push({ type: 'LIMITATION', id: 'break-even-limitations', title: 'What this projection is missing', body: notes.join('\n'), severity: 'CAUTION' });
  }
  blocks.push({
    type: 'TABLE', id: 'break-even-sensitivity', title: 'Break-even range',
    description: reachedScenarios === 3 ? `All three scenarios reach break-even within ${years} years.` : reachedScenarios === 0 ? `No scenario reaches break-even within ${years} years.` : `${reachedScenarios} of 3 scenarios reach break-even within ${years} years.`,
    columns: [{ key: 'scenario', label: 'Scenario' }, { key: 'breakEven', label: 'Breaks even' }, { key: 'net', label: `Net at year ${years}` }],
    rows: (['conservative', 'base', 'optimistic'] as const).map((key) => ({
      id: `break-even-${key}`,
      values: { scenario: key.charAt(0).toUpperCase() + key.slice(1), breakEven: yearLabel(sensitivity[key].breakEvenYearIndex), net: money(sensitivity[key].netAtHorizon) },
    })),
    actions: [],
  });
  if (dto.drivers.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'break-even-drivers', title: 'What matters most',
      listDensity: 'DENSE',
      sections: [{ id: 'drivers', title: 'Drivers', count: dto.drivers.length, items: dto.drivers.map((driver, index) => ({
        id: `break-even-driver-${index + 1}`, title: driver.factor, description: driver.explanation, meta: [], status: `${driver.impact} impact`, href: null,
        tone: driver.impact === 'HIGH' ? 'CAUTION' as const : 'DEFAULT' as const,
      })) }],
      actions: [],
    });
  }
  const overridden = (key: string) => dto.input.overrides[key] !== undefined;
  const rate = current.mortgageAnnualRate;
  blocks.push({
    type: 'TABLE', id: 'break-even-assumptions', title: 'Assumptions and confidence',
    columns: [{ key: 'input', label: 'Input' }, { key: 'value', label: 'Used' }, { key: 'source', label: 'Source' }],
    rows: [
      { id: 'home-value', values: { input: 'Home value', value: money(current.homeValueNow), source: overridden('homeValueNow') ? 'Used from this request' : 'Recorded value or planning estimate' } },
      { id: 'appreciation', values: { input: 'Appreciation', value: `${(current.appreciationRate * 100).toFixed(1)}% / year`, source: overridden('appreciationRate') ? 'Used from this request' : dto.meta.appreciation ? `${dto.meta.appreciation.source === 'FHFA' ? 'FHFA price history' : 'Planning assumption'}, ${dto.meta.appreciation.regionLabel}` : 'Planning assumption' } },
      { id: 'expenses', values: { input: 'Annual ownership costs', value: money(current.annualExpensesNow), source: 'Ownership cost snapshot and forecast' } },
      { id: 'mortgage', values: { input: 'Mortgage', value: debtOn ? `${money(current.mortgageBalanceNow ?? 0)} balance${rate != null ? ` at ${(rate * 100).toFixed(1)}%` : ''}` : 'Not modeled', source: current.mortgageRateDisclosure ?? (debtOn ? 'Recorded financing profile' : 'No complete financing profile was available') } },
      { id: 'confidence', values: { input: 'Confidence', value: dto.meta.confidence.toLowerCase(), source: 'Completeness of the recorded inputs' } },
    ],
    actions: [],
  });
  const next = dto.nextAction;
  if (next) {
    const wantsFinancing = next.toolKey === 'sell-hold-rent' && !debtOn;
    const action = wantsFinancing
      ? (options.canEditFinancing ? {
        id: FINANCING_PROFILE_ACTION_ID, label: 'Update my mortgage and purchase details', interactionType: 'START_WORKFLOW' as const,
        message: FINANCING_PROFILE_COMMAND_MESSAGE, operationId: 'FINANCING_PROFILE_COMMAND' as const,
        entityType: FINANCING_PROFILE_ENTITY_TYPE, entityId: propertyId, style: 'PRIMARY' as const,
      } : null)
      : next.toolKey === 'sell-hold-rent'
        ? { id: 'break-even-next-sell-hold-rent', label: 'Compare sell, hold, or rent', interactionType: 'START_WORKFLOW' as const, message: `Compare selling, holding, and renting this home over ${years} years.`, operationId: 'SELL_HOLD_RENT_ANALYSIS' as const, style: 'PRIMARY' as const }
        : { id: 'break-even-next-capital-timeline', label: 'Plan capital events', interactionType: 'START_WORKFLOW' as const, message: 'How is my reserve fund doing?', operationId: 'CAPITAL_RESERVE_PLAN' as const, style: 'PRIMARY' as const };
    blocks.push({ type: 'SUMMARY', id: 'break-even-next-action', title: wantsFinancing ? 'Add mortgage details for debt-aware modeling' : next.label, body: next.reason, tone: 'DEFAULT', actions: action ? [action] : [] });
  }
  blocks.push({
    type: 'EVIDENCE', id: 'break-even-evidence', title: 'Sources used',
    items: dto.meta.dataSources.map((source) => ({ label: source, source: 'Break-Even', observedAt: dto.meta.generatedAt })),
  }, {
    type: 'BOUNDARY', id: 'break-even-boundary', title: 'Planning projection, not an appraisal or financial advice',
    body: 'Appreciation and cost growth are modeled assumptions. Actual value, taxes, insurance, maintenance and selling costs will differ; an appraisal or a professional can tell you what the home is worth today.',
    severity: 'INFO', suggestions: [],
  });
  return {
    status: limited ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: `BREAK_EVEN_${breakEven.status}`,
    contextVersion: dto.ownershipCostContext.calculationFingerprint,
    blocks,
    suggestions: [],
  };
}

// FRD v1.320: the page's editable assumptions. A hypothetical ("what if appreciation is 5%") is computed with those values for this answer only
// (`ephemeral`: the route would save each set as a reusable assumption set, Ask saves nothing) and shown beside the unchanged standard projection.
export function breakEvenWhatIfFromDtos(standard: BreakEvenDTO, scenario: BreakEvenDTO, overrides: BreakEvenWhatIf, propertyId: string): AskOperationResult {
  const result = breakEvenAnalysisFromDto(scenario, propertyId);
  // The horizon switch would re-run the standard projection and drop the hypothetical, so the what-if chart carries none.
  result.blocks = result.blocks.map((block) => block.type === 'TREND_CHART' ? { ...block, actions: [] } : block);
  const years = scenario.input.years;
  const when = (dto: BreakEvenDTO) => (dto.breakEven.status === 'ALREADY_BREAKEVEN' ? 'Already broken even'
    : dto.breakEven.breakEvenYearIndex == null ? `Not within ${years} years` : `Year ${dto.breakEven.breakEvenYearIndex} (${dto.breakEven.breakEvenCalendarYear})`);
  const percent = (value: number) => `${(value * 100).toFixed(value * 100 % 1 === 0 ? 0 : 1)}%`;
  const assumed = (Object.keys(overrides) as Array<keyof BreakEvenWhatIf>).map((key) => {
    const value = overrides[key] as number;
    return { id: `break-even-what-if-${key}`, values: { assumption: BREAK_EVEN_WHAT_IF_LABELS[key], value: key === 'homeValueNow' ? money(value) : percent(value) } };
  });
  const [summary, ...rest] = result.blocks;
  const blocks: AskPresentationBlock[] = [
    summary.type === 'SUMMARY' ? { ...summary, title: `What if: ${summary.title}`, actions: [] } : summary,
    {
      type: 'TABLE', id: 'break-even-what-if-assumptions', title: 'The assumptions you changed',
      description: 'Everything else is the standard projection. Nothing was saved, and your recorded assumptions are unchanged.',
      columns: [{ key: 'assumption', label: 'Assumption' }, { key: 'value', label: 'Used here' }], rows: assumed, actions: [],
    },
    {
      type: 'TABLE', id: 'break-even-what-if-comparison', title: 'Your what-if against the standard projection',
      columns: [{ key: 'measure', label: '' }, { key: 'standard', label: 'Standard' }, { key: 'whatIf', label: 'Your what-if' }],
      rows: [
        { id: 'break-even-what-if-when', values: { measure: 'Breaks even', standard: when(standard), whatIf: when(scenario) } },
        { id: 'break-even-what-if-net', values: { measure: `Net at year ${years}`, standard: money(standard.rollup.netAtHorizon), whatIf: money(scenario.rollup.netAtHorizon) } },
        { id: 'break-even-what-if-costs', values: { measure: 'Cumulative costs', standard: money(standard.rollup.cumulativeExpensesAtHorizon), whatIf: money(scenario.rollup.cumulativeExpensesAtHorizon) } },
        { id: 'break-even-what-if-appreciation', values: { measure: 'Cumulative appreciation', standard: money(standard.rollup.cumulativeAppreciationAtHorizon), whatIf: money(scenario.rollup.cumulativeAppreciationAtHorizon) } },
      ],
      actions: [],
    },
    ...rest.filter((block) => block.id !== 'break-even-limitations' || block.type !== 'LIMITATION' || !/persisted/i.test(block.body)),
  ];
  return { ...result, reasonCode: `BREAK_EVEN_WHAT_IF_${scenario.breakEven.status}`, blocks };
}

async function breakEvenAnalysisResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const years = breakEvenHorizonYears(message);
  const whatIf = parseBreakEvenWhatIf(message);
  if (whatIf) {
    const supplied = whatIf.homeValueNow;
    // With no value on record, the value the homeowner just gave also stands in for the comparison's "standard" side, so the rest of the what-if still compares.
    let standard = await breakEvenService.computeOutcome(propertyId, { years }, userId);
    if (standard.status === 'HOME_VALUE_REQUIRED' && supplied !== undefined) standard = await breakEvenService.computeOutcome(propertyId, { years, homeValueNow: supplied, ephemeral: true }, userId);
    const scenario = await breakEvenService.computeOutcome(propertyId, { years, ...whatIf, ephemeral: true }, userId);
    if (standard.status !== 'OK' || scenario.status !== 'OK') return planningHomeValueRequestResult('Break-even');
    return breakEvenWhatIfFromDtos(standard.value, scenario.value, whatIf, propertyId);
  }
  const outcome = await breakEvenService.computeOutcome(propertyId, { years }, userId);
  if (outcome.status !== 'OK') return planningHomeValueRequestResult('Break-even');
  const access = await ensurePropertyAccess(userId, propertyId);
  return breakEvenAnalysisFromDto(outcome.value, propertyId, { canEditFinancing: access.role === HouseholdRole.OWNER });
}

async function refinanceAnalysisWithMonitorsResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const result = await refinanceAnalysisResult(userId, propertyId, message);
  const monitors = await listRefinanceRateMonitors(userId, propertyId).catch((error) => {
    logger.warn({ err: error, propertyId }, '[ask] refinance monitor read failed; analysis returned without it');
    return [];
  });
  if (!monitors.length) return result;
  // A neutral title: MonitorBlock shows the live status and updates it after an inline pause / resume / stop.
  const monitorBlocks = monitors.map((monitor) => refinanceMonitorBlock(monitor, 'Your mortgage-rate monitor'));
  const boundaryIndex = result.blocks.findIndex((block) => block.type === 'BOUNDARY');
  const blocks = boundaryIndex < 0 ? [...result.blocks, ...monitorBlocks] : [...result.blocks.slice(0, boundaryIndex), ...monitorBlocks, ...result.blocks.slice(boundaryIndex)];
  return { ...result, blocks };
}

// IW-PRES-016 (FRD v1.87): the hypothetical rate and term next to the canonical comparison it was run against, as a
// two-option strip. Each option reads only its own source: the current option reads the canonical evaluation
// (`current`), never the hypothetical, and the scenario option reads only the recalculation (`scenario`), so the
// unchanged comparison stays exactly what the property reports. No badge, amount or leading mark: the two are
// different questions (the market benchmark against a rate the homeowner picked), not a ranking.
export function refinanceScenarioComparison(
  current: { currentRatePct: number; marketRatePct: number; monthlySavings: number; lifetimeSavings: number; breakEvenMonths: number | null },
  scenario: { monthlySavings: number; lifetimeSavings: number; closingCostUsd: number; breakEvenMonths: number | null },
  targetRatePct: number,
  termLabel: string,
): Extract<AskPresentationBlock, { type: 'COMPARISON' }> {
  const breakEven = (months: number | null) => (months == null ? 'Not reached' : `${months} months`);
  const attribute = (label: string, value: string) => ({ label, value, tone: 'DEFAULT' as const });
  return {
    type: 'COMPARISON', id: 'refinance-scenario-table', title: 'Illustrative scenario vs. your current loan',
    description: 'A hypothetical revision, not a lender quote or a saved plan. Your recorded mortgage facts are not changed by asking this, and the current comparison was not recalculated or saved.',
    options: [{
      id: 'current-comparison', label: 'Your current comparison (unchanged)', summary: 'The canonical comparison this scenario was run against',
      attributes: [
        attribute('Your recorded mortgage rate', `${current.currentRatePct.toFixed(3)}%`),
        attribute('Market benchmark rate', `${current.marketRatePct.toFixed(3)}%`),
        attribute('Modeled monthly savings', money(current.monthlySavings)),
        attribute('Modeled lifetime savings', money(current.lifetimeSavings)),
        attribute('Estimated break-even', breakEven(current.breakEvenMonths)),
      ],
      actions: [],
    }, {
      id: 'illustrative-scenario', label: 'Illustrative scenario', summary: `A hypothetical ${termLabel} loan at ${targetRatePct.toFixed(3)}%`,
      attributes: [
        attribute('Illustrative target rate', `${targetRatePct.toFixed(3)}%`),
        attribute('Illustrative target term', termLabel),
        attribute('Modeled monthly savings', money(scenario.monthlySavings)),
        attribute('Modeled lifetime savings', money(scenario.lifetimeSavings)),
        attribute('Modeled closing costs', money(scenario.closingCostUsd)),
        attribute('Estimated break-even', breakEven(scenario.breakEvenMonths)),
      ],
      actions: [],
    }],
    actions: [],
  };
}

// Presentation Quality 3C: the hypothetical-scenario answer as a pure builder (it was inline in refinanceAnalysisResult). It leads with
// the tradeoff the engine's own numbers show, then the engine's stated reason, then the disclaimer; the strip, details, assumptions,
// dated sources and boundary follow. Nothing here computes a number the scenario engine did not.
type RefinanceScenarioNumbers = {
  newMonthlyPayment: number; currentMonthlyPayment: number; monthlySavings: number; lifetimeSavings: number; closingCostUsd: number;
  breakEvenMonths: number | null; estimatedAprPct: number; cashToCloseUsd: number; totalInterestNewLoan: number;
  totalInterestRemainingCurrent: number; payoffDeltaMonths: number; recommendationExplanation: string; objective: string; recommendedTerm: string;
};

export function refinanceScenarioTradeoff(s: Pick<RefinanceScenarioNumbers, 'monthlySavings' | 'lifetimeSavings' | 'closingCostUsd' | 'breakEvenMonths'>, targetRatePct: number, termLabel: string): { title: string; lead: string } {
  const payment = s.monthlySavings > 0
    ? `lowers your modeled payment by ${money(s.monthlySavings)} a month`
    : s.monthlySavings < 0 ? `raises your modeled payment by ${money(Math.abs(s.monthlySavings))} a month` : 'leaves your modeled payment about the same';
  const recover = s.breakEvenMonths == null
    ? 'does not recover them within the modeled period'
    : `recovers them in about ${s.breakEvenMonths} month${s.breakEvenMonths === 1 ? '' : 's'}`;
  const lifetime = s.lifetimeSavings >= 0 ? `${money(s.lifetimeSavings)} less` : `${money(Math.abs(s.lifetimeSavings))} more`;
  return {
    title: `At ${targetRatePct.toFixed(3)}% for ${termLabel}, this scenario ${payment}`,
    lead: `It costs about ${money(s.closingCostUsd)} up front and ${recover}. Over the life of the loan the model shows ${lifetime} in interest after those costs.`,
  };
}

export function refinanceScenarioAnswer(input: {
  current: Parameters<typeof refinanceScenarioComparison>[0];
  scenario: RefinanceScenarioNumbers;
  scenarioEdit: RefinanceScenarioEdit;
  targetRatePct: number;
  termLabel: string;
  benchmark: { date: string; source: string; sourceRef: string | null };
  mortgageObservedAt: string | null;
  mortgageUpdatedAt: string;
  contextVersion: string;
}): AskOperationResult {
  const { current, scenario, scenarioEdit, targetRatePct, termLabel, benchmark } = input;
  const tradeoff = refinanceScenarioTradeoff(scenario, targetRatePct, termLabel);
  return {
    status: 'ANSWERED', contextVersion: input.contextVersion,
    blocks: [{
      type: 'SUMMARY', id: 'refinance-scenario-summary',
      title: tradeoff.title,
      body: `${tradeoff.lead} ${scenario.recommendationExplanation} This is a hypothetical recalculation only: nothing was saved, and your recorded mortgage rate and term are unchanged. Your current comparison is shown below, unchanged.`,
      tone: 'DEFAULT',
      actions: [
        refinanceWorkflowAction('refinance-adjust-scenario', 'Adjust this scenario', `What if I refinanced at ${targetRatePct}% for ${termLabel} with $6,000 closing costs?`, 'REFINANCE_ANALYSIS', 'PRIMARY'),
        refinanceWorkflowAction('refinance-compare-offers', 'Compare Loan Estimates', 'Help me compare official Loan Estimates for this refinance.'),
        refinanceWorkflowAction('refinance-record-decision', 'Record my decision', 'Help me record what I plan to do about refinancing.'),
      ],
    }, refinanceScenarioComparison(current, scenario, targetRatePct, termLabel), {
      type: 'TABLE', id: 'refinance-scenario-details', title: 'Scenario details and tradeoffs',
      description: 'The same deterministic scenario engine used by Mortgage Refinance Radar.',
      columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Scenario' }, { key: 'context', label: 'What it means' }],
      rows: [
        { id: 'new-payment', values: { metric: 'New principal and interest', value: money(scenario.newMonthlyPayment), context: `Current estimate: ${money(scenario.currentMonthlyPayment)}` } },
        { id: 'estimated-apr', values: { metric: 'Modeled APR', value: `${scenario.estimatedAprPct.toFixed(3)}%`, context: 'Includes modeled net upfront costs' } },
        { id: 'cash-to-close', values: { metric: 'Estimated cash to close', value: money(scenario.cashToCloseUsd), context: 'Planning estimate, not a lender disclosure' } },
        { id: 'interest', values: { metric: 'Estimated total interest', value: money(scenario.totalInterestNewLoan), context: `Current remaining estimate: ${money(scenario.totalInterestRemainingCurrent)}` } },
        { id: 'payoff', values: { metric: 'Payoff timing change', value: `${Math.abs(scenario.payoffDeltaMonths)} months ${scenario.payoffDeltaMonths <= 0 ? 'sooner' : 'later'}`, context: 'Compared with your current remaining term' } },
        { id: 'objective', values: { metric: 'Planning objective', value: scenario.objective.replace(/_/g, ' ').toLowerCase(), context: `Recommended term: ${scenario.recommendedTerm.replace(/_/g, ' ').toLowerCase()}` } },
      ], actions: [],
    }, {
      type: 'ASSUMPTIONS', id: 'refinance-scenario-assumptions', title: 'What this scenario assumes',
      items: refinanceScenarioAssumptions({ edit: scenarioEdit, targetRatePct, termLabel, benchmarkDate: benchmark.date, mortgageAsOf: input.mortgageObservedAt }),
    }, {
      type: 'EVIDENCE', id: 'refinance-scenario-evidence', title: 'Sources used',
      items: [
        { label: 'Current mortgage details', source: 'Property Financing Profile', observedAt: input.mortgageObservedAt ?? input.mortgageUpdatedAt },
        { label: '30-year market benchmark', source: `${benchmark.source}${benchmark.sourceRef ? ` \u00b7 ${benchmark.sourceRef}` : ''}`, observedAt: `${benchmark.date}T00:00:00.000Z` },
      ],
    }, {
      type: 'BOUNDARY', id: 'refinance-scenario-boundary', title: 'Illustrative scenario\u2014not a lender quote or a saved plan',
      body: 'This models the rate, term, costs, credits, points, principal, recast, cash-out, credit band, and objective you stated. Actual eligibility, APR, and closing costs depend on lender underwriting. Nothing here changes your recorded mortgage facts or enables rate monitoring.',
      severity: 'INFO', suggestions: [],
    }],
    suggestions: [],
  };
}

type RefinanceRadarEvaluation = Extract<Awaited<ReturnType<typeof refinanceRadarService.evaluateProperty>>, { available: true }>;

/**
 * The pure canonical comparison: the radar's evaluation, the governed benchmark and the financing profile's dates are all already read,
 * so the answer-first summary, the loan-versus-benchmark table, the dated sources and the not-an-offer boundary can be built and checked
 * without a database.
 */
export function refinanceCanonicalAnswer(input: {
  result: RefinanceRadarEvaluation;
  marketSnapshot: { date: string; source: string; sourceRef?: string | null };
  profile: { mortgageBalanceAsOfDate: Date | null; updatedAt: Date };
  contextVersion: string;
}): AskOperationResult {
  const { result, marketSnapshot, profile, contextVersion } = input;
  const favorable = result.radarState === 'OPEN';
  const rows = [
    { id: 'current-rate', values: { metric: 'Your recorded mortgage rate', value: `${result.currentRatePct.toFixed(3)}%`, meaning: 'Existing loan note rate' } },
    { id: 'market-rate', values: { metric: 'Market benchmark rate', value: `${result.marketRatePct.toFixed(3)}%`, meaning: `National 30-year benchmark as of ${marketSnapshot.date}` } },
    { id: 'target-rate', values: { metric: 'Modeled target scenario rate', value: `${result.marketRatePct.toFixed(3)}%`, meaning: 'Illustrative target set to the latest benchmark—not a lender quote' } },
    { id: 'rate-gap', values: { metric: 'Rate difference', value: `${result.rateGapPct.toFixed(3)} percentage points`, meaning: result.rateGapPct > 0 ? 'Existing rate is higher' : 'Existing rate is not higher' } },
    ...(result.triggerRatePct == null ? [] : [{ id: 'trigger-rate', values: { metric: 'Radar review threshold', value: `${result.triggerRatePct.toFixed(3)}% or lower`, meaning: result.triggerRateExplanation } }]),
    { id: 'monthly-savings', values: { metric: 'Modeled monthly savings', value: money(result.monthlySavings), meaning: 'Principal-and-interest estimate' } },
    { id: 'lifetime-savings', values: { metric: 'Modeled lifetime savings', value: money(result.lifetimeSavings), meaning: 'Interest difference after modeled closing costs' } },
    { id: 'closing-cost', values: { metric: 'Modeled closing costs', value: money(result.closingCostAssumptionUsd), meaning: 'Planning assumption' } },
    { id: 'break-even', values: { metric: 'Estimated break-even', value: result.breakEvenMonths == null ? 'Not reached' : `${result.breakEvenMonths} months`, meaning: 'Time to recover modeled costs' } },
    { id: 'confidence', values: { metric: 'Opportunity confidence', value: result.confidenceLevel ?? 'Not qualified', meaning: 'Based on modeled savings and break-even' } },
  ];
  return {
    status: 'ANSWERED', contextVersion,
    blocks: [{
      type: 'SUMMARY', id: 'refinance-analysis-summary', title: favorable ? 'Refinancing may be worth comparing now' : 'Current conditions do not meet the radar’s actionable threshold',
      body: result.radarSummary, tone: favorable ? 'POSITIVE' : 'DEFAULT',
      actions: refinanceNextActions(favorable, result.triggerRatePct),
    }, {
      type: 'TABLE', id: 'refinance-analysis-table', title: 'Current loan versus governed benchmark',
      description: 'The benchmark is not a personalized lender offer or guaranteed available rate.',
      columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Estimate' }, { key: 'meaning', label: 'What it represents' }], rows, actions: [],
    }, {
      type: 'EVIDENCE', id: 'refinance-evidence', title: 'Sources used', items: [
        { label: 'Current mortgage details', source: 'Property Financing Profile', observedAt: profile.mortgageBalanceAsOfDate?.toISOString() ?? profile.updatedAt.toISOString() },
        { label: '30-year market benchmark', source: `${marketSnapshot.source}${marketSnapshot.sourceRef ? ` · ${marketSnapshot.sourceRef}` : ''}`, observedAt: `${marketSnapshot.date}T00:00:00.000Z` },
      ],
    }, {
      type: 'BOUNDARY', id: 'refinance-boundary', title: 'Planning estimate—not a loan offer', body: 'Actual eligibility, APR, closing costs, taxes, insurance, points, credits, and available rates depend on lender underwriting and a formal Loan Estimate. Compare offers before making a financial commitment.', severity: 'INFO', suggestions: [],
    }],
    suggestions: [],
  };
}

async function refinanceAnalysisResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const journeyIntent = refinanceJourneyIntent(message);
  if (journeyIntent) return refinanceJourneyResult(propertyId, journeyIntent);
  const [profile, financialContext, marketSnapshot, access] = await Promise.all([
    getProfile(propertyId),
    getFinancialContextDecisions(propertyId, userId, 'REFINANCE_RADAR'),
    mortgageRateService.getLatestSnapshot(),
    ensurePropertyAccess(userId, propertyId),
  ]);
  const profileActions = access.role === HouseholdRole.OWNER ? [{
    id: FINANCING_PROFILE_ACTION_ID, label: 'Update my mortgage and purchase details', interactionType: 'START_WORKFLOW' as const,
    message: FINANCING_PROFILE_COMMAND_MESSAGE, operationId: 'FINANCING_PROFILE_COMMAND' as const,
    entityType: FINANCING_PROFILE_ENTITY_TYPE, entityId: propertyId, style: 'SECONDARY' as const,
  }] : [];
  if (profile?.mortgageStatus === 'NO_MORTGAGE') {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'NO_MORTGAGE',
      blocks: [{ type: 'SUMMARY', id: 'refinance-not-applicable', title: 'No mortgage is recorded for this home', body: access.role === HouseholdRole.OWNER
        ? 'A mortgage refinance analysis does not apply unless the financing profile shows an active mortgage. If this record is wrong, update the mortgage details here.'
        : 'A mortgage refinance analysis does not apply unless the financing profile shows an active mortgage. Only an owner can change the home\u2019s financing profile.', tone: 'DEFAULT', actions: profileActions }],
      suggestions: [],
    };
  }

  const missing = [
    profile?.currentMortgageBalanceCents == null ? 'currentMortgageBalanceUsd' : null,
    profile?.interestRateBps == null ? 'interestRatePct' : null,
    profile?.remainingTermMonths == null ? 'remainingTermYears' : null,
  ].filter((value): value is string => Boolean(value));
  if (missing.length) {
    const fields = [
      ...(missing.includes('currentMortgageBalanceUsd') ? [{ key: 'currentMortgageBalanceUsd', label: 'Current mortgage balance', helpText: 'An approximate current principal balance is acceptable.', required: true, inputSchema: { type: 'DECIMAL' as const, min: 1_000, max: 100_000_000, unit: 'USD' } }] : []),
      ...(missing.includes('interestRatePct') ? [{ key: 'interestRatePct', label: 'Current interest rate', helpText: 'Enter the note rate on your existing mortgage, not a market quote.', required: true, inputSchema: { type: 'DECIMAL' as const, min: 0.01, max: 30, unit: '%' } }] : []),
      ...(missing.includes('remainingTermYears') ? [{ key: 'remainingTermYears', label: 'Remaining loan term', helpText: 'An estimate in years is fine.', required: true, inputSchema: { type: 'DECIMAL' as const, min: 0.1, max: 50, unit: 'years' } }] : []),
      ...(profile?.monthlyPaymentCents == null ? [{ key: 'monthlyPaymentUsd', label: 'Monthly principal and interest payment', helpText: 'Optional. Leave blank and the analysis will calculate an amortized estimate.', required: false, inputSchema: { type: 'DECIMAL' as const, min: 1, max: 1_000_000, unit: 'USD/month' } }] : []),
    ];
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'MORTGAGE_PROFILE_INCOMPLETE', contextVersion: financialContext.contextVersion,
      parameters: { captureOwner: 'PropertyFinancingProfile' },
      blocks: [{
        type: 'SUMMARY', id: 'refinance-needs-context', title: 'A few mortgage details are needed for a meaningful comparison',
        body: marketSnapshot
          ? `The latest governed 30-year benchmark is ${marketSnapshot.rate30yr.toFixed(3)}% as of ${marketSnapshot.date}. I won’t compare it with an assumed current loan rate or treat missing balances as zero.`
          : 'Your mortgage profile is incomplete, and no governed market-rate snapshot is currently available. Save the loan details now and Ask can use them when a benchmark becomes available.',
        tone: 'CAUTION', actions: [],
      }],
      captureRequests: [{
        requirementId: `refinance-profile-${financialContext.contextVersion.slice(0, 20)}`,
        captureKey: 'FINANCING_PROFILE_REFINANCE_INPUTS', classification: 'REQUIRED_CALCULATION', state: 'UNKNOWN',
        title: 'Complete mortgage details', question: 'Add only the current-loan details needed to compare refinancing options.',
        helpText: 'These values are stored in this home’s Financing Profile and are not sent to an LLM.',
        inputSchema: { type: 'GROUP', fields },
        currentAnswer: {}, allowNotSure: false, sensitivity: 'FINANCIAL',
        destinationLabel: 'Saved to this home’s Financing Profile',
        confirmationText: 'I confirm these mortgage details are accurate enough to save to this home’s Financing Profile.',
        expectedContextVersion: financialContext.contextVersion,
      }],
      suggestions: [],
    };
  }

  if (!marketSnapshot) {
    return {
      status: 'UNAVAILABLE', reasonCode: 'MARKET_RATE_UNAVAILABLE', contextVersion: financialContext.contextVersion,
      blocks: [{ type: 'SUMMARY', id: 'refinance-market-unavailable', title: 'A current governed mortgage-rate benchmark is unavailable', body: 'Your loan details are ready, but Ask will not use model knowledge or an undated rate as the market benchmark. Try again after the benchmark receives a dated source snapshot.', tone: 'CAUTION', actions: [] }],
      suggestions: [],
    };
  }

  const result = await refinanceRadarService.evaluateProperty(propertyId, financialContext.contextVersion);
  if (!result.available) {
    return { status: 'UNAVAILABLE', reasonCode: result.reason, contextVersion: financialContext.contextVersion, blocks: [{ type: 'SUMMARY', id: 'refinance-analysis-unavailable', title: 'The refinance analysis is not ready', body: access.role === HouseholdRole.OWNER
      ? 'Ask could not complete a property-specific comparison. Review the financing profile here, or try the analysis again later.'
      : 'Ask could not complete a property-specific comparison. Only an owner can review or change the home\u2019s financing profile; try the analysis again later.', tone: 'CAUTION', actions: profileActions }], suggestions: [] };
  }

  // F02 fix (see parseRefinanceScenarioEdit above): a real, isolated what-if
  // recalculation -- RefinanceRadarService.runScenario with saveScenario:
  // false, confirmed by direct read, never writes RefinanceScenarioSnapshot
  // and never touches PropertyFinancingProfile; it only READS the canonical
  // mortgage context. This branch returns entirely separately from the
  // canonical comparison below -- nothing here is combined with or
  // overwrites it, mirroring HVAC_DECISION_SCENARIO's own isolated-scenario
  // shape (verified in the Phase 7 Decisions document, D02). The canonical
  // analysis remains exactly as-is and is reproduced unchanged by simply
  // asking again without the hypothetical framing.
  const scenarioEdit = parseRefinanceScenarioEdit(message);
  if (scenarioEdit) {
    try {
      const targetRatePct = scenarioEdit.targetRatePct ?? marketSnapshot.rate30yr;
      const targetTerm = scenarioEdit.targetTerm ?? RefinanceScenarioTerm.THIRTY_YEAR;
      const termLabel = targetTerm === RefinanceScenarioTerm.FIFTEEN_YEAR ? '15-year' : targetTerm === RefinanceScenarioTerm.TWENTY_YEAR ? '20-year' : '30-year';
      const scenario = await refinanceRadarService.runScenario(propertyId, {
        targetRate: targetRatePct,
        targetTerm,
        closingCostAmount: scenarioEdit.closingCostAmount,
        discountPoints: scenarioEdit.discountPoints,
        additionalFeesAmount: scenarioEdit.additionalFeesAmount,
        lenderCreditsAmount: scenarioEdit.lenderCreditsAmount,
        escrowFundingAmount: scenarioEdit.escrowFundingAmount,
        prepaymentPenaltyAmount: scenarioEdit.prepaymentPenaltyAmount,
        extraPrincipalAmount: scenarioEdit.extraPrincipalAmount,
        recastPrincipalAmount: scenarioEdit.recastPrincipalAmount,
        cashOutAmount: scenarioEdit.cashOutAmount,
        borrowerCreditBand: scenarioEdit.borrowerCreditBand,
        objective: scenarioEdit.objective,
        saveScenario: false,
        propertyContextVersion: financialContext.contextVersion,
      });
      return refinanceScenarioAnswer({
        current: result, scenario, scenarioEdit, targetRatePct, termLabel,
        benchmark: { date: marketSnapshot.date, source: marketSnapshot.source, sourceRef: marketSnapshot.sourceRef ?? null },
        mortgageObservedAt: profile!.mortgageBalanceAsOfDate?.toISOString() ?? null,
        mortgageUpdatedAt: profile!.updatedAt.toISOString(),
        contextVersion: financialContext.contextVersion,
      });
    } catch (error) {
      // Best-effort: a scenario computation failure must not break the
      // ordinary canonical-analysis read this turn would otherwise return.
      logger.warn({ error, propertyId }, '[ask-orchestrator] refinance scenario computation failed, falling back to the canonical analysis');
    }
  }

  return refinanceCanonicalAnswer({ result, marketSnapshot, profile: profile!, contextVersion: financialContext.contextVersion });
}

function parseRateThreshold(message: string): number | null {
  const match = message.match(/(?:below|under|to|reaches?|hits?)\s*(\d{1,2}(?:\.\d{1,3})?)\s*%/i)
    ?? message.match(/(\d{1,2}(?:\.\d{1,3})?)\s*%/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 && value <= 30 ? value : null;
}

async function refinanceRateMonitorResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const thresholdPct = parseRateThreshold(message);
  if (thresholdPct === null) {
    return {
      status: 'NEEDS_CLARIFICATION', reasonCode: 'RATE_THRESHOLD_REQUIRED',
      ...durableFreeTextClarification('REFINANCE_RATE_MONITOR', 'What mortgage-rate threshold and term should trigger the alert?'),
      blocks: [{ type: 'SUMMARY', id: 'rate-monitor-threshold-needed', title: 'What rate should trigger the alert?', body: 'Enter a mortgage benchmark threshold such as “Notify me when 30-year rates reach 5.5%.”', tone: 'CAUTION', actions: [] }],
      suggestions: [],
    };
  }
  const product = /\b15[ -]?year\b/i.test(message) ? RefinanceRateMonitorProduct.FIXED_15_YEAR : RefinanceRateMonitorProduct.FIXED_30_YEAR;
  const preference = await getRefinanceAlertPreference(userId, propertyId);
  if (!preference.recipientInRolloutCohort || !preference.externalDeliveryEnabled) {
    return {
      status: 'UNAVAILABLE', reasonCode: !preference.recipientInRolloutCohort ? 'REFINANCE_ALERT_ROLLOUT_UNAVAILABLE' : 'REFINANCE_ALERT_DELIVERY_UNAVAILABLE',
      blocks: [{ type: 'SUMMARY', id: 'rate-monitor-unavailable', title: 'Email rate alerts are not available for this account yet', body: 'Ask can still show the latest governed benchmark and personalized review threshold. Ask will not claim an external notification is active until delivery eligibility is confirmed.', tone: 'CAUTION', actions: [] }],
      suggestions: [],
    };
  }
  const confirmationVersion = 1;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const quietStart = preference.quietStart ?? '21:00';
  const quietEnd = preference.quietEnd ?? '07:00';
  const contextVersion = await refinanceMonitorContextVersion(userId, propertyId);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'MONITOR_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      thresholdPct, product, channel: 'EMAIL', cadence: 'IMMEDIATE', quietStart, quietEnd,
      timezone: preference.timezone || 'UTC', refinanceMonitorContextVersion: contextVersion, confirmationVersion, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'rate-monitor-review', title: 'Review this mortgage-rate monitor', body: 'No monitor has been created yet. Confirm the settings below to activate governed benchmark monitoring and email delivery.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `rate-monitor-${propertyId}-${confirmationVersion}`,
      version: confirmationVersion,
      title: 'Start mortgage-rate monitoring?',
      description: 'ContractToCozy will evaluate newly ingested governed mortgage-rate snapshots and notify you when the selected benchmark is at or below your threshold.',
      fields: [
        { label: 'Benchmark', value: product === RefinanceRateMonitorProduct.FIXED_15_YEAR ? '15-year fixed national benchmark' : '30-year fixed national benchmark' },
        { label: 'Threshold', value: `${thresholdPct.toFixed(3)}% or lower` },
        { label: 'Channel', value: 'Email plus in-app notification' },
        { label: 'Cadence', value: 'Immediate when a newly ingested snapshot qualifies' },
        { label: 'Quiet hours', value: `${quietStart}–${quietEnd} (${preference.timezone || 'UTC'})` },
        { label: 'Source boundary', value: 'Governed national benchmark—not a personalized lender quote' },
      ],
      editableFields: [], confirmLabel: 'Start monitor',
      consentText: 'I consent to receive refinance threshold notifications by email using these settings.',
      expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('refinance.analysis', async (envelope) => refinanceAnalysisWithMonitorsResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('refinance.monitor', async (envelope) => refinanceRateMonitorResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('break-even.analysis', async (envelope) => breakEvenAnalysisResult(envelope.userId, envelope.propertyId!, envelope.message));
