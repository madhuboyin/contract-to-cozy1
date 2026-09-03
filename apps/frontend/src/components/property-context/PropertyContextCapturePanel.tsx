'use client';

import { useEffect, useId, useState } from 'react';
import type { FeatureContextCaptureResult, FeatureContextEvaluation } from './featureContextTypes';
import { CaptureFieldControl } from './CaptureFieldControl';
import { useFeatureContextCapture } from './useFeatureContextCapture';

export function PropertyContextCapturePanel({
  propertyId,
  featureKey,
  operationKey,
  operationInput,
  onReady,
  onCaptured,
  onDefer,
  deferLabel = 'Remind me later',
  surface = 'default',
}: {
  propertyId: string;
  featureKey: string;
  operationKey: string;
  operationInput?: Record<string, unknown>;
  onReady?: (evaluation: FeatureContextEvaluation) => void | Promise<void>;
  onCaptured?: (result: FeatureContextCaptureResult) => void | Promise<void>;
  onDefer?: () => void | Promise<void>;
  deferLabel?: string;
  surface?: 'default' | 'drawer';
}) {
  const { evaluation, loading, slow, saving, error, capture, reevaluate, suppressedRequirementId } = useFeatureContextCapture({
    propertyId,
    featureKey,
    operationKey,
    operationInput,
    onReady,
    onCaptured,
  });
  const [draft, setDraft] = useState<string>('');
  const [selected, setSelected] = useState<string[]>([]);
  const [groupDraft, setGroupDraft] = useState<Record<string, unknown>>({});
  const [relationalMode, setRelationalMode] = useState<'SELECT' | 'CREATE'>('SELECT');
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [deferring, setDeferring] = useState(false);
  const [deferError, setDeferError] = useState<string | null>(null);
  const headingId = useId();
  const activeRequirement = evaluation?.requirements[0];
  const defer = async () => {
    if (!onDefer) return;
    setDeferring(true);
    setDeferError(null);
    try {
      await onDefer();
    } catch (caught) {
      setDeferError(caught instanceof Error ? caught.message : 'Could not set the reminder.');
    } finally {
      setDeferring(false);
    }
  };

  useEffect(() => {
    const current = activeRequirement?.currentAnswer;
    const relationalSchema = activeRequirement?.capture.inputSchema;
    setGroupDraft(relationalSchema?.type === 'RELATIONAL_UPDATE'
      ? relationalSchema.currentValues
      : current && typeof current === 'object' && !Array.isArray(current)
        ? current as Record<string, unknown>
        : {});
    const scalarValue = current && typeof current === 'object' && !Array.isArray(current)
      ? (current as { value?: unknown }).value
      : undefined;
    setDraft(typeof scalarValue === 'string' || typeof scalarValue === 'number' ? String(scalarValue) : '');
    setSelected(Array.isArray(scalarValue) ? scalarValue.filter((value): value is string => typeof value === 'string') : []);
    setRelationalMode(relationalSchema?.type === 'RELATIONAL_SELECT_CREATE' && relationalSchema.options.length ? 'SELECT' : 'CREATE');
    setSelectedEntityId('');
  }, [activeRequirement?.requirementId]);

  if (loading && !evaluation) return <div className="space-y-1 text-sm text-slate-600" role="status" aria-live="polite">
    <p>Checking property details…</p>
    {slow ? <p className="text-xs">This is taking a little longer than usual. You can keep your current inputs here.</p> : null}
  </div>;
  if (!evaluation) return error ? <button type="button" onClick={() => void reevaluate()} className="text-sm font-medium underline">Retry property context check</button> : null;
  if (evaluation.readiness === 'READY' || evaluation.readiness === 'NOT_APPLICABLE') return null;
  if (evaluation.readiness === 'READY_WITH_LIMITATIONS' && dismissedVersion === evaluation.contextVersion) return null;
  const requirement = activeRequirement;
  if (!requirement) return null;
  if (suppressedRequirementId === requirement.requirementId) {
    if (requirement.classification === 'ENHANCEMENT_ACCURACY') return null;
    return <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4" role="status">
      <p className="font-semibold text-slate-900">We saved that you’re still not sure</p>
      <p className="mt-1 text-sm text-slate-700">We will not ask again during this visit. Personalized coverage guidance will remain paused until the information is confirmed.</p>
      {onDefer ? <button type="button" disabled={deferring} onClick={() => void defer()} className="mt-3 min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900">
        {deferring ? 'Setting reminder…' : deferLabel}
      </button> : null}
      {deferError ? <p className="mt-2 text-xs text-red-700" role="alert">{deferError}</p> : null}
    </section>;
  }
  const schema = requirement.capture.inputSchema;
  const enhancement = requirement.classification === 'ENHANCEMENT_ACCURACY';
  const blocked = requirement.capture.actionKey === 'PERMISSION_REQUIRED';
  const numericValue = draft === '' ? null : Number(draft);
  const scalarCurrentValue = requirement.currentAnswer && typeof requirement.currentAnswer === 'object'
    ? (requirement.currentAnswer as { value?: unknown }).value
    : undefined;
  const stale = requirement.state === 'STALE';
  const conflicted = requirement.state === 'CONFLICTED';
  const drawer = surface === 'drawer';

  const fieldIsActive = (field: { when?: { fieldKey: string; operator: 'EQUALS' | 'NOT_EQUALS'; value: string | number | boolean } }) => {
    if (!field.when) return true;
    const actual = groupDraft[field.when.fieldKey];
    return field.when.operator === 'EQUALS' ? actual === field.when.value : actual !== field.when.value;
  };
  const fieldIsMissing = (field: { key: string; required: boolean }) => {
    if (!field.required) return false;
    const value = groupDraft[field.key];
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return true;
    const schemaField = (schema.type === 'GROUP' || schema.type === 'RELATIONAL_UPDATE')
      ? schema.fields.find((candidate) => candidate.key === field.key)
      : schema.type === 'RELATIONAL_SELECT_CREATE'
        ? schema.createFields.find((candidate) => candidate.key === field.key)
        : undefined;
    if (schemaField?.inputSchema.type !== 'APPROXIMATE_DATE') return false;
    if (typeof value !== 'object' || Array.isArray(value)) return true;
    const date = value as { precision?: string; value?: string; rangeEnd?: string };
    if (date.precision === 'UNKNOWN') return !requirement.capture.allowNotSure;
    return !date.value || (date.precision === 'RANGE' && !date.rangeEnd);
  };

  const notSureGroupAnswer = () => schema.type === 'GROUP'
    ? Object.fromEntries(schema.fields.filter(fieldIsActive).map((field) => {
      const input = field.inputSchema;
      if (input.type === 'MULTI_SELECT') return [field.key, []];
      if (input.type === 'SINGLE_SELECT' && input.options.some((option) => option.value === 'UNKNOWN')) return [field.key, 'UNKNOWN'];
      return [field.key, null];
    }))
    : null;

  return (
    <section className={`${drawer ? 'border-0 bg-transparent p-0' : `rounded-2xl border p-4 ${enhancement ? 'border-sky-200 bg-sky-50' : 'border-amber-200 bg-amber-50'}`} [&_button]:min-h-[44px] [&_input]:min-h-[44px]`} aria-live="polite" aria-busy={saving} aria-labelledby={headingId}>
      <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-slate-500">{conflicted ? 'Resolve conflicting details' : stale ? 'Confirm current details' : enhancement ? 'Improve this result' : requirement.capture.captureKey === 'INVENTORY_ITEM_COVERAGE_EVIDENCE' ? 'Coverage information needed' : 'Required property detail'}</p>
      <h3 id={headingId} className="mt-2 text-xl font-semibold leading-7 tracking-tight text-slate-950">{requirement.capture.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-700">{requirement.capture.question}</p>
      {requirement.capture.helpText ? <p className="mt-2 text-[13px] leading-5 text-slate-500">{requirement.capture.helpText}</p> : null}
      {stale ? <p className="mt-2 text-xs text-slate-700">Previously recorded answers are prefilled. Confirm them or update anything that changed.</p> : null}
      {conflicted ? <p className="mt-2 text-xs text-slate-700">Available records disagree. Your confirmation becomes the preferred evidence while the earlier evidence remains in the audit trail.</p> : null}
      {blocked ? <p className="mt-3 text-sm text-slate-700">An authorized property editor needs to complete this detail.</p> : (
        <div className="mt-5 flex flex-wrap gap-3">
          {schema.type === 'BOOLEAN' ? <>
            <button type="button" aria-pressed={scalarCurrentValue === true} disabled={saving} onClick={() => void capture(true)} className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${scalarCurrentValue === true ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50'}`}>{schema.trueLabel}</button>
            <button type="button" aria-pressed={scalarCurrentValue === false} disabled={saving} onClick={() => void capture(false)} className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${scalarCurrentValue === false ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50'}`}>{schema.falseLabel}</button>
          </> : null}
          {schema.type === 'SINGLE_SELECT' ? schema.options.map((option) => (
            <button key={option.value} type="button" aria-pressed={scalarCurrentValue === option.value} disabled={saving} onClick={() => void capture(option.value)} className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${scalarCurrentValue === option.value ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50'}`}>{option.label}</button>
          )) : null}
          {schema.type === 'MULTI_SELECT' ? <div className="w-full space-y-2">
            <div className="flex flex-wrap gap-2.5">{schema.options.map((option) => {
              const active = selected.includes(option.value);
              return <button key={option.value} type="button" aria-pressed={active} disabled={saving} onClick={() => setSelected((current) => active ? current.filter((value) => value !== option.value) : [...current, option.value].slice(0, schema.maxItems))} className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${active ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50'}`}>{option.label}</button>;
            })}</div>
            <button type="button" disabled={saving} onClick={() => void capture(selected)} className="w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800">Save and continue</button>
          </div> : null}
          {schema.type === 'INTEGER' || schema.type === 'DECIMAL' ? <form onSubmit={(event) => { event.preventDefault(); if (numericValue !== null && Number.isFinite(numericValue)) void capture(numericValue); }} className="flex flex-wrap items-end gap-2">
            <label className="w-full text-sm font-semibold text-slate-900">Answer{schema.unit ? ` (${schema.unit})` : ''}<input value={draft} onChange={(event) => setDraft(event.target.value)} type="number" step={schema.type === 'INTEGER' ? 1 : 'any'} min={schema.min} max={schema.max} className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base outline-none transition-colors focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 sm:text-sm" /></label>
            <button type="submit" disabled={saving || numericValue === null || !Number.isFinite(numericValue)} className="w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800">Save and continue</button>
          </form> : null}
          {schema.type === 'SHORT_TEXT' ? <form onSubmit={(event) => { event.preventDefault(); if (draft.trim()) void capture(draft.trim()); }} className="flex flex-wrap items-end gap-2">
            <label className="w-full text-sm font-semibold text-slate-900">Answer<input value={draft} maxLength={schema.maxLength} onChange={(event) => setDraft(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base outline-none transition-colors focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 sm:text-sm" /></label>
            <button type="submit" disabled={saving || !draft.trim()} className="w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800">Save and continue</button>
          </form> : null}
          {schema.type === 'GROUP' ? <form className="w-full space-y-4" onSubmit={(event) => { event.preventDefault(); void capture(groupDraft); }}>
            {schema.fields.filter(fieldIsActive).map((field) => <CaptureFieldControl
              key={field.key}
              field={field}
              value={groupDraft[field.key]}
              disabled={saving}
              allowNotSure={requirement.capture.allowNotSure}
              onChange={(value) => setGroupDraft((current) => ({ ...current, [field.key]: value }))}
            />)}
            <div className={drawer ? 'sticky bottom-0 z-10 -mx-1 border-t border-slate-200 bg-white/95 px-1 pb-1 pt-4 backdrop-blur' : ''}>
              <button type="submit" disabled={saving || schema.fields.filter(fieldIsActive).some(fieldIsMissing)} className="w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800">{stale || conflicted ? 'Confirm and continue' : 'Save and continue'}</button>
            </div>
          </form> : null}
          {schema.type === 'RELATIONAL_SELECT_CREATE' ? <div className="w-full space-y-4">
            {schema.options.length ? <div className="flex gap-2" role="tablist" aria-label="Choose or add a record">
              <button type="button" role="tab" aria-selected={relationalMode === 'SELECT'} onClick={() => setRelationalMode('SELECT')} className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${relationalMode === 'SELECT' ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50'}`}>{schema.selectLabel}</button>
              <button type="button" role="tab" aria-selected={relationalMode === 'CREATE'} onClick={() => setRelationalMode('CREATE')} className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${relationalMode === 'CREATE' ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50'}`}>{schema.createLabel}</button>
            </div> : null}
            {relationalMode === 'SELECT' && schema.options.length ? <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (selectedEntityId) void capture({ mode: 'SELECT', entityId: selectedEntityId }); }}>
              <div className="grid gap-2">{schema.options.map((option) => <button key={option.id} type="button" aria-pressed={selectedEntityId === option.id} onClick={() => setSelectedEntityId(option.id)} className={`rounded-xl border p-3 text-left transition-colors ${selectedEntityId === option.id ? 'border-teal-700 bg-teal-50 ring-1 ring-teal-700' : 'border-slate-200 bg-white hover:border-teal-300'}`}>
                <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                {option.description ? <span className="mt-0.5 block text-[13px] leading-5 text-slate-500">{option.description}</span> : null}
              </button>)}</div>
              <button type="submit" disabled={saving || !selectedEntityId} className="w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800">Use selected record</button>
            </form> : null}
            {relationalMode === 'CREATE' ? <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void capture({ mode: 'CREATE', values: groupDraft }); }}>
              {schema.createFields.map((field) => <CaptureFieldControl key={field.key} field={field} value={groupDraft[field.key]} disabled={saving} allowNotSure={requirement.capture.allowNotSure} onChange={(value) => setGroupDraft((current) => ({ ...current, [field.key]: value }))} />)}
              <button type="submit" disabled={saving || schema.createFields.some(fieldIsMissing)} className="w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800">Add and continue</button>
            </form> : null}
          </div> : null}
          {schema.type === 'RELATIONAL_UPDATE' ? <form className="w-full space-y-4" onSubmit={(event) => {
            event.preventDefault();
            void capture({ mode: 'UPDATE', entityId: schema.entityId, values: groupDraft });
          }}>
            {schema.fields.filter(fieldIsActive).map((field) => <CaptureFieldControl
              key={field.key}
              field={field}
              value={groupDraft[field.key]}
              disabled={saving}
              allowNotSure={requirement.capture.allowNotSure}
              onChange={(value) => setGroupDraft((current) => ({ ...current, [field.key]: value }))}
            />)}
            <div className={drawer ? 'sticky bottom-0 z-10 -mx-1 border-t border-slate-200 bg-white/95 px-1 pb-1 pt-4 backdrop-blur' : ''}>
              <button type="submit" disabled={saving || schema.fields.filter(fieldIsActive).some(fieldIsMissing)} className="w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800">{schema.updateLabel}</button>
            </div>
          </form> : null}
          {requirement.capture.allowNotSure && schema.type !== 'RELATIONAL_UPDATE' && schema.type !== 'RELATIONAL_SELECT_CREATE' ? <button type="button" disabled={saving} onClick={() => void capture(schema.type === 'GROUP' ? notSureGroupAnswer() : null)} className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-900">Not sure</button> : null}
          {enhancement ? <button type="button" disabled={saving} onClick={() => setDismissedVersion(evaluation.contextVersion)} className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-900">Skip for now</button> : null}
          {onDefer ? <button type="button" disabled={saving || deferring} onClick={() => void defer()} className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-900">
            {deferring ? 'Setting reminder…' : deferLabel}
          </button> : null}
        </div>
      )}
      {saving ? <p className="mt-2 text-xs text-slate-600" role="status">Saving…</p> : null}
      {error ? <p className="mt-2 text-xs text-red-700" role="alert">{error}</p> : null}
      {deferError ? <p className="mt-2 text-xs text-red-700" role="alert">{deferError}</p> : null}
    </section>
  );
}
