// BICC-4.1 (BUY-002/004/005): the buyer's candidate homes in conversation. One READ operation. It lists the person's own homes, and with two or more compares them side by side
// and shows the cost estimates built from the numbers they entered. It is scoped to the person, not to a property (a candidate is not a Property), needs no property to be
// selected, and writes nothing. A value that was not entered is shown as "Not entered", never filled in; nothing is a lender disclosure.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { money } from '../askFormatting';
import { candidatePropertyService } from '../buyer/candidateProperty.service';
import { candidateComparisonStateService } from '../buyer/candidateComparisonState.service';
import { BUYER_COST_DISCLAIMER, COMPARISON_DIMENSIONS, buyerCostBreakdown, compareCandidates, type CandidateFacts, type ComparisonDimensionKey } from '../buyer/candidateComparison';

const MAX_COMPARED = 6;
const DEFAULT_DIMENSIONS: readonly ComparisonDimensionKey[] = ['listPriceCents', 'annualPropertyTaxCents', 'annualInsuranceCents', 'hoaMonthlyCents', 'oneTimeWorkEstimateCents', 'bedrooms', 'bathrooms', 'livingAreaSqFt', 'yearBuilt'];
const DIMENSION_WORDS: ReadonlyArray<[ComparisonDimensionKey, RegExp]> = [
  ['listPriceCents', /\b(?:price|prices|cost of the home|asking)\b/i], ['annualPropertyTaxCents', /\b(?:property )?tax(?:es)?\b/i], ['annualInsuranceCents', /\binsurance\b/i], ['hoaMonthlyCents', /\bhoa\b/i],
  ['monthlyUtilitiesCents', /\butilit(?:y|ies)\b/i], ['oneTimeWorkEstimateCents', /\b(?:repairs?|work|renovation|fix(?:es|ing)?)\b/i], ['bedrooms', /\bbed(?:room)?s?\b/i], ['bathrooms', /\bbath(?:room)?s?\b/i],
  ['livingAreaSqFt', /\b(?:size|square f(?:ee|oo)t|sq\.? ?ft|living area)\b/i], ['yearBuilt', /\b(?:year built|age|how old)\b/i],
];

/** The dimensions the message names, in catalogue order; none named means the default set. */
export function dimensionsNamedIn(message: string, fallback: readonly ComparisonDimensionKey[] = DEFAULT_DIMENSIONS): ComparisonDimensionKey[] {
  const named = DIMENSION_WORDS.filter(([, pattern]) => pattern.test(message)).map(([key]) => key);
  return named.length ? COMPARISON_DIMENSIONS.map((d) => d.key).filter((key) => named.includes(key)) : [...fallback];
}

const NOT_ENTERED = 'Not entered';
const format = (unit: string, value: number | null): string => {
  if (value === null) return NOT_ENTERED;
  if (unit === 'USD_CENTS') return money(Math.round(value / 100));
  if (unit === 'SQ_FT') return `${Math.round(value).toLocaleString('en-US')} sq ft`;
  return String(value);
};
const cents = (value: number | null): string => (value === null ? NOT_ENTERED : money(Math.round(value / 100)));
const asFacts = (row: unknown): CandidateFacts => row as CandidateFacts;

