import Link from 'next/link';
import { buildAskWorkspaceHref } from '@/lib/navigation/askNavigation';
import type { AskRecordInventoryRow } from '@/features/ask/types';
import { AskCompactRow } from '../presentation/AskLayoutPrimitives';

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function RecordInventoryRow({ item, propertyId }: { item: AskRecordInventoryRow; propertyId: string }) {
  const facts = [item.category, item.roomName, item.brandModel, item.condition, `Updated ${dateFormat.format(new Date(item.updatedAt))}`].filter(Boolean);
  const notes = [
    item.verified ? null : 'Not verified',
    item.endOfLifeBy ? `Nearing end of life by ${dateFormat.format(new Date(item.endOfLifeBy))}` : null,
    item.missingDetails.length ? `Missing: ${item.missingDetails.join(', ').toLowerCase()}` : null,
  ].filter(Boolean);
  return (
    <AskCompactRow className="border-b border-slate-200 last:border-b-0" data-record-row={item.id}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{item.name}</p>
        <p className="mt-0.5 text-xs text-slate-500">{facts.join(' · ')}</p>
        {notes.length > 0 && <p className="mt-1 text-xs font-semibold text-amber-800">{notes.join(' · ')}</p>}
      </div>
      <Link href={buildAskWorkspaceHref({ propertyId, question: item.askQuestion, from: 'record', backTo: '/dashboard/ask/record?section=inventory' })} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-emerald-900/20 px-3 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" aria-label={`Open ${item.name}`}>
        Open
      </Link>
    </AskCompactRow>
  );
}
