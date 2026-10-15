import type { AskCollectionDescriptor, AskPresentationBlock } from './types';

type GroupedListBlock = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Section = GroupedListBlock['sections'][number];

// Presentation Quality 2A: one reading of a grouped list's collection descriptor, shared by every renderer that shows a
// count, a "Showing X of Y" line or a Next control. The client only reports what the producer declared; it never infers
// that more records exist or that a next page can be fetched.

/** "Showing X of Y." when the block delivers fewer records than its source holds; null when it carries the whole collection. */
export function collectionNote(collection: AskCollectionDescriptor | undefined): string | null {
  if (!collection) return null;
  const { deliveredCount, sourceTotal, fetchedCount, deliveryTruncated } = collection;
  if (sourceTotal != null && sourceTotal > deliveredCount) return `Showing ${deliveredCount} of ${sourceTotal}.`;
  if (sourceTotal == null && deliveryTruncated) return `Showing ${deliveredCount} of the ${fetchedCount} found.`;
  return null;
}

/**
 * Whether a section may offer a server "Next" control. Without a descriptor the older rule applies (the section's count exceeds
 * what is shown); with one, the producer must also have declared an authoritative continuation, so a list whose handler cannot
 * serve another page never shows a control that does nothing.
 */
export function sectionHasNextPage(block: { collection?: AskCollectionDescriptor }, section: Pick<Section, 'count' | 'offset' | 'items'>): boolean {
  const beyondShown = (section.offset ?? 0) + section.items.length < section.count;
  return block.collection ? block.collection.nextPageAvailable && beyondShown : beyondShown;
}
