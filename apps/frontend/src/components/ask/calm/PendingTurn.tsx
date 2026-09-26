'use client';

import { useEffect, useState } from 'react';
import { pendingStage, pendingStageText, pendingStatusLabel, SLOW_AFTER_MS, STILL_WORKING_AFTER_MS } from '@/features/ask/pendingStatus';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.12 IW-CONV-006/012 (FRD v1.112): the turn as soon as a question is sent. The question appears at
// once as the homeowner's message, and the answer's place is held by a status line and two quiet placeholder bars, so the answer
// replaces them in the same spot without pushing anything. The Stop control is the composer's.
export function PendingTurn({ message }: { message: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const timers = [window.setTimeout(() => setElapsed(STILL_WORKING_AFTER_MS), STILL_WORKING_AFTER_MS), window.setTimeout(() => setElapsed(SLOW_AFTER_MS), SLOW_AFTER_MS)];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [message]);
  const text = pendingStageText(pendingStage(elapsed), pendingStatusLabel(message));
  return (
    <article data-pending-turn="" aria-busy="true" className="space-y-3">
      <div className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-3 text-sm leading-6 text-white">{message}</div>
      {/* Same height as the "Change and resend" line an answer shows under the question, so nothing moves when the answer arrives. */}
      <div aria-hidden="true" className="h-[1.6rem]" />
      <div className="flex items-center gap-2 text-xs font-semibold text-teal-800">
        <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-teal-700 text-[11px] font-bold text-white">C</span>
        <span>Cozy</span>
      </div>
      <p role="status" aria-live="polite" className="text-sm text-slate-600">{text}</p>
      <div aria-hidden="true" className="space-y-2.5 pt-1">
        <div className="h-6 w-3/4 animate-pulse rounded-md bg-slate-200/70 motion-reduce:animate-none" />
        <div className="h-4 w-1/2 animate-pulse rounded-md bg-slate-200/60 motion-reduce:animate-none" />
      </div>
    </article>
  );
}
