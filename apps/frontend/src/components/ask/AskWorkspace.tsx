'use client';

import Link from 'next/link';
import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, History, Loader2, Maximize2, RefreshCw, Send, Sparkles, Square, Trash2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import { prefersReducedMotion } from '@/features/ask/adaptivePresentation';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { cn } from '@/lib/utils';
import { VoiceInputButton } from './VoiceInputButton';
import type { AskCapabilityPrompt, AskExecutionResponse, AskPendingWorkItem, AskRecentSessionSummary, AskSessionChange } from '@/features/ask/types';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { track } from '@/lib/analytics/events';
import { buildAskWorkspaceHref } from '@/lib/navigation/askNavigation';
import { resolveDashboardBackHref } from '@/lib/navigation/backNavigation';
import { visibleConciergeFeaturedPrompts } from '@/features/ask/conciergeLandingPolicy';
import { hasResponseContext, ResponseContextContent } from './EvidenceContextPanel';
import { AskActionReturnContext, AskContextLink } from './blocks/context';
import { BlockView } from './blocks/registry';
import { useConversationView } from '@/features/ask/useConversationView';
import { useResponseContextPanel } from './workspace/useResponseContextPanel';
import { useComposerKeys } from './workspace/useComposerKeys';
import { useSessionLifecycle } from './workspace/useSessionLifecycle';
import { useResultRefresh } from './workspace/useResultRefresh';
import { useAskRequest } from './workspace/useAskRequest';
import { useSessionHistoryActions } from './workspace/useSessionHistoryActions';
import { restoreResultPosition } from './workspace/support';
import { usePendingWork } from './workspace/usePendingWork';
import { useConversationHistory } from './workspace/useConversationHistory';
import { PinnedResultsStrip } from './PinnedResultsStrip';
import { clearResultViews, createResultRequestTracker, mergeResultExecutions, readResultView, resultRequestKey, resultViewKey } from '@/features/ask/resultViewState';
import { IntelligenceRefreshStatus } from '@/components/intelligence/IntelligenceRefreshStatus';
import { useCalmAnswers } from '@/features/ask/calmAnswers';
import { followUpSuggestions } from '@/features/ask/followUps';
import { CalmLanding } from './calm/CalmLanding';
import { PendingTurn } from './calm/PendingTurn';
import { FollowUpRow } from './calm/FollowUpRow';
import { ACCESS_LOST_CODES, ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED, AskPromptAttribution, AskPromptSource, askFailureCode, askServiceIsPaused, askSuggestionKey, contextPanelStorageKey, draftStorageKey, fallbackPrompts, newId, updateAskLocation, useConciergeHome, useMediaQuery } from './workspace/support';
import { CapabilityCategoryIcon, CapabilityExplorer, ConciergeHome } from './workspace/ConciergeHome';
import { ConfirmationCard } from './workspace/CaptureCards';
import { ExecutionCard } from './workspace/ExecutionCard';
import { ConversationHistoryNav, PendingWorkInbox } from './workspace/ConversationHistoryNav';
// Re-exported for existing test imports (`from '../AskWorkspace'`); the
// registry in ./blocks/registry.tsx is the actual implementation now.
export { BlockView };
// The history rail and the draft key moved to ./workspace/; re-exported for existing imports.
export { ConversationHistoryNav } from './workspace/ConversationHistoryNav';
export { draftStorageKey } from './workspace/support';

