// Ask support: a dollar amount the homeowner typed ("$500", "1,200", "12k", "1.5 million"), and the monthly amount they say they can save.
// One reader so funding and what-if answers take the same words the same way. Returns null when no amount is named; a bare number counts only
// when it carries a dollar sign, a k/m/thousand/million unit or "dollars", so "in 5 years" is never an amount.

export interface AskMoneyAmount {
  /** Whole dollars, as typed. */
  dollars: number;
  /** The words as typed, for the answer: "$500". */
  label: string;
}

const UNIT_MULTIPLIER: Record<string, number> = { k: 1_000, thousand: 1_000, m: 1_000_000, million: 1_000_000 };
const NUMBER_PART = String.raw`\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k|m|thousand|million|dollars|bucks)?\b`;

/** Dollars from a captured number and optional unit word; null if it is not a usable positive amount. */
export function moneyFromParts(rawNumber: string, unit?: string): number | null {
  const base = Number(rawNumber.replace(/,/g, ''));
  const multiplier = UNIT_MULTIPLIER[(unit ?? '').toLowerCase()] ?? 1;
  const dollars = base * multiplier;
  return Number.isFinite(dollars) && dollars > 0 && dollars <= 1_000_000_000 ? dollars : null;
}

/** Every dollar amount in the message, in order. A bare number needs a $ sign or a unit word. */
export function parseMoneyAmounts(message: string): AskMoneyAmount[] {
  const found: AskMoneyAmount[] = [];
  for (const match of message.matchAll(new RegExp(NUMBER_PART, 'gi'))) {
    const hasSign = match[0].trimStart().startsWith('$');
    if (!hasSign && !match[2]) continue;
    const dollars = moneyFromParts(match[1], match[2]);
    if (dollars != null) found.push({ dollars, label: match[0].trim() });
  }
  return found;
}

const MONTHLY_AFTER = String.raw`\s*(?:a|per|each|every|/)\s*(?:month|mo)\b|\s*(?:monthly|/mo)\b`;
const MONTHLY_BEFORE = String.raw`(?:monthly (?:budget|contribution|savings?)|budget|set aside|put aside|save|saving|contribute|afford)(?: of| is| at| about| around| up to)?\s*`;

/** The monthly saving amount the homeowner states ("I can save $300 a month", "a monthly budget of $250"), or null. */
export function parseMonthlyBudget(message: string): AskMoneyAmount | null {
  const after = new RegExp(`${NUMBER_PART}(?=${MONTHLY_AFTER})`, 'i').exec(message);
  const before = new RegExp(`${MONTHLY_BEFORE}${NUMBER_PART}`, 'i').exec(message);
  const hit = after ?? (before && /\bmonth/i.test(message) ? before : null);
  if (!hit) return null;
  const dollars = moneyFromParts(hit[1], hit[2]);
  return dollars == null ? null : { dollars, label: `$${Math.round(dollars).toLocaleString('en-US')} a month` };
}
