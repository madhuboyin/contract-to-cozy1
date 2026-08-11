'use client';

import type { ApproximateDateCaptureValue, CaptureDatePrecision, ScalarCaptureInputSchema } from './featureContextTypes';

const DATE_PRECISION_OPTIONS: Array<{ value: CaptureDatePrecision; label: string }> = [
  { value: 'EXACT_DATE', label: 'Exact date' },
  { value: 'MONTH', label: 'Month' },
  { value: 'YEAR', label: 'Year' },
  { value: 'RANGE', label: 'Date range' },
  { value: 'UNKNOWN', label: 'I’m not sure' },
];

export type CaptureField = { key: string; label: string; helpText?: string; required: boolean; inputSchema: ScalarCaptureInputSchema };

export function CaptureFieldControl({ field, value, disabled, allowNotSure = false, onChange }: {
  field: CaptureField;
  value: unknown;
  disabled: boolean;
  allowNotSure?: boolean;
  onChange: (value: unknown) => void;
}) {
  const schema = field.inputSchema;
  const approximate = schema.type === 'APPROXIMATE_DATE'
    ? (value && typeof value === 'object' && !Array.isArray(value) ? value as ApproximateDateCaptureValue : { precision: 'EXACT_DATE' as const })
    : null;
  const permittedPrecisions = schema.type === 'APPROXIMATE_DATE'
    ? (schema.allowedPrecisions ?? DATE_PRECISION_OPTIONS.map((option) => option.value)).filter((precision) => allowNotSure || precision !== 'UNKNOWN')
    : [];

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
      {schema.type === 'APPROXIMATE_DATE' && approximate ? <div className="w-full space-y-3">
        <div className="flex flex-wrap gap-2" aria-label={`${field.label} precision`} role="group">
          {DATE_PRECISION_OPTIONS.filter((option) => permittedPrecisions.includes(option.value)).map((option) => <button key={option.value} type="button" disabled={disabled} aria-pressed={approximate.precision === option.value} onClick={() => onChange({ precision: option.value })} className={`rounded-lg border px-3 py-2 text-sm font-medium ${approximate.precision === option.value ? 'border-slate-900 bg-slate-900 text-white' : 'bg-white'}`}>{option.label}</button>)}
        </div>
        {approximate.precision !== 'UNKNOWN' ? <div className="flex flex-wrap gap-2">
          <input aria-label={`${field.label} ${approximate.precision === 'RANGE' ? 'start' : 'value'}`} type={approximate.precision === 'YEAR' ? 'number' : approximate.precision === 'MONTH' ? 'month' : 'date'} min={approximate.precision === 'YEAR' ? 1600 : undefined} max={approximate.precision === 'YEAR' ? new Date().getFullYear() : schema.allowFuture ? undefined : new Date().toISOString().slice(0, approximate.precision === 'MONTH' ? 7 : 10)} value={approximate.value ?? ''} disabled={disabled} onChange={(event) => onChange({ ...approximate, value: event.target.value || undefined })} className="rounded-lg border bg-white px-3 py-2 text-sm" />
          {approximate.precision === 'RANGE' ? <input aria-label={`${field.label} end`} type="date" max={schema.allowFuture ? undefined : new Date().toISOString().slice(0, 10)} value={approximate.rangeEnd ?? ''} disabled={disabled} onChange={(event) => onChange({ ...approximate, rangeEnd: event.target.value || undefined })} className="rounded-lg border bg-white px-3 py-2 text-sm" /> : null}
        </div> : <p className="text-xs text-slate-600">We’ll keep the date unknown and avoid inventing precision.</p>}
      </div> : null}
      {allowNotSure && schema.type !== 'APPROXIMATE_DATE' && !(schema.type === 'SINGLE_SELECT' && schema.options.some((option) => option.value === 'UNKNOWN' || option.value === 'NOT_SURE')) && value !== null ? <button type="button" disabled={disabled} onClick={() => onChange(null)} className="rounded-lg px-3 py-2 text-sm font-medium underline">I’m not sure</button> : null}
    </div>
  </fieldset>;
}
