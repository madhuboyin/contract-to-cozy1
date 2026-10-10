'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { AskPresentationBlock } from '@/features/ask/types';

type TimelineItem = Extract<AskPresentationBlock, { type: 'TIMELINE' }>['items'][number];

/**
 * A timeline record read in place: its labelled facts and the evidence behind it, from the detail the answer carries. Nothing here links to a
 * page; the homeowner stays in the conversation.
 */
export function TimelineEventDetail({ item, onClose }: { item: TimelineItem; onClose: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [item.id]);
  const detail = item.detail;
  const headingId = `timeline-event-detail-${item.id}`;
  return (
    <aside className="mt-3 rounded-xl border border-teal-100 bg-teal-50/40 p-4" aria-labelledby={headingId} data-ask-timeline-detail={item.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">{[item.category?.label, item.status].filter(Boolean).join(' · ') || 'Record'}</p>
          <h4 ref={headingRef} tabIndex={-1} id={headingId} className="mt-1 text-lg font-semibold text-slate-950 outline-none">{item.label}</h4>
        </div>
        <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close details for ${item.label}`}><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      {item.description && <p className="mt-3 text-sm leading-6 text-slate-700">{item.description}</p>}
      {detail && detail.facts.length > 0 && (
        <dl className="mt-3 grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
          {detail.facts.map((fact) => <div key={fact.label}><dt className="text-xs text-slate-500">{fact.label}</dt><dd className="mt-0.5 font-medium text-slate-900">{fact.value}</dd></div>)}
        </dl>
      )}
      <div className="mt-3">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence</h5>
        {detail && detail.evidence.length > 0 ? (
          <ul className="mt-1.5 space-y-1.5 text-sm">
            {detail.evidence.map((row, index) => (
              <li key={`${row.label}-${index}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <span className="font-medium text-slate-900">{row.label}</span>{row.meta && <span className="text-slate-600"> · {row.meta}</span>}
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-sm text-slate-600">No evidence is attached to this record yet.</p>}
      </div>
    </aside>
  );
}
