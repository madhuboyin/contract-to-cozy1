'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, FileUp, Loader2 } from 'lucide-react';
import type { AskIntakeCandidate, AskIntakeConfig, AskIntakeKind, AskIntakeView } from '@/features/ask/types';
import { RECOMMENDATION_LABELS, REPORT_TYPE_LABELS, SENSITIVITY_CHOICES, candidateStatusLabel, canAddToHome, confidenceLabel, formatBytes, formatCostRange, kindLabel, originalHref } from './intakePresentation';

const BUTTON = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-50';
const PRIMARY = `${BUTTON} bg-emerald-950 text-white hover:bg-emerald-900`;
const SECONDARY = `${BUTTON} border border-slate-300 bg-white text-slate-900 hover:bg-slate-50`;

/** Step 1: choose a file. A file chooser is the main path; the camera, drop and paste are additions, never the only way (FR-INPUT-005). */
export function IntakePicker({ config, busy, onFile, problem }: { config: AskIntakeConfig; busy: boolean; onFile: (file: File, sensitivity: string) => void; problem: string | null }) {
  const chooser = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [sensitivity, setSensitivity] = useState('STANDARD');
  const accept = config.acceptedTypes.join(',');
  const take = (list: FileList | null, input: HTMLInputElement | null) => { const file = list?.[0]; if (input) input.value = ''; if (file) onFile(file, sensitivity); };
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center" data-intake-dropzone>
        <p className="text-sm font-semibold text-slate-900">Add a PDF or photo</p>
        <p className="mt-1 text-xs text-slate-600">A warranty, receipt, insurance policy, inspection report, or an appliance label. Up to {formatBytes(config.maxBytes)}. You can also drop or paste a file here.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button type="button" className={PRIMARY} disabled={busy} onClick={() => chooser.current?.click()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileUp className="h-4 w-4" aria-hidden="true" />}{busy ? 'Adding…' : 'Choose a file'}</button>
          <button type="button" className={SECONDARY} disabled={busy} onClick={() => camera.current?.click()}><Camera className="h-4 w-4" aria-hidden="true" />Take a photo</button>
        </div>
        <input ref={chooser} type="file" accept={accept} className="sr-only" tabIndex={-1} aria-label="Choose a file to add" onChange={(event) => take(event.target.files, chooser.current)} />
        <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-label="Take a photo to add" onChange={(event) => take(event.target.files, camera.current)} />
      </div>
      {problem && <p className="text-sm text-red-700" role="alert">{problem}</p>}
      <div>
        <label htmlFor="ask-intake-sensitivity" className="text-sm font-semibold text-slate-900">Who can see this file</label>
        <select id="ask-intake-sensitivity" value={sensitivity} onChange={(event) => setSensitivity(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900">
          {SENSITIVITY_CHOICES.filter((choice) => config.sensitivities.includes(choice.value)).map((choice) => <option key={choice.value} value={choice.value}>{choice.label}: {choice.hint}</option>)}
        </select>
      </div>
      <div className="space-y-1 text-xs text-slate-600" data-intake-disclosures>
        <p>{config.disclosures.retention}</p>
        <p>{config.disclosures.sharing}</p>
        <p data-intake-safety>{config.safetyChecks.statement}</p>
        <p className="font-semibold text-slate-800">The file is kept first. Nothing is read until you choose to.</p>
      </div>
    </div>
  );
}

/** Step 2: say what the file is and agree to it being read. The one question asked is the one the server could not answer. */
export function IntakeReadStep({ view, config, busy, onRead, onKeep, onDiscard }: {
  view: AskIntakeView; config: AskIntakeConfig; busy: boolean;
  onRead: (kind: AskIntakeKind | 'AUTO', acknowledged: boolean, inspection?: { reportType: string; inspectionDate: string }) => void; onKeep: () => void; onDiscard: () => void;
}) {
  const isPdf = view.provenance.original.mimeType === 'application/pdf';
  const fixed = view.choice?.options.map((option) => option.kind);
  const options = config.kinds.filter((option) => (fixed ? fixed.includes(option.kind) : isPdf ? option.kind !== 'APPLIANCE_LABEL' : option.acceptsImages));
  const [kind, setKind] = useState<AskIntakeKind | 'AUTO'>(view.needsDetails ? 'INSPECTION_REPORT' : fixed ? options[0]?.kind ?? 'AUTO' : 'AUTO');
  const [acknowledged, setAcknowledged] = useState(false);
  const [reportType, setReportType] = useState('GENERAL');
  const [inspectionDate, setInspectionDate] = useState('');
  const readsLocally = kind === 'APPLIANCE_LABEL';
  const needsDate = kind === 'INSPECTION_REPORT';
  const ready = (readsLocally || acknowledged) && (!needsDate || Boolean(inspectionDate));
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700" role="status">Kept in your Home Records as <span className="font-semibold">{view.provenance.original.fileName}</span>. It has not been read yet.</p>
      {(view.choice || view.needsDetails) && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="note" data-intake-question>{view.choice?.reason ?? 'An inspection report needs its type and the date the inspection happened.'}</p>}
      <fieldset>
        <legend className="text-sm font-semibold text-slate-900">What is this file?</legend>
        <div className="mt-2 space-y-2">
          {!fixed && !view.needsDetails && (
            <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm has-[:checked]:border-emerald-700 has-[:checked]:bg-emerald-50">
              <input type="radio" name="ask-intake-kind" checked={kind === 'AUTO'} onChange={() => setKind('AUTO')} className="mt-1" /><span><span className="block font-semibold text-slate-900">Let Cozy decide</span><span className="block text-xs text-slate-600">It reads the file and tells you what it found. If it is not sure, it asks.</span></span>
            </label>
          )}
          {options.map((option) => (
            <label key={option.kind} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm has-[:checked]:border-emerald-700 has-[:checked]:bg-emerald-50">
              <input type="radio" name="ask-intake-kind" checked={kind === option.kind} onChange={() => setKind(option.kind)} className="mt-1" /><span><span className="block font-semibold text-slate-900">{option.label}</span><span className="block text-xs text-slate-600">{option.description}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      {needsDate && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="ask-intake-report-type" className="text-sm font-semibold text-slate-900">Report type</label>
            <select id="ask-intake-report-type" value={reportType} onChange={(event) => setReportType(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
              {(view.needsDetails?.reportTypes ?? Object.keys(REPORT_TYPE_LABELS)).map((type) => <option key={type} value={type}>{REPORT_TYPE_LABELS[type] ?? type}</option>)}
            </select></div>
          <div><label htmlFor="ask-intake-report-date" className="text-sm font-semibold text-slate-900">Inspection date</label>
            <input id="ask-intake-report-date" type="date" value={inspectionDate} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setInspectionDate(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" /></div>
        </div>
      )}
      <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700" data-intake-processing>
        {readsLocally ? <p>{config.disclosures.localProcessing}</p> : (
          <>
            <p>{config.disclosures.modelProcessing}</p>
            <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-2 text-sm font-semibold text-slate-900"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1" />I understand this file will be sent to an AI service to be read.</label>
          </>
        )}
        <p className="mt-1">{config.disclosures.confirmation}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={PRIMARY} disabled={busy || !ready} onClick={() => onRead(kind, acknowledged, needsDate ? { reportType, inspectionDate } : undefined)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}{busy ? 'Reading…' : 'Read this file'}</button>
        <button type="button" className={SECONDARY} disabled={busy} onClick={onKeep}>Keep without reading</button>
        <button type="button" className={SECONDARY} disabled={busy} onClick={onDiscard}>Remove file</button>
      </div>
    </div>
  );
}

function EvidenceLine({ candidate }: { candidate: AskIntakeCandidate }) {
  const { evidence } = candidate;
  if (evidence.status === 'NOT_RECORDED') return <p className="mt-0.5 text-xs text-slate-500" data-intake-evidence="none">{evidence.reason}</p>;
  const { value } = evidence;
  return (
    <p className="mt-0.5 text-xs text-slate-600" data-intake-evidence={value.basis}>
      <span className="font-semibold text-slate-700">{value.description || 'Location recorded'}</span>
      {value.basis === 'MODEL_REPORTED' ? ' (reported by the reader, not checked)' : ' (found in the file’s text)'}
      {value.excerpt ? <q className="mt-0.5 block break-words italic text-slate-500">…{value.excerpt}…</q> : null}
    </p>
  );
}

function CandidateRow({ candidate, busy, editable, onReview }: { candidate: AskIntakeCandidate; busy: boolean; editable: boolean; onReview: (action: 'CONFIRM' | 'CORRECT' | 'REJECT', value?: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(candidate.effectiveValue ?? candidate.proposedValue ?? '');
  const confidence = confidenceLabel(candidate.confidence);
  const rejected = candidate.reviewStatus === 'REJECTED';
  const cost = candidate.finding ? formatCostRange(candidate.finding.costRangeCents) : null;
  return (
    <li className="px-3 py-2" data-intake-candidate={candidate.fieldKey}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{candidate.label}{candidate.required ? ' (needed)' : ''}</span>
        <span className="text-xs text-slate-600">{candidateStatusLabel(candidate)} · <span className={confidence.low ? 'font-semibold text-amber-800' : undefined}>{confidence.text}</span></span>
      </div>
      {editing ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`ask-intake-edit-${candidate.id}`}>{candidate.label}</label>
          <input id={`ask-intake-edit-${candidate.id}`} value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm" />
          <button type="button" className={PRIMARY} disabled={busy || !draft.trim()} onClick={() => { onReview('CORRECT', draft.trim()); setEditing(false); }}>Save</button>
          <button type="button" className={SECONDARY} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      ) : (
        <>
          <p className={`mt-0.5 break-words text-sm ${rejected ? 'text-slate-400 line-through' : 'text-slate-950'}`}>{candidate.proposedValue ?? 'Nothing found'}{candidate.reviewStatus === 'CORRECTED' && candidate.effectiveValue ? <span className="ml-2 no-underline text-emerald-900">→ {candidate.effectiveValue}</span> : null}</p>
          {candidate.finding && (
            <p className="mt-0.5 text-xs text-slate-700" data-intake-finding>
              {[candidate.finding.location, RECOMMENDATION_LABELS[candidate.finding.recommendation] ?? candidate.finding.recommendation, cost ? `Estimated ${cost}` : null].filter(Boolean).join(' · ')}
              {candidate.finding.interpretation ? <span className="mt-0.5 block text-slate-600">{candidate.finding.interpretation}</span> : null}
            </p>
          )}
          <EvidenceLine candidate={candidate} />
          <div className="mt-1 flex flex-wrap gap-2">
            <button type="button" className={SECONDARY} disabled={busy || candidate.reviewStatus === 'CONFIRMED' || !candidate.proposedValue} onClick={() => onReview('CONFIRM')} aria-label={`Accept ${candidate.label}`}>Accept</button>
            {editable && <button type="button" className={SECONDARY} disabled={busy} onClick={() => { setDraft(candidate.effectiveValue ?? candidate.proposedValue ?? ''); setEditing(true); }} aria-label={`Edit ${candidate.label}`}>Edit</button>}
            <button type="button" className={SECONDARY} disabled={busy || rejected} onClick={() => onReview('REJECT')} aria-label={`Reject ${candidate.label}`}>Reject</button>
          </div>
        </>
      )}
    </li>
  );
}

/** Step 3 (documents): every proposed detail can be accepted, edited, rejected, or left for later. Nothing is added until "Add to my home". */
export function IntakeCandidates({ view, busy, onReview, onAdd, onDiscard }: { view: AskIntakeView; busy: boolean; onReview: (id: string, action: 'CONFIRM' | 'CORRECT' | 'REJECT', value?: string) => void; onAdd: () => void; onDiscard: () => void }) {
  const allowed = canAddToHome(view);
  const inspection = view.kind === 'INSPECTION_REPORT';
  const accepted = view.candidates.filter((candidate) => candidate.reviewStatus === 'CONFIRMED').length;
  const undecided = view.candidates.filter((candidate) => candidate.reviewStatus === 'PENDING').length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700" role="status">Cozy read this as <span className="font-semibold">{kindLabel(view.kind)}</span>{view.classification ? ` (${confidenceLabel(view.classification.confidence).text})` : ''}. {inspection ? 'Accept the findings you want. Only those are added, as a new inspection report. Rejected and undecided ones are never added.' : 'Check each detail. Nothing is added to your home until you choose to.'}</p>
      {view.candidates.length === 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="note" data-intake-empty>{inspection ? 'No findings could be read from this report, so there is nothing to add.' : 'Nothing could be read from this file.'}</p>}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {view.candidates.map((candidate) => <CandidateRow key={`${candidate.id}:${candidate.reviewStatus}:${candidate.effectiveValue}`} candidate={candidate} busy={busy} editable={!inspection} onReview={(action, value) => onReview(candidate.id, action, value)} />)}
      </ul>
      {view.missingRequired.length > 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="note" data-intake-missing>Still needed before this can be added: {view.missingRequired.join(', ')}. Edit a detail to fill it in.</p>}
      {!inspection && view.missingRequired.length === 0 && !allowed && <p className="text-sm text-slate-600" role="note">Accept or edit the details marked “needed” to continue. Others can stay undecided.</p>}
      {inspection && view.candidates.length > 0 && <p className="text-sm text-slate-600" role="status" data-intake-tally>{accepted} accepted · {undecided} undecided · {view.candidates.length - accepted - undecided} rejected</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={PRIMARY} disabled={busy || !allowed} onClick={onAdd}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}{inspection ? `Create the report from ${accepted} accepted ${accepted === 1 ? 'finding' : 'findings'}` : 'Add to my home'}</button>
        <button type="button" className={SECONDARY} disabled={busy} onClick={onDiscard}>Remove file</button>
      </div>
    </div>
  );
}

/** Step 3 (label): the draft inventory item. Editable, and it is only an inventory item after "Add to inventory". */
export function IntakeLabelReview({ view, busy, onSave, onConfirm, onReject }: { view: AskIntakeView; busy: boolean; onSave: (patch: Record<string, string | null>) => void; onConfirm: () => void; onReject: () => void }) {
  const draft = view.labelDraft!;
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(draft.fields.map((field) => [field.key, field.value ?? ''])));
  const [name, setName] = useState('');
  const dirty = draft.fields.some((field) => (values[field.key] ?? '') !== (field.value ?? ''));
  const empty = draft.fields.every((field) => !(values[field.key] ?? '').trim());
  const save = () => onSave({ ...Object.fromEntries(draft.fields.map((field) => [field.key, values[field.key]?.trim() || null])), ...(name.trim() ? { name: name.trim() } : {}) });
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700" role="status">Cozy read these details from the label. Check them against the photo. This is a draft; it is not in your inventory yet.</p>
      {empty && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="note">No details could be read from this photo. You can type them in, or reject it.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="text-sm font-semibold text-slate-900" htmlFor="ask-intake-label-name">Name (optional)</label>
          <input id="ask-intake-label-name" value={name} maxLength={160} onChange={(event) => setName(event.target.value)} placeholder="For example, Water heater" className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" /></div>
        {draft.fields.map((field) => {
          const confidence = field.confidence === null ? null : confidenceLabel(field.confidence);
          return (
            <div key={field.key}><label className="text-sm font-semibold text-slate-900" htmlFor={`ask-intake-label-${field.key}`}>{field.label}{confidence ? <span className={`ml-2 text-xs font-normal ${confidence.low ? 'text-amber-800' : 'text-slate-600'}`}>{confidence.text}</span> : null}</label>
              <input id={`ask-intake-label-${field.key}`} value={values[field.key] ?? ''} maxLength={160} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" /></div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {(dirty || name.trim()) && <button type="button" className={SECONDARY} disabled={busy} onClick={save}>Save changes</button>}
        <button type="button" className={PRIMARY} disabled={busy || dirty || Boolean(name.trim()) || empty} onClick={onConfirm} title={dirty || name.trim() ? 'Save your changes first' : undefined}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}Add to inventory</button>
        <button type="button" className={SECONDARY} disabled={busy} onClick={onReject}>Reject</button>
      </div>
    </div>
  );
}

/** What the file's record shows: where it came from, how it was checked and read, and what is not known. */
export function IntakeProvenance({ view }: { view: AskIntakeView }) {
  const { original, reader, pageAndRegion } = view.provenance;
  return (
    <details className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700" data-intake-provenance>
      <summary className="cursor-pointer text-sm font-semibold text-slate-900">Where this came from</summary>
      <dl className="mt-2 grid gap-x-3 gap-y-1 sm:grid-cols-[auto,1fr]">
        <dt className="font-semibold">Original</dt><dd className="break-words">{original.fileName} · {formatBytes(original.sizeBytes)} · added {new Date(original.uploadedAt).toLocaleDateString()}</dd>
        <dt className="font-semibold">Checks</dt><dd>{original.contentChecks}</dd>
        <dt className="font-semibold">Fingerprint</dt><dd className="break-all font-mono">{original.sha256}</dd>
        <dt className="font-semibold">Read by</dt><dd>{reader.status === 'AVAILABLE' ? reader.value.name : reader.reason}</dd>
        <dt className="font-semibold">Page and place</dt><dd>{pageAndRegion.status === 'NOT_RECORDED' ? pageAndRegion.reason : `Recorded for ${pageAndRegion.value.located} of ${pageAndRegion.value.total} details`}</dd>
      </dl>
      <Link href={originalHref(view)} className="mt-2 inline-block font-semibold text-emerald-900 underline">Open the original in your Home Records</Link>
    </details>
  );
}
