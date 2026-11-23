// BICC-BUY-004 / BUY-005: comparing candidate homes and breaking down what a purchase would cost. Pure. Two rules govern everything here: a value that was not entered is
// MISSING (never defaulted, never guessed), and nothing is presented as a lender disclosure or commitment. Where a total depends on a missing input, the total is null and
// the missing inputs are named, so the buyer can see exactly what to add.
import { computeMonthlyPayment } from '../../tools/mortgageMath';

export interface CandidateFacts {
  id: string; label: string;
  listPriceCents?: number | null; bedrooms?: number | null; bathrooms?: number | null; livingAreaSqFt?: number | null; yearBuilt?: number | null;
  annualPropertyTaxCents?: number | null; annualInsuranceCents?: number | null; hoaMonthlyCents?: number | null; monthlyUtilitiesCents?: number | null; oneTimeWorkEstimateCents?: number | null;
  downPaymentPercent?: number | null; mortgageRatePercent?: number | null; mortgageTermMonths?: number | null; closingCostPercent?: number | null;
  provenance?: Record<string, { source?: string; asOf?: string } | undefined> | null;
}

// ---- comparison (BUY-004) --------------------------------------------------------------------------------------------------------------------
export const COMPARISON_DIMENSIONS = [
  { key: 'listPriceCents', label: 'List price', unit: 'USD_CENTS', better: 'LOWER' },
  { key: 'bedrooms', label: 'Bedrooms', unit: 'COUNT', better: null },
  { key: 'bathrooms', label: 'Bathrooms', unit: 'COUNT', better: null },
  { key: 'livingAreaSqFt', label: 'Living area', unit: 'SQ_FT', better: null },
  { key: 'yearBuilt', label: 'Year built', unit: 'YEAR', better: null },
  { key: 'annualPropertyTaxCents', label: 'Property tax per year', unit: 'USD_CENTS', better: 'LOWER' },
  { key: 'annualInsuranceCents', label: 'Insurance per year', unit: 'USD_CENTS', better: 'LOWER' },
  { key: 'hoaMonthlyCents', label: 'HOA per month', unit: 'USD_CENTS', better: 'LOWER' },
  { key: 'monthlyUtilitiesCents', label: 'Utilities per month', unit: 'USD_CENTS', better: 'LOWER' },
  { key: 'oneTimeWorkEstimateCents', label: 'One-time work', unit: 'USD_CENTS', better: 'LOWER' },
] as const;
export type ComparisonDimensionKey = typeof COMPARISON_DIMENSIONS[number]['key'];

export interface ComparisonCell { candidateId: string; value: number | null; source: string | null; asOf: string | null; isBest: boolean }
export interface ComparisonRow { key: ComparisonDimensionKey; label: string; unit: string; cells: ComparisonCell[]; missingFor: string[]; /** True only when every compared candidate has the value, so "best" is never decided on partial data. */ fullyComparable: boolean }
export interface ComparisonResult { candidates: Array<{ id: string; label: string }>; rows: ComparisonRow[]; disclosure: string; unknownDimensions: string[] }

/**
 * Side by side, for the dimensions the buyer chose. At least two candidates are needed. A "best" marker appears only on a dimension where it has a direction (lower is better)
 * AND every candidate has a value; otherwise the row says who is missing it. No overall winner is computed: the buyer chose the dimensions, so the buyer weighs them.
 */
