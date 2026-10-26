'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { AskRecordEditor, AskRecordEditorField } from '@/features/ask/types';

// Shared RecordEditor UI (FRD v1.385). Presentation only: the server supplies the fields, the fresh canonical values and
// every validation rule; this component owns dirty state, error display, focus and the Save/Cancel affordances.
// Desktop: an inline expanded card in the conversation. Mobile: a full-height sheet. Never a modal dialog.

const INPUT = 'w-full rounded-xl border bg-white px-3 py-2 text-base outline-none transition-colors focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 disabled:opacity-60 sm:text-sm';

const SPAN: Record<number, string> = { 4: 'md:col-span-4', 6: 'md:col-span-6', 12: 'md:col-span-12' };

/** Column spans on a 12-column grid so every row fills: multiline fields take a full row, the rest share rows of up to three (2x2 for four). */
export function fieldSpans(fields: AskRecordEditorField[]): Record<string, string> {
  const spans: Record<string, string> = {};
  const rest = fields.filter((field) => field.kind !== 'TEXTAREA' && field.kind !== 'APPROX_DATE');
  for (const field of fields) if (field.kind === 'TEXTAREA' || field.kind === 'APPROX_DATE') spans[field.key] = SPAN[12];
  const rows: AskRecordEditorField[][] = [];
  if (rest.length === 4) rows.push(rest.slice(0, 2), rest.slice(2));
  else for (let index = 0; index < rest.length; index += 3) rows.push(rest.slice(index, index + 3));
  for (const row of rows) for (const field of row) spans[field.key] = SPAN[12 / row.length];
  return spans;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** The value as the server will see it, so "850" and "850.00" are not a change. */
export function normalizeEditorFieldValue(field: Pick<AskRecordEditorField, 'kind'>, raw: string): string {
  const text = raw.trim();
  if (field.kind === 'APPROX_DATE') return approxParts(text).filter(Boolean).length >= 2 ? text : '';
  if (field.kind === 'MONEY' && /^\d{1,8}(?:\.\d{1,2})?$/.test(text)) return Number(text).toFixed(2);
  return text;
}

/** A client-side reason a value is unusable (required, shape). Domain and cross-field rules come back from the server. */
export function editorFieldProblem(field: AskRecordEditorField, value: string): string | null {
  if (!value) return field.required ? `${field.label} is required.` : null;
  if (field.kind === 'APPROX_DATE') return approxDateProblem(value);
  if (field.kind === 'DATE') return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? null : 'Enter a valid date.';
  if (field.kind === 'MONEY') return /^\d{1,8}(?:\.\d{2})$/.test(value) ? null : 'Enter an amount in dollars, such as 850 or 850.50.';
  if (field.kind === 'SELECT') return (field.options ?? []).some((option) => option.value === value) ? null : 'Choose an option.';
  return field.maxLength !== undefined && value.length > field.maxLength ? `Use at most ${field.maxLength} characters.` : null;
}

/** [precision, value, rangeEnd] of an APPROX_DATE string (`EXACT_DATE|2026-08-15`, `MONTH|2026-08`, `YEAR|2026`, `RANGE|from|to`). */
export function approxParts(text: string): [string, string, string] {
  const [precision = '', value = '', end = ''] = text.split('|');
  return [precision, value.trim(), end.trim()];
}

const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());

export function approxDateProblem(text: string): string | null {
  const [precision, value, end] = approxParts(text);
  if (precision === 'EXACT_DATE') return isDay(value) ? null : 'Enter a valid date.';
  if (precision === 'MONTH') return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? null : 'Enter a valid month.';
  if (precision === 'YEAR') return /^\d{4}$/.test(value) ? null : 'Enter a valid year.';
  if (precision === 'RANGE') return !isDay(value) || !isDay(end) ? 'Enter both dates of the range.' : end < value ? 'The end date must be on or after the start date.' : null;
  return 'Choose how exactly you know when it happened.';
}

