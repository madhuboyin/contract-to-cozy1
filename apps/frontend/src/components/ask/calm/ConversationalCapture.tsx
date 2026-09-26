'use client';

import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CaptureFieldControl } from '@/components/property-context/CaptureFieldControl';
import type { ScalarCaptureInputSchema, StructuredCaptureField } from '@/components/property-context/featureContextTypes';
import { QUICK_REPLY_LIMIT, answerLabel, hasAnswer, isFieldActive, nextStepIndex, stepQuestion } from '@/features/ask/conversationalCapture';
import type { AskCaptureRequest } from '@/features/ask/types';
import { AskContextLink } from '../blocks/context';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.12 IW-CONV-004/005 (FRD v1.112): the capture as a short conversation. Cozy asks one question at
// a time; a bounded choice is answered with one tap and moves on; an optional question can be skipped; any earlier answer can be
// changed. When every question is answered or skipped the same single request is submitted, and the review that follows is the
// existing confirmation. Nothing is written by this component.
export function ConversationalCapture({ request, fields, values, saving, error, autoFocus = false, onChange, onSubmit }: {
  request: AskCaptureRequest;
  fields: StructuredCaptureField[];
  values: Record<string, unknown>;
  saving: boolean;
  error: string | null;
  autoFocus?: boolean;
  onChange: (key: string, value: unknown) => void;
  /** Submits the whole group with the final values (passed in because state has not settled yet). */
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  const active = fields.filter((field) => isFieldActive(field, values));
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const index = nextStepIndex(active, values, skipped, editing);
  const step = index === null ? null : active[index];
  const submittedRef = useRef(false);
  const rootRef = useRef<HTMLElement>(null);
  // Nothing is submitted until the homeowner has answered or skipped a question here, so a restored draft (or a value the server
  // rejected) never re-submits by itself; it shows the answers and a Continue button instead.
  const [interacted, setInteracted] = useState(false);

  // Everything is answered or skipped: submit once. A failed save returns here through `error`, so the last step stays reachable.
  useEffect(() => {
    if (index !== null || !interacted || saving || submittedRef.current || error) return;
    submittedRef.current = true;
    onSubmit(values);
  }, [index, interacted, saving, error, onSubmit, values]);
  useEffect(() => { if (error) submittedRef.current = false; }, [error]);

  // Move focus to the new question so keyboard and screen-reader users follow the conversation.
  useEffect(() => {
    if (!interacted && !autoFocus) return;
    // The question itself takes focus (no focus ring on a chip), so a screen reader reads it and Tab reaches the first answer.
    rootRef.current?.querySelector<HTMLElement>('[data-capture-question]')?.focus({ preventScroll: true });
    // Only a change of question moves focus; typing or an unrelated re-render must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.key]);

  const answer = (field: StructuredCaptureField, value: unknown) => {
    setInteracted(true);
    submittedRef.current = false;
    onChange(field.key, value);
    setSkipped((current) => { const next = new Set(current); next.delete(field.key); return next; });
    setEditing(null);
  };
  const skip = (field: StructuredCaptureField) => {
    setInteracted(true);
    submittedRef.current = false;
    onChange(field.key, undefined);
    setSkipped((current) => new Set(current).add(field.key));
    setEditing(null);
  };

  const answered = active.filter((field) => hasAnswer(values[field.key]) && field.key !== step?.key);
  return (
    <section ref={rootRef} data-conversational-capture="" aria-busy={saving} className="space-y-3">
      {answered.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Your answers so far">
          {answered.map((field) => (
            <li key={field.key}>
              <button type="button" disabled={saving} onClick={() => setEditing(field.key)} className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 hover:bg-slate-200 disabled:opacity-50">
                <span className="truncate"><span className="text-slate-500">{field.label}: </span>{answerLabel(field, values[field.key])}</span>
                <Pencil className="h-3 w-3 shrink-0 text-slate-500" aria-hidden="true" /><span className="sr-only">Change {field.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {step && (
        <div data-capture-step={step.key} className="space-y-2">
          <p data-capture-question="" tabIndex={-1} className="text-[17px] font-medium leading-snug text-slate-900 outline-none">{stepQuestion(step, index ?? 0, request.question)}{!step.required && <span className="ml-1.5 text-sm font-normal text-slate-500">(optional)</span>}</p>
          {step.helpText && step.helpText.toLowerCase() !== 'optional' && <p className="text-sm text-slate-500">{step.helpText}</p>}
          <StepInput step={step} value={values[step.key]} saving={saving} allowNotSure={request.allowNotSure} onAnswer={(value) => answer(step, value)} onSkip={step.required ? undefined : () => skip(step)} />
        </div>
      )}
      {!step && saving && <p className="text-sm text-slate-500" role="status">Preparing your review…</p>}
      {!step && !saving && (!interacted || Boolean(error)) && <button type="button" onClick={() => { setInteracted(true); submittedRef.current = true; onSubmit(values); }} className="min-h-10 rounded-full bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800">Continue</button>}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {request.destinationLabel && <p className="text-xs text-slate-500">{request.destinationLabel}.</p>}
      {request.fallbackHref && <AskContextLink href={request.fallbackHref} className="inline-flex text-sm font-medium text-teal-800 hover:underline">Open the full form instead</AskContextLink>}
    </section>
  );
}

function StepInput({ step, value, saving, allowNotSure, onAnswer, onSkip }: {
  step: StructuredCaptureField;
  value: unknown;
  saving: boolean;
  allowNotSure: boolean;
  onAnswer: (value: unknown) => void;
  onSkip?: () => void;
}) {
  const schema = step.inputSchema as ScalarCaptureInputSchema;
  const [draft, setDraft] = useState<unknown>(value);
  useEffect(() => { setDraft(value); }, [step.key, value]);

  const chip = (label: string, chosen: unknown, key: string) => (
    <button key={key} type="button" disabled={saving} onClick={() => onAnswer(chosen)} className="min-h-10 max-w-full rounded-full border border-slate-200 bg-white px-3.5 py-2 text-left text-sm text-slate-800 transition hover:border-teal-400 hover:bg-teal-50 disabled:opacity-50">{label}</button>
  );
  if (schema.type === 'BOOLEAN') {
    return <div className="flex flex-wrap gap-2">{[chip(schema.trueLabel, true, 'yes'), chip(schema.falseLabel, false, 'no')]}{onSkip && <SkipButton onSkip={onSkip} saving={saving} />}</div>;
  }
  if (schema.type === 'SINGLE_SELECT' && schema.options.length <= QUICK_REPLY_LIMIT) {
    return <div className="flex flex-wrap gap-2">{schema.options.map((option) => chip(option.label, option.value, option.value))}{onSkip && <SkipButton onSkip={onSkip} saving={saving} />}</div>;
  }
  if (schema.type === 'SINGLE_SELECT') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`capture-${step.key}`}>{step.label}</label>
        <select id={`capture-${step.key}`} disabled={saving} value={typeof draft === 'string' ? draft : ''} onChange={(event) => setDraft(event.target.value)} className="min-h-10 max-w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900">
          <option value="">Choose one</option>
          {schema.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ContinueButton disabled={saving || !hasAnswer(draft)} onClick={() => onAnswer(draft)} />
        {onSkip && <SkipButton onSkip={onSkip} saving={saving} />}
      </div>
    );
  }
  // Numbers, short text and time: the shared control without its card, then Continue and (when optional) Skip.
  return (
    <form onSubmit={(event) => { event.preventDefault(); if (hasAnswer(draft)) onAnswer(draft); }} className="flex flex-wrap items-center gap-2">
      <CaptureFieldControl bare field={{ key: step.key, label: step.label, required: step.required, inputSchema: schema }} value={draft} disabled={saving} allowNotSure={allowNotSure} onChange={setDraft} />
      <ContinueButton type="submit" disabled={saving || !hasAnswer(draft)} />
      {onSkip && <SkipButton onSkip={onSkip} saving={saving} />}
    </form>
  );
}

function ContinueButton({ disabled, onClick, type = 'button' }: { disabled: boolean; onClick?: () => void; type?: 'button' | 'submit' }) {
  return <button type={type} disabled={disabled} onClick={onClick} className={cn('min-h-10 rounded-full bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-40')}>Continue</button>;
}
function SkipButton({ onSkip, saving }: { onSkip: () => void; saving: boolean }) {
  return <button type="button" disabled={saving} onClick={onSkip} className="min-h-10 rounded-full px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Skip</button>;
}
