'use client';

import Link from 'next/link';
import { ComponentProps, createContext, FormEvent, KeyboardEvent, Ref, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, BellRing, BookOpen, CheckCircle2, CircleDollarSign, ClipboardCheck, Clock3, ExternalLink, Loader2, Maximize2, MessageCircle, RefreshCw, Send, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp, Trash2, Wrench } from 'lucide-react';
import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { cn } from '@/lib/utils';
import type { AskAction, AskCapabilityCategoryId, AskCapabilityGroup, AskCapabilityPrompt, AskCaptureRequest, AskClarification, AskConfirmation, AskExecutionResponse, AskFeaturedPrompt, AskPendingWorkItem, AskPresentationBlock, AskRecentSessionSummary, ConciergeHomeView } from '@/features/ask/types';
import { CaptureFieldControl } from '@/components/property-context/CaptureFieldControl';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { track } from '@/lib/analytics/events';
import { addAskReturnContext, buildAskWorkspaceHref } from '@/lib/navigation/askNavigation';
import { resolveDashboardBackHref } from '@/lib/navigation/backNavigation';
import { resolveConciergeLandingSpotlight, visibleConciergeFeaturedPrompts } from '@/features/ask/conciergeLandingPolicy';
import { formatLegacyAskCurrency, formatLegacyAskMaintenanceItem, workflowProgressStatusLabel } from '@/features/ask/presentationCompatibility';

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

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function askSuggestionKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED = 'ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED';

function askFailureCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
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

function draftStorageKey(propertyId?: string): string {
  return `ctc:ask-draft:v1:${propertyId ?? 'general'}`;
}

function captureDraftStorageKey(executionId: string, requirementId: string): string {
  return `ctc:ask-capture-draft:v1:${executionId}:${requirementId}`;
}

