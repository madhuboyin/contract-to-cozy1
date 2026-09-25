import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { api } from '@/lib/api/client';
import type { AskRecentSessionSummary } from '@/features/ask/types';
import { ACCESS_LOST_CODES, askFailureCode, askServiceIsPaused } from './support';

// The conversation history rail's data (recent, pinned, archived and search results): loading, paging, the
// stale-request guards and access-loss handling. Moved out of AskWorkspace unchanged (P2, FRD v1.104). What the
// workspace itself must clear on access loss (results, pending work) stays there, reached through `onAccessLostRef`.
export function useConversationHistory({ selectedPropertyId, effectiveHistoryScope, propertyMismatch, availabilityEpoch, recentSessionsEpoch, setServiceUnavailable, onAccessLostRef }: {
  selectedPropertyId: string | undefined;
  effectiveHistoryScope: 'THIS_HOME' | 'ALL_HOMES';
  propertyMismatch: boolean;
  availabilityEpoch: number;
  recentSessionsEpoch: number;
  setServiceUnavailable: (value: boolean) => void;
  onAccessLostRef: MutableRefObject<(propertyId: string) => void>;
}) {
  const [recentSessions, setRecentSessions] = useState<AskRecentSessionSummary[]>([]);
  const [recentSessionsLoading, setRecentSessionsLoading] = useState(false);
  const [recentSessionsLoadingMore, setRecentSessionsLoadingMore] = useState(false);
  const [recentSessionsNextCursor, setRecentSessionsNextCursor] = useState<string | null>(null);
  const [recentSessionsIssue, setRecentSessionsIssue] = useState<string | null>(null);
  const [historySearchInput, setHistorySearchInput] = useState('');
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [searchSessions, setSearchSessions] = useState<AskRecentSessionSummary[]>([]);
  const [searchNextCursor, setSearchNextCursor] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchIssue, setSearchIssue] = useState<string | null>(null);
  // IW-HIST-003/009..012 (FRD v1.71): the pinned group, the archived view, and the conversation a session-menu change is
  // in flight for.
  const [historyView, setHistoryView] = useState<'RECENT' | 'ARCHIVED'>('RECENT');
  const [pinnedSessions, setPinnedSessions] = useState<AskRecentSessionSummary[]>([]);
  const historyPropertyRef = useRef<string | undefined>(undefined);
  const historyRequestEpochRef = useRef(0);
  const searchRequestEpochRef = useRef(0);
  const searchScopeRef = useRef('');
  useEffect(() => {
    const timer = window.setTimeout(() => setHistorySearchTerm(historySearchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [historySearchInput]);

  useEffect(() => {
    if (propertyMismatch || (effectiveHistoryScope === 'THIS_HOME' && !selectedPropertyId)) return;
    const controller = new AbortController();
    const requestEpoch = ++historyRequestEpochRef.current;
    const scopeKey = JSON.stringify([effectiveHistoryScope, selectedPropertyId, historyView]);
    const apiScope = effectiveHistoryScope === 'ALL_HOMES' ? { allHomes: true as const } : { propertyId: selectedPropertyId! };
    if (historyPropertyRef.current !== scopeKey) {
      setRecentSessions([]);
      setPinnedSessions([]);
      setRecentSessionsNextCursor(null);
      setSearchSessions([]);
      setSearchNextCursor(null);
      ++searchRequestEpochRef.current;
      searchScopeRef.current = '';
      historyPropertyRef.current = scopeKey;
    }
    setRecentSessionsLoading(true);
    setRecentSessionsLoadingMore(false);
    setRecentSessionsIssue(null);
    api.getRecentAskSessions(apiScope, { signal: controller.signal, archived: historyView === 'ARCHIVED' })
      .then((response) => {
        if (!response.success || !response.data) throw new Error(response.message || 'Could not refresh conversations.');
        if (controller.signal.aborted || historyRequestEpochRef.current !== requestEpoch) return;
        const items = response.data.items;
        setRecentSessions(Array.isArray(items) ? items : []);
        setPinnedSessions(historyView === 'RECENT' && Array.isArray(response.data.pinned) ? response.data.pinned : []);
        setRecentSessionsNextCursor(response.data.nextCursor ?? null);
      })
      .catch((caught) => {
        if (!controller.signal.aborted && historyRequestEpochRef.current === requestEpoch && !(caught instanceof DOMException && caught.name === 'AbortError')) {
          if (ACCESS_LOST_CODES.includes(askFailureCode(caught) ?? '')) {
            if (selectedPropertyId) onAccessLostRef.current(selectedPropertyId);
            else { setRecentSessions([]); setRecentSessionsNextCursor(null); setRecentSessionsIssue('Conversation access changed.'); }
          } else {
            setRecentSessionsIssue('Could not refresh conversations. Previously loaded conversations remain visible; try again later.');
          }
          if (askServiceIsPaused(caught)) setServiceUnavailable(true);
        }
      })
      .finally(() => { if (!controller.signal.aborted) setRecentSessionsLoading(false); });
    return () => controller.abort();
  }, [selectedPropertyId, effectiveHistoryScope, historyView, propertyMismatch, availabilityEpoch, recentSessionsEpoch, setServiceUnavailable, onAccessLostRef]);

  useEffect(() => {
    if (!historySearchTerm || propertyMismatch || (effectiveHistoryScope === 'THIS_HOME' && !selectedPropertyId)) {
      setSearchSessions([]);
      setSearchNextCursor(null);
      setSearchIssue(null);
      setSearchLoading(false);
      setSearchLoadingMore(false);
      searchScopeRef.current = '';
      return;
    }
    const controller = new AbortController();
    const requestEpoch = ++searchRequestEpochRef.current;
    const searchScope = JSON.stringify([effectiveHistoryScope, selectedPropertyId, historySearchTerm]);
    const apiScope = effectiveHistoryScope === 'ALL_HOMES' ? { allHomes: true as const } : { propertyId: selectedPropertyId! };
    if (searchScopeRef.current !== searchScope) {
      setSearchSessions([]);
      setSearchNextCursor(null);
      searchScopeRef.current = searchScope;
    }
    setSearchIssue(null);
    setSearchLoading(true);
    setSearchLoadingMore(false);
    api.searchAskSessions(apiScope, historySearchTerm, { signal: controller.signal })
      .then((response) => {
        if (!response.success || !response.data) throw new Error(response.message || 'Could not search conversation titles.');
        if (controller.signal.aborted || searchRequestEpochRef.current !== requestEpoch) return;
        setSearchSessions(response.data.items);
        setSearchNextCursor(response.data.nextCursor);
      })
      .catch((caught) => {
        if (controller.signal.aborted || searchRequestEpochRef.current !== requestEpoch || (caught instanceof DOMException && caught.name === 'AbortError')) return;
        if (ACCESS_LOST_CODES.includes(askFailureCode(caught) ?? '') && selectedPropertyId) onAccessLostRef.current(selectedPropertyId);
        else setSearchIssue('Could not refresh matches. Previously loaded matches remain visible; recent conversations remain available when search is cleared.');
        if (askServiceIsPaused(caught)) setServiceUnavailable(true);
      })
      .finally(() => { if (!controller.signal.aborted && searchRequestEpochRef.current === requestEpoch) setSearchLoading(false); });
    return () => controller.abort();
  }, [historySearchTerm, selectedPropertyId, effectiveHistoryScope, propertyMismatch, availabilityEpoch, recentSessionsEpoch, setServiceUnavailable, onAccessLostRef]);

  const loadMoreRecentSessions = async () => {
    if ((effectiveHistoryScope === 'THIS_HOME' && !selectedPropertyId) || !recentSessionsNextCursor || recentSessionsLoading || recentSessionsLoadingMore) return;
    const requestEpoch = historyRequestEpochRef.current;
    const scopeKey = JSON.stringify([effectiveHistoryScope, selectedPropertyId, historyView]);
    const apiScope = effectiveHistoryScope === 'ALL_HOMES' ? { allHomes: true as const } : { propertyId: selectedPropertyId! };
    setRecentSessionsLoadingMore(true);
    setRecentSessionsIssue(null);
    try {
      const response = await api.getRecentAskSessions(apiScope, { cursor: recentSessionsNextCursor, archived: historyView === 'ARCHIVED' });
      if (!response.success || !response.data) throw new Error(response.message || 'Could not load older conversations.');
      if (historyRequestEpochRef.current !== requestEpoch || historyPropertyRef.current !== scopeKey) return;
      setRecentSessions((current) => {
        const seen = new Set(current.map((item) => item.sessionId));
        return [...current, ...response.data!.items.filter((item) => !seen.has(item.sessionId))];
      });
      setRecentSessionsNextCursor(response.data.nextCursor ?? null);
    } catch (caught) {
      if (historyRequestEpochRef.current !== requestEpoch || historyPropertyRef.current !== scopeKey) return;
      if (ACCESS_LOST_CODES.includes(askFailureCode(caught) ?? '')) {
        if (selectedPropertyId) onAccessLostRef.current(selectedPropertyId);
        else { setRecentSessions([]); setRecentSessionsNextCursor(null); setRecentSessionsIssue('Conversation access changed.'); }
      } else {
        setRecentSessionsIssue('Could not load older conversations. The conversations already shown remain available.');
      }
      if (askServiceIsPaused(caught)) setServiceUnavailable(true);
    } finally {
      if (historyRequestEpochRef.current === requestEpoch) setRecentSessionsLoadingMore(false);
    }
  };

  const loadMoreSearchSessions = async () => {
    if ((effectiveHistoryScope === 'THIS_HOME' && !selectedPropertyId) || !historySearchTerm || !searchNextCursor || searchLoading || searchLoadingMore) return;
    const requestEpoch = searchRequestEpochRef.current;
    const scopeKey = JSON.stringify([effectiveHistoryScope, selectedPropertyId, historyView]);
    const apiScope = effectiveHistoryScope === 'ALL_HOMES' ? { allHomes: true as const } : { propertyId: selectedPropertyId! };
    setSearchLoadingMore(true);
    setSearchIssue(null);
    try {
      const response = await api.searchAskSessions(apiScope, historySearchTerm, { cursor: searchNextCursor });
      if (!response.success || !response.data) throw new Error(response.message || 'Could not load more matches.');
      if (searchRequestEpochRef.current !== requestEpoch || historyPropertyRef.current !== scopeKey) return;
      setSearchSessions((current) => {
        const seen = new Set(current.map((item) => item.sessionId));
        return [...current, ...response.data!.items.filter((item) => !seen.has(item.sessionId))];
      });
      setSearchNextCursor(response.data.nextCursor);
    } catch (caught) {
      if (searchRequestEpochRef.current !== requestEpoch || historyPropertyRef.current !== scopeKey) return;
      if (ACCESS_LOST_CODES.includes(askFailureCode(caught) ?? '') && selectedPropertyId) onAccessLostRef.current(selectedPropertyId);
      else setSearchIssue('Could not load more matches. Matches already shown remain available.');
      if (askServiceIsPaused(caught)) setServiceUnavailable(true);
    } finally {
      if (searchRequestEpochRef.current === requestEpoch) setSearchLoadingMore(false);
    }
  };

  return { recentSessions, setRecentSessions, recentSessionsLoading, setRecentSessionsLoading, recentSessionsLoadingMore, setRecentSessionsLoadingMore, recentSessionsNextCursor, setRecentSessionsNextCursor, recentSessionsIssue, setRecentSessionsIssue, historySearchInput, setHistorySearchInput, historySearchTerm, setHistorySearchTerm, searchSessions, setSearchSessions, searchNextCursor, setSearchNextCursor, searchLoading, setSearchLoading, searchLoadingMore, setSearchLoadingMore, searchIssue, setSearchIssue, historyView, setHistoryView, pinnedSessions, setPinnedSessions, historyPropertyRef, historyRequestEpochRef, searchRequestEpochRef, searchScopeRef, loadMoreRecentSessions, loadMoreSearchSessions };
}
