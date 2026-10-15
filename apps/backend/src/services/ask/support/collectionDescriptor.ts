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
