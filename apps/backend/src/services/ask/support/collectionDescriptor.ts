// Presentation Quality 2A: builds the producer-declared `collection` descriptor for a GROUPED_LIST (see
// AskCollectionDescriptorSchema in ask.contract.ts for the meaning of each field). `deliveredCount` is always derived from the
// sections, so it cannot disagree with what the block carries; the schema rejects any contradictory combination.
export interface AskCollectionDescriptor {
  sourceTotal: number | null;
  fetchedCount: number;
  deliveredCount: number;
  nextPageAvailable: boolean;
  deliveryTruncated: boolean;
}

export function collectionDescriptor(input: {
  /** The authoritative size of the collection in its source, or null when the producer cannot know it. */
  sourceTotal: number | null;
  /** How many records the producer read. */
  fetchedCount: number;
  sections: ReadonlyArray<{ items: readonly unknown[] }>;
  /** True only when an authoritative continuation (a cursor or an offset the producer's handler serves) exists. */
  nextPageAvailable?: boolean;
}): AskCollectionDescriptor {
  const deliveredCount = input.sections.reduce((sum, section) => sum + section.items.length, 0);
  return {
    sourceTotal: input.sourceTotal,
    fetchedCount: input.fetchedCount,
    deliveredCount,
    nextPageAvailable: Boolean(input.nextPageAvailable),
    deliveryTruncated: deliveredCount < input.fetchedCount,
  };
}

type SectionLike = { count: number; offset?: number; items: readonly unknown[] };
type BlockLike = { type: string; collection?: unknown; sections?: readonly SectionLike[] | unknown };

/**
 * Presentation Quality 5: a producer that did not declare its own collection still withholds rows in two ways, and both are visible in
 * the producer's own per-section counts. This derives a CONSERVATIVE descriptor, only when rows are withheld, so no list offers a
 * Next control its handler cannot serve. It claims only what the producer's shape proves:
 *  - sections with a server window (`offset`): the section `count` is the full collection the window moves through (only Maintenance
 *    and Project Tracker emit offsets, and both serve the continuation), so the source total is the sum of counts and a next page
 *    exists while a window ends before its count;
 *  - sections with `count` above the rows delivered and no window: the descriptor claims NO fetched count beyond what was delivered
 *    (`count` may be the producer's source total, not what it read), NO source total (sections are buckets, not a proven partition)
 *    and NO truncation flag. It says one thing: there is no continuation. The list states each section's own "showing X of count".
 * A block that already declares `collection`, or that withholds nothing, is returned unchanged. A producer that knows its true source
 * total should declare it (see collectionDescriptor above).
 */
export function withDerivedCollectionDescriptor<T extends BlockLike>(block: T): T {
  if (block.type !== 'GROUPED_LIST' || block.collection || !Array.isArray(block.sections) || block.sections.length === 0) return block;
  const sections = block.sections as readonly SectionLike[];
  const delivered = sections.reduce((sum, section) => sum + section.items.length, 0);
  const counted = sections.reduce((sum, section) => sum + Math.max(section.count, section.items.length), 0);
  if (counted <= delivered) return block;
  const windowed = sections.some((section) => section.offset !== undefined);
  if (windowed) {
    const moreAhead = sections.some((section) => section.offset !== undefined && section.offset + section.items.length < section.count);
    return { ...block, collection: { sourceTotal: counted, fetchedCount: delivered, deliveredCount: delivered, nextPageAvailable: moreAhead, deliveryTruncated: false } };
  }
  return { ...block, collection: { sourceTotal: null, fetchedCount: delivered, deliveredCount: delivered, nextPageAvailable: false, deliveryTruncated: false } };
}

export function withDerivedCollectionDescriptors<R extends { blocks: readonly BlockLike[] }>(result: R): R {
  let changed = false;
  const blocks = result.blocks.map((block) => {
    const next = withDerivedCollectionDescriptor(block);
    if (next !== block) changed = true;
    return next;
  });
  return changed ? { ...result, blocks } : result;
}
