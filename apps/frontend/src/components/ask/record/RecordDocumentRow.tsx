import Link from 'next/link';
import { buildAskWorkspaceHref } from '@/lib/navigation/askNavigation';
import type { AskRecordDocumentRow } from '@/features/ask/types';
import { AskCompactRow } from '../presentation/AskLayoutPrimitives';

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const VERIFICATION_LABEL: Record<string, string> = { VERIFIED: 'Verified', UNVERIFIED: 'Unverified', PENDING: 'Pending verification', REJECTED: 'Rejected' };
const EXPIRY_LABEL: Record<string, string> = { EXPIRING_SOON: 'Expiring soon', EXPIRED: 'Expired' };

export function RecordDocumentRow({ document, propertyId }: { document: AskRecordDocumentRow; propertyId: string }) {
  const facts = [
    document.kindLabel,
    document.verification ? VERIFICATION_LABEL[document.verification] : null,
    `Added ${dateFormat.format(new Date(document.addedAt))}`,
    document.transitional ? 'Legacy vault' : null,
  ].filter(Boolean);
  const notes = [document.needsReview ? 'Extracted details need review' : null, document.expiry ? EXPIRY_LABEL[document.expiry] ?? null : null].filter(Boolean);
  return (
    <AskCompactRow className="border-b border-slate-200 last:border-b-0" data-record-row={document.id}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{document.title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{facts.join(' · ')}</p>
        {notes.length > 0 && <p className="mt-1 text-xs font-semibold text-amber-800">{notes.join(' · ')}</p>}
      </div>
      <Link href={buildAskWorkspaceHref({ propertyId, question: document.askQuestion, from: 'record', backTo: '/dashboard/ask/record?section=documents' })} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-emerald-900/20 px-3 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" aria-label={`Open ${document.kindLabel.toLowerCase()} for ${document.title}`}>
        Open
      </Link>
    </AskCompactRow>
  );
}
