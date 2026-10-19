'use client';

import { useId, useState } from 'react';
import type { AskWorkRow } from '@/features/ask/types';
import { formatWorkDate, WORK_TYPE_LABELS } from './workPresentation';

/** One piece of work: identity, status, the next step, and current detail on demand. The primary action reopens the owning flow. */
export function WorkRow({ row, busy, canOpen, onOpen, onRetry, onDismiss }: {
  row: AskWorkRow;
  busy: boolean;
  /** False when the row has no Ask operation to continue (a report job, for example); it still shows current detail. */
  canOpen: boolean;
  onOpen: (row: AskWorkRow) => void;
  onRetry?: (row: AskWorkRow) => void;
  onDismiss?: (row: AskWorkRow) => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const detailId = useId();
  const due = formatWorkDate(row.dueAt);
  const updated = formatWorkDate(row.freshness.asOf);
  const retryable = Boolean(row.nextAction?.retryExecutionId);
  const actionLabel = row.nextAction?.label ?? 'Open';
  const blocked = row.nextAction ? !row.nextAction.allowed : false;

  return (
    <li className="border-b border-slate-200 px-4 py-3 last:border-b-0" data-work-key={row.workKey} data-work-type={row.workType}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>{WORK_TYPE_LABELS[row.workType] ?? row.workType}</span>
            <span aria-hidden="true">·</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 normal-case tracking-normal text-slate-700">{row.status.label}</span>
          </p>
          <h3 className="mt-1 break-words text-base font-semibold text-slate-950">{row.title}</h3>
          {row.summary && <p className="mt-1 text-sm text-slate-600">{row.summary}</p>}
          <p className="mt-1 text-sm text-slate-700">
            {row.nextAction && <span>Next: {row.nextAction.label}</span>}
            {due && <span>{row.nextAction ? ' · ' : ''}Due {due}</span>}
          </p>
          {blocked && <p className="mt-1 text-xs text-slate-500" role="note">Your household role can view this but not change it.</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canOpen && (
            <button
              type="button"
              disabled={busy}
              onClick={() => (retryable && onRetry ? onRetry(row) : onOpen(row))}
              className="min-h-11 rounded-xl bg-emerald-900 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60"
            >
              {busy ? 'Opening…' : actionLabel}
            </button>
          )}
          {canOpen && retryable && (
            <button type="button" disabled={busy} onClick={() => onOpen(row)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60">View request</button>
          )}
          {onDismiss && (
            <button type="button" disabled={busy} onClick={() => onDismiss(row)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60">Dismiss</button>
          )}
          <button type="button" aria-expanded={detailOpen} aria-controls={detailId} onClick={() => setDetailOpen((value) => !value)} className="min-h-11 rounded-xl px-3 py-2 text-sm font-semibold text-emerald-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
            {detailOpen ? 'Hide details' : 'Details'}
          </button>
        </div>
      </div>
      {detailOpen && (
        <dl id={detailId} className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2" data-work-detail>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</dt><dd className="text-slate-900">{row.status.label}</dd></div>
          {updated && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last updated</dt><dd className="text-slate-900">{updated}</dd></div>}
          {due && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due</dt><dd className="text-slate-900">{due}</dd></div>}
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Kept by</dt><dd className="text-slate-900">{row.sourceOwner.replace(/-/g, ' ')}</dd></div>
          {!canOpen && <div className="sm:col-span-2"><dd className="text-slate-600">{row.resume.unavailableReason ?? 'There is nothing to continue in Ask for this; it shows its current state here.'}</dd></div>}
        </dl>
      )}
    </li>
  );
}
