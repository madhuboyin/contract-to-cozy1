import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import type { AskWorkLifecycleView, AskWorkPage, AskWorkRow } from '@/features/ask/types';
import { askServiceIsPaused } from '../workspace/support';

const PAGE_SIZE = 25;

export type AskWorkLoadStatus = 'LOADING' | 'READY' | 'ERROR' | 'PAUSED';

/**
 * One lifecycle view of the Work index for a home, with the work-type and status filters, and a continuation until every row is
 * delivered (FR-WORK-005). A new view, filter, home or retry restarts from the first page and abandons any request still in flight.
 */
export function useAskWork(propertyId: string | undefined, view: AskWorkLifecycleView, workType: string, status: string) {
  const [rows, setRows] = useState<AskWorkRow[]>([]);
  const [page, setPage] = useState<AskWorkPage | null>(null);
  const [loadStatus, setLoadStatus] = useState<AskWorkLoadStatus>('LOADING');
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!propertyId) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoadStatus('LOADING');
    setMoreError(false);
    api.getAskWorkPage(propertyId, { view, limit: PAGE_SIZE, workType, status }, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (!response.success || !response.data) throw new Error(response.message || 'Could not load Work.');
        setPage(response.data);
        setRows(response.data.rows);
        setLoadStatus('READY');
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setLoadStatus(askServiceIsPaused(caught) ? 'PAUSED' : 'ERROR');
      });
    return () => controller.abort();
  }, [propertyId, view, workType, status, attempt]);

  const loadMore = useCallback(async () => {
    if (!propertyId || !page?.nextCursor || loadingMore) return;
    const controller = controllerRef.current;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const response = await api.getAskWorkPage(propertyId, { view, cursor: page.nextCursor, limit: PAGE_SIZE, workType, status }, { signal: controller?.signal });
      if (controller?.signal.aborted) return;
      if (!response.success || !response.data) throw new Error(response.message || 'Could not load more.');
      const next = response.data;
      setPage(next);
      setRows((current) => {
        const seen = new Set(current.map((row) => row.workKey));
        return [...current, ...next.rows.filter((row) => !seen.has(row.workKey))];
      });
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [propertyId, page, loadingMore, view, workType, status]);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  /** Replaces a row with its current version (after a resolve found it changed) without reloading the list. */
  const replaceRow = useCallback((row: AskWorkRow) => setRows((current) => current.map((candidate) => (candidate.workKey === row.workKey ? row : candidate))), []);
  const removeRow = useCallback((workKey: string) => setRows((current) => current.filter((row) => row.workKey !== workKey)), []);

  return { rows, page, loadStatus, loadingMore, moreError, loadMore, refresh, replaceRow, removeRow };
}
