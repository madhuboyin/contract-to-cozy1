'use client';

import { useState } from 'react';
import type { FeatureContextEvaluation } from './featureContextTypes';
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
  const { evaluation, loading, saving, error, capture, reevaluate } = useFeatureContextCapture({
    propertyId,
    featureKey,
    operationKey,
    operationInput,
    onReady,
  });
  const [draft, setDraft] = useState<string>('');
  const [selected, setSelected] = useState<string[]>([]);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  if (loading && !evaluation) return <p className="text-sm text-slate-600" role="status">Checking property details…</p>;
  if (!evaluation) return error ? <button type="button" onClick={() => void reevaluate()} className="text-sm font-medium underline">Retry property context check</button> : null;
  if (evaluation.readiness === 'READY' || evaluation.readiness === 'NOT_APPLICABLE') return null;
  if (evaluation.readiness === 'READY_WITH_LIMITATIONS' && dismissedVersion === evaluation.contextVersion) return null;
  const requirement = evaluation.requirements[0];
  if (!requirement) return null;
  const schema = requirement.capture.inputSchema;
  const enhancement = requirement.classification === 'ENHANCEMENT_ACCURACY';
  const blocked = requirement.capture.actionKey === 'PERMISSION_REQUIRED';
  const numericValue = draft === '' ? null : Number(draft);

  return (
    <section className={`rounded-2xl border p-4 ${enhancement ? 'border-sky-200 bg-sky-50' : 'border-amber-200 bg-amber-50'}`} aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{enhancement ? 'Improve this result' : 'Required property detail'}</p>
      <h3 className="mt-1 font-semibold text-slate-950">{requirement.capture.title}</h3>
      <p className="mt-1 text-sm text-slate-800">{requirement.capture.question}</p>
      {requirement.capture.helpText ? <p className="mt-1 text-xs text-slate-600">{requirement.capture.helpText}</p> : null}
      {blocked ? <p className="mt-3 text-sm text-slate-700">An authorized property editor needs to complete this detail.</p> : (
        <div className="mt-3 flex flex-wrap gap-2">
          {schema.type === 'BOOLEAN' ? <>
            <button type="button" disabled={saving} onClick={() => void capture(true)} className="rounded-lg border bg-white px-3 py-2 text-sm font-medium">{schema.trueLabel}</button>
            <button type="button" disabled={saving} onClick={() => void capture(false)} className="rounded-lg border bg-white px-3 py-2 text-sm font-medium">{schema.falseLabel}</button>
          </> : null}
          {schema.type === 'SINGLE_SELECT' ? schema.options.map((option) => (
            <button key={option.value} type="button" disabled={saving} onClick={() => void capture(option.value)} className="rounded-lg border bg-white px-3 py-2 text-sm font-medium">{option.label}</button>
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
          {requirement.capture.allowNotSure ? <button type="button" disabled={saving} onClick={() => void capture(null)} className="rounded-lg px-3 py-2 text-sm font-medium underline">Not sure</button> : null}
          {enhancement ? <button type="button" disabled={saving} onClick={() => setDismissedVersion(evaluation.contextVersion)} className="rounded-lg px-3 py-2 text-sm font-medium underline">Skip for now</button> : null}
        </div>
      )}
      {saving ? <p className="mt-2 text-xs text-slate-600" role="status">Saving…</p> : null}
      {error ? <p className="mt-2 text-xs text-red-700" role="alert">{error}</p> : null}
    </section>
  );
}
