// The Financing read and the project-financing calculator inside Ask (register P0 "Financing", slices FN-A and FN-B; FRD v1.314).
//
// Reads what the Financing page's profile, equity and scenarios endpoints read, through the same service functions, and runs the page's own stateless
// calculator for "what would a $X project cost to finance". A read never writes: the equity snapshot is computed in memory when none is fresh
// (financing.service getLatestEquity no longer persists; only the explicit refresh does), so asking changes nothing. Not here: editing the financing
// profile (the mortgage fields it shares with the refinance capture need one owner; FRD v1.314 records the decision), saving a calculation as a scenario,
// and archiving a scenario. Ask links to no page.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { FINANCING_SCENARIO_ACTION_IDS, FINANCING_PROJECT_COST_ENTITY_TYPE, FINANCING_SCENARIO_ENTITY_TYPE } from '../support/financingScenarioCommand';
import { FINANCING_PROFILE_ACTION_ID, FINANCING_PROFILE_COMMAND_MESSAGE, FINANCING_PROFILE_ENTITY_TYPE } from '../support/financingProfileCommand';
import { humanDate, money } from '../askFormatting';
import { calculate, getLatestEquity, getProfile, listScenarios } from '../../financing.service';
import type { FinancingResultSet } from '../../financingCalculator.service';
import {
  EQUITY_SOURCE_LABELS, MORTGAGE_STATUS_LABELS, MORTGAGE_TYPE_LABELS, parseFinancingAmountDollars, SCENARIO_STATUS_LABELS,
} from '../support/financingRead';

type Profile = Awaited<ReturnType<typeof getProfile>>;
type Equity = Awaited<ReturnType<typeof getLatestEquity>>;
type Scenario = Awaited<ReturnType<typeof listScenarios>>[number];

const dollars = (cents: number | null | undefined) => (cents === null || cents === undefined ? null : money(cents / 100));
const rate = (bps: number | null | undefined) => (bps === null || bps === undefined ? null : `${Number((bps / 100).toFixed(2))}%`);
const monthly = (cents: number) => `${money(cents / 100)}/month`;

const BOUNDARY: AskPresentationBlock = {
  type: 'BOUNDARY', id: 'financing-boundary', title: 'Illustrations, not an offer',
  body: 'Rates are national averages. What you would be offered depends on your credit, the lender and the market, and a home equity product puts your home at risk if payments are missed. Talk to a lender or advisor before borrowing.',
  severity: 'INFO', suggestions: [],
};

