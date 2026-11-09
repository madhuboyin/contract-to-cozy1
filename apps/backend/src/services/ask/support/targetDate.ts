// Ask support: the date a homeowner is planning around ("in 5 years", "in 18 months", "by 2031", "next year", "5-year plan").
// One parser so capital, ownership-cost and funding answers read the same words the same way. parseCapitalTimelineHorizonRequest only knew the literal
// 5 or 10 year toggle, so "in 3 years" or "by 2035" silently fell back to the stored horizon. Returns null when the message names no date.

export interface AskTargetDate {
  /** The date the homeowner named, at the start of the month it falls in (a plan has no day). */
  date: Date;
  /** The words as the homeowner would say them, for the answer: "in 5 years". */
  label: string;
  /** Whole months from `now` to `date`, never below 1. */
  months: number;
}

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
};

function toNumber(raw: string): number | null {
  const lower = raw.toLowerCase();
  if (/^\d+(?:\.\d+)?$/.test(lower)) return Number(lower);
  return lower in WORD_NUMBERS ? WORD_NUMBERS[lower] : null;
}

export function monthsBetween(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return Math.max(1, months);
}

function at(now: Date, monthsAhead: number, label: string): AskTargetDate {
  const date = new Date(now.getFullYear(), now.getMonth() + monthsAhead, 1);
  return { date, label, months: monthsBetween(now, date) };
}

const NUMBER = '(\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)';
const IN_N_UNITS = new RegExp(`\\b(?:in|within|over|after|for|next|over the next|in the next)\\s+(?:about |around |roughly )?${NUMBER}[\\s-]*(years?|yrs?|months?|mos?)\\b`, 'i');
const N_YEAR_PLAN = new RegExp(`\\b${NUMBER}[\\s-]*(years?|yrs?)\\b(?!\\s*old)`, 'i');
const BY_YEAR = /\b(?:by|before|through|until|in)\s+(?:the\s+(?:end|start) of\s+)?(20\d{2})\b/i;

/** The date named in `message`, or null. `now` is injectable so tests do not depend on the clock. */
export function parseTargetDate(message: string, now: Date = new Date()): AskTargetDate | null {
  const inUnits = IN_N_UNITS.exec(message);
  if (inUnits) {
    const amount = toNumber(inUnits[1]);
    if (amount != null && amount > 0 && amount <= 50) {
      const years = /^y/i.test(inUnits[2]);
      const months = Math.round(years ? amount * 12 : amount);
      return at(now, months, `in ${inUnits[1].toLowerCase() === 'a' || inUnits[1].toLowerCase() === 'an' ? 'one' : inUnits[1]} ${years ? (amount === 1 ? 'year' : 'years') : (amount === 1 ? 'month' : 'months')}`);
    }
  }
  const byYear = BY_YEAR.exec(message);
  if (byYear) {
    const year = Number(byYear[1]);
    if (year >= now.getFullYear()) {
      const months = Math.max(1, (year - now.getFullYear()) * 12 + (11 - now.getMonth()));
      return at(now, months, `by the end of ${year}`);
    }
  }
  if (/\bnext year\b/i.test(message)) return at(now, 12, 'next year');
  if (/\b(?:in|within) (?:a|one) year\b/i.test(message)) return at(now, 12, 'in one year');
  if (/\bnext (?:few|couple of) years\b/i.test(message)) return at(now, 36, 'in the next few years');
  if (/\bthis year\b/i.test(message)) return at(now, Math.max(1, 12 - now.getMonth()), 'this year');
  const plan = N_YEAR_PLAN.exec(message);
  if (plan && /\b(?:plan|horizon|outlook|forecast|budget)\b/i.test(message)) {
    const amount = toNumber(plan[1]);
    if (amount != null && amount > 0 && amount <= 50) return at(now, Math.round(amount * 12), `in ${plan[1]} years`);
  }
  return null;
}
