'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AskExecutionResponse } from './types';
import { EMPTY_CONVERSATION_VIEW, reconcileConversationView, readConversationView, toggleId, writeConversationView, type ConversationView } from './conversationView';

// IW-PRES-021 (FRD v1.95): which results of this conversation are folded or pinned, kept for the browser session only.
export function useConversationView(sessionId: string, executions: readonly AskExecutionResponse[]) {
  const [state, setState] = useState<{ sessionId: string; view: ConversationView }>({ sessionId: '', view: EMPTY_CONVERSATION_VIEW });
  useEffect(() => {
    setState({ sessionId, view: sessionId ? readConversationView(window.sessionStorage, sessionId) : EMPTY_CONVERSATION_VIEW });
  }, [sessionId]);
  // A result that left the conversation (deleted, redacted after access was lost) cannot stay folded or pinned.
  const view = useMemo(() => (state.sessionId === sessionId ? reconcileConversationView(state.view, executions) : EMPTY_CONVERSATION_VIEW), [state, sessionId, executions]);
  const change = useCallback((update: (current: ConversationView) => ConversationView) => {
    setState((current) => {
      if (current.sessionId !== sessionId || !sessionId) return current;
      const next = update(current.view);
      writeConversationView(window.sessionStorage, sessionId, next);
      return { sessionId, view: next };
    });
  }, [sessionId]);
  return {
    view,
    toggleFold: useCallback((executionId: string) => change((current) => ({ ...current, folded: toggleId(current.folded, executionId) })), [change]),
    togglePin: useCallback((executionId: string) => change((current) => ({ ...current, pinned: toggleId(current.pinned, executionId) })), [change]),
  };
}
