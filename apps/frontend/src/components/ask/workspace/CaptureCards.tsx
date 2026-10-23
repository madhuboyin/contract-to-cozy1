'use client';

import { FormEvent, Ref, useEffect, useId, useRef, useState } from 'react';
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
import { HomeContinuityCaptureField } from '../HomeContinuityCaptureField';
import { RecordEditor } from '../recordEditor/RecordEditor';
import { ACCESS_LOST_CODES, FOCUSABLE_SELECTOR, askFailureCode, captureDraftStorageKey, capturePolicy, confirmationAttemptStorageKey, newId, useAutoFocusFirstControl } from './support';

/** The one rule the warranty forms share: the expiration date must be after the start date (the server enforces it too). */
const warrantyDateOrder = (values: Record<string, string>): Record<string, string> => (
  values.startDate && values.expiryDate && values.expiryDate <= values.startDate ? { expiryDate: 'The expiration date must be after the start date.' } : {}
);

const hoaDuesPair = (values: Record<string, string>): Record<string, string> => {
  if (Boolean(values.duesAmount) === Boolean(values.duesFrequency)) return {};
  return values.duesAmount
    ? { duesFrequency: 'Choose how often these dues are paid.' }
    : { duesAmount: 'Enter the dues amount, or clear the payment frequency.' };
};

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
        {clarification.options.map((option) => <button key={option.operationId} type="button" disabled={saving || expired} onClick={() => void submitClarification(option.operationId)} className="min-h-11 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:border-indigo-400 disabled:opacity-50">{option.label}</button>)}
      </div>
      {clarification.allowFreeText && <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void submitClarification(); }}><input id={`ask-clarification-${executionId}`} name="clarificationDetail" value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={500} disabled={saving || expired} placeholder="Or add a specific detail…" aria-label="Clarification detail" className="min-h-11 flex-1 rounded-xl border border-indigo-200 bg-white px-3 text-sm text-slate-900" /><button type="submit" disabled={saving || expired || !answer.trim()} className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Continuing…' : 'Continue'}</button></form>}
      {expired && <p className="mt-3 text-sm text-amber-700">This clarification expired. Ask the question again to use current records.</p>}
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    </section>
  );
}

