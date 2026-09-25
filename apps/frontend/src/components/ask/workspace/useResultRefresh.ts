import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { api } from '@/lib/api/client';
import { clearResultViews, mergeResultExecutions, resultRequestKey, type createResultRequestTracker } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPendingWorkItem } from '@/features/ask/types';
import { ACCESS_LOST_CODES, askFailureCode } from './support';

// Keeping a shown result current: refreshing it, blanking it when access to its home is lost, and merging an update
// from one of its cards. Moved out of AskWorkspace unchanged (P2, FRD v1.108). The request refs are shared with sending
// a question, so the workspace owns them and passes them in.
export function useResultRefresh({ executions, activeSessionRef, requests, deniedProperties, setExecutions, setPendingWork, setJustUpdatedExecutionId }: {
  executions: AskExecutionResponse[];
  activeSessionRef: MutableRefObject<string>;
  requests: MutableRefObject<ReturnType<typeof createResultRequestTracker>>;
  deniedProperties: MutableRefObject<Set<string>>;
  setExecutions: Dispatch<SetStateAction<AskExecutionResponse[]>>;
  setPendingWork: Dispatch<SetStateAction<AskPendingWorkItem[]>>;
  setJustUpdatedExecutionId: (value: string | null) => void;
}) {
  const [refreshIssues, setRefreshIssues] = useState<Record<string, { message: string; accessLost: boolean }>>({});
  const [refreshRequests, setRefreshRequests] = useState<Record<string, number>>({});

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

  return { refreshIssues, setRefreshIssues, refreshRequests, setRefreshRequests, redactAccessLostResult, refreshResult, updateExecution };
}