export async function candidateHomesReviewResult(userId: string, message: string): Promise<AskOperationResult> {
  const everyHome = (await candidatePropertyService.list(userId, 'ACTIVE')).map(asFacts);
  // BUY-002: the person's saved comparison chooses which homes and, when the question names none, which things to compare. A question that names things still wins.
  const saved = await candidateComparisonStateService.get(userId).catch(() => null);
  const savedIds = saved ? new Set(saved.candidateIds) : null;
  const usingSaved = Boolean(saved && everyHome.filter((home) => savedIds!.has(home.id)).length >= 2);
  const rows = (usingSaved ? everyHome.filter((home) => savedIds!.has(home.id)) : everyHome).slice(0, MAX_COMPARED);

  if (!rows.length) {
    return {
      status: 'ANSWERED', reasonCode: 'CANDIDATE_HOMES_NONE', suggestions: [],
      blocks: [{ type: 'EMPTY_STATE', id: 'candidate-homes-empty', title: 'No homes added yet', body: 'You have not added any homes you are considering. Use the “Homes I’m considering” button beside the message box to add them. Once you add two or more with their price and costs, I can compare them side by side and show what each would cost to buy and own. Nothing is assumed for you.', actions: [] }] as AskPresentationBlock[],
    };
  }

  if (rows.length === 1) {
    const cost = buyerCostBreakdown(rows[0]);
    return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: 'CANDIDATE_HOMES_ONE', suggestions: [],
      blocks: [
        { type: 'SUMMARY', id: 'candidate-homes-summary', title: `You have one home added: ${rows[0].label}`, body: 'Add a second home with the “Homes I’m considering” button beside the message box and I can compare them. Here is what its cost looks like from the numbers you entered.', tone: 'DEFAULT', actions: [] },
        costTable([rows[0]], [cost]),
        { type: 'LIMITATION', id: 'candidate-homes-cost-limit', title: 'These are estimates', body: BUYER_COST_DISCLAIMER, severity: 'INFO' },
      ] as AskPresentationBlock[],
    };
  }

  const savedDimensions = usingSaved && saved?.dimensions.length ? (saved.dimensions as ComparisonDimensionKey[]) : DEFAULT_DIMENSIONS;
  const dimensions = dimensionsNamedIn(message, savedDimensions);
  const comparison = compareCandidates(rows, dimensions);
  if ('error' in comparison) return { status: 'READY_WITH_LIMITATIONS', reasonCode: 'CANDIDATE_HOMES_NOT_COMPARABLE', suggestions: [], blocks: [{ type: 'SUMMARY', id: 'candidate-homes-summary', title: 'I could not compare those', body: 'None of the items you asked about can be compared.', tone: 'CAUTION', actions: [] }] as AskPresentationBlock[] };

  const columns = [{ key: 'item', label: 'Compare' }, ...rows.map((home) => ({ key: home.id, label: home.label }))];
  const tableRows = comparison.rows.map((row) => ({
    id: row.key,
    values: Object.fromEntries([['item', row.label], ...row.cells.map((cell) => [cell.candidateId, `${format(row.unit, cell.value)}${cell.isBest ? ' (lowest)' : ''}`])]),
  }));
  const costs = rows.map((home) => buyerCostBreakdown(home));
  const anyGap = comparison.rows.some((row) => !row.fullyComparable);
  return {
    status: anyGap ? 'READY_WITH_LIMITATIONS' : 'ANSWERED', reasonCode: anyGap ? 'CANDIDATE_HOMES_PARTIAL' : 'CANDIDATE_HOMES_COMPARED', suggestions: [],
    blocks: [
      { type: 'SUMMARY', id: 'candidate-homes-summary', title: `Comparing ${rows.length} homes`, body: `Side by side on ${comparison.rows.map((r) => r.label.toLowerCase()).join(', ')}. "Lowest" is marked only where every home has a value. I do not pick a winner: you chose what matters.${usingSaved ? ` This is your saved comparison (${rows.length} of ${everyHome.length} homes); change it from “Homes I’m considering”.` : ''}`, tone: 'DEFAULT', actions: [] },
      { type: 'TABLE', id: 'candidate-homes-compare', title: 'Your homes side by side', columns, rows: tableRows } as AskPresentationBlock,
      costTable(rows, costs),
      { type: 'LIMITATION', id: 'candidate-homes-limits', title: 'What these numbers are', body: `${comparison.disclosure} ${BUYER_COST_DISCLAIMER}`, severity: anyGap ? 'CAUTION' : 'INFO' },
    ] as AskPresentationBlock[],
  };
}

function costTable(homes: readonly CandidateFacts[], costs: ReturnType<typeof buyerCostBreakdown>[]): AskPresentationBlock {
  const columns = [{ key: 'item', label: 'Estimated cost' }, ...homes.map((home) => ({ key: home.id, label: home.label }))];
  const line = (id: string, label: string, pick: (cost: ReturnType<typeof buyerCostBreakdown>) => { cents: number | null; missing: string[] }) => ({
    id, values: Object.fromEntries([['item', label], ...homes.map((home, index) => { const result = pick(costs[index]); return [home.id, result.cents === null ? `${NOT_ENTERED}${result.missing.length ? ` (needs ${result.missing.length} more)` : ''}` : cents(result.cents)]; })]),
  });
  return {
    type: 'TABLE', id: 'candidate-homes-cost', title: 'What each would cost, from your numbers', columns,
    rows: [
      line('price', 'Purchase price', (c) => ({ cents: c.purchasePrice.cents, missing: c.purchasePrice.missing })),
      line('cash', 'Estimated cash to close', (c) => c.estimatedCashToClose),
      line('monthly', 'Estimated monthly cost to own', (c) => c.estimatedMonthlyOwnership),
      line('work', 'One-time work', (c) => ({ cents: c.oneTimeWork.cents, missing: c.oneTimeWork.missing })),
    ],
  } as AskPresentationBlock;
}

registerCapabilityHandler('candidate-homes.review', async (envelope) => candidateHomesReviewResult(envelope.userId, envelope.message));
