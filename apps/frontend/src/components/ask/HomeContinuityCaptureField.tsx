'use client';

import type { CaptureField } from '@/components/property-context/CaptureFieldControl';
import { cn } from '@/lib/utils';

const SWITCH_FIELDS = new Set(['isPinned', 'isEmergency', 'isPrimary']);
const SEGMENTED_FIELDS = new Set(['priority']);

export function HomeContinuityCaptureField({ field, value, disabled, onChange }: {
  field: CaptureField;
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const schema = field.inputSchema;
  const label = <span className="mb-1 block text-xs font-semibold text-slate-700">{field.label}{field.required ? ' *' : ''}</span>;

  if (schema.type === 'SINGLE_SELECT' && SWITCH_FIELDS.has(field.key)) {
    const checked = value === 'YES';
    return <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
      <span><span className="block text-sm font-semibold text-slate-800">{field.label}</span><span className="block text-xs text-slate-500">{field.key === 'isPinned' ? 'Keep this item easy to find' : field.key === 'isEmergency' ? 'Include in the focused Emergency view' : 'Use as the main handoff contact'}</span></span>
      <input className="peer sr-only" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked ? 'YES' : 'NO')} />
      <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full bg-slate-300 transition peer-checked:bg-teal-700 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-600 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" />
    </label>;
  }

  if (schema.type === 'SINGLE_SELECT' && SEGMENTED_FIELDS.has(field.key)) {
    return <fieldset><legend className="mb-1 text-xs font-semibold text-slate-700">{field.label}{field.required ? ' *' : ''}</legend><div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">{schema.options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} disabled={disabled} onClick={() => onChange(option.value)} className={cn('min-h-9 rounded-lg px-3 text-sm font-semibold transition-colors', value === option.value ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white')}>{option.label}</button>)}</div></fieldset>;
  }

  if (schema.type === 'SINGLE_SELECT') {
    return <label>{label}<select aria-label={field.label} value={typeof value === 'string' ? value : ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"><option value="" disabled>Select {field.label.toLowerCase()}</option>{schema.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  }

  if (schema.type === 'SHORT_TEXT') {
    return <label>{label}<input aria-label={field.label} value={typeof value === 'string' ? value : ''} maxLength={schema.maxLength} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15" /></label>;
  }

  if (schema.type === 'LONG_TEXT') {
    return <label>{label}<textarea aria-label={field.label} rows={3} value={typeof value === 'string' ? value : ''} maxLength={schema.maxLength} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15" /></label>;
  }

  return null;
}
