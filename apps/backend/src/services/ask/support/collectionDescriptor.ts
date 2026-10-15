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
type BlockLike = { type: string; collection?: unknown; sections?: readonly SectionLike[] };

/**
 * Presentation Quality 5: a producer that did not declare its own collection still withholds rows in two ways, and both are stated by
 * the producer's own per-section counts. This derives the descriptor from them, only when rows are withheld, so no list offers a
 * control or a count that its handler cannot back:
 *  - sections with a server window (`offset`): the handler pages, so the source total is the sum of counts and a next page exists
 *    while any window ends before its count (only Maintenance and Project Tracker emit offsets, and both serve the continuation);
 *  - sections with `count` above the rows delivered and no window: rows were read and not delivered, with no continuation. The source
 *    total is left unknown rather than asserted, because a block's sections are buckets of one result by convention, not a proof.
 * A block that already declares `collection`, or that withholds nothing, is returned unchanged.
 */
export function withDerivedCollectionDescriptor<T extends BlockLike>(block: T): T {
  if (block.type !== 'GROUPED_LIST' || block.collection || !block.sections || block.sections.length === 0) return block;
  const sections = block.sections;
  const delivered = sections.reduce((sum, section) => sum + section.items.length, 0);
  const counted = sections.reduce((sum, section) => sum + Math.max(section.count, section.items.length), 0);
  if (counted <= delivered) return block;
  const windowed = sections.some((section) => section.offset !== undefined);
  if (windowed) {
    const sourceTotal = counted;
    const moreAhead = sections.some((section) => section.offset !== undefined && section.offset + section.items.length < section.count);
    return { ...block, collection: { sourceTotal, fetchedCount: delivered, deliveredCount: delivered, nextPageAvailable: moreAhead, deliveryTruncated: false } };
  }
  return { ...block, collection: { sourceTotal: null, fetchedCount: counted, deliveredCount: delivered, nextPageAvailable: false, deliveryTruncated: true } };
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
