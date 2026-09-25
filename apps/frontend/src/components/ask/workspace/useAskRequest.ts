import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import { api } from '@/lib/api/client';
import { track } from '@/lib/analytics/events';
import { mergeResultExecutions, readResultView, resultRequestKey, resultViewKey, type createResultRequestTracker } from '@/features/ask/resultViewState';
import type { AskCapabilityPrompt, AskExecutionResponse } from '@/features/ask/types';
import { askServiceIsPaused, draftStorageKey, newId, updateAskLocation, type AskPromptAttribution } from './support';

// Sending a question: the request, its stale-answer guards, restoring the text on failure, stopping a request and
// bringing an earlier question back to edit. Moved out of AskWorkspace unchanged (P2, FRD v1.107). The refs are shared
// with result refresh, so the workspace owns them and passes them in.
export function useAskRequest({ sessionId, loading, executions, selectedPropertyId, mode, launchSurface, launchCapabilityId, safeBackTo, requests, inFlight, stoppedRequests, deniedProperties, activeSessionRef, textareaRef, setInput, setError, setLoading, setServiceUnavailable, setExecutions, setJustUpdatedExecutionId, setRecentSessionsEpoch }: {
  sessionId: string;
  loading: boolean;
  executions: AskExecutionResponse[];
  selectedPropertyId: string | undefined;
  mode: 'page' | 'panel';
  launchSurface: string;
  launchCapabilityId: string;
  safeBackTo: string;
  requests: MutableRefObject<ReturnType<typeof createResultRequestTracker>>;
  inFlight: MutableRefObject<{ key: string; token: number; message: string } | null>;
  stoppedRequests: MutableRefObject<Set<number>>;
  deniedProperties: MutableRefObject<Set<string>>;
  activeSessionRef: MutableRefObject<string>;
  textareaRef: RefObject<HTMLTextAreaElement>;
  setInput: (value: string) => void;
  setError: (value: string | null) => void;
  setLoading: (value: boolean) => void;
  setServiceUnavailable: (value: boolean) => void;
  setExecutions: Dispatch<SetStateAction<AskExecutionResponse[]>>;
  setJustUpdatedExecutionId: (value: string | null) => void;
  setRecentSessionsEpoch: Dispatch<SetStateAction<number>>;
}) {
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

  return { ask, stopAsking, editAndResend };
}
