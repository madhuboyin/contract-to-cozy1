'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { buildAskWorkspaceHref } from '@/lib/navigation/askNavigation';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import type { AskPendingWorkItem } from '@/features/ask/types';
import { PendingWorkInbox } from './ConversationHistoryNav';
import { usePendingWork } from './usePendingWork';
import { askServiceIsPaused } from './support';

export function AskWorkDestination() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPropertyId = searchParams.get('propertyId')?.trim() ?? '';
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();
  const propertyMismatch = Boolean(requestedPropertyId) && requestedPropertyId !== selectedPropertyId;
  const scopedPropertyId = requestedPropertyId || selectedPropertyId;
  const [error, setError] = useState<string | null>(null);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);

  useEffect(() => {
    if (propertyMismatch) setSelectedPropertyId(requestedPropertyId);
  }, [propertyMismatch, requestedPropertyId, setSelectedPropertyId]);

  const {
    pendingWork,
    pendingLoading,
    continuingId,
    setContinuingId,
    dismissingPendingId,
    dismissPendingWork,
  } = usePendingWork({
    selectedPropertyId: scopedPropertyId,
    propertyMismatch: propertyMismatch || !scopedPropertyId,
    availabilityEpoch: 0,
    loading: false,
    setError,
    setServiceUnavailable,
    onDismissed: () => undefined,
  });

  const resumePendingWork = async (item: AskPendingWorkItem) => {
    if (continuingId || dismissingPendingId) return;
    setContinuingId(item.execution.executionId);
    setError(null);
    try {
      const response = await api.continueAskExecution(item.execution.executionId, 'ASK_PAGE');
      if (!response.success || !response.data) throw new Error(response.message || 'Could not resume this request.');
      const resumed = response.data;
      if ((resumed.property?.id ?? undefined) !== scopedPropertyId) {
        throw new Error('Select the matching home before resuming this request.');
      }
      router.push(buildAskWorkspaceHref({
        propertyId: resumed.property?.id ?? scopedPropertyId,
        sessionId: resumed.sessionId,
        executionId: resumed.executionId,
      }));
    } catch (caught) {
      if (askServiceIsPaused(caught)) {
        setServiceUnavailable(true);
        setError(null);
      } else {
        setError(caught instanceof Error ? caught.message : 'Could not resume this request.');
      }
    } finally {
      setContinuingId(null);
    }
  };

  return (
    <main className="h-full overflow-y-auto px-4 py-8 sm:px-6 lg:px-10" aria-labelledby="ask-work-title">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Ask Cozy destination</p>
        <h1 id="ask-work-title" className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-slate-950">Work</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Resume requests that are waiting for your input on the selected home.</p>

        <section className="mt-7" aria-labelledby="ask-work-needs-you-title">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 id="ask-work-needs-you-title" className="text-lg font-semibold text-slate-950">Needs you</h2>
              <p className="mt-1 text-sm text-slate-600">Pending Ask confirmations, questions, record choices, and interrupted actions.</p>
            </div>
          </div>

          {!scopedPropertyId ? (
            <div className="rounded-2xl border border-stone-200 bg-white px-5 py-6 text-sm text-slate-600">Select a home to see work that needs your input.</div>
          ) : serviceUnavailable ? (
            <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-5 text-sm text-amber-950" role="status"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><span>Pending Ask work is temporarily unavailable. Your saved data is unchanged.</span></div>
          ) : pendingLoading || propertyMismatch ? (
            <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-5 py-6 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Checking pending work…</div>
          ) : pendingWork.length === 0 ? (
            <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-sm text-emerald-950"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><span>No Ask requests need your input right now.</span></div>
          ) : (
            <PendingWorkInbox items={pendingWork} loadingId={continuingId} dismissingId={dismissingPendingId} onResume={(item) => void resumePendingWork(item)} onDismiss={(item) => void dismissPendingWork(item)} />
          )}
          {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
        </section>

        <aside className="mt-8 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm leading-6 text-slate-600" aria-label="Work destination scope">
          This first Work slice contains the existing pending Ask preview. Active projects, journeys, decisions, incidents, claims, monitors, queued jobs, lifecycle views, and complete pagination remain connected to their canonical owners until the full Work index is implemented.
        </aside>
      </div>
    </main>
  );
}
