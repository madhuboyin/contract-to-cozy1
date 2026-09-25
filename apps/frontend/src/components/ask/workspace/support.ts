import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import type { AskCapabilityCategoryId, AskCaptureRequest, AskExecutionResponse, AskFeaturedPrompt, ConciergeHomeView } from '@/features/ask/types';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';

export const fallbackPrompts: AskFeaturedPrompt[] = [
  { id: 'maintain-due', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', question: 'What maintenance tasks are due this month?', source: 'DISCOVERY' },
  { id: 'protect-coverage', categoryId: 'PROTECT', categoryLabel: 'Protect', question: 'Which items are missing coverage?', source: 'DISCOVERY' },
  { id: 'save-opportunities', categoryId: 'SAVE', categoryLabel: 'Save', question: 'Where could I save money on this home?', source: 'DISCOVERY' },
  { id: 'decide-replace', categoryId: 'DECIDE', categoryLabel: 'Decide', question: 'Help me compare repair and replacement options for a home system or appliance.', source: 'DISCOVERY' },
];

export type AskPromptSource = 'PERSONALIZED' | 'DISCOVERY' | 'FALLBACK' | 'EXPLORER' | 'ATTENTION' | 'DECISION';

export type AskPromptAttribution = { promptId: string; categoryId: AskCapabilityCategoryId; source: AskPromptSource };

export const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Moves focus into a newly-appeared pending-action card (clarification,
// capture, confirmation, property selection) so keyboard/screen-reader
// users land on the next required action instead of having to tab-hunt for
// it after every turn. `autoFocus` is read only at mount: each of these
// cards is a distinct component instance for the pending state it renders
// (a capture card unmounts and a confirmation card mounts fresh when the
// execution advances), so "on mount" already means "just appeared" and
// deliberately does not re-fire on later prop updates to the same instance.
export function useAutoFocusFirstControl<T extends HTMLElement>(autoFocus: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!autoFocus) return;
    ref.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus({ preventScroll: true });
    // Intentionally mount-only -- see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function askSuggestionKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function updateAskLocation(input: { sessionId?: string | null; propertyId?: string | null; executionId?: string | null }, mode: 'push' | 'replace') {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const setOrDelete = (key: string, value?: string | null) => {
    const normalized = value?.trim();
    if (normalized) url.searchParams.set(key, normalized);
    else url.searchParams.delete(key);
  };
  setOrDelete('propertyId', input.propertyId);
  setOrDelete('sessionId', input.sessionId);
  setOrDelete('executionId', input.executionId);
  window.history[mode === 'push' ? 'pushState' : 'replaceState'](window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export const ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED = 'ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED';

// External review [P1]: the set of error codes that mean "access to this
// result or its home is gone," shared between refreshResult's own catch
// and any other card (ConfirmationCard, etc.) that needs to trigger the
// same access-lost redaction after a failed request of its own.
export const ACCESS_LOST_CODES = ['ASK_EXECUTION_NOT_FOUND', 'ASK_PERMISSION_REQUIRED', 'ASK_PROPERTY_NOT_FOUND', 'AUTH_REQUIRED'];

export function askFailureCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const directCode = (error as { code?: unknown }).code;
  if (typeof directCode === 'string') return directCode;
  const payload = (error as { payload?: unknown }).payload;
  if (!payload || typeof payload !== 'object') return null;
  const apiError = (payload as { error?: unknown }).error;
  if (!apiError || typeof apiError !== 'object') return null;
  const code = (apiError as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function askServiceIsPaused(error: unknown): boolean {
  return askFailureCode(error) === ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED;
}

export function draftStorageKey(propertyId: string | undefined, sessionId: string): string {
  return `ctc:ask-draft:v2:${propertyId ?? 'general'}:${sessionId}`;
}

export function captureDraftStorageKey(executionId: string, requirementId: string): string {
  return `ctc:ask-capture-draft:v1:${executionId}:${requirementId}`;
}

export function confirmationAttemptStorageKey(executionId: string, version: number): string {
  return `ctc:ask-confirmation-attempt:v1:${executionId}:${version}`;
}

export function contextPanelStorageKey(sessionId: string, propertyId?: string | null): string {
  return `ctc:ask-context-panel:v1:${sessionId}:${propertyId ?? 'general'}`;
}

export const capturePolicy = {
  REQUIRED_SAFETY: { eyebrow: 'Safety information required', note: 'This fact is required to give safe guidance. A general estimate cannot be substituted.', border: 'border-red-200 bg-red-50/80' },
  REQUIRED_APPLICABILITY: { eyebrow: 'Applicability check required', note: 'This determines whether the workflow applies to this home.', border: 'border-amber-200 bg-amber-50/80' },
  REQUIRED_CALCULATION: { eyebrow: 'Calculation input required', note: 'This value is required before Ask can calculate a personalized result.', border: 'border-indigo-200 bg-indigo-50/80' },
  ENHANCEMENT_ACCURACY: { eyebrow: 'Improve this answer', note: null, border: 'border-sky-200 bg-sky-50/80' },
  SCENARIO_INPUT: { eyebrow: 'Scenario detail', note: null, border: 'border-sky-200 bg-sky-50/80' },
  PREFERENCE_INPUT: { eyebrow: 'Your preference', note: null, border: 'border-sky-200 bg-sky-50/80' },
  WORKFLOW_INPUT: { eyebrow: 'Complete this workflow', note: null, border: 'border-sky-200 bg-sky-50/80' },
} satisfies Record<AskCaptureRequest['classification'], { eyebrow: string; note: string | null; border: string }>;

export function useConciergeHome(propertyId?: string, retryKey = 0) {
  const [view, setView] = useState<ConciergeHomeView | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failureCode, setFailureCode] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) { setView(null); setLoading(false); setFailed(false); setFailureCode(null); return; }
    const controller = new AbortController();
    setLoading(true); setFailed(false); setFailureCode(null);
    api.getConciergeHome(propertyId, { signal: controller.signal })
      .then((response) => {
        if (response.success && response.data) setView(response.data);
        else setFailed(true);
      })
      .catch((caught) => {
        if (caught?.name !== 'AbortError') {
          setFailed(true);
          setFailureCode(askFailureCode(caught));
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [propertyId, retryKey]);

  return { view, loading, failed, failureCode };
}

export function humanizeReason(reason: string): string {
  const copy: Record<string, string> = {
    URGENT_OR_OVERDUE: 'Time-sensitive or overdue',
    DEADLINE_SOONER: 'A deadline is approaching',
    SAFETY_IMPACT: 'May affect safety',
    COST_AVOIDANCE: 'May prevent a larger cost',
    HIGHER_CONFIDENCE: 'Supported by stronger home data',
    WATCH_THRESHOLD_REACHED: 'A monitored threshold was reached',
  };
  return copy[reason] ?? reason.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
}

// Puts the reader back where they were in a result after they return to it: on the selected task, else at the saved
// scroll offset, else at the top of the result.
export function restoreResultPosition(execution: AskExecutionResponse) {
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
