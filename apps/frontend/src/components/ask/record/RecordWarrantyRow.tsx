import Link from 'next/link';
import { buildAskWorkspaceHref } from '@/lib/navigation/askNavigation';
import type { AskRecordWarrantyRow } from '@/features/ask/types';
import { AskCompactRow } from '../presentation/AskLayoutPrimitives';

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function statusLine(warranty: AskRecordWarrantyRow): string {
  const expiry = dateFormat.format(new Date(warranty.expiryDate));
  switch (warranty.status) {
    case 'EXPIRING': return warranty.daysRemaining === 0 ? `Expires today (${expiry})` : `Expires ${expiry} · ${warranty.daysRemaining} ${warranty.daysRemaining === 1 ? 'day' : 'days'}`;
    case 'EXPIRED': return `Expired ${expiry}`;
    case 'STARTS_LATER': return `Starts ${dateFormat.format(new Date(warranty.startDate))} · expires ${expiry}`;
    case 'NEEDS_REVIEW': return 'Dates need review';
    default: return `Active until ${expiry}`;
  }
}

export function RecordWarrantyRow({ warranty, propertyId }: { warranty: AskRecordWarrantyRow; propertyId: string }) {
  const facts = [warranty.categoryLabel, warranty.itemName, warranty.hasDocuments ? 'Has documents' : null].filter(Boolean);
  const caution = warranty.status === 'EXPIRING' || warranty.status === 'NEEDS_REVIEW';
  return (
    <AskCompactRow className="border-b border-slate-200 last:border-b-0" data-record-row={warranty.id} data-warranty-status={warranty.status.toLowerCase()}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{warranty.providerName}</p>
        <p className="mt-0.5 text-xs text-slate-500">{facts.join(' · ')}</p>
        <p className={`mt-1 text-xs font-semibold ${caution ? 'text-amber-800' : 'text-slate-700'}`}>{warranty.statusLabel === 'Active' || warranty.status === 'NEEDS_REVIEW' ? '' : `${warranty.statusLabel}: `}{statusLine(warranty)}</p>
        {warranty.coverageSummary && <p className="mt-1 text-xs text-slate-500">{warranty.coverageSummary}</p>}
      </div>
      <Link href={buildAskWorkspaceHref({ propertyId, question: warranty.askQuestion, from: 'record', backTo: '/dashboard/ask/record?section=warranties' })} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-emerald-900/20 px-3 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" aria-label={`Open warranty from ${warranty.providerName}`}>
        Open
      </Link>
    </AskCompactRow>
  );
}
