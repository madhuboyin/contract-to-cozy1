// Ask handler support: the appliances and systems a homeowner names ("my washing machine", "the microwave"), and the words an inventory record would
// carry for each. Shared by the inventory answer (which finds the item) so its list lives in one place. "Washing machine" was missing, so
// "show me the history of my washing machine repairs" could not find a "Washer Dryer" (review screenshot, 2026-11-07). Matching is by whole word
// (support/wholeWord.ts), so "washer" never matches "Dishwasher".
export interface InventoryItemAlias { test: RegExp; terms: readonly string[] }

export const INVENTORY_ITEM_ALIASES: readonly InventoryItemAlias[] = Object.freeze([
  { test: /\b(?:refrigerator|fridge)\b/i, terms: ['refrigerator', 'fridge'] },
  { test: /\bwater heater\b/i, terms: ['water heater'] },
  { test: /\b(?:washer|washing machine)\b/i, terms: ['washer', 'washing machine'] },
  { test: /\bdryer\b/i, terms: ['dryer'] },
  { test: /\bdishwasher\b/i, terms: ['dishwasher'] },
  { test: /\bmicrowave\b/i, terms: ['microwave'] },
  { test: /\b(?:oven|stove|cooktop)\b/i, terms: ['oven', 'stove', 'cooktop'] },
  { test: /\bfreezer\b/i, terms: ['freezer'] },
  { test: /\bgarbage disposal\b/i, terms: ['garbage disposal', 'disposal'] },
  { test: /\bsump pump\b/i, terms: ['sump pump'] },
  { test: /\bdehumidifier\b/i, terms: ['dehumidifier'] },
  { test: /\broof(?:ing)?\b/i, terms: ['roof', 'roofing'] },
]);

export function findSpecificInventoryAlias(message: string): InventoryItemAlias | undefined {
  return INVENTORY_ITEM_ALIASES.find((alias) => alias.test.test(message));
}
