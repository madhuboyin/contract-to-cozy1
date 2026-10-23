'use client';

import { useState } from 'react';
import type { ApproximateDateCaptureValue, CaptureDatePrecision, ScalarCaptureInputSchema } from './featureContextTypes';
import { AttachEvidenceControl } from '@/components/ask/AttachEvidenceControl';

const DATE_PRECISION_OPTIONS: Array<{ value: CaptureDatePrecision; label: string }> = [
  { value: 'EXACT_DATE', label: 'Exact date' },
  { value: 'MONTH', label: 'Month' },
  { value: 'YEAR', label: 'Year' },
  { value: 'RANGE', label: 'Date range' },
  { value: 'UNKNOWN', label: 'I’m not sure' },
];

export type CaptureField = { key: string; label: string; helpText?: string; required: boolean; inputSchema: ScalarCaptureInputSchema };

export function CaptureFieldControl({ field, value, disabled, allowNotSure = false, onChange, bare = false, compact = false, dense = false, propertyId }: {
  field: CaptureField;
  value: unknown;
  disabled: boolean;
  allowNotSure?: boolean;
  onChange: (value: unknown) => void;
  // The Ask conversational step draws its own question, so the card frame, legend and help text are dropped (legend kept for assistive tech).
  bare?: boolean;
  // Dense workflow groups retain labels and touch targets while avoiding a
  // full-width card for every small field.
  compact?: boolean;
  // Decision editors contain short financial values. Keep their controls
  // proportional to the value without reducing the accessible hit height.
  dense?: boolean;
  propertyId?: string;
}) {
  const [expandedOptions, setExpandedOptions] = useState(false);
  const schema = field.inputSchema;
  const approximate = schema.type === 'APPROXIMATE_DATE'
    ? (value && typeof value === 'object' && !Array.isArray(value) ? value as ApproximateDateCaptureValue : { precision: 'EXACT_DATE' as const })
    : null;
  const permittedPrecisions = schema.type === 'APPROXIMATE_DATE'
    ? (schema.allowedPrecisions ?? DATE_PRECISION_OPTIONS.map((option) => option.value)).filter((precision) => allowNotSure || precision !== 'UNKNOWN')
    : [];
  const selectOptions = schema.type === 'SINGLE_SELECT' ? schema.options : [];
  const selectedOption = schema.type === 'SINGLE_SELECT' && typeof value === 'string'
    ? schema.options.find((option) => option.value === value)
    : undefined;
  const visibleSelectOptions = compact && selectOptions.length > 8 && !expandedOptions
    ? [...selectOptions.slice(0, 7), ...(selectedOption && !selectOptions.slice(0, 7).some((option) => option.value === selectedOption.value) ? [selectedOption] : [])]
    : selectOptions;
  const moneyLabel = /\(\$|\$\/month\)/.test(field.label);
  const percentLabel = /\(%\)/.test(field.label);
  const denseControlWidth = percentLabel || /\(years\)/.test(field.label) ? 'w-32' : moneyLabel ? 'w-56' : 'w-48';

  return <fieldset className={bare ? 'min-w-0 border-0 p-0' : compact ? 'h-full min-w-0 border-0 p-0' : 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40'}>
    <legend className={bare ? 'sr-only' : compact ? 'mb-1 text-xs font-semibold leading-4 text-slate-800' : 'px-1 text-sm font-semibold leading-5 text-slate-900'}>{field.label}{field.required ? ' *' : ''}</legend>
    {field.helpText && !bare ? <p className={compact ? 'mb-2 text-xs leading-4 text-slate-500' : 'mb-3 text-[13px] leading-5 text-slate-500'}>{field.helpText}</p> : null}
    <div className="flex flex-wrap gap-2.5">
      {schema.type === 'BOOLEAN' ? [[schema.trueLabel, true], [schema.falseLabel, false], ...(schema.unknownLabel ? [[schema.unknownLabel, null] as const] : [])].map(([label, optionValue]) => <button key={String(optionValue)} type="button" aria-pressed={value === optionValue} disabled={disabled} onClick={() => onChange(optionValue)} className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${value === optionValue ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50'}`}>{String(label)}</button>) : null}
      {schema.type === 'SINGLE_SELECT' ? visibleSelectOptions.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} disabled={disabled} onClick={() => onChange(option.value)} className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${value === option.value ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50'}`}>{option.label}</button>) : null}
      {schema.type === 'SINGLE_SELECT' && compact && selectOptions.length > 8 ? <button type="button" disabled={disabled} aria-expanded={expandedOptions} onClick={() => setExpandedOptions((current) => !current)} className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-slate-600 hover:border-teal-300 hover:bg-teal-50">{expandedOptions ? 'Show fewer' : `More (${selectOptions.length - visibleSelectOptions.length})`}</button> : null}
      {schema.type === 'MULTI_SELECT' ? schema.options.map((option) => {
        const selected = Array.isArray(value) && value.includes(option.value);
        return <button key={option.value} type="button" aria-pressed={selected} disabled={disabled} onClick={() => {
          const current = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
          onChange(selected ? current.filter((item) => item !== option.value) : [...current, option.value].slice(0, schema.maxItems));
        }} className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${selected ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50'}`}>{option.label}</button>;
      }) : null}
      {schema.type === 'DOCUMENT_MULTI_SELECT' ? <div className="w-full space-y-2">
        {schema.options.map((option) => {
          const current = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
          const selected = current.includes(option.value);
          return <button key={option.value} type="button" aria-pressed={selected} disabled={disabled} onClick={() => onChange(selected ? current.filter((item) => item !== option.value) : [...current, option.value].slice(0, schema.maxItems))} className={`mr-2 rounded-xl border px-3 py-2 text-sm font-semibold ${selected ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>{option.label}</button>;
        })}
        {schema.allowUpload ? <AttachEvidenceControl event={{ entityType: 'PROJECT_RECORD', id: field.key, title: field.label }} propertyId={propertyId} store={schema.uploadTarget === 'HOME_RECORDS' ? 'HOME_RECORDS' : undefined} disabled={disabled} label="Upload document" onAttached={(documentId) => {
          const current = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
          onChange([...current.filter((id) => id !== documentId), documentId].slice(0, schema.maxItems));
        }} /> : null}
        {Array.isArray(value) && value.length > 0 ? <p className="text-xs text-slate-500">{value.length} document{value.length === 1 ? '' : 's'} selected</p> : null}
      </div> : null}
      {schema.type === 'INTEGER' || schema.type === 'DECIMAL' ? <input aria-label={field.label} type="number" step={schema.type === 'INTEGER' ? 1 : 'any'} min={schema.min} max={schema.max} value={typeof value === 'number' ? value : ''} disabled={disabled} onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))} className={`${dense ? denseControlWidth : compact ? 'w-full' : ''} rounded-xl border border-slate-200 bg-white px-3 py-2 text-base outline-none transition-colors focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 sm:text-sm`} /> : null}
      {schema.type === 'NUMBER' || schema.type === 'MONEY' ? <div className={`relative ${dense ? denseControlWidth : 'w-full'}`}>{(schema.type === 'MONEY' && schema.currency === 'USD') || (dense && moneyLabel) ? <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">$</span> : null}{dense && percentLabel ? <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">%</span> : null}<input aria-label={field.label} type="number" step="any" min={schema.min} max={schema.max} value={typeof value === 'number' ? value : ''} disabled={disabled} onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))} className={`${(schema.type === 'MONEY' && schema.currency === 'USD') || (dense && moneyLabel) ? 'pl-7' : 'pl-3'} ${dense && percentLabel ? 'pr-8' : 'pr-3'} w-full rounded-xl border border-slate-200 bg-white py-2 text-base outline-none transition-colors focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 sm:text-sm`} /></div> : null}
      {schema.type === 'SHORT_TEXT' ? <input aria-label={field.label} value={typeof value === 'string' ? value : ''} maxLength={schema.maxLength} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${compact ? 'w-full' : ''} rounded-xl border border-slate-200 bg-white px-3 py-2 text-base outline-none transition-colors focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 sm:text-sm`} /> : null}
      {schema.type === 'LONG_TEXT' ? <textarea aria-label={field.label} rows={compact ? 2 : 4} value={typeof value === 'string' ? value : ''} maxLength={schema.maxLength} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-base outline-none transition-colors focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 sm:text-sm" /> : null}
      {schema.type === 'TIME' ? <input aria-label={field.label} type="time" value={typeof value === 'string' ? value : ''} disabled={disabled} onChange={(event) => onChange(event.target.value || undefined)} className={`${compact ? 'w-full' : ''} rounded-xl border border-slate-200 bg-white px-3 py-2 text-base outline-none transition-colors focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 sm:text-sm`} /> : null}
      {schema.type === 'APPROXIMATE_DATE' && approximate ? <div className="w-full space-y-3">
        {permittedPrecisions.length > 1 ? <div className="flex flex-wrap gap-2" aria-label={`${field.label} precision`} role="group">
          {DATE_PRECISION_OPTIONS.filter((option) => permittedPrecisions.includes(option.value)).map((option) => <button key={option.value} type="button" disabled={disabled} aria-pressed={approximate.precision === option.value} onClick={() => onChange({ precision: option.value })} className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${approximate.precision === option.value ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50'}`}>{option.label}</button>)}
        </div> : null}
        {approximate.precision !== 'UNKNOWN' ? <div className="flex flex-wrap gap-2">
          <input aria-label={`${field.label} ${approximate.precision === 'RANGE' ? 'start' : 'value'}`} type={approximate.precision === 'YEAR' ? 'number' : approximate.precision === 'MONTH' ? 'month' : 'date'} min={approximate.precision === 'YEAR' ? 1600 : undefined} max={approximate.precision === 'YEAR' ? new Date().getFullYear() : schema.allowFuture ? undefined : new Date().toISOString().slice(0, approximate.precision === 'MONTH' ? 7 : 10)} value={approximate.value ?? ''} disabled={disabled} onChange={(event) => onChange({ ...approximate, value: event.target.value || undefined })} className={`${dense ? 'w-48' : compact ? 'w-full' : ''} rounded-xl border border-slate-200 bg-white px-3 py-2 text-base outline-none transition-colors focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 sm:text-sm`} />
          {approximate.precision === 'RANGE' ? <input aria-label={`${field.label} end`} type="date" max={schema.allowFuture ? undefined : new Date().toISOString().slice(0, 10)} value={approximate.rangeEnd ?? ''} disabled={disabled} onChange={(event) => onChange({ ...approximate, rangeEnd: event.target.value || undefined })} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-base outline-none transition-colors focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 sm:text-sm" /> : null}
        </div> : <p className="text-[13px] leading-5 text-slate-500">We’ll keep the date unknown and avoid inventing precision.</p>}
      </div> : null}
      {allowNotSure && schema.type !== 'APPROXIMATE_DATE' && !(schema.type === 'SINGLE_SELECT' && schema.options.some((option) => option.value === 'UNKNOWN' || option.value === 'NOT_SURE')) && value !== null ? <button type="button" disabled={disabled} onClick={() => onChange(null)} className="rounded-lg px-3 py-2 text-sm font-medium underline">I’m not sure</button> : null}
    </div>
  </fieldset>;
}
