'use client';

import { useEffect, useRef } from 'react';
import { buildAskWorkspaceHref, type AskWorkspaceHrefInput } from '@/lib/navigation/askNavigation';

const EVENT = 'ask:ask-question';

/** Lets the shell header (search) ask the open conversation a question, as its next turn, without the page navigating anywhere. */
export function requestAskQuestion(input: AskWorkspaceHrefInput) {
  window.dispatchEvent(new CustomEvent<AskWorkspaceHrefInput>(EVENT, { detail: input }));
}

export function useAskQuestionRequests(handler: (input: AskWorkspaceHrefInput) => void) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const listen = (event: Event) => latest.current((event as CustomEvent<AskWorkspaceHrefInput>).detail);
    window.addEventListener(EVENT, listen);
    return () => window.removeEventListener(EVENT, listen);
  }, []);
}

/** The deep link for the same question, for a place that is not inside an open Ask conversation (a notification, another page). */
export const askQuestionHref = (input: AskWorkspaceHrefInput): string => buildAskWorkspaceHref(input);
