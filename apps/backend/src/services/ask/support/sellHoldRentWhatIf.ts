// Sell / Hold / Rent what-if assumptions typed in the conversation (register P1 "Sell / Hold / Rent"; FRD v1.321). Pure.
//
// The page lets a household replace the appreciation, selling-cost, inflation, tax, insurance and maintenance assumptions, the home value and the rental
// assumptions (monthly rent, rent growth, vacancy, management). Ask does the same with an explicit hypothetical framing, computes the estimate for this
// answer only (nothing is saved) and shows it beside the standard one. The shared assumptions are read by the Break-Even parser, so one phrase means one thing.
import type { SellHoldRentInput } from '../../sellHoldRent.service';
import { parseBreakEvenWhatIf } from './breakEvenWhatIf';

export type SellHoldRentWhatIf = Pick<SellHoldRentInput,
  'appreciationRate' | 'sellingCostRate' | 'inflationRate' | 'propertyTaxGrowthRate' | 'insuranceGrowthRate' | 'maintenanceGrowthRate' | 'homeValueNow'
  | 'monthlyRentNow' | 'rentGrowthRate' | 'vacancyRate' | 'managementRate'>;

export const SELL_HOLD_RENT_WHAT_IF_LABELS: Record<keyof SellHoldRentWhatIf, string> = {
  appreciationRate: 'Home value growth per year', sellingCostRate: 'Selling costs', inflationRate: 'Inflation', propertyTaxGrowthRate: 'Property tax growth per year',
  insuranceGrowthRate: 'Insurance growth per year', maintenanceGrowthRate: 'Maintenance growth per year', homeValueNow: 'Home value today',
  monthlyRentNow: 'Monthly rent', rentGrowthRate: 'Rent growth per year', vacancyRate: 'Vacancy', managementRate: 'Management fee',
};
const MONEY_KEYS = new Set<keyof SellHoldRentWhatIf>(['homeValueNow', 'monthlyRentNow']);
export const isSellHoldRentMoneyKey = (key: keyof SellHoldRentWhatIf) => MONEY_KEYS.has(key);

const FRAMING = /\b(?:what if|what would happen if|suppose|assum\w+|hypothetically|if (?:i|we)(?: were to)? (?:rent|rented|sell|sold|hold|held|raise|raised|lower|lowered)|if (?:the|my|rent|home|house|appreciation|vacancy|taxes|insurance|inflation))\b/i;
const PCT = String.raw`(\d{1,2}(?:\.\d{1,2})?)\s*(?:%|percent)`;
const GAP = String.raw`[^\d%$.]{0,30}?`;

export function parseSellHoldRentWhatIf(message: string): SellHoldRentWhatIf | null {
  if (!FRAMING.test(message)) return null;
  const found: SellHoldRentWhatIf = {};
  let rest = message;
  const take = (term: string, high: number): number | undefined => {
    const match = rest.match(new RegExp(`(?:${term})${GAP}${PCT}`, 'i')) ?? rest.match(new RegExp(`${PCT}\\s+(?:${term})`, 'i'));
    if (!match) return undefined;
    rest = rest.replace(match[0], ' ');
    const value = Number(match[1]) / 100;
    return Number.isFinite(value) && value >= 0 && value <= high ? value : undefined;
  };
  const vacancy = take(String.raw`vacancy|vacant`, 0.5); if (vacancy !== undefined) found.vacancyRate = vacancy;
  const management = take(String.raw`(?:property )?management(?: fees?| rate)?`, 0.5); if (management !== undefined) found.managementRate = management;
  const rentGrowth = take(String.raw`rent(?: growth| increases?| rises?| growing)`, 0.2); if (rentGrowth !== undefined) found.rentGrowthRate = rentGrowth;
  const rent = rest.match(/\brent(?:s|ed)?(?: it)?(?: out)?(?: for| at| is| of| to)?\s*\$\s*([\d,]+(?:\.\d+)?)\s*(k)?(?:\s*(?:\/|a|per)\s*(?:mo|month))?/i);
  if (rent) {
    const raw = Number(rent[1].replace(/,/g, ''));
    const value = rent[2] ? raw * 1000 : raw;
    if (Number.isFinite(value) && value >= 100 && value <= 100_000) found.monthlyRentNow = value;
  }
  // The shared terms (appreciation, selling costs, inflation, tax, insurance, maintenance, home value) mean the same thing here as in Break-Even; its
  // general "cost growth" has no counterpart in this estimate and is dropped. A rent figure must not be read as the home value.
  const shared = parseBreakEvenWhatIf(rent ? message.replace(rent[0], ' ') : message);
  if (shared) {
    const { expenseGrowthRate: _ignored, sellingCostPercent, ...same } = shared;
    for (const [key, value] of Object.entries(same)) {
      if (key === 'appreciationRate' || key === 'inflationRate' || key === 'propertyTaxGrowthRate' || key === 'insuranceGrowthRate' || key === 'maintenanceGrowthRate') {
        if ((value as number) >= 0) (found as Record<string, number>)[key] = value as number;
      } else if (key === 'homeValueNow') found.homeValueNow = value as number;
    }
    if (sellingCostPercent !== undefined) found.sellingCostRate = sellingCostPercent;
  }
  return Object.keys(found).length ? found : null;
}
