'use client';

import Link from 'next/link';
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, BellRing, CheckCircle2, ExternalLink, Home, Loader2, Send, Sparkles } from 'lucide-react';
import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { cn } from '@/lib/utils';
import type { AskAction, AskCaptureRequest, AskConfirmation, AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

const starterQuestions = [
  'What maintenance tasks are pending?',
  'Which items are missing coverage?',
  'Is there a tool to help me refinance?',
  'Where could I save money on this home?',
];

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sessionStorageKey(propertyId?: string): string {
  return `ctc:ask-session:v2:${propertyId ?? 'general'}`;
}

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
          <Link key={capability.id} href={capability.href} className="group block rounded-2xl border border-teal-100 bg-teal-50/60 p-4 transition hover:border-teal-300 hover:bg-teal-50">
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-semibold text-slate-950">{capability.label}</p><p className="mt-1 text-sm leading-5 text-slate-600">{capability.description}</p></div>
              <ExternalLink className="h-4 w-4 shrink-0 text-teal-700" />
            </div>
            <p className="mt-3 text-xs font-medium text-teal-800">You’ll get: {capability.expectedOutput}</p>
            {capability.readiness === 'NEEDS_PROPERTY' && <p className="mt-2 text-xs text-amber-700">Select a home before opening this tool.</p>}
          </Link>
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

  return (
    <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      <table className="mt-3 min-w-full text-left text-sm"><thead><tr>{block.columns.map((column) => <th key={column.key} className="border-b px-2 py-2 text-xs text-slate-500">{column.label}</th>)}</tr></thead><tbody>{block.rows.map((row) => <tr key={row.id}>{block.columns.map((column) => <td key={column.key} className="border-b border-slate-100 px-2 py-2 text-slate-700">{row.values[column.key]}</td>)}</tr>)}</tbody></table>
    </section>
  );
}

