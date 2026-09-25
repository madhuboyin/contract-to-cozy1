import { getAskPropertyTimezone } from './askExecutionContext';

// Small display formatters shared by the Ask handlers. Moved out of askOrchestrator.service.ts (FRD v1.97) so a handler
// in its own file does not need to import the orchestrator.

/** A date as "Sep 24, 2026" in the property's time zone; null when there is no date. */
export function humanDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: getAskPropertyTimezone() }).format(value);
}

/** Whole dollars, for example "$12,000". */
export function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

/** An internal code as words, for example "REPLACE_SOON" as "replace soon". */
export const readableCode = (value: string | null | undefined) => (value ? value.toLowerCase().replace(/_/g, ' ') : '');
