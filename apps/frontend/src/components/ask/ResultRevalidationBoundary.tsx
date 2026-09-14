'use client';
import type { ReactNode } from 'react';

export type ResultRefreshIssue = { message: string; accessLost: boolean };

/** Controlled by the request owner; asynchronous prop changes must be visible after mount. */
export function ResultRevalidationBoundary({ executionId, issue, children }: {
  executionId: string; issue?: ResultRefreshIssue | null; children: ReactNode;
}) {
  if (issue?.accessLost) return <article id={`ask-execution-${executionId}`} className="rounded-2xl border border-amber-200 bg-amber-50 p-4" role="alert">
    <h2 className="font-semibold">Result unavailable</h2>
    <p className="mt-2 text-sm">{issue.message}</p>
    <p className="mt-2 text-sm">Return to your available homes to continue.</p>
  </article>;
  return <>{issue && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">{issue.message}</p>}{children}</>;
}
