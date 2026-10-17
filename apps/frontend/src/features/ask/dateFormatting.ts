/** Calendar-only Ask dates are stored at UTC midnight and must not shift with the browser timezone. */
export function formatAskDateOnly(value: string | Date | null | undefined, locale?: string): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale, { timeZone: 'UTC' });
}
