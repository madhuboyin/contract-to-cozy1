import { useEffect, useRef, useState } from 'react';
import type { AskExecutionResponse } from '@/features/ask/types';
import { hasResponseContext } from '../EvidenceContextPanel';
import { contextPanelStorageKey, useMediaQuery } from './support';

// The response-context side panel: which result's context is open, opening and closing it (with the browser history
// entry and focus return), restoring it on back/forward and on reload, and moving focus into it. Moved out of
// AskWorkspace unchanged (P2, FRD v1.109).
export function useResponseContextPanel({ mode, sessionId, selectedPropertyId, executions }: {
  mode: 'page' | 'panel';
  sessionId: string;
  selectedPropertyId: string | undefined;
  executions: AskExecutionResponse[];
}) {
  const [contextExecutionId, setContextExecutionId] = useState<string | null>(null);
  const contextHeadingRef = useRef<HTMLHeadingElement>(null);
  const contextReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const contextPanelWideViewport = useMediaQuery('(min-width: 1280px)');
  const wideContextPanel = mode === 'page' && contextPanelWideViewport;
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

  return { contextExecutionId, contextHeadingRef, contextExecution, contextContentAvailable, wideContextPanel, closeResponseContext, openResponseContext };
}
