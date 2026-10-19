import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import type { AskSearchResponse } from '@/features/ask/types';
import { askServiceIsPaused } from '../workspace/support';
import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_QUERY } from './searchPresentation';

export type AskSearchStatus = 'IDLE' | 'LOADING' | 'READY' | 'ERROR' | 'PAUSED';

/**
 * Debounced federated search for the selected home. The text lives only in this component's state: it is never put in a URL, local
 * storage, an analytics event or a client-side index. A newer query abandons the one still in flight.
 */
export function useAskSearch(propertyId: string | undefined, query: string, enabled: boolean) {
  const [response, setResponse] = useState<AskSearchResponse | null>(null);
  const [status, setStatus] = useState<AskSearchStatus>('IDLE');
  const [attempt, setAttempt] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const trimmed = query.replace(/\s+/g, ' ').trim();

  useEffect(() => {
    controllerRef.current?.abort();
    if (!enabled || !propertyId || trimmed.length < SEARCH_MIN_QUERY) {
      setResponse(null);
      setStatus('IDLE');
      return undefined;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    const timer = setTimeout(() => {
      setStatus('LOADING');
      api.searchAsk(propertyId, trimmed, { signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          if (!result.success || !result.data) throw new Error(result.message || 'Search failed.');
          setResponse(result.data);
          setStatus('READY');
        })
        .catch((caught) => {
          if (caught instanceof DOMException && caught.name === 'AbortError') return;
          setResponse(null);
          setStatus(askServiceIsPaused(caught) ? 'PAUSED' : 'ERROR');
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [propertyId, trimmed, enabled, attempt]);

  return { response, status, retry: () => setAttempt((value) => value + 1), tooShort: trimmed.length > 0 && trimmed.length < SEARCH_MIN_QUERY };
}
