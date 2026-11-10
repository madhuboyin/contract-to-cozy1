// Ask support: reading the cost growth rate the Home Capital Timeline used, shared by the funding goal and the replacement cost read so both take
// timeline costs back to today's money with the same rate.
import { deriveExpenseGrowthRate } from '../../financialAssumption.service';
import { DEFAULT_CAPITAL_COST_GROWTH_RATE } from './itemFunding';

export function growthRateOf(analysis: { inputsSnapshot?: unknown } | null): number {
  const snapshot = analysis?.inputsSnapshot;
  const stored = snapshot && typeof snapshot === 'object' ? (snapshot as Record<string, unknown>).financialAssumptions : null;
  if (stored && typeof stored === 'object') {
    const a = stored as Record<string, unknown>;
    if (['propertyTaxGrowthRate', 'insuranceGrowthRate', 'maintenanceGrowthRate', 'inflationRate'].every((key) => typeof a[key] === 'number')) {
      return deriveExpenseGrowthRate(a as unknown as Parameters<typeof deriveExpenseGrowthRate>[0]);
    }
  }
  return DEFAULT_CAPITAL_COST_GROWTH_RATE;
}
