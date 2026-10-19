import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import type { AskSavedArtifact, AskSavedPage } from '@/features/ask/types';
import { askServiceIsPaused } from '../workspace/support';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

export type AskSavedLoadStatus = 'LOADING' | 'READY' | 'ERROR' | 'PAUSED';

/** The Saved list for a home: search, type and freshness filters, the active or archived list, and a continuation until every row is delivered. */
export function useAskSaved(propertyId: string | undefined, archived: boolean, artifactType: string, freshness: string, searchInput: string) {
  const [rows, setRows] = useState<AskSavedArtifact[]>([]);
  const [page, setPage] = useState<AskSavedPage | null>(null);
  const [loadStatus, setLoadStatus] = useState<AskSavedLoadStatus>('LOADING');
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!propertyId) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoadStatus('LOADING');
    setMoreError(false);
    api.getAskSavedPage(propertyId, { limit: PAGE_SIZE, search, artifactType, freshness, archived }, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (!response.success || !response.data) throw new Error(response.message || 'Could not load Saved.');
        setPage(response.data);
        setRows(response.data.rows);
        setLoadStatus('READY');
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setLoadStatus(askServiceIsPaused(caught) ? 'PAUSED' : 'ERROR');
      });
    return () => controller.abort();
  }, [propertyId, archived, artifactType, freshness, search, attempt]);

  const loadMore = useCallback(async () => {
    if (!propertyId || !page?.nextCursor || loadingMore) return;
    const controller = controllerRef.current;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const response = await api.getAskSavedPage(propertyId, { cursor: page.nextCursor, limit: PAGE_SIZE, search, artifactType, freshness, archived }, { signal: controller?.signal });
      if (controller?.signal.aborted) return;
      if (!response.success || !response.data) throw new Error(response.message || 'Could not load more.');
      const next = response.data;
      setPage(next);
      setRows((current) => {
        const seen = new Set(current.map((row) => row.artifactKey));
        return [...current, ...next.rows.filter((row) => !seen.has(row.artifactKey))];
      });
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [propertyId, page, loadingMore, search, artifactType, freshness, archived]);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  const removeRow = useCallback((artifactKey: string) => setRows((current) => current.filter((row) => row.artifactKey !== artifactKey)), []);

  return { rows, page, loadStatus, loadingMore, moreError, loadMore, refresh, removeRow, searching: Boolean(search) };
}
