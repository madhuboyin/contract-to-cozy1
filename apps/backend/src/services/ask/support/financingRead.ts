// The Financing read and the project-financing calculator inside Ask (register P0 "Financing", slices FN-A and FN-B; FRD v1.314). Pure: labels, the
// typed-request pattern and the amount parser, shared by the handler and the routing registry.
//
// The calculator is the page's own stateless one (rates are national averages, a result is not an offer). "$40,000", "40k", "1.5m" and "40000 dollars"
// are read as dollars; a request with no amount answers the overview and asks for one.

export const MORTGAGE_STATUS_LABELS: Record<string, string> = { UNKNOWN: 'Not recorded', MORTGAGED: 'Has a mortgage', NO_MORTGAGE: 'No mortgage' };
export const MORTGAGE_TYPE_LABELS: Record<string, string> = {
  FIXED_30: '30-year fixed', FIXED_20: '20-year fixed', FIXED_15: '15-year fixed',
  ARM_5: '5/1 adjustable-rate', ARM_7: '7/1 adjustable-rate', FHA_30: '30-year FHA', VA_30: '30-year VA', JUMBO_30: '30-year jumbo',
  // Legacy values remain readable for records created before the canonical MortgageType enum was narrowed.
  CONVENTIONAL: 'Conventional', FHA: 'FHA', VA: 'VA', USDA: 'USDA', JUMBO: 'Jumbo', ARM: 'Adjustable rate', FIXED: 'Fixed rate', OTHER: 'Other',
};
export const EQUITY_SOURCE_LABELS: Record<string, string> = {
  APPRECIATION_TRACKER: 'your recorded home value', PURCHASE_PRICE: 'your purchase price, because no appraisal is recorded', USER_ENTERED: 'a value you entered',
};
export const SCENARIO_STATUS_LABELS: Record<string, string> = { DRAFT: 'Draft', SAVED: 'Saved', ARCHIVED: 'Archived' };

const financingPattern = /\b(?:how much (?:home )?equity|home[- ]equity|heloc|equity (?:position|loan|line)|loan[- ]to[- ]value|\bltv\b)\b|\b(?:finance|financing)\b.{0,40}\b(?:project|remodel|renovation|repair|roof|kitchen|bath(?:room)?|addition|work|options?)\b|\boptions? (?:to|for) financ\w+|\bhow (?:should|could|can|would) i (?:pay for|finance)\b|\bcost to finance\b|\bshow my (?:home )?financing\b|\b(?:home )?financing overview\b/i;
const excluded = /\b(?:refinanc\w*|closing|lender|contingenc\w*|mortgage rates?|loan estimate|underwriting|appraisal)\b/i;
export const isFinancingRequest = (message: string): boolean => financingPattern.test(message) && !excluded.test(message);

/** The project cost in dollars named in a message, or null. Takes the first amount; 1,000 to 100,000,000. */
export function parseFinancingAmountDollars(message: string): number | null {
  const m = message.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d+)?)\s*(k|m|thousand|million)?\b|\b(\d+(?:\.\d+)?)\s*(k|m|thousand|million)\b|\b(\d{4,9})\s*(?:dollars|bucks)\b/i);
  if (!m) return null;
  const raw = m[1] ?? m[3] ?? m[5];
  const suffix = (m[2] ?? m[4] ?? '').toLowerCase();
  let value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (suffix === 'k' || suffix === 'thousand') value *= 1_000;
  if (suffix === 'm' || suffix === 'million') value *= 1_000_000;
  value = Math.round(value);
  return value >= 1_000 && value <= 100_000_000 ? value : null;
}