export function compareCandidates(candidates: readonly CandidateFacts[], dimensions: readonly string[]): ComparisonResult | { error: 'NEED_AT_LEAST_TWO' | 'NO_VALID_DIMENSION' } {
  if (candidates.length < 2) return { error: 'NEED_AT_LEAST_TWO' };
  const chosen = COMPARISON_DIMENSIONS.filter((dimension) => dimensions.includes(dimension.key));
  const unknownDimensions = dimensions.filter((key) => !COMPARISON_DIMENSIONS.some((dimension) => dimension.key === key));
  if (!chosen.length) return { error: 'NO_VALID_DIMENSION' };
  const rows: ComparisonRow[] = chosen.map((dimension) => {
    const values = candidates.map((candidate) => { const raw = candidate[dimension.key]; return typeof raw === 'number' && Number.isFinite(raw) ? raw : null; });
    const present = values.filter((value): value is number => value !== null);
    const fullyComparable = present.length === candidates.length;
    const best = dimension.better === 'LOWER' && fullyComparable ? Math.min(...present) : null;
    return {
      key: dimension.key, label: dimension.label, unit: dimension.unit, fullyComparable,
      missingFor: candidates.filter((_, index) => values[index] === null).map((candidate) => candidate.id),
      cells: candidates.map((candidate, index) => ({
        candidateId: candidate.id, value: values[index],
        source: values[index] === null ? null : candidate.provenance?.[dimension.key]?.source ?? null,
        asOf: values[index] === null ? null : candidate.provenance?.[dimension.key]?.asOf ?? null,
        isBest: best !== null && values[index] === best && present.filter((value) => value === best).length === 1,
      })),
    };
  });
  const gaps = rows.filter((row) => !row.fullyComparable);
  return {
    candidates: candidates.map((candidate) => ({ id: candidate.id, label: candidate.label })),
    rows, unknownDimensions,
    disclosure: gaps.length
      ? `${gaps.length} of ${rows.length} compared item${rows.length === 1 ? '' : 's'} ${gaps.length === 1 ? 'is' : 'are'} missing for at least one home, so ${gaps.length === 1 ? 'it is' : 'they are'} shown as not entered and not compared. Nothing was filled in for you.`
      : 'Every compared item is entered for every home. These are the values you or a listing supplied, not verified facts.',
  };
}

// ---- buyer cost (BUY-005) -----------------------------------------------------------------------------------------------------------------
export type LineBasis = 'ENTERED' | 'ESTIMATED_FROM_ENTERED' | 'MISSING';
export interface CostLine { key: string; label: string; cents: number | null; basis: LineBasis; /** The inputs this line needs and does not have. */ missing: string[] }
export interface BuyerCostBreakdown {
  candidateId: string;
  purchasePrice: CostLine;
  estimatedCashToClose: { cents: number | null; lines: CostLine[]; missing: string[] };
  estimatedMonthlyOwnership: { cents: number | null; lines: CostLine[]; missing: string[] };
  oneTimeWork: CostLine;
  /** Always present: these are the buyer's own inputs and arithmetic, never a Loan Estimate or Closing Disclosure. */
  disclaimer: string;
}
export const BUYER_COST_DISCLAIMER = 'These figures are estimates from the numbers you entered. They are not a lender disclosure, quote or commitment, and they change with your actual loan, taxes, insurance and closing costs.';

const money = (cents: number): number => Math.round(cents);
const entered = (key: string, label: string, cents: number | null | undefined): CostLine => (typeof cents === 'number' && Number.isFinite(cents) ? { key, label, cents: money(cents), basis: 'ENTERED', missing: [] } : { key, label, cents: null, basis: 'MISSING', missing: [key] });
const sumOrNull = (lines: readonly CostLine[], required: readonly string[]): { cents: number | null; missing: string[] } => {
  const missing = [...new Set(lines.filter((line) => required.includes(line.key)).flatMap((line) => line.missing))];
  return { cents: missing.length ? null : lines.reduce((sum, line) => sum + (line.cents ?? 0), 0), missing };
};

/**
 * Purchase price, estimated cash to close, estimated monthly ownership cost and one-time work, kept as four separate answers. A figure is computed only from inputs the buyer
 * entered; an input that is not entered makes the dependent figure null and is named, never defaulted. Optional recurring lines (HOA, utilities) that are not entered are shown
 * as MISSING but do not block the total, because a home with no HOA is a real case; they are listed in `missing` on the total so the omission stays visible.
 */
