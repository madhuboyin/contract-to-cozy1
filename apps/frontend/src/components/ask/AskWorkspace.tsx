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
import { usePendingWork } from './workspace/usePendingWork';
import { useConversationHistory } from './workspace/useConversationHistory';
import { PinnedResultsStrip } from './PinnedResultsStrip';
import { clearResultViews, createResultRequestTracker, mergeResultExecutions, readResultView, resultRequestKey, resultViewKey } from '@/features/ask/resultViewState';
import { IntelligenceRefreshStatus } from '@/components/intelligence/IntelligenceRefreshStatus';
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
  const [openingRecentSessionId, setOpeningRecentSessionId] = useState<string | null>(null);
  const [recentSessionsEpoch, setRecentSessionsEpoch] = useState(0);
  const { pendingWork, setPendingWork, pendingLoading, continuingId, setContinuingId, dismissingPendingId, dismissPendingWork } = usePendingWork({ selectedPropertyId, propertyMismatch, availabilityEpoch, loading, setError, setServiceUnavailable, onDismissed: () => setRecentSessionsEpoch((current) => current + 1) });
  const accessLostRef = useRef<(propertyId: string) => void>(() => {});
  const { recentSessions, setRecentSessions, recentSessionsLoading, setRecentSessionsLoading, recentSessionsLoadingMore, setRecentSessionsLoadingMore, recentSessionsNextCursor, setRecentSessionsNextCursor, recentSessionsIssue, setRecentSessionsIssue, historySearchInput, setHistorySearchInput, historySearchTerm, setHistorySearchTerm, searchSessions, setSearchSessions, searchNextCursor, setSearchNextCursor, searchLoading, setSearchLoading, searchLoadingMore, setSearchLoadingMore, searchIssue, setSearchIssue, historyView, setHistoryView, pinnedSessions, setPinnedSessions, historyPropertyRef, historyRequestEpochRef, searchRequestEpochRef, searchScopeRef, loadMoreRecentSessions, loadMoreSearchSessions } = useConversationHistory({ selectedPropertyId, effectiveHistoryScope, propertyMismatch, availabilityEpoch, recentSessionsEpoch, setServiceUnavailable, onAccessLostRef: accessLostRef });
  const [sessionActionId, setSessionActionId] = useState<string | null>(null);
  const [sessionActionIssue, setSessionActionIssue] = useState<string | null>(null);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [contextExecutionId, setContextExecutionId] = useState<string | null>(null);
  const contextHeadingRef = useRef<HTMLHeadingElement>(null);
  const contextReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const contextPanelWideViewport = useMediaQuery('(min-width: 1280px)');
  const wideContextPanel = mode === 'page' && contextPanelWideViewport;
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
  const [refreshIssues, setRefreshIssues] = useState<Record<string, { message: string; accessLost: boolean }>>({});
  const requests = useRef(createResultRequestTracker());
  // FRD v1.96 (composer): tokens of requests the homeowner stopped waiting for; their late answers are discarded and never clear a newer request's loading state.
  const stoppedRequests = useRef(new Set<number>());
  const inFlight = useRef<{ key: string; token: number; message: string } | null>(null);
  const deniedProperties = useRef(new Set<string>());
  const [refreshRequests, setRefreshRequests] = useState<Record<string, number>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeSessionRef = useRef('');
  const activeSessionPropertyRef = useRef<string | undefined>(undefined);
  const appliedInitialQuestionRef = useRef('');
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
  const contextExecution = contextExecutionId ? executions.find((execution) => execution.executionId === contextExecutionId) ?? null : null;
  const contextContentAvailable = Boolean(contextExecution && hasResponseContext(contextExecution));

  const closeResponseContext = () => {
    const contextSessionId = contextExecution?.sessionId ?? sessionId;
    if (contextSessionId) window.sessionStorage.removeItem(contextPanelStorageKey(contextSessionId, contextExecution?.property?.id ?? selectedPropertyId));
    setContextExecutionId(null);
    if (window.history.state?.askResponseContext?.sessionId === contextSessionId
      && window.history.state.askResponseContext.executionId === contextExecution?.executionId) window.history.back();
    const returnTarget = contextReturnFocusRef.current
      ?? document.querySelector<HTMLButtonElement>('button[aria-controls="ask-response-context"][aria-expanded="true"]');
    contextReturnFocusRef.current = null;
    window.requestAnimationFrame(() => returnTarget?.isConnected && returnTarget.focus({ preventScroll: true }));
  };
  const openResponseContext = (execution: AskExecutionResponse, trigger: HTMLButtonElement) => {
    contextReturnFocusRef.current = trigger;
    const target = { sessionId: execution.sessionId, propertyId: execution.property?.id ?? null, executionId: execution.executionId };
    if (window.history.state?.askResponseContext?.executionId !== execution.executionId) {
      window.history.pushState({ ...window.history.state, askResponseContext: target }, '', window.location.href);
    }
    setContextExecutionId(execution.executionId);
    window.sessionStorage.setItem(contextPanelStorageKey(execution.sessionId, execution.property?.id), execution.executionId);
  };

  useEffect(() => {
    const restoreContextLevel = (event: PopStateEvent) => {
      const target = event.state?.askResponseContext;
      if (target?.sessionId === sessionId && target.propertyId === (selectedPropertyId ?? null)
        && executions.some((execution) => execution.executionId === target.executionId && hasResponseContext(execution))) {
        setContextExecutionId(target.executionId);
        window.sessionStorage.setItem(contextPanelStorageKey(sessionId, selectedPropertyId), target.executionId);
      } else {
        setContextExecutionId(null);
        if (sessionId) window.sessionStorage.removeItem(contextPanelStorageKey(sessionId, selectedPropertyId));
        if (new URL(window.location.href).searchParams.get('sessionId') === sessionId) {
          const trigger = contextReturnFocusRef.current;
          contextReturnFocusRef.current = null;
          window.requestAnimationFrame(() => trigger?.isConnected && trigger.focus({ preventScroll: true }));
        }
      }
    };
    window.addEventListener('popstate', restoreContextLevel);
    return () => window.removeEventListener('popstate', restoreContextLevel);
  }, [executions, selectedPropertyId, sessionId]);

  useEffect(() => { onPendingStateChange?.(hasPendingWork); }, [hasPendingWork, onPendingStateChange]);

  useEffect(() => {
    if (contextExecutionId && !contextContentAvailable) setContextExecutionId(null);
  }, [contextContentAvailable, contextExecutionId]);

  useEffect(() => {
    if (contextExecution && contextContentAvailable) contextHeadingRef.current?.focus({ preventScroll: true });
  }, [contextExecution, contextContentAvailable, wideContextPanel]);

  useEffect(() => {
    if (!sessionId || executions.length === 0 || contextExecutionId) return;
    const storedExecutionId = window.sessionStorage.getItem(contextPanelStorageKey(sessionId, selectedPropertyId));
    if (storedExecutionId && executions.some((execution) => execution.executionId === storedExecutionId && hasResponseContext(execution))) {
      setContextExecutionId(storedExecutionId);
    }
  }, [contextExecutionId, executions, selectedPropertyId, sessionId]);

  useEffect(() => {
    activeSessionRef.current = sessionId;
    if (sessionId && activeSessionPropertyRef.current === selectedPropertyId) {
      window.sessionStorage.setItem(`ctc:ask-active-session:${selectedPropertyId ?? 'general'}`, sessionId);
    }
  }, [sessionId, selectedPropertyId]);


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
  }, [initialQuestion, selectedPropertyId, sessionId]);

  useEffect(() => {
    if (loading) endRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }, [loading]);
  useEffect(() => {
    if (mode !== 'page' || historyLoading || !sessionId || executions.length === 0) return;
    const latest = executions.at(-1)!;
    const url = new URL(window.location.href);
    if (url.searchParams.get('sessionId') === sessionId && url.searchParams.get('executionId') === latest.executionId) return;
    updateAskLocation({ sessionId, propertyId: latest.property?.id ?? selectedPropertyId, executionId: latest.executionId }, 'replace');
  }, [executions, historyLoading, mode, selectedPropertyId, sessionId]);
  useEffect(() => {
    if (!justUpdatedExecutionId || loading) return;
    const timeout = window.setTimeout(() => {
      document.getElementById(`ask-execution-${justUpdatedExecutionId}`)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }, 50);
    return () => window.clearTimeout(timeout);
  }, [justUpdatedExecutionId, loading]);
  useEffect(() => { if (mode === 'panel') window.setTimeout(() => textareaRef.current?.focus(), 80); }, [mode]);

  const scopeLabel = selectedPropertyId ? 'Answers use your selected home record' : 'General home guidance';

  const ask = async (question: string, attribution?: AskPromptAttribution, promptContext?: AskCapabilityPrompt['context']) => {
    const message = question.trim();
    if (!message || !sessionId || loading) return;
    // ASK_COZY_INTERACTION_MODEL_UI_FRD FRESH-003/CTX-002: capture which
    // session this request belongs to. Switching property mid-flight resets
    // `executions` and starts a new session (the effect above), but nothing
    // previously stopped this request's response from landing afterward and
    // being appended into that new, unrelated transcript. activeSessionRef
    // already tracks "the current live session" for exactly this kind of
    // check elsewhere in this component.
    const requestedSessionId = sessionId;
    if (!promptContext && /\b(?:this|that|selected) task\b/i.test(message)) {
      const selected = executions.filter((item) => item.viewState && !executions.some((other) => other.continuesExecutionId === item.executionId))
        .map((item) => ({ item, view: readResultView(window.sessionStorage, resultViewKey(item.sessionId, item.property?.id ?? 'general', item.viewState!.resultId)) }))
        .filter(({ view }) => view.selectedTaskId);
      if (selected.length === 1) promptContext = { sourceExecutionId: selected[0].item.executionId, entityType: 'MAINTENANCE_TASK', entityId: selected[0].view.selectedTaskId! };
    }
    const source = executions.find((item) => item.executionId === promptContext?.sourceExecutionId);
    const requestKey = source ? resultRequestKey(source) : `${sessionId}:question`;
    const requestToken = requests.current.begin(requestKey);
    inFlight.current = { key: requestKey, token: requestToken, message };
    setInput('');
    window.localStorage.removeItem(draftStorageKey(selectedPropertyId, requestedSessionId));
    setError(null);
    setLoading(true);
    try {
      // Launch surface/capability describe how Ask was *opened* (e.g. from
      // the warranties page), so they only apply to the conversation's
      // first message — a later follow-up isn't an entry-point event.
      const isFirstMessage = executions.length === 0;
      const response = await api.createAskExecution({
        clientRequestId: newId(), sessionId, message, propertyId: promptContext?.propertyId ?? selectedPropertyId ?? null,
        launchContext: {
          surface: (isFirstMessage && launchSurface) || (mode === 'page' ? 'ASK_PAGE' : 'GLOBAL_LAUNCHER'),
          capabilityId: promptContext?.capabilityId ?? (isFirstMessage && launchCapabilityId ? launchCapabilityId : undefined),
          entityType: promptContext?.entityType,
          entityId: promptContext?.entityId,
          actionId: promptContext?.actionId,
          decisionThreadId: promptContext?.decisionThreadId,
          workItemId: promptContext?.workItemId,
          journeyId: promptContext?.journeyId,
          contextVersion: promptContext?.contextVersion,
          returnTo: promptContext?.returnTo ?? (safeBackTo || null),
          sourceExecutionId: promptContext?.sourceExecutionId,
          operationId: promptContext?.operationId,
          documentId: promptContext?.documentId,
          batchDecisions: promptContext?.batchDecisions,
        },
      });
      if (!response.success || !response.data) throw new Error(response.message || 'Ask could not complete that request.');
      if (activeSessionRef.current !== requestedSessionId || !requests.current.current(requestKey, requestToken) || deniedProperties.current.has(`${requestedSessionId}:${selectedPropertyId}`)) {
        // The homeowner switched property/session while this was in
        // flight -- that already reset the visible transcript and started
        // a new session. Appending this answer now would leak an old
        // property's result into the new context (FRESH-003/CTX-002).
        // Discard silently: the homeowner has already moved on, so
        // restoring the typed message or showing an error here would be
        // confusing, not helpful.
        return;
      }
      // Ask Cozy Stage 3, Phase 3 (implementation plan §19; FRD §16/§28).
      // A synchronous conversational-capture candidate arrives inline as a
      // full child execution on this same response -- spread it into the
      // flat executions array so it renders (via its own confirmation
      // field) exactly like any other execution. No new rendering code:
      // ConfirmationCard/BlockView already operate per-executionId,
      // agnostic to whether it arrived as the "main" response or here.
      setExecutions((current) => mergeResultExecutions(current, [response.data!, ...(response.data!.childExecutions ?? [])]));
      setJustUpdatedExecutionId(response.data.executionId);
      if (mode === 'page') updateAskLocation({ sessionId: requestedSessionId, propertyId: response.data.property?.id ?? selectedPropertyId, executionId: response.data.executionId }, 'replace');
      setRecentSessionsEpoch((current) => current + 1);
      if (attribution) track('ask_prompt_outcome', {
        propertyId: selectedPropertyId ?? null,
        ...attribution,
        executionId: response.data.executionId,
        operationId: response.data.operation?.id,
        status: response.data.status,
        succeeded: !response.data.status.startsWith('FAILED'),
      });
    } catch (caught) {
      if (activeSessionRef.current !== requestedSessionId || !requests.current.current(requestKey, requestToken)) return;
      setInput(message);
      window.localStorage.setItem(draftStorageKey(selectedPropertyId, requestedSessionId), message);
      if (askServiceIsPaused(caught)) {
        setServiceUnavailable(true);
        setError(null);
      } else {
        setError(caught instanceof Error ? caught.message : 'Ask is temporarily unavailable.');
      }
      if (attribution) track('ask_prompt_outcome', { propertyId: selectedPropertyId ?? null, ...attribution, status: 'REQUEST_FAILED', succeeded: false });
    } finally {
      // A request the homeowner stopped must not clear the loading state of one started after it.
      if (!stoppedRequests.current.delete(requestToken)) {
        setLoading(false);
        if (inFlight.current?.token === requestToken) inFlight.current = null;
      }
    }
  };

  // FRD v1.96: stop waiting for the answer. The request cannot be recalled once sent, so it may still complete on the
  // server (and then shows in the history); its answer is discarded here, and the question comes back into the composer.
  const stopAsking = () => {
    const pending = inFlight.current;
    if (!pending) return;
    stoppedRequests.current.add(pending.token);
    // A newer token for the same key makes this request's late answer stale, without touching other requests.
    requests.current.begin(pending.key);
    inFlight.current = null;
    setLoading(false);
    setInput(pending.message);
    if (sessionId) window.localStorage.setItem(draftStorageKey(selectedPropertyId, sessionId), pending.message);
    setError('Stopped. If the request had already reached Ask, its answer may still appear in your history.');
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };
  // FRD v1.96: bring an earlier question back into the composer to change and send again. The earlier answer stays.
  const editAndResend = (question: string) => {
    setError(null);
    setInput(question);
    if (sessionId) window.localStorage.setItem(draftStorageKey(selectedPropertyId, sessionId), question);
    window.setTimeout(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(question.length, question.length); }, 0);
  };

  const submit = (event: FormEvent) => { event.preventDefault(); void ask(input); };
  // Relying only on event.nativeEvent.isComposing is unreliable across
  // browsers (Safari in particular can report it as already false by the
  // time the confirming Enter keydown fires), so composition state is
  // also tracked explicitly via onCompositionStart/End. Without this,
  // pressing Enter to commit an IME candidate (CJK and other composed
  // input) sent the half-typed question instead of just committing it.
  const isComposingRef = useRef(false);
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !isComposingRef.current && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void ask(input);
    }
  };

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
  }, [mode, selectedPropertyId]);

  function restoreResultPosition(execution: AskExecutionResponse) {
    const article = document.getElementById(`ask-execution-${execution.executionId}`);
    if (!article) return;
    const view = readResultView(window.sessionStorage, resultViewKey(execution.sessionId, execution.property?.id ?? 'general', execution.viewState?.resultId ?? execution.executionId));
    const selected = Array.from(article.querySelectorAll<HTMLElement>('[data-ask-task-id]')).find((row) => row.dataset.askTaskId === view.selectedTaskId);
    if (selected) {
      selected.scrollIntoView({ block: 'center' });
      selected.focus({ preventScroll: true });
    } else if (view.scrollOffset !== null) {
      window.scrollBy({ top: article.getBoundingClientRect().top - view.scrollOffset });
    } else article.scrollIntoView({ block: 'start' });
  }

  // External review [P1]: previously inlined only inside refreshResult's
  // catch block, so this redaction (blanking task details/proposal/
  // consent/actions, clearing local view state, dropping pending-work
  // entries for the denied property) ran only after an explicit refresh
  // failed -- a confirmation submitted after access was revoked correctly
  // failed on the backend, but ConfirmationCard had no way to trigger the
  // same redaction, leaving its stale proposal/consent/Confirm button
  // fully rendered and usable. Extracted so any card can call it directly
  // on its own access-lost failure, not only via a refresh round trip.
  function redactAccessLostResult(execution: Pick<AskExecutionResponse, 'sessionId' | 'property' | 'executionId'>) {
    const deniedKey = `${execution.sessionId}:${execution.property?.id}`;
    deniedProperties.current.add(deniedKey);
    clearResultViews(window.sessionStorage, execution.sessionId);
    setExecutions((current) => current.map((item) => item.property?.id === execution.property?.id ? {
      ...item, question: 'Unavailable result', blocks: [], originalResponse: null, confirmation: null, clarification: null, captureRequests: [], suggestions: [], skillHandoff: null, viewState: null,
    } : item));
    setPendingWork((current) => current.filter((item) => item.execution.property?.id !== execution.property?.id));
    const issue = { accessLost: true, message: 'This result is no longer available, or your access to this home has changed.' };
    setRefreshIssues((current) => ({ ...current, ...Object.fromEntries(
      executions.filter((item) => item.property?.id === execution.property?.id).map((item) => item.executionId)
        .concat(execution.executionId).map((id) => [id, issue]),
    ) }));
  }

  async function refreshResult(execution: AskExecutionResponse) {
    const key = resultRequestKey(execution);
    const token = requests.current.begin(key);
    setRefreshRequests((current) => ({ ...current, [key]: token }));
    const deniedKey = `${execution.sessionId}:${execution.property?.id}`;
    const isCurrent = () => activeSessionRef.current === execution.sessionId && requests.current.current(key, token) && !deniedProperties.current.has(deniedKey);
    setRefreshIssues((current) => { const next = { ...current }; delete next[execution.executionId]; return next; });
    try {
      const response = await api.refreshAskExecution(execution.executionId);
      if (!isCurrent()) return;
      if (!response.success || !response.data) throw Object.assign(new Error(response.message || 'Could not refresh this result.'), { payload: response });
      setExecutions((current) => mergeResultExecutions(current, [response.data!, ...(response.data!.childExecutions ?? [])]));
    } catch (caught) {
      if (!isCurrent()) return;
      const code = askFailureCode(caught);
      const accessLost = ACCESS_LOST_CODES.includes(code ?? '');
      if (accessLost) {
        redactAccessLostResult(execution);
      } else {
        setRefreshIssues((current) => ({ ...current, [execution.executionId]: { accessLost: false, message: `Could not refresh this result. Showing the last known view. ${caught instanceof Error ? caught.message : ''}` } }));
      }
    } finally {
      setRefreshRequests((current) => {
        if (current[key] !== token) return current;
        const next = { ...current }; delete next[key]; return next;
      });
    }
  }

  const updateExecution = (updated: AskExecutionResponse) => {
    if (activeSessionRef.current !== updated.sessionId || deniedProperties.current.has(`${updated.sessionId}:${updated.property?.id}`)) return;
    setExecutions((current) => mergeResultExecutions(current, [updated, ...(updated.childExecutions ?? [])].filter((item) => !deniedProperties.current.has(`${item.sessionId}:${item.property?.id}`))));
    setJustUpdatedExecutionId(updated.executionId);
    if (!['NEEDS_ENTITY', 'NEEDS_CLARIFICATION', 'NEEDS_CONTEXT', 'NEEDS_CONFIRMATION'].includes(updated.status)) {
      setPendingWork((current) => current.filter((item) => item.execution.executionId !== updated.executionId));
    }
  };

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
  const renderComposer = (placement: 'hero' | 'footer') => (
    <form onSubmit={submit} className="mx-auto w-full max-w-3xl" aria-label="Ask Cozy question">
      {error && <div className="mb-2 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700" role="alert"><AlertTriangle className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1">{error}</span>
        {input.trim() && !loading && sessionId && <button type="button" onClick={() => void ask(input)} className="shrink-0 rounded-lg border border-red-200 bg-white px-2 py-1 font-semibold text-red-800 hover:bg-red-100">Try again</button>}</div>}
      <div className={cn('flex items-end gap-2 border border-slate-300 bg-white p-2 shadow-sm transition focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100', placement === 'hero' ? 'rounded-3xl p-3 shadow-[0_12px_40px_-20px_rgba(15,118,110,0.45)]' : 'rounded-2xl')}>
        <textarea ref={textareaRef} value={input} onChange={(event) => { setInput(event.target.value); if (sessionId) window.localStorage.setItem(draftStorageKey(selectedPropertyId, sessionId), event.target.value); }} onKeyDown={keyDown} onCompositionStart={() => { isComposingRef.current = true; }} onCompositionEnd={() => { isComposingRef.current = false; }} rows={placement === 'hero' ? 2 : 1} maxLength={4000} placeholder="Ask anything about your home…" className={cn('max-h-32 flex-1 resize-none bg-transparent px-2 text-slate-900 outline-none placeholder:text-slate-400', placement === 'hero' ? 'min-h-14 py-3 text-base' : 'min-h-10 py-2 text-sm')} />
        <VoiceInputButton large={placement === 'hero'} disabled={loading || !sessionId} getValue={() => inputRef.current}
          onChange={(value) => { setInput(value); if (sessionId) window.localStorage.setItem(draftStorageKey(selectedPropertyId, sessionId), value); }} />
        {loading && inFlight.current
          ? <button key="stop" type="button" onClick={stopAsking} aria-label="Stop" className={cn('grid shrink-0 place-items-center bg-slate-800 text-white transition hover:bg-slate-900', placement === 'hero' ? 'h-12 w-12 rounded-2xl' : 'h-10 w-10 rounded-xl')}><Square className="h-4 w-4" /></button>
          : <button key="send" type="submit" disabled={!input.trim() || loading || !sessionId} aria-label="Send question" className={cn('grid shrink-0 place-items-center rounded-2xl bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40', placement === 'hero' ? 'h-12 w-12' : 'h-10 w-10 rounded-xl')}><Send className="h-4 w-4" /></button>}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-400"><span>Enter to send · Shift+Enter for a new line</span><span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Record-based when available</span></div>
    </form>
  );

  return (
    <div data-ask-layout={mode === 'page' ? 'full-window' : 'panel'} className={cn('flex min-h-0 flex-col', mode === 'page' ? 'h-full bg-white' : 'h-full bg-slate-50')}>
      {/* Safe-area padding only changes anything on the mobile full-screen
          sheet (mode="panel" below the lg breakpoint, where this header sits
          flush against the device's actual top edge/notch); env() resolves
          to 0 on the desktop floating panel and the dashboard-embedded page
          view, so it's harmless to apply unconditionally rather than
          threading a separate "is this the mobile sheet" signal through. */}
      <header className={cn('flex items-center justify-between border-b border-slate-200 bg-white', mode === 'page' ? 'min-h-16 px-4 sm:px-6' : 'px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-5')}>
        <div className="min-w-0"><div className="flex items-center gap-3"><span className={cn('grid place-items-center bg-teal-700 text-white', mode === 'page' ? 'h-9 w-9 rounded-xl lg:hidden' : 'h-9 w-9 rounded-xl')}><Sparkles className="h-4 w-4" /></span><div>{mode === 'page' ? <h1 className="text-lg font-semibold tracking-tight text-slate-950">Ask Cozy</h1> : <h2 className="font-semibold text-slate-950">Ask Cozy</h2>}<p className="truncate text-xs text-slate-500">{scopeLabel}</p></div></div></div>
        <div className="flex items-center gap-1">
          {selectedPropertyId && <IntelligenceRefreshStatus propertyId={selectedPropertyId} />}
          {mode === 'page' && !askUnavailable && <button type="button" aria-label="Open conversation history" onClick={() => setHistoryDrawerOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 lg:hidden"><History className="h-4 w-4" /><span className="hidden sm:inline">Conversations</span></button>}
          {mode === 'page' && executions.length > 0 && !askUnavailable && <><button type="button" aria-label="New Ask Cozy session" onClick={startNewSession} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 lg:hidden"><Sparkles className="h-4 w-4" /><span className="hidden sm:inline">New conversation</span></button><button type="button" aria-label="Delete current conversation" onClick={() => setConfirmClear(true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"><Trash2 className="h-4 w-4" /><span className="hidden md:inline">Delete</span></button></>}
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
            <ConversationHistoryNav items={historySessions} pinnedItems={historyPinnedSessions} view={historyView} onViewChange={(nextView) => { setSessionActionIssue(null); setHistorySearchInput(''); setHistoryView(nextView); }} onSessionChange={changeHistorySession} onSessionDelete={deleteHistorySession} busySessionId={sessionActionId} activeSessionId={executions.length > 0 ? sessionId : ''} loading={historyRailLoading} loadingMore={historyRailLoadingMore} hasMore={historyRailHasMore} issue={historyRailIssue} openingId={openingRecentSessionId} query={historySearchInput} scope={effectiveHistoryScope} selectedHomeAvailable={Boolean(selectedPropertyId)} onQueryChange={setHistorySearchInput} onScopeChange={setHistoryScope} onOpen={(recent) => void openRecentSession(recent)} onNew={startNewSession} onLoadMore={() => void loadMoreHistory()} backHref={safeBackTo} backLabel={initialBackLabel} />
          </aside>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
      <main className={cn('min-h-0 flex-1 overflow-y-auto', mode === 'page' ? 'px-4 pb-8 pt-8 sm:px-6 lg:px-10 lg:pt-12' : 'px-4 py-5 sm:px-5')}>
        {historyLoading ? <div className="flex h-32 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading conversation</div> : askUnavailable ? (
          <section className="mx-auto mt-6 max-w-2xl rounded-3xl border border-amber-200 bg-amber-50/80 px-5 py-8 text-center sm:px-8" role="status" aria-labelledby="ask-paused-title">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-amber-700 shadow-sm"><AlertTriangle className="h-5 w-5" /></span>
            <h2 id="ask-paused-title" className="mt-4 text-xl font-semibold text-slate-950">Ask Cozy is taking a short pause</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Your home records and saved conversations are unchanged. Please try again shortly.</p>
            <button type="button" onClick={() => { setServiceUnavailable(false); setAvailabilityEpoch((current) => current + 1); }} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800">
              <RefreshCw className="h-4 w-4" />Try again
            </button>
          </section>
        ) : landingVisible ? (
          <div className="mx-auto max-w-3xl">
            <p className="mb-4 max-w-2xl text-base leading-7 text-slate-600">Understand your home, compare options, and take the right next step—with answers grounded in your home record.</p>
            {renderComposer('hero')}
            <section className="mt-7" aria-labelledby="ask-suggestions-title">
              <h2 id="ask-suggestions-title" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Popular ways to use Ask Cozy</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">{featuredPrompts.map((prompt) => <button type="button" key={prompt.id} onClick={() => runPrompt(prompt, usingFallbackPrompts ? 'FALLBACK' : prompt.source)} className="group rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"><span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-700"><CapabilityCategoryIcon categoryId={prompt.categoryId} className="h-3.5 w-3.5" />{prompt.categoryLabel}</span><span className="mt-1.5 block text-sm font-medium text-slate-700 group-hover:text-teal-900">{prompt.question}</span></button>)}</div>
              <CapabilityExplorer
                groups={concierge.view?.capabilityGroups ?? []}
                onOpen={() => track('ask_capability_explorer_opened', { propertyId: selectedPropertyId ?? null, groupCount: concierge.view?.capabilityGroups.length ?? 0, capabilityCount: concierge.view?.capabilityGroups.reduce((count, group) => count + group.capabilityIds.length, 0) ?? 0 })}
                onSelect={(prompt) => runPrompt(prompt, 'EXPLORER')}
              />
            </section>
            <div className="mt-8"><PendingWorkInbox items={visiblePendingWork} loadingId={continuingId} dismissingId={dismissingPendingId} onResume={(item) => void resumePendingWork(item)} onDismiss={(item) => void dismissPendingWork(item)} /></div>
            {pendingLoading && <p className="mt-4 text-xs text-slate-400" role="status">Checking for pending Ask requests…</p>}
            <ConciergeHome propertyId={selectedPropertyId} view={concierge.view} loading={concierge.loading} failed={concierge.failed} onAsk={(prompt, source) => runPrompt(prompt, source)} />
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-7">
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
            {loading && <div className="flex items-center gap-3 rounded-2xl border border-teal-100 bg-white p-4 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin text-teal-700" />Checking your home record…</div>}
            <div ref={endRef} />
          </div>
        )}
      </main>

      {executions.length > 0 && !askUnavailable && <footer className={cn('sticky bottom-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:p-4', mode === 'panel' && 'pb-[calc(env(safe-area-inset-bottom)+0.75rem)]')}>{renderComposer('footer')}</footer>}
        </div>
        {wideContextPanel && contextExecution && contextContentAvailable && <aside className="hidden w-80 shrink-0 border-l border-slate-200 bg-slate-50/80 p-4 xl:block" aria-label="Response context">
          <ResponseContextContent execution={contextExecution} headingRef={contextHeadingRef} onClose={closeResponseContext} renderNavigation={(navigation) => navigation ? <AskContextLink href={navigation.href} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 hover:border-teal-300 hover:bg-teal-50">{navigation.label}</AskContextLink> : null} />
        </aside>}
      </div>
    </div>
  );
}
