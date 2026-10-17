import type { SellHoldRentInput } from './sellHoldRent.service';

// The contract for saved tool overrides (ToolOverride rows). One key convention, defined once, here:
//
//   - A row's `key` is the UPPER_SNAKE name below. That is what the pages save and what the API returns. There is no second spelling:
//     camel-case names such as "homeValueNow" are NOT keys; a row stored under one is ignored with an UNSUPPORTED_KEY reason.
//   - The estimator never reads raw rows. It receives the translated, validated values in its own typed input shape (`field`), produced here and nowhere else.
//   - A value outside its range is never coerced or clamped: it is ignored, and the reason is reported (`ignored`), so a bad saved value can neither
//     silently change an estimate nor disappear without a trace.
//   - Rates are decimals (0.035 means 3.5%). Money is whole US dollars (rent per month).
//   - A saved override is a scenario input for ONE tool. It never updates the canonical Home Record.
//
// To add an override: add a spec to the tool's list below, read the translated field in the estimator, and add a test that the key changes the estimate.
// A new tool gets its own list in TOOL_OVERRIDE_CONTRACTS; there is no free-form key space.

export type ToolOverrideUnit = 'USD' | 'USD_PER_MONTH' | 'DECIMAL_RATE' | 'MONTHS';

export interface ToolOverrideSpec<Field extends string> {
  /** The persisted key (ToolOverride.key). UPPER_SNAKE, exactly as written. */
  key: string;
  /** The estimator's typed input property this key feeds. */
  field: Field;
  unit: ToolOverrideUnit;
  /** Inclusive bounds. The estimator's own limits where it has them, so an accepted value is used exactly as saved. */
  min: number;
  max: number;
  integer?: boolean;
  label: string;
}

export type ToolOverrideIssueReason = 'UNSUPPORTED_KEY' | 'NOT_A_FINITE_NUMBER' | 'NOT_AN_INTEGER' | 'OUT_OF_RANGE';

export interface ToolOverrideIssue {
  key: string;
  reason: ToolOverrideIssueReason;
  /** Plain-language explanation, safe to show or log. */
  detail: string;
}

type SellHoldRentOverrideField =
  | 'homeValueNow' | 'monthlyRentNow'
  | 'appreciationRate' | 'sellingCostRate' | 'inflationRate' | 'propertyTaxGrowthRate' | 'insuranceGrowthRate' | 'maintenanceGrowthRate'
  | 'rentGrowthRate' | 'vacancyRate' | 'managementRate'
  | 'mortgageBalance' | 'mortgageAnnualRate' | 'remainingTermMonths' | 'monthlyPayment';

/** The translated values: the estimator's own input properties, present only for keys that were saved and valid. */
export type SellHoldRentSavedOverrides = Partial<Pick<SellHoldRentInput, SellHoldRentOverrideField>>;

const spec = (key: string, field: SellHoldRentOverrideField, unit: ToolOverrideUnit, min: number, max: number, label: string, integer = false): ToolOverrideSpec<SellHoldRentOverrideField> =>
  ({ key, field, unit, min, max, label, ...(integer ? { integer: true } : {}) });

export const SELL_HOLD_RENT_OVERRIDE_SPECS: readonly ToolOverrideSpec<SellHoldRentOverrideField>[] = Object.freeze([
  spec('HOME_VALUE_NOW', 'homeValueNow', 'USD', 10_000, 100_000_000, 'Home value now'),
  spec('MONTHLY_RENT_NOW', 'monthlyRentNow', 'USD_PER_MONTH', 100, 1_000_000, 'Monthly rent now'),
  spec('APPRECIATION_RATE', 'appreciationRate', 'DECIMAL_RATE', 0, 0.15, 'Appreciation rate'),
  spec('SELLING_COST_RATE', 'sellingCostRate', 'DECIMAL_RATE', 0.01, 0.12, 'Selling cost rate'),
  spec('INFLATION_RATE', 'inflationRate', 'DECIMAL_RATE', 0, 0.2, 'Inflation rate'),
  spec('PROPERTY_TAX_GROWTH_RATE', 'propertyTaxGrowthRate', 'DECIMAL_RATE', 0, 0.2, 'Property tax growth rate'),
  spec('INSURANCE_GROWTH_RATE', 'insuranceGrowthRate', 'DECIMAL_RATE', 0, 0.2, 'Insurance growth rate'),
  spec('MAINTENANCE_GROWTH_RATE', 'maintenanceGrowthRate', 'DECIMAL_RATE', 0, 0.2, 'Maintenance growth rate'),
  spec('RENT_GROWTH_RATE', 'rentGrowthRate', 'DECIMAL_RATE', 0, 0.1, 'Rent growth rate'),
  spec('VACANCY_RATE', 'vacancyRate', 'DECIMAL_RATE', 0, 0.25, 'Vacancy rate'),
  spec('MANAGEMENT_RATE', 'managementRate', 'DECIMAL_RATE', 0, 0.2, 'Management rate'),
  spec('MORTGAGE_BALANCE', 'mortgageBalance', 'USD', 1, 100_000_000, 'Mortgage balance'),
  spec('MORTGAGE_ANNUAL_RATE', 'mortgageAnnualRate', 'DECIMAL_RATE', 0, 0.25, 'Mortgage interest rate'),
  spec('REMAINING_TERM_MONTHS', 'remainingTermMonths', 'MONTHS', 1, 600, 'Remaining term (months)', true),
  spec('MONTHLY_PAYMENT', 'monthlyPayment', 'USD_PER_MONTH', 1, 1_000_000, 'Monthly payment'),
]);

