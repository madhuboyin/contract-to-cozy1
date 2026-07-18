'use client';

import { useEffect, useState } from 'react';
import type { FeatureContextEvaluation, ScalarCaptureInputSchema } from './featureContextTypes';
import { useFeatureContextCapture } from './useFeatureContextCapture';

export function PropertyContextCapturePanel({
  propertyId,
  featureKey,
  operationKey,
  operationInput,
  onReady,
}: {
  propertyId: string;
  featureKey: string;
  operationKey: string;
  operationInput?: Record<string, unknown>;
  onReady?: (evaluation: FeatureContextEvaluation) => void | Promise<void>;
}) {
  const { evaluation, loading, saving, error, capture, reevaluate, suppressedRequirementId } = useFeatureContextCapture({
    propertyId,
    featureKey,
    operationKey,
    operationInput,
    onReady,
  });
  const [draft, setDraft] = useState<string>('');
  const [selected, setSelected] = useState<string[]>([]);
  const [groupDraft, setGroupDraft] = useState<Record<string, unknown>>({});
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const activeRequirement = evaluation?.requirements[0];

  useEffect(() => {
    const current = activeRequirement?.currentAnswer;
    setGroupDraft(current && typeof current === 'object' && !Array.isArray(current)
      ? current as Record<string, unknown>
      : {});
    const scalarValue = current && typeof current === 'object' && !Array.isArray(current)
      ? (current as { value?: unknown }).value
      : undefined;
    setDraft(typeof scalarValue === 'string' || typeof scalarValue === 'number' ? String(scalarValue) : '');
    setSelected(Array.isArray(scalarValue) ? scalarValue.filter((value): value is string => typeof value === 'string') : []);
  }, [activeRequirement?.requirementId]);

  if (loading && !evaluation) return <p className="text-sm text-slate-600" role="status">Checking property details…</p>;
  if (!evaluation) return error ? <button type="button" onClick={() => void reevaluate()} className="text-sm font-medium underline">Retry property context check</button> : null;
  if (evaluation.readiness === 'READY' || evaluation.readiness === 'NOT_APPLICABLE') return null;
  if (evaluation.readiness === 'READY_WITH_LIMITATIONS' && dismissedVersion === evaluation.contextVersion) return null;
  const requirement = activeRequirement;
  if (!requirement) return null;
  if (suppressedRequirementId === requirement.requirementId) {
    if (requirement.classification === 'ENHANCEMENT_ACCURACY') return null;
    return <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4" role="status">
      <p className="font-semibold text-slate-900">More property detail is still needed</p>
      <p className="mt-1 text-sm text-slate-700">We saved that you’re not sure and won’t ask again during this visit. This specific result will remain unavailable until an authorized editor confirms the detail.</p>
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

  const fieldIsActive = (field: Extract<typeof schema, { type: 'GROUP' }>['fields'][number]) => {
    if (!field.when) return true;
    const actual = groupDraft[field.when.fieldKey];
    return field.when.operator === 'EQUALS' ? actual === field.when.value : actual !== field.when.value;
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
    <section className={`rounded-2xl border p-4 ${enhancement ? 'border-sky-200 bg-sky-50' : 'border-amber-200 bg-amber-50'}`} aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{conflicted ? 'Resolve conflicting details' : stale ? 'Confirm current details' : enhancement ? 'Improve this result' : 'Required property detail'}</p>
      <h3 className="mt-1 font-semibold text-slate-950">{requirement.capture.title}</h3>
      <p className="mt-1 text-sm text-slate-800">{requirement.capture.question}</p>
      {requirement.capture.helpText ? <p className="mt-1 text-xs text-slate-600">{requirement.capture.helpText}</p> : null}
      {stale ? <p className="mt-2 text-xs text-slate-700">Previously recorded answers are prefilled. Confirm them or update anything that changed.</p> : null}
      {conflicted ? <p className="mt-2 text-xs text-slate-700">Available records disagree. Your confirmation becomes the preferred evidence while the earlier evidence remains in the audit trail.</p> : null}
      {blocked ? <p className="mt-3 text-sm text-slate-700">An authorized property editor needs to complete this detail.</p> : (
        <div className="mt-3 flex flex-wrap gap-2">
          {schema.type === 'BOOLEAN' ? <>
            <button type="button" aria-pressed={scalarCurrentValue === true} disabled={saving} onClick={() => void capture(true)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${scalarCurrentValue === true ? 'border-slate-900 bg-slate-900 text-white' : 'bg-white'}`}>{schema.trueLabel}</button>
            <button type="button" aria-pressed={scalarCurrentValue === false} disabled={saving} onClick={() => void capture(false)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${scalarCurrentValue === false ? 'border-slate-900 bg-slate-900 text-white' : 'bg-white'}`}>{schema.falseLabel}</button>
          </> : null}
          {schema.type === 'SINGLE_SELECT' ? schema.options.map((option) => (
            <button key={option.value} type="button" aria-pressed={scalarCurrentValue === option.value} disabled={saving} onClick={() => void capture(option.value)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${scalarCurrentValue === option.value ? 'border-slate-900 bg-slate-900 text-white' : 'bg-white'}`}>{option.label}</button>
          )) : null}
          {schema.type === 'MULTI_SELECT' ? <div className="w-full space-y-2">
            <div className="flex flex-wrap gap-2">{schema.options.map((option) => {
              const active = selected.includes(option.value);
              return <button key={option.value} type="button" aria-pressed={active} disabled={saving} onClick={() => setSelected((current) => active ? current.filter((value) => value !== option.value) : [...current, option.value].slice(0, schema.maxItems))} className={`rounded-lg border px-3 py-2 text-sm font-medium ${active ? 'border-slate-900 bg-slate-900 text-white' : 'bg-white'}`}>{option.label}</button>;
            })}</div>
            <button type="button" disabled={saving} onClick={() => void capture(selected)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">Save and continue</button>
          </div> : null}
          {schema.type === 'INTEGER' || schema.type === 'DECIMAL' ? <form onSubmit={(event) => { event.preventDefault(); if (numericValue !== null && Number.isFinite(numericValue)) void capture(numericValue); }} className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium">Answer{schema.unit ? ` (${schema.unit})` : ''}<input value={draft} onChange={(event) => setDraft(event.target.value)} type="number" step={schema.type === 'INTEGER' ? 1 : 'any'} min={schema.min} max={schema.max} className="mt-1 block rounded-lg border bg-white px-3 py-2" /></label>
            <button type="submit" disabled={saving || numericValue === null || !Number.isFinite(numericValue)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">Save and continue</button>
          </form> : null}
          {schema.type === 'SHORT_TEXT' ? <form onSubmit={(event) => { event.preventDefault(); if (draft.trim()) void capture(draft.trim()); }} className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium">Answer<input value={draft} maxLength={schema.maxLength} onChange={(event) => setDraft(event.target.value)} className="mt-1 block rounded-lg border bg-white px-3 py-2" /></label>
            <button type="submit" disabled={saving || !draft.trim()} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">Save and continue</button>
          </form> : null}
          {schema.type === 'GROUP' ? <form className="w-full space-y-4" onSubmit={(event) => { event.preventDefault(); void capture(groupDraft); }}>
            {schema.fields.filter(fieldIsActive).map((field) => <StructuredFieldControl
              key={field.key}
              field={field}
              value={groupDraft[field.key]}
              disabled={saving}
              onChange={(value) => setGroupDraft((current) => ({ ...current, [field.key]: value }))}
            />)}
            <button type="submit" disabled={saving || schema.fields.filter(fieldIsActive).some((field) => field.required && !Object.prototype.hasOwnProperty.call(groupDraft, field.key))} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">{stale || conflicted ? 'Confirm and continue' : 'Save and continue'}</button>
          </form> : null}
          {requirement.capture.allowNotSure ? <button type="button" disabled={saving} onClick={() => void capture(schema.type === 'GROUP' ? notSureGroupAnswer() : null)} className="rounded-lg px-3 py-2 text-sm font-medium underline">Not sure</button> : null}
          {enhancement ? <button type="button" disabled={saving} onClick={() => setDismissedVersion(evaluation.contextVersion)} className="rounded-lg px-3 py-2 text-sm font-medium underline">Skip for now</button> : null}
        </div>
      )}
      {saving ? <p className="mt-2 text-xs text-slate-600" role="status">Saving…</p> : null}
      {error ? <p className="mt-2 text-xs text-red-700" role="alert">{error}</p> : null}
    </section>
  );
}

function StructuredFieldControl({
  field,
  value,
  disabled,
  onChange,
}: {
  field: { key: string; label: string; helpText?: string; required: boolean; inputSchema: ScalarCaptureInputSchema };
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const schema = field.inputSchema;
  return <fieldset className="rounded-xl border border-slate-200 bg-white/80 p-3">
    <legend className="px-1 text-sm font-medium text-slate-900">{field.label}{field.required ? ' *' : ''}</legend>
    {field.helpText ? <p className="mb-2 text-xs text-slate-600">{field.helpText}</p> : null}
    <div className="flex flex-wrap gap-2">
      {schema.type === 'BOOLEAN' ? [[schema.trueLabel, true], [schema.falseLabel, false]].map(([label, optionValue]) => <button key={String(optionValue)} type="button" aria-pressed={value === optionValue} disabled={disabled} onClick={() => onChange(optionValue)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${value === optionValue ? 'border-slate-900 bg-slate-900 text-white' : 'bg-white'}`}>{String(label)}</button>) : null}
      {schema.type === 'SINGLE_SELECT' ? schema.options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} disabled={disabled} onClick={() => onChange(option.value)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${value === option.value ? 'border-slate-900 bg-slate-900 text-white' : 'bg-white'}`}>{option.label}</button>) : null}
      {schema.type === 'MULTI_SELECT' ? schema.options.map((option) => {
        const selected = Array.isArray(value) && value.includes(option.value);
        return <button key={option.value} type="button" aria-pressed={selected} disabled={disabled} onClick={() => {
          const current = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
          onChange(selected ? current.filter((item) => item !== option.value) : [...current, option.value].slice(0, schema.maxItems));
        }} className={`rounded-lg border px-3 py-2 text-sm font-medium ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'bg-white'}`}>{option.label}</button>;
      }) : null}
      {schema.type === 'INTEGER' || schema.type === 'DECIMAL' ? <input aria-label={field.label} type="number" step={schema.type === 'INTEGER' ? 1 : 'any'} min={schema.min} max={schema.max} value={typeof value === 'number' ? value : ''} disabled={disabled} onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))} className="rounded-lg border bg-white px-3 py-2 text-sm" /> : null}
      {schema.type === 'SHORT_TEXT' ? <input aria-label={field.label} value={typeof value === 'string' ? value : ''} maxLength={schema.maxLength} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm" /> : null}
    </div>
  </fieldset>;
}
