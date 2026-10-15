import { collectionNote } from '@/features/ask/collectionStatus';
import type { AskCollectionDescriptor } from '@/features/ask/types';

// Presentation Quality 2A: the honest "Showing X of Y." line for a collection that delivers fewer records than its source.
export function CollectionStatusNote({ collection, className }: { collection: AskCollectionDescriptor | undefined; className?: string }) {
  const note = collectionNote(collection);
  if (!note) return null;
  return <p data-collection-note="" className={className ?? 'px-4 pb-3 text-xs text-slate-500'}>{note}</p>;
}
