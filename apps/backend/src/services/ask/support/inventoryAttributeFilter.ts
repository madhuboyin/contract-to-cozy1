// Inventory questions about an attribute of the recorded items: condition, age, install or purchase year, cost, and "oldest". Pure and deterministic. An item that
// lacks the field a filter reads is never guessed at: it is left out of the result and counted, so the answer can say how many items could not be judged.
export interface FilterableItem {
  condition?: string | null;
  installedOn?: Date | null;
  purchasedOn?: Date | null;
  purchaseCostCents?: number | null;
}

export type InventoryAttributeFilter =
  | { kind: 'CONDITION'; condition: 'NEW' | 'GOOD' | 'FAIR' | 'POOR' }
  | { kind: 'OLDER_THAN_YEARS'; years: number }
  | { kind: 'INSTALLED_BEFORE'; year: number }
  | { kind: 'PURCHASED_IN'; year: number }
  | { kind: 'COST_OVER'; dollars: number }
  | { kind: 'OLDEST' };

const WORD_NUMBERS: Record<string, number> = { five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30 };
const numberOf = (raw: string): number | null => (/^\d+$/.test(raw) ? Number(raw) : WORD_NUMBERS[raw.toLowerCase()] ?? null);

/** The attribute filter a question names, or null. Only the first filter named is read; a question naming none is an ordinary lookup. */
export function parseInventoryAttributeFilter(message: string, now: Date = new Date()): InventoryAttributeFilter | null {
  const text = message.toLowerCase();
  const older = /\b(?:more than|over|older than|at least)\s+(\d+|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty)\s+years?(?:\s+old)?\b|\b(\d+|ten|fifteen|twenty)\+?\s*years?\s+old\b.{0,12}\bor\s+(?:older|more)\b/.exec(text);
  if (older) { const years = numberOf(older[1] ?? older[2]); if (years && years > 0 && years <= 100) return { kind: 'OLDER_THAN_YEARS', years }; }
  const before = /\b(?:installed|put in|built|bought|purchased)\s+(?:before|prior to)\s+((?:19|20)\d{2})\b/.exec(text);
  if (before) return { kind: 'INSTALLED_BEFORE', year: Number(before[1]) };
  const boughtIn = /\b(?:bought|buy|purchased|purchase|got)\b.{0,25}\b(this year|last year|in\s+((?:19|20)\d{2}))\b/.exec(text);
  if (boughtIn) return { kind: 'PURCHASED_IN', year: boughtIn[1] === 'this year' ? now.getFullYear() : boughtIn[1] === 'last year' ? now.getFullYear() - 1 : Number(boughtIn[2]) };
  const cost = /\b(?:cost|costing|worth|priced|paid)\b.{0,12}\b(?:more than|over|above)\s+\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(k)?\b/.exec(text) ?? /\b(?:more than|over|above)\s+\$\s*(\d{1,3}(?:,\d{3})+|\d+)(k)?\b/.exec(text);
  if (cost) { const dollars = Number(cost[1].replace(/,/g, '')) * (cost[2] ? 1000 : 1); if (dollars > 0) return { kind: 'COST_OVER', dollars }; }
  const condition = /\b(?:in|with)\s+(poor|fair|good|new)\s+condition\b|\b(poor|fair|good)\s+condition\b/.exec(text);
  if (condition) return { kind: 'CONDITION', condition: (condition[1] ?? condition[2]).toUpperCase() as 'NEW' | 'GOOD' | 'FAIR' | 'POOR' };
  if (/\b(?:oldest|the oldest)\b.{0,15}\b(?:item|thing|appliance|system)\b|\bwhat(?:'s| is) my oldest\b/.test(text)) return { kind: 'OLDEST' };
  return null;
}

const ageDate = (item: FilterableItem): Date | null => item.installedOn ?? item.purchasedOn ?? null;

export interface FilterOutcome<T> { items: T[]; /** Items that lack the field the filter reads, so were not judged. */ unjudged: number; basis: string }

export function applyInventoryAttributeFilter<T extends FilterableItem>(items: readonly T[], filter: InventoryAttributeFilter, now: Date = new Date()): FilterOutcome<T> {
  const judge = (read: (item: T) => boolean | null, basis: string): FilterOutcome<T> => {
    let unjudged = 0; const kept: T[] = [];
    for (const item of items) { const verdict = read(item); if (verdict === null) unjudged += 1; else if (verdict) kept.push(item); }
    return { items: kept, unjudged, basis };
  };
  switch (filter.kind) {
    case 'CONDITION': return judge((item) => (!item.condition || item.condition === 'UNKNOWN' ? null : item.condition === filter.condition), `a recorded condition of ${filter.condition.toLowerCase()}`);
    case 'OLDER_THAN_YEARS': {
      const cutoff = new Date(now.getFullYear() - filter.years, now.getMonth(), now.getDate());
      return judge((item) => { const date = ageDate(item); return date ? date <= cutoff : null; }, 'the install date, or the purchase date when none is recorded');
    }
    case 'INSTALLED_BEFORE': return judge((item) => { const date = ageDate(item); return date ? date.getFullYear() < filter.year : null; }, 'the install date, or the purchase date when none is recorded');
    case 'PURCHASED_IN': return judge((item) => (item.purchasedOn ? item.purchasedOn.getFullYear() === filter.year : null), 'the recorded purchase date');
    case 'COST_OVER': return judge((item) => (item.purchaseCostCents == null ? null : item.purchaseCostCents > filter.dollars * 100), 'the recorded purchase cost');
    case 'OLDEST': {
      const dated = items.filter((item) => ageDate(item)).sort((a, b) => ageDate(a)!.getTime() - ageDate(b)!.getTime());
      return { items: dated.slice(0, 1), unjudged: items.length - dated.length, basis: 'the install date, or the purchase date when none is recorded' };
    }
  }
}

/** One honest sentence about what the filter could not judge. */
export function unjudgedSentence(outcome: FilterOutcome<unknown>): string {
  return outcome.unjudged > 0
    ? ` ${outcome.unjudged} item${outcome.unjudged === 1 ? ' has' : 's have'} no ${outcome.basis.includes('condition') ? 'recorded condition' : outcome.basis.includes('cost') ? 'recorded purchase cost' : outcome.basis.includes('purchase date') && !outcome.basis.includes('install') ? 'recorded purchase date' : 'recorded date'}, so ${outcome.unjudged === 1 ? 'it was' : 'they were'} not judged.`
    : '';
}