export function buyerCostBreakdown(candidate: CandidateFacts): BuyerCostBreakdown {
  const price = entered('listPriceCents', 'Purchase price', candidate.listPriceCents);
  const priceCents = price.cents;

  const percentLine = (key: string, label: string, percent: number | null | undefined): CostLine => {
    if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) return { key, label, cents: null, basis: 'MISSING', missing: [key] };
    if (priceCents === null) return { key, label, cents: null, basis: 'MISSING', missing: ['listPriceCents'] };
    return { key, label, cents: money((priceCents * percent) / 100), basis: 'ESTIMATED_FROM_ENTERED', missing: [] };
  };
  const downPayment = percentLine('downPaymentPercent', 'Down payment', candidate.downPaymentPercent);
  const closingCosts = percentLine('closingCostPercent', 'Closing costs', candidate.closingCostPercent);
  const cashLines = [downPayment, closingCosts];
  const cash = sumOrNull(cashLines, ['downPaymentPercent', 'closingCostPercent', 'listPriceCents']);

  const loanLine = ((): CostLine => {
    const rate = candidate.mortgageRatePercent; const term = candidate.mortgageTermMonths; const down = candidate.downPaymentPercent;
    const missing = [priceCents === null ? 'listPriceCents' : null, typeof down !== 'number' ? 'downPaymentPercent' : null, typeof rate !== 'number' ? 'mortgageRatePercent' : null, typeof term !== 'number' || term < 1 ? 'mortgageTermMonths' : null].filter((value): value is string => value !== null);
    if (missing.length || priceCents === null || typeof down !== 'number' || typeof rate !== 'number' || typeof term !== 'number') return { key: 'principalAndInterest', label: 'Mortgage principal and interest', cents: null, basis: 'MISSING', missing };
    const principalDollars = (priceCents * (1 - Math.min(100, Math.max(0, down)) / 100)) / 100;
    const paymentDollars = computeMonthlyPayment({ balanceNow: principalDollars, annualRate: rate / 100, remainingTermMonths: term });
    return { key: 'principalAndInterest', label: 'Mortgage principal and interest', cents: money(paymentDollars * 100), basis: 'ESTIMATED_FROM_ENTERED', missing: [] };
  })();
  const perMonth = (key: string, label: string, annual: number | null | undefined): CostLine => (typeof annual === 'number' && Number.isFinite(annual) ? { key, label, cents: money(annual / 12), basis: 'ESTIMATED_FROM_ENTERED', missing: [] } : { key, label, cents: null, basis: 'MISSING', missing: [key] });
  const monthlyLines = [loanLine, perMonth('annualPropertyTaxCents', 'Property tax', candidate.annualPropertyTaxCents), perMonth('annualInsuranceCents', 'Insurance', candidate.annualInsuranceCents), entered('hoaMonthlyCents', 'HOA', candidate.hoaMonthlyCents), entered('monthlyUtilitiesCents', 'Utilities', candidate.monthlyUtilitiesCents)];
  // The mortgage, tax and insurance are required for a total; HOA and utilities may legitimately be zero or absent, so they are named when missing but do not block it.
  const monthlyRequired = sumOrNull(monthlyLines, ['principalAndInterest', 'annualPropertyTaxCents', 'annualInsuranceCents']);
  const optionalMissing = monthlyLines.filter((line) => ['hoaMonthlyCents', 'monthlyUtilitiesCents'].includes(line.key)).flatMap((line) => line.missing);
  return {
    candidateId: candidate.id,
    purchasePrice: price,
    estimatedCashToClose: { cents: cash.cents, lines: cashLines, missing: cash.missing },
    estimatedMonthlyOwnership: { cents: monthlyRequired.cents, lines: monthlyLines, missing: [...monthlyRequired.missing, ...optionalMissing] },
    oneTimeWork: entered('oneTimeWorkEstimateCents', 'One-time work', candidate.oneTimeWorkEstimateCents),
    disclaimer: BUYER_COST_DISCLAIMER,
  };
}
