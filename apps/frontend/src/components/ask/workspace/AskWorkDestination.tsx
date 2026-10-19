'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { buildAskWorkspaceHref } from '@/lib/navigation/askNavigation';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import type { AskWorkLifecycleView, AskWorkResolution, AskWorkRow, AskWorkType } from '@/features/ask/types';
import { askServiceIsPaused } from './support';
import { AskCollectionState, AskWorkspaceMeasure } from '../presentation/AskLayoutPrimitives';
import { useAskWork } from '../work/useAskWork';
import { WorkRow } from '../work/WorkRow';
import { WORK_OUTCOME_COPY, WORK_TYPE_LABELS, WORK_VIEWS, workResumeHref } from '../work/workPresentation';

interface WorkNotice { title: string; message: string; replacementKey?: string }

const newClientRequestId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `work-${Date.now()}-${Math.random().toString(16).slice(2)}`);

/**
 * Work (FR-WORK-001..005): every piece of homeowner-visible work for the selected home, read from its canonical owner, in the six
 * lifecycle views. Opening work rereads its current state first and reports a distinct recovery outcome when it was removed, finished,
 * changed, replaced, or is no longer accessible.
 */
export function AskWorkDestination() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPropertyId = searchParams.get('propertyId')?.trim() ?? '';
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();
  const propertyMismatch = Boolean(requestedPropertyId) && requestedPropertyId !== selectedPropertyId;
  const scopedPropertyId = requestedPropertyId || selectedPropertyId;

  const [view, setView] = useState<AskWorkLifecycleView>('NEEDS_YOU');
  const [workType, setWorkType] = useState('');
  const [status, setStatus] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<WorkNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);

  useEffect(() => {
    if (propertyMismatch) setSelectedPropertyId(requestedPropertyId);
  }, [propertyMismatch, requestedPropertyId, setSelectedPropertyId]);

  const ready = Boolean(scopedPropertyId) && !propertyMismatch;
  const { rows, page, loadStatus, loadingMore, moreError, loadMore, refresh, replaceRow, removeRow } = useAskWork(ready ? scopedPropertyId : undefined, view, workType, status);
  const paused = serviceUnavailable || loadStatus === 'PAUSED';

  const chooseView = (next: AskWorkLifecycleView) => { setView(next); setStatus(''); setNotice(null); setError(null); };
  const chooseType = (next: string) => { setWorkType(next); setStatus(''); };

  // Filter choices come from the server, so a status that is only on a later page can still be chosen.
  const typeOptions: Array<[string, string]> = (page?.filterOptions.workTypes ?? []).map((option) => [option.value, WORK_TYPE_LABELS[option.value as AskWorkType] ?? option.label]);
  const statusOptions: Array<[string, string]> = (workType ? page?.filterOptions.statusesByWorkType[workType] ?? [] : []).map((option) => [option.value, option.label]);
  const gaps = (page?.providers ?? []).filter((provider) => provider.state !== 'AVAILABLE' && provider.state !== 'NOT_APPLICABLE');

  const enter = async (row: AskWorkRow) => {
    const propertyId = scopedPropertyId as string;
    if (row.providerId === 'PENDING_EXECUTIONS' && row.resume.executionId) {
      const response = await api.continueAskExecution(row.resume.executionId, 'ASK_PAGE');
      if (!response.success || !response.data) throw new Error(response.message || 'Could not resume this request.');
      // A request that still asks which home it is about has no home to match; Ask finishes that question in the conversation.
      if (row.propertyId !== null && (response.data.property?.id ?? undefined) !== propertyId) throw new Error('Select the matching home before resuming this request.');
      router.push(buildAskWorkspaceHref({ propertyId: response.data.property?.id ?? propertyId, sessionId: response.data.sessionId, executionId: response.data.executionId }));
      return;
    }
    const href = workResumeHref(row, propertyId);
    if (!href) {
      setNotice({ title: row.title, message: 'There is nothing to continue in Ask for this. Its current state is shown here.' });
      return;
    }
    router.push(href);
  };

  const settle = (row: AskWorkRow, resolution: AskWorkResolution): boolean => {
    if (resolution.outcome === 'AVAILABLE') return true;
    const message = resolution.message || WORK_OUTCOME_COPY[resolution.outcome];
    if (resolution.outcome === 'STALE' && resolution.row) replaceRow(resolution.row);
    else if (resolution.outcome === 'COMPLETED' && resolution.row) replaceRow(resolution.row);
    else if (resolution.outcome !== 'STALE') removeRow(row.workKey);
    setNotice({ title: row.title, message, replacementKey: resolution.outcome === 'SUPERSEDED' ? resolution.supersededBy ?? undefined : undefined });
    if (resolution.outcome !== 'STALE') refresh();
    return false;
  };

  const run = async (row: AskWorkRow, action: (current: AskWorkRow) => Promise<void>) => {
    if (busyKey || !scopedPropertyId) return;
    setBusyKey(row.workKey);
    setNotice(null);
    setError(null);
    try {
      const response = await api.resolveAskWork(scopedPropertyId, row.workKey, row.freshness.version);
      if (!response.success || !response.data) throw new Error(response.message || 'Could not open this.');
      if (settle(row, response.data)) await action(response.data.row ?? row);
    } catch (caught) {
      if (askServiceIsPaused(caught)) { setServiceUnavailable(true); setError(null); }
      else setError(caught instanceof Error ? caught.message : 'Could not open this.');
    } finally {
      setBusyKey(null);
    }
  };

  const open = (row: AskWorkRow) => void run(row, enter);
  const retry = (row: AskWorkRow) => void run(row, async (current) => {
    const executionId = current.nextAction?.retryExecutionId;
    if (!executionId) { await enter(current); return; }
    const response = await api.retryAskExecution(executionId, newClientRequestId());
    if (!response.success || !response.data) throw new Error(response.message || 'Could not try this again.');
    router.push(buildAskWorkspaceHref({ propertyId: response.data.property?.id ?? (scopedPropertyId as string), sessionId: response.data.sessionId, executionId: response.data.executionId }));
  });
  const dismiss = async (row: AskWorkRow) => {
    if (busyKey || !row.resume.executionId) return;
    setBusyKey(row.workKey);
    setError(null);
    try {
      const response = await api.cancelAskExecution(row.resume.executionId);
      if (!response.success || !response.data || response.data.status !== 'CANCELLED') throw new Error(response.message || 'Could not dismiss this pending action.');
      removeRow(row.workKey);
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not dismiss this pending action.');
    } finally {
      setBusyKey(null);
    }
  };
  const openReplacement = async (workKey: string) => {
    if (!scopedPropertyId || busyKey) return;
    setBusyKey(workKey);
    setNotice(null);
    try {
      const response = await api.resolveAskWork(scopedPropertyId, workKey);
      if (!response.success || !response.data) throw new Error(response.message || 'Could not open this.');
      const resolution = response.data;
      if (resolution.outcome === 'AVAILABLE' && resolution.row) await enter(resolution.row);
      else setNotice({ title: resolution.row?.title ?? 'Replacement', message: resolution.message || WORK_OUTCOME_COPY[resolution.outcome === 'AVAILABLE' ? 'STALE' : resolution.outcome] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open this.');
    } finally {
      setBusyKey(null);
    }
  };

  const activeView = WORK_VIEWS.find((entry) => entry.id === view) ?? WORK_VIEWS[0];
  const filtered = Boolean(workType || status);

  return (
    <main className="h-full overflow-y-auto px-4 py-8 sm:px-6 lg:px-10" aria-labelledby="ask-work-title">
      <AskWorkspaceMeasure className="max-w-5xl" data-presentation-contract="ask.destination.work">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Ask Cozy destination</p>
        <h1 id="ask-work-title" className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-slate-950">Work</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Everything that needs you, is under way, or is coming up on the selected home, kept by its owner and reopened exactly where you left off.</p>

        <div role="tablist" aria-label="Work views" className="mt-6 flex flex-wrap gap-2">
          {WORK_VIEWS.map((entry) => {
            const count = page?.viewCounts?.[entry.id];
            const selected = entry.id === view;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                id={`ask-work-tab-${entry.id}`}
                aria-selected={selected}
                aria-controls="ask-work-panel"
                onClick={() => chooseView(entry.id)}
                className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${selected ? 'border-emerald-900 bg-emerald-900 text-white' : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'}`}
              >
                {entry.label}
                <span className="ml-2 text-xs font-medium opacity-80" aria-label={count == null ? 'count unavailable' : `${count} items`}>{count == null ? '—' : count}</span>
              </button>
            );
          })}
        </div>

        <section id="ask-work-panel" role="tabpanel" aria-labelledby={`ask-work-tab-${view}`} className="mt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-950">{activeView.label}</h2>
              <p className="mt-1 text-sm text-slate-600">{activeView.description}</p>
              {page && loadStatus === 'READY' && (
                <p className="mt-1 text-sm text-slate-600" role="status" data-work-count>
                  {page.totalScope === 'COMPLETE' && page.total != null
                    ? (page.total === 0 ? (filtered ? 'No matches' : 'None') : `Showing ${rows.length} of ${page.total}${filtered ? ' matching' : ''}`)
                    : `Showing ${rows.length} so far; the full count is not known while some work cannot be read`} · {page.sort.label.toLowerCase()}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="flex flex-col text-xs font-semibold text-slate-600">
                <span className="sr-only">Kind of work</span>
                <select aria-label="Kind of work" value={workType} onChange={(event) => chooseType(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900">
                  <option value="">All kinds of work</option>
                  {typeOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
              {workType && (
                <label className="flex flex-col text-xs font-semibold text-slate-600">
                  <span className="sr-only">Status</span>
                  <select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900">
                    <option value="">Any status</option>
                    {statusOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
              )}
            </div>
          </div>

          {page?.partial && gaps.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="note" data-work-partial>
              <p className="font-semibold">Some kinds of work could not be shown, so this list may be incomplete.</p>
              <details className="mt-1">
                <summary className="cursor-pointer font-semibold">Which ones</summary>
                <ul className="mt-1 list-disc pl-5">
                  {gaps.map((provider) => <li key={provider.providerId}><span className="font-semibold">{provider.label}:</span> {provider.reason ?? 'Not available right now.'}</li>)}
                </ul>
              </details>
            </div>
          )}

          {notice && (
            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950 sm:flex-row sm:items-center sm:justify-between" role="status" data-work-notice>
              <p><span className="font-semibold">{notice.title}:</span> {notice.message}</p>
              {notice.replacementKey && <button type="button" onClick={() => void openReplacement(notice.replacementKey as string)} className="min-h-11 shrink-0 rounded-xl border border-sky-300 bg-white px-3 py-2 font-semibold text-sky-950 hover:bg-sky-100">Open the replacement</button>}
            </div>
          )}
          {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}

          {(page?.unscopedPending.length ?? 0) > 0 && (
            <section className="mt-4" aria-labelledby="ask-work-no-home-title" data-work-no-home>
              <h3 id="ask-work-no-home-title" className="text-sm font-semibold text-slate-950">No home selected yet</h3>
              <p className="mt-1 text-sm text-slate-600">These requests are still asking which home they are about, so they are not part of any one home.</p>
              <ul className="mt-2 rounded-2xl border border-slate-200 bg-white" aria-label="Requests with no home yet">
                {page?.unscopedPending.map((row) => (
                  <WorkRow key={row.workKey} row={row} busy={busyKey === row.workKey} canOpen onOpen={open} onDismiss={row.status.canonical !== 'RUNNING' ? (target) => void dismiss(target) : undefined} />
                ))}
              </ul>
            </section>
          )}

          <div className="mt-4">
            {!scopedPropertyId ? (
              <AskCollectionState kind="NOT_APPLICABLE" description="Select a home to see its work." />
            ) : paused ? (
              <AskCollectionState kind="UNAVAILABLE" description="Work is temporarily unavailable. Your saved data is unchanged." className="border-amber-200 bg-amber-50 text-amber-950" />
            ) : loadStatus === 'ERROR' ? (
              <AskCollectionState kind="UNAVAILABLE" description="Work could not be loaded." action={<button type="button" onClick={refresh} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50">Try again</button>} />
            ) : (loadStatus === 'LOADING' && !page) || propertyMismatch ? (
              <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-5 py-6 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Checking your work…</div>
            ) : page && rows.length === 0 && loadStatus === 'READY' ? (
              <AskCollectionState
                kind={page.partial ? 'UNAVAILABLE' : 'EMPTY'}
                description={page.partial ? 'Nothing was found in what could be read, but some kinds of work could not be checked, so this is not a confirmed empty list.' : filtered ? 'No work matches this filter.' : activeView.empty}
                className={page.partial ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-emerald-200 bg-emerald-50 text-emerald-950'}
              />
            ) : (
              <>
                <ul className={`rounded-2xl border border-slate-200 bg-white ${loadStatus === 'LOADING' ? 'opacity-60' : ''}`} aria-label={`${activeView.label} work`} aria-busy={loadStatus === 'LOADING'}>
                  {rows.map((row) => (
                    <WorkRow
                      key={row.workKey}
                      row={row}
                      busy={busyKey === row.workKey}
                      canOpen={Boolean(row.resume.executionId || workResumeHref(row, scopedPropertyId))}
                      onOpen={open}
                      onRetry={row.nextAction?.retryExecutionId ? retry : undefined}
                      onDismiss={row.providerId === 'PENDING_EXECUTIONS' && row.status.canonical !== 'RUNNING' ? (target) => void dismiss(target) : undefined}
                    />
                  ))}
                </ul>
                {page?.nextCursor && (
                  <div className="mt-3 flex flex-col items-start gap-2">
                    <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60">{loadingMore ? 'Loading…' : 'Show more'}</button>
                    {moreError && <p className="text-sm text-red-800" role="alert">Could not load more. Try again.</p>}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </AskWorkspaceMeasure>
    </main>
  );
}