// Renders the input for one editable confirmation field, by its declared type.
export function EditableFieldInput({ field, value, onChange }: { field: AskConfirmationEditableField; value: string; onChange: (next: string) => void }) {
  const generatedId = useId();
  const inputId = `ask-confirm-${generatedId.replace(/:/g, '')}`;
  const inputName = `confirmation_${field.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field'}`;
  const base = 'rounded-lg border border-slate-300 px-2 py-1 text-sm';
  if (field.type === 'SELECT') {
    return (
      <select id={inputId} name={inputName} aria-label={field.label} value={value} onChange={(event) => onChange(event.target.value)} className={`min-h-9 ${base}`}>
        {!(field.options ?? []).some((option) => option.value === value) && <option value="" disabled>Choose…</option>}
        {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }
  if (field.type === 'TEXTAREA') {
    return <textarea id={inputId} name={inputName} aria-label={field.label} rows={4} maxLength={2000} value={value} onChange={(event) => onChange(event.target.value)} className={`w-full ${base}`} />;
  }
  if (field.type === 'MONEY') {
    return (
      <span className="inline-flex items-center gap-1">
        <span aria-hidden="true" className="text-slate-500">$</span>
        <input id={inputId} name={inputName} type="text" inputMode="decimal" maxLength={11} aria-label={field.label} value={value} onChange={(event) => onChange(event.target.value)} className={`min-h-9 w-32 ${base}`} />
      </span>
    );
  }
  return (
    <input
      id={inputId} name={inputName} type={field.type === 'TEXT' ? 'text' : 'date'} maxLength={field.type === 'TEXT' ? 160 : undefined} aria-label={field.label}
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
    // A field with no value yet (e.g. a reschedule with no date chosen) opens
    // straight into its picker instead of waiting for an "Edit" click.
    setEditingKey(confirmation.editableFields.find((field) => !field.value)?.key ?? null); setEditError(null);
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
          if (reconciled.data.status !== 'RUNNING' && reconciled.data.status !== 'OUTCOME_UNKNOWN') window.sessionStorage.removeItem(confirmationAttemptStorageKey(executionId, confirmation.version));
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
      <dl data-confirmation-fields="" className={cn('grid gap-x-5 sm:grid-cols-2', calm ? 'border-y border-slate-100' : 'mt-4 rounded-xl border border-violet-100 bg-white px-3')}>
        {confirmation.fields.map((field) => <div key={field.label} className="min-w-0 border-b border-slate-100 py-2.5 text-sm last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0"><dt className="text-xs text-slate-500">{field.label}</dt><dd className="mt-0.5 whitespace-pre-wrap font-medium text-slate-800">{field.value}</dd></div>)}
        {confirmation.editableFields.map((field) => (
          <div key={field.key} className="min-w-0 border-b border-slate-100 py-2.5 text-sm last:border-b-0 sm:col-span-2">
            <dt className="text-xs text-slate-500">{field.label}</dt>
            <dd className="mt-0.5">
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
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={!consent || saving || expired || Boolean(editingKey) || confirmation.editableFields.some((field) => !field.value)} onClick={() => void confirm()} className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Working…' : confirmation.confirmLabel}</button><button type="button" disabled={saving} onClick={() => void cancel()} className="min-h-11 rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-white">Cancel</button></div>
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
  propertyId,
}: {
  executionId: string;
  request: AskCaptureRequest;
  onCompleted: (execution: AskExecutionResponse) => void;
  autoFocus?: boolean;
  propertyId?: string;
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
  const [cancelling, setCancelling] = useState(false);
  const [idempotencyKey] = useState(newId);
  const [dismissed, setDismissed] = useState(false);
  const [sensitiveDataConfirmed, setSensitiveDataConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
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
            {activeCreateFields.map((field) => <CaptureFieldControl key={field.key} field={field} value={values[field.key]} disabled={saving} allowNotSure={request.allowNotSure} propertyId={propertyId} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />)}
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

  const compactEventAdd = schema.type === 'GROUP' && request.captureKey === 'CAPTURE_EVENT_ADD';
  // Work-item forms (snooze, due date, attach or remove evidence) can be abandoned before the review; nothing has been saved at this stage.
  const workItemForm = request.captureKey.startsWith('WORK_ITEM_');
  const compactWorkItemReschedule = schema.type === 'GROUP' && request.captureKey === 'WORK_ITEM_RESCHEDULE';
  const eventType = typeof values.type === 'string' ? values.type : null;
  const activeFields = fields.filter((field) => {
    if (!field.when) return true;
    const actual = values[field.when.fieldKey];
    return field.when.operator === 'EQUALS' ? actual === field.when.value : actual !== field.when.value;
  }).filter((field) => {
    if (!compactEventAdd || !eventType) return true;
    if (field.key === 'amount') return ['PURCHASE', 'REPAIR', 'MAINTENANCE', 'CLAIM', 'IMPROVEMENT', 'VALUE_UPDATE'].includes(eventType);
    if (field.key === 'providerName') return ['PURCHASE', 'REPAIR', 'MAINTENANCE', 'CLAIM', 'IMPROVEMENT', 'INSPECTION'].includes(eventType);
    return true;
  });
  const compactMaintenanceTask = schema.type === 'GROUP' && request.captureKey === 'MAINTENANCE_TASK_INPUTS';
  const compactInventoryCreate = schema.type === 'GROUP' && request.captureKey === 'INVENTORY_ITEM_CREATE_INPUTS';
  const compactInventoryCompletion = schema.type === 'GROUP' && request.captureKey === 'INVENTORY_ITEM_COMPLETE_DETAILS';
  const compactMaterialSpec = schema.type === 'GROUP' && request.captureKey === 'MATERIAL_SPEC_INPUTS';
  const compactPlantAdvisor = schema.type === 'GROUP' && request.captureKey === 'ROOM_PLANT_RECOMMENDATION_INPUTS';
  const compactOwnershipScenario = schema.type === 'GROUP' && request.captureKey === 'OWNERSHIP_COST_SCENARIO_INPUTS';
  const sellHoldRentAssumptions = schema.type === 'GROUP' && request.captureKey === 'sell-hold-rent-assumptions';
  const financingProfile = schema.type === 'GROUP' && request.captureKey === 'FINANCING_PROFILE_UPDATE';
  const decisionInputWorkflow = sellHoldRentAssumptions || financingProfile;
  const compactProjectCreate = schema.type === 'GROUP' && request.captureKey === 'PROJECT_TRACKER_CREATE_INPUTS';
  const compactProjectCommand = schema.type === 'GROUP' && request.captureKey === 'PROJECT_TRACKER_COMMAND_INPUTS';
  const compactContinuityPlan = schema.type === 'GROUP' && (request.captureKey === 'HOME_DIGITAL_WILL_EDITOR_INPUTS' || request.captureKey === 'HOME_DIGITAL_WILL_METADATA_INPUTS');
  const formGroups = schema.type === 'GROUP' ? schema.groups ?? [] : [];
  const activeGroup = formGroups[activeGroupIndex] ?? null;
  // Every structured workflow uses the shared compact field treatment. The
  // named flags below only own exceptional column spans; compactness itself is
  // structural, so a new tool cannot accidentally fall back to one padded
  // white card per field merely because its capture key was not added here.
  const compactWorkflow = schema.type === 'GROUP';
  const missingRequired = activeFields.some((field) => {
    if (!field.required) return false;
    const value = values[field.key];
    if (value === undefined || value === '') return true;
    if (value === null && !(field.inputSchema.type === 'BOOLEAN' && field.inputSchema.unknownLabel) && !request.allowNotSure) return true;
    if (field.inputSchema.type !== 'APPROXIMATE_DATE' || value === null) return false;
    if (typeof value !== 'object' || Array.isArray(value)) return true;
    const date = value as { precision?: string; value?: string; rangeEnd?: string };
    if (date.precision === 'UNKNOWN') return !request.allowNotSure;
    return !date.value || (date.precision === 'RANGE' && !date.rangeEnd);
  });
  const activeGroupFields = activeGroup ? activeFields.filter((field) => activeGroup.fieldKeys.includes(field.key)) : activeFields;
  const activeGroupMissingRequired = activeGroupFields.some((field) => {
    if (!field.required) return false;
    const value = values[field.key];
    if (value === undefined || value === '') return true;
    if (value === null && !(field.inputSchema.type === 'BOOLEAN' && field.inputSchema.unknownLabel) && !request.allowNotSure) return true;
    if (field.inputSchema.type !== 'APPROXIMATE_DATE' || value === null) return false;
    if (typeof value !== 'object' || Array.isArray(value)) return true;
    const date = value as { precision?: string; value?: string; rangeEnd?: string };
    return date.precision === 'UNKNOWN' ? !request.allowNotSure : !date.value || (date.precision === 'RANGE' && !date.rangeEnd);
  });
  const finalGroupActive = !activeGroup || activeGroupIndex === formGroups.length - 1;
  const recordedValues = request.currentAnswer && typeof request.currentAnswer === 'object' && !Array.isArray(request.currentAnswer)
    ? request.currentAnswer as Record<string, unknown>
    : {};
  const changedFieldCount = activeFields.filter((field) => JSON.stringify(values[field.key]) !== JSON.stringify(recordedValues[field.key])).length;
  const assumptionFieldByKey = new Map(activeFields.map((field) => [field.key, field]));
  const renderAssumptionRow = (key: string) => {
    const field = assumptionFieldByKey.get(key);
    if (!field) return null;
    const savedOverrideNote = field.helpText?.startsWith('Saved override') ? field.helpText : null;
    return <div key={key} className="flex min-w-0 items-center justify-between gap-4 rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="min-w-0"><p className="text-sm font-semibold text-slate-800">{field.label}</p>{savedOverrideNote && <p className="mt-0.5 text-xs text-slate-500">{savedOverrideNote}</p>}</div>
      <div className="shrink-0"><CaptureFieldControl field={field} value={values[field.key]} disabled={saving} allowNotSure={request.allowNotSure} bare dense propertyId={propertyId} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} /></div>
    </div>;
  };
  const renderFinancingRow = (key: string) => {
    const field = assumptionFieldByKey.get(key);
    if (!field) return null;
    return <div key={key} className="flex min-w-0 items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <p className="min-w-0 text-sm font-semibold text-slate-800">{field.label}</p>
      <div className="shrink-0"><CaptureFieldControl field={field} value={values[field.key]} disabled={saving} allowNotSure={request.allowNotSure} bare dense propertyId={propertyId} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} /></div>
    </div>;
  };
  const renderFinancingChoice = (key: string) => {
    const field = assumptionFieldByKey.get(key);
    if (!field) return null;
    return <section key={key} className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-2 text-sm font-semibold text-slate-800">{field.label}</p>
      <CaptureFieldControl field={field} value={values[field.key]} disabled={saving} allowNotSure={request.allowNotSure} bare dense propertyId={propertyId} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />
    </section>;
  };

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

  const cancelContinuityWorkflow = async () => {
    if (saving || cancelling) return;
    setCancelling(true);
    setError(null);
    try {
      const response = await api.cancelAskExecution(executionId);
      if (!response.success || !response.data) throw new Error(response.message || 'Could not cancel this workflow.');
      window.localStorage.removeItem(captureDraftStorageKey(executionId, request.requirementId));
      onCompleted(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not cancel this workflow.');
      setCancelling(false);
    }
  };

  // Shared RecordEditor (FRD v1.385): one existing record edited as a whole; the server sent the fields and the fresh values.
  if (request.editor) {
    const entered = request.currentAnswer && typeof request.currentAnswer === 'object' && !Array.isArray(request.currentAnswer)
      ? Object.fromEntries(Object.entries(request.currentAnswer as Record<string, unknown>).map(([key, value]) => [key, typeof value === 'string' ? value : ''])) as Record<string, string>
      : request.editor.original;
    const hoa = request.captureKey === 'HOA_ASSOCIATION';
    return <RecordEditor mode={request.editor.mode ?? (hoa && !request.editor.original.name ? 'add' : 'edit')} saveLabel={request.editor.saveLabel} editor={request.editor} initialValues={entered} crossFieldErrors={request.captureKey === 'WARRANTY_UPDATE_INPUTS' ? warrantyDateOrder : hoa ? hoaDuesPair : undefined} title={request.title} saving={saving} cancelling={cancelling} error={error} autoFocus={autoFocus}
      sensitiveConsent={request.sensitivity === 'FINANCIAL' || request.sensitivity === 'SECURITY' ? { checked: sensitiveDataConfirmed, label: 'I’m ready to review these financial details.', onChange: setSensitiveDataConfirmed } : undefined}
      onSubmit={(editorValues) => void save(null, false, editorValues)} onCancel={() => void cancelContinuityWorkflow()} />;
  }

  // Add a warranty (FRD v1.385): the same RecordEditor as Edit warranty, started empty, so the two forms cannot drift apart.
  if (schema.type === 'GROUP' && request.captureKey === 'CAPTURE_WARRANTY_EDIT') {
    const keyed = (key: string) => schema.fields.find((field) => field.key === key);
    const sectionOf: Record<string, string> = { providerName: 'warranty', category: 'warranty', policyNumber: 'warranty', coverageDetails: 'coverage', startDate: 'dates-cost', expiryDate: 'dates-cost', cost: 'dates-cost' };
    const kindOf = (field: { inputSchema: { type: string } }) => field.inputSchema.type === 'SINGLE_SELECT' ? 'SELECT' : field.inputSchema.type === 'LONG_TEXT' ? 'TEXTAREA' : field.inputSchema.type === 'APPROXIMATE_DATE' ? 'DATE' : field.inputSchema.type === 'MONEY' ? 'MONEY' : 'TEXT';
    const fields = ['providerName', 'category', 'policyNumber', 'coverageDetails', 'startDate', 'expiryDate', 'cost'].flatMap((key) => {
      const field = keyed(key);
      if (!field) return [];
      const inputSchema = field.inputSchema as { options?: Array<{ label: string; value: string }>; maxLength?: number };
      return [{
        key, label: field.label.replace(/ \(estimated\)$/, ''), kind: kindOf(field) as 'TEXT', section: sectionOf[key], required: field.required,
        ...(inputSchema.options ? { options: inputSchema.options } : {}), ...(inputSchema.maxLength ? { maxLength: inputSchema.maxLength } : {}),
        ...(field.helpText ? { helpText: field.helpText } : {}),
        ...(key === 'expiryDate' ? { pastDateNote: 'This date has already passed, so the warranty will show as expired.' } : {}),
      }];
    });
    const addEditor = {
      recordLabel: request.title, fields, original: Object.fromEntries(fields.map((field) => [field.key, ''])),
      sections: [{ id: 'warranty', title: 'Warranty' }, { id: 'coverage', title: 'Coverage' }, { id: 'dates-cost', title: 'Dates and cost' }],
    };
    const current = (request.currentAnswer ?? {}) as Record<string, unknown>;
    const initial = Object.fromEntries(fields.map((field) => {
      const raw = current[field.key];
      const text = raw && typeof raw === 'object' ? String((raw as { value?: unknown }).value ?? '') : raw === null || raw === undefined ? '' : String(raw);
      return [field.key, text];
    })) as Record<string, string>;
    const toAnswer = (entered: Record<string, string>) => ({
      ...entered,
      startDate: { precision: 'EXACT_DATE', value: entered.startDate }, expiryDate: { precision: 'EXACT_DATE', value: entered.expiryDate },
      cost: entered.cost ? Number(entered.cost) : null,
    });
    return <RecordEditor mode="add" editor={addEditor} initialValues={initial} title={request.title} saving={saving} cancelling={cancelling} error={error} autoFocus={autoFocus}
      crossFieldErrors={warrantyDateOrder} onSubmit={(entered) => void save(null, false, toAnswer(entered))} onCancel={() => void cancelContinuityWorkflow()} />;
  }

  // FRD §11.12 IW-CONV-004: a plain workflow group is asked one question at a time, then submitted as the same single request.
  if (calm && request.presentation !== 'FORM' && canAskConversationally(request) && schema.type === 'GROUP') {
    return <ConversationalCapture request={request} fields={schema.fields} values={values} saving={saving} error={error} autoFocus={autoFocus}
      onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))} onSubmit={(final) => void save(null, false, final)}
      onCancel={workItemForm ? () => void cancelContinuityWorkflow() : undefined} cancelling={cancelling} />;
  }

  return (
    <form ref={containerRef as unknown as Ref<HTMLFormElement>} onSubmit={save} className={cn('rounded-2xl border', decisionInputWorkflow ? cn('mx-auto mb-24 w-full border-slate-200 bg-white p-4 shadow-sm sm:p-5', sellHoldRentAssumptions ? 'max-w-[760px]' : 'max-w-[900px]') : compactContinuityPlan ? 'mx-auto w-full max-w-[820px] border-slate-200 bg-white p-4 shadow-sm sm:p-5' : compactPlantAdvisor ? 'mx-auto w-full max-w-[900px] border-slate-200 bg-white p-4 shadow-sm sm:p-5' : compactWorkItemReschedule ? 'mx-auto w-full max-w-[680px] border-sky-200 bg-sky-50/80 p-4 sm:p-5' : compactEventAdd ? 'border-slate-200 bg-white p-4 shadow-sm sm:p-5' : compactProjectCreate ? 'p-3 sm:p-4' : 'p-4', !decisionInputWorkflow && !compactContinuityPlan && !compactPlantAdvisor && !compactWorkItemReschedule && !compactEventAdd && policy.border)} aria-busy={saving || cancelling} aria-label={request.title} data-home-continuity-capture={compactContinuityPlan ? '' : undefined} data-work-item-reschedule={compactWorkItemReschedule ? '' : undefined} data-decision-input-workflow={decisionInputWorkflow ? request.captureKey : undefined}>
      {compactWorkItemReschedule ? (
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-950">{request.title}</h3>
          <p className="mt-1 text-sm font-medium text-slate-700">{request.question}</p>
          {request.helpText && <p className="mt-1 text-xs text-slate-500">{request.helpText}</p>}
          {request.destinationLabel && <p className="mt-2 text-xs font-medium text-sky-900">{request.destinationLabel}.</p>}
        </div>
      ) : compactEventAdd || compactProjectCreate ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className={compactEventAdd ? 'text-lg font-semibold tracking-tight text-slate-950' : 'text-sm font-semibold text-slate-950'}>{compactEventAdd ? 'Add a timeline event' : 'Project setup'}</p>
          <p className="text-xs leading-4 text-slate-600">{compactEventAdd ? 'Nothing is saved until you review and confirm.' : 'Add the essentials and one real milestone. You’ll review before anything is created.'}</p>
        </div>
      ) : compactPlantAdvisor ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-teal-700">Plant preferences</p><h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{request.title}</h3><p className="mt-1 text-sm text-slate-600">Choose the room conditions Cozy should use. You’ll review everything before recommendations are updated.</p></div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">Room-specific</span>
        </div>
      ) : compactContinuityPlan ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-teal-700">Home Continuity Plan</p><h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{request.title}</h3><p className="mt-1 text-sm text-slate-500">Nothing is saved until you review and confirm.</p></div>
          {activeGroup && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Step {activeGroupIndex + 1} of {formGroups.length}</span>}
        </div>
      ) : decisionInputWorkflow ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-teal-700">{financingProfile ? 'Recorded financing' : 'Planning assumptions'}</p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{request.title}</h3>
            <p className="mt-1 text-sm leading-5 text-slate-600">{request.helpText}</p>
          </div>
          <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', changedFieldCount ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600')}>{changedFieldCount ? `${changedFieldCount} changed` : 'No changes yet'}</span>
        </div>
      ) : (
        <>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-800">{policy.eyebrow}</p>
          <h3 className="mt-1 font-semibold text-slate-950">{request.title}</h3>
          <p className="mt-1 text-sm leading-5 text-slate-700">{request.question}</p>
          {request.helpText && <p className="mt-1 text-xs leading-5 text-slate-500">{request.helpText}</p>}
          {policy.note && <p className="mt-2 text-xs font-semibold leading-5 text-slate-700">{policy.note}</p>}
          {request.destinationLabel && <p className="mt-2 text-xs font-medium text-sky-900">{request.classification === 'WORKFLOW_INPUT' ? `${request.destinationLabel}.` : `${request.destinationLabel} after you continue.`}</p>}
        </>
      )}
      <div className={sellHoldRentAssumptions || financingProfile ? 'mt-4' : compactEventAdd || compactProjectCreate ? 'mt-3 grid gap-x-3 gap-y-2.5 md:grid-cols-6' : compactInventoryCompletion ? 'mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3' : compactWorkItemReschedule ? 'mt-4 max-w-md' : compactWorkflow ? 'mt-4 grid gap-3 md:grid-cols-2' : 'mt-4 space-y-4'} data-compact-capture={sellHoldRentAssumptions ? 'sell-hold-rent-assumptions' : financingProfile ? 'financing-profile' : compactContinuityPlan ? 'home-continuity-plan' : compactMaintenanceTask ? 'maintenance-task' : compactInventoryCreate ? 'inventory-item-create' : compactInventoryCompletion ? 'inventory-item-completion' : compactMaterialSpec ? 'material-spec' : compactPlantAdvisor ? 'plant-advisor' : compactOwnershipScenario ? 'ownership-cost-scenario' : compactEventAdd ? 'timeline-event' : compactProjectCreate ? 'project-create' : compactProjectCommand ? 'project-command' : compactWorkItemReschedule ? 'work-item-reschedule' : undefined}>
        {activeGroup && <div className={compactProjectCreate || compactEventAdd ? 'md:col-span-6' : 'md:col-span-2'}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div><p className="text-sm font-semibold text-slate-950">{activeGroup.title}</p>{activeGroup.description && <p className="mt-0.5 text-xs text-slate-500">{activeGroup.description}</p>}</div>
            {!compactContinuityPlan && <span className="shrink-0 text-xs font-semibold text-slate-500">Step {activeGroupIndex + 1} of {formGroups.length}</span>}
          </div>
          <ol className={cn('flex', compactContinuityPlan ? 'gap-3 border-b border-slate-100 pb-3' : 'gap-1')} aria-label="Completion form progress">{formGroups.map((group, index) => <li key={group.id} aria-current={index === activeGroupIndex ? 'step' : undefined} className={cn(compactContinuityPlan ? 'flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold' : 'h-1.5 flex-1 rounded-full', compactContinuityPlan ? index === activeGroupIndex ? 'text-teal-800' : index < activeGroupIndex ? 'text-slate-700' : 'text-slate-400' : index <= activeGroupIndex ? 'bg-teal-700' : 'bg-slate-200')}><span className={compactContinuityPlan ? cn('grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px]', index <= activeGroupIndex ? 'bg-teal-700 text-white' : 'bg-slate-200 text-slate-500') : 'sr-only'}>{compactContinuityPlan ? index + 1 : group.title}</span>{compactContinuityPlan && <span className="truncate">{group.title}</span>}</li>)}</ol>
        </div>}
        {sellHoldRentAssumptions ? <div className="space-y-3">
          <section aria-labelledby={`assumptions-property-${executionId}`} className="rounded-2xl border border-slate-200 p-3">
            <div className="mb-2"><h4 id={`assumptions-property-${executionId}`} className="text-sm font-semibold text-slate-950">Property and rent</h4><p className="mt-0.5 text-xs text-slate-500">Blank values continue using the model defaults from the comparison.</p></div>
            <div className="grid gap-2 sm:grid-cols-2">{renderAssumptionRow('homeValueNow')}{renderAssumptionRow('monthlyRentNow')}</div>
          </section>
          <div className="grid gap-3 md:grid-cols-2">
            <section aria-labelledby={`assumptions-growth-${executionId}`} className="rounded-2xl border border-slate-200 p-3">
              <h4 id={`assumptions-growth-${executionId}`} className="mb-2 text-sm font-semibold text-slate-950">Growth</h4>
              <div className="space-y-2">{renderAssumptionRow('appreciationPct')}{renderAssumptionRow('rentGrowthPct')}</div>
            </section>
            <section aria-labelledby={`assumptions-costs-${executionId}`} className="rounded-2xl border border-slate-200 p-3">
              <h4 id={`assumptions-costs-${executionId}`} className="mb-2 text-sm font-semibold text-slate-950">Selling and rental costs</h4>
              <div className="space-y-2">{renderAssumptionRow('sellingCostPct')}{renderAssumptionRow('vacancyPct')}{renderAssumptionRow('managementPct')}</div>
            </section>
          </div>
          {assumptionFieldByKey.has('resetAll') && <section className="rounded-2xl border border-dashed border-slate-200 p-3"><CaptureFieldControl field={assumptionFieldByKey.get('resetAll')!} value={values.resetAll} disabled={saving} compact propertyId={propertyId} onChange={(value) => setValues((current) => ({ ...current, resetAll: value }))} /></section>}
        </div> : financingProfile ? <div className="space-y-3">
          {activeGroupIndex === 0 && <>
            {renderFinancingChoice('mortgageStatus')}
            <div className="grid gap-2 md:grid-cols-2">{renderFinancingRow('purchasePrice')}{renderFinancingRow('purchaseDate')}</div>
          </>}
          {activeGroupIndex === 1 && <>
            {renderFinancingChoice('mortgageType')}
            <div className="grid gap-2 md:grid-cols-2">{['originalBalance', 'currentBalance', 'balanceAsOf', 'ratePct', 'remainingYears', 'monthlyPayment'].map(renderFinancingRow)}</div>
          </>}
          {activeGroupIndex === 2 && <>
            <div className="grid gap-2 md:grid-cols-2">{renderFinancingChoice('hasSecondMortgage')}{renderFinancingChoice('hasPMI')}</div>
            {renderFinancingRow('secondBalance')}
          </>}
        </div> : activeGroupFields.map((field, fieldIndex) => {
          const inventoryCreateFullWidth = compactInventoryCreate && (field.key === 'name' || field.key === 'category');
          const fullWidth = compactMaintenanceTask
            ? field.key === 'title' || field.key === 'description'
            : inventoryCreateFullWidth
              || (compactMaterialSpec && ['category', 'label', 'roomId', 'supplier', 'notes'].includes(field.key))
              || (compactPlantAdvisor && ['goals', 'notes'].includes(field.key))
              || (compactOwnershipScenario && field.key === 'name')
              || (sellHoldRentAssumptions && field.key === 'resetAll')
              || (financingProfile && ['mortgageStatus', 'mortgageType'].includes(field.key))
              || (compactEventAdd && ['title', 'type', 'summary'].includes(field.key))
              || (compactProjectCreate && field.key === 'projectType')
              || (compactContinuityPlan && (['content', 'summary', 'notes', 'targetSectionId'].includes(field.key) || (request.requirementId.includes('entry') && field.key === 'title')))
              || (compactProjectCommand && (field.inputSchema.type === 'LONG_TEXT' || (field.inputSchema.type === 'SINGLE_SELECT' && field.inputSchema.options.length > 3)));
          const fieldLayout = compactEventAdd
            ? fullWidth ? 'md:col-span-6' : 'md:col-span-2'
            : compactProjectCreate
              ? fullWidth ? 'md:col-span-6'
                : ['name', 'fulfillmentMode', 'contractorName', 'permitApplicability', 'permitApplicabilityBasis', 'hoaApplicability', 'hoaApplicabilityBasis'].includes(field.key) ? 'md:col-span-3'
                  : field.key === 'initialMilestoneName' ? 'md:col-span-4' : 'md:col-span-2'
            : fullWidth ? 'md:col-span-2' : undefined;
          const assumptionsSection = sellHoldRentAssumptions
            ? field.key === 'homeValueNow' ? 'Property and rent' : field.key === 'appreciationPct' ? 'Growth assumptions' : field.key === 'sellingCostPct' ? 'Selling and rental costs' : field.key === 'resetAll' ? 'Defaults' : null
            : null;
          return <div key={field.key} className={fieldLayout}>
            {assumptionsSection && <div className={cn('mb-2', fieldIndex > 0 && 'mt-2', field.key !== 'resetAll' && 'md:col-span-2')}><p className="text-sm font-semibold text-slate-950">{assumptionsSection}</p>{field.key === 'homeValueNow' && <p className="mt-0.5 text-xs text-slate-500">Use values for the planning case you want to compare.</p>}</div>}
            {compactContinuityPlan ? <HomeContinuityCaptureField field={field} value={values[field.key]} disabled={saving || cancelling} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} /> : <CaptureFieldControl field={field} value={values[field.key]} disabled={saving} allowNotSure={request.allowNotSure} compact={compactWorkflow} dense={decisionInputWorkflow} propertyId={propertyId} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />}
          </div>;
        })}
      </div>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      {(request.sensitivity === 'FINANCIAL' || request.sensitivity === 'SECURITY') && (!compactContinuityPlan || finalGroupActive) && (!financingProfile || finalGroupActive) && (
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-sky-200 bg-white p-3 text-sm text-slate-700">
          <input type="checkbox" checked={sensitiveDataConfirmed} onChange={(event) => setSensitiveDataConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700" />
          <span>{request.confirmationText ?? 'I confirm this information can be saved to the home record.'}</span>
        </label>
      )}
      <div className={cn('flex flex-wrap items-center gap-2', (decisionInputWorkflow || compactContinuityPlan || compactPlantAdvisor || compactEventAdd || workItemForm) && 'mt-4 justify-between border-t border-slate-100 pt-4', !decisionInputWorkflow && !compactContinuityPlan && !compactPlantAdvisor && !compactEventAdd && !workItemForm && (compactProjectCreate ? 'mt-3' : 'mt-4'))}>
        {(decisionInputWorkflow || compactContinuityPlan || compactPlantAdvisor || compactEventAdd || workItemForm) && <button type="button" disabled={saving || cancelling} onClick={() => void cancelContinuityWorkflow()} className="min-h-11 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">{cancelling ? 'Cancelling…' : decisionInputWorkflow ? 'Back to comparison' : 'Cancel'}</button>}
        <div className="flex flex-wrap gap-2">
        {activeGroupIndex > 0 && <button type="button" disabled={saving} onClick={() => setActiveGroupIndex((index) => Math.max(0, index - 1))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Previous</button>}
        {activeGroup && activeGroupIndex < formGroups.length - 1
          ? <button type="button" disabled={saving || activeGroupMissingRequired} onClick={() => setActiveGroupIndex((index) => Math.min(formGroups.length - 1, index + 1))} className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Next: {formGroups[activeGroupIndex + 1].title}</button>
          : <button type="submit" disabled={saving || missingRequired || ((request.sensitivity === 'FINANCIAL' || request.sensitivity === 'SECURITY') && !sensitiveDataConfirmed)} className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{saving ? 'Saving…' : compactWorkItemReschedule ? 'Review change' : request.classification === 'WORKFLOW_INPUT' ? 'Continue to review' : 'Save and update answer'}</button>}
        {request.skippable && <button type="button" disabled={saving} onClick={(event) => void save(event as unknown as FormEvent, true)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Skip for now</button>}
        {request.classification === 'ENHANCEMENT_ACCURACY' && <button type="button" disabled={saving} onClick={() => { window.localStorage.removeItem(captureDraftStorageKey(executionId, request.requirementId)); setDismissed(true); void api.recordAskCaptureEvent(executionId, { requirementId: request.requirementId, captureKey: request.captureKey, event: 'DISMISSED' }).catch(() => undefined); }} className="min-h-11 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white">Use general estimate</button>}
        {request.fallbackHref && <AskContextLink href={request.fallbackHref} onClick={() => void api.recordAskCaptureEvent(executionId, { requirementId: request.requirementId, captureKey: request.captureKey, event: 'FULL_FORM_OPENED' }).catch(() => undefined)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Open full form <ExternalLink className="h-4 w-4" /></AskContextLink>}
        {compactContinuityPlan && activeGroup && activeGroupIndex < formGroups.length - 1 && activeGroupMissingRequired && <p className="basis-full text-right text-xs font-medium text-amber-700">Complete the required fields to continue.</p>}
        {compactEventAdd && missingRequired && <p className="basis-full text-right text-xs font-medium text-amber-700">Add a title, choose a type, and enter when it happened.</p>}
        </div>
      </div>
    </form>
  );
}