/** Pure: the answer from the reads, exported for tests. `calc` is present when the message named a project cost. */
export function financingFromView(input: { profile: Profile; equity: Equity | null; scenarios: readonly Scenario[]; calc: FinancingResultSet | null; amountDollars: number | null; propertyId?: string; isOwner?: boolean }): AskOperationResult {
  const { scenarios, amountDollars } = input;
  // The persisted financing profile is owner-only as a whole (owner ruling 2026-10-13, FRD v1.333), and equity, loan to value, and HELOC
  // eligibility are derived from its mortgage balance. Below OWNER none of that is read or shown; scenarios and the calculator's way-to-pay
  // comparison stay available to every household member.
  const isOwner = input.isOwner === true;
  const profile = isOwner ? input.profile : null;
  const equity = isOwner ? input.equity : null;
  const calc = input.calc;
  const blocks: AskPresentationBlock[] = [];
  const hasProfile = Boolean(profile && profile.mortgageStatus !== 'UNKNOWN');
  const equityLine = equity && equity.estimatedValueCents > 0
    ? `About ${Number(equity.equityPercent)}% equity (${dollars(equity.equityCents)}) on a home valued near ${dollars(equity.estimatedValueCents)}, based on ${EQUITY_SOURCE_LABELS[String(equity.estimatedValueSource)] ?? 'your recorded value'}.`
    : null;
  blocks.push({
    type: 'SUMMARY', id: 'financing-summary',
    title: calc ? `Financing a ${money(calc.projectCostCents / 100)} project` : !isOwner ? 'Financing' : equityLine ? `About ${Number(equity!.equityPercent)}% equity in your home` : 'No financing details recorded yet',
    body: calc
      ? `Five ways to pay for it, side by side. ${!isOwner ? 'Whether you could qualify depends on mortgage details that only a home owner can see.' : calc.helocEligible ? `Your equity looks sufficient for a HELOC up to ${money(calc.helocCapacityCents / 100)}.` : 'Your recorded equity does not look sufficient for a HELOC, so that option is shown for comparison only.'}`
      : !isOwner ? 'Mortgage, equity, and borrowing details are visible to a home owner. Saved financing scenarios and project cost comparisons are available here.'
        : equityLine ?? 'Add your home value and mortgage details to see your equity and what you could borrow.',
    tone: 'DEFAULT',
    // The financing profile is owner-only on every surface (owner ruling 2026-10-13, FRD v1.333).
    actions: input.isOwner && input.propertyId ? [{
      id: FINANCING_PROFILE_ACTION_ID, label: 'Update my mortgage and purchase details', interactionType: 'START_WORKFLOW' as const, message: FINANCING_PROFILE_COMMAND_MESSAGE,
      operationId: 'FINANCING_PROFILE_COMMAND' as const, entityType: FINANCING_PROFILE_ENTITY_TYPE, entityId: input.propertyId, style: 'SECONDARY' as const,
    }, {
      id: FINANCING_SCENARIO_ACTION_IDS.REFRESH_EQUITY, label: 'Refresh my equity', interactionType: 'START_WORKFLOW' as const, message: FINANCING_PROFILE_COMMAND_MESSAGE,
      operationId: 'FINANCING_PROFILE_COMMAND' as const, actionId: FINANCING_SCENARIO_ACTION_IDS.REFRESH_EQUITY, entityType: FINANCING_PROFILE_ENTITY_TYPE, entityId: input.propertyId, style: 'SECONDARY' as const,
    }] : [],
  });

  // The numbers behind the answer.
  const facts: Array<{ id: string; label: string; value: string | null; meta?: string[] }> = [
    { id: 'mortgage-status', label: 'Mortgage', value: profile ? MORTGAGE_STATUS_LABELS[profile.mortgageStatus] ?? null : 'Not recorded' },
    { id: 'mortgage-type', label: 'Loan type', value: profile?.mortgageType ? MORTGAGE_TYPE_LABELS[String(profile.mortgageType)] ?? 'Other mortgage' : null },
    { id: 'mortgage-balance', label: 'Mortgage balance', value: dollars(profile?.currentMortgageBalanceCents), meta: profile?.mortgageBalanceAsOfDate ? [`Balance recorded ${humanDate(new Date(profile.mortgageBalanceAsOfDate))}`] : [] },
    { id: 'mortgage-rate', label: 'Interest rate', value: rate(profile?.interestRateBps) },
    { id: 'mortgage-payment', label: 'Monthly payment', value: dollars(profile?.monthlyPaymentCents) ? `${dollars(profile?.monthlyPaymentCents)}/month` : null },
    { id: 'mortgage-term', label: 'Remaining term', value: profile?.remainingTermMonths ? `${Math.round(profile.remainingTermMonths / 12 * 10) / 10} years` : null },
    ...(equity && equity.estimatedValueCents > 0 ? [
      { id: 'home-value', label: 'Estimated home value', value: dollars(equity.estimatedValueCents), meta: [`Source: ${EQUITY_SOURCE_LABELS[String(equity.estimatedValueSource)] ?? 'recorded home value'}`] },
      { id: 'home-equity', label: 'Home equity', value: `${dollars(equity.equityCents)} (${Number(equity.equityPercent)}%)`, meta: [`Calculated ${humanDate(new Date(equity.computedAt))}`] },
      { id: 'loan-to-value', label: 'Loan to value', value: `${Number(equity.ltvPercent)}%` },
      { id: 'heloc-capacity', label: 'Estimated HELOC capacity', value: equity.helocEligible ? `Up to ${dollars(equity.helocCapacityCents)}` : 'Not likely at this equity level' },
    ] : []),
  ].filter((fact) => fact.value);
  if (isOwner && facts.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'financing-numbers', title: 'Your numbers',
      description: hasProfile ? 'From the financing details recorded for this home.' : 'Little is recorded, so these are partial.',
      sections: [{ id: 'financing-numbers-all', title: 'Mortgage and equity', count: facts.length,
        items: facts.map((fact) => ({ id: fact.id, title: fact.label, description: fact.value, meta: fact.meta ?? [], status: null, href: null })) }],
      actions: [],
    });
  }

  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'financing-planner', title: 'Plan how to pay for a home project',
    description: 'Enter a project cost, compare realistic payment options, and save the scenario for later.',
    sections: [{ id: 'financing-planner-input', title: 'Project financing calculator', count: 1, items: [{
      id: 'financing-project-cost', title: 'Project cost', description: amountDollars === null ? null : money(amountDollars),
      meta: amountDollars === null ? [] : [`${amountDollars * 100} cents`], status: null, href: null,
    }] }], actions: [],
  });

  if (calc) {
    const options: Array<{ id: string; title: string; description: string; meta: string[]; status: string | null }> = [
      {
        id: 'financing-heloc', title: 'Home equity line of credit (HELOC)',
        description: `${monthly(calc.heloc.drawMonthlyPaymentCents)} while drawing (interest only), then ${monthly(calc.heloc.repaymentMonthlyPaymentCents)} to repay over ten years.`,
        meta: [`${rate(calc.heloc.rateBps)} variable`, `${money(calc.heloc.totalInterestCents / 100)} total interest`], status: !isOwner ? null : calc.helocEligible ? 'You may qualify' : 'May not qualify',
      },
      {
        id: 'financing-home-equity-loan', title: 'Home equity loan',
        description: `${monthly(calc.homeEquityLoan.monthlyPaymentCents)} over ${calc.homeEquityLoan.termYears} years at a fixed rate.`,
        meta: [`${rate(calc.homeEquityLoan.rateBps)}`, `${money(calc.homeEquityLoan.totalInterestCents / 100)} total interest`], status: null,
      },
      ...calc.personalLoan.scenarios.map((scenario, index) => ({
        id: `financing-personal-${index}`, title: `Personal loan, ${scenario.termYears} years`,
        description: `${monthly(scenario.monthlyPaymentCents)} at ${rate(scenario.rateBps)}.`,
        meta: [`${money(scenario.totalInterestCents / 100)} total interest`], status: index < 2 ? 'Lower end of the range' : 'Higher end of the range',
      })),
      {
        id: 'financing-contractor', title: 'Contractor financing',
        description: `${monthly(calc.contractorFinancing.promoMonthlyIfPaidInFullCents)} to pay it off inside the ${calc.contractorFinancing.promoMonths}-month promotion; ${calc.contractorFinancing.warningText}`,
        meta: [`${rate(calc.contractorFinancing.ongoingAprBps)} APR if not paid in time`, `${money(calc.contractorFinancing.deferredInterestRiskCents / 100)} deferred-interest risk`], status: 'Read the terms',
      },
      {
        id: 'financing-cash', title: 'Pay cash',
        description: `Paying cash gives up about ${money(calc.payCash.opportunityCostFiveYearCents / 100)} of growth over five years and ${money(calc.payCash.opportunityCostTenYearCents / 100)} over ten, at ${rate(calc.payCash.opportunityCostRateBps)}.`,
        meta: ['No interest', 'Uses savings'], status: null,
      },
    ];
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'financing-options', title: 'Ways to pay',
      description: `Rates as of ${humanDate(new Date(calc.ratesAsOf)) ?? 'the latest update'}. ${calc.disclaimer}`,
      sections: [{ id: 'financing-options-all', title: `For ${money(calc.projectCostCents / 100)}`, count: options.length, items: options.map((option) => ({ ...option, href: null })) }],
      // Saving keeps today's rates and the equity snapshot, which only an owner can see (FRD v1.484).
      actions: isOwner && input.propertyId ? [{
        id: FINANCING_SCENARIO_ACTION_IDS.SAVE, label: 'Save this comparison', interactionType: 'START_WORKFLOW' as const, message: FINANCING_PROFILE_COMMAND_MESSAGE,
        operationId: 'FINANCING_PROFILE_COMMAND' as const, actionId: FINANCING_SCENARIO_ACTION_IDS.SAVE, entityType: FINANCING_PROJECT_COST_ENTITY_TYPE, entityId: String(calc.projectCostCents), style: 'PRIMARY' as const,
      }] : [],
    });
    // Presentation Quality 5: the date the comparison's rates are as of, as structured evidence rather than only prose in a description.
    blocks.push({
      type: 'EVIDENCE', id: 'financing-options-evidence', title: 'Rates used',
      items: [{ label: 'Rate assumptions for the ways to pay', source: 'Financing calculator rate assumptions', observedAt: new Date(calc.ratesAsOf).toISOString() }],
    });
  }

  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'financing-scenarios', title: 'Saved scenarios',
    description: isOwner ? 'Comparisons saved for this home. Choose the way to pay you are leaning toward, or archive one you no longer need.' : 'Comparisons saved for this home. Only an owner can change them.',
    sections: [{ id: 'financing-scenarios-all', title: 'Scenarios', count: scenarios.length, items: scenarios.slice(0, 10).map((scenario) => ({
      id: scenario.id, title: scenario.title || 'Untitled scenario', description: scenario.selectedOption ? `Leaning toward: ${String(scenario.selectedOption).toLowerCase().replace(/_/g, ' ')}` : null,
      meta: [money(scenario.projectCostCents / 100), `Saved ${humanDate(new Date(scenario.createdAt))}`], status: SCENARIO_STATUS_LABELS[String(scenario.status)] ?? String(scenario.status), href: null,
      actions: isOwner ? [FINANCING_SCENARIO_ACTION_IDS.CHOOSE, FINANCING_SCENARIO_ACTION_IDS.ARCHIVE].map((actionId) => ({
        id: actionId, label: actionId === FINANCING_SCENARIO_ACTION_IDS.CHOOSE ? 'Choose a way to pay' : 'Archive', interactionType: 'MUTATE_RECORD' as const, message: FINANCING_PROFILE_COMMAND_MESSAGE,
        operationId: 'FINANCING_PROFILE_COMMAND' as const, actionId, entityType: FINANCING_SCENARIO_ENTITY_TYPE, entityId: scenario.id, style: 'SECONDARY' as const,
      })) : [],
    })) }],
    actions: [],
  });
  blocks.push(BOUNDARY);
  return { status: 'ANSWERED', reasonCode: !isOwner || hasProfile || calc ? undefined : 'FINANCING_PROFILE_MISSING', blocks, suggestions: [] };
}

registerCapabilityHandler('financing.overview', async (envelope, deps) => {
  const propertyId = envelope.propertyId!;
  const access = await (deps.propertyAccess ?? ensurePropertyAccess(envelope.userId, propertyId));
  const amountDollars = parseFinancingAmountDollars(envelope.message);
  const isOwner = access.role === 'OWNER';
  // Only an owner's request reads the profile or the equity position at all.
  const [profile, equity, scenarios, calc] = await Promise.all([
    isOwner ? getProfile(propertyId) : Promise.resolve(null),
    isOwner ? getLatestEquity(propertyId).catch(() => null) : Promise.resolve(null),
    listScenarios(propertyId),
    amountDollars === null ? Promise.resolve(null) : calculate(propertyId, amountDollars * 100),
  ]);
  return financingFromView({ profile, equity, scenarios, calc, amountDollars, propertyId, isOwner });
});
