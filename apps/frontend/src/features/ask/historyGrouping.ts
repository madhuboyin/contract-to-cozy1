const DAY_MS = 24 * 60 * 60 * 1000;

function calendarDayOrdinal(value: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, calendar: 'gregory', numberingSystem: 'latn',
    year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(value);
  const number = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Math.floor(Date.UTC(number('year'), number('month') - 1, number('day')) / DAY_MS);
}

export function askHistoryGroupLabel(lastActiveAt: string, options: { now: Date; locale: string; timeZone: string }): string {
  const today = calendarDayOrdinal(options.now, options.timeZone);
  const activityDay = calendarDayOrdinal(new Date(lastActiveAt), options.timeZone);
  const ageInDays = today - activityDay;
  const relative = new Intl.RelativeTimeFormat(options.locale, { numeric: 'auto' });
  if (ageInDays <= 0) return relative.format(0, 'day');
  if (ageInDays === 1) return relative.format(-1, 'day');
  if (ageInDays <= 7) {
    const date = new Intl.DateTimeFormat(options.locale, { timeZone: 'UTC', month: 'short', day: 'numeric' });
    return `${date.format(new Date((today - 7) * DAY_MS))}–${date.format(new Date((today - 2) * DAY_MS))}`;
  }
  return new Intl.DateTimeFormat(options.locale, { timeZone: 'UTC', month: 'long', year: 'numeric' })
    .format(new Date(activityDay * DAY_MS));
}
