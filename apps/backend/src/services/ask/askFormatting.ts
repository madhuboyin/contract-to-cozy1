import { getAskPropertyTimezone } from './askExecutionContext';

// Small display formatters shared by the Ask handlers. Moved out of askOrchestrator.service.ts (FRD v1.97) so a handler
// in its own file does not need to import the orchestrator.

/** A date as "Sep 24, 2026" in the property's time zone; null when there is no date. */
/**
 * Due dates are stored as UTC-midnight calendar dates (that is how the date
 * picker saves them). Rendering one in a western property timezone shows the
 * previous day, so an exact UTC-midnight instant is formatted as the calendar
 * date it represents; any other instant is formatted in the property timezone.
 */
export function calendarAwareTimeZone(value: Date, timeZone: string): string {
  return value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0 ? 'UTC' : timeZone;
}

export function humanDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: calendarAwareTimeZone(value, getAskPropertyTimezone()) }).format(value);
}

/** Whole dollars, for example "$12,000". */
export function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

/** An internal code as words, for example "REPLACE_SOON" as "replace soon". */
export const readableCode = (value: string | null | undefined) => (value ? value.toLowerCase().replace(/_/g, ' ') : '');

/** An internal code as capitalised words, for example "REPLACE_SOON" as "Replace Soon". */
export const titleCase = (value: string) => readableCode(value).replace(/\b\w/g, (c) => c.toUpperCase());

const DISPLAY_TOKEN_LABELS: Record<string, string> = {
  ac: 'AC', co: 'CO', diy: 'DIY', hoa: 'HOA', hvac: 'HVAC', usd: 'USD',
};

/**
 * A human-facing fallback for enum values that do not have a domain-specific
 * label map. Known acronyms stay intact and compound service categories read
 * naturally instead of exposing database-token formatting.
 */
export function enumLabel(value: string | null | undefined): string {
  const words = readableCode(value).split(' ').filter(Boolean);
  return words.map((word) => DISPLAY_TOKEN_LABELS[word] ?? `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' ');
}
