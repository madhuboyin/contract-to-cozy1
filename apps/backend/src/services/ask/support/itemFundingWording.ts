// Ask support: reading an item-funding question ("if I replace my roof in 5 years, how much do I need and how much more should I save?"). Shared by the
// router (askOperationRegistry) and the handler, so the words that send a message to the funding goal are the words the handler then reads.
import { INVENTORY_ITEM_ALIASES } from './inventoryItemAliases';
import { containsWholeWord } from './wholeWord';
import { parseTargetDate } from './targetDate';

const HVAC_NAMES = ['hvac', 'furnace', 'heat pump', 'air conditioner', 'air conditioning', 'ac', 'a/c'] as const;
const HVAC_PATTERN = /\b(?:hvac|furnace|heat pump|air conditioner|air conditioning|a\/?c(?: unit)?)\b/i;
const ALL_ITEMS_WORDING = /\b(?:all|every|everything|big[- ]?ticket|major|big|upcoming)\b.{0,30}\b(?:replacements?|repairs?|systems?|projects?|expenses?|items?|capital)\b|\beverything\b.{0,40}\b(?:due|replac\w*|needs?)\b|\b(?:replacements?|capital)\b.{0,15}\b(?:through|by|until|for)\b/i;

/** The words that name the systems and appliances in a message ("roof" gives roof and roofing). */
export function namedFundingTerms(message: string): string[] {
  const terms: string[] = [];
  if (HVAC_PATTERN.test(message)) terms.push(...HVAC_NAMES);
  for (const alias of INVENTORY_ITEM_ALIASES) if (alias.test.test(message)) terms.push(...alias.terms);
  return terms;
}

export function wantsAllFundingItems(message: string): boolean {
  return namedFundingTerms(message).length === 0 && ALL_ITEMS_WORDING.test(message);
}

/** The timeline items the message names, matched by whole word on the item's name and category. */
export function selectFundingItems<T extends { name: string; category: string }>(message: string, items: readonly T[]): T[] {
  const terms = namedFundingTerms(message);
  if (!terms.length) return [];
  return items.filter((item) => {
    const text = `${item.name} ${item.category}`.toLowerCase().replace(/_/g, ' ');
    return terms.some((term) => containsWholeWord(text, term));
  });
}

// Words that ask for an amount to put aside. "Capital", "reserve", "fund" and "budget" also name the plan read ("show my capital plan"), so they count only
// when the homeowner has named a date.
const STRONG_SAVING_WORDING = /\b(?:sav(?:e|ed|ing|ings)|set(?:ting)? aside|put(?:ting)? aside|afford|contribut\w+|how much (?:do|would|will|should) (?:i|we) need|how much (?:money|cash) (?:do|would|will) (?:i|we) need)\b|\benough\b.{0,40}\b(?:reserves?|fund|saved|savings)\b/i;
const WEAK_SAVING_WORDING = /\b(?:capital|fund(?:ing|ed)?|reserves?|budget(?:ing)?)\b/i;
const COST_WORDING = /\b(?:cost|price|how much)\b/i;
const REPLACE_WORDING = /\b(?:replac\w*|new|install\w*|rebuild|re-?roof\w*|enough|cover|afford)\b/i;
// A different money question (savings tips, insurance, a loan, a sale) is not "how much to put aside for this item".
const OTHER_INTENT = /\b(?:save money|savings opportunit\w+|rebates?|discounts?|cheaper|refinanc\w*|mortgage|loan|sell(?:ing)?|insurance|premium|warranty|warranties|claim|property tax)\b/i;

/**
 * Funding goal for named item(s) or all big replacements: a saving or capital word, a replacement cue, and either a named system or "all my big replacements".
 * A homeowner who only asks what something costs, or how old it is, has no saving word and stays with the item and inventory answers.
 */
export function isItemFundingGoalMessage(message: string): boolean {
  if (OTHER_INTENT.test(message)) return false;
  const dated = parseTargetDate(message) != null;
  if (!STRONG_SAVING_WORDING.test(message) && !(dated && WEAK_SAVING_WORDING.test(message))) return false;
  const named = namedFundingTerms(message).length > 0;
  const everything = wantsAllFundingItems(message);
  if (!named && !everything) return false;
  // "How much should I save for major replacements?" names no item and no date: that is the whole-home plan read.
  if (!named && !dated) return false;
  return REPLACE_WORDING.test(message) || dated;
}

const WRITE_INTENT = /\b(?:change|update|edit|correct|fix|set|add|record|enter|rename)\b/i;
// A verdict or a how-old question about the item is a different read.
const OTHER_ITEM_QUESTION = /\b(?:repair|repairs|repairing|or replace|should i|worth (?:repairing|replacing)|how old|how long|lifespan|life expectancy|condition|leak\w*|equity|afford|pay for|paying for|finance|financing|loan|mortgage|heloc|insurance|warranty)\b/i;

/**
 * "How much does a new roof cost" / "cost of a new dishwasher": a named system or appliance and a cost word with a replacement cue, and no saving goal.
 * A saving goal goes to `isItemFundingGoalMessage` first. A date is allowed: the cost is then shown grown to that date (ITEM_REPLACEMENT_COST).
 */
export function isItemCostMessage(message: string): boolean {
  if (OTHER_INTENT.test(message) || WRITE_INTENT.test(message) || OTHER_ITEM_QUESTION.test(message)) return false;
  if (STRONG_SAVING_WORDING.test(message)) return false;
  if (!COST_WORDING.test(message) || !/\b(?:new|replacement|replac\w*|install\w*)\b/i.test(message)) return false;
  return namedFundingTerms(message).length > 0;
}

// "How much of my reserve is set aside for the roof": what is already set aside for a named item, a fact the reserve fund holds. A question that asks how
// much to save, or what is needed, is the funding goal instead.
const ALLOCATION_WORDING = /\b(?:how much|what(?:'s| is| has been| have i)?)\b.{0,40}\b(?:set aside|allocated|earmarked|reserved|saved up|put (?:aside|toward|towards))\b/i;
const WOULD_NEED = /\b(?:should|need(?:s|ed)? to|have to|must|would|will need|more|additional|per month|each month|monthly|afford)\b/i;

export function isItemReserveAllocationMessage(message: string): boolean {
  // "set aside" is the subject here, not a verb that sets something.
  const withoutSetAside = message.replace(/\bset aside\b/gi, 'allocated');
  if (OTHER_INTENT.test(message) || WRITE_INTENT.test(withoutSetAside) || WOULD_NEED.test(message) || parseTargetDate(message) != null) return false;
  return ALLOCATION_WORDING.test(message) && namedFundingTerms(message).length > 0;
}