function confirmationAttemptStorageKey(executionId: string, version: number): string {
  return `ctc:ask-confirmation-attempt:v1:${executionId}:${version}`;
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

const AskActionReturnContext = createContext('');

function AskContextLink({ href, ...props }: Omit<ComponentProps<typeof Link>, 'href'> & { href: string }) {
  const askReturnHref = useContext(AskActionReturnContext);
  const contextualHref = askReturnHref ? addAskReturnContext(href, askReturnHref) : href;
  return <Link href={contextualHref} {...props} />;
}

function ActionLink({ action }: { action: AskAction }) {
  if (!action.href) return null;
  return (
    <AskContextLink
      href={action.href}
      className={cn(
        'inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
        action.style === 'PRIMARY' ? 'bg-teal-700 text-white hover:bg-teal-800' : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
      )}
    >
      {action.label}<ArrowRight className="h-4 w-4" />
    </AskContextLink>
  );
}

function MonitorView({ block }: { block: Extract<AskPresentationBlock, { type: 'MONITOR' }> }) {
  const [status, setStatus] = useState(block.status);
  const [saving, setSaving] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    api.getAskMonitor(block.monitorId).then((response) => {
      if (active && response.success && response.data) setStatus(response.data.status);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [block.monitorId]);
  const update = async (action: 'PAUSE' | 'RESUME' | 'STOP') => {
    setSaving(true); setError(null);
    try {
      const response = await api.updateAskMonitor(block.monitorId, action);
      if (!response.success || !response.data) throw new Error(response.message || 'Could not update this monitor.');
      setStatus(response.data.status); setConfirmStop(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update this monitor.'); }
    finally { setSaving(false); }
  };
  const editAction = block.actions.find((action) => action.id === 'edit-monitor');
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-700 text-white"><BellRing className="h-5 w-5" /></span><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-950">{block.title}</h3><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">{status}</span></div><p className="mt-1 text-sm text-slate-700">{block.product} · {block.threshold}</p></div></div>
      <dl className="mt-4 grid gap-2 rounded-xl bg-white/80 p-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Delivery</dt><dd className="font-medium text-slate-800">{block.channel} · {block.cadence.replace(/_/g, ' ').toLowerCase()}</dd></div><div><dt className="text-xs text-slate-500">Quiet hours</dt><dd className="font-medium text-slate-800">{block.quietHours ?? 'None'}</dd></div></dl>
      <p className="mt-3 text-xs leading-5 text-slate-600">{block.sourceBoundary}</p>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {editAction && <ActionLink action={editAction} />}
        {status === 'ACTIVE' && <button type="button" disabled={saving} onClick={() => void update('PAUSE')} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Pause</button>}
        {status === 'PAUSED' && <button type="button" disabled={saving} onClick={() => void update('RESUME')} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Resume</button>}
        {status !== 'STOPPED' && !confirmStop && <button type="button" disabled={saving} onClick={() => setConfirmStop(true)} className="min-h-10 rounded-xl px-3 py-2 text-sm font-semibold text-red-700">Stop</button>}
      </div>
      {confirmStop && <div className="mt-3 rounded-xl border border-red-200 bg-white p-3"><p className="text-sm text-slate-700">Stop this monitor? It will no longer evaluate new rate snapshots.</p><div className="mt-2 flex gap-2"><button type="button" disabled={saving} onClick={() => void update('STOP')} className="min-h-10 rounded-xl bg-red-700 px-3 py-2 text-sm font-semibold text-white">Confirm stop</button><button type="button" disabled={saving} onClick={() => setConfirmStop(false)} className="min-h-10 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600">Keep active</button></div></div>}
    </section>
  );
}

function CapabilityCard({ capability }: {
  capability: Extract<AskPresentationBlock, { type: 'CAPABILITY_LIST' }>['capabilities'][number];
}) {
  const unavailable = capability.readiness === 'UNAVAILABLE';
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-950">{capability.label}</p>
            {capability.releaseStage === 'BETA' && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-teal-800">BETA</span>}
          </div>
          <p className="mt-1 text-sm leading-5 text-slate-600">{capability.description}</p>
        </div>
        {!unavailable && <ExternalLink className="h-4 w-4 shrink-0 text-teal-700" />}
      </div>
      <p className="mt-3 text-xs font-medium text-teal-800">You’ll get: {capability.expectedOutput}</p>
      {capability.readinessLabel && (
        <p className={cn('mt-2 text-xs font-semibold', capability.readiness === 'READY' ? 'text-emerald-700' : unavailable ? 'text-red-700' : 'text-amber-700')}>
          {capability.readinessLabel}
        </p>
      )}
      {capability.readinessReasons.length > 0 && (
        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-600">
          {capability.readinessReasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
    </>
  );
  const className = cn(
    'block rounded-2xl border p-4',
    unavailable
      ? 'border-slate-200 bg-slate-50'
      : 'group border-teal-100 bg-teal-50/60 transition hover:border-teal-300 hover:bg-teal-50',
  );
  return unavailable
    ? <div className={className} aria-label={`${capability.label} unavailable`}>{content}</div>
    : <AskContextLink href={capability.href} className={className}>{content}</AskContextLink>;
}

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

// Ask Intelligence FRD §22.1/Phase 9B "usefulness feedback" deliverable —
// per-PRIORITY_LIST-item rating, distinct from ExecutionFeedback's
// whole-response UP/DOWN thumbs.
function HomeActionUsefulnessButtons({ executionId, homeActionId }: { executionId: string; homeActionId: string }) {
  const [rating, setRating] = useState<'USEFUL' | 'NOT_USEFUL' | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (nextRating: 'USEFUL' | 'NOT_USEFUL') => {
    setSaving(true);
    try {
      const response = await api.submitHomeActionUsefulnessFeedback(executionId, homeActionId, { rating: nextRating });
      if (response.success) setRating(nextRating);
    } finally { setSaving(false); }
  };

  return (
    <div className="flex items-center gap-1 text-xs text-slate-500">
      <span>{rating ? 'Thanks—saved.' : 'Useful?'}</span>
      <button type="button" disabled={saving} aria-label="Mark useful" aria-pressed={rating === 'USEFUL'} onClick={() => void submit('USEFUL')} className={cn('rounded-lg p-1.5 hover:bg-slate-100', rating === 'USEFUL' && 'bg-teal-50 text-teal-700')}><ThumbsUp className="h-3.5 w-3.5" /></button>
      <button type="button" disabled={saving} aria-label="Mark not useful" aria-pressed={rating === 'NOT_USEFUL'} onClick={() => void submit('NOT_USEFUL')} className={cn('rounded-lg p-1.5 hover:bg-slate-100', rating === 'NOT_USEFUL' && 'bg-amber-50 text-amber-700')}><ThumbsDown className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function BlockView({ block, executionId }: { block: AskPresentationBlock; executionId: string }) {
  if (block.type === 'SUMMARY') {
    return (
      <section className={cn(
        'rounded-2xl border p-4',
        block.tone === 'CAUTION' && 'border-amber-200 bg-amber-50/70',
        block.tone === 'CRITICAL' && 'border-red-200 bg-red-50/70',
        block.tone === 'POSITIVE' && 'border-emerald-200 bg-emerald-50/70',
        block.tone === 'DEFAULT' && 'border-slate-200 bg-white',
      )}>
        <h3 className="font-semibold text-slate-950">{block.title}</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{block.body}</p>
        {block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
      </section>
    );
  }

  if (block.type === 'GROUPED_LIST') {
    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="font-semibold text-slate-950">{block.title}</h3>
          {block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}
        </div>
        <div className="divide-y divide-slate-100">
          {block.sections.map((section) => (
            <div key={section.id} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800">{section.title}</h4>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{section.count}</span>
              </div>
              {section.items.length === 0 ? <p className="text-sm text-slate-500">None recorded.</p> : (
                <ul className="space-y-3">
                  {section.items.map((sourceItem) => {
                    const item = block.id === 'maintenance-groups' ? formatLegacyAskMaintenanceItem(sourceItem) : sourceItem;
                    return <li key={item.id} className="rounded-xl bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {item.href ? <AskContextLink className="font-medium text-slate-950 hover:text-teal-700" href={item.href}>{item.title}</AskContextLink> : <p className="font-medium text-slate-950">{item.title}</p>}
                          {item.description && <p className="mt-1 text-sm leading-5 text-slate-600">{item.description}</p>}
                          {item.meta.length > 0 && <p className="mt-2 text-xs text-slate-500">{item.meta.join(' · ')}</p>}
                        </div>
                        {item.status && <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.status.replace(/_/g, ' ')}</span>}
                      </div>
                    </li>;
                  })}
                </ul>
              )}
              {section.count > section.items.length && (
                block.actions[0]?.href
                  ? <AskContextLink href={block.actions[0].href} className="mt-3 inline-block text-sm font-semibold text-teal-700 hover:underline">+{section.count - section.items.length} more · {block.actions[0].label}</AskContextLink>
                  : <p className="mt-3 text-sm text-slate-500">+{section.count - section.items.length} more not shown here.</p>
              )}
            </div>
          ))}
        </div>
        {block.id === 'focused-home-action-guidance' && block.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3">
            {block.actions.map((action) => <ActionLink key={action.id} action={action} />)}
          </div>
        )}
      </section>
    );
  }

  if (block.type === 'CAPABILITY_LIST') {
    return (
      <section className="space-y-3">
        <div><h3 className="font-semibold text-slate-950">{block.title}</h3>{block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}</div>
        {block.capabilities.map((capability) => (
          <CapabilityCard key={capability.id} capability={capability} />
        ))}
      </section>
    );
  }

  if (block.type === 'EVIDENCE') {
    return (
      <details className="rounded-2xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">{block.title} ({block.items.length})</summary>
        <ul className="mt-3 space-y-2 text-xs text-slate-600">{block.items.map((item, index) => <li key={`${item.label}-${index}`}>{item.label}{item.source ? ` · ${item.source}` : ''}{item.observedAt ? ` · ${new Date(item.observedAt).toLocaleDateString()}` : ''}</li>)}</ul>
      </details>
    );
  }

  if (block.type === 'BOUNDARY') {
    return (
      <section className={cn('rounded-2xl border p-4', block.severity === 'EMERGENCY' ? 'border-red-300 bg-red-50 text-red-950' : 'border-amber-200 bg-amber-50/70 text-slate-900')}>
        <div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><h3 className="font-semibold">{block.title}</h3><p className="mt-2 text-sm leading-6">{block.body}</p></div></div>
        {block.suggestions.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-9 text-sm">{block.suggestions.map((item) => <li key={item}>{item}</li>)}</ul>}
        {block.actions?.length ? <div className="mt-4 flex flex-wrap gap-2 pl-8">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div> : null}
      </section>
    );
  }

  if (block.type === 'MONITOR') {
    return <MonitorView block={block} />;
  }

  if (block.type === 'WORKFLOW_PROGRESS') {
    return (
      <section className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-700 text-white"><CheckCircle2 className="h-5 w-5" /></span>
          <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-950">{block.title}</h3><span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">{workflowProgressStatusLabel(block.title, block.status)}</span></div><p className="mt-1 text-sm leading-5 text-slate-700">{block.description}</p></div>
        </div>
        <dl className="mt-4 divide-y divide-teal-100 rounded-xl border border-teal-100 bg-white px-3">{block.details.map((detail) => <div key={detail.label} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[9rem_1fr]"><dt className="text-slate-500">{detail.label}</dt><dd className="font-medium text-slate-800">{detail.value}</dd></div>)}</dl>
        {block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
      </section>
    );
  }

  if (block.type === 'METRIC_ROW') return <section className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="font-semibold text-slate-950">{block.title}</h3>{block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}<dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{block.metrics.map((metric) => <div key={metric.label} className={cn('rounded-xl border p-3', metric.tone === 'POSITIVE' ? 'border-emerald-200 bg-emerald-50' : metric.tone === 'CAUTION' ? 'border-amber-200 bg-amber-50' : metric.tone === 'CRITICAL' ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50')}><dt className="text-xs text-slate-500">{metric.label}</dt><dd className="mt-1 text-lg font-semibold text-slate-950">{metric.value}</dd>{metric.detail && <p className="mt-1 text-xs text-slate-600">{metric.detail}</p>}</div>)}</dl></section>;

  if (block.type === 'TIMELINE') return <section className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="font-semibold text-slate-950">{block.title}</h3>{block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}<ol className="mt-4 border-l-2 border-teal-200 pl-4">{block.items.map((item) => <li key={item.id} className="relative pb-4 before:absolute before:-left-[1.34rem] before:top-1 before:h-2.5 before:w-2.5 before:rounded-full before:bg-teal-700"><div className="flex flex-wrap items-center gap-2">{item.href ? <AskContextLink href={item.href} className="font-semibold text-slate-900 hover:text-teal-700">{item.label}</AskContextLink> : <span className="font-semibold text-slate-900">{item.label}</span>}{item.date && <span className="text-xs text-slate-500">{item.date}</span>}{item.status && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{item.status}</span>}</div>{item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}</li>)}</ol></section>;

  if (block.type === 'COMPARISON') return <section className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="font-semibold text-slate-950">{block.title}</h3>{block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}<div className="mt-4 grid gap-3 sm:grid-cols-2">{block.options.map((option) => <div key={option.id} className="rounded-xl border border-slate-200 p-3"><h4 className="font-semibold text-slate-900">{option.label}</h4>{option.summary && <p className="mt-1 text-sm text-slate-600">{option.summary}</p>}<dl className="mt-3 space-y-2">{option.attributes.map((attribute) => <div key={attribute.label} className="flex justify-between gap-3 text-sm"><dt className="text-slate-500">{attribute.label}</dt><dd className="text-right font-medium text-slate-800">{attribute.value}</dd></div>)}</dl></div>)}</div>{block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}</section>;

  if (block.type === 'DECISION_TRACE') return <details className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold text-slate-900">{block.title}</summary><ol className="mt-3 space-y-3">{block.steps.map((step, index) => <li key={`${step.label}-${index}`} className="text-sm"><p className="font-medium text-slate-800">{index + 1}. {step.label}</p><p className="mt-1 text-slate-600">{formatLegacyAskCurrency(step.detail)}</p>{step.outcome && <p className="mt-1 text-xs font-semibold text-teal-700">{step.outcome}</p>}</li>)}</ol></details>;

  if (block.type === 'DECISION_PROGRESS') {
    // FRD §21.4: lifecycleStatus and contextStatus are independent and both
    // shown distinctly (never collapsed into one status string), and a
    // stale/conflicted recommendation is never presented as current -- the
    // caution banner below is the only place the verdict renders when
    // contextStatus isn't CURRENT.
    const contextIsCurrent = block.contextStatus === 'CURRENT';
    return (
      <section className={cn('rounded-2xl border p-4', contextIsCurrent ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50/70')}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-slate-950">{block.title}</h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">{block.lifecycleStatus.replace(/_/g, ' ')}</span>
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', contextIsCurrent ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-200 text-amber-900')}>
            {contextIsCurrent ? 'Up to date' : block.contextStatus === 'CONFLICTED' ? 'Needs your input' : 'Needs refresh'}
          </span>
        </div>
        {!contextIsCurrent && (
          <p className="mt-2 text-sm leading-5 text-amber-900">
            {block.contextStatus === 'CONFLICTED'
              ? 'Something about this decision could not be reconciled automatically. Review it before relying on the recommendation below.'
              : 'A recorded fact changed since this recommendation was generated. It will be recalculated the next time you open this decision.'}
          </p>
        )}
        {block.verdict && (
          <p className="mt-3 text-lg font-semibold text-slate-950">
            {block.verdict.replace(/_/g, ' ')}
            {block.confidenceLabel && <span className="ml-2 text-xs font-medium uppercase tracking-wide text-slate-500">{block.confidenceLabel.toLowerCase()} confidence</span>}
          </p>
        )}
        {block.reasonCodes.length > 0 && (
          <div className="mt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">{block.reasonCodes.map((code) => <li key={code}>{code.replace(/_/g, ' ').toLowerCase()}</li>)}</ul>
          </div>
        )}
        {block.limitationCodes.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">Limitations ({block.limitationCodes.length})</summary>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">{block.limitationCodes.map((code) => <li key={code}>{code.replace(/_/g, ' ').toLowerCase()}</li>)}</ul>
          </details>
        )}
        {block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
      </section>
    );
  }

  if (block.type === 'SCENARIO_COMPARISON') {
    const columns = [
      { key: 'baseline' as const, data: block.baseline, label: 'Current recommendation' },
      { key: 'scenario' as const, data: block.scenario, label: block.scenario.label },
    ];
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold text-slate-950">{block.title}</h3>
        <p className="mt-1 text-sm text-slate-600">
          {block.comparisonDirection === 'NO_CHANGE'
            ? 'This scenario does not change the recommendation.'
            : block.comparisonDirection === 'SCENARIO_FAVORS_REPLACE'
              ? 'This scenario shifts the recommendation toward replacing.'
              : 'This scenario shifts the recommendation toward repairing.'}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {columns.map((column) => (
            <div key={column.key} className="rounded-xl border border-slate-200 p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{column.label}</h4>
              <p className="mt-1 font-semibold text-slate-900">{column.data.verdict.replace(/_/g, ' ')}</p>
              {column.data.reasonCodes.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">{column.data.reasonCodes.slice(0, 4).map((code) => <li key={code}>{code.replace(/_/g, ' ').toLowerCase()}</li>)}</ul>}
            </div>
          ))}
        </div>
        {block.scenario.assumptions.length > 0 && (
          <dl className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50 px-3">
            {block.scenario.assumptions.map((assumption) => (
              <div key={assumption.label} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[9rem_1fr]">
                <dt className="text-slate-500">{assumption.label}</dt>
                <dd className="font-medium text-slate-800">{assumption.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
      </section>
    );
  }

  if (block.type === 'PREFERENCE_REFERENCE') {
    // FRD §11.4: privacy-appropriate summary copy only, plus a visibility
    // disclosure -- "change/forget" controls are suggested follow-up
    // messages (the chip row below the response), not action links, since
    // these are commands rather than navigation.
    return (
      <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-slate-950">{block.title}</h3>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">{block.visibility.replace(/_/g, ' ').toLowerCase()}</span>
        </div>
        <p className="mt-2 text-sm leading-5 text-slate-700">{block.summary}</p>
        {block.expiresAt && <p className="mt-2 text-xs text-slate-600">Expires {new Date(block.expiresAt).toLocaleDateString()} unless reconfirmed.</p>}
      </section>
    );
  }

  if (block.type === 'WHY_NOW') {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-slate-950">{block.title}</h3>
          {block.confidenceLabel && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">{block.confidenceLabel.toLowerCase()} confidence</span>}
        </div>
        {block.timingNote && <p className="mt-2 text-sm text-slate-600">{block.timingNote}</p>}
        {block.triggerCodes.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">{block.triggerCodes.map((code) => <li key={code}>{code.replace(/_/g, ' ').toLowerCase()}</li>)}</ul>
        )}
      </section>
    );
  }

  if (block.type === 'RECOMMENDATION_CHANGE') {
    const categoryLabel = block.category === 'MATERIAL' ? 'This changes the recommendation'
      : block.category === 'CONFIDENCE_ONLY' ? 'The recommendation stayed the same; confidence changed'
        : block.category === 'SYSTEM_METHOD_ONLY' ? 'Only the calculation method changed, not your home’s facts'
          : 'Nothing material changed';
    return (
      <section className={cn('rounded-2xl border p-4', block.category === 'MATERIAL' ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-white')}>
        <h3 className="font-semibold text-slate-950">{block.title}</h3>
        <p className="mt-2 text-sm leading-5 text-slate-700">{categoryLabel}</p>
        {block.previousVerdict !== block.currentVerdict && (
          <p className="mt-2 text-sm text-slate-800"><span className="line-through text-slate-500">{block.previousVerdict.replace(/_/g, ' ')}</span> {'→'} <span className="font-semibold">{block.currentVerdict.replace(/_/g, ' ')}</span></p>
        )}
        {block.changedFactors.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">{block.changedFactors.map((factor) => <li key={factor} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">{factor.replace(/_/g, ' ').toLowerCase()}</li>)}</ul>
        )}
      </section>
    );
  }

  if (block.type === 'CHANGE_SUMMARY') {
    const materialityTone = block.materiality === 'URGENT' ? 'border-red-200 bg-red-50'
      : block.materiality === 'IMPORTANT' ? 'border-amber-200 bg-amber-50/70'
        : 'border-slate-200 bg-white';
    const materialityBadge = block.materiality === 'URGENT' ? 'bg-red-100 text-red-800'
      : block.materiality === 'IMPORTANT' ? 'bg-amber-200 text-amber-900'
        : 'bg-slate-100 text-slate-600';
    return (
      <section className={cn('rounded-2xl border p-4', materialityTone)}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-slate-950">{block.source}</h3>
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', materialityBadge)}>{block.materiality.toLowerCase()}</span>
        </div>
        <p className="mt-2 text-sm leading-5 text-slate-700">{block.summary}</p>
        <p className="mt-2 text-xs text-slate-600">
          Detected {new Date(block.detectedAt).toLocaleDateString()}
          {block.effectiveAt && ` · Effective ${new Date(block.effectiveAt).toLocaleDateString()}`}
        </p>
        {block.linkedAction && <div className="mt-3"><ActionLink action={{ id: `${block.id}-linked-action`, label: block.linkedAction.label, href: block.linkedAction.href, style: 'SECONDARY' }} /></div>}
      </section>
    );
  }

  if (block.type === 'PRIORITY_LIST') {
    const categoryLabel: Record<typeof block.items[number]['consumerPriority'], string> = {
      DO_NOW: 'Do now', PLAN_SOON: 'Plan soon', WATCH: 'Watch', OPTIONAL: 'Optional', NO_ACTION: 'No action needed',
    };
    const categoryBadge: Record<typeof block.items[number]['consumerPriority'], string> = {
      DO_NOW: 'bg-red-100 text-red-800', PLAN_SOON: 'bg-amber-200 text-amber-900',
      WATCH: 'bg-slate-100 text-slate-700', OPTIONAL: 'bg-slate-100 text-slate-500', NO_ACTION: 'bg-emerald-100 text-emerald-800',
    };
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-950">{block.title}</h3>
          <span className="text-xs text-slate-500">Ranking policy {block.rankingPolicyVersion}</span>
        </div>
        {block.items.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No ranked item is currently available on this channel. This does not mean the home needs no attention — it means the governed feed has nothing eligible to show right now.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {block.items.map((item, index) => (
              <li key={item.homeActionId} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400">#{index + 1}</span>
                  <h4 className="font-semibold text-slate-900">{item.title}</h4>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', categoryBadge[item.consumerPriority])}>{categoryLabel[item.consumerPriority]}</span>
                  {item.suppressed && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Suppressed</span>}
                  {item.completed && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Completed</span>}
                  {item.unavailable && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Unavailable</span>}
                  {item.stale && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Stale</span>}
                </div>
                {item.comparativeReasonCodes.length > 0 && (
                  <p className="mt-2 text-xs text-slate-600">Ranked here because: {item.comparativeReasonCodes.map((code) => code.replace(/_/g, ' ').toLowerCase()).join(', ')}.</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {item.confidenceLabel.toLowerCase()} confidence
                  {item.deadlineAt && ` · Due ${new Date(item.deadlineAt).toLocaleDateString()}`}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div>{item.cta ? <ActionLink action={item.cta} /> : item.watchState && <p className="text-sm text-slate-700">{item.watchState}</p>}</div>
                  <HomeActionUsefulnessButtons executionId={executionId} homeActionId={item.homeActionId} />
                </div>
              </li>
            ))}
          </ol>
        )}
        {block.truncated && <p className="mt-3 text-xs text-slate-500">More ranked items exist than are shown here. Open Home Actions to see the full list.</p>}
      </section>
    );
  }

  if (block.type === 'OUTCOME_SUMMARY') {
    const verificationBadge: Record<typeof block.entries[number]['verificationStatus'], string> = {
      REPORTED: 'bg-slate-100 text-slate-700', CORROBORATED: 'bg-teal-100 text-teal-800',
      VERIFIED: 'bg-emerald-100 text-emerald-800', REJECTED: 'bg-red-100 text-red-800', SUPERSEDED: 'bg-slate-100 text-slate-400',
    };
    const verificationLabel: Record<typeof block.entries[number]['verificationStatus'], string> = {
      REPORTED: 'Reported', CORROBORATED: 'Corroborated', VERIFIED: 'Verified', REJECTED: 'Disputed', SUPERSEDED: 'Superseded',
    };
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold text-slate-950">{block.title}</h3>
        {block.entries.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No outcome has been recorded for this decision yet.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {block.entries.map((entry) => (
              <li key={`${entry.outcomeObservationId}-${entry.relationshipType}`} className={cn('rounded-xl border border-slate-200 p-3', entry.verificationStatus === 'SUPERSEDED' && 'opacity-60')}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', verificationBadge[entry.verificationStatus])}>{verificationLabel[entry.verificationStatus]}</span>
                  <span className="text-xs text-slate-500">{entry.relationshipType.replace(/_/g, ' ').toLowerCase()}</span>
                  {entry.reviewStatus === 'DISPUTED' && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-800">Disputed</span>}
                </div>
                <p className="mt-2 text-sm text-slate-800">{entry.sourceLabel} · {new Date(entry.occurredAt).toLocaleDateString()}</p>
                {entry.observedCostLabel && <p className="mt-1 text-sm text-slate-700">Cost observed: {entry.observedCostLabel}</p>}
                {entry.note && <p className="mt-1 text-xs text-slate-600">{entry.note}</p>}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-xs text-slate-500">{block.limitation}</p>
      </section>
    );
  }

  if (block.type === 'ASSUMPTIONS') return <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-800">{block.title}</summary><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">{block.items.map((item) => <li key={item}>{item}</li>)}</ul></details>;

  if (block.type === 'LIMITATION' || block.type === 'EMPTY_STATE' || block.type === 'ERROR_STATE') {
    const actions = 'actions' in block ? block.actions : [];
    return <section className={cn('rounded-2xl border p-4', block.type === 'ERROR_STATE' ? 'border-red-200 bg-red-50' : block.type === 'LIMITATION' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50')}><h3 className="font-semibold text-slate-950">{block.title}</h3><p className="mt-2 text-sm leading-6 text-slate-700">{block.body}</p>{actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}</section>;
  }

  if (block.type === 'TABLE') return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {/* Below sm, a horizontally-scrolling table is hard to read on a
          phone-width viewport — stack each row as a labeled card instead. */}
      <div className="mt-3 space-y-3 sm:hidden">
        {block.rows.map((row) => (
          <dl key={row.id} className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50 px-3">
            {block.columns.map((column) => (
              <div key={column.key} className="grid grid-cols-[7rem_1fr] gap-2 py-2 text-sm">
                <dt className="text-slate-500">{column.label}</dt>
                <dd className="text-slate-800">{row.values[column.key]}</dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
      <div className="mt-3 hidden overflow-x-auto sm:block">
        <table className="min-w-full text-left text-sm"><thead><tr>{block.columns.map((column) => <th key={column.key} className="border-b px-2 py-2 text-xs text-slate-500">{column.label}</th>)}</tr></thead><tbody>{block.rows.map((row) => <tr key={row.id}>{block.columns.map((column) => <td key={column.key} className="border-b border-slate-100 px-2 py-2 text-slate-700">{row.values[column.key]}</td>)}</tr>)}</tbody></table>
      </div>
      {block.totalCount != null && block.totalCount > block.rows.length && (
        block.actions[0]?.href
          ? <AskContextLink href={block.actions[0].href} className="mt-3 inline-block text-sm font-semibold text-teal-700 hover:underline">+{block.totalCount - block.rows.length} more · {block.actions[0].label}</AskContextLink>
          : <p className="mt-3 text-sm text-slate-500">+{block.totalCount - block.rows.length} more not shown here.</p>
      )}
    </section>
  );

  const unsupported = block as { type?: string; title?: string };
  return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status"><h3 className="font-semibold text-slate-950">{unsupported.title ?? 'Response unavailable'}</h3><p className="mt-2 text-sm text-slate-700">This response section uses an unsupported format ({unsupported.type ?? 'unknown'}). Refresh Ask or ask the question again.</p></section>;
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

function ConfirmationCard({ executionId, confirmation, onCompleted, autoFocus = false }: { executionId: string; confirmation: AskConfirmation; onCompleted: (execution: AskExecutionResponse) => void; autoFocus?: boolean }) {
  const containerRef = useAutoFocusFirstControl<HTMLElement>(autoFocus);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => {
    const key = confirmationAttemptStorageKey(executionId, confirmation.version);
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const created = newId();
    window.sessionStorage.setItem(key, created);
    return created;
  });
  const expired = new Date(confirmation.expiresAt) <= new Date();

  const confirm = async () => {
    if (!consent || saving || expired) return;
    setSaving(true); setError(null);
    try {
      const response = await api.confirmAskExecution(executionId, { confirmationVersion: confirmation.version, idempotencyKey, consentConfirmed: true });
      if (!response.success || !response.data) throw new Error(response.message || 'Could not complete this action.');
      window.sessionStorage.removeItem(confirmationAttemptStorageKey(executionId, confirmation.version));
      onCompleted(response.data);
    } catch (caught) {
      // A disconnected client cannot cancel a server-side mutation. Reconcile
      // the durable execution before inviting the homeowner to retry.
      try {
        const reconciled = await api.getAskExecution(executionId);
        if (reconciled.success && reconciled.data && reconciled.data.status !== 'NEEDS_CONFIRMATION') {
          onCompleted(reconciled.data);
          if (reconciled.data.status !== 'RUNNING') window.sessionStorage.removeItem(confirmationAttemptStorageKey(executionId, confirmation.version));
          return;
        }
      } catch { /* retain the original actionable error */ }
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
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not cancel this action.'); }
    finally { setSaving(false); }
  };
  return (
    <section ref={containerRef} className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-800">Confirmation required</p>
      <h3 className="mt-1 font-semibold text-slate-950">{confirmation.title}</h3><p className="mt-1 text-sm leading-5 text-slate-700">{confirmation.description}</p>
      <dl className="mt-4 divide-y divide-violet-100 rounded-xl border border-violet-100 bg-white px-3">{confirmation.fields.map((field) => <div key={field.label} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[9rem_1fr]"><dt className="text-slate-500">{field.label}</dt><dd className="font-medium text-slate-800">{field.value}</dd></div>)}</dl>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-violet-200 bg-white p-3 text-sm text-slate-700"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 h-4 w-4" /><span>{confirmation.consentText}</span></label>
      {expired && <p className="mt-3 text-sm text-amber-700">This review expired. Ask again to use current settings.</p>}{error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={!consent || saving || expired} onClick={() => void confirm()} className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Working…' : confirmation.confirmLabel}</button><button type="button" disabled={saving} onClick={() => void cancel()} className="min-h-11 rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-white">Cancel</button></div>
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

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || missingRequired) return;
    setSaving(true);
    setError(null);
    try {
      const response = await api.submitAskCapture(executionId, {
        requirementId: request.requirementId,
        captureKey: request.captureKey,
        expectedContextVersion: request.expectedContextVersion,
        idempotencyKey,
        answer: schema.type === 'RELATIONAL_UPDATE' ? { mode: 'UPDATE', entityId: schema.entityId, values } : values,
        sensitiveDataConfirmed: request.sensitivity === 'FINANCIAL' || request.sensitivity === 'SECURITY' ? sensitiveDataConfirmed : undefined,
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

function RecentAskSessions({ items, loading, openingId, onOpen }: {
  items: AskRecentSessionSummary[];
  loading: boolean;
  openingId: string | null;
  onOpen: (session: AskRecentSessionSummary) => void;
}) {
  if (loading) return <p className="mt-7 text-xs text-slate-400" role="status">Loading recent Ask Cozy sessions…</p>;
  if (!items.length) return null;
  return (
    <section className="mt-8" aria-labelledby="ask-recent-sessions-title">
      <div className="flex items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Continue a recent conversation</p><h2 id="ask-recent-sessions-title" className="mt-1 text-lg font-semibold text-slate-950">Recent Ask Cozy sessions</h2></div>
        <p className="text-xs text-slate-500">Last 7 days · Up to 5</p>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((session) => (
          <li key={session.sessionId}>
            <button type="button" disabled={Boolean(openingId)} onClick={() => onOpen(session)} className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-teal-300 hover:shadow-md disabled:opacity-60">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><MessageCircle className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{session.title}</span><span className="mt-1 block text-xs text-slate-500">{new Date(session.lastActiveAt).toLocaleString()} · {recentSessionStatus(session.latestStatus)} · {session.executionCount} {session.executionCount === 1 ? 'question' : 'questions'}</span></span>
              <span className="shrink-0 text-xs font-semibold text-teal-700">{openingId === session.sessionId ? 'Opening…' : 'Open'}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
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
  const [openingRecentSessionId, setOpeningRecentSessionId] = useState<string | null>(null);
  const [recentSessionsEpoch, setRecentSessionsEpoch] = useState(0);
  // Marks the execution whose pending card should receive focus: set right
  // after a turn this session actually produced (a new question answered,
  // or an existing execution advancing after a capture/clarification/
  // confirmation), never on the initial history load or a resumed session
  // read -- so restoring old conversation state on page load doesn't yank
  // focus away from wherever the user actually is.
  const [justUpdatedExecutionId, setJustUpdatedExecutionId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeSessionRef = useRef('');
  const activeSessionPropertyRef = useRef<string | undefined>(undefined);
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

  useEffect(() => { onPendingStateChange?.(hasPendingWork); }, [hasPendingWork, onPendingStateChange]);

  useEffect(() => { activeSessionRef.current = sessionId; }, [sessionId]);

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
    if (propertyMismatch || !selectedPropertyId) return;
    const controller = new AbortController();
    setRecentSessionsLoading(true);
    api.getRecentAskSessions(selectedPropertyId, { signal: controller.signal })
      .then((response) => {
        const items = response.success && response.data ? response.data.items : [];
        setRecentSessions(Array.isArray(items) ? items : []);
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
          setRecentSessions([]);
          if (askServiceIsPaused(caught)) setServiceUnavailable(true);
        }
      })
      .finally(() => { if (!controller.signal.aborted) setRecentSessionsLoading(false); });
    return () => controller.abort();
  }, [selectedPropertyId, propertyMismatch, availabilityEpoch, recentSessionsEpoch]);

  useEffect(() => {
    if (propertyMismatch) return;
    const controller = new AbortController();
    const explicitSession = initialSessionId.trim();
    const continuingActiveSession = !explicitSession
      && Boolean(activeSessionRef.current)
      && activeSessionPropertyRef.current === selectedPropertyId;
    const nextSession = explicitSession || (continuingActiveSession ? activeSessionRef.current : '') || newId();
    activeSessionRef.current = nextSession;
    activeSessionPropertyRef.current = selectedPropertyId;
    setSessionId(nextSession);
    setInput(initialQuestion || window.localStorage.getItem(draftStorageKey(selectedPropertyId)) || '');
    setExecutions([]);
    setHistoryLoading(Boolean(explicitSession || continuingActiveSession));
    if (!explicitSession && !continuingActiveSession) {
      setHistoryLoading(false);
      return () => controller.abort();
    }
    api.getAskSession(nextSession, { signal: controller.signal })
      .then((response) => {
        const loaded = 'data' in response ? response.data?.executions ?? [] : [];
        setExecutions(loaded);
        if (initialExecutionId && loaded.some((execution) => execution.executionId === initialExecutionId)) {
          window.setTimeout(() => document.getElementById(`ask-execution-${initialExecutionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
        }
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
          setExecutions([]);
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
    if (!initialQuestion) return;
    setInput(initialQuestion);
    window.localStorage.setItem(draftStorageKey(selectedPropertyId), initialQuestion);
  }, [initialQuestion, selectedPropertyId]);

  useEffect(() => {
    if (loading) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [loading]);
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
    setInput('');
    window.localStorage.removeItem(draftStorageKey(selectedPropertyId));
    setError(null);
    setLoading(true);
    try {
      // Launch surface/capability describe how Ask was *opened* (e.g. from
      // the warranties page), so they only apply to the conversation's
      // first message — a later follow-up isn't an entry-point event.
      const isFirstMessage = executions.length === 0;
      const response = await api.createAskExecution({
        clientRequestId: newId(), sessionId, message, propertyId: selectedPropertyId ?? null,
        launchContext: {
          surface: (isFirstMessage && launchSurface) || (mode === 'page' ? 'ASK_PAGE' : 'GLOBAL_LAUNCHER'),
          capabilityId: promptContext?.capabilityId ?? (isFirstMessage && launchCapabilityId ? launchCapabilityId : undefined),
          entityType: promptContext?.entityType,
          entityId: promptContext?.entityId,
          actionId: promptContext?.actionId,
          returnTo: safeBackTo || null,
        },
      });
      if (!response.success || !response.data) throw new Error(response.message || 'Ask could not complete that request.');
      setExecutions((current) => [...current, response.data!]);
      setJustUpdatedExecutionId(response.data.executionId);
      if (attribution) track('ask_prompt_outcome', {
        propertyId: selectedPropertyId ?? null,
        ...attribution,
        executionId: response.data.executionId,
        operationId: response.data.operation?.id,
        status: response.data.status,
        succeeded: !response.data.status.startsWith('FAILED'),
      });
    } catch (caught) {
      setInput(message);
      window.localStorage.setItem(draftStorageKey(selectedPropertyId), message);
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
      const nextSession = newId();
      activeSessionRef.current = nextSession;
      activeSessionPropertyRef.current = selectedPropertyId;
      setSessionId(nextSession); setExecutions([]); setConfirmClear(false);
      setRecentSessionsEpoch((current) => current + 1);
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
    window.localStorage.removeItem(draftStorageKey(selectedPropertyId));
    setRecentSessionsEpoch((current) => current + 1);
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
      activeSessionRef.current = recent.sessionId;
      activeSessionPropertyRef.current = recent.property.id;
      setSessionId(recent.sessionId);
      setExecutions(history.data.executions);
      setJustUpdatedExecutionId(null);
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

  const updateExecution = (updated: AskExecutionResponse) => {
    activeSessionRef.current = updated.sessionId;
    activeSessionPropertyRef.current = updated.property?.id ?? selectedPropertyId;
    setExecutions((current) => current.map((item) => item.executionId === updated.executionId ? updated : item));
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
  const visibleRecentSessions = recentSessions.filter((item) => item.sessionId !== sessionId);
  const personalizedFeaturedPrompts = concierge.view ? visibleConciergeFeaturedPrompts(concierge.view) : [];
  const usingFallbackPrompts = personalizedFeaturedPrompts.length === 0;
  const featuredPrompts = usingFallbackPrompts ? fallbackPrompts : personalizedFeaturedPrompts;
  const latestExecutionId = executions.at(-1)?.executionId ?? '';
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
        <textarea ref={textareaRef} value={input} onChange={(event) => { setInput(event.target.value); window.localStorage.setItem(draftStorageKey(selectedPropertyId), event.target.value); }} onKeyDown={keyDown} onCompositionStart={() => { isComposingRef.current = true; }} onCompositionEnd={() => { isComposingRef.current = false; }} rows={placement === 'hero' ? 2 : 1} maxLength={4000} placeholder="Ask anything about your home…" className={cn('max-h-32 flex-1 resize-none bg-transparent px-2 text-slate-900 outline-none placeholder:text-slate-400', placement === 'hero' ? 'min-h-14 py-3 text-base' : 'min-h-10 py-2 text-sm')} />
        <button type="submit" disabled={!input.trim() || loading || !sessionId} aria-label="Send question" className={cn('grid shrink-0 place-items-center rounded-2xl bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40', placement === 'hero' ? 'h-12 w-12' : 'h-10 w-10 rounded-xl')}><Send className="h-4 w-4" /></button>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-400"><span>Enter to send · Shift+Enter for a new line</span><span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Record-based when available</span></div>
    </form>
  );

  return (
    <div className={cn('flex min-h-0 flex-col', mode === 'page' ? 'min-h-[calc(100dvh-9rem)] bg-transparent' : 'h-full bg-slate-50')}>
      {mode === 'page' && safeBackTo && (
        <Link href={safeBackTo} className="mb-2 inline-flex w-fit min-h-10 items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />{initialBackLabel}
        </Link>
      )}
      {/* Safe-area padding only changes anything on the mobile full-screen
          sheet (mode="panel" below the lg breakpoint, where this header sits
          flush against the device's actual top edge/notch); env() resolves
          to 0 on the desktop floating panel and the dashboard-embedded page
          view, so it's harmless to apply unconditionally rather than
          threading a separate "is this the mobile sheet" signal through. */}
      <header className={cn('flex items-center justify-between', mode === 'page' ? 'px-1 pb-5 pt-1 sm:pb-7 sm:pt-3' : 'border-b border-slate-200 bg-white px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-5')}>
        <div className="min-w-0"><div className="flex items-center gap-3"><span className={cn('grid place-items-center bg-teal-700 text-white', mode === 'page' ? 'h-11 w-11 rounded-2xl' : 'h-9 w-9 rounded-xl')}><Sparkles className={mode === 'page' ? 'h-5 w-5' : 'h-4 w-4'} /></span><div>{mode === 'page' ? <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Ask Cozy</h1> : <h2 className="font-semibold text-slate-950">Ask Cozy</h2>}<p className={cn('truncate text-slate-500', mode === 'page' ? 'mt-1 text-sm' : 'text-xs')}>{scopeLabel}</p></div></div></div>
        <div className="flex items-center gap-1">
          {mode === 'page' && executions.length > 0 && !askUnavailable && <><button type="button" aria-label="New Ask Cozy session" onClick={startNewSession} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50"><Sparkles className="h-4 w-4" /><span className="hidden sm:inline">New conversation</span></button><button type="button" aria-label="Clear history" onClick={() => setConfirmClear(true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"><Trash2 className="h-4 w-4" /><span className="hidden md:inline">Clear history</span></button></>}
          {mode === 'panel' && <Link href={fullWorkspaceHref} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50"><Maximize2 className="h-4 w-4" />Full workspace</Link>}
          {onClose && <button onClick={onClose} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Close</button>}
        </div>
      </header>

      {confirmClear && !askUnavailable && <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><span className="flex-1">Clear this Ask conversation and its feedback? Home records and artifacts created through Ask will remain unchanged.</span><button type="button" disabled={loading} onClick={() => void clearHistory()} className="min-h-10 rounded-xl bg-red-700 px-3 font-semibold text-white">Clear conversation</button><button type="button" disabled={loading} onClick={() => setConfirmClear(false)} className="min-h-10 rounded-xl px-3 font-semibold">Keep it</button></div>}

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{askUnavailable ? 'Ask Cozy is temporarily unavailable. Your saved data is unchanged.' : loading ? 'Ask is checking your home record.' : error ? `Ask error: ${error}` : executions.length ? `Ask response updated. Latest status: ${executions[executions.length - 1].status.toLowerCase().replace(/_/g, ' ')}.` : 'Ask is ready.'}</div>
      <main className={cn('min-h-0 flex-1 overflow-y-auto', mode === 'page' ? 'px-1 pb-8' : 'px-4 py-5 sm:px-5')}>
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
            <RecentAskSessions items={visibleRecentSessions} loading={recentSessionsLoading} openingId={openingRecentSessionId} onOpen={(recent) => void openRecentSession(recent)} />
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
            {executions.map((execution) => {
              const askReturnHref = buildAskWorkspaceHref({ propertyId: selectedPropertyId, sessionId: execution.sessionId, executionId: execution.executionId, backTo: safeBackTo });
              const visibleSuggestions = execution.suggestions.filter((suggestion) => !askedQuestionKeys.has(askSuggestionKey(suggestion)));
              return <AskActionReturnContext.Provider key={execution.executionId} value={askReturnHref}>
              <article id={`ask-execution-${execution.executionId}`} className="scroll-mt-28 space-y-3 lg:scroll-mt-32">
                <div className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-3 text-sm leading-6 text-white">{execution.question}</div>
                <div className="space-y-3 rounded-3xl border border-slate-200 bg-white/60 p-3 shadow-sm sm:p-4">
                  <h2 className="flex items-center gap-2 text-xs font-semibold text-teal-800"><Sparkles className="h-3.5 w-3.5" />Cozy response{execution.property ? ` · ${execution.property.label}` : ''}</h2>
                  {execution.blocks.map((block) => <BlockView key={block.id} block={block} executionId={execution.executionId} />)}
                  {execution.status === 'NEEDS_PROPERTY' && <PropertySelectionCard executionId={execution.executionId} onCompleted={updateExecution} autoFocus={execution.executionId === justUpdatedExecutionId} />}
                  {execution.correctionCapabilities.retryResponse && <div><button type="button" disabled={loading} onClick={() => void ask(execution.question)} className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Try again with current records</button></div>}
                  {execution.captureRequests.map((request, index) => <InlineCaptureCard key={request.requirementId} executionId={execution.executionId} request={request} onCompleted={updateExecution} autoFocus={index === 0 && execution.executionId === justUpdatedExecutionId} />)}
                  {execution.clarification && <ClarificationCard executionId={execution.executionId} clarification={execution.clarification} onCompleted={updateExecution} autoFocus={execution.executionId === justUpdatedExecutionId} />}
                  {execution.confirmation && <ConfirmationCard executionId={execution.executionId} confirmation={execution.confirmation} onCompleted={updateExecution} autoFocus={execution.executionId === justUpdatedExecutionId} />}
                  {execution.skillHandoff && (() => {
                    const handoffPrompt = execution.skillHandoff.suggestedGoal.replace(/[-_]+/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
                    return <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Suggested next step</p><button type="button" onClick={() => { setInput(handoffPrompt); window.localStorage.setItem(draftStorageKey(selectedPropertyId), handoffPrompt); textareaRef.current?.focus(); }} className="mt-2 min-h-10 rounded-xl border border-teal-300 bg-white px-3 py-2 text-left text-sm font-semibold text-teal-900 hover:border-teal-500">{handoffPrompt}</button><p className="mt-2 text-xs text-teal-800">Ask will check access, availability, and current home context again before continuing.</p></div>;
                  })()}
                  {visibleSuggestions.length > 0 && <div className="flex flex-wrap gap-2 pt-1">{visibleSuggestions.map((suggestion) => <button key={suggestion} onClick={() => { setInput(suggestion); window.localStorage.setItem(draftStorageKey(selectedPropertyId), suggestion); }} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-teal-300 hover:text-teal-800">{suggestion}</button>)}</div>}
                  <ExecutionFeedback executionId={execution.executionId} propertyId={execution.property?.id} capabilities={execution.correctionCapabilities} />
                </div>
              </article>
              </AskActionReturnContext.Provider>;
            })}
            {loading && <div className="flex items-center gap-3 rounded-2xl border border-teal-100 bg-white p-4 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin text-teal-700" />Checking your home record…</div>}
            <div ref={endRef} />
          </div>
        )}
      </main>

      {executions.length > 0 && !askUnavailable && <footer className={cn('sticky bottom-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:p-4', mode === 'panel' && 'pb-[calc(env(safe-area-inset-bottom)+0.75rem)]')}>{renderComposer('footer')}</footer>}
    </div>
  );
}
