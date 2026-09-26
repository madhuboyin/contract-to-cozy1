'use client';

import { FormEvent, Ref, useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { cn } from '@/lib/utils';
import type { AskCaptureRequest, AskClarification, AskConfirmation, AskConfirmationEditableField, AskExecutionResponse } from '@/features/ask/types';
import { CaptureFieldControl } from '@/components/property-context/CaptureFieldControl';
import { useCalmAnswers } from '@/features/ask/calmAnswers';
import { canAskConversationally } from '@/features/ask/conversationalCapture';
import { ConversationalCapture } from '../calm/ConversationalCapture';
import { AskContextLink } from '../blocks/context';
import { ACCESS_LOST_CODES, FOCUSABLE_SELECTOR, askFailureCode, captureDraftStorageKey, capturePolicy, confirmationAttemptStorageKey, newId, useAutoFocusFirstControl } from './support';

export function PropertySelectionCard({ executionId, onCompleted, autoFocus = false }: { executionId: string; onCompleted: (execution: AskExecutionResponse) => void; autoFocus?: boolean }) {
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

export function ClarificationCard({ executionId, clarification, onCompleted, autoFocus = false }: { executionId: string; clarification: AskClarification; onCompleted: (execution: AskExecutionResponse) => void; autoFocus?: boolean }) {
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
export function EditableFieldInput({ field, value, onChange }: { field: AskConfirmationEditableField; value: string; onChange: (next: string) => void }) {
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
export function editableFieldDisplay(field: AskConfirmationEditableField, value: string): string {
  if (!value) return 'Not set';
  if (field.type === 'SELECT') return field.options?.find((option) => option.value === value)?.label ?? value;
  if (field.type === 'MONEY') return `$${value}`;
  return value;
}

export function ConfirmationCard({ executionId, confirmation, onCompleted, autoFocus = false, onAccessLost }: { executionId: string; confirmation: AskConfirmation; onCompleted: (execution: AskExecutionResponse) => void; autoFocus?: boolean; onAccessLost: () => void }) {
  const calm = useCalmAnswers();
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
    <section ref={containerRef} data-conversational-review={calm ? '' : undefined} className={calm ? 'space-y-3' : 'rounded-2xl border border-violet-200 bg-violet-50/70 p-4'}>
      {!calm && <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-800">Confirmation required</p>}
      {/* ACUI-005: the stage in plain words. The consent box and the confirm button below are the "Confirm" step. */}
      {calm && <p className="text-xs font-medium text-slate-500" data-conversational-stage="review">Review · nothing is saved until you confirm</p>}
      <h3 className={calm ? 'text-[17px] font-medium leading-snug text-slate-900' : 'mt-1 font-semibold text-slate-950'}>{confirmation.title}</h3><p className={calm ? 'text-sm leading-5 text-slate-600' : 'mt-1 text-sm leading-5 text-slate-700'}>{confirmation.description}</p>
      <dl className={calm ? 'divide-y divide-slate-100 border-y border-slate-100' : 'mt-4 divide-y divide-violet-100 rounded-xl border border-violet-100 bg-white px-3'}>
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
      <label className={calm ? 'flex cursor-pointer items-start gap-3 text-sm text-slate-600' : 'mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-violet-200 bg-white p-3 text-sm text-slate-700'}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 h-4 w-4" /><span>{confirmation.consentText}</span></label>
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
export function PendingOutcomeCard({ executionId, confirmationVersion, onCompleted, onAccessLost }: { executionId: string; confirmationVersion: number; onCompleted: (execution: AskExecutionResponse) => void; onAccessLost: () => void }) {
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
  // ACUI-005: the outcome is reconciled, never re-offered as a second execution. Calm wording is shorter; the safeguard is the same.
  const calm = useCalmAnswers();
  if (calm) return (
    <section data-calm-outcome-unknown="" className="space-y-2 border-l-2 border-amber-300 pl-3">
      <p className="text-xs font-medium text-slate-500">Outcome not yet known</p>
      <p className="text-sm leading-5 text-slate-700">This may still be running, or it may have finished. Checking picks up the result and will not apply it twice.</p>
      <button type="button" disabled={checking} onClick={() => void check()} className="min-h-10 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{checking ? 'Checking…' : 'Check status'}</button>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </section>
  );
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">Outcome not yet known</p>
      <p className="mt-1 text-sm leading-5 text-slate-700">This action is still being processed. Checking will safely pick up its result if it already finished, or resume it if the previous attempt was interrupted -- it will not apply the action twice.</p>
      <button type="button" disabled={checking} onClick={() => void check()} className="mt-3 min-h-10 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{checking ? 'Checking…' : 'Check status'}</button>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    </section>
  );
}

export function InlineCaptureCard({
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
  const calm = useCalmAnswers();
  const containerRef = useAutoFocusFirstControl<HTMLElement>(autoFocus && !calm);
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
  const save = async (event: FormEvent | null, skipping = false, override?: Record<string, unknown>) => {
    event?.preventDefault();
    if (saving || (missingRequired && !skipping && !override)) return;
    setSaving(true);
    setError(null);
    try {
      const response = await api.submitAskCapture(executionId, {
        requirementId: request.requirementId,
        captureKey: request.captureKey,
        expectedContextVersion: request.expectedContextVersion,
        idempotencyKey,
        answer: skipping ? { $skip: true } : schema.type === 'RELATIONAL_UPDATE' ? { mode: 'UPDATE', entityId: schema.entityId, values } : override ?? values,
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

  // FRD §11.12 IW-CONV-004: a plain workflow group is asked one question at a time, then submitted as the same single request.
  if (calm && canAskConversationally(request) && schema.type === 'GROUP') {
    return <ConversationalCapture request={request} fields={schema.fields} values={values} saving={saving} error={error} autoFocus={autoFocus}
      onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))} onSubmit={(final) => void save(null, false, final)} />;
  }

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
