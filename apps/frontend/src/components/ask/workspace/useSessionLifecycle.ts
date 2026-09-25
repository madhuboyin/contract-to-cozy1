import { useEffect, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import { api } from '@/lib/api/client';
import { prefersReducedMotion } from '@/features/ask/adaptivePresentation';
import { clearResultViews, resultViewKey, type createResultRequestTracker } from '@/features/ask/resultViewState';
import type { AskExecutionResponse } from '@/features/ask/types';
import { askFailureCode, askServiceIsPaused, draftStorageKey, newId, restoreResultPosition, updateAskLocation } from './support';

// A conversation's lifecycle: starting or restoring one from the URL and browser storage when the scope changes,
// keeping the active-session record and the address bar in step, the back/forward button, clearing the conversation
// and starting a new one. Moved out of AskWorkspace unchanged (P2, FRD v1.109).
export function useSessionLifecycle({ mode, sessionId, executions, selectedPropertyId, initialQuestion, initialSessionId, initialExecutionId, propertyMismatch, availabilityEpoch, historyLoading, loading, requests, deniedProperties, activeSessionRef, activeSessionPropertyRef, textareaRef, refreshResult, setSessionId, setInput, setExecutions, setRefreshIssues, setRefreshRequests, setHistoryLoading, setError, setLoading, setConfirmClear, setJustUpdatedExecutionId, setServiceUnavailable, setRecentSessionsEpoch, setHistoryDrawerOpen }: {
  mode: 'page' | 'panel';
  sessionId: string;
  executions: AskExecutionResponse[];
  selectedPropertyId: string | undefined;
  initialQuestion: string;
  initialSessionId: string;
  initialExecutionId: string;
  propertyMismatch: boolean;
  availabilityEpoch: number;
  historyLoading: boolean;
  loading: boolean;
  requests: MutableRefObject<ReturnType<typeof createResultRequestTracker>>;
  deniedProperties: MutableRefObject<Set<string>>;
  activeSessionRef: MutableRefObject<string>;
  activeSessionPropertyRef: MutableRefObject<string | undefined>;
  textareaRef: RefObject<HTMLTextAreaElement>;
  refreshResult: (execution: AskExecutionResponse) => Promise<void>;
  setSessionId: (value: string) => void;
  setInput: (value: string) => void;
  setExecutions: Dispatch<SetStateAction<AskExecutionResponse[]>>;
  setRefreshIssues: (value: Record<string, { message: string; accessLost: boolean }>) => void;
  setRefreshRequests: (value: Record<string, number>) => void;
  setHistoryLoading: (value: boolean) => void;
  setError: (value: string | null) => void;
  setLoading: (value: boolean) => void;
  setConfirmClear: (value: boolean) => void;
  setJustUpdatedExecutionId: (value: string | null) => void;
  setServiceUnavailable: (value: boolean) => void;
  setRecentSessionsEpoch: Dispatch<SetStateAction<number>>;
  setHistoryDrawerOpen: (value: boolean) => void;
}) {
  const appliedInitialQuestionRef = useRef('');

  useEffect(() => {
    activeSessionRef.current = sessionId;
    if (sessionId && activeSessionPropertyRef.current === selectedPropertyId) {
      window.sessionStorage.setItem(`ctc:ask-active-session:${selectedPropertyId ?? 'general'}`, sessionId);
    }
  }, [sessionId, selectedPropertyId, activeSessionRef, activeSessionPropertyRef]);

  useEffect(() => {
    if (propertyMismatch) return;
    const controller = new AbortController();
    const explicitSession = initialSessionId.trim() || window.sessionStorage.getItem(`ctc:ask-active-session:${selectedPropertyId ?? 'general'}`) || '';
    const continuingActiveSession = !explicitSession
      && Boolean(activeSessionRef.current)
      && activeSessionPropertyRef.current === selectedPropertyId;
    const nextSession = explicitSession || (continuingActiveSession ? activeSessionRef.current : '') || newId();
    activeSessionRef.current = nextSession;
    activeSessionPropertyRef.current = selectedPropertyId;
    setSessionId(nextSession);
    setInput(initialQuestion || window.localStorage.getItem(draftStorageKey(selectedPropertyId, nextSession)) || '');
    setExecutions([]);
    setRefreshIssues({});
    requests.current.clear();
    setRefreshRequests({});
    deniedProperties.current.clear();
    setHistoryLoading(Boolean(explicitSession || continuingActiveSession));
    if (!explicitSession && !continuingActiveSession) {
      setHistoryLoading(false);
      return () => controller.abort();
    }
    api.getAskSession(nextSession, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted || activeSessionRef.current !== nextSession || deniedProperties.current.has(`${nextSession}:${selectedPropertyId}`)) return;
        const loaded = 'data' in response ? response.data?.executions ?? [] : [];
        clearResultViews(window.sessionStorage, nextSession, new Set(loaded.map((item) => resultViewKey(nextSession, item.property?.id ?? 'general', item.viewState?.resultId ?? item.executionId))));
        setExecutions(loaded);
        const returnId = initialExecutionId || window.sessionStorage.getItem(`ctc:ask-return-execution:${nextSession}`);
        if (returnId && loaded.some((execution) => execution.executionId === returnId)) {
          window.setTimeout(() => {
            if (!controller.signal.aborted && activeSessionRef.current === nextSession) restoreResultPosition(loaded.find((item) => item.executionId === returnId)!);
          }, 50);
          const target = loaded.find((item) => item.executionId === returnId)!;
          void refreshResult(target);

        }
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
          if (controller.signal.aborted || activeSessionRef.current !== nextSession) return;
          setExecutions([]);
          if (['ASK_SESSION_NOT_FOUND', 'ASK_PERMISSION_REQUIRED', 'ASK_PROPERTY_NOT_FOUND'].includes(askFailureCode(caught) ?? '')) {
            clearResultViews(window.sessionStorage, nextSession);
            window.sessionStorage.removeItem(`ctc:ask-active-session:${selectedPropertyId ?? 'general'}`);
          }
          if (askServiceIsPaused(caught)) setServiceUnavailable(true);
        }
      })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  // Deliberately excludes executions/sessionId: this effect owns session
  // initialization and should run only when navigation scope changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId, initialQuestion, initialSessionId, initialExecutionId, propertyMismatch, availabilityEpoch]);

  useEffect(() => {
    if (!initialQuestion || !sessionId || appliedInitialQuestionRef.current === initialQuestion) return;
    appliedInitialQuestionRef.current = initialQuestion;
    setInput(initialQuestion);
    window.localStorage.setItem(draftStorageKey(selectedPropertyId, sessionId), initialQuestion);
  }, [initialQuestion, selectedPropertyId, sessionId, setInput]);

  useEffect(() => {
    if (mode !== 'page' || historyLoading || !sessionId || executions.length === 0) return;
    const latest = executions.at(-1)!;
    const url = new URL(window.location.href);
    if (url.searchParams.get('sessionId') === sessionId && url.searchParams.get('executionId') === latest.executionId) return;
    updateAskLocation({ sessionId, propertyId: latest.property?.id ?? selectedPropertyId, executionId: latest.executionId }, 'replace');
  }, [executions, historyLoading, mode, selectedPropertyId, sessionId]);

  useEffect(() => {
    if (mode !== 'page') return;
    const restoreFromBrowserHistory = () => {
      const url = new URL(window.location.href);
      const targetSessionId = url.searchParams.get('sessionId')?.trim() ?? '';
      const targetPropertyId = url.searchParams.get('propertyId')?.trim() ?? '';
      if (targetSessionId === activeSessionRef.current) return;
      if (targetPropertyId && targetPropertyId !== selectedPropertyId) {
        // Let the server-authored page props and PropertyProvider establish a
        // different property's session atomically instead of briefly showing
        // it under the current home's label.
        window.location.reload();
        return;
      }
      if (!targetSessionId) {
        const nextSession = newId();
        activeSessionRef.current = nextSession;
        activeSessionPropertyRef.current = selectedPropertyId;
        setSessionId(nextSession);
        setExecutions([]);
        setJustUpdatedExecutionId(null);
        setInput(window.localStorage.getItem(draftStorageKey(selectedPropertyId, nextSession)) || '');
        setHistoryLoading(false);
        return;
      }
      setHistoryLoading(true);
      setError(null);
      api.getAskSession(targetSessionId)
        .then((response) => {
          if (!response.success || !response.data) throw new Error(response.message || 'Could not restore that Ask Cozy conversation.');
          activeSessionRef.current = targetSessionId;
          activeSessionPropertyRef.current = selectedPropertyId;
          setSessionId(targetSessionId);
          setExecutions(response.data.executions);
          setInput(window.localStorage.getItem(draftStorageKey(selectedPropertyId, targetSessionId)) || '');
          setJustUpdatedExecutionId(null);
        })
        .catch((caught) => {
          if (askServiceIsPaused(caught)) setServiceUnavailable(true);
          else setError(caught instanceof Error ? caught.message : 'Could not restore that Ask Cozy conversation.');
        })
        .finally(() => setHistoryLoading(false));
    };
    window.addEventListener('popstate', restoreFromBrowserHistory);
    return () => window.removeEventListener('popstate', restoreFromBrowserHistory);
  }, [mode, selectedPropertyId, activeSessionRef, activeSessionPropertyRef, setError, setExecutions, setHistoryLoading, setInput, setJustUpdatedExecutionId, setServiceUnavailable, setSessionId]);

  const clearHistory = async () => {
    if (!sessionId || loading) return;
    setLoading(true); setError(null);
    try {
      const response = await api.deleteAskSession(sessionId);
      if (!response.success) throw new Error(response.message || 'Could not clear Ask history.');
      clearResultViews(window.sessionStorage, sessionId);
      window.localStorage.removeItem(draftStorageKey(selectedPropertyId, sessionId));
      const nextSession = newId();
      activeSessionRef.current = nextSession;
      activeSessionPropertyRef.current = selectedPropertyId;
      setSessionId(nextSession); setExecutions([]); setConfirmClear(false);
      setRecentSessionsEpoch((current) => current + 1);
      if (mode === 'page') updateAskLocation({ propertyId: selectedPropertyId }, 'replace');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not clear Ask history.');
    } finally { setLoading(false); }
  };

  const startNewSession = () => {
    if (loading) return;
    const nextSession = newId();
    activeSessionRef.current = nextSession;
    activeSessionPropertyRef.current = selectedPropertyId;
    setSessionId(nextSession);
    setExecutions([]);
    setConfirmClear(false);
    setJustUpdatedExecutionId(null);
    setInput('');
    setRecentSessionsEpoch((current) => current + 1);
    setHistoryDrawerOpen(false);
    if (mode === 'page') updateAskLocation({ propertyId: selectedPropertyId }, 'push');
    window.setTimeout(() => textareaRef.current?.focus(), 50);
  };

  return { clearHistory, startNewSession };
}
