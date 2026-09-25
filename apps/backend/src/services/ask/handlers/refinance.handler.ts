// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { RefinanceRateMonitorProduct, RefinanceScenarioTerm } from '@prisma/client';
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
import { BreakEvenService, type BreakEvenDTO } from '../../breakEven.service';
import { money } from '../askFormatting';
import { askContextFingerprint, durableFreeTextClarification } from '../askHandlerSupport';

const refinanceRadarService = new RefinanceRadarService();

const mortgageRateService = new MortgageRateService();

export async function refinanceMonitorContextVersion(userId: string, propertyId: string): Promise<string> {
  const [preference, snapshot] = await Promise.all([getRefinanceAlertPreference(userId, propertyId), mortgageRateService.getLatestSnapshot()]);
  return askContextFingerprint({ preference, snapshotId: snapshot?.id ?? null, snapshotDate: snapshot?.date ?? null });
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
export function parseRefinanceScenarioEdit(message: string): { targetRatePct: number | null; targetTerm: RefinanceScenarioTerm | null } | null {
  const isScenarioFraming = /\b(?:what if|suppose|hypothetically|instead of my (?:current|recorded) (?:rate|term|loan)|if i (?:refinanc(?:e|ed)?|got|get|took|take))\b/i.test(message);
  if (!isScenarioFraming) return null;
  const rateMatch = message.match(/(\d{1,2}(?:\.\d{1,3})?)\s*%/);
  const targetRatePct = rateMatch ? Number(rateMatch[1]) : null;
  const targetTerm = /\b(?:15|fifteen)[- ]?year\b/i.test(message)
    ? RefinanceScenarioTerm.FIFTEEN_YEAR
    : /\b(?:20|twenty)[- ]?year\b/i.test(message)
      ? RefinanceScenarioTerm.TWENTY_YEAR
      : /\b(?:30|thirty)[- ]?year\b/i.test(message)
        ? RefinanceScenarioTerm.THIRTY_YEAR
        : null;
  if (targetRatePct == null && !targetTerm) return null;
  return { targetRatePct, targetTerm };
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
    actions: [{ id: 'edit-monitor', label: 'Alert delivery settings', href: `/dashboard/properties/${encodeURIComponent(monitor.propertyId)}/tools/mortgage-refinance-radar#refinance-evidence-settings`, style: 'SECONDARY' }],
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

export function breakEvenAnalysisFromDto(dto: BreakEvenDTO, propertyId: string): AskOperationResult {
  const years = dto.input.years;
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/break-even`;
  const { breakEven, rollup, sensitivity } = dto;
  const yearLabel = (index: number | null) => index == null ? `Not within ${years} years` : `Year ${index}`;
  const title = breakEven.status === 'ALREADY_BREAKEVEN'
    ? 'This home has already broken even'
    : breakEven.status === 'PROJECTED'
      ? `Projected to break even in ${breakEven.breakEvenCalendarYear} (year ${breakEven.breakEvenYearIndex} of ${years})`
      : `Not projected to break even within ${years} years`;
  const body = breakEven.status === 'NOT_REACHED'
    ? `Over ${years} years, projected ownership costs of ${money(rollup.cumulativeExpensesAtHorizon)} stay ahead of projected appreciation of ${money(rollup.cumulativeAppreciationAtHorizon)}, a net of ${money(rollup.netAtHorizon)}.`
    : `Over ${years} years, projected appreciation of ${money(rollup.cumulativeAppreciationAtHorizon)} against ownership costs of ${money(rollup.cumulativeExpensesAtHorizon)} leaves a net of ${money(rollup.netAtHorizon)}. Across the conservative-to-optimistic range: ${sensitivity.rangeLabel}.`;
  // The service's own disclosures, e.g. the labeled $350,000 fallback it uses when no purchase price is recorded.
  const notes = dto.meta.notes.filter((note) => note.trim());
  const limited = notes.length > 0 || dto.meta.confidence === 'LOW';
  const otherYears = years === 10 ? 5 : 10;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'break-even-summary', title, body: `${body} Confidence: ${dto.meta.confidence.toLowerCase()}.`,
    tone: breakEven.status === 'NOT_REACHED' ? 'CAUTION' : 'DEFAULT',
    actions: [
      { id: 'open-break-even', label: 'Open Break-Even', href: pageHref, style: 'PRIMARY' },
      { id: `rerun-break-even-${otherYears}`, label: `Show ${otherYears}-year horizon`, interactionType: 'START_WORKFLOW' as const, message: `Show my home break-even analysis for a ${otherYears}-year horizon.`, operationId: 'BREAK_EVEN_ANALYSIS', style: 'SECONDARY' as const },
    ],
  }];
  if (notes.length) {
    blocks.push({ type: 'LIMITATION', id: 'break-even-limitations', title: 'What this projection is missing', body: notes.join(' '), severity: 'CAUTION' });
  }
  blocks.push({
    type: 'TABLE', id: 'break-even-sensitivity', title: 'Break-even range',
    description: `Conservative, base and optimistic assumptions over ${years} years.`,
    columns: [{ key: 'scenario', label: 'Scenario' }, { key: 'breakEven', label: 'Breaks even' }, { key: 'net', label: `Net at year ${years}` }],
    rows: (['conservative', 'base', 'optimistic'] as const).map((key) => ({
      id: `break-even-${key}`,
      values: { scenario: key.charAt(0).toUpperCase() + key.slice(1), breakEven: yearLabel(sensitivity[key].breakEvenYearIndex), net: money(sensitivity[key].netAtHorizon) },
    })),
    actions: [],
  }, {
    type: 'TABLE', id: 'break-even-projection', title: 'Year-by-year projection',
    description: 'Cumulative ownership costs against cumulative projected appreciation.',
    columns: [{ key: 'year', label: 'Year' }, { key: 'expenses', label: 'Cumulative costs' }, { key: 'appreciation', label: 'Cumulative appreciation' }, { key: 'net', label: 'Net' }],
    rows: dto.projection.map((row) => ({
      id: `break-even-year-${row.year}`,
      values: { year: String(row.year), expenses: money(row.cumulativeExpenses), appreciation: money(row.cumulativeAppreciationGain), net: money(row.netCumulative) },
    })),
    actions: [],
  });
  if (dto.drivers.length) {
    blocks.push({
      type: 'TABLE', id: 'break-even-drivers', title: 'What drives the result',
      columns: [{ key: 'factor', label: 'Factor' }, { key: 'impact', label: 'Impact' }, { key: 'explanation', label: 'Why' }],
      rows: dto.drivers.map((driver, index) => ({ id: `break-even-driver-${index + 1}`, values: { factor: driver.factor, impact: driver.impact.toLowerCase(), explanation: driver.explanation } })),
      actions: [],
    });
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
    suggestions: ['Should I sell, hold, or rent this home?', 'What does this home cost me each year?'],
  };
}

async function breakEvenAnalysisResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const dto = await breakEvenService.compute(propertyId, { years: breakEvenHorizonYears(message) }, userId);
  return breakEvenAnalysisFromDto(dto, propertyId);
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

async function refinanceAnalysisResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const [profile, financialContext, marketSnapshot] = await Promise.all([
    getProfile(propertyId),
    getFinancialContextDecisions(propertyId, userId, 'REFINANCE_RADAR'),
    mortgageRateService.getLatestSnapshot(),
  ]);
  if (profile?.mortgageStatus === 'NO_MORTGAGE') {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'NO_MORTGAGE',
      blocks: [{ type: 'SUMMARY', id: 'refinance-not-applicable', title: 'No mortgage is recorded for this home', body: 'A mortgage refinance analysis does not apply unless the financing profile is corrected to show an active mortgage.', tone: 'DEFAULT', actions: [{ id: 'review-financing', label: 'Review financing profile', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/financing/profile`, style: 'SECONDARY' }] }],
      suggestions: ['Show other home savings opportunities'],
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
      suggestions: ['Use the full Financing Profile instead'],
    };
  }

  if (!marketSnapshot) {
    return {
      status: 'UNAVAILABLE', reasonCode: 'MARKET_RATE_UNAVAILABLE', contextVersion: financialContext.contextVersion,
      blocks: [{ type: 'SUMMARY', id: 'refinance-market-unavailable', title: 'A current governed mortgage-rate benchmark is unavailable', body: 'Your loan details are ready, but Ask will not use model knowledge or an undated rate as the market benchmark. Try again after the Mortgage Refinance Radar receives a dated source snapshot.', tone: 'CAUTION', actions: [{ id: 'open-radar', label: 'Open Mortgage Refinance Radar', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/mortgage-refinance-radar`, style: 'PRIMARY' }] }],
      suggestions: ['What rate would make refinancing worth reviewing?'],
    };
  }

  const result = await refinanceRadarService.evaluateProperty(propertyId, financialContext.contextVersion);
  if (!result.available) {
    return { status: 'UNAVAILABLE', reasonCode: result.reason, contextVersion: financialContext.contextVersion, blocks: [{ type: 'SUMMARY', id: 'refinance-analysis-unavailable', title: 'The refinance analysis is not ready', body: 'The Mortgage Refinance Radar could not complete a property-specific comparison. Review the financing profile and try again.', tone: 'CAUTION', actions: [{ id: 'open-profile', label: 'Review financing profile', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/financing/profile`, style: 'PRIMARY' }] }], suggestions: [] };
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
        borrowerCreditBand: 'UNKNOWN',
        objective: 'BALANCED',
        saveScenario: false,
        propertyContextVersion: financialContext.contextVersion,
      });
      return {
        status: 'ANSWERED', contextVersion: financialContext.contextVersion,
        blocks: [{
          type: 'SUMMARY', id: 'refinance-scenario-summary',
          title: `Illustrative ${termLabel} scenario at ${targetRatePct.toFixed(3)}%`,
          body: 'This is a hypothetical recalculation only. Nothing was saved, and your recorded mortgage rate and term are unchanged. The current comparison is shown below, unchanged, alongside it.',
          tone: 'DEFAULT',
          actions: [{ id: 'open-radar', label: 'Explore in Mortgage Refinance Radar', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/mortgage-refinance-radar`, style: 'PRIMARY' }],
        }, refinanceScenarioComparison(
          result, scenario, targetRatePct, termLabel,
        ), {
          type: 'EVIDENCE', id: 'refinance-scenario-evidence', title: 'Sources used',
          items: [{ label: 'Current mortgage details', source: 'Property Financing Profile', observedAt: profile!.mortgageBalanceAsOfDate?.toISOString() ?? profile!.updatedAt.toISOString() }],
        }, {
          type: 'BOUNDARY', id: 'refinance-scenario-boundary', title: 'Illustrative scenario—not a lender quote or a saved plan',
          body: 'This models a hypothetical rate and term only. Actual eligibility, APR, and closing costs depend on lender underwriting. Nothing here changes your recorded mortgage facts or enables rate monitoring.',
          severity: 'INFO', suggestions: [],
        }],
        suggestions: ['Is refinancing worth it right now?', 'Notify me when rates reach this level'],
      };
    } catch (error) {
      // Best-effort: a scenario computation failure must not break the
      // ordinary canonical-analysis read this turn would otherwise return.
      logger.warn({ error, propertyId }, '[ask-orchestrator] refinance scenario computation failed, falling back to the canonical analysis');
    }
  }

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
    status: 'ANSWERED', contextVersion: financialContext.contextVersion,
    blocks: [{
      type: 'SUMMARY', id: 'refinance-analysis-summary', title: favorable ? 'Refinancing may be worth comparing now' : 'Current conditions do not meet the radar’s actionable threshold',
      body: result.radarSummary, tone: favorable ? 'POSITIVE' : 'DEFAULT',
      actions: [{ id: 'open-radar', label: 'Explore refinance scenarios', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/mortgage-refinance-radar`, style: 'PRIMARY' }],
    }, {
      type: 'TABLE', id: 'refinance-analysis-table', title: 'Current loan versus governed benchmark',
      description: 'The benchmark is not a personalized lender offer or guaranteed available rate.',
      columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Estimate' }, { key: 'meaning', label: 'What it represents' }], rows, actions: [],
    }, {
      type: 'EVIDENCE', id: 'refinance-evidence', title: 'Sources used', items: [
        { label: 'Current mortgage details', source: 'Property Financing Profile', observedAt: profile!.mortgageBalanceAsOfDate?.toISOString() ?? profile!.updatedAt.toISOString() },
        { label: '30-year market benchmark', source: `${marketSnapshot.source}${marketSnapshot.sourceRef ? ` · ${marketSnapshot.sourceRef}` : ''}`, observedAt: `${marketSnapshot.date}T00:00:00.000Z` },
      ],
    }, {
      type: 'BOUNDARY', id: 'refinance-boundary', title: 'Planning estimate—not a loan offer', body: 'Actual eligibility, APR, closing costs, taxes, insurance, points, credits, and available rates depend on lender underwriting and a formal Loan Estimate. Compare offers before making a financial commitment.', severity: 'INFO', suggestions: [],
    }],
    suggestions: ['What rate would open a stronger opportunity?', 'Show me the Mortgage Refinance Radar'],
  };
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
      suggestions: ['Notify me when 30-year rates reach 5.5%', 'Notify me when 15-year rates reach 4.75%'],
    };
  }
  const product = /\b15[ -]?year\b/i.test(message) ? RefinanceRateMonitorProduct.FIXED_15_YEAR : RefinanceRateMonitorProduct.FIXED_30_YEAR;
  const preference = await getRefinanceAlertPreference(userId, propertyId);
  if (!preference.recipientInRolloutCohort || !preference.externalDeliveryEnabled) {
    return {
      status: 'UNAVAILABLE', reasonCode: !preference.recipientInRolloutCohort ? 'REFINANCE_ALERT_ROLLOUT_UNAVAILABLE' : 'REFINANCE_ALERT_DELIVERY_UNAVAILABLE',
      blocks: [{ type: 'SUMMARY', id: 'rate-monitor-unavailable', title: 'Email rate alerts are not available for this account yet', body: 'Mortgage Refinance Radar can still show the latest governed benchmark and personalized review threshold in the app. Ask will not claim an external notification is active until delivery eligibility is confirmed.', tone: 'CAUTION', actions: [{ id: 'open-radar', label: 'Open Mortgage Refinance Radar', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/mortgage-refinance-radar`, style: 'PRIMARY' }] }],
      suggestions: ['Is refinancing worth reviewing now?'],
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
