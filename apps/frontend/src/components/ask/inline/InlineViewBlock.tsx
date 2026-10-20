'use client';

import { forwardRef } from 'react';
import { RecordExportReview } from '../record/RecordExportReview';
import type { AskInlineViewRequest } from './AskInlineContext';

export interface AskInlineView extends AskInlineViewRequest {
  id: string;
  sessionId: string;
  /** The execution this block follows in the transcript; null when it was opened before any question. */
  afterExecutionId: string | null;
}

/**
 * The home-record export review as a block in the conversation. It is a review-then-confirm form rather than a list, so it stays
 * structured: it sits in the transcript where it was asked for, scrolls with it, and closes back to the conversation.
 */
export const InlineViewBlock = forwardRef<HTMLElement, { view: AskInlineView; propertyId: string | undefined; onClose: () => void }>(function InlineViewBlock({ view, propertyId, onClose }, ref) {
  return (
    <section ref={ref} id={`ask-view-${view.id}`} tabIndex={-1} aria-label="Home record export" data-ask-inline-view={view.kind} className="scroll-mt-4 rounded-3xl border border-stone-200 bg-white/70 p-3 shadow-sm focus:outline-none sm:p-4">
      {propertyId ? <RecordExportReview key={propertyId} propertyId={propertyId} onBack={onClose} /> : <p className="text-sm text-slate-600" role="status">Select a home to export its record.</p>}
    </section>
  );
});
