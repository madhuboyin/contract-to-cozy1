'use client';
import type { ReactNode } from 'react';

export type ResultRefreshIssue = { message: string; accessLost: boolean };

/** Controlled by the request owner; asynchronous prop changes must be visible after mount. */
export function ResultRevalidationBoundary({ executionId, issue, stale, onRefresh, refreshing, children }: {
  executionId: string; issue?: ResultRefreshIssue | null; children: ReactNode;
  /** Phase 8 (FR-PLAT-002): a write changed what this shows and it has not been refreshed. The change itself succeeded. */
  stale?: { since: string } | null; onRefresh?: () => void; refreshing?: boolean;
}) {
  if (issue?.accessLost) return <article id={`ask-execution-${executionId}`} className="rounded-2xl border border-amber-200 bg-amber-50 p-4" role="alert">
    <h2 className="font-semibold">Result unavailable</h2>
    <p className="mt-2 text-sm">{issue.message}</p>
    <p className="mt-2 text-sm">Return to your available homes to continue.</p>
  </article>;
  return <>
    {issue && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">{issue.message}</p>}
    {stale && !issue && (
      <div data-ask-stale="" className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
        <span className="min-w-0 flex-1">Something changed after this was shown, so it may be out of date.</span>
        {onRefresh && <button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex min-h-11 items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50">{refreshing ? 'Refreshing…' : 'Refresh'}</button>}
      </div>
    )}
    {children}
  </>;
}
