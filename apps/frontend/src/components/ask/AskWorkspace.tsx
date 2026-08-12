'use client';

import Link from 'next/link';
import { FormEvent, KeyboardEvent, Ref, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, BellRing, CheckCircle2, Clock3, ExternalLink, Home, Loader2, Maximize2, Send, Sparkles, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { cn } from '@/lib/utils';
import type { AskAction, AskCaptureRequest, AskClarification, AskConfirmation, AskExecutionResponse, AskPendingWorkItem, AskPresentationBlock } from '@/features/ask/types';
import { CaptureFieldControl } from '@/components/property-context/CaptureFieldControl';

const starterQuestions = [
  'What maintenance tasks are pending?',
  'Which items are missing coverage?',
  'Is there a tool to help me refinance?',
  'Where could I save money on this home?',
];

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

function sessionStorageKey(propertyId?: string): string {
  return `ctc:ask-session:v2:${propertyId ?? 'general'}`;
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

function ActionLink({ action }: { action: AskAction }) {
  if (!action.href) return null;
  return (
    <Link
      href={action.href}
      className={cn(
        'inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
        action.style === 'PRIMARY' ? 'bg-teal-700 text-white hover:bg-teal-800' : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
      )}
    >
      {action.label}<ArrowRight className="h-4 w-4" />
    </Link>
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
    : <Link href={capability.href} className={className}>{content}</Link>;
}

function BlockView({ block }: { block: AskPresentationBlock }) {
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
                  {section.items.map((item) => (
                    <li key={item.id} className="rounded-xl bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {item.href ? <Link className="font-medium text-slate-950 hover:text-teal-700" href={item.href}>{item.title}</Link> : <p className="font-medium text-slate-950">{item.title}</p>}
                          {item.description && <p className="mt-1 text-sm leading-5 text-slate-600">{item.description}</p>}
                          {item.meta.length > 0 && <p className="mt-2 text-xs text-slate-500">{item.meta.join(' · ')}</p>}
                        </div>
                        {item.status && <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.status.replace(/_/g, ' ')}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {section.count > section.items.length && (
                block.actions[0]?.href
                  ? <Link href={block.actions[0].href} className="mt-3 inline-block text-sm font-semibold text-teal-700 hover:underline">+{section.count - section.items.length} more · {block.actions[0].label}</Link>
                  : <p className="mt-3 text-sm text-slate-500">+{section.count - section.items.length} more not shown here.</p>
              )}
            </div>
          ))}
        </div>
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
          <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-950">{block.title}</h3><span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">{block.status}</span></div><p className="mt-1 text-sm leading-5 text-slate-700">{block.description}</p></div>
        </div>
        <dl className="mt-4 divide-y divide-teal-100 rounded-xl border border-teal-100 bg-white px-3">{block.details.map((detail) => <div key={detail.label} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[9rem_1fr]"><dt className="text-slate-500">{detail.label}</dt><dd className="font-medium text-slate-800">{detail.value}</dd></div>)}</dl>
        {block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
      </section>
    );
  }

  if (block.type === 'METRIC_ROW') return <section className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="font-semibold text-slate-950">{block.title}</h3>{block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}<dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{block.metrics.map((metric) => <div key={metric.label} className={cn('rounded-xl border p-3', metric.tone === 'POSITIVE' ? 'border-emerald-200 bg-emerald-50' : metric.tone === 'CAUTION' ? 'border-amber-200 bg-amber-50' : metric.tone === 'CRITICAL' ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50')}><dt className="text-xs text-slate-500">{metric.label}</dt><dd className="mt-1 text-lg font-semibold text-slate-950">{metric.value}</dd>{metric.detail && <p className="mt-1 text-xs text-slate-600">{metric.detail}</p>}</div>)}</dl></section>;

  if (block.type === 'TIMELINE') return <section className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="font-semibold text-slate-950">{block.title}</h3>{block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}<ol className="mt-4 border-l-2 border-teal-200 pl-4">{block.items.map((item) => <li key={item.id} className="relative pb-4 before:absolute before:-left-[1.34rem] before:top-1 before:h-2.5 before:w-2.5 before:rounded-full before:bg-teal-700"><div className="flex flex-wrap items-center gap-2">{item.href ? <Link href={item.href} className="font-semibold text-slate-900 hover:text-teal-700">{item.label}</Link> : <span className="font-semibold text-slate-900">{item.label}</span>}{item.date && <span className="text-xs text-slate-500">{item.date}</span>}{item.status && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{item.status}</span>}</div>{item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}</li>)}</ol></section>;

  if (block.type === 'COMPARISON') return <section className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="font-semibold text-slate-950">{block.title}</h3>{block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}<div className="mt-4 grid gap-3 sm:grid-cols-2">{block.options.map((option) => <div key={option.id} className="rounded-xl border border-slate-200 p-3"><h4 className="font-semibold text-slate-900">{option.label}</h4>{option.summary && <p className="mt-1 text-sm text-slate-600">{option.summary}</p>}<dl className="mt-3 space-y-2">{option.attributes.map((attribute) => <div key={attribute.label} className="flex justify-between gap-3 text-sm"><dt className="text-slate-500">{attribute.label}</dt><dd className="text-right font-medium text-slate-800">{attribute.value}</dd></div>)}</dl></div>)}</div>{block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}</section>;

  if (block.type === 'DECISION_TRACE') return <details className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold text-slate-900">{block.title}</summary><ol className="mt-3 space-y-3">{block.steps.map((step, index) => <li key={`${step.label}-${index}`} className="text-sm"><p className="font-medium text-slate-800">{index + 1}. {step.label}</p><p className="mt-1 text-slate-600">{step.detail}</p>{step.outcome && <p className="mt-1 text-xs font-semibold text-teal-700">{step.outcome}</p>}</li>)}</ol></details>;

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
          ? <Link href={block.actions[0].href} className="mt-3 inline-block text-sm font-semibold text-teal-700 hover:underline">+{block.totalCount - block.rows.length} more · {block.actions[0].label}</Link>
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
      window.localStorage.setItem(sessionStorageKey(propertyId), response.data.sessionId);
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
        {request.fallbackHref && <Link href={request.fallbackHref} onClick={() => void api.recordAskCaptureEvent(executionId, { requirementId: request.requirementId, captureKey: request.captureKey, event: 'FULL_FORM_OPENED' }).catch(() => undefined)} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-800 hover:underline">Open full form instead <ExternalLink className="h-4 w-4" /></Link>}
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
        {request.fallbackHref && <Link href={request.fallbackHref} onClick={() => void api.recordAskCaptureEvent(executionId, { requirementId: request.requirementId, captureKey: request.captureKey, event: 'FULL_FORM_OPENED' }).catch(() => undefined)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Open full form <ExternalLink className="h-4 w-4" /></Link>}
      </div>
    </form>
  );
}

function ExecutionFeedback({ executionId, propertyId }: { executionId: string; propertyId?: string }) {
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
  const correctHomeRecord = async () => {
    setCorrecting(true); setError(null);
    try {
      const response = await api.requestAskCorrection(executionId, 'HOME_RECORD');
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
        {propertyId && <button type="button" disabled={correcting} onClick={() => void correctHomeRecord()} className="ml-auto font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-50">{correcting ? 'Opening…' : 'Correct home information'}</button>}
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

function PendingWorkInbox({ items, loadingId, onResume }: { items: AskPendingWorkItem[]; loadingId: string | null; onResume: (item: AskPendingWorkItem) => void }) {
  if (!items.length) return null;
  return (
    <section className="mx-auto mb-6 max-w-3xl rounded-2xl border border-indigo-200 bg-indigo-50/80 p-4" aria-labelledby="ask-pending-title">
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-700 text-white"><Clock3 className="h-5 w-5" /></span><div><h2 id="ask-pending-title" className="font-semibold text-slate-950">Continue where you left off</h2><p className="mt-1 text-sm text-slate-600">Pending requests for this home are stored securely with your account and can be resumed on another device.</p></div></div>
      <ul className="mt-4 space-y-2">{items.map((item) => <li key={item.execution.executionId} className="flex flex-col gap-3 rounded-xl border border-indigo-100 bg-white p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{item.execution.question}</p><p className="mt-1 text-xs text-slate-500">{item.pendingKind.toLowerCase().replace(/_/g, ' ')} · Updated {new Date(item.execution.updatedAt).toLocaleString()}</p></div><button type="button" disabled={Boolean(loadingId)} onClick={() => onResume(item)} className="min-h-10 shrink-0 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loadingId === item.execution.executionId ? 'Opening…' : item.actionLabel}</button></li>)}</ul>
    </section>
  );
}

export function AskWorkspace({ mode = 'page', onClose, onPendingStateChange, initialQuestion = '', initialSessionId = '', initialExecutionId = '', initialPropertyId = '', launchSurface = '', launchCapabilityId = '' }: { mode?: 'page' | 'panel'; onClose?: () => void; onPendingStateChange?: (pending: boolean) => void; initialQuestion?: string; initialSessionId?: string; initialExecutionId?: string; initialPropertyId?: string; launchSurface?: string; launchCapabilityId?: string }) {
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
  // Marks the execution whose pending card should receive focus: set right
  // after a turn this session actually produced (a new question answered,
  // or an existing execution advancing after a capture/clarification/
  // confirmation), never on the initial history load or a resumed session
  // read -- so restoring old conversation state on page load doesn't yank
  // focus away from wherever the user actually is.
  const [justUpdatedExecutionId, setJustUpdatedExecutionId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasPendingWork = loading || Boolean(input.trim()) || executions.some((execution) => ['NEEDS_ENTITY', 'NEEDS_CLARIFICATION', 'NEEDS_CONTEXT', 'NEEDS_CONFIRMATION', 'RUNNING'].includes(execution.status));

  useEffect(() => { onPendingStateChange?.(hasPendingWork); }, [hasPendingWork, onPendingStateChange]);

  useEffect(() => {
    if (propertyMismatch) return;
    const controller = new AbortController();
    setPendingLoading(true);
    api.getAskPendingWork(selectedPropertyId, { signal: controller.signal })
      .then((response) => setPendingWork(response.success && response.data ? response.data.items : []))
      .catch((caught) => { if (!(caught instanceof DOMException && caught.name === 'AbortError')) setPendingWork([]); })
      .finally(() => { if (!controller.signal.aborted) setPendingLoading(false); });
    return () => controller.abort();
  }, [selectedPropertyId, propertyMismatch]);

  useEffect(() => {
    if (propertyMismatch) return;
    const controller = new AbortController();
    const key = sessionStorageKey(selectedPropertyId);
    let nextSession = initialSessionId.trim() || window.localStorage.getItem(key);
    if (!nextSession) {
      nextSession = newId();
    }
    window.localStorage.setItem(key, nextSession);
    setSessionId(nextSession);
    setInput(initialQuestion || window.localStorage.getItem(draftStorageKey(selectedPropertyId)) || '');
    setExecutions([]);
    setHistoryLoading(true);
    api.getAskSession(nextSession, { signal: controller.signal })
      .then((response) => {
        const loaded = 'data' in response ? response.data?.executions ?? [] : [];
        setExecutions(loaded);
        if (initialExecutionId && loaded.some((execution) => execution.executionId === initialExecutionId)) {
          window.setTimeout(() => document.getElementById(`ask-execution-${initialExecutionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
        }
      })
      .catch((caught) => { if (!(caught instanceof DOMException && caught.name === 'AbortError')) setExecutions([]); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [selectedPropertyId, initialQuestion, initialSessionId, initialExecutionId, propertyMismatch]);

  useEffect(() => {
    if (!initialQuestion) return;
    setInput(initialQuestion);
    window.localStorage.setItem(draftStorageKey(selectedPropertyId), initialQuestion);
  }, [initialQuestion, selectedPropertyId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [executions, loading]);
  useEffect(() => { if (mode === 'panel') window.setTimeout(() => textareaRef.current?.focus(), 80); }, [mode]);

  const scopeLabel = useMemo(() => selectedPropertyId ? 'Using the selected home record' : 'General home guidance', [selectedPropertyId]);

  const ask = async (question: string) => {
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
          capabilityId: isFirstMessage && launchCapabilityId ? launchCapabilityId : undefined,
          returnTo: window.location.pathname,
        },
      });
      if (!response.success || !response.data) throw new Error(response.message || 'Ask could not complete that request.');
      setExecutions((current) => [...current, response.data!]);
      setJustUpdatedExecutionId(response.data.executionId);
    } catch (caught) {
      setInput(message);
      window.localStorage.setItem(draftStorageKey(selectedPropertyId), message);
      setError(caught instanceof Error ? caught.message : 'Ask is temporarily unavailable.');
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
      window.localStorage.setItem(sessionStorageKey(selectedPropertyId), nextSession);
      setSessionId(nextSession); setExecutions([]); setConfirmClear(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not clear Ask history.');
    } finally { setLoading(false); }
  };

  const updateExecution = (updated: AskExecutionResponse) => {
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
      window.localStorage.setItem(sessionStorageKey(selectedPropertyId), resumed.sessionId);
      setSessionId(resumed.sessionId); setHistoryLoading(true);
      const history = await api.getAskSession(resumed.sessionId);
      if (!history.success || !history.data) throw new Error(history.message || 'Could not load the pending conversation.');
      setExecutions(history.data.executions);
      setJustUpdatedExecutionId(resumed.executionId);
      setPendingWork((current) => current.filter((pending) => pending.execution.sessionId !== resumed.sessionId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not resume this request.');
    } finally { setHistoryLoading(false); setContinuingId(null); }
  };

  const visiblePendingWork = pendingWork.filter((item) => item.execution.sessionId !== sessionId);

  return (
    <div className={cn('flex min-h-0 flex-col bg-slate-50', mode === 'page' ? 'min-h-[calc(100vh-11rem)] rounded-[28px] border border-slate-200 shadow-sm' : 'h-full')}>
      {/* Safe-area padding only changes anything on the mobile full-screen
          sheet (mode="panel" below the lg breakpoint, where this header sits
          flush against the device's actual top edge/notch); env() resolves
          to 0 on the desktop floating panel and the dashboard-embedded page
          view, so it's harmless to apply unconditionally rather than
          threading a separate "is this the mobile sheet" signal through. */}
      <header className={cn('flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-5', mode === 'panel' && 'pt-[calc(env(safe-area-inset-top)+0.75rem)]')}>
        <div className="min-w-0"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-700 text-white"><Sparkles className="h-4 w-4" /></span><div><h2 className="font-semibold text-slate-950">Ask Cozy</h2><p className="truncate text-xs text-slate-500">{scopeLabel}</p></div></div></div>
        <div className="flex items-center gap-1">
          {mode === 'page' && executions.length > 0 && <button type="button" onClick={() => setConfirmClear(true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"><Trash2 className="h-4 w-4" />Clear history</button>}
          {mode === 'panel' && <Link href="/dashboard/ask" onClick={onClose} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50"><Maximize2 className="h-4 w-4" />Full workspace</Link>}
          {onClose && <button onClick={onClose} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Close</button>}
        </div>
      </header>

      {confirmClear && <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><span className="flex-1">Clear this Ask conversation and its feedback? Home records and artifacts created through Ask will remain unchanged.</span><button type="button" disabled={loading} onClick={() => void clearHistory()} className="min-h-10 rounded-xl bg-red-700 px-3 font-semibold text-white">Clear conversation</button><button type="button" disabled={loading} onClick={() => setConfirmClear(false)} className="min-h-10 rounded-xl px-3 font-semibold">Keep it</button></div>}

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{loading ? 'Ask is checking your home record.' : error ? `Ask error: ${error}` : executions.length ? `Ask response updated. Latest status: ${executions[executions.length - 1].status.toLowerCase().replace(/_/g, ' ')}.` : 'Ask is ready.'}</div>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        {!historyLoading && <PendingWorkInbox items={visiblePendingWork} loadingId={continuingId} onResume={(item) => void resumePendingWork(item)} />}
        {pendingLoading && !historyLoading && <p className="mx-auto mb-3 max-w-3xl text-xs text-slate-400" role="status">Checking for pending Ask requests…</p>}
        {historyLoading ? <div className="flex h-32 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading conversation</div> : executions.length === 0 ? (
          <div className="mx-auto max-w-xl py-8 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal-100 text-teal-800"><Home className="h-6 w-6" /></div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">What can I help with?</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Ask about records, maintenance, protection, costs, decisions, projects, or tools available for your home.</p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">{starterQuestions.map((question) => <button key={question} onClick={() => void ask(question)} className="rounded-2xl border border-slate-200 bg-white p-3 text-left text-sm font-medium text-slate-700 shadow-sm transition hover:border-teal-300 hover:text-teal-800">{question}</button>)}</div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-7">
            {executions.map((execution) => (
              <article id={`ask-execution-${execution.executionId}`} key={execution.executionId} className="scroll-mt-6 space-y-3">
                <div className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-3 text-sm leading-6 text-white">{execution.question}</div>
                <div className="space-y-3 rounded-3xl border border-slate-200 bg-white/60 p-3 shadow-sm sm:p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-teal-800"><Sparkles className="h-3.5 w-3.5" />Cozy response{execution.property ? ` · ${execution.property.label}` : ''}</div>
                  {execution.blocks.map((block) => <BlockView key={block.id} block={block} />)}
                  {execution.status === 'NEEDS_PROPERTY' && <PropertySelectionCard executionId={execution.executionId} onCompleted={updateExecution} autoFocus={execution.executionId === justUpdatedExecutionId} />}
                  {execution.status === 'FAILED_RETRYABLE' && <div><button type="button" disabled={loading} onClick={() => void ask(execution.question)} className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Try again</button></div>}
                  {execution.captureRequests.map((request, index) => <InlineCaptureCard key={request.requirementId} executionId={execution.executionId} request={request} onCompleted={updateExecution} autoFocus={index === 0 && execution.executionId === justUpdatedExecutionId} />)}
                  {execution.clarification && <ClarificationCard executionId={execution.executionId} clarification={execution.clarification} onCompleted={updateExecution} autoFocus={execution.executionId === justUpdatedExecutionId} />}
                  {execution.confirmation && <ConfirmationCard executionId={execution.executionId} confirmation={execution.confirmation} onCompleted={updateExecution} autoFocus={execution.executionId === justUpdatedExecutionId} />}
                  {execution.suggestions.length > 0 && <div className="flex flex-wrap gap-2 pt-1">{execution.suggestions.map((suggestion) => <button key={suggestion} onClick={() => { setInput(suggestion); window.localStorage.setItem(draftStorageKey(selectedPropertyId), suggestion); }} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-teal-300 hover:text-teal-800">{suggestion}</button>)}</div>}
                  <ExecutionFeedback executionId={execution.executionId} propertyId={execution.property?.id} />
                </div>
              </article>
            ))}
            {loading && <div className="flex items-center gap-3 rounded-2xl border border-teal-100 bg-white p-4 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin text-teal-700" />Checking your home record…</div>}
            <div ref={endRef} />
          </div>
        )}
      </main>

      <footer className={cn('border-t border-slate-200 bg-white p-3 sm:p-4', mode === 'panel' && 'pb-[calc(env(safe-area-inset-bottom)+0.75rem)]')}>
        <form onSubmit={submit} className="mx-auto max-w-3xl">
          {error && <div className="mb-2 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700"><AlertTriangle className="h-4 w-4" />{error}</div>}
          <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
            <textarea ref={textareaRef} value={input} onChange={(event) => { setInput(event.target.value); window.localStorage.setItem(draftStorageKey(selectedPropertyId), event.target.value); }} onKeyDown={keyDown} onCompositionStart={() => { isComposingRef.current = true; }} onCompositionEnd={() => { isComposingRef.current = false; }} rows={1} maxLength={4000} placeholder="Ask anything about your home…" className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400" />
            <button type="submit" disabled={!input.trim() || loading || !sessionId} aria-label="Send question" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" /></button>
          </div>
          <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-slate-400"><span>Enter to send · Shift+Enter for a new line</span><span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Record-based when available</span></div>
        </form>
      </footer>
    </div>
  );
}
