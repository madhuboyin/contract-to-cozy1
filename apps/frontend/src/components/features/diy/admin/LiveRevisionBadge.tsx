'use client';
import type { DiyLiveRevision, DiyTemplateStatus } from '@/types';

/**
 * What homeowners currently see, which can differ from the status badge: a live template being edited as a draft shows "Draft" and "Live: revision 2".
 * A backfilled revision was live before revisions existed and has not been reviewed as this content, so it is flagged rather than shown as reviewed.
 */
export default function LiveRevisionBadge({ liveRevision, status }: { liveRevision?: DiyLiveRevision | null; status: DiyTemplateStatus }) {
  if (!liveRevision) {
    // ACTIVE with no head only exists before the revision backfill has run; say so instead of implying it is fine.
    return status === 'ACTIVE'
      ? <span data-live-revision="missing" className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Live: no published revision</span>
      : null;
  }
  const legacy = liveRevision.provenance === 'LEGACY_BACKFILL';
  return (
    <span
      data-live-revision={legacy ? 'legacy' : 'reviewed'}
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${legacy ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}
      title={legacy ? 'Live before revisions existed; this content was not reviewed as a revision. Edit and publish it through review to replace it.' : 'Published through review'}
    >
      {`Live: revision ${liveRevision.revision} · ${legacy ? 'legacy, not re-reviewed' : 'reviewed'}`}
    </span>
  );
}
