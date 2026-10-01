export function operationalWorkSnoozeDays(message: string): number {
  if (/\btomorrow\b/i.test(message)) return 1;
  if (/\bnext month|one month\b/i.test(message)) return 30;
  if (/\btwo weeks?\b/i.test(message)) return 14;
  if (/\bone week|\bweek\b/i.test(message)) return 7;
  return 14;
}
