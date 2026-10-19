'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import type { AskSavedArtifact, AskSavedResolution } from '@/features/ask/types';
import { askServiceIsPaused } from '../workspace/support';
import { AskCollectionState, AskWorkspaceMeasure } from '../presentation/AskLayoutPrimitives';
import { SavedRow } from './SavedRow';
import { useAskSaved } from './useAskSaved';
import { SAVED_EMPTY, savedReopenHref } from './savedPresentation';

/**
 * Saved (FR-SAVED-001..003): durable results for the selected home, read from their canonical owners (nothing is copied here). Browse,
 * search, filter by kind and freshness, archive and restore in your own list, and reopen across sessions. Pinning a result in a
 * conversation is separate and never saves anything.
 */
export function AskSavedDestination() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPropertyId = searchParams.get('propertyId')?.trim() ?? '';
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();
  const propertyMismatch = Boolean(requestedPropertyId) && requestedPropertyId !== selectedPropertyId;
  const scopedPropertyId = requestedPropertyId || selectedPropertyId;

  const [archived, setArchived] = useState(false);
  const [artifactType, setArtifactType] = useState('');
  const [freshness, setFreshness] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);

  useEffect(() => {
    if (propertyMismatch) setSelectedPropertyId(requestedPropertyId);
  }, [propertyMismatch, requestedPropertyId, setSelectedPropertyId]);

  const ready = Boolean(scopedPropertyId) && !propertyMismatch;
  const { rows, page, loadStatus, loadingMore, moreError, loadMore, refresh, removeRow, searching } = useAskSaved(ready ? scopedPropertyId : undefined, archived, artifactType, freshness, searchInput);
  const paused = serviceUnavailable || loadStatus === 'PAUSED';
  const filtered = Boolean(artifactType || freshness || searching);
  const gaps = (page?.types ?? []).filter((type) => type.state !== 'AVAILABLE' && type.state !== 'NOT_APPLICABLE');

  const choose = (nextArchived: boolean) => { setArchived(nextArchived); setNotice(null); setError(null); };

  const settle = (resolution: AskSavedResolution, key: string): AskSavedArtifact | null => {
    if (resolution.outcome === 'AVAILABLE' && resolution.artifact) return resolution.artifact;
    setNotice(resolution.message);
    removeRow(key);
    refresh();
    return null;
  };

  const guard = async (key: string, action: () => Promise<void>) => {
    if (busyKey || !scopedPropertyId) return;
    setBusyKey(key);
    setNotice(null);
    setError(null);
    try {
      await action();
    } catch (caught) {
      if (askServiceIsPaused(caught)) { setServiceUnavailable(true); setError(null); }
      else setError(caught instanceof Error ? caught.message : 'Could not complete that.');
    } finally {
      setBusyKey(null);
    }
  };

  // Opening always rereads the canonical record first, so a deleted or no-longer-accessible source says so instead of showing a stale copy.
  const openKey = (key: string) => guard(key, async () => {
    const response = await api.resolveAskSavedArtifact(scopedPropertyId as string, key);
    if (!response.success || !response.data) throw new Error(response.message || 'Could not open this.');
    const artifact = settle(response.data, key);
    if (!artifact) return;
    const href = savedReopenHref(artifact, scopedPropertyId as string);
    if (href) router.push(href);
    else setNotice(`${artifact.title}: ${artifact.reopenUnavailableReason ?? 'Ask cannot reopen this; its state is shown here.'}${artifact.summary ? ` ${artifact.summary}.` : ''}`);
  });

  // A search result opens its exact saved artifact through the same reopen step, so a removed source says so.
  const openParam = searchParams.get('open')?.trim() ?? '';
  const openedRef = useRef('');
  useEffect(() => {
    if (!openParam || !ready || openedRef.current === openParam) return;
    openedRef.current = openParam;
    void openKey(openParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, ready]);

  const toggleArchive = (artifact: AskSavedArtifact) => guard(artifact.artifactKey, async () => {
    const response = await api.setAskSavedArchive(scopedPropertyId as string, artifact.artifactKey, !artifact.archived.byYou);
    if (!response.success || !response.data) throw new Error(response.message || 'Could not change that.');
    if (response.data.outcome !== 'AVAILABLE') { settle(response.data, artifact.artifactKey); return; }
    removeRow(artifact.artifactKey);
    refresh();
  });

  return (
    <main className="h-full overflow-y-auto px-4 py-8 sm:px-6 lg:px-10" aria-labelledby="ask-saved-title">
      <AskWorkspaceMeasure className="max-w-5xl" data-presentation-contract="ask.destination.saved">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Ask Cozy destination</p>
        <h1 id="ask-saved-title" className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-slate-950">Saved</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Reports, comparisons, decisions, briefings and checklists for the selected home. They stay where they are kept; Saved only finds and reopens them.</p>

        <div role="tablist" aria-label="Saved lists" className="mt-6 flex flex-wrap gap-2">
          {([[false, 'Saved', page?.counts.active], [true, 'Archived', page?.counts.archived]] as const).map(([isArchived, label, count]) => (
            <button key={label} type="button" role="tab" aria-selected={archived === isArchived} onClick={() => choose(isArchived)}
              className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${archived === isArchived ? 'border-emerald-900 bg-emerald-900 text-white' : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'}`}>
              {label}
              <span className="ml-2 text-xs font-medium opacity-80" aria-label={count == null ? 'count unavailable' : `${count} items`}>{count == null ? '—' : count}</span>
            </button>
          ))}
        </div>

        <section className="mt-5" aria-label={archived ? 'Archived saved results' : 'Saved results'}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              {page && loadStatus === 'READY' && (
                <p className="text-sm text-slate-600" role="status" data-saved-count>
                  {page.totalScope === 'COMPLETE' && page.total != null
                    ? (page.total === 0 ? (filtered ? 'No matches' : 'None') : `Showing ${rows.length} of ${page.total}${filtered ? ' matching' : ''}`)
                    : `Showing ${rows.length} so far; the full count is not known while some saved results cannot be read`} · {page.sort.label.toLowerCase()}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="flex flex-col text-xs font-semibold text-slate-600">
                <span className="sr-only">Search saved results</span>
                <input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={80} placeholder="Search saved results" aria-label="Search saved results" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 sm:w-64" />
              </label>
              <label className="flex flex-col text-xs font-semibold text-slate-600">
                <span className="sr-only">Kind</span>
                <select aria-label="Kind" value={artifactType} onChange={(event) => setArtifactType(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900">
                  <option value="">All kinds</option>
                  {(page?.filterOptions.types ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col text-xs font-semibold text-slate-600">
                <span className="sr-only">Freshness</span>
                <select aria-label="Freshness" value={freshness} onChange={(event) => setFreshness(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900">
                  <option value="">Any freshness</option>
                  {(page?.filterOptions.freshness ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
          </div>

          {page?.partial && gaps.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="note" data-saved-partial>
              <p className="font-semibold">Some kinds of saved results could not be shown, so this list may be incomplete.</p>
              <details className="mt-1">
                <summary className="cursor-pointer font-semibold">Which ones</summary>
                <ul className="mt-1 list-disc pl-5">{gaps.map((type) => <li key={type.artifactType}><span className="font-semibold">{type.label}:</span> {type.reason ?? 'Not available right now.'}</li>)}</ul>
              </details>
            </div>
          )}
          {notice && <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950" role="status" data-saved-notice>{notice}</p>}
          {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}

          <div className="mt-4">
            {!scopedPropertyId ? (
              <AskCollectionState kind="NOT_APPLICABLE" description="Select a home to see its saved results." />
            ) : paused ? (
              <AskCollectionState kind="UNAVAILABLE" description="Saved is temporarily unavailable. Your saved data is unchanged." className="border-amber-200 bg-amber-50 text-amber-950" />
            ) : loadStatus === 'ERROR' ? (
              <AskCollectionState kind="UNAVAILABLE" description="Saved could not be loaded." action={<button type="button" onClick={refresh} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50">Try again</button>} />
            ) : (loadStatus === 'LOADING' && !page) || propertyMismatch ? (
              <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-5 py-6 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Finding your saved results…</div>
            ) : page && rows.length === 0 && loadStatus === 'READY' ? (
              <AskCollectionState
                kind={page.partial ? 'UNAVAILABLE' : 'EMPTY'}
                description={page.partial ? 'Nothing was found in what could be read, but some kinds could not be checked, so this is not a confirmed empty list.' : filtered ? 'No saved results match your search or filters.' : archived ? SAVED_EMPTY.archived : SAVED_EMPTY.active}
                className={page.partial ? 'border-amber-200 bg-amber-50 text-amber-950' : undefined}
              />
            ) : (
              <>
                <ul className={`rounded-2xl border border-slate-200 bg-white ${loadStatus === 'LOADING' ? 'opacity-60' : ''}`} aria-label={archived ? 'Archived saved results' : 'Saved results'} aria-busy={loadStatus === 'LOADING'}>
                  {rows.map((artifact) => (
                    <SavedRow key={artifact.artifactKey} artifact={artifact} busy={busyKey === artifact.artifactKey} onOpen={(target) => void openKey(target.artifactKey)} onToggleArchive={(target) => void toggleArchive(target)} onOpenVersion={(key) => void openKey(key)} />
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