export const TOOL_OVERRIDE_CONTRACTS: Readonly<Record<string, readonly ToolOverrideSpec<string>[]>> = Object.freeze({
  SELL_HOLD_RENT: SELL_HOLD_RENT_OVERRIDE_SPECS,
});

export const isSupportedOverrideTool = (toolKey: string): boolean => Object.prototype.hasOwnProperty.call(TOOL_OVERRIDE_CONTRACTS, toolKey);

const rangeText = (item: ToolOverrideSpec<string>) => `${item.min} to ${item.max}${item.unit === 'DECIMAL_RATE' ? ' (a decimal: 0.035 is 3.5%)' : ''}`;

/** Why one key/value pair cannot be used, or null when it can. */
export function toolOverrideIssue(toolKey: string, key: string, value: unknown): ToolOverrideIssue | null {
  const item = TOOL_OVERRIDE_CONTRACTS[toolKey]?.find((candidate) => candidate.key === key);
  if (!item) return { key, reason: 'UNSUPPORTED_KEY', detail: `"${key}" is not a ${toolKey} override key.` };
  if (typeof value !== 'number' || !Number.isFinite(value)) return { key, reason: 'NOT_A_FINITE_NUMBER', detail: `${item.label} must be a number.` };
  if (item.integer && !Number.isInteger(value)) return { key, reason: 'NOT_AN_INTEGER', detail: `${item.label} must be a whole number.` };
  if (value < item.min || value > item.max) return { key, reason: 'OUT_OF_RANGE', detail: `${item.label} must be between ${rangeText(item)}.` };
  return null;
}

/**
 * Translates persisted rows into the estimator's typed input values, once, at the service boundary. Invalid or unsupported rows are not coerced:
 * they are left out and returned in `ignored` with a structured reason. The last row wins if a key is repeated (storage prevents it).
 */
export function parseToolOverrides(toolKey: string, rows: ReadonlyArray<{ key: string; value: unknown }>): { values: Record<string, number>; ignored: ToolOverrideIssue[] } {
  const values: Record<string, number> = {};
  const ignored: ToolOverrideIssue[] = [];
  for (const row of rows) {
    const issue = toolOverrideIssue(toolKey, row.key, row.value);
    if (issue) { ignored.push(issue); continue; }
    const item = TOOL_OVERRIDE_CONTRACTS[toolKey].find((candidate) => candidate.key === row.key)!;
    values[item.field] = row.value as number;
  }
  return { values, ignored };
}

export function parseSellHoldRentOverrides(rows: ReadonlyArray<{ key: string; value: unknown }>): { values: SellHoldRentSavedOverrides; ignored: ToolOverrideIssue[] } {
  return parseToolOverrides('SELL_HOLD_RENT', rows) as { values: SellHoldRentSavedOverrides; ignored: ToolOverrideIssue[] };
}

/** Validates a write. A null value means "clear this saved override" and is valid for any supported key. */
export function validateToolOverrideWrite(toolKey: string, overrides: ReadonlyArray<{ key: string; value: number | null }>): ToolOverrideIssue[] {
  if (!isSupportedOverrideTool(toolKey)) return [{ key: toolKey, reason: 'UNSUPPORTED_KEY', detail: `"${toolKey}" does not support saved overrides.` }];
  const issues: ToolOverrideIssue[] = [];
  for (const row of overrides) {
    if (row.value === null) {
      if (!TOOL_OVERRIDE_CONTRACTS[toolKey].some((item) => item.key === row.key)) issues.push({ key: row.key, reason: 'UNSUPPORTED_KEY', detail: `"${row.key}" is not a ${toolKey} override key.` });
      continue;
    }
    const issue = toolOverrideIssue(toolKey, row.key, row.value);
    if (issue) issues.push(issue);
  }
  return issues;
}
