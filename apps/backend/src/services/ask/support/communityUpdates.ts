// Community inside Ask (register "Community"; FRD v1.479): the events, city alerts and trash and recycling information Desktop's Community page shows for a
// home's city. Pure: the routing patterns, which view a question asks for, and the declared actions that switch view. Read-only; nothing is saved.
export type CommunityView = 'ALL' | 'EVENTS' | 'ALERTS' | 'TRASH';

export const COMMUNITY_MESSAGES: Record<CommunityView, string> = {
  ALL: 'Show community updates for my home',
  EVENTS: 'Show community events near my home',
  ALERTS: 'Show city alerts for my area',
  TRASH: 'Show trash and recycling pickup for my home',
};
export const COMMUNITY_ACTION_IDS: Record<CommunityView, string> = {
  ALL: 'community-show-all', EVENTS: 'community-show-events', ALERTS: 'community-show-alerts', TRASH: 'community-show-trash',
};
export const COMMUNITY_VIEW_LABELS: Record<CommunityView, string> = { ALL: 'Show everything', EVENTS: 'Community events', ALERTS: 'City alerts', TRASH: 'Trash and recycling' };

/**
 * A question about what is going on in the home's community: events, the city's alerts or notices, or trash and recycling pickup. Writes ("add an event",
 * "log an event"), the home's own timeline, the event radar, the neighbourhood-change feed, weather, recalls and claims belong to other operations.
 */
export const communityPattern = new RegExp([
  String.raw`\b(?:community|local|city|neighbou?rhood|nearby)\s+(?:events?|festivals?|farmers?\s+markets?|happenings)\b`,
  String.raw`\b(?:events?|festivals?|farmers?\s+markets?|things to do)\b.{0,25}\b(?:near|around|in)\s+(?:my|the|our)\s+(?:home|house|area|neighbou?rhood|town|city)\b`,
  String.raw`\b(?:trash|garbage|recycling|rubbish|yard waste)\b.{0,30}\b(?:pick ?-?up|collection|schedule|day|days)\b`,
  String.raw`\b(?:when|what day)\b.{0,30}\b(?:trash|garbage|recycling)\b`,
  String.raw`\b(?:city|municipal|town|local)\s+(?:alerts?|notices?|announcements?|emergency notifications?)\b`,
  String.raw`\bcommunity\s+(?:alerts?|updates?|news)\b`,
].join('|'), 'i');
export const communityOtherIntentPattern = /\b(?:add|log|record|create|plan|host|organi[sz]e|weather|storm|forecast|recall|claim|maintenance|home event radar|event radar|risk replay|neighbou?rhood change|timeline|remind|notify|alert me)\b/i;

/** Which view a question asks for; a question that names more than one, or none, gets everything. */
export function communityViewFor(message: string): CommunityView {
  const wants: CommunityView[] = [];
  if (/\b(?:events?|festivals?|farmers?\s+markets?|things to do)\b/i.test(message)) wants.push('EVENTS');
  if (/\b(?:alerts?|notices?|announcements?|emergency|news)\b/i.test(message)) wants.push('ALERTS');
  if (/\b(?:trash|garbage|recycling|rubbish|yard waste|pick ?-?up|collection)\b/i.test(message)) wants.push('TRASH');
  return wants.length === 1 ? wants[0] : 'ALL';
}

// ── When: "this weekend", "tomorrow", "next week" ────────────────────────────────────────────────
export type CommunityWindowKey = 'TODAY' | 'TOMORROW' | 'THIS_WEEKEND' | 'NEXT_WEEKEND' | 'THIS_WEEK' | 'NEXT_WEEK';
export interface CommunityWindow { key: CommunityWindowKey; label: string; start: Date; end: Date }

const WINDOW_WORDS: ReadonlyArray<{ key: CommunityWindowKey; label: string; test: RegExp }> = [
  { key: 'NEXT_WEEKEND', label: 'next weekend', test: /\bnext weekend\b/i },
  { key: 'THIS_WEEKEND', label: 'this weekend', test: /\b(?:this|the) weekend\b|\bweekend\b/i },
  { key: 'NEXT_WEEK', label: 'next week', test: /\bnext week\b/i },
  { key: 'THIS_WEEK', label: 'this week', test: /\bthis week\b/i },
  { key: 'TOMORROW', label: 'tomorrow', test: /\btomorrow\b/i },
  { key: 'TODAY', label: 'today', test: /\btoday\b|\btonight\b/i },
];

/** The offset of a time zone from UTC at an instant, in milliseconds. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(instant));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second')) - Math.floor(instant / 1000) * 1000;
}
/** The instant a calendar day begins in a time zone (a daylight-saving change within the day is re-checked). */
function zonedMidnight(year: number, month: number, day: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day);
  let result = guess - zoneOffsetMs(guess, timeZone);
  const second = guess - zoneOffsetMs(result, timeZone);
  if (second !== result) result = second;
  return new Date(result);
}

/**
 * The span of days a question names, in the home's own time zone, or null when it names none. A weekend is Saturday and Sunday (the one under way if it is
 * already the weekend); a week runs from today to the end of Sunday, "next week" the Monday to Sunday after. A zone that is not valid falls back to UTC.
 */
export function communityDateWindow(message: string, now: Date, timeZone: string): CommunityWindow | null {
  const word = WINDOW_WORDS.find((candidate) => candidate.test.test(message));
  if (!word) return null;
  let zone = timeZone || 'UTC';
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { zone = 'UTC'; }
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value); const month = Number(parts.find((part) => part.type === 'month')?.value); const day = Number(parts.find((part) => part.type === 'day')?.value);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((part) => part.type === 'weekday')?.value ?? 'Sun');
  const at = (offsetDays: number) => { const base = new Date(Date.UTC(year, month - 1, day + offsetDays)); return zonedMidnight(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), zone); };
  const untilSaturday = (weekday + 1) % 7 === 0 ? 0 : (6 - weekday + 7) % 7; // days from today to the coming Saturday (0 on a Saturday)
  const untilMonday = ((1 - weekday) + 7) % 7 || 7; // days to the next Monday (a full week on a Monday)
  const spans: Record<CommunityWindowKey, [Date, Date]> = {
    TODAY: [at(0), at(1)],
    TOMORROW: [at(1), at(2)],
    THIS_WEEKEND: weekday === 0 ? [at(0), at(1)] : [at(untilSaturday), at(untilSaturday + 2)],
    NEXT_WEEKEND: weekday === 0 ? [at(6), at(8)] : [at(untilSaturday + 7), at(untilSaturday + 9)],
    THIS_WEEK: [at(0), at(untilMonday)],
    NEXT_WEEK: [at(untilMonday), at(untilMonday + 7)],
  };
  const [start, end] = spans[word.key];
  return { key: word.key, label: word.label, start, end };
}