const PRECISIONS = [['EXACT_DATE', 'Exact date'], ['MONTH', 'Month'], ['YEAR', 'Year'], ['RANGE', 'Date range']] as const;

// A date with the precision the person actually knows: the four precisions sit on one line as a segmented control, with the input(s) beside
// it at a comfortable width (two inputs for a range). Switching precision starts the date over rather than guessing a conversion.
function ApproxDateInput({ id, fieldKey, label, value, disabled, invalid, describedBy, todayMax, onChange, onBlur }: {
  id: string; fieldKey: string; label: string; value: string; disabled: boolean; invalid: boolean; describedBy?: string; todayMax: string; onChange: (value: string) => void; onBlur: () => void;
}) {
  const [precisionRaw, first, second] = approxParts(value);
  const precision = precisionRaw || 'EXACT_DATE';
  const field = cn(INPUT, invalid ? 'border-red-400' : 'border-slate-200');
  const compose = (a: string, b = '') => onChange(precision === 'RANGE' ? `RANGE|${a}|${b}` : `${precision}|${a}`);
  return <div role="group" aria-label={label} className="flex flex-wrap items-center gap-x-3 gap-y-2" data-approx-date="">
    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label={`${label} precision`}>
      {PRECISIONS.map(([key, text]) => <button key={key} type="button" disabled={disabled} aria-pressed={precision === key} onClick={() => onChange(`${key}|`)}
        className={cn('min-h-9 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors', precision === key ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-700 hover:bg-white')}>{text}</button>)}
    </div>
    {precision === 'EXACT_DATE' && <input id={id} data-editor-field={fieldKey} aria-label={`${label} value`} type="date" max={todayMax} value={first} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={describedBy} onBlur={onBlur} onChange={(event) => compose(event.target.value)} className={cn(field, 'w-44')} />}
    {precision === 'MONTH' && <input id={id} data-editor-field={fieldKey} aria-label={`${label} value`} type="month" max={todayMax.slice(0, 7)} value={first} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={describedBy} onBlur={onBlur} onChange={(event) => compose(event.target.value)} className={cn(field, 'w-44')} />}
    {precision === 'YEAR' && <input id={id} data-editor-field={fieldKey} aria-label={`${label} value`} type="number" inputMode="numeric" min={1600} max={Number(todayMax.slice(0, 4))} placeholder="YYYY" value={first} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={describedBy} onBlur={onBlur} onChange={(event) => compose(event.target.value)} className={cn(field, 'w-28')} />}
    {precision === 'RANGE' && <div className="flex flex-wrap items-center gap-2">
      <input id={id} data-editor-field={fieldKey} aria-label={`${label} from`} type="date" max={todayMax} value={first} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={describedBy} onBlur={onBlur} onChange={(event) => compose(event.target.value, second)} className={cn(field, 'w-44')} />
      <span className="text-sm text-slate-500" aria-hidden="true">to</span>
      <input aria-label={`${label} to`} type="date" max={todayMax} value={second} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={describedBy} onBlur={onBlur} onChange={(event) => compose(first, event.target.value)} className={cn(field, 'w-44')} />
    </div>}
  </div>;
}

export function RecordEditor({ editor, initialValues, title, mode = 'edit', saving, cancelling, error, saveLabel, autoFocus, crossFieldErrors, sensitiveConsent, onSubmit, onCancel }: {
  editor: AskRecordEditor;
  /** What the form starts from: the canonical values, or what the homeowner entered when the server sent the form back. */
  initialValues: Record<string, string>;
  title: string;
  /** 'add' starts from an empty record: Continue stays disabled (with the reason) until the required fields are valid. */
  mode?: 'edit' | 'add';
  saving: boolean;
  cancelling: boolean;
  /** A request-level failure (network, stale record); field problems come from `editor.errors`. */
  error: string | null;
  saveLabel?: string;
  autoFocus?: boolean;
  /** Rules that span fields (e.g. end after start), evaluated on the normalized values; shown as soon as they apply. */
  crossFieldErrors?: (values: Record<string, string>) => Record<string, string>;
  sensitiveConsent?: { checked: boolean; label: string; onChange: (checked: boolean) => void };
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const baseId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...editor.original, ...initialValues }));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  // A server problem on a field stays until that field is edited again.
  const [staleServerErrors, setStaleServerErrors] = useState<Record<string, boolean>>({});
  const adding = mode === 'add';
  const label = saveLabel ?? (adding ? 'Continue to review' : 'Review changes');
  const busy = saving || cancelling;
  const today = todayIso();

  const normalizedRaw = useMemo(() => Object.fromEntries(editor.fields.map((field) => [field.key, normalizeEditorFieldValue(field, values[field.key] ?? '')])), [editor.fields, values]);
  // A field that depends on another (an amount only for a purchase) is shown only for the right value, and is submitted empty while hidden.
  const shownKeys = useMemo(() => new Set(editor.fields.filter((field) => !field.visibleWhen || field.visibleWhen.in.includes(normalizedRaw[field.visibleWhen.field] ?? '')).map((field) => field.key)), [editor.fields, normalizedRaw]);
  const normalized = useMemo(() => Object.fromEntries(editor.fields.map((field) => [field.key, shownKeys.has(field.key) ? normalizedRaw[field.key] : ''])), [editor.fields, normalizedRaw, shownKeys]);
  const changedKeys = editor.fields.filter((field) => normalized[field.key] !== (editor.original[field.key] ?? '')).map((field) => field.key);
  const dirty = changedKeys.length > 0;
  const changedSet = new Set(changedKeys);
  const problems = useMemo(() => {
    const found: Record<string, string> = {};
    for (const field of editor.fields) {
      if (!shownKeys.has(field.key)) continue;
      const message = editorFieldProblem(field, normalized[field.key]);
      if (message) found[field.key] = message;
    }
    return found;
  }, [editor.fields, normalized, shownKeys]);
  const cross = useMemo(() => crossFieldErrors?.(normalized) ?? {}, [crossFieldErrors, normalized]);
  const serverErrors = Object.fromEntries(Object.entries(editor.errors ?? {}).filter(([key]) => !staleServerErrors[key]));
  // An empty required field is flagged only after a submit attempt: flagging it on blur shifted the layout under the pointer mid-click.
  const visibleError = (key: string): string | null => serverErrors[key] ?? cross[key] ?? ((attempted || (touched[key] && normalized[key])) ? problems[key] ?? null : null);
  const missing = editor.fields.filter((field) => shownKeys.has(field.key) && field.required && !normalized[field.key]).map((field) => (field.shortLabel ?? field.label).toLowerCase());
  const blockers = new Set([...Object.keys(problems), ...Object.keys(cross)]).size;
  const disabledReason = busy ? null
    : adding && missing.length > 0 ? `Add the ${missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}` : missing[0]} to continue.`
      : !adding && !dirty ? 'Change a detail to enable review.'
        : blockers > 0 ? `Fix ${blockers === 1 ? '1 field' : `${blockers} fields`} to continue.`
          : sensitiveConsent && !sensitiveConsent.checked ? 'Confirm that you are ready to review these financial details.' : null;

  useEffect(() => {
    if (!autoFocus) return;
    rootRef.current?.querySelector<HTMLElement>('input, select, textarea')?.focus({ preventScroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving the page with unsaved edits warns, and Cancel asks before throwing edits away.
  useEffect(() => {
    if (!dirty || typeof window === 'undefined') return undefined;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const requestCancel = () => { if (dirty) setConfirmingDiscard(true); else onCancel(); };

  // On a phone the editor is a full-height sheet; keep the page behind it from scrolling.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 767px)').matches) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  // A server-sent form (after a failed submit) moves focus to the first problem.
  useEffect(() => {
    const first = editor.fields.find((field) => editor.errors?.[field.key]);
    if (first) rootRef.current?.querySelector<HTMLElement>(`[data-editor-field="${first.key}"]`)?.focus();
  }, [editor.errors, editor.fields]);

  const change = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setStaleServerErrors((current) => ({ ...current, [key]: true }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (!dirty || blockers > 0 || (adding && missing.length > 0) || (sensitiveConsent && !sensitiveConsent.checked)) {
      const first = editor.fields.find((field) => problems[field.key] || cross[field.key]);
      if (first) rootRef.current?.querySelector<HTMLElement>(`[data-editor-field="${first.key}"]`)?.focus();
      return;
    }
    onSubmit(normalized);
  };

  const renderField = (field: AskRecordEditorField, span: string) => {
    const id = `${baseId}-${field.key}`;
    const message = visibleError(field.key);
    const value = values[field.key] ?? '';
    const pastNote = field.kind === 'DATE' && field.pastDateNote && /^\d{4}-\d{2}-\d{2}$/.test(value) && value < today ? field.pastDateNote : null;
    const describedBy = [message ? `${id}-error` : null, pastNote ? `${id}-note` : null, field.disabledReason ? `${id}-disabled` : null, field.helpText ? `${id}-help` : null].filter(Boolean).join(' ') || undefined;
    const common = {
      id, 'data-editor-field': field.key, disabled: busy || Boolean(field.disabledReason), 'aria-invalid': message ? true : undefined, 'aria-describedby': describedBy,
      'aria-required': field.required || undefined,
      className: cn(INPUT, message ? 'border-red-400' : changedSet.has(field.key) ? 'border-teal-500 bg-teal-50/40' : 'border-slate-200', field.disabledReason && 'cursor-not-allowed bg-slate-50 text-slate-600'),
      onBlur: () => setTouched((current) => ({ ...current, [field.key]: true })),
    } as const;
    return (
      <div key={field.key} className={span}>
        <label htmlFor={id} className="mb-1 block text-xs font-semibold text-slate-800">{field.label}{field.required ? <span aria-hidden="true"> *</span> : <span className="font-normal text-slate-500"> (optional)</span>}{!adding && changedSet.has(field.key) && <span className="ml-1.5 rounded bg-teal-100 px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-teal-800">Changed</span>}</label>
        {field.kind === 'APPROX_DATE' ? (
          <ApproxDateInput id={id} fieldKey={field.key} label={field.label} value={value} disabled={busy || Boolean(field.disabledReason)} invalid={Boolean(message)} describedBy={describedBy} todayMax={today} onChange={(next) => change(field.key, next)} onBlur={() => setTouched((current) => ({ ...current, [field.key]: true }))} />
        ) : field.kind === 'SELECT' ? (
          <select {...common} value={value} onChange={(event) => change(field.key, event.target.value)}>
            {field.emptyLabel ? <option value="">{field.emptyLabel}</option> : !value && <option value="">Choose…</option>}
            {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : field.kind === 'TEXTAREA' ? (
          <textarea {...common} rows={3} maxLength={field.maxLength} value={value} placeholder={field.placeholder} onChange={(event) => change(field.key, event.target.value)} />
        ) : field.kind === 'DATE' ? (
          <input {...common} type="date" value={value} onChange={(event) => change(field.key, event.target.value)} />
        ) : field.kind === 'MONEY' ? (
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">$</span>
            <input {...common} type="text" inputMode="decimal" autoComplete="off" value={value} placeholder={field.placeholder ?? '0.00'} className={cn(common.className, 'pl-7')} onChange={(event) => change(field.key, event.target.value)} />
          </div>
        ) : (
          <input {...common} type={field.inputType ?? 'text'} inputMode={field.inputType === 'email' ? 'email' : field.inputType === 'tel' ? 'tel' : undefined} autoComplete={field.inputType === 'email' ? 'email' : field.inputType === 'tel' ? 'tel' : undefined} maxLength={field.maxLength} value={value} placeholder={field.placeholder} onChange={(event) => change(field.key, event.target.value)} />
        )}
        {field.disabledReason && <p id={`${id}-disabled`} className="mt-1 text-xs text-slate-600">{field.disabledReason}</p>}
        {field.helpText && !message && !field.disabledReason && <p id={`${id}-help`} className="mt-1 text-xs text-slate-500">{field.helpText}</p>}
        {pastNote && <p id={`${id}-note`} className="mt-1 text-xs font-medium text-amber-800" role="note">{pastNote}</p>}
        {message && <p id={`${id}-error`} className="mt-1 text-xs font-medium text-red-700" role="alert">{message}</p>}
      </div>
    );
  };

  return (
    <section
      ref={rootRef}
      aria-label={title}
      data-record-editor=""
      className="max-md:fixed max-md:inset-0 max-md:z-50 max-md:flex max-md:flex-col max-md:bg-white md:mx-auto md:w-full md:max-w-[840px] md:rounded-2xl md:border md:border-slate-200 md:bg-white md:shadow-sm"
    >
      <form onSubmit={submit} noValidate aria-busy={busy} className="flex min-h-0 flex-1 flex-col">
        <header className="border-b border-slate-100 px-4 py-4 sm:px-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-700">{adding ? 'Add' : 'Edit'}</p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{adding ? title : editor.recordLabel}</h3>
          <p className="mt-1 text-sm text-slate-500">{adding ? 'Nothing is saved until you review and confirm.' : 'Nothing is saved until you review and confirm. Only what you change is listed.'}</p>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
          {editor.sections.map((section) => {
            const fields = editor.fields.filter((field) => field.section === section.id && shownKeys.has(field.key));
            if (fields.length === 0) return null;
            const spans = fieldSpans(fields);
            const grid = <div className="grid gap-x-4 gap-y-3 md:grid-cols-12">{fields.map((field) => renderField(field, spans[field.key]))}</div>;
            // Optional details start folded; a problem inside one opens it so it is never hidden.
            if (section.collapsed) {
              const hasProblem = fields.some((field) => visibleError(field.key));
              return <details key={section.id} open={hasProblem || undefined} className="group min-w-0 rounded-xl border border-slate-200 px-3 py-2" data-record-editor-more="">
                <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-950">{section.title}<span className="text-xs font-normal text-slate-500">Optional</span></summary>
                <div className="pt-3">{grid}</div>
              </details>;
            }
            return (
              <fieldset key={section.id} className="min-w-0 border-0 p-0">
                <legend className="mb-3 text-sm font-semibold text-slate-950">{section.title}</legend>
                {grid}
              </fieldset>
            );
          })}
        </div>
        {sensitiveConsent && <label className="mx-4 mb-3 flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 sm:mx-5"><input type="checkbox" checked={sensitiveConsent.checked} disabled={busy} onChange={(event) => sensitiveConsent.onChange(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600" />{sensitiveConsent.label}</label>}
        {error && <p className="px-4 pb-2 text-sm text-red-700 sm:px-5" role="alert">{error}</p>}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-4 py-3 sm:px-5">
          {confirmingDiscard ? (
            <div className="flex flex-wrap items-center gap-2" role="alertdialog" aria-label="Discard your changes?">
              <span className="text-sm font-medium text-slate-800">Discard your changes?</span>
              <button type="button" disabled={busy} onClick={() => setConfirmingDiscard(false)} className="min-h-11 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Keep editing</button>
              <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-xl px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Discard</button>
            </div>
          ) : (
            <button type="button" disabled={busy} onClick={requestCancel} className="min-h-11 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">{cancelling ? 'Cancelling…' : 'Cancel'}</button>
          )}
          <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
            {disabledReason && <p className="text-xs font-medium text-slate-600" id={`${baseId}-reason`}>{disabledReason}</p>}
            <button type="submit" disabled={busy || !dirty || (adding && (missing.length > 0 || blockers > 0)) || Boolean(sensitiveConsent && !sensitiveConsent.checked)} aria-describedby={disabledReason ? `${baseId}-reason` : undefined} className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{saving ? (adding ? 'Saving…' : 'Checking…') : label}</button>
          </div>
        </footer>
      </form>
    </section>
  );
}
