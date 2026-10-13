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
export function financingFromView(input: { profile: Profile; equity: Equity | null; scenarios: readonly Scenario[]; calc: FinancingResultSet | null; amountDollars: number | null }): AskOperationResult {
  const { profile, equity, scenarios, calc, amountDollars } = input;
  const blocks: AskPresentationBlock[] = [];
  const hasProfile = Boolean(profile && profile.mortgageStatus !== 'UNKNOWN');
  const equityLine = equity && equity.estimatedValueCents > 0
    ? `About ${Number(equity.equityPercent)}% equity (${dollars(equity.equityCents)}) on a home valued near ${dollars(equity.estimatedValueCents)}, based on ${EQUITY_SOURCE_LABELS[String(equity.estimatedValueSource)] ?? 'your recorded value'}.`
    : null;
  blocks.push({
    type: 'SUMMARY', id: 'financing-summary',
    title: calc ? `Financing a ${money(calc.projectCostCents / 100)} project` : equityLine ? `About ${Number(equity!.equityPercent)}% equity in your home` : 'No financing details recorded yet',
    body: calc
      ? `Five ways to pay for it, side by side. ${calc.helocEligible ? `Your equity looks sufficient for a HELOC up to ${money(calc.helocCapacityCents / 100)}.` : 'Your recorded equity does not look sufficient for a HELOC, so that option is shown for comparison only.'}`
      : equityLine ?? 'Add your home value and mortgage details to see your equity and what you could borrow. Editing the financing details is not currently available in Ask; asking about refinancing records a mortgage.',
    tone: 'DEFAULT', actions: [],
  });

  // The numbers behind the answer.
  const facts: Array<{ label: string; value: string | null }> = [
    { label: 'Mortgage', value: profile ? MORTGAGE_STATUS_LABELS[profile.mortgageStatus] ?? null : 'Not recorded' },
    { label: 'Type', value: profile?.mortgageType ? MORTGAGE_TYPE_LABELS[String(profile.mortgageType)] ?? String(profile.mortgageType) : null },
    { label: 'Balance', value: dollars(profile?.currentMortgageBalanceCents) },
    { label: 'Rate', value: rate(profile?.interestRateBps) },
    { label: 'Monthly payment', value: dollars(profile?.monthlyPaymentCents) ? `${dollars(profile?.monthlyPaymentCents)}/month` : null },
    { label: 'Remaining term', value: profile?.remainingTermMonths ? `${Math.round(profile.remainingTermMonths / 12 * 10) / 10} years` : null },
    ...(equity && equity.estimatedValueCents > 0 ? [
      { label: 'Equity', value: `${dollars(equity.equityCents)} (${Number(equity.equityPercent)}%)` },
      { label: 'Loan to value', value: `${Number(equity.ltvPercent)}%` },
      { label: 'HELOC', value: equity.helocEligible ? `May qualify, up to ${dollars(equity.helocCapacityCents)}` : 'Not likely at this equity level' },
    ] : []),
  ].filter((fact) => fact.value);
  if (facts.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'financing-numbers', title: 'Your numbers',
      description: hasProfile ? 'From the financing details recorded for this home.' : 'Little is recorded, so these are partial.',
      sections: [{ id: 'financing-numbers-all', title: 'Mortgage and equity', count: facts.length,
        items: facts.map((fact, index) => ({ id: `financing-fact-${index}`, title: fact.label, description: fact.value, meta: [], status: null, href: null })) }],
      actions: [],
    });
  }

  if (calc) {
    const options: Array<{ id: string; title: string; description: string; meta: string[]; status: string | null }> = [
      {
        id: 'financing-heloc', title: 'Home equity line of credit (HELOC)',
        description: `${monthly(calc.heloc.drawMonthlyPaymentCents)} while drawing (interest only), then ${monthly(calc.heloc.repaymentMonthlyPaymentCents)} to repay over ten years.`,
        meta: [`${rate(calc.heloc.rateBps)} variable`, `${money(calc.heloc.totalInterestCents / 100)} total interest`], status: calc.helocEligible ? 'You may qualify' : 'May not qualify',
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
      actions: [],
    });
  } else if (amountDollars === null) {
    blocks.push({
      type: 'LIMITATION', id: 'financing-amount-hint', severity: 'INFO', title: 'Ask about a specific project',
      body: 'Name a project cost, for example "what would a $40,000 project cost to finance", and the options are compared side by side.',
    });
  }

  if (scenarios.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'financing-scenarios', title: 'Saved scenarios',
      description: 'Calculations you saved earlier. Saving a new one is not currently available in Ask.',
      sections: [{ id: 'financing-scenarios-all', title: 'Scenarios', count: scenarios.length, items: scenarios.slice(0, 10).map((scenario) => ({
        id: scenario.id, title: scenario.title || 'Untitled scenario', description: scenario.selectedOption ? `Leaning toward: ${String(scenario.selectedOption).toLowerCase().replace(/_/g, ' ')}` : null,
        meta: [money(scenario.projectCostCents / 100), `Saved ${humanDate(new Date(scenario.createdAt))}`], status: SCENARIO_STATUS_LABELS[String(scenario.status)] ?? String(scenario.status), href: null,
      })) }],
      actions: [],
    });
  }
  blocks.push(BOUNDARY);
  return { status: 'ANSWERED', reasonCode: hasProfile || calc ? undefined : 'FINANCING_PROFILE_MISSING', blocks, suggestions: [] };
}

registerCapabilityHandler('financing.overview', async (envelope) => {
  const propertyId = envelope.propertyId!;
  const amountDollars = parseFinancingAmountDollars(envelope.message);
  const [profile, equity, scenarios, calc] = await Promise.all([
    getProfile(propertyId),
    getLatestEquity(propertyId).catch(() => null),
    listScenarios(propertyId),
    amountDollars === null ? Promise.resolve(null) : calculate(propertyId, amountDollars * 100),
  ]);
  return financingFromView({ profile, equity, scenarios, calc, amountDollars });
});
