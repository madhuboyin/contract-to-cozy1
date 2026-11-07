// Ask handler support: whole-word matching of an appliance or system name inside an item's text. A bare substring test made "washer" match
// "Dishwasher", so "do i need a new washing machine" asked the homeowner to choose between a dishwasher and the washer they meant.
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when `term` appears in `text` as its own word or words (case-insensitive), not inside a longer word. */
export function containsWholeWord(text: string, term: string): boolean {
  const needle = term.trim();
  if (!needle) return false;
  return new RegExp(`(?<![a-z0-9])${escapeRegExp(needle)}(?![a-z0-9])`, 'i').test(text);
}
