'use client';
import Link from 'next/link';
import type { DiyLiveRevision, DiyTemplateStatus } from '@/types';

/** Reviewed content cannot change under a reviewer; these statuses refuse content edits on the server. */
export const CONTENT_FROZEN_STATUSES: ReadonlySet<DiyTemplateStatus> = new Set<DiyTemplateStatus>(['REVIEW', 'APPROVED', 'ARCHIVED']);

export function isContentFrozen(status?: DiyTemplateStatus | null): boolean {
  return Boolean(status && CONTENT_FROZEN_STATUSES.has(status));
}

/** Tells an editor what saving will do in the template's current state, so a frozen form or a saved draft is never a surprise. */
export default function TemplateStateNotice({ status, liveRevision }: { status: DiyTemplateStatus; liveRevision?: DiyLiveRevision | null }) {
  const live = liveRevision ? `revision ${liveRevision.revision}` : null;
  let tone = 'border-blue-200 bg-blue-50 text-blue-900';
  let body: React.ReactNode = null;

  if (status === 'ACTIVE') {
    body = <>Saving creates a new draft. {live ? <>The live version ({live}) stays published until you publish the new one.</> : <>Nothing homeowners see changes until the new draft is reviewed and published.</>}</>;
  } else if (status === 'DRAFT' && live) {
    body = <>A live version ({live}) is published. This draft is not live until it is reviewed and published.</>;
  } else if (status === 'REVIEW' || status === 'APPROVED') {
    tone = 'border-amber-200 bg-amber-50 text-amber-900';
    body = <>
      This template is {status === 'REVIEW' ? 'in review' : 'approved and waiting to be published'}, so its content is frozen and the reviewed version cannot change. To edit it, a reviewer
      returns it to draft (from the templates list or <Link href="/dashboard/admin/content-reviews" className="underline">Pending Reviews</Link>). Featured order and the Gemini hint can still be changed.
      {live ? <> The live version ({live}) stays published meanwhile.</> : null}
    </>;
  } else if (status === 'ARCHIVED') {
    tone = 'border-amber-200 bg-amber-50 text-amber-900';
    body = <>This template is archived and its content cannot be edited. Revive it to draft from the templates list to edit it. Featured order and the Gemini hint can still be changed.</>;
  }
  if (!body) return null;
  return <div role="note" data-template-state-notice={status} className={`mb-4 rounded-lg border px-4 py-3 text-sm ${tone}`}>{body}</div>;
}
