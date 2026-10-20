// Ordering a collection in words (Sole Homeowner Interface FRD v1.6). An answer states the order it used, and the homeowner can change it by
// asking ("newest first", "by provider", "unverified first"): each declared chip is such a sentence. The chosen order is a constraint like any
// other, held in the view state, so a filter chip afterwards keeps it. Pure: the vocabulary and the chip and statement helpers; each area
// declares its own options and does its own sorting, because only it knows what its rows are.
export interface OrderingOption {
  id: string;
  /** The chip. */
  label: string;
  /** The sentence the chip sends; it starts like a refinement and reads back to this option. */
  message: string;
  /** How the answer says it ("by newest coverage first"). */
  statement: string;
  test: RegExp;
}

/** The ordering a message names, or null. The default is named too, so "back to the usual order" works. */
export function orderingFromWords(options: readonly OrderingOption[], message: string): string | null {
  return options.find((option) => option.test.test(message))?.id ?? null;
}

export const isOrderingId = (options: readonly OrderingOption[], id: string | null | undefined): id is string => Boolean(id) && options.some((option) => option.id === id);

export const orderingStatement = (options: readonly OrderingOption[], id: string | null | undefined): string | null =>
  options.find((option) => option.id === id)?.statement ?? null;

/** One chip per way to order it, the current one marked, so a homeowner always sees how it is ordered and what else is possible. */
export function orderingChips(options: readonly OrderingOption[], active: string) {
  return options.map((option) => ({ id: `order-${option.id.toLowerCase().replace(/_/g, '-')}`, label: option.label, message: option.message, active: option.id === active }));
}

/** Adds the ordering to a one-line scope or support text: "Ordered by newest coverage first." */
export function withOrdering(line: string | undefined, options: readonly OrderingOption[], id: string | null | undefined, defaultId: string, max = 240): string | undefined {
  const statement = id && id !== defaultId ? orderingStatement(options, id) : null;
  if (!statement) return line;
  return [line, `Ordered ${statement}.`].filter(Boolean).join(' ').slice(0, max);
}