export function AskWorkspace({ mode = 'page', onClose, onPendingStateChange, initialQuestion = '', initialSessionId = '', initialExecutionId = '', initialPropertyId = '', initialBackTo = '', initialBackLabel = 'Back to previous page', launchSurface = '', launchCapabilityId = '' }: { mode?: 'page' | 'panel'; onClose?: () => void; onPendingStateChange?: (pending: boolean) => void; initialQuestion?: string; initialSessionId?: string; initialExecutionId?: string; initialPropertyId?: string; initialBackTo?: string; initialBackLabel?: string; launchSurface?: string; launchCapabilityId?: string }) {
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();
  // A notification deep link (e.g. a monitor-fired reminder) carries the
  // property the answer is scoped to, but the globally-selected property
  // (from a prior page/localStorage) may differ. Sync it in immediately so
  // the effects below never run a pass against the wrong property — that
  // stale pass would otherwise both waste a fetch and, for the session
  // effect below, write this session id into the *previous* property's
  // session-key slot in localStorage, cross-contaminating it.
  const propertyMismatch = Boolean(initialPropertyId) && initialPropertyId !== selectedPropertyId;
  useEffect(() => {
    if (propertyMismatch) setSelectedPropertyId(initialPropertyId);
  }, [propertyMismatch, initialPropertyId, setSelectedPropertyId]);
  const [historyScope, setHistoryScope] = useState<'THIS_HOME' | 'ALL_HOMES'>('THIS_HOME');
  const effectiveHistoryScope = selectedPropertyId ? historyScope : 'ALL_HOMES';
  const [sessionId, setSessionId] = useState('');
  const [executions, setExecutions] = useState<AskExecutionResponse[]>([]);
  // IW-PRES-021 (FRD v1.95): folded and pinned results, kept for this browser session.
  const conversationView = useConversationView(sessionId, executions);
  const [input, setInput] = useState('');
  const inputRef = useRef('');
  inputRef.current = input;
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [availabilityEpoch, setAvailabilityEpoch] = useState(0);
  const [recentSessionsEpoch, setRecentSessionsEpoch] = useState(0);
  const { pendingWork, setPendingWork, pendingLoading, continuingId, setContinuingId, dismissingPendingId, dismissPendingWork } = usePendingWork({ selectedPropertyId, propertyMismatch, availabilityEpoch, loading, setError, setServiceUnavailable, onDismissed: () => setRecentSessionsEpoch((current) => current + 1) });
  const accessLostRef = useRef<(propertyId: string) => void>(() => {});
  const { recentSessions, setRecentSessions, recentSessionsLoading, setRecentSessionsLoading, recentSessionsLoadingMore, setRecentSessionsLoadingMore, recentSessionsNextCursor, setRecentSessionsNextCursor, recentSessionsIssue, setRecentSessionsIssue, historySearchInput, setHistorySearchInput, historySearchTerm, setHistorySearchTerm, searchSessions, setSearchSessions, searchNextCursor, setSearchNextCursor, searchLoading, setSearchLoading, searchLoadingMore, setSearchLoadingMore, searchIssue, setSearchIssue, historyView, setHistoryView, pinnedSessions, setPinnedSessions, historyPropertyRef, historyRequestEpochRef, searchRequestEpochRef, searchScopeRef, loadMoreRecentSessions, loadMoreSearchSessions } = useConversationHistory({ selectedPropertyId, effectiveHistoryScope, propertyMismatch, availabilityEpoch, recentSessionsEpoch, setServiceUnavailable, onAccessLostRef: accessLostRef });
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const { contextExecutionId, contextHeadingRef, contextExecution, contextContentAvailable, wideContextPanel, closeResponseContext, openResponseContext } = useResponseContextPanel({ mode, sessionId, selectedPropertyId, executions });
  // Marks the execution whose pending card should receive focus: set right
  // after a turn this session actually produced (a new question answered,
  // or an existing execution advancing after a capture/clarification/
  // confirmation), never on the initial history load or a resumed session
  // read -- so restoring old conversation state on page load doesn't yank
  // focus away from wherever the user actually is.
  const [justUpdatedExecutionId, setJustUpdatedExecutionId] = useState<string | null>(null);
  // ASK_COZY_INTERACTION_MODEL_UI_FRD FRESH-001/HAND-003: the return-trip
  // revalidation below used to catch failures with `.catch(() => undefined)`,
  // leaving the pre-edit view visible with no indication revalidation ever
  // failed (external review finding). Surfaced instead through the same
  // refreshError/retry affordance ExecutionCard's own Refresh button has.
  const requests = useRef(createResultRequestTracker());
  // FRD v1.96 (composer): tokens of requests the homeowner stopped waiting for; their late answers are discarded and never clear a newer request's loading state.
  const stoppedRequests = useRef(new Set<number>());
  const inFlight = useRef<{ key: string; token: number; message: string } | null>(null);
  const deniedProperties = useRef(new Set<string>());
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeSessionRef = useRef('');
  const { refreshIssues, setRefreshIssues, refreshRequests, setRefreshRequests, redactAccessLostResult, refreshResult, updateExecution } = useResultRefresh({ executions, activeSessionRef, requests, deniedProperties, setExecutions, setPendingWork, setJustUpdatedExecutionId });
  const activeSessionPropertyRef = useRef<string | undefined>(undefined);
  const { clearHistory, startNewSession } = useSessionLifecycle({ mode, sessionId, executions, selectedPropertyId, initialQuestion, initialSessionId, initialExecutionId, propertyMismatch, availabilityEpoch, historyLoading, loading, requests, deniedProperties, activeSessionRef, activeSessionPropertyRef, textareaRef, refreshResult, setSessionId, setInput, setExecutions, setRefreshIssues, setRefreshRequests, setHistoryLoading, setError, setLoading, setConfirmClear, setJustUpdatedExecutionId, setServiceUnavailable, setRecentSessionsEpoch, setHistoryDrawerOpen });
  const redactHistoryAccessLoss = useCallback((propertyId: string) => {
    setRecentSessions([]);
    setPinnedSessions([]);
    setRecentSessionsNextCursor(null);
    setRecentSessionsIssue('Access to this home changed. Its conversations are no longer shown.');
    setSearchSessions([]);
    setSearchNextCursor(null);
    setSearchIssue('Access to this home changed. Its conversations are no longer shown.');
    const currentSessionId = activeSessionRef.current;
    deniedProperties.current.add(`${currentSessionId}:${propertyId}`);
    clearResultViews(window.sessionStorage, currentSessionId);
    setExecutions((current) => current.map((item) => item.property?.id === propertyId ? {
      ...item, question: 'Unavailable result', blocks: [], originalResponse: null, confirmation: null,
      clarification: null, captureRequests: [], suggestions: [], skillHandoff: null, viewState: null,
    } : item));
    setPendingWork((current) => current.filter((item) => item.execution.property?.id !== propertyId));
  }, [setRecentSessions, setPinnedSessions, setRecentSessionsNextCursor, setRecentSessionsIssue, setSearchSessions, setSearchNextCursor, setSearchIssue, setPendingWork]);
  accessLostRef.current = redactHistoryAccessLoss;
  const landingVisible = executions.length === 0;
  // FRD v1.111 §11.11: the calm shell (one slim header, no helper copy, state strip, docked follow-ups). Off unless chosen.
  const calm = useCalmAnswers();
  // IW-CONV-006 (FRD v1.112): from the moment a question is sent, its turn is on screen: the question, then a status line in the answer's place.
  const pendingMessage = calm && loading ? inFlight.current?.message ?? null : null;
  const showLanding = landingVisible && !pendingMessage;
  // Also filter on read so conversations persisted before the backend policy
  // shipped do not keep displaying a prompt the homeowner already asked.
  const askedQuestionKeys = new Set(executions.map((execution) => askSuggestionKey(execution.question)));
  // Concierge composition is only useful on the empty starting surface.
  // It is also loaded when a user explicitly returns home without deleting
  // their conversation, which keeps discovery independent from retention.
  const concierge = useConciergeHome(
    !historyLoading && landingVisible && !propertyMismatch ? selectedPropertyId : undefined,
    availabilityEpoch,
  );
  const askUnavailable = serviceUnavailable
    || concierge.failureCode === ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED;
  const hasPendingWork = loading || Boolean(input.trim()) || executions.some((execution) => ['NEEDS_ENTITY', 'NEEDS_CLARIFICATION', 'NEEDS_CONTEXT', 'NEEDS_CONFIRMATION', 'RUNNING'].includes(execution.status));
  const safeBackTo = resolveDashboardBackHref(initialBackTo, '');



  useEffect(() => { onPendingStateChange?.(hasPendingWork); }, [hasPendingWork, onPendingStateChange]);








  useEffect(() => {
    if (loading) endRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }, [loading]);
  useEffect(() => {
    if (!justUpdatedExecutionId || loading) return;
    const timeout = window.setTimeout(() => {
      document.getElementById(`ask-execution-${justUpdatedExecutionId}`)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }, 50);
    return () => window.clearTimeout(timeout);
  }, [justUpdatedExecutionId, loading]);
  useEffect(() => { if (mode === 'panel') window.setTimeout(() => textareaRef.current?.focus(), 80); }, [mode]);

  const scopeLabel = selectedPropertyId ? 'Answers use your selected home record' : 'General home guidance';

  const { ask, stopAsking, editAndResend } = useAskRequest({ sessionId, loading, executions, selectedPropertyId, mode, launchSurface, launchCapabilityId, safeBackTo, requests, inFlight, stoppedRequests, deniedProperties, activeSessionRef, textareaRef, setInput, setError, setLoading, setServiceUnavailable, setExecutions, setJustUpdatedExecutionId, setRecentSessionsEpoch });

  const { submit, keyDown, isComposingRef } = useComposerKeys({ input, ask });


  const { openingRecentSessionId, sessionActionId, sessionActionIssue, setSessionActionIssue, changeHistorySession, deleteHistorySession, openRecentSession } = useSessionHistoryActions({ selectedPropertyId, mode, loading, activeSessionRef, activeSessionPropertyRef, setRecentSessions, setPinnedSessions, setSearchSessions, setRecentSessionsEpoch, setServiceUnavailable, setSessionId, setExecutions, setConfirmClear, setJustUpdatedExecutionId, setError, setHistoryLoading, setInput, setHistoryDrawerOpen });



  const resumePendingWork = async (item: AskPendingWorkItem) => {
    if (continuingId || loading) return;
    setContinuingId(item.execution.executionId); setError(null);
    try {
      const response = await api.continueAskExecution(item.execution.executionId, mode === 'page' ? 'ASK_PAGE' : 'GLOBAL_LAUNCHER');
      if (!response.success || !response.data) throw new Error(response.message || 'Could not resume this request.');
      const resumed = response.data;
      if ((resumed.property?.id ?? undefined) !== selectedPropertyId) throw new Error('Select the matching home before resuming this request.');
      activeSessionRef.current = resumed.sessionId;
      activeSessionPropertyRef.current = resumed.property?.id ?? selectedPropertyId;
      setSessionId(resumed.sessionId); setHistoryLoading(true);
      const history = await api.getAskSession(resumed.sessionId);
      if (!history.success || !history.data) throw new Error(history.message || 'Could not load the pending conversation.');
      setExecutions(history.data.executions);
      setJustUpdatedExecutionId(resumed.executionId);
      setPendingWork((current) => current.filter((pending) => pending.execution.sessionId !== resumed.sessionId));
      if (mode === 'page') updateAskLocation({ sessionId: resumed.sessionId, propertyId: resumed.property?.id ?? selectedPropertyId, executionId: resumed.executionId }, 'push');
    } catch (caught) {
      if (askServiceIsPaused(caught)) {
        setServiceUnavailable(true);
        setError(null);
      } else {
        setError(caught instanceof Error ? caught.message : 'Could not resume this request.');
      }
    } finally { setHistoryLoading(false); setContinuingId(null); }
  };

  const visiblePendingWork = pendingWork.filter((item) => item.execution.sessionId !== sessionId);
  const visibleRecentSessions = recentSessions.filter((item) => item.sessionId !== sessionId && (effectiveHistoryScope === 'ALL_HOMES' || item.property.id === selectedPropertyId));
  const latestExecution = executions.at(-1);
  const knownActiveSession = [...pinnedSessions, ...recentSessions, ...searchSessions].find((item) => item.sessionId === sessionId);
  const activeConversation = executions.length > 0 && latestExecution && latestExecution.property?.id === selectedPropertyId && !deniedProperties.current.has(`${sessionId}:${latestExecution.property?.id}`) ? {
    sessionId,
    title: executions[0].question,
    property: latestExecution.property ?? { id: selectedPropertyId ?? 'general', label: selectedPropertyId ? 'Selected home' : 'General home guidance' },
    latestStatus: latestExecution.status,
    latestExecutionId: latestExecution.executionId,
    executionCount: executions.length,
    lastActiveAt: latestExecution.updatedAt,
    // The rail's loaded row for this conversation carries its lifecycle state and any homeowner-authored title.
    pinned: knownActiveSession?.pinned ?? false,
    archived: knownActiveSession?.archived ?? false,
    titleSetByUser: knownActiveSession?.titleSetByUser ?? false,
    ...(knownActiveSession?.titleSetByUser ? { title: knownActiveSession.title } : {}),
  } satisfies AskRecentSessionSummary : null;
  const historySearchActive = Boolean(historySearchInput.trim());
  const historySearchPending = historySearchActive && historySearchInput.trim() !== historySearchTerm;
  const inHistoryScope = (item: AskRecentSessionSummary) => effectiveHistoryScope === 'ALL_HOMES' || item.property.id === selectedPropertyId;
  // The open conversation leads the recent list unless it lives in the pinned group or the archive.
  const activeLeadsRecent = activeConversation && !activeConversation.pinned && !activeConversation.archived;
  const historySessions = historySearchActive
    ? historySearchPending ? [] : searchSessions.filter(inHistoryScope)
    : historyView === 'ARCHIVED' ? recentSessions.filter(inHistoryScope)
      : effectiveHistoryScope === 'ALL_HOMES' ? recentSessions : activeLeadsRecent ? [activeConversation, ...visibleRecentSessions] : visibleRecentSessions;
  const historyPinnedSessions = historyView === 'RECENT' ? pinnedSessions.filter(inHistoryScope) : [];
  const historyRailLoading = historySearchActive ? historySearchPending || searchLoading : recentSessionsLoading;
  const historyRailLoadingMore = historySearchActive ? searchLoadingMore : recentSessionsLoadingMore;
  const historyRailHasMore = historySearchActive ? !historySearchPending && Boolean(searchNextCursor) : Boolean(recentSessionsNextCursor);
  const historyRailIssue = sessionActionIssue ?? (historySearchActive ? searchIssue : recentSessionsIssue);
  const loadMoreHistory = historySearchActive ? loadMoreSearchSessions : loadMoreRecentSessions;
  const personalizedFeaturedPrompts = concierge.view ? visibleConciergeFeaturedPrompts(concierge.view) : [];
  const usingFallbackPrompts = personalizedFeaturedPrompts.length === 0;
  const featuredPrompts = usingFallbackPrompts ? fallbackPrompts : personalizedFeaturedPrompts;
  const latestExecutionId = latestExecution?.executionId ?? '';
  const followUps = calm ? followUpSuggestions(latestExecution, askedQuestionKeys, askSuggestionKey) : [];
  const fullWorkspaceHref = buildAskWorkspaceHref({
    propertyId: selectedPropertyId,
    sessionId,
    executionId: latestExecutionId,
    backTo: safeBackTo,
    launchSurface,
    launchCapabilityId,
  });
  const runPrompt = (prompt: AskCapabilityPrompt, source: AskPromptSource) => {
    if (!sessionId || loading) return;
    const attribution = { promptId: prompt.id, categoryId: prompt.categoryId, source } satisfies AskPromptAttribution;
    track('ask_prompt_selected', { propertyId: selectedPropertyId ?? null, ...attribution });
    void ask(prompt.question, attribution, prompt.context);
  };
  const explorer = (
    <CapabilityExplorer chip={calm}
      groups={concierge.view?.capabilityGroups ?? []}
      onOpen={() => track('ask_capability_explorer_opened', { propertyId: selectedPropertyId ?? null, groupCount: concierge.view?.capabilityGroups.length ?? 0, capabilityCount: concierge.view?.capabilityGroups.reduce((count, group) => count + group.capabilityIds.length, 0) ?? 0 })}
      onSelect={(prompt) => runPrompt(prompt, 'EXPLORER')}
    />
  );
  const renderComposer = (placement: 'hero' | 'footer') => (
    <form onSubmit={submit} className="group mx-auto w-full max-w-3xl" aria-label="Ask Cozy question">
      {error && <div className="mb-2 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700" role="alert"><AlertTriangle className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1">{error}</span>
        {input.trim() && !loading && sessionId && <button type="button" onClick={() => void ask(input)} className="shrink-0 rounded-lg border border-red-200 bg-white px-2 py-1 font-semibold text-red-800 hover:bg-red-100">Try again</button>}</div>}
      <div className={cn('flex items-end gap-2 border border-slate-300 bg-white p-2 shadow-sm transition focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100', placement === 'hero' ? 'rounded-3xl p-3 shadow-[0_12px_40px_-20px_rgba(15,118,110,0.45)]' : 'rounded-2xl')}>
        <textarea ref={textareaRef} value={input} onChange={(event) => { setInput(event.target.value); if (sessionId) window.localStorage.setItem(draftStorageKey(selectedPropertyId, sessionId), event.target.value); }} onKeyDown={keyDown} onCompositionStart={() => { isComposingRef.current = true; }} onCompositionEnd={() => { isComposingRef.current = false; }} rows={placement === 'hero' && !calm ? 2 : 1} maxLength={4000} placeholder="Ask anything about your home…" className={cn('max-h-32 flex-1 resize-none bg-transparent px-2 text-slate-900 outline-none placeholder:text-slate-400', placement === 'hero' ? 'min-h-14 py-3 text-base' : 'min-h-10 py-2 text-sm')} />
        <VoiceInputButton large={placement === 'hero'} disabled={loading || !sessionId} getValue={() => inputRef.current}
          onChange={(value) => { setInput(value); if (sessionId) window.localStorage.setItem(draftStorageKey(selectedPropertyId, sessionId), value); }} />
        {loading && inFlight.current
          ? <button key="stop" type="button" onClick={stopAsking} aria-label="Stop" className={cn('grid shrink-0 place-items-center bg-slate-800 text-white transition hover:bg-slate-900', placement === 'hero' ? 'h-12 w-12 rounded-2xl' : 'h-10 w-10 rounded-xl')}><Square className="h-4 w-4" /></button>
          : <button key="send" type="submit" disabled={!input.trim() || loading || !sessionId} aria-label="Send question" className={cn('grid shrink-0 place-items-center rounded-2xl bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40', placement === 'hero' ? 'h-12 w-12' : 'h-10 w-10 rounded-xl')}><Send className="h-4 w-4" /></button>}
      </div>
      {calm ? (input.includes('\n') && <p className="mt-1.5 hidden px-1 text-[11px] text-slate-400 group-focus-within:block">Shift+Enter for a new line</p>) : <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-400"><span>Enter to send · Shift+Enter for a new line</span><span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Record-based when available</span></div>}
    </form>
  );

  return (
    <div data-ask-layout={mode === 'page' ? 'full-window' : 'panel'} className={cn('flex min-h-0 flex-col', mode === 'page' ? 'h-full bg-white' : 'h-full bg-slate-50', calm && 'ask-calm')}>
      {/* Safe-area padding only changes anything on the mobile full-screen
          sheet (mode="panel" below the lg breakpoint, where this header sits
          flush against the device's actual top edge/notch); env() resolves
          to 0 on the desktop floating panel and the dashboard-embedded page
          view, so it's harmless to apply unconditionally rather than
          threading a separate "is this the mobile sheet" signal through. */}
      <header className={cn('flex items-center justify-between border-b border-slate-200 bg-white', calm && mode === 'page' && 'lg:hidden', mode === 'page' ? (calm ? 'min-h-12 px-4 sm:px-6' : 'min-h-16 px-4 sm:px-6') : 'px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-5')}>
        <div className="min-w-0"><div className="flex items-center gap-3"><span className={cn('grid place-items-center bg-teal-700 text-white', mode === 'page' ? (calm ? 'h-8 w-8 rounded-xl' : 'h-9 w-9 rounded-xl lg:hidden') : 'h-9 w-9 rounded-xl')}><Sparkles className="h-4 w-4" /></span><div>{mode === 'page' ? <h1 className="text-lg font-semibold tracking-tight text-slate-950">Ask Cozy</h1> : <h2 className="font-semibold text-slate-950">Ask Cozy</h2>}{!calm && <p className="truncate text-xs text-slate-500">{scopeLabel}</p>}</div></div></div>
        <div className="flex items-center gap-1">
          {selectedPropertyId && <IntelligenceRefreshStatus propertyId={selectedPropertyId} compact={calm} />}
          {mode === 'page' && !askUnavailable && <button type="button" aria-label="Open conversation history" onClick={() => setHistoryDrawerOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 lg:hidden"><History className="h-4 w-4" /><span className="hidden sm:inline">Conversations</span></button>}
          {mode === 'page' && executions.length > 0 && !askUnavailable && <><button type="button" aria-label="New Ask Cozy session" onClick={startNewSession} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 lg:hidden"><Sparkles className="h-4 w-4" /><span className="hidden sm:inline">New conversation</span></button><button type="button" aria-label="Delete current conversation" onClick={() => setConfirmClear(true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"><Trash2 className="h-4 w-4" />{!calm && <span className="hidden md:inline">Delete</span>}</button></>}
          {mode === 'panel' && <Link href={fullWorkspaceHref} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50"><Maximize2 className="h-4 w-4" />Full workspace</Link>}
          {onClose && <button onClick={onClose} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Close</button>}
        </div>
      </header>

      {mode === 'page' && (
        <Sheet open={historyDrawerOpen} onOpenChange={setHistoryDrawerOpen}>
          <SheetContent side="left" className="flex w-[min(22rem,92vw)] flex-col bg-slate-50 p-4 pt-[calc(env(safe-area-inset-top)+1rem)] lg:hidden">
            <SheetHeader className="pr-12 text-left">
              <SheetTitle>Ask Cozy conversations</SheetTitle>
              <SheetDescription>Start something new or continue a conversation from an accessible home.</SheetDescription>
            </SheetHeader>
            <div className="mt-5 min-h-0 flex-1">
              <ConversationHistoryNav items={historySessions} pinnedItems={historyPinnedSessions} view={historyView} onViewChange={(nextView) => { setSessionActionIssue(null); setHistorySearchInput(''); setHistoryView(nextView); }} onSessionChange={changeHistorySession} onSessionDelete={deleteHistorySession} busySessionId={sessionActionId} activeSessionId={executions.length > 0 ? sessionId : ''} loading={historyRailLoading} loadingMore={historyRailLoadingMore} hasMore={historyRailHasMore} issue={historyRailIssue} openingId={openingRecentSessionId} query={historySearchInput} scope={effectiveHistoryScope} selectedHomeAvailable={Boolean(selectedPropertyId)} onQueryChange={setHistorySearchInput} onScopeChange={setHistoryScope} onOpen={(recent) => void openRecentSession(recent)} onNew={startNewSession} onLoadMore={() => void loadMoreHistory()} backHref={safeBackTo} backLabel={initialBackLabel} />
            </div>
          </SheetContent>
        </Sheet>
      )}

      <Sheet open={Boolean(contextExecution && contextContentAvailable && !wideContextPanel)} onOpenChange={(open) => { if (!open) closeResponseContext(); }}>
        <SheetContent side="right" className="flex w-[min(24rem,94vw)] flex-col p-4 pt-[calc(env(safe-area-inset-top)+1rem)] sm:max-w-sm">
          <SheetHeader className="sr-only">
            <SheetTitle>Response context</SheetTitle>
            <SheetDescription>Sources, assumptions, limitations, related records, and output records for the selected Ask Cozy response.</SheetDescription>
          </SheetHeader>
          {contextExecution && contextContentAvailable && <ResponseContextContent execution={contextExecution} headingRef={contextHeadingRef} onClose={closeResponseContext} showCloseButton={false} renderNavigation={(navigation) => navigation ? <AskContextLink href={navigation.href} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 hover:border-teal-300 hover:bg-teal-50">{navigation.label}</AskContextLink> : null} />}
        </SheetContent>
      </Sheet>

      {confirmClear && !askUnavailable && <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><span className="flex-1">Delete this Ask conversation and its feedback? Home records and artifacts created through Ask will remain unchanged.</span><button type="button" disabled={loading} onClick={() => void clearHistory()} className="min-h-10 rounded-xl bg-red-700 px-3 font-semibold text-white">Delete conversation</button><button type="button" disabled={loading} onClick={() => setConfirmClear(false)} className="min-h-10 rounded-xl px-3 font-semibold">Keep it</button></div>}

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{askUnavailable ? 'Ask Cozy is temporarily unavailable. Your saved data is unchanged.' : loading ? 'Ask is checking your home record.' : error ? `Ask error: ${error}` : executions.length ? `Ask response updated. Latest status: ${executions[executions.length - 1].status.toLowerCase().replace(/_/g, ' ')}.` : 'Ask is ready.'}</div>
      <div className="flex min-h-0 flex-1">
        {mode === 'page' && !askUnavailable && (
          <aside className="hidden w-[17rem] shrink-0 border-r border-slate-200 bg-[#f7f7f5] px-3 py-4 lg:flex lg:flex-col" aria-label="Conversation history">
            <ConversationHistoryNav items={historySessions} pinnedItems={historyPinnedSessions} view={historyView} onViewChange={(nextView) => { setSessionActionIssue(null); setHistorySearchInput(''); setHistoryView(nextView); }} onSessionChange={changeHistorySession} onSessionDelete={deleteHistorySession} busySessionId={sessionActionId} activeSessionId={executions.length > 0 ? sessionId : ''} loading={historyRailLoading} loadingMore={historyRailLoadingMore} hasMore={historyRailHasMore} issue={historyRailIssue} openingId={openingRecentSessionId} query={historySearchInput} scope={effectiveHistoryScope} selectedHomeAvailable={Boolean(selectedPropertyId)} onQueryChange={setHistorySearchInput} onScopeChange={setHistoryScope} onOpen={(recent) => void openRecentSession(recent)} onNew={startNewSession} onLoadMore={() => void loadMoreHistory()} backHref={safeBackTo} backLabel={initialBackLabel} statusSlot={calm && selectedPropertyId ? <IntelligenceRefreshStatus propertyId={selectedPropertyId} compact showLabel={false} /> : undefined} />
          </aside>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
      <main className={cn('min-h-0 flex-1 overflow-y-auto', calm && mode === 'page' && 'bg-[#faf9f6]', mode === 'page' ? (calm ? 'px-4 pb-6 pt-5 sm:px-6 lg:px-10 lg:pt-8' : 'px-4 pb-8 pt-8 sm:px-6 lg:px-10 lg:pt-12') : 'px-4 py-5 sm:px-5')}>
        {calm && mode === 'page' && <h1 className="sr-only hidden lg:block">Ask Cozy</h1>}
        {historyLoading ? <div className="flex h-32 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading conversation</div> : askUnavailable ? (
          <section className="mx-auto mt-6 max-w-2xl rounded-3xl border border-amber-200 bg-amber-50/80 px-5 py-8 text-center sm:px-8" role="status" aria-labelledby="ask-paused-title">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-amber-700 shadow-sm"><AlertTriangle className="h-5 w-5" /></span>
            <h2 id="ask-paused-title" className="mt-4 text-xl font-semibold text-slate-950">Ask Cozy is taking a short pause</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Your home records and saved conversations are unchanged. Please try again shortly.</p>
            <button type="button" onClick={() => { setServiceUnavailable(false); setAvailabilityEpoch((current) => current + 1); }} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800">
              <RefreshCw className="h-4 w-4" />Try again
            </button>
          </section>
        ) : showLanding ? (
          <div className={cn('mx-auto max-w-3xl', calm && 'sm:pt-[3vh]')}>
            {calm ? <h2 className="mb-5 font-display text-[24px] font-medium leading-tight tracking-[-0.01em] text-slate-950 sm:text-[30px]">How can I help with your home?</h2> : <p className="mb-4 max-w-2xl text-base leading-7 text-slate-600">Understand your home, compare options, and take the right next step—with answers grounded in your home record.</p>}
            {renderComposer('hero')}
            {calm ? <CalmLanding view={concierge.view} loading={concierge.loading} failed={concierge.failed} starters={featuredPrompts} usingFallbackStarters={usingFallbackPrompts} onAsk={(prompt, source) => runPrompt(prompt, source)}>{explorer}</CalmLanding> : <section className="mt-7" aria-labelledby="ask-suggestions-title">
              <h2 id="ask-suggestions-title" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Popular ways to use Ask Cozy</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">{featuredPrompts.map((prompt) => <button type="button" key={prompt.id} onClick={() => runPrompt(prompt, usingFallbackPrompts ? 'FALLBACK' : prompt.source)} className="group rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"><span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-700"><CapabilityCategoryIcon categoryId={prompt.categoryId} className="h-3.5 w-3.5" />{prompt.categoryLabel}</span><span className="mt-1.5 block text-sm font-medium text-slate-700 group-hover:text-teal-900">{prompt.question}</span></button>)}</div>
              {explorer}
            </section>}
            <div className="mt-8"><PendingWorkInbox items={visiblePendingWork} loadingId={continuingId} dismissingId={dismissingPendingId} onResume={(item) => void resumePendingWork(item)} onDismiss={(item) => void dismissPendingWork(item)} /></div>
            {pendingLoading && <p className="mt-4 text-xs text-slate-400" role="status">Checking for pending Ask requests…</p>}
            {!calm && <ConciergeHome propertyId={selectedPropertyId} view={concierge.view} loading={concierge.loading} failed={concierge.failed} onAsk={(prompt, source) => runPrompt(prompt, source)} />}
          </div>
        ) : (
          <div className={cn('mx-auto max-w-3xl', calm ? 'space-y-5' : 'space-y-7')}>
            <PendingWorkInbox items={visiblePendingWork} loadingId={continuingId} dismissingId={dismissingPendingId} onResume={(item) => void resumePendingWork(item)} onDismiss={(item) => void dismissPendingWork(item)} />
            {pendingLoading && <p className="text-xs text-slate-400" role="status">Checking for pending Ask requests…</p>}
            {/* ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001/RES-003/MAINT-003: a
                bare filter refinement ("only show urgent") creates its own
                execution row (a fresh authoritative query is unavoidable --
                MAINT-003 requires querying the full matching collection, not
                re-filtering already-truncated client data), and it must
                update the same surface rather than stack a second full list
                under the first. But RES-001 requires the original response
                to remain retained, not silently erased -- external review
                finding: dropping the whole superseded execution used to also
                delete its own question bubble, losing conversation history.
                Its response content is collapsed (no duplicate list); its
                question stays visible. */}
            <PinnedResultsStrip executions={executions.filter((execution) => conversationView.view.pinned.includes(execution.executionId))} onUnpin={conversationView.togglePin} />
            {executions.map((execution) => {
              const askReturnHref = buildAskWorkspaceHref({ propertyId: selectedPropertyId, sessionId: execution.sessionId, executionId: execution.executionId, backTo: safeBackTo });
              const visibleSuggestions = execution.suggestions.filter((suggestion) => !askedQuestionKeys.has(askSuggestionKey(suggestion)));
              const isSuperseded = executions.some((other) => other.continuesExecutionId === execution.executionId || (other.viewState && execution.viewState && other.viewState.resultId === execution.viewState.resultId && other.viewState.revision > execution.viewState.revision));
              return <AskActionReturnContext.Provider key={execution.executionId} value={askReturnHref}>
                <ExecutionCard
                  execution={execution}
                  isSuperseded={isSuperseded}
                  justUpdatedExecutionId={justUpdatedExecutionId}
                  updateExecution={updateExecution}
                  loading={loading}
                  ask={ask}
                  selectedPropertyId={selectedPropertyId ?? ''}
                  setInput={setInput}
                  visibleSuggestions={visibleSuggestions}
                  activeSessionRef={activeSessionRef}
                  refreshIssue={deniedProperties.current.has(`${execution.sessionId}:${execution.property?.id}`) ? { accessLost: true, message: 'Access to this result is no longer available.' } : refreshIssues[execution.executionId] ?? null}
                  refreshResult={refreshResult}
                  refreshPending={Boolean(refreshRequests[resultRequestKey(execution)])}
                  onAccessLost={redactAccessLostResult}
                  contextOpen={contextExecutionId === execution.executionId}
                  onOpenContext={(trigger) => openResponseContext(execution, trigger)}
                  folded={conversationView.view.folded.includes(execution.executionId)}
                  pinned={conversationView.view.pinned.includes(execution.executionId)}
                  onToggleFold={() => conversationView.toggleFold(execution.executionId)}
                  onTogglePin={() => conversationView.togglePin(execution.executionId)}
                  onEditQuestion={editAndResend}
                />
              </AskActionReturnContext.Provider>;
            })}
            {pendingMessage ? <PendingTurn message={pendingMessage} /> : loading && <div className="flex items-center gap-3 rounded-2xl border border-teal-100 bg-white p-4 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin text-teal-700" />Checking your home record…</div>}
            <div ref={endRef} />
          </div>
        )}
      </main>

      {(executions.length > 0 || pendingMessage) && !askUnavailable && <footer className={cn('sticky bottom-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:p-4', calm && mode === 'page' && 'bg-[#faf9f6]/95', mode === 'panel' && 'pb-[calc(env(safe-area-inset-bottom)+0.75rem)]')}>{calm && <FollowUpRow suggestions={followUps} disabled={loading} onPick={(question) => void ask(question)} />}{renderComposer('footer')}</footer>}
        </div>
        {wideContextPanel && contextExecution && contextContentAvailable && <aside className="hidden w-80 shrink-0 border-l border-slate-200 bg-slate-50/80 p-4 xl:block" aria-label="Response context">
          <ResponseContextContent execution={contextExecution} headingRef={contextHeadingRef} onClose={closeResponseContext} renderNavigation={(navigation) => navigation ? <AskContextLink href={navigation.href} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 hover:border-teal-300 hover:bg-teal-50">{navigation.label}</AskContextLink> : null} />
        </aside>}
      </div>
    </div>
  );
}
