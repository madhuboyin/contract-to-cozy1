'use client';

import Link from 'next/link';
import { FormEvent, KeyboardEvent, MutableRefObject, Ref, useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, BellRing, BookOpen, CheckCircle2, CircleDollarSign, ClipboardCheck, Clock3, ExternalLink, History, Loader2, Maximize2, Plus, RefreshCw, Search, Send, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp, Trash2, Wrench } from 'lucide-react';
import { api } from '@/lib/api/client';
import { askHistoryGroupLabel } from '@/features/ask/historyGrouping';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { cn } from '@/lib/utils';
import type { AskAction, AskCapabilityCategoryId, AskCapabilityGroup, AskCapabilityPrompt, AskCaptureRequest, AskClarification, AskConfirmation, AskConfirmationEditableField, AskExecutionResponse, AskFeaturedPrompt, AskItemActionInteractionType, AskPendingWorkItem, AskRecentSessionSummary, ConciergeHomeView } from '@/features/ask/types';
import { CaptureFieldControl } from '@/components/property-context/CaptureFieldControl';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { track } from '@/lib/analytics/events';
import { addAskReturnContext, buildAskWorkspaceHref } from '@/lib/navigation/askNavigation';
import { resolveDashboardBackHref } from '@/lib/navigation/backNavigation';
import { resolveConciergeLandingSpotlight, visibleConciergeFeaturedPrompts } from '@/features/ask/conciergeLandingPolicy';
import { resolveItemActionDispatch } from '@/features/ask/interactionDispatch';
import { ResultRevalidationBoundary } from './ResultRevalidationBoundary';
import { hasResponseContext, ResponseContextContent, ResponseContextSummary } from './EvidenceContextPanel';
import { AskActionReturnContext, AskBlockActionContext, AskContextLink } from './blocks/context';
import { BlockView } from './blocks/registry';
// Re-exported for existing test imports (`from '../AskWorkspace'`); the
// registry in ./blocks/registry.tsx is the actual implementation now.
export { BlockView };
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { clearResultViews, createResultRequestTracker, mergeResultExecutions, readResultView, resultRequestKey, resultViewKey } from '@/features/ask/resultViewState';
import { IntelligenceRefreshStatus } from '@/components/intelligence/IntelligenceRefreshStatus';

