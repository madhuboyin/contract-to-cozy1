// Break-Even what-if assumptions typed in the conversation (register P1 "Break-Even"; FRD v1.320). Pure: framing, the recognised assumptions and their bounds.
//
// The Break-Even page lets a household replace the appreciation, cost-growth, inflation, tax, insurance, maintenance and selling-cost assumptions and the home
// value. Ask does the same with an explicit hypothetical framing ("what if appreciation is 5%"), computes the projection with those values for this answer only
// (nothing is saved: the page's route saves each override set as a reusable assumption set, Ask does not) and shows it beside the standard projection.
import type { BreakEvenInput } from '../../breakEven.service';

export type BreakEvenWhatIf = Pick<BreakEvenInput,
  'appreciationRate' | 'expenseGrowthRate' | 'inflationRate' | 'propertyTaxGrowthRate' | 'insuranceGrowthRate' | 'maintenanceGrowthRate' | 'sellingCostPercent' | 'homeValueNow'>;

export const BREAK_EVEN_WHAT_IF_LABELS: Record<keyof BreakEvenWhatIf, string> = {
  appreciationRate: 'Home value growth per year', expenseGrowthRate: 'Ownership cost growth per year', inflationRate: 'Inflation',
  propertyTaxGrowthRate: 'Property tax growth per year', insuranceGrowthRate: 'Insurance growth per year', maintenanceGrowthRate: 'Maintenance growth per year',
  sellingCostPercent: 'Selling costs', homeValueNow: 'Home value today',
};

const FRAMING = /\b(?:what if|what would happen if|suppose|assum\w+|hypothetically|if (?:the|my|home|house|appreciation|costs?|expenses?|taxes|insurance|inflation)|with (?:an? )?(?:appreciation|growth|inflation))\b/i;
const PCT = String.raw`(-?\d{1,2}(?:\.\d{1,2})?)\s*(?:%|percent)`;
const GAP = String.raw`[^\d%$.]{0,30}?`;
/** Reads "<term> ... N%" (or "N% <term>"), bounded; returns the value and the message with that phrase removed so a later, broader term cannot reuse its number. */
function take(text: string, term: string, low = -0.1, high = 0.25): { value?: number; rest: string } {
  const forward = new RegExp(`(?:${term})${GAP}${PCT}`, 'i');
  const backward = new RegExp(`${PCT}\\s+(?:annual\\s+|yearly\\s+)?(?:${term})`, 'i');
  const match = text.match(forward) ?? text.match(backward);
  if (!match) return { rest: text };
  const rest = text.replace(match[0], ' ');
  const value = Number(match[1]) / 100;
  return Number.isFinite(value) && value >= low && value <= high ? { value, rest } : { rest };
}

export function parseBreakEvenWhatIf(message: string): BreakEvenWhatIf | null {
  if (!FRAMING.test(message)) return null;
  const found: BreakEvenWhatIf = {};
  let rest = message;
  // Specific terms first, each consuming its phrase, so "selling costs 6%" or "maintenance costs 3%" never become the general cost-growth number.
  const set = <K extends keyof BreakEvenWhatIf>(key: K, term: string, low?: number, high?: number) => {
    const taken = take(rest, term, low, high);
    rest = taken.rest;
    if (taken.value !== undefined) found[key] = taken.value as BreakEvenWhatIf[K];
  };
  set('sellingCostPercent', String.raw`(?:selling|sale|closing) costs?`, 0, 0.2);
  set('propertyTaxGrowthRate', String.raw`property tax(?:es)?(?: growth| growing| rising| increas\w*)?`);
  set('insuranceGrowthRate', String.raw`insurance(?: premiums?)?(?: growth| growing| rising| increas\w*)?`);
  set('maintenanceGrowthRate', String.raw`maintenance(?: costs?)?(?: growth| growing| rising| increas\w*)?`);
  set('inflationRate', 'inflation');
  set('appreciationRate', String.raw`appreciat\w*|home value growth|(?:home|house|property) values? (?:grow\w*|rise\w*|rising|increas\w*)`);
  set('expenseGrowthRate', String.raw`(?:ownership )?(?:cost|expense)s?(?: growth| growing| rising| increas\w*| inflation)?|costs? (?:grow\w*|rise\w*|increas\w*)`);
  const worth = message.match(/\b(?:home|house|property)(?: is| was)?(?: now)?(?: worth| valued(?: at)?| value(?: of)?)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(k|m|million|thousand)?\b/i);
  if (worth) {
    const base = Number(worth[1].replace(/,/g, ''));
    const unit = (worth[2] ?? '').toLowerCase();
    const value = unit === 'k' || unit === 'thousand' ? base * 1_000 : unit === 'm' || unit === 'million' ? base * 1_000_000 : base;
    if (Number.isFinite(value) && value >= 10_000 && value <= 100_000_000) found.homeValueNow = value;
  }
  return Object.keys(found).length ? found : null;
}
