'use client';

import React, { useId, useState } from 'react';
import Link from 'next/link';
import { parsePlanningHomeValue } from './homeValueRequired';

// Shown inline in place of an error when an analysis has no home value to start from. It says plainly that the value is used for this analysis only:
// nothing is saved and the home record is unchanged. Keeping a value means adding the appraisal or purchase price to the home record, which is a
// separate, deliberate step on the property page.
export function HomeValueRequiredPrompt({ propertyId, toolName, busy = false, onSubmit, saveOption }: {
  propertyId: string;
  toolName: string;
  busy?: boolean;
  onSubmit: (value: number) => void;
  /** Where the tool has saved scenario inputs, a second, clearly labelled choice that saves the value for that tool's scenarios. It never updates the home record. */
  saveOption?: { label: string; note: string; onSave: (value: number) => void | Promise<void> };
}) {
  const inputId = useId();
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = parsePlanningHomeValue(text);
    if (value === null) { setInvalid(true); return; }
    setInvalid(false);
    onSubmit(value);
  }

  function save() {
    const value = parsePlanningHomeValue(text);
    if (value === null) { setInvalid(true); return; }
    setInvalid(false);
    void saveOption?.onSave(value);
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-amber-200 bg-amber-50 p-4" aria-labelledby={`${inputId}-title`} data-home-value-prompt="">
      <p id={`${inputId}-title`} className="text-sm font-semibold text-amber-950">What value should {toolName} plan with?</p>
      <p className="mt-1 text-sm text-amber-900">
        There is no appraisal or purchase price on record for this home, so there is nothing to start from. Enter a value to run this analysis.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-800">
          Home value (USD)
          <input
            id={inputId} name="planningHomeValue" inputMode="numeric" autoComplete="off" placeholder="450000" value={text}
            onChange={(event) => setText(event.target.value)} aria-invalid={invalid} aria-describedby={`${inputId}-scope`}
            className="mt-1 block min-h-10 w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </label>
        <button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
          {busy ? 'Running…' : 'Use for this analysis'}
        </button>
        {saveOption && (
          <button type="button" onClick={save} disabled={busy} className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
            {saveOption.label}
          </button>
        )}
      </div>
      {invalid && <p role="alert" className="mt-2 text-sm text-red-700">Enter an amount between $10,000 and $100,000,000.</p>}
      <p id={`${inputId}-scope`} className="mt-3 text-xs text-amber-900">
        <strong>Use for this analysis</strong>: used this once. It is not saved, and your home record is unchanged.
        {saveOption && <> <strong>{saveOption.label}</strong>: {saveOption.note}</>}
        {' '}To record the home&rsquo;s actual value, add the latest appraisal or purchase price in{' '}
        <Link href={`/dashboard/properties/${propertyId}/edit`} className="font-semibold underline">your home record</Link>.
      </p>
    </form>
  );
}

/** Shown with results that ran on a value entered in the prompt, so it is clear the number is not the home record's. */
export function AnalysisOnlyValueNote({ value, onClear }: { value: number; onClear: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" data-analysis-only-value="">
      <span>
        Using <strong>${Math.round(value).toLocaleString('en-US')}</strong> for this analysis only. It is not saved and your home record is unchanged.
      </span>
      <button type="button" onClick={onClear} className="font-semibold text-teal-800 underline">Clear</button>
    </div>
  );
}
