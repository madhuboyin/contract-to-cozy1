// Searching the recorded materials by product, colour code, supplier or any recorded word (FRD v1.477). Desktop's Material Specs page has a search box
// (MaterialSpecService.searchSpecs: label, manufacturer, product name, colour code, SKU and notes, the active materials, the first 20); the Ask list ignored
// the words of the question and always showed the whole list. Pure: what term a message asks for, and the declared action that clears it.
export const MATERIAL_SPECS_SHOW_ALL_ACTION_ID = 'material-specs-show-all';
export const MATERIAL_SPECS_SHOW_ALL_MESSAGE = 'Show my material specs';
export const MATERIAL_SEARCH_MAX_LENGTH = 80;

const FILLER = /^(?:my|our|the|a|an|any|all|of|material|materials|specs?|recorded|saved|home|house)$/i;
const ROOM_ONLY = /^(?:(?:the|my|our)\s+)?(?:\w+\s+)?(?:room|kitchen|bedroom|bathroom|bath|garage|office|basement|laundry|hall|hallway|attic|porch|deck|living|dining|nursery|closet|pantry|entry|foyer|exterior|interior)s?$/i;
const clean = (raw: string): string | null => {
  const words = raw.replace(/[?!.]+$/g, '').replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim().split(/\s+/).filter(Boolean);
  while (words.length && FILLER.test(words[0])) words.shift();
  const term = words.join(' ').slice(0, MATERIAL_SEARCH_MAX_LENGTH).trim();
  return term.length >= 2 && !ROOM_ONLY.test(term) ? term : null;
};

/**
 * The search term a materials question names, or null when it asks for the whole list. A quoted phrase wins; then "for / matching / from / by / named",
 * "code <value>", and a code-shaped token after a material word ("paint SW 7008"). A room ("in the kitchen") is never a term.
 */
export function materialSearchTerm(message: string): string | null {
  const quoted = message.match(/["“]([^"”]{2,80})["”]/);
  if (quoted) return clean(quoted[1]);
  const text = message.replace(/\s+in (?:the |my |our )?[\w ]{2,30}(?:room|kitchen|bedroom|bathroom|garage|office|basement|laundry|hall|hallway|attic|porch|deck)\b.*$/i, '').trim();
  const forms = [
    /\b(?:search|find|look (?:up|for)|show|list|which|what)\b.{0,40}?\b(?:materials?|material specs?|specs?|paints?|tiles?|flooring|products?)\b.{0,20}?\b(?:for|matching|named|called|from|by|made by|with)\s+(.+)$/i,
    /\b(?:colou?r|paint|product|sku|material)\s+(?:code|number|no\.?)\s*[:#]?\s*((?=[\w .-]*\d)[A-Za-z0-9][\w .-]{1,40})$/i,
    /\b(?:code|sku)\s*[:#]?\s*([A-Za-z]{0,4}[ -]?\d[\w-]{1,20})\b/i,
    /\b(?:colou?r|paint|tile|flooring|grout|product|sku)\s+([A-Za-z]{1,4}[ -]?\d{2,6}[A-Za-z0-9-]*)\b/i,
  ];
  for (const form of forms) {
    const match = text.match(form);
    const term = match ? clean(match[1]) : null;
    if (term) return term;
  }
  return null;
}