const fallbackPrompts: AskFeaturedPrompt[] = [
  { id: 'maintain-due', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', question: 'What maintenance tasks are due this month?', source: 'DISCOVERY' },
  { id: 'protect-coverage', categoryId: 'PROTECT', categoryLabel: 'Protect', question: 'Which items are missing coverage?', source: 'DISCOVERY' },
  { id: 'save-opportunities', categoryId: 'SAVE', categoryLabel: 'Save', question: 'Where could I save money on this home?', source: 'DISCOVERY' },
  { id: 'decide-replace', categoryId: 'DECIDE', categoryLabel: 'Decide', question: 'Help me compare repair and replacement options for a home system or appliance.', source: 'DISCOVERY' },
];

type AskPromptSource = 'PERSONALIZED' | 'DISCOVERY' | 'FALLBACK' | 'EXPLORER' | 'ATTENTION' | 'DECISION';
type AskPromptAttribution = { promptId: string; categoryId: AskCapabilityCategoryId; source: AskPromptSource };

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Moves focus into a newly-appeared pending-action card (clarification,
// capture, confirmation, property selection) so keyboard/screen-reader
// users land on the next required action instead of having to tab-hunt for
// it after every turn. `autoFocus` is read only at mount: each of these
// cards is a distinct component instance for the pending state it renders
// (a capture card unmounts and a confirmation card mounts fresh when the
// execution advances), so "on mount" already means "just appeared" and
// deliberately does not re-fire on later prop updates to the same instance.
function useAutoFocusFirstControl<T extends HTMLElement>(autoFocus: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!autoFocus) return;
    ref.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus({ preventScroll: true });
    // Intentionally mount-only -- see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

function useMediaQuery(query: string): boolean {
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

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function askSuggestionKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function updateAskLocation(input: { sessionId?: string | null; propertyId?: string | null; executionId?: string | null }, mode: 'push' | 'replace') {
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

const ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED = 'ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED';
// External review [P1]: the set of error codes that mean "access to this
// result or its home is gone," shared between refreshResult's own catch
// and any other card (ConfirmationCard, etc.) that needs to trigger the
// same access-lost redaction after a failed request of its own.
const ACCESS_LOST_CODES = ['ASK_EXECUTION_NOT_FOUND', 'ASK_PERMISSION_REQUIRED', 'ASK_PROPERTY_NOT_FOUND', 'AUTH_REQUIRED'];

function askFailureCode(error: unknown): string | null {
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

function askServiceIsPaused(error: unknown): boolean {
  return askFailureCode(error) === ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED;
}

export function draftStorageKey(propertyId: string | undefined, sessionId: string): string {
  return `ctc:ask-draft:v2:${propertyId ?? 'general'}:${sessionId}`;
}

function captureDraftStorageKey(executionId: string, requirementId: string): string {
  return `ctc:ask-capture-draft:v1:${executionId}:${requirementId}`;
}

function confirmationAttemptStorageKey(executionId: string, version: number): string {
  return `ctc:ask-confirmation-attempt:v1:${executionId}:${version}`;
}

function contextPanelStorageKey(sessionId: string, propertyId?: string | null): string {
  return `ctc:ask-context-panel:v1:${sessionId}:${propertyId ?? 'general'}`;
}

const capturePolicy = {
  REQUIRED_SAFETY: { eyebrow: 'Safety information required', note: 'This fact is required to give safe guidance. A general estimate cannot be substituted.', border: 'border-red-200 bg-red-50/80' },
  REQUIRED_APPLICABILITY: { eyebrow: 'Applicability check required', note: 'This determines whether the workflow applies to this home.', border: 'border-amber-200 bg-amber-50/80' },
  REQUIRED_CALCULATION: { eyebrow: 'Calculation input required', note: 'This value is required before Ask can calculate a personalized result.', border: 'border-indigo-200 bg-indigo-50/80' },
  ENHANCEMENT_ACCURACY: { eyebrow: 'Improve this answer', note: null, border: 'border-sky-200 bg-sky-50/80' },
  SCENARIO_INPUT: { eyebrow: 'Scenario detail', note: null, border: 'border-sky-200 bg-sky-50/80' },
  PREFERENCE_INPUT: { eyebrow: 'Your preference', note: null, border: 'border-sky-200 bg-sky-50/80' },
  WORKFLOW_INPUT: { eyebrow: 'Complete this workflow', note: null, border: 'border-sky-200 bg-sky-50/80' },
} satisfies Record<AskCaptureRequest['classification'], { eyebrow: string; note: string | null; border: string }>;

function useConciergeHome(propertyId?: string, retryKey = 0) {
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

function humanizeReason(reason: string): string {
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

function CapabilityCategoryIcon({ categoryId, className = 'h-4 w-4' }: { categoryId: AskCapabilityCategoryId; className?: string }) {
  const icons = {
    UNDERSTAND: BookOpen,
    MAINTAIN: Wrench,
    PROTECT: ShieldCheck,
    SAVE: CircleDollarSign,
    DECIDE: ClipboardCheck,
    PLAN_MONITOR: BellRing,
  };
  const Icon = icons[categoryId];
  return <Icon className={className} aria-hidden="true" />;
}

function CapabilityExplorer({ groups, onSelect, onOpen }: {
  groups: AskCapabilityGroup[];
  onSelect: (prompt: AskCapabilityPrompt) => void;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!groups.length) return null;
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (nextOpen) onOpen(); }}>
      <DialogTrigger asChild>
        <button type="button" className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 hover:text-teal-900">
          Explore everything Ask Cozy can do <ArrowRight className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[85dvh] sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-4 pr-14 sm:px-5 sm:py-4 sm:pr-16">
          <DialogTitle className="text-xl leading-7 text-slate-950">What Ask Cozy can help with</DialogTitle>
          <DialogDescription className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">Choose an example to start a conversation grounded in your selected home record.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 items-start gap-3 overflow-y-auto p-3 sm:grid-cols-2 sm:p-4">
          {groups.map((group) => (
            <section key={group.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3" aria-labelledby={`ask-capability-${group.id}`}>
              <div className="flex items-start gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-teal-700 shadow-sm"><CapabilityCategoryIcon categoryId={group.id} /></span><div><h3 id={`ask-capability-${group.id}`} className="text-sm font-semibold leading-5 text-slate-950">{group.label}</h3><p className="mt-0.5 text-xs leading-4 text-slate-600">{group.description}</p></div></div>
              <div className="mt-2 space-y-0.5">
                {group.prompts.map((prompt) => (
                  <button key={prompt.id} type="button" onClick={() => { setOpen(false); onSelect(prompt); }} className="group flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium leading-5 text-slate-700 hover:bg-white hover:text-teal-800">
                    <span>{prompt.question}</span><ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConciergeHome({ propertyId, view, loading, failed, onAsk }: {
  propertyId?: string;
  view: ConciergeHomeView | null;
  loading: boolean;
  failed: boolean;
  onAsk: (prompt: AskCapabilityPrompt, source: 'ATTENTION' | 'DECISION') => void;
}) {

  if (!propertyId) return null;

  if (loading) {
    return (
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500" role="status">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading your home overview…
      </div>
    );
  }

  if (failed || !view) {
    return (
      <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Your personalized home overview is temporarily unavailable. You can still ask any question above.
      </div>
    );
  }

  const spotlight = resolveConciergeLandingSpotlight(view);
  const attentionItem = spotlight?.kind === 'ATTENTION'
    ? view.priorityList.items.find((item) => item.homeActionId === spotlight.entityId)
    : undefined;
  const decision = spotlight?.kind === 'DECISION'
    ? view.decisions.items.find((item) => item.decisionThreadId === spotlight.entityId)
    : undefined;
  if (!attentionItem && !decision) return null;

  return (
    <div className="mt-10 text-left">
      {decision ? <section aria-labelledby="ask-decisions-title">
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Pick up a thread</p><h2 id="ask-decisions-title" className="mt-1 text-lg font-semibold text-slate-950">Continue where you left off</h2></div>
        <button type="button" onClick={() => onAsk({ id: `decision-${decision.decisionThreadId}`, categoryId: 'DECIDE', categoryLabel: 'Decide', question: `Help me continue this decision: ${decision.title}`, subject: decision.subject ?? undefined, context: { entityType: 'DECISION_THREAD', entityId: decision.decisionThreadId } }, 'DECISION')} className="group mt-3 w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-teal-300 hover:shadow-md">
          <span className="font-semibold text-slate-950 group-hover:text-teal-800">{decision.title}</span>
          <span className="mt-1 block text-sm text-slate-600">Updated {new Date(decision.updatedAt).toLocaleDateString()} · {decision.lifecycleStatus.toLowerCase().replace(/_/g, ' ')}</span>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-700">Continue with Ask Cozy <ArrowRight className="h-4 w-4" /></span>
        </button>
      </section> : attentionItem ? <section aria-labelledby="ask-attention-title">
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Based on your home record</p><h2 id="ask-attention-title" className="mt-1 text-lg font-semibold text-slate-950">For your attention</h2></div>
        <button type="button" onClick={() => onAsk({ id: `attention-${attentionItem.homeActionId}`, categoryId: attentionItem.askCategoryId, categoryLabel: attentionItem.askCategoryLabel, question: attentionItem.askQuestion, subject: attentionItem.subject ?? undefined, context: { entityType: 'HOME_ACTION', entityId: attentionItem.homeActionId, actionId: attentionItem.homeActionId, capabilityId: 'home-operations' } }, 'ATTENTION')} className="group mt-3 w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-teal-300 hover:shadow-md">
          <span className="flex flex-wrap items-start justify-between gap-2"><span><span className="block font-semibold text-slate-950 group-hover:text-teal-800">{attentionItem.title}</span><span className="mt-1 block text-sm text-slate-600">{attentionItem.comparativeReasonCodes[0] ? humanizeReason(attentionItem.comparativeReasonCodes[0]) : 'Recommended from your current home record'}{attentionItem.deadlineAt ? ` · Due ${new Date(attentionItem.deadlineAt).toLocaleDateString()}` : ''}</span></span><span className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide', attentionItem.consumerPriority === 'DO_NOW' ? 'bg-rose-100 text-rose-800' : attentionItem.consumerPriority === 'PLAN_SOON' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700')}>{attentionItem.consumerPriority.replace(/_/g, ' ')}</span></span>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-700">Ask Cozy about this <ArrowRight className="h-4 w-4" /></span>
        </button>
      </section> : null}
    </div>
  );
}

function PropertySelectionCard({ executionId, onCompleted, autoFocus = false }: { executionId: string; onCompleted: (execution: AskExecutionResponse) => void; autoFocus?: boolean }) {
  const { setSelectedPropertyId } = usePropertyContext();
  const containerRef = useRef<HTMLElement>(null);
  const [properties, setProperties] = useState<{ id: string; label: string }[] | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.getProperties()
      .then((response) => {
        if (!active) return;
        const list = response.success && response.data ? response.data.properties : [];
        setProperties(list.map((property) => ({ id: property.id, label: property.name?.trim() || `${property.address}, ${property.city}` })));
      })
      .catch(() => { if (active) setProperties([]); });
    return () => { active = false; };
  }, []);
  // Unlike the other pending-action cards, this one's real content is
  // gated behind an async fetch, so the mount-only focus hook would fire
  // before the property buttons exist. Focus once the list actually
  // renders instead.
  useEffect(() => {
    if (autoFocus && properties && properties.length > 0) {
      containerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus({ preventScroll: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties]);

  const choose = async (propertyId: string) => {
    if (selecting) return;
    setSelecting(propertyId);
    setError(null);
    try {
      const response = await api.resolveAskExecutionProperty(executionId, propertyId);
      if (!response.success || !response.data) throw new Error(response.message || 'Could not select that home.');
      onCompleted(response.data);
      setSelectedPropertyId(propertyId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not select that home.');
      setSelecting(null);
    }
  };

  if (properties === null) return <section className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4"><p className="text-sm text-slate-500">Loading your homes…</p></section>;
  if (properties.length === 0) return null;

  return (
    <section ref={containerRef} className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4" aria-busy={Boolean(selecting)}>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-800">Select a home</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {properties.map((property) => (
          <button key={property.id} type="button" disabled={Boolean(selecting)} onClick={() => void choose(property.id)} className="min-h-11 rounded-xl border border-teal-300 bg-white px-3 py-2 text-sm font-medium text-teal-900 hover:bg-teal-100 disabled:opacity-50">
            {selecting === property.id ? 'Selecting…' : property.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    </section>
  );
}

function ClarificationCard({ executionId, clarification, onCompleted, autoFocus = false }: { executionId: string; clarification: AskClarification; onCompleted: (execution: AskExecutionResponse) => void; autoFocus?: boolean }) {
  const containerRef = useAutoFocusFirstControl<HTMLElement>(autoFocus);
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(newId);
  const expired = new Date(clarification.expiresAt) <= new Date();

  const submitClarification = async (operationId?: string) => {
    if (saving || expired || (!operationId && !answer.trim())) return;
    setSaving(true); setError(null);
    try {
      const response = await api.submitAskClarification(executionId, {
        clarificationVersion: clarification.version,
        idempotencyKey,
        ...(operationId ? { operationId } : { answer: answer.trim() }),
      });
      if (!response.success || !response.data) throw new Error(response.message || 'Could not apply that clarification.');
      onCompleted(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not apply that clarification.');
    } finally { setSaving(false); }
  };

  return (
    <section ref={containerRef} className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4" aria-busy={saving}>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-indigo-800">One detail needed</p>
      <h3 className="mt-1 font-semibold text-slate-950">{clarification.question}</h3>
      <div className="mt-4 flex flex-wrap gap-2">
        {clarification.options.map((option) => <button key={option.operationId} type="button" disabled={saving || expired} onClick={() => void submitClarification(option.operationId)} className="min-h-11 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold capitalize text-slate-800 hover:border-indigo-400 disabled:opacity-50">{option.label}</button>)}
      </div>
      {clarification.allowFreeText && <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void submitClarification(); }}><input value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={500} disabled={saving || expired} placeholder="Or add a specific detail…" aria-label="Clarification detail" className="min-h-11 flex-1 rounded-xl border border-indigo-200 bg-white px-3 text-sm text-slate-900" /><button type="submit" disabled={saving || expired || !answer.trim()} className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Continuing…' : 'Continue'}</button></form>}
      {expired && <p className="mt-3 text-sm text-amber-700">This clarification expired. Ask the question again to use current records.</p>}
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    </section>
  );
}

// Renders the input for one editable confirmation field, by its declared type.
function EditableFieldInput({ field, value, onChange }: { field: AskConfirmationEditableField; value: string; onChange: (next: string) => void }) {
  const base = 'rounded-lg border border-slate-300 px-2 py-1 text-sm';
  if (field.type === 'SELECT') {
    return (
      <select aria-label={field.label} value={value} onChange={(event) => onChange(event.target.value)} className={`min-h-9 ${base}`}>
        {!(field.options ?? []).some((option) => option.value === value) && <option value="" disabled>Choose…</option>}
        {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }
  if (field.type === 'TEXTAREA') {
    return <textarea aria-label={field.label} rows={4} maxLength={2000} value={value} onChange={(event) => onChange(event.target.value)} className={`w-full ${base}`} />;
  }
  if (field.type === 'MONEY') {
    return (
      <span className="inline-flex items-center gap-1">
        <span aria-hidden="true" className="text-slate-500">$</span>
        <input type="text" inputMode="decimal" maxLength={11} aria-label={field.label} value={value} onChange={(event) => onChange(event.target.value)} className={`min-h-9 w-32 ${base}`} />
      </span>
    );
  }
  return (
    <input
      type={field.type === 'TEXT' ? 'text' : 'date'} maxLength={field.type === 'TEXT' ? 160 : undefined} aria-label={field.label}
      value={value} onChange={(event) => onChange(event.target.value)} className={`min-h-9 ${base}`}
    />
  );
}

// How an editable field's current value reads when it is not being edited.
function editableFieldDisplay(field: AskConfirmationEditableField, value: string): string {
  if (!value) return 'Not set';
  if (field.type === 'SELECT') return field.options?.find((option) => option.value === value)?.label ?? value;
  if (field.type === 'MONEY') return `$${value}`;
  return value;
}

function ConfirmationCard({ executionId, confirmation, onCompleted, autoFocus = false, onAccessLost }: { executionId: string; confirmation: AskConfirmation; onCompleted: (execution: AskExecutionResponse) => void; autoFocus?: boolean; onAccessLost: () => void }) {
  const containerRef = useAutoFocusFirstControl<HTMLElement>(autoFocus);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ASK_COZY_INTERACTION_MODEL_UI_FRD CONF-003: an edit bumps
  // confirmation.version, and this same component instance stays mounted
  // (it isn't remounted, only the confirmation prop changes) -- the
  // idempotency key must resync to the new version's own sessionStorage
  // slot, not stay pinned to whatever version the component first mounted
  // with.
  const [idempotencyKey, setIdempotencyKey] = useState('');
  useEffect(() => {
    const key = confirmationAttemptStorageKey(executionId, confirmation.version);
    const existing = window.sessionStorage.getItem(key);
    if (existing) { setIdempotencyKey(existing); return; }
    const created = newId();
    window.sessionStorage.setItem(key, created);
    setIdempotencyKey(created);
  }, [executionId, confirmation.version]);
  // Editable-field state (CONF-002/CONF-003). Keyed only off
  // confirmation.version, not the editableFields array itself (a fresh
  // array reference every render) -- resyncing on every render would wipe
  // an in-progress edit before the homeowner can save it.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  useEffect(() => {
    setEditValues(Object.fromEntries(confirmation.editableFields.map((field) => [field.key, field.value])));
    setEditingKey(null); setEditError(null);
    // External review finding (CONF-003): editing must invalidate the
    // previous confirmation's consent, not just its version/idempotency
    // key. Without this, a homeowner who had already checked the consent
    // box could edit the proposed date and immediately click Confirm
    // against the NEW proposal without ever re-affirming consent for it.
    setConsent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmation.version]);
  const saveEdit = async (key: string) => {
    setEditSaving(true); setEditError(null);
    try {
      const response = await api.editAskConfirmation(executionId, { confirmationVersion: confirmation.version, edits: { [key]: editValues[key] ?? '' } });
      if (!response.success || !response.data) throw new Error(response.message || 'Could not save this edit.');
      onCompleted(response.data);
    } catch (caught) {
      // External review [P1]: the backend correctly rejects this once
      // access is revoked, but that alone leaves the old proposal/consent/
      // controls fully rendered and usable -- redact via the same path
      // refreshResult uses, rather than just showing an error message
      // beside still-live controls.
      if (ACCESS_LOST_CODES.includes(askFailureCode(caught) ?? '')) { onAccessLost(); return; }
      // Retain the homeowner's typed value (editValues is untouched here) so
      // they don't have to re-enter it after a validation error.
      setEditError(caught instanceof Error ? caught.message : 'Could not save this edit.');
    } finally { setEditSaving(false); }
  };
  const expired = new Date(confirmation.expiresAt) <= new Date();

  const confirm = async () => {
    if (!consent || saving || expired || editingKey) return;
    setSaving(true); setError(null);
    try {
      const response = await api.confirmAskExecution(executionId, { confirmationVersion: confirmation.version, idempotencyKey, consentConfirmed: true });
      if (!response.success || !response.data) throw new Error(response.message || 'Could not complete this action.');
      window.sessionStorage.removeItem(confirmationAttemptStorageKey(executionId, confirmation.version));
      onCompleted(response.data);
    } catch (caught) {
      // External review [P1]: same redaction as saveEdit/cancel below --
      // an access-lost rejection must remove the stale proposal/consent/
      // controls, not just display an error next to them.
      if (ACCESS_LOST_CODES.includes(askFailureCode(caught) ?? '')) { onAccessLost(); return; }
      // A disconnected client cannot cancel a server-side mutation. Reconcile
      // the durable execution before inviting the homeowner to retry.
      try {
        const reconciled = await api.getAskExecution(executionId);
        if (reconciled.success && reconciled.data && reconciled.data.status !== 'NEEDS_CONFIRMATION') {
          onCompleted(reconciled.data);
          if (reconciled.data.status !== 'RUNNING') window.sessionStorage.removeItem(confirmationAttemptStorageKey(executionId, confirmation.version));
          return;
        }
      } catch (reconcileError) {
        // External review [P1] follow-up: this used to be a bare catch that
        // swallowed a reconciliation failure entirely, including access
        // having been revoked between the original confirm attempt and this
        // GET -- leaving the stale proposal/consent/controls fully rendered
        // under an unrelated error message instead of redacting them.
        if (ACCESS_LOST_CODES.includes(askFailureCode(reconcileError) ?? '')) { onAccessLost(); return; }
        /* otherwise retain the original actionable error below */
      }
      setError(caught instanceof Error ? caught.message : 'Could not complete this action.');
    }
    finally { setSaving(false); }
  };
  const cancel = async () => {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const response = await api.cancelAskExecution(executionId);
      if (!response.success || !response.data) throw new Error(response.message || 'Could not cancel this action.');
      onCompleted(response.data);
    } catch (caught) {
      if (ACCESS_LOST_CODES.includes(askFailureCode(caught) ?? '')) { onAccessLost(); return; }
      setError(caught instanceof Error ? caught.message : 'Could not cancel this action.');
    }
    finally { setSaving(false); }
  };
  return (
    <section ref={containerRef} className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-800">Confirmation required</p>
      <h3 className="mt-1 font-semibold text-slate-950">{confirmation.title}</h3><p className="mt-1 text-sm leading-5 text-slate-700">{confirmation.description}</p>
      <dl className="mt-4 divide-y divide-violet-100 rounded-xl border border-violet-100 bg-white px-3">
        {confirmation.fields.map((field) => <div key={field.label} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[9rem_1fr]"><dt className="text-slate-500">{field.label}</dt><dd className="font-medium text-slate-800">{field.value}</dd></div>)}
        {confirmation.editableFields.map((field) => (
          <div key={field.key} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[9rem_1fr]">
            <dt className="text-slate-500">{field.label}</dt>
            <dd>
              {editingKey === field.key ? (
                <div className="flex flex-wrap items-center gap-2">
                  <EditableFieldInput field={field} value={editValues[field.key] ?? field.value} onChange={(next) => setEditValues((current) => ({ ...current, [field.key]: next }))} />
                  <button type="button" disabled={editSaving} onClick={() => void saveEdit(field.key)} className="min-h-8 rounded-lg bg-teal-700 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">{editSaving ? 'Saving…' : 'Save'}</button>
                  <button type="button" disabled={editSaving} onClick={() => { setEditingKey(null); setEditValues((current) => ({ ...current, [field.key]: field.value })); setEditError(null); }} className="min-h-8 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="whitespace-pre-wrap font-medium text-slate-800">{editableFieldDisplay(field, field.value)}</span>
                  <button type="button" onClick={() => setEditingKey(field.key)} className="text-xs font-semibold text-teal-700 underline underline-offset-2">Edit</button>
                </div>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {editError && <p className="mt-2 text-sm text-red-700" role="alert">{editError}</p>}
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-violet-200 bg-white p-3 text-sm text-slate-700"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 h-4 w-4" /><span>{confirmation.consentText}</span></label>
      {expired && <p className="mt-3 text-sm text-amber-700">This review expired. Ask again to use current settings.</p>}{error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={!consent || saving || expired || Boolean(editingKey)} onClick={() => void confirm()} className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Working…' : confirmation.confirmLabel}</button><button type="button" disabled={saving} onClick={() => void cancel()} className="min-h-11 rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-white">Cancel</button></div>
    </section>
  );
}

// External review [P2]: once a confirmation is claimed, the execution
// transitions to RUNNING, but its resultJson.confirmation is left
// populated (the claim transaction only touches status/reasonCode) --
// so re-fetching the execution while a lease is stuck (a crashed request,
// a slow domain write) still returned a confirmation object, and
// ConfirmationCard doesn't check status before rendering "Confirmation
// required" over it, inviting a resubmit of something that may already
// be running or done. Rendered instead of ConfirmationCard whenever
// status is RUNNING with a confirmation still present.
//
// "Check status" resubmits confirmAskExecution with the SAME
// confirmationVersion (a fresh idempotencyKey is fine -- confirmAskExecution's
// receipt-recovery match is keyed on inputHash, which is derived from
// confirmationVersion/consent/binding/params, not the idempotencyKey), which
// is the actual recovery path this execution already supports
// (confirmAskExecution's recoveringClaim branch): if the original attempt's
// lease already expired, this re-claims it and safely replays the confirm
// through the domain command's own idempotency guard (e.g.
// confirmMaintenanceTaskComplete's completedByThisExecution check) rather
// than silently double-applying it; if the lease has not expired yet, the
// backend returns an explicit "already being completed" message instead
// of a duplicate action. Passively reading the execution instead (via
// getAskExecution) cannot make progress here at all -- the previously
// reported gap this review specifically named ("'Check action status' can
// simply return the same RUNNING state").
function PendingOutcomeCard({ executionId, confirmationVersion, onCompleted, onAccessLost }: { executionId: string; confirmationVersion: number; onCompleted: (execution: AskExecutionResponse) => void; onAccessLost: () => void }) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = async () => {
    if (checking) return;
    setChecking(true); setError(null);
    try {
      const response = await api.confirmAskExecution(executionId, { confirmationVersion, idempotencyKey: newId(), consentConfirmed: true });
      if (!response.success || !response.data) throw new Error(response.message || "Could not check this action's status.");
      onCompleted(response.data);
    } catch (caught) {
      // External review [P1] follow-up: this card had no access-loss
      // handling at all, unlike ConfirmationCard's confirm/cancel/saveEdit --
      // an access-revoked "Check status" click just showed a generic error
      // beside the still-live, now-stale card instead of redacting it.
      if (ACCESS_LOST_CODES.includes(askFailureCode(caught) ?? '')) { onAccessLost(); return; }
      setError(caught instanceof Error ? caught.message : "Could not check this action's status.");
    } finally { setChecking(false); }
  };
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">Outcome not yet known</p>
      <p className="mt-1 text-sm leading-5 text-slate-700">This action is still being processed. Checking will safely pick up its result if it already finished, or resume it if the previous attempt was interrupted -- it will not apply the action twice.</p>
      <button type="button" disabled={checking} onClick={() => void check()} className="mt-3 min-h-10 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{checking ? 'Checking…' : 'Check status'}</button>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    </section>
  );
}

function InlineCaptureCard({
  executionId,
  request,
  onCompleted,
  autoFocus = false,
}: {
  executionId: string;
  request: AskCaptureRequest;
  onCompleted: (execution: AskExecutionResponse) => void;
  autoFocus?: boolean;
}) {
  const containerRef = useAutoFocusFirstControl<HTMLElement>(autoFocus);
  const schema = request.inputSchema;
  const policy = capturePolicy[request.classification];
  const scalarCapture = schema.type !== 'RELATIONAL_UPDATE' && schema.type !== 'RELATIONAL_SELECT_CREATE' && schema.type !== 'GROUP';
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const canonical = schema.type === 'RELATIONAL_UPDATE'
      ? schema.currentValues
      : request.currentAnswer && typeof request.currentAnswer === 'object' && !Array.isArray(request.currentAnswer)
        ? scalarCapture && (request.currentAnswer as Record<string, unknown>).value === null
          ? {}
          : request.currentAnswer as Record<string, unknown>
        : {};
    try {
      const stored = window.localStorage.getItem(captureDraftStorageKey(executionId, request.requirementId));
      return stored ? { ...canonical, ...JSON.parse(stored) as Record<string, unknown> } : canonical;
    } catch { return canonical; }
  });
  const [saving, setSaving] = useState(false);
  const [idempotencyKey] = useState(newId);
  const [dismissed, setDismissed] = useState(false);
  const [sensitiveDataConfirmed, setSensitiveDataConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    window.localStorage.setItem(captureDraftStorageKey(executionId, request.requirementId), JSON.stringify(values));
  }, [executionId, request.requirementId, values]);
  if (dismissed) return null;
  if (schema.type === 'RELATIONAL_SELECT_CREATE') {
    const activeCreateFields = schema.createFields.filter((field) => {
      if (!field.when) return true;
      const actual = values[field.when.fieldKey];
      return field.when.operator === 'EQUALS' ? actual === field.when.value : actual !== field.when.value;
    });
    const missingCreateRequired = activeCreateFields.some((field) => {
      if (!field.required) return false;
      const value = values[field.key];
      if (value === undefined || value === '' || (value === null && !request.allowNotSure)) return true;
      if (field.inputSchema.type !== 'APPROXIMATE_DATE' || value === null) return false;
      if (typeof value !== 'object' || Array.isArray(value)) return true;
      const date = value as { precision?: string; value?: string; rangeEnd?: string };
      if (date.precision === 'UNKNOWN') return !request.allowNotSure;
      return !date.value || (date.precision === 'RANGE' && !date.rangeEnd);
    });

    const submitRelational = async (answer: Record<string, unknown>) => {
      if (saving) return;
      setSaving(true);
      setError(null);
      try {
        const response = await api.submitAskCapture(executionId, {
          requirementId: request.requirementId,
          captureKey: request.captureKey,
          expectedContextVersion: request.expectedContextVersion,
          idempotencyKey,
          answer,
          sensitiveDataConfirmed: request.sensitivity === 'FINANCIAL' || request.sensitivity === 'SECURITY' ? sensitiveDataConfirmed : undefined,
        });
        if (!response.success || !response.data) throw new Error(response.message || 'Could not save this home detail.');
        window.localStorage.removeItem(captureDraftStorageKey(executionId, request.requirementId));
        onCompleted(response.data);
        if (!['WORKFLOW_INPUT', 'SCENARIO_INPUT', 'PREFERENCE_INPUT'].includes(request.classification)) {
          window.dispatchEvent(new CustomEvent('property-context:updated', { detail: { contextVersion: response.data.contextVersion } }));
        }
      } catch (caught) {
        const refreshed = caught && typeof caught === 'object' && 'payload' in caught
          ? (caught as { payload?: { data?: AskExecutionResponse } }).payload?.data
          : undefined;
        if (refreshed?.executionId === executionId) {
          onCompleted(refreshed);
          setError('The home record changed while this form was open. Review the refreshed values and continue.');
        } else {
          setError(caught instanceof Error ? caught.message : 'Could not save this home detail.');
        }
      } finally {
        setSaving(false);
      }
    };

    return (
      <section ref={containerRef} className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4" aria-busy={saving}>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-800">More information needed</p>
        <h3 className="mt-1 font-semibold text-slate-950">{request.title}</h3>
        <p className="mt-1 text-sm leading-5 text-slate-700">{request.question}</p>
        {schema.options.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-600">{schema.selectLabel}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {schema.options.map((option) => (
                <button key={option.id} type="button" disabled={saving} onClick={() => void submitRelational({ mode: 'SELECT', entityId: option.id })} className="min-h-11 rounded-xl border border-sky-300 bg-white px-3 py-2 text-left text-sm font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-50">
                  {option.label}
                  {option.description && <span className="block text-xs font-normal text-slate-500">{option.description}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-5 border-t border-sky-100 pt-4">
          <p className="text-xs font-semibold text-slate-600">{schema.createLabel}</p>
          <div className="mt-3 space-y-4">
            {activeCreateFields.map((field) => <CaptureFieldControl key={field.key} field={field} value={values[field.key]} disabled={saving} allowNotSure={request.allowNotSure} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />)}
          </div>
          <button type="button" disabled={saving || missingCreateRequired} onClick={() => void submitRelational({ mode: 'CREATE', values })} className="mt-4 min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : schema.createLabel}</button>
        </div>
        {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
        {request.fallbackHref && <AskContextLink href={request.fallbackHref} onClick={() => void api.recordAskCaptureEvent(executionId, { requirementId: request.requirementId, captureKey: request.captureKey, event: 'FULL_FORM_OPENED' }).catch(() => undefined)} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-800 hover:underline">Open full form instead <ExternalLink className="h-4 w-4" /></AskContextLink>}
      </section>
    );
  }

  const fields = schema.type === 'RELATIONAL_UPDATE' || schema.type === 'GROUP'
    ? schema.fields
    : [{ key: 'value', label: 'Answer', required: true, inputSchema: schema, helpText: undefined, when: undefined }];

  const activeFields = fields.filter((field) => {
    if (!field.when) return true;
    const actual = values[field.when.fieldKey];
    return field.when.operator === 'EQUALS' ? actual === field.when.value : actual !== field.when.value;
  });
  const missingRequired = activeFields.some((field) => {
    if (!field.required) return false;
    const value = values[field.key];
    if (value === undefined || value === '' || (value === null && !request.allowNotSure)) return true;
    if (field.inputSchema.type !== 'APPROXIMATE_DATE' || value === null) return false;
    if (typeof value !== 'object' || Array.isArray(value)) return true;
    const date = value as { precision?: string; value?: string; rangeEnd?: string };
    if (date.precision === 'UNKNOWN') return !request.allowNotSure;
    return !date.value || (date.precision === 'RANGE' && !date.rangeEnd);
  });

  // `skipping` answers the question with the reserved skip marker: the server saves nothing and moves to the next question.
  const save = async (event: FormEvent, skipping = false) => {
    event.preventDefault();
    if (saving || (missingRequired && !skipping)) return;
    setSaving(true);
    setError(null);
    try {
      const response = await api.submitAskCapture(executionId, {
        requirementId: request.requirementId,
        captureKey: request.captureKey,
        expectedContextVersion: request.expectedContextVersion,
        idempotencyKey,
        answer: skipping ? { $skip: true } : schema.type === 'RELATIONAL_UPDATE' ? { mode: 'UPDATE', entityId: schema.entityId, values } : values,
        sensitiveDataConfirmed: !skipping && (request.sensitivity === 'FINANCIAL' || request.sensitivity === 'SECURITY') ? sensitiveDataConfirmed : undefined,
      });
      if (!response.success || !response.data) throw new Error(response.message || 'Could not save this home detail.');
      window.localStorage.removeItem(captureDraftStorageKey(executionId, request.requirementId));
      onCompleted(response.data);
      if (!['WORKFLOW_INPUT', 'SCENARIO_INPUT', 'PREFERENCE_INPUT'].includes(request.classification)) {
        window.dispatchEvent(new CustomEvent('property-context:updated', {
          detail: { contextVersion: response.data.contextVersion },
        }));
      }
    } catch (caught) {
      const refreshed = caught && typeof caught === 'object' && 'payload' in caught
        ? (caught as { payload?: { data?: AskExecutionResponse } }).payload?.data
        : undefined;
      if (refreshed?.executionId === executionId) {
        onCompleted(refreshed);
        setError('The home record changed while this form was open. Review the refreshed values and continue.');
      } else {
        setError(caught instanceof Error ? caught.message : 'Could not save this home detail.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form ref={containerRef as unknown as Ref<HTMLFormElement>} onSubmit={save} className={cn('rounded-2xl border p-4', policy.border)} aria-busy={saving}>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-800">{policy.eyebrow}</p>
      <h3 className="mt-1 font-semibold text-slate-950">{request.title}</h3>
      <p className="mt-1 text-sm leading-5 text-slate-700">{request.question}</p>
      {request.helpText && <p className="mt-1 text-xs leading-5 text-slate-500">{request.helpText}</p>}
      {policy.note && <p className="mt-2 text-xs font-semibold leading-5 text-slate-700">{policy.note}</p>}
      {request.destinationLabel && <p className="mt-2 text-xs font-medium text-sky-900">{request.destinationLabel} after you continue.</p>}
      <div className="mt-4 space-y-4">
        {activeFields.map((field) => <CaptureFieldControl key={field.key} field={field} value={values[field.key]} disabled={saving} allowNotSure={request.allowNotSure} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />)}
      </div>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      {(request.sensitivity === 'FINANCIAL' || request.sensitivity === 'SECURITY') && (
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-sky-200 bg-white p-3 text-sm text-slate-700">
          <input type="checkbox" checked={sensitiveDataConfirmed} onChange={(event) => setSensitiveDataConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700" />
          <span>{request.confirmationText ?? 'I confirm this information can be saved to the home record.'}</span>
        </label>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={saving || missingRequired || ((request.sensitivity === 'FINANCIAL' || request.sensitivity === 'SECURITY') && !sensitiveDataConfirmed)} className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{saving ? 'Saving…' : request.classification === 'WORKFLOW_INPUT' ? 'Continue to review' : 'Save and update answer'}</button>
        {request.skippable && <button type="button" disabled={saving} onClick={(event) => void save(event as unknown as FormEvent, true)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Skip for now</button>}
        {request.classification === 'ENHANCEMENT_ACCURACY' && <button type="button" disabled={saving} onClick={() => { window.localStorage.removeItem(captureDraftStorageKey(executionId, request.requirementId)); setDismissed(true); void api.recordAskCaptureEvent(executionId, { requirementId: request.requirementId, captureKey: request.captureKey, event: 'DISMISSED' }).catch(() => undefined); }} className="min-h-11 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white">Use general estimate</button>}
        {request.fallbackHref && <AskContextLink href={request.fallbackHref} onClick={() => void api.recordAskCaptureEvent(executionId, { requirementId: request.requirementId, captureKey: request.captureKey, event: 'FULL_FORM_OPENED' }).catch(() => undefined)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Open full form <ExternalLink className="h-4 w-4" /></AskContextLink>}
      </div>
    </form>
  );
}

function ExecutionFeedback({ executionId, propertyId, capabilities }: {
  executionId: string;
  propertyId?: string;
  capabilities: AskExecutionResponse['correctionCapabilities'];
}) {
  const [rating, setRating] = useState<'UP' | 'DOWN' | null>(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);

  const submit = async (nextRating: 'UP' | 'DOWN', nextComment?: string) => {
    setSaving(true); setError(null);
    try {
      const response = await api.submitAskFeedback(executionId, { rating: nextRating, comment: nextComment?.trim() || undefined });
      if (!response.success) throw new Error(response.message || 'Could not save feedback.');
      setRating(nextRating); setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save feedback.');
    } finally { setSaving(false); }
  };
  const requestCorrection = async (kind: 'HOME_RECORD' | 'INTENT' | 'ENTITY') => {
    setCorrecting(true); setError(null);
    try {
      const response = await api.requestAskCorrection(executionId, kind);
      if (!response.success || !response.data) throw new Error(response.message || 'Could not open the correction workflow.');
      window.location.assign(response.data.href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open the correction workflow.');
      setCorrecting(false);
    }
  };

  return (
    <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">
      <div className="flex flex-wrap items-center gap-2">
        <span>{saved ? 'Thanks—your feedback was saved.' : 'Was this helpful?'}</span>
        <button type="button" disabled={saving} aria-label="Helpful response" aria-pressed={rating === 'UP'} onClick={() => void submit('UP')} className={cn('rounded-lg p-2 hover:bg-slate-100', rating === 'UP' && 'bg-teal-50 text-teal-700')}><ThumbsUp className="h-4 w-4" /></button>
        {/* Persists a bare "not helpful" vote immediately, the same as the
            thumbs-up button, instead of only marking the button visually
            pressed and waiting for a separate "Send feedback" click on the
            comment box below -- previously the vote looked saved (aria-
            pressed, highlighted) but was silently lost if the user
            navigated away before sending a comment. */}
        <button type="button" disabled={saving} aria-label="Not helpful response" aria-pressed={rating === 'DOWN'} onClick={() => void submit('DOWN')} className={cn('rounded-lg p-2 hover:bg-slate-100', rating === 'DOWN' && 'bg-amber-50 text-amber-700')}><ThumbsDown className="h-4 w-4" /></button>
        {capabilities.intent && <button type="button" disabled={correcting} onClick={() => void requestCorrection('INTENT')} className="font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-50">{correcting ? 'Opening…' : 'That’s not what I meant'}</button>}
        {capabilities.entity && <button type="button" disabled={correcting} onClick={() => void requestCorrection('ENTITY')} className="font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-50">Wrong item</button>}
        {capabilities.homeRecord && propertyId && <button type="button" disabled={correcting} onClick={() => void requestCorrection('HOME_RECORD')} className="ml-auto font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-50">{correcting ? 'Opening…' : 'Correct home information'}</button>}
      </div>
      {rating === 'DOWN' && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} placeholder="What should be improved? (optional)" aria-label="Ask feedback details" className="min-h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800" />
          <button type="button" disabled={saving || !comment.trim()} onClick={() => void submit('DOWN', comment)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 font-semibold text-slate-700 disabled:opacity-50">Add detail</button>
        </div>
      )}
      {error && <p className="mt-2 text-red-700" role="alert">{error}</p>}
    </div>
  );
}

function PendingWorkInbox({ items, loadingId, dismissingId, onResume, onDismiss }: {
  items: AskPendingWorkItem[];
  loadingId: string | null;
  dismissingId: string | null;
  onResume: (item: AskPendingWorkItem) => void;
  onDismiss: (item: AskPendingWorkItem) => void;
}) {
  if (!items.length) return null;
  return (
    <section className="mx-auto mb-5 max-w-3xl rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3" aria-labelledby="ask-pending-title">
      <div className="flex items-center gap-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-indigo-700 text-white"><Clock3 className="h-3.5 w-3.5" /></span><div><h2 id="ask-pending-title" className="text-sm font-semibold text-slate-950">Pending Ask actions</h2><p className="text-xs text-slate-600">Unfinished actions that still need your input.</p></div></div>
      <ul className="mt-3 divide-y divide-indigo-100 overflow-hidden rounded-xl border border-indigo-100 bg-white">{items.slice(0, 3).map((item) => {
        const actionBusy = loadingId === item.execution.executionId || dismissingId === item.execution.executionId;
        const canDismiss = item.pendingKind !== 'COMMAND_RECOVERY';
        return <li key={item.execution.executionId} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{item.execution.question}</p><p className="mt-0.5 text-[11px] text-slate-500">{item.pendingKind.toLowerCase().replace(/_/g, ' ')} · {new Date(item.execution.updatedAt).toLocaleString()}</p></div><div className="flex shrink-0 items-center gap-1.5">{canDismiss && <button type="button" disabled={Boolean(loadingId || dismissingId)} onClick={() => onDismiss(item)} className="min-h-9 rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">{dismissingId === item.execution.executionId ? 'Dismissing…' : item.pendingKind === 'CONFIRMATION' ? 'Cancel' : 'Dismiss'}</button>}<button type="button" disabled={Boolean(loadingId || dismissingId)} onClick={() => onResume(item)} className="min-h-9 rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{loadingId === item.execution.executionId ? 'Opening…' : actionBusy ? 'Please wait…' : item.actionLabel}</button></div></li>;
      })}</ul>
    </section>
  );
}

function recentSessionStatus(status: AskRecentSessionSummary['latestStatus']): string {
  if (['NEEDS_PROPERTY', 'NEEDS_ENTITY', 'NEEDS_CLARIFICATION', 'NEEDS_CONTEXT'].includes(status)) return 'Needs input';
  if (status === 'NEEDS_CONFIRMATION') return 'Awaiting confirmation';
  if (status === 'RUNNING') return 'In progress';
  if (['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS'].includes(status)) return 'Completed';
  return status.toLowerCase().replace(/_/g, ' ');
}

export function ConversationHistoryNav({ items, activeSessionId, loading, loadingMore, hasMore, issue, openingId, query, scope, selectedHomeAvailable, onQueryChange, onScopeChange, onOpen, onNew, onLoadMore, backHref, backLabel }: {
  items: AskRecentSessionSummary[];
  activeSessionId: string;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  issue: string | null;
  openingId: string | null;
  query: string;
  scope: 'THIS_HOME' | 'ALL_HOMES';
  selectedHomeAvailable: boolean;
  onQueryChange: (query: string) => void;
  onScopeChange: (scope: 'THIS_HOME' | 'ALL_HOMES') => void;
  onOpen: (session: AskRecentSessionSummary) => void;
  onNew: () => void;
  onLoadMore: () => void;
  backHref?: string;
  backLabel?: string;
}) {
  const [calendar, setCalendar] = useState({ now: new Date(), locale: 'en-US', timeZone: 'UTC' });
  useEffect(() => {
    const refresh = () => setCalendar({
      now: new Date(),
      locale: navigator.language || 'en-US',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    });
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const grouped = items.reduce<Array<{ label: string; items: AskRecentSessionSummary[] }>>((groups, session) => {
    const label = askHistoryGroupLabel(session.lastActiveAt, calendar);
    const group = groups.find((candidate) => candidate.label === label);
    if (group) group.items.push(session);
    else groups.push({ label, items: [session] });
    return groups;
  }, []);
  return (
    <nav className="flex min-h-0 flex-1 flex-col" aria-label="Ask Cozy conversations">
      <div className="mb-4 flex items-center gap-2 px-1">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-teal-700 text-white"><Sparkles className="h-4 w-4" aria-hidden="true" /></span>
        <div><p className="text-sm font-semibold text-slate-950">Ask Cozy</p><p className="text-[11px] text-slate-500">Your home assistant</p></div>
      </div>
      <button type="button" aria-label="New Ask Cozy session" onClick={onNew} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-white hover:shadow-sm">
        <Plus className="h-4 w-4" aria-hidden="true" />New conversation
      </button>
      <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Conversation home scope">
        <button type="button" aria-pressed={scope === 'THIS_HOME'} disabled={!selectedHomeAvailable} onClick={() => onScopeChange('THIS_HOME')} className={cn('min-h-9 rounded-lg px-2 text-xs font-semibold disabled:opacity-50', scope === 'THIS_HOME' ? 'bg-white text-teal-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>This home</button>
        <button type="button" aria-pressed={scope === 'ALL_HOMES'} onClick={() => onScopeChange('ALL_HOMES')} className={cn('min-h-9 rounded-lg px-2 text-xs font-semibold', scope === 'ALL_HOMES' ? 'bg-white text-teal-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>All homes</button>
      </div>
      <label className="relative mt-4 block">
        <span className="sr-only">Search conversation titles and questions for {scope === 'ALL_HOMES' ? 'all homes' : 'this home'}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} maxLength={120} placeholder="Search conversations" className="min-h-10 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
      </label>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        {issue && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">{issue}</p>}
        {loading && <p className="px-2 py-3 text-xs text-slate-400" role="status">{query.trim() ? 'Searching conversations…' : 'Loading recent conversations…'}</p>}
        {grouped.length === 0 && !loading ? (
          <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">{query.trim() ? issue ? 'Search results are unavailable right now.' : 'No conversations match this search.' : issue ? 'No conversations are available to show right now.' : 'Your recent conversations will appear here.'}</p>
        ) : grouped.map((group) => (
          <section key={group.label} className="mb-5" aria-labelledby={`ask-history-${group.label.replace(/\s+/g, '-').toLowerCase()}`}>
            <h3 id={`ask-history-${group.label.replace(/\s+/g, '-').toLowerCase()}`} className="px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{group.label}</h3>
            <ul className="mt-1 space-y-1">
              {group.items.map((session) => {
                const active = session.sessionId === activeSessionId;
                return <li key={session.sessionId}>
                  <button
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    disabled={Boolean(openingId)}
                    onClick={() => onOpen(session)}
                    className={cn('w-full rounded-xl px-3 py-2.5 text-left transition disabled:opacity-60', active ? 'bg-teal-50 text-teal-950 ring-1 ring-inset ring-teal-200' : 'text-slate-700 hover:bg-white hover:text-slate-950')}
                  >
                    <span className="block truncate text-sm font-semibold">{session.title}</span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="truncate">{session.property.label}</span>
                      <span className="shrink-0">{openingId === session.sessionId ? 'Opening…' : recentSessionStatus(session.latestStatus)}</span>
                    </span>
                  </button>
                </li>;
              })}
            </ul>
          </section>
        ))}
        {hasMore && <button type="button" onClick={onLoadMore} disabled={loading || loadingMore} className="mt-3 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 hover:border-teal-300 disabled:opacity-60">{loadingMore ? 'Loading older conversations…' : 'Load older conversations'}</button>}
      </div>
      <div className="border-t border-slate-200 pt-3">
        {backHref && <Link href={backHref} className="flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950"><ArrowLeft className="h-4 w-4" />{backLabel || 'Back to Home'}</Link>}
        <p className="mt-2 px-3 text-[11px] leading-4 text-slate-400">{scope === 'ALL_HOMES' ? 'Conversations across homes you can access.' : 'Recent conversations for the selected home.'} ContractToCozy navigation remains available above.</p>
      </div>
    </nav>
  );
}

function ExecutionCard({
  execution, isSuperseded, justUpdatedExecutionId, updateExecution, loading, ask, selectedPropertyId, setInput, visibleSuggestions, activeSessionRef, refreshIssue, refreshResult, refreshPending, onAccessLost, contextOpen, onOpenContext,
}: {
  execution: AskExecutionResponse;
  isSuperseded: boolean;
  justUpdatedExecutionId: string | null;
  updateExecution: (updated: AskExecutionResponse) => void;
  loading: boolean;
  ask: (question: string, attribution?: AskPromptAttribution, promptContext?: AskCapabilityPrompt['context']) => Promise<void>;
  selectedPropertyId: string;
  setInput: (value: string) => void;
  visibleSuggestions: string[];
  // ASK_COZY_INTERACTION_MODEL_UI_FRD FRESH-003/CTX-002: the same ref ask()
  // already compares against to discard a response that outlived a
  // property/session switch. The explicit Refresh button needs the
  // identical guard -- it was calling updateExecution unconditionally.
  activeSessionRef: MutableRefObject<string>;
  // ASK_COZY_INTERACTION_MODEL_UI_FRD FRESH-001/HAND-003: seeds this card's
  // refresh-error state when the parent's own return-trip revalidation
  // (on landing back from Maintenance) already failed before this card
  // ever mounted, so that failure isn't silently invisible.
  refreshIssue?: { message: string; accessLost: boolean } | null;
  refreshResult: (execution: AskExecutionResponse) => Promise<void>;
  refreshPending: boolean;
  // External review [P1]: lets a child card (ConfirmationCard) trigger the
  // same access-lost redaction refreshResult's own catch already performs,
  // for its OWN failed request -- not only a refresh round trip.
  onAccessLost: (execution: Pick<AskExecutionResponse, 'sessionId' | 'property' | 'executionId'>) => void;
  contextOpen: boolean;
  onOpenContext: (trigger: HTMLButtonElement) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const isJustUpdated = execution.executionId === justUpdatedExecutionId;
  // ASK_COZY_INTERACTION_MODEL_UI_FRD FRESH-001/RES-004 (ACT-001 REFRESH):
  // an explicit, homeowner-initiated revalidation, distinct from the
  // implicit refresh MAINT-005 triggers automatically after a mutation.
  const [refreshing, setRefreshing] = useState(false);
  // Controlled error state: return revalidation normally finishes AFTER this card mounts.
  const refreshError = refreshIssue?.message ?? null;
  const refreshAccessLost = Boolean(refreshIssue?.accessLost);
  const controls = useResultView(execution, !isSuperseded && !refreshAccessLost);
  const refresh = async () => {
    if (refreshing || refreshAccessLost) return;
    setRefreshing(true);
    try { await refreshResult(execution); } finally { setRefreshing(false); }
  };
  // ACT-003: "Unsupported actions fail visibly and safely." No item action
  // declares an UNSUPPORTED interactionType today (see
  // interactionDispatch.ts) -- this exists so the day one does (DISMISS/
  // REMIND_LATER once their domain policy lands; NAVIGATE once item
  // actions carry an href), it surfaces here instead of silently no-oping.
  const [itemActionIssue, setItemActionIssue] = useState<string | null>(null);
  const dispatchItemAction = (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType, documentId?: string) => {
    setItemActionIssue(null);
    const dispatch = resolveItemActionDispatch(interactionType);
    if (dispatch.kind === 'ASK_WITH_ENTITY_CONTEXT') {
      void ask(message, undefined, {
        entityType: entityType ?? undefined, entityId, sourceExecutionId: execution.executionId,
        // ACT-001/ACT-003: every declared item action forces its own
        // operationId, regardless of interactionType. The declaring
        // server code already knows exactly which operation applies --
        // forcing it doesn't skip reasoning for a CONVERSATION_CONTINUE
        // explanation (GROUNDED_GUIDANCE still generates a real answer),
        // it only skips the operation-*selection* step, which free-text
        // pattern matching could otherwise get wrong (e.g. a task titled
        // "Annual maintenance inspection" would make "Why is ... this
        // important?" accidentally match the generic maintenance
        // pattern and misroute away from grounded guidance).
        operationId,
        // Evidence upload design (approved 2026-09-22): undefined for every action except HomeEventResultList's
        // "Attach evidence" control, which already uploaded the file and resolved this id before calling here.
        documentId,
      });
    } else if (dispatch.kind === 'ASK_FILTER_ONLY') {
      void ask(message, undefined, { sourceExecutionId: execution.executionId });
    } else if (dispatch.kind === 'REFRESH') {
      void refresh();
    } else {
      setItemActionIssue(dispatch.reason);
    }
  };
  const dispatchBlockAction = (action: AskAction) => {
    setItemActionIssue(null);
    if (action.interactionType !== 'START_WORKFLOW' || !action.message || !action.operationId) {
      setItemActionIssue('This action is not available inline yet. Use the traditional navigation option instead.');
      return;
    }
    void ask(action.message, undefined, {
      sourceExecutionId: execution.executionId,
      operationId: action.operationId,
      capabilityId: action.capabilityId,
    });
  };
  // ASK_COZY_INTERACTION_MODEL_UI_FRD ACCESS-003: once nothing else is
  // claiming focus for this turn (no pending property selection, capture,
  // clarification or confirmation), the result just settled. Without this,
  // a completed ConfirmationCard unmounts (its Confirm button removed from
  // the DOM) and focus silently reverts to <body> -- a keyboard/screen-
  // reader user loses their place entirely after completing a row action.
  const resultSettled = execution.status !== 'NEEDS_PROPERTY'
    && !execution.confirmation && !execution.clarification && execution.captureRequests.length === 0;
  useEffect(() => {
    if (!isJustUpdated || !resultSettled) return;
    const target = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? headingRef.current;
    target?.focus({ preventScroll: true });
    // Re-runs only when this execution's own settled content actually
    // changes (a real status/result transition), not on every unrelated
    // re-render -- isJustUpdated/resultSettled are read fresh from the
    // enclosing closure each time this fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execution.status, execution.updatedAt]);

  // ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001/RES-003/RES-004: a superseded
  // filter-refinement result must not disappear (RES-001: "refresh must not
  // silently overwrite its meaning") but must not duplicate a full list
  // either (MAINT-003). The question stays visible as ordinary conversation
  // history; the response collapses behind a disclosure instead of
  // rendering live, actionable content for data that is no longer current.
  if (refreshAccessLost) return <ResultRevalidationBoundary executionId={execution.executionId} issue={refreshIssue}>{null}</ResultRevalidationBoundary>;

  if (isSuperseded) {
    return (
      <article id={`ask-execution-${execution.executionId}`} className="scroll-mt-28 space-y-3 lg:scroll-mt-32">
        <div className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-3 text-sm leading-6 text-white">{execution.question}</div>
        <details className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-500">Superseded by a refinement below · view original response</summary>
          <div className="mt-3 space-y-3 opacity-75">
            {execution.blocks.map((block) => <BlockView key={block.id} block={block} executionId={execution.executionId} propertyId={execution.property?.id} itemActionsDisabled onItemAction={() => undefined} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />)}
          </div>
        </details>
      </article>
    );
  }

  return (
    <ResultRevalidationBoundary executionId={execution.executionId} issue={refreshIssue}><ResultViewContext.Provider value={controls}><article id={`ask-execution-${execution.executionId}`} className="scroll-mt-28 space-y-3 lg:scroll-mt-32" onFocusCapture={() => { window.sessionStorage.setItem(`ctc:ask-return-execution:${execution.sessionId}`, execution.executionId); }} onClickCapture={(event) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
      if (!link) return;
      const url = new URL(link.href, window.location.origin);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/dashboard/')) return;
      const scrollOffset = event.currentTarget.getBoundingClientRect().top;
      controls.change((view) => ({ ...view, scrollOffset, selectedTaskId: url.searchParams.get('taskId') ?? view.selectedTaskId }));
    }}>
      <div className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-3 text-sm leading-6 text-white">{execution.question}</div>
      <div className="space-y-3 rounded-3xl border border-slate-200 bg-white/60 p-3 shadow-sm sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-xs font-semibold text-teal-800 focus:outline-none"><Sparkles className="h-3.5 w-3.5" />{execution.continuesExecutionId ? 'Updated view' : 'Cozy response'}{execution.property ? ` · ${execution.property.label}` : ''}</h2>
          <button type="button" disabled={refreshing || refreshPending || loading || refreshAccessLost} onClick={() => void refresh()} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50" aria-label="Refresh this result">
            <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} />{refreshing || refreshPending ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <p className="text-xs text-slate-500" role="status" aria-live="polite">
          Updated {new Date(execution.updatedAt).toLocaleString()}
          {execution.viewState && ` · ${execution.blocks.flatMap((block) => block.type === 'GROUPED_LIST' && block.id === 'maintenance-groups' ? block.sections : []).reduce((count, section) => count + section.count, 0)} matching tasks`}
        </p>
        {/* ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001: `execution.blocks` is
            always current data; this discloses what Cozy originally
            answered whenever the two have actually diverged (this result
            was refreshed, completed, or edited at least once since it was
            first created), without cluttering the common one-shot case. */}
        {execution.originalResponse && execution.updatedAt !== execution.createdAt && (
          <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <summary className="cursor-pointer text-[11px] font-semibold text-slate-500">Originally answered {new Date(execution.originalResponse.observedAt).toLocaleString()} · view original response</summary>
            <div className="mt-3 space-y-3 opacity-75">
              <ResultViewContext.Provider value={null}>{execution.originalResponse.blocks.map((block) => <BlockView key={block.id} block={block} executionId={execution.executionId} propertyId={execution.property?.id} itemActionsDisabled onItemAction={() => undefined} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />)}</ResultViewContext.Provider>
            </div>
          </details>
        )}
        <div ref={bodyRef} className="space-y-3">
          <AskBlockActionContext.Provider value={{ disabled: loading || refreshing || refreshPending || Boolean(refreshError), invoke: dispatchBlockAction }}>
            {execution.blocks.map((block) => <BlockView key={block.id} block={block} executionId={execution.executionId} propertyId={execution.property?.id} itemActionsDisabled={loading || refreshing || refreshPending || Boolean(refreshError)} onItemAction={dispatchItemAction} onFilterClick={(message) => void ask(message, undefined, { sourceExecutionId: execution.executionId })} onCollectionPage={(sectionId, direction) => void ask(`${direction === 'NEXT' ? 'Show next' : 'Show previous'} maintenance results`, undefined, { sourceExecutionId: execution.executionId, entityType: 'ASK_COLLECTION_SECTION', entityId: sectionId, actionId: `${direction}_PAGE` })} onAccessLost={() => onAccessLost(execution)} onOpenContext={onOpenContext} />)}
            {hasResponseContext(execution) && <ResponseContextSummary execution={execution} open={contextOpen} onOpen={onOpenContext} />}
          </AskBlockActionContext.Provider>
          {itemActionIssue && <p role="alert" className="text-xs font-semibold text-red-700">{itemActionIssue}</p>}
        </div>
        {execution.status === 'NEEDS_PROPERTY' && <PropertySelectionCard executionId={execution.executionId} onCompleted={updateExecution} autoFocus={isJustUpdated} />}
        {execution.correctionCapabilities.retryResponse && <div><button type="button" disabled={loading} onClick={() => void ask(execution.question)} className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Try again with current records</button></div>}
        {execution.captureRequests.map((request, index) => <InlineCaptureCard key={request.requirementId} executionId={execution.executionId} request={request} onCompleted={updateExecution} autoFocus={index === 0 && isJustUpdated} />)}
        {execution.clarification && <ClarificationCard executionId={execution.executionId} clarification={execution.clarification} onCompleted={updateExecution} autoFocus={isJustUpdated} />}
        {execution.confirmation && execution.status === 'NEEDS_CONFIRMATION' && <ConfirmationCard executionId={execution.executionId} confirmation={execution.confirmation} onCompleted={updateExecution} autoFocus={isJustUpdated} onAccessLost={() => onAccessLost(execution)} />}
        {/* External review [P2]: status RUNNING with confirmation still
            populated means a claim was made but the domain write's outcome
            isn't known yet -- render the outcome-unknown state instead of
            ConfirmationCard's "Confirmation required," which would invite
            a resubmit of something that may already be running or done. */}
        {execution.confirmation && execution.status === 'RUNNING' && <PendingOutcomeCard executionId={execution.executionId} confirmationVersion={execution.confirmation.version} onCompleted={updateExecution} onAccessLost={() => onAccessLost(execution)} />}
        {execution.skillHandoff && (() => {
          const handoffPrompt = execution.skillHandoff.suggestedGoal.replace(/[-_]+/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
          const continuity = execution.skillHandoff.continuity;
          return <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Suggested next step</p><button type="button" disabled={loading} onClick={() => void ask(handoffPrompt, undefined, { propertyId: continuity.propertyId ?? undefined, entityType: continuity.sourceEntityType ?? undefined, entityId: continuity.sourceEntityId ?? undefined, actionId: continuity.sourceHomeActionId ?? undefined, decisionThreadId: continuity.decisionThreadId ?? undefined, workItemId: continuity.workItemId ?? undefined, journeyId: continuity.journeyId ?? undefined, contextVersion: continuity.contextVersion ?? undefined, returnTo: continuity.returnDestination ?? undefined })} className="mt-2 min-h-10 rounded-xl border border-teal-300 bg-white px-3 py-2 text-left text-sm font-semibold text-teal-900 hover:border-teal-500 disabled:opacity-50">{handoffPrompt}</button><p className="mt-2 text-xs text-teal-800">Ask will check access, availability, and current home context again before continuing.</p></div>;
        })()}
        {visibleSuggestions.length > 0 && <div className="flex flex-wrap gap-2 pt-1">{visibleSuggestions.map((suggestion) => <button key={suggestion} onClick={() => { setInput(suggestion); window.localStorage.setItem(draftStorageKey(selectedPropertyId, execution.sessionId), suggestion); }} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-teal-300 hover:text-teal-800">{suggestion}</button>)}</div>}
        <ExecutionFeedback executionId={execution.executionId} propertyId={execution.property?.id} capabilities={execution.correctionCapabilities} />
      </div>
    </article></ResultViewContext.Provider></ResultRevalidationBoundary>
  );
}

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
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pendingWork, setPendingWork] = useState<AskPendingWorkItem[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [continuingId, setContinuingId] = useState<string | null>(null);
  const [dismissingPendingId, setDismissingPendingId] = useState<string | null>(null);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [availabilityEpoch, setAvailabilityEpoch] = useState(0);
  const [recentSessions, setRecentSessions] = useState<AskRecentSessionSummary[]>([]);
  const [recentSessionsLoading, setRecentSessionsLoading] = useState(false);
  const [recentSessionsLoadingMore, setRecentSessionsLoadingMore] = useState(false);
  const [recentSessionsNextCursor, setRecentSessionsNextCursor] = useState<string | null>(null);
  const [recentSessionsIssue, setRecentSessionsIssue] = useState<string | null>(null);
  const [historySearchInput, setHistorySearchInput] = useState('');
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [searchSessions, setSearchSessions] = useState<AskRecentSessionSummary[]>([]);
  const [searchNextCursor, setSearchNextCursor] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchIssue, setSearchIssue] = useState<string | null>(null);
  const [openingRecentSessionId, setOpeningRecentSessionId] = useState<string | null>(null);
  const [recentSessionsEpoch, setRecentSessionsEpoch] = useState(0);
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
  const deniedProperties = useRef(new Set<string>());
  const [refreshRequests, setRefreshRequests] = useState<Record<string, number>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeSessionRef = useRef('');
  const activeSessionPropertyRef = useRef<string | undefined>(undefined);
  const historyPropertyRef = useRef<string | undefined>(undefined);
  const historyRequestEpochRef = useRef(0);
  const searchRequestEpochRef = useRef(0);
  const searchScopeRef = useRef('');
  const appliedInitialQuestionRef = useRef('');
  const redactHistoryAccessLoss = useCallback((propertyId: string) => {
    setRecentSessions([]);
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
  }, []);
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
    setPendingLoading(true);
    api.getAskPendingWork(selectedPropertyId, { signal: controller.signal })
      .then((response) => setPendingWork(response.success && response.data ? response.data.items : []))
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
          setPendingWork([]);
          if (askServiceIsPaused(caught)) setServiceUnavailable(true);
        }
      })
      .finally(() => { if (!controller.signal.aborted) setPendingLoading(false); });
    return () => controller.abort();
  }, [selectedPropertyId, propertyMismatch, availabilityEpoch]);

  useEffect(() => {
    const timer = window.setTimeout(() => setHistorySearchTerm(historySearchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [historySearchInput]);

  useEffect(() => {
    if (propertyMismatch || (effectiveHistoryScope === 'THIS_HOME' && !selectedPropertyId)) return;
    const controller = new AbortController();
    const requestEpoch = ++historyRequestEpochRef.current;
    const scopeKey = JSON.stringify([effectiveHistoryScope, selectedPropertyId]);
    const apiScope = effectiveHistoryScope === 'ALL_HOMES' ? { allHomes: true as const } : { propertyId: selectedPropertyId! };
    if (historyPropertyRef.current !== scopeKey) {
      setRecentSessions([]);
      setRecentSessionsNextCursor(null);
      setSearchSessions([]);
      setSearchNextCursor(null);
      ++searchRequestEpochRef.current;
      searchScopeRef.current = '';
      historyPropertyRef.current = scopeKey;
    }
    setRecentSessionsLoading(true);
    setRecentSessionsLoadingMore(false);
    setRecentSessionsIssue(null);
    api.getRecentAskSessions(apiScope, { signal: controller.signal })
      .then((response) => {
        if (!response.success || !response.data) throw new Error(response.message || 'Could not refresh conversations.');
        if (controller.signal.aborted || historyRequestEpochRef.current !== requestEpoch) return;
        const items = response.data.items;
        setRecentSessions(Array.isArray(items) ? items : []);
        setRecentSessionsNextCursor(response.data.nextCursor ?? null);
      })
      .catch((caught) => {
        if (!controller.signal.aborted && historyRequestEpochRef.current === requestEpoch && !(caught instanceof DOMException && caught.name === 'AbortError')) {
          if (ACCESS_LOST_CODES.includes(askFailureCode(caught) ?? '')) {
            if (selectedPropertyId) redactHistoryAccessLoss(selectedPropertyId);
            else { setRecentSessions([]); setRecentSessionsNextCursor(null); setRecentSessionsIssue('Conversation access changed.'); }
          } else {
            setRecentSessionsIssue('Could not refresh conversations. Previously loaded conversations remain visible; try again later.');
          }
          if (askServiceIsPaused(caught)) setServiceUnavailable(true);
        }
      })
      .finally(() => { if (!controller.signal.aborted) setRecentSessionsLoading(false); });
    return () => controller.abort();
  }, [selectedPropertyId, effectiveHistoryScope, propertyMismatch, availabilityEpoch, recentSessionsEpoch, redactHistoryAccessLoss]);

  useEffect(() => {
    if (!historySearchTerm || propertyMismatch || (effectiveHistoryScope === 'THIS_HOME' && !selectedPropertyId)) {
      setSearchSessions([]);
      setSearchNextCursor(null);
      setSearchIssue(null);
      setSearchLoading(false);
      setSearchLoadingMore(false);
      searchScopeRef.current = '';
      return;
    }
    const controller = new AbortController();
    const requestEpoch = ++searchRequestEpochRef.current;
    const searchScope = JSON.stringify([effectiveHistoryScope, selectedPropertyId, historySearchTerm]);
    const apiScope = effectiveHistoryScope === 'ALL_HOMES' ? { allHomes: true as const } : { propertyId: selectedPropertyId! };
    if (searchScopeRef.current !== searchScope) {
      setSearchSessions([]);
      setSearchNextCursor(null);
      searchScopeRef.current = searchScope;
    }
    setSearchIssue(null);
    setSearchLoading(true);
    setSearchLoadingMore(false);
    api.searchAskSessions(apiScope, historySearchTerm, { signal: controller.signal })
      .then((response) => {
        if (!response.success || !response.data) throw new Error(response.message || 'Could not search conversation titles.');
        if (controller.signal.aborted || searchRequestEpochRef.current !== requestEpoch) return;
        setSearchSessions(response.data.items);
        setSearchNextCursor(response.data.nextCursor);
      })
      .catch((caught) => {
        if (controller.signal.aborted || searchRequestEpochRef.current !== requestEpoch || (caught instanceof DOMException && caught.name === 'AbortError')) return;
        if (ACCESS_LOST_CODES.includes(askFailureCode(caught) ?? '') && selectedPropertyId) redactHistoryAccessLoss(selectedPropertyId);
        else setSearchIssue('Could not refresh matches. Previously loaded matches remain visible; recent conversations remain available when search is cleared.');
        if (askServiceIsPaused(caught)) setServiceUnavailable(true);
      })
      .finally(() => { if (!controller.signal.aborted && searchRequestEpochRef.current === requestEpoch) setSearchLoading(false); });
    return () => controller.abort();
  }, [historySearchTerm, selectedPropertyId, effectiveHistoryScope, propertyMismatch, availabilityEpoch, recentSessionsEpoch, redactHistoryAccessLoss]);

  const loadMoreRecentSessions = async () => {
    if ((effectiveHistoryScope === 'THIS_HOME' && !selectedPropertyId) || !recentSessionsNextCursor || recentSessionsLoading || recentSessionsLoadingMore) return;
    const requestEpoch = historyRequestEpochRef.current;
    const scopeKey = JSON.stringify([effectiveHistoryScope, selectedPropertyId]);
    const apiScope = effectiveHistoryScope === 'ALL_HOMES' ? { allHomes: true as const } : { propertyId: selectedPropertyId! };
    setRecentSessionsLoadingMore(true);
    setRecentSessionsIssue(null);
    try {
      const response = await api.getRecentAskSessions(apiScope, { cursor: recentSessionsNextCursor });
      if (!response.success || !response.data) throw new Error(response.message || 'Could not load older conversations.');
      if (historyRequestEpochRef.current !== requestEpoch || historyPropertyRef.current !== scopeKey) return;
      setRecentSessions((current) => {
        const seen = new Set(current.map((item) => item.sessionId));
        return [...current, ...response.data!.items.filter((item) => !seen.has(item.sessionId))];
      });
      setRecentSessionsNextCursor(response.data.nextCursor ?? null);
    } catch (caught) {
      if (historyRequestEpochRef.current !== requestEpoch || historyPropertyRef.current !== scopeKey) return;
      if (ACCESS_LOST_CODES.includes(askFailureCode(caught) ?? '')) {
        if (selectedPropertyId) redactHistoryAccessLoss(selectedPropertyId);
        else { setRecentSessions([]); setRecentSessionsNextCursor(null); setRecentSessionsIssue('Conversation access changed.'); }
      } else {
        setRecentSessionsIssue('Could not load older conversations. The conversations already shown remain available.');
      }
      if (askServiceIsPaused(caught)) setServiceUnavailable(true);
    } finally {
      if (historyRequestEpochRef.current === requestEpoch) setRecentSessionsLoadingMore(false);
    }
  };

  const loadMoreSearchSessions = async () => {
    if ((effectiveHistoryScope === 'THIS_HOME' && !selectedPropertyId) || !historySearchTerm || !searchNextCursor || searchLoading || searchLoadingMore) return;
    const requestEpoch = searchRequestEpochRef.current;
    const scopeKey = JSON.stringify([effectiveHistoryScope, selectedPropertyId]);
    const apiScope = effectiveHistoryScope === 'ALL_HOMES' ? { allHomes: true as const } : { propertyId: selectedPropertyId! };
    setSearchLoadingMore(true);
    setSearchIssue(null);
    try {
      const response = await api.searchAskSessions(apiScope, historySearchTerm, { cursor: searchNextCursor });
      if (!response.success || !response.data) throw new Error(response.message || 'Could not load more matches.');
      if (searchRequestEpochRef.current !== requestEpoch || historyPropertyRef.current !== scopeKey) return;
      setSearchSessions((current) => {
        const seen = new Set(current.map((item) => item.sessionId));
        return [...current, ...response.data!.items.filter((item) => !seen.has(item.sessionId))];
      });
      setSearchNextCursor(response.data.nextCursor);
    } catch (caught) {
      if (searchRequestEpochRef.current !== requestEpoch || historyPropertyRef.current !== scopeKey) return;
      if (ACCESS_LOST_CODES.includes(askFailureCode(caught) ?? '') && selectedPropertyId) redactHistoryAccessLoss(selectedPropertyId);
      else setSearchIssue('Could not load more matches. Matches already shown remain available.');
      if (askServiceIsPaused(caught)) setServiceUnavailable(true);
    } finally {
      if (searchRequestEpochRef.current === requestEpoch) setSearchLoadingMore(false);
    }
  };

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
    if (loading) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
      document.getElementById(`ask-execution-${justUpdatedExecutionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      setLoading(false);
    }
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

  const dismissPendingWork = async (item: AskPendingWorkItem) => {
    if (continuingId || dismissingPendingId || loading || item.pendingKind === 'COMMAND_RECOVERY') return;
    setDismissingPendingId(item.execution.executionId);
    setError(null);
    try {
      const response = await api.cancelAskExecution(item.execution.executionId);
      if (!response.success || !response.data || response.data.status !== 'CANCELLED') throw new Error(response.message || 'Could not dismiss this pending action.');
      setPendingWork((current) => current.filter((pending) => pending.execution.executionId !== item.execution.executionId));
      setRecentSessionsEpoch((current) => current + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not dismiss this pending action.');
    } finally {
      setDismissingPendingId(null);
    }
  };

  const visiblePendingWork = pendingWork.filter((item) => item.execution.sessionId !== sessionId);
  const visibleRecentSessions = recentSessions.filter((item) => item.sessionId !== sessionId && (effectiveHistoryScope === 'ALL_HOMES' || item.property.id === selectedPropertyId));
  const latestExecution = executions.at(-1);
  const activeConversation = executions.length > 0 && latestExecution && latestExecution.property?.id === selectedPropertyId && !deniedProperties.current.has(`${sessionId}:${latestExecution.property?.id}`) ? {
    sessionId,
    title: executions[0].question,
    property: latestExecution.property ?? { id: selectedPropertyId ?? 'general', label: selectedPropertyId ? 'Selected home' : 'General home guidance' },
    latestStatus: latestExecution.status,
    latestExecutionId: latestExecution.executionId,
    executionCount: executions.length,
    lastActiveAt: latestExecution.updatedAt,
  } satisfies AskRecentSessionSummary : null;
  const historySearchActive = Boolean(historySearchInput.trim());
  const historySearchPending = historySearchActive && historySearchInput.trim() !== historySearchTerm;
  const historySessions = historySearchActive
    ? historySearchPending ? [] : searchSessions.filter((item) => effectiveHistoryScope === 'ALL_HOMES' || item.property.id === selectedPropertyId)
    : effectiveHistoryScope === 'ALL_HOMES' ? recentSessions : activeConversation ? [activeConversation, ...visibleRecentSessions] : visibleRecentSessions;
  const historyRailLoading = historySearchActive ? historySearchPending || searchLoading : recentSessionsLoading;
  const historyRailLoadingMore = historySearchActive ? searchLoadingMore : recentSessionsLoadingMore;
  const historyRailHasMore = historySearchActive ? !historySearchPending && Boolean(searchNextCursor) : Boolean(recentSessionsNextCursor);
  const historyRailIssue = historySearchActive ? searchIssue : recentSessionsIssue;
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
      {error && <div className="mb-2 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700" role="alert"><AlertTriangle className="h-4 w-4" />{error}</div>}
      <div className={cn('flex items-end gap-2 border border-slate-300 bg-white p-2 shadow-sm transition focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100', placement === 'hero' ? 'rounded-3xl p-3 shadow-[0_12px_40px_-20px_rgba(15,118,110,0.45)]' : 'rounded-2xl')}>
        <textarea ref={textareaRef} value={input} onChange={(event) => { setInput(event.target.value); if (sessionId) window.localStorage.setItem(draftStorageKey(selectedPropertyId, sessionId), event.target.value); }} onKeyDown={keyDown} onCompositionStart={() => { isComposingRef.current = true; }} onCompositionEnd={() => { isComposingRef.current = false; }} rows={placement === 'hero' ? 2 : 1} maxLength={4000} placeholder="Ask anything about your home…" className={cn('max-h-32 flex-1 resize-none bg-transparent px-2 text-slate-900 outline-none placeholder:text-slate-400', placement === 'hero' ? 'min-h-14 py-3 text-base' : 'min-h-10 py-2 text-sm')} />
        <button type="submit" disabled={!input.trim() || loading || !sessionId} aria-label="Send question" className={cn('grid shrink-0 place-items-center rounded-2xl bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40', placement === 'hero' ? 'h-12 w-12' : 'h-10 w-10 rounded-xl')}><Send className="h-4 w-4" /></button>
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
              <ConversationHistoryNav items={historySessions} activeSessionId={executions.length > 0 ? sessionId : ''} loading={historyRailLoading} loadingMore={historyRailLoadingMore} hasMore={historyRailHasMore} issue={historyRailIssue} openingId={openingRecentSessionId} query={historySearchInput} scope={effectiveHistoryScope} selectedHomeAvailable={Boolean(selectedPropertyId)} onQueryChange={setHistorySearchInput} onScopeChange={setHistoryScope} onOpen={(recent) => void openRecentSession(recent)} onNew={startNewSession} onLoadMore={() => void loadMoreHistory()} backHref={safeBackTo} backLabel={initialBackLabel} />
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
            <ConversationHistoryNav items={historySessions} activeSessionId={executions.length > 0 ? sessionId : ''} loading={historyRailLoading} loadingMore={historyRailLoadingMore} hasMore={historyRailHasMore} issue={historyRailIssue} openingId={openingRecentSessionId} query={historySearchInput} scope={effectiveHistoryScope} selectedHomeAvailable={Boolean(selectedPropertyId)} onQueryChange={setHistorySearchInput} onScopeChange={setHistoryScope} onOpen={(recent) => void openRecentSession(recent)} onNew={startNewSession} onLoadMore={() => void loadMoreHistory()} backHref={safeBackTo} backLabel={initialBackLabel} />
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
