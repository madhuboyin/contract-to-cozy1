import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import type { AskNotificationItem, AskNotificationPage } from '@/features/ask/types';
import { askServiceIsPaused } from '../workspace/support';

const PAGE_SIZE = 25;
export type AskNotificationsStatus = 'LOADING' | 'READY' | 'ERROR' | 'PAUSED';

/** One view of the inbox with its filters and a continuation until every item is delivered. A new view, filter or retry restarts from the first page. */
export function useAskNotifications(enabled: boolean, view: 'INBOX' | 'DISMISSED', unreadOnly: boolean, category: string, propertyId: string) {
  const [items, setItems] = useState<AskNotificationItem[]>([]);
  const [page, setPage] = useState<AskNotificationPage | null>(null);
  const [status, setStatus] = useState<AskNotificationsStatus>('LOADING');
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus('LOADING');
    setMoreError(false);
    api.getAskNotifications({ view, unreadOnly, category, propertyId, limit: PAGE_SIZE }, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (!response.success || !response.data) throw new Error(response.message || 'Could not load notifications.');
        setPage(response.data);
        setItems(response.data.items);
        setStatus('READY');
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setStatus(askServiceIsPaused(caught) ? 'PAUSED' : 'ERROR');
      });
    return () => controller.abort();
  }, [enabled, view, unreadOnly, category, propertyId, attempt]);

  const loadMore = useCallback(async () => {
    if (!page?.nextCursor || loadingMore) return;
    const controller = controllerRef.current;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const response = await api.getAskNotifications({ view, cursor: page.nextCursor, unreadOnly, category, propertyId, limit: PAGE_SIZE }, { signal: controller?.signal });
      if (controller?.signal.aborted) return;
      if (!response.success || !response.data) throw new Error(response.message || 'Could not load more.');
      const next = response.data;
      setPage(next);
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...next.items.filter((item) => !seen.has(item.id))];
      });
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [page, loadingMore, view, unreadOnly, category, propertyId]);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  const patchItem = useCallback((id: string, patch: Partial<AskNotificationItem>) => setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item))), []);
  const removeItem = useCallback((id: string) => setItems((current) => current.filter((item) => item.id !== id)), []);

  return { items, page, status, loadingMore, moreError, loadMore, refresh, patchItem, removeItem };
}
