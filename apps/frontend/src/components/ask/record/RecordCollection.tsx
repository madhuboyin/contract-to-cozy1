'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { AskRecordCollectionPage, AskRecordDetailCapability } from '@/features/ask/types';
import { AskCollection, AskCollectionState } from '../presentation/AskLayoutPrimitives';
import { askServiceIsPaused } from '../workspace/support';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The generic pageable collection shell for a Record section (FR-REC-003): search, the section's declared filters, the authoritative
 * total, and a continuation until every row has been delivered. Row presentation is the section's own.
 */
export function RecordCollection<Row extends { id: string }>({ sectionId, label, propertyId, backHref, renderRow, searchLabel, emptyText }: {
  sectionId: string;
  label: string;
  propertyId: string;
  backHref: string;
  renderRow: (row: Row, recordDetail: AskRecordDetailCapability | undefined) => ReactNode;
  searchLabel: string;
  emptyText: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState<AskRecordCollectionPage<Row> | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'LOADING' | 'READY' | 'ERROR' | 'PAUSED'>('LOADING');
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // A new query (search, filter, property, retry) restarts from the first page; any request still in flight is abandoned.
  useEffect(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus('LOADING');
    setMoreError(false);
    api.getAskRecordSectionPage<Row>(sectionId, propertyId, { limit: PAGE_SIZE, search, filters }, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (!response.success || !response.data) throw new Error(response.message || 'Could not load this section.');
        setPage(response.data);
        setRows(response.data.rows);
        setStatus('READY');
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setStatus(askServiceIsPaused(caught) ? 'PAUSED' : 'ERROR');
      });
    return () => controller.abort();
  }, [sectionId, propertyId, search, filters, attempt]);

  const loadMore = useCallback(async () => {
    if (!page?.nextCursor || loadingMore) return;
    const controller = controllerRef.current;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const response = await api.getAskRecordSectionPage<Row>(sectionId, propertyId, { cursor: page.nextCursor, limit: PAGE_SIZE, search, filters }, { signal: controller?.signal });
      if (controller?.signal.aborted) return;
      if (!response.success || !response.data) throw new Error(response.message || 'Could not load more.');
      const next = response.data;
      setPage(next);
      setRows((current) => {
        const seen = new Set(current.map((row) => row.id));
        return [...current, ...next.rows.filter((row) => !seen.has(row.id))];
      });
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [page, loadingMore, sectionId, propertyId, search, filters]);

  const filterActive = Boolean(search) || Object.values(filters).some(Boolean);
  const retry = () => setAttempt((value) => value + 1);

  return (
    <section aria-labelledby="ask-record-collection-title" data-record-collection={sectionId}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link href={backHref} className="text-sm font-semibold text-emerald-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">← All record sections</Link>
          <h2 id="ask-record-collection-title" className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-slate-950">{label}</h2>
          {page && <p className="mt-1 text-sm text-slate-600" role="status" data-record-collection-count>
            {page.total === 0 ? (filterActive ? 'No matches' : 'None recorded') : `Showing ${rows.length} of ${page.total}${filterActive ? ' matching' : ''}`} · sorted by {page.sort.label.toLowerCase()}
          </p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex flex-col text-xs font-semibold text-slate-600">
            <span className="sr-only">{searchLabel}</span>
            <input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={80} placeholder={searchLabel} aria-label={searchLabel} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 sm:w-64" />
          </label>
          {page?.filterOptions.map((filter) => (
            <label key={filter.key} className="flex flex-col text-xs font-semibold text-slate-600">
              <span className="sr-only">{filter.label}</span>
              <select aria-label={filter.label} value={filters[filter.key] ?? ''} onChange={(event) => setFilters((current) => ({ ...current, [filter.key]: event.target.value }))} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900">
                <option value="">{`Any ${filter.label.toLowerCase()}`}</option>
                {filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          ))}
        </div>
      </div>

      {page?.detail && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4" data-record-detail={page.detail.id}>
          <h3 className="text-sm font-semibold text-slate-950">{page.detail.title}</h3>
          {page.detail.state === 'OWNER_ONLY' ? (
            <p className="mt-1 text-sm text-slate-600" role="note">These details are visible to a home owner only.</p>
          ) : page.detail.state === 'NOT_RECORDED' ? (
            <p className="mt-1 text-sm text-slate-600">Nothing is recorded yet.</p>
          ) : (
            <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {page.detail.facts.map((fact) => <div key={fact.label}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{fact.label}</dt><dd className="text-slate-900">{fact.value}</dd></div>)}
            </dl>
          )}
        </div>
      )}

      {page?.recordDetail?.state === 'UNAVAILABLE' && rows.length > 0 && <p className="mt-3 text-sm text-slate-600" role="note" data-record-detail-unavailable>Per-record details are not available for this section. {page.recordDetail.reason}</p>}

      {page?.notice && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="note" data-record-collection-notice>{page.notice}</p>}

      <div className="mt-4">
        {status === 'PAUSED' ? (
          <AskCollectionState kind="UNAVAILABLE" description="Ask Cozy is temporarily paused. Your saved data is unchanged." className="border-amber-200 bg-amber-50 text-amber-950" />
        ) : status === 'ERROR' ? (
          <AskCollectionState kind="UNAVAILABLE" description={`${label} could not be loaded.`} action={<button type="button" onClick={retry} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50">Try again</button>} />
        ) : status === 'LOADING' && !page ? (
          <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-5 py-6 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading {label.toLowerCase()}…</div>
        ) : page && rows.length === 0 && status === 'READY' ? (
          <AskCollectionState kind="EMPTY" description={filterActive ? 'No records match your search or filter.' : emptyText} />
        ) : (
          <>
            <AskCollection className={`rounded-2xl border border-slate-200 bg-white ${status === 'LOADING' ? 'opacity-60' : ''}`} aria-label={label} aria-busy={status === 'LOADING'}>
              {rows.map((row) => renderRow(row, page?.recordDetail))}
            </AskCollection>
            {page?.nextCursor && (
              <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="min-h-11 rounded-xl border border-emerald-900/20 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50 disabled:opacity-60">
                  {loadingMore ? 'Loading…' : `Show more (${page.total - rows.length} remaining)`}
                </button>
                {moreError && <p className="text-sm text-amber-800" role="alert">Could not load more. Try again.</p>}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