function ConfirmationCard({ executionId, confirmation, onCompleted }: { executionId: string; confirmation: AskConfirmation; onCompleted: (execution: AskExecutionResponse) => void }) {
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(newId);
  const expired = new Date(confirmation.expiresAt) <= new Date();

  const confirm = async () => {
    if (!consent || saving || expired) return;
    setSaving(true); setError(null);
    try {
      const response = await api.confirmAskExecution(executionId, { confirmationVersion: confirmation.version, idempotencyKey, consentConfirmed: true });
      if (!response.success || !response.data) throw new Error(response.message || 'Could not start this monitor.');
      onCompleted(response.data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not start this monitor.'); }
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
    <section className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
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
}: {
  executionId: string;
  request: AskCaptureRequest;
  onCompleted: (execution: AskExecutionResponse) => void;
}) {
  const schema = request.inputSchema;
  const [values, setValues] = useState<Record<string, unknown>>(
    schema.type === 'RELATIONAL_UPDATE'
      ? schema.currentValues
      : request.currentAnswer && typeof request.currentAnswer === 'object' && !Array.isArray(request.currentAnswer)
        ? request.currentAnswer as Record<string, unknown>
        : {},
  );
  const [saving, setSaving] = useState(false);
  const [idempotencyKey] = useState(newId);
  const [dismissed, setDismissed] = useState(false);
  const [sensitiveDataConfirmed, setSensitiveDataConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (dismissed) return null;
  if (schema.type !== 'RELATIONAL_UPDATE' && schema.type !== 'GROUP') return null;

  const fields = schema.fields;

  const activeFields = fields.filter((field) => {
    if (!field.when) return true;
    const actual = values[field.when.fieldKey];
    return field.when.operator === 'EQUALS' ? actual === field.when.value : actual !== field.when.value;
  });
  const missingRequired = activeFields.some((field) => {
    if (!field.required) return false;
    const value = values[field.key];
    return value === undefined || value === null || value === '';
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
      onCompleted(response.data);
      window.dispatchEvent(new CustomEvent('property-context:updated', {
        detail: { contextVersion: response.data.contextVersion },
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this home detail.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4" aria-busy={saving}>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-800">Improve this answer</p>
      <h3 className="mt-1 font-semibold text-slate-950">{request.title}</h3>
      <p className="mt-1 text-sm leading-5 text-slate-700">{request.question}</p>
      {request.helpText && <p className="mt-1 text-xs leading-5 text-slate-500">{request.helpText}</p>}
      <p className="mt-2 text-xs font-medium text-sky-900">{request.sensitivity === 'FINANCIAL' ? 'Saved to this home’s Financing Profile' : 'Saved to this item’s Home Record'} after you select “Save and update answer.”</p>
      <div className="mt-4 space-y-4">
        {activeFields.map((field) => (
          <fieldset key={field.key}>
            <legend className="text-sm font-semibold text-slate-800">{field.label}{field.required ? ' *' : ''}</legend>
            {field.helpText && <p className="mt-0.5 text-xs text-slate-500">{field.helpText}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {field.inputSchema.type === 'SINGLE_SELECT' && field.inputSchema.options.map((option) => (
                <button key={option.value} type="button" aria-pressed={values[field.key] === option.value} onClick={() => setValues((current) => ({ ...current, [field.key]: option.value }))} className={cn('min-h-10 rounded-xl border px-3 py-2 text-sm font-medium', values[field.key] === option.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700')}>
                  {option.label}
                </button>
              ))}
              {field.inputSchema.type === 'SHORT_TEXT' && (
                <input
                  type={/date|installedOn|purchasedOn/i.test(field.key) ? 'date' : 'text'}
                  maxLength={field.inputSchema.maxLength}
                  value={typeof values[field.key] === 'string' ? values[field.key] as string : ''}
                  onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value || undefined }))}
                  className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 sm:max-w-xs"
                />
              )}
              {(field.inputSchema.type === 'INTEGER' || field.inputSchema.type === 'DECIMAL') && (
                <label className="flex items-center gap-2">
                  <input type="number" min={field.inputSchema.min} max={field.inputSchema.max} step={field.inputSchema.type === 'INTEGER' ? 1 : 'any'} value={typeof values[field.key] === 'number' ? values[field.key] as number : ''} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value === '' ? undefined : Number(event.target.value) }))} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
                  {field.inputSchema.unit && <span className="text-xs font-medium text-slate-500">{field.inputSchema.unit}</span>}
                </label>
              )}
            </div>
          </fieldset>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      {(request.sensitivity === 'FINANCIAL' || request.sensitivity === 'SECURITY') && (
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-sky-200 bg-white p-3 text-sm text-slate-700">
          <input type="checkbox" checked={sensitiveDataConfirmed} onChange={(event) => setSensitiveDataConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700" />
          <span>{request.confirmationText ?? 'I confirm this information can be saved to the home record.'}</span>
        </label>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={saving || missingRequired || ((request.sensitivity === 'FINANCIAL' || request.sensitivity === 'SECURITY') && !sensitiveDataConfirmed)} className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{saving ? 'Saving and updating…' : 'Save and update answer'}</button>
        {request.classification === 'ENHANCEMENT_ACCURACY' && <button type="button" disabled={saving} onClick={() => setDismissed(true)} className="min-h-11 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white">Use general estimate</button>}
      </div>
    </form>
  );
}

export function AskWorkspace({ mode = 'page', onClose }: { mode?: 'page' | 'panel'; onClose?: () => void }) {
  const { selectedPropertyId } = usePropertyContext();
  const [sessionId, setSessionId] = useState('');
  const [executions, setExecutions] = useState<AskExecutionResponse[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const key = sessionStorageKey(selectedPropertyId);
    let nextSession = window.localStorage.getItem(key);
    if (!nextSession) {
      nextSession = newId();
      window.localStorage.setItem(key, nextSession);
    }
    setSessionId(nextSession);
    setExecutions([]);
    setHistoryLoading(true);
    api.getAskSession(nextSession)
      .then((response) => setExecutions('data' in response ? response.data?.executions ?? [] : []))
      .catch(() => setExecutions([]))
      .finally(() => setHistoryLoading(false));
  }, [selectedPropertyId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [executions, loading]);
  useEffect(() => { if (mode === 'panel') window.setTimeout(() => textareaRef.current?.focus(), 80); }, [mode]);

  const scopeLabel = useMemo(() => selectedPropertyId ? 'Using the selected home record' : 'General home guidance', [selectedPropertyId]);

  const ask = async (question: string) => {
    const message = question.trim();
    if (!message || !sessionId || loading) return;
    setInput('');
    setError(null);
    setLoading(true);
    try {
      const response = await api.createAskExecution({
        clientRequestId: newId(), sessionId, message, propertyId: selectedPropertyId ?? null,
        launchContext: { surface: mode === 'page' ? 'ASK_PAGE' : 'GLOBAL_LAUNCHER', returnTo: window.location.pathname },
      });
      if (!response.success || !response.data) throw new Error(response.message || 'Ask could not complete that request.');
      setExecutions((current) => [...current, response.data!]);
    } catch (caught) {
      setInput(message);
      setError(caught instanceof Error ? caught.message : 'Ask is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  };

  const submit = (event: FormEvent) => { event.preventDefault(); void ask(input); };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask(input); }
  };

  return (
    <div className={cn('flex min-h-0 flex-col bg-slate-50', mode === 'page' ? 'min-h-[calc(100vh-11rem)] rounded-[28px] border border-slate-200 shadow-sm' : 'h-full')}>
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="min-w-0"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-700 text-white"><Sparkles className="h-4 w-4" /></span><div><h2 className="font-semibold text-slate-950">Ask Cozy</h2><p className="truncate text-xs text-slate-500">{scopeLabel}</p></div></div></div>
        {onClose && <button onClick={onClose} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Close</button>}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5" aria-live="polite">
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
              <article key={execution.executionId} className="space-y-3">
                <div className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-3 text-sm leading-6 text-white">{execution.question}</div>
                <div className="space-y-3 rounded-3xl border border-slate-200 bg-white/60 p-3 shadow-sm sm:p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-teal-800"><Sparkles className="h-3.5 w-3.5" />Cozy response{execution.property ? ` · ${execution.property.label}` : ''}</div>
                  {execution.blocks.map((block) => <BlockView key={block.id} block={block} />)}
                  {execution.captureRequests.map((request) => <InlineCaptureCard key={request.requirementId} executionId={execution.executionId} request={request} onCompleted={(updated) => setExecutions((current) => current.map((item) => item.executionId === updated.executionId ? updated : item))} />)}
                  {execution.confirmation && <ConfirmationCard executionId={execution.executionId} confirmation={execution.confirmation} onCompleted={(updated) => setExecutions((current) => current.map((item) => item.executionId === updated.executionId ? updated : item))} />}
                  {execution.suggestions.length > 0 && <div className="flex flex-wrap gap-2 pt-1">{execution.suggestions.map((suggestion) => <button key={suggestion} onClick={() => setInput(suggestion)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-teal-300 hover:text-teal-800">{suggestion}</button>)}</div>}
                </div>
              </article>
            ))}
            {loading && <div className="flex items-center gap-3 rounded-2xl border border-teal-100 bg-white p-4 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin text-teal-700" />Checking your home record…</div>}
            <div ref={endRef} />
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white p-3 sm:p-4">
        <form onSubmit={submit} className="mx-auto max-w-3xl">
          {error && <div className="mb-2 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700"><AlertTriangle className="h-4 w-4" />{error}</div>}
          <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
            <textarea ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={keyDown} rows={1} maxLength={4000} placeholder="Ask anything about your home…" className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400" />
            <button type="submit" disabled={!input.trim() || loading || !sessionId} aria-label="Send question" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" /></button>
          </div>
          <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-slate-400"><span>Enter to send · Shift+Enter for a new line</span><span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Record-based when available</span></div>
        </form>
      </footer>
    </div>
  );
}
