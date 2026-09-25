'use client';

import { Pin, PinOff } from 'lucide-react';
import { resultHeadline } from '@/features/ask/conversationView';
import type { AskExecutionResponse } from '@/features/ask/types';

// IW-PRES-021 (FRD v1.95): pinned results at the top of the conversation. Each shows its headline and when it was last
// updated (so its freshness is never hidden), can jump to the result in the conversation, and can be unpinned. Pinning
// only changes what is shown: nothing is re-run, and the result goes stale like any other.
export function PinnedResultsStrip({ executions, onUnpin }: { executions: readonly AskExecutionResponse[]; onUnpin: (executionId: string) => void }) {
  if (executions.length === 0) return null;
  const jump = (executionId: string) => {
    const target = document.getElementById(`ask-execution-${executionId}`);
    target?.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    target?.querySelector<HTMLElement>('h2')?.focus();
  };
  return (
    <section aria-label="Pinned results" data-ask-pinned-strip="" className="rounded-2xl border border-teal-200 bg-teal-50/60 p-3">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-teal-800"><Pin className="h-3.5 w-3.5" aria-hidden="true" />Pinned</h2>
      <ul className="mt-2 space-y-1.5">
        {executions.map((execution) => (
          <li key={execution.executionId} data-ask-pinned={execution.executionId} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2">
            <button type="button" onClick={() => jump(execution.executionId)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-semibold text-slate-900">{resultHeadline(execution)}</span>
              <span className="block text-xs text-slate-500">Updated {new Date(execution.updatedAt).toLocaleString()}</span>
            </button>
            <button type="button" onClick={() => onUnpin(execution.executionId)} aria-label={`Unpin ${resultHeadline(execution)}`} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
              <PinOff className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
