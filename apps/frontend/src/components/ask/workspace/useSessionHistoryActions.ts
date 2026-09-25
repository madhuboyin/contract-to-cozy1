import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { api } from '@/lib/api/client';
import { clearResultViews } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskRecentSessionSummary, AskSessionChange } from '@/features/ask/types';
import { askFailureCode, askServiceIsPaused, draftStorageKey, newId, updateAskLocation } from './support';

// The history rail's session actions: rename, pin, archive and restore; delete; and opening another conversation.
// Moved out of AskWorkspace unchanged (P2, FRD v1.106). The workspace passes in the setters and refs these touch.
export function useSessionHistoryActions({ selectedPropertyId, mode, loading, activeSessionRef, activeSessionPropertyRef, setRecentSessions, setPinnedSessions, setSearchSessions, setRecentSessionsEpoch, setServiceUnavailable, setSessionId, setExecutions, setConfirmClear, setJustUpdatedExecutionId, setError, setHistoryLoading, setInput, setHistoryDrawerOpen }: {
  selectedPropertyId: string | undefined;
  mode: 'page' | 'panel';
  loading: boolean;
  activeSessionRef: MutableRefObject<string>;
  activeSessionPropertyRef: MutableRefObject<string | undefined>;
  setRecentSessions: Dispatch<SetStateAction<AskRecentSessionSummary[]>>;
  setPinnedSessions: Dispatch<SetStateAction<AskRecentSessionSummary[]>>;
  setSearchSessions: Dispatch<SetStateAction<AskRecentSessionSummary[]>>;
  setRecentSessionsEpoch: Dispatch<SetStateAction<number>>;
  setServiceUnavailable: (value: boolean) => void;
  setSessionId: (value: string) => void;
  setExecutions: Dispatch<SetStateAction<AskExecutionResponse[]>>;
  setConfirmClear: (value: boolean) => void;
  setJustUpdatedExecutionId: (value: string | null) => void;
  setError: (value: string | null) => void;
  setHistoryLoading: (value: boolean) => void;
  setInput: (value: string) => void;
  setHistoryDrawerOpen: (value: boolean) => void;
}) {
  const [openingRecentSessionId, setOpeningRecentSessionId] = useState<string | null>(null);
  const [sessionActionId, setSessionActionId] = useState<string | null>(null);
  const [sessionActionIssue, setSessionActionIssue] = useState<string | null>(null);

  // IW-HIST-009..011 (FRD v1.71): rename, pin/unpin, archive/restore from the session menu. A rename updates the loaded
  // rows in place; pin and archive move the conversation between groups, so the lists are reloaded.
  const changeHistorySession = async (session: AskRecentSessionSummary, change: AskSessionChange): Promise<boolean> => {
    if (sessionActionId) return false;
    setSessionActionId(session.sessionId);
    setSessionActionIssue(null);
    try {
      const response = await api.updateAskSession(session.sessionId, change);
      if (!response.success || !response.data) throw new Error(response.message || 'Could not update that conversation.');
      const updated = response.data;
      const apply = (items: AskRecentSessionSummary[]) => items.map((item) => item.sessionId === updated.sessionId
        ? { ...item, title: updated.title?.trim() || item.title, pinned: updated.pinned, archived: updated.archived, titleSetByUser: updated.titleSetByUser }
        : item);
      setRecentSessions(apply);
      setPinnedSessions(apply);
      setSearchSessions(apply);
      if (!('title' in change)) setRecentSessionsEpoch((current) => current + 1);
      return true;
    } catch (caught) {
      const gone = askFailureCode(caught) === 'ASK_SESSION_NOT_FOUND';
      setSessionActionIssue(gone ? 'That conversation is no longer available. Nothing was changed.' : 'Could not update that conversation. Nothing was changed.');
      if (gone) setRecentSessionsEpoch((current) => current + 1);
      if (askServiceIsPaused(caught)) setServiceUnavailable(true);
      return false;
    } finally {
      setSessionActionId(null);
    }
  };

  // IW-HIST-012: delete one conversation after the row's own confirmation. Home records, tasks and other artifacts made
  // through Ask are untouched (the backend deletes only the session, its executions and their feedback). Deleting the
  // open conversation starts a fresh one, as clearing it does.
  const deleteHistorySession = async (session: AskRecentSessionSummary): Promise<boolean> => {
    if (sessionActionId) return false;
    setSessionActionId(session.sessionId);
    setSessionActionIssue(null);
    try {
      const response = await api.deleteAskSession(session.sessionId);
      if (!response.success) throw new Error(response.message || 'Could not delete that conversation.');
      clearResultViews(window.sessionStorage, session.sessionId);
      window.localStorage.removeItem(draftStorageKey(session.property.id, session.sessionId));
      const remove = (items: AskRecentSessionSummary[]) => items.filter((item) => item.sessionId !== session.sessionId);
      setRecentSessions(remove);
      setPinnedSessions(remove);
      setSearchSessions(remove);
      if (session.sessionId === activeSessionRef.current) {
        const nextSession = newId();
        activeSessionRef.current = nextSession;
        activeSessionPropertyRef.current = selectedPropertyId;
        setSessionId(nextSession); setExecutions([]); setConfirmClear(false); setJustUpdatedExecutionId(null);
        if (mode === 'page') updateAskLocation({ propertyId: selectedPropertyId }, 'replace');
      }
      setRecentSessionsEpoch((current) => current + 1);
      return true;
    } catch (caught) {
      setSessionActionIssue('Could not delete that conversation. It is still here.');
      if (askServiceIsPaused(caught)) setServiceUnavailable(true);
      return false;
    } finally {
      setSessionActionId(null);
    }
  };

  const openRecentSession = async (recent: AskRecentSessionSummary) => {
    if (openingRecentSessionId || loading) return;
    setOpeningRecentSessionId(recent.sessionId);
    setError(null);
    setHistoryLoading(true);
    try {
      const history = await api.getAskSession(recent.sessionId);
      if (!history.success || !history.data) throw new Error(history.message || 'Could not load that Ask Cozy session.');
      if (history.data.executions.length === 0) {
        setRecentSessions((current) => current.filter((item) => item.sessionId !== recent.sessionId));
        setSearchSessions((current) => current.filter((item) => item.sessionId !== recent.sessionId));
        throw new Error('This conversation is no longer available with your current home access.');
      }
      if (mode === 'page' && recent.property.id !== selectedPropertyId) {
        const destination = new URL(window.location.href);
        destination.searchParams.set('propertyId', recent.property.id);
        destination.searchParams.set('sessionId', recent.sessionId);
        destination.searchParams.set('executionId', recent.latestExecutionId);
        window.location.assign(`${destination.pathname}${destination.search}${destination.hash}`);
        return;
      }
      activeSessionRef.current = recent.sessionId;
      activeSessionPropertyRef.current = recent.property.id;
      setSessionId(recent.sessionId);
      setExecutions(history.data.executions);
      setInput(window.localStorage.getItem(draftStorageKey(recent.property.id, recent.sessionId)) || '');
      setJustUpdatedExecutionId(null);
      setHistoryDrawerOpen(false);
      if (mode === 'page') updateAskLocation({ sessionId: recent.sessionId, propertyId: recent.property.id, executionId: recent.latestExecutionId }, 'push');
    } catch (caught) {
      if (askServiceIsPaused(caught)) {
        setServiceUnavailable(true);
        setError(null);
      } else {
        setError(caught instanceof Error ? caught.message : 'Could not load that Ask Cozy session.');
      }
    } finally {
      setHistoryLoading(false);
      setOpeningRecentSessionId(null);
    }
  };

  return { openingRecentSessionId, setOpeningRecentSessionId, sessionActionId, setSessionActionId, sessionActionIssue, setSessionActionIssue, changeHistorySession, deleteHistorySession, openRecentSession };
}
