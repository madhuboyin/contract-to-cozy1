'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, FileSearch, ShieldQuestion } from 'lucide-react';
import type {
  PermitFlagItem,
  PermitRecordSearchOutcome,
  PermitResearchChannel,
  PermitUnpermittedFlagStatus,
  UpdateFlagPayload,
} from '@/types';
import { FLAG_STATUS_LABELS, FLAG_STATUS_COLOR, RISK_LABELS, RISK_COLOR, WORK_TYPE_LABELS } from './PermitUtils';
import { ProjectProofUploader, type ProjectProof } from '@/components/projects/ProjectProofUploader';

interface Props {
  propertyId: string;
  flag: PermitFlagItem;
  onUpdate: (patch: UpdateFlagPayload) => Promise<void>;
  onCreateRemediationCase: () => Promise<void>;
  highlighted?: boolean;
}

const RESOLVED_STATUSES: PermitUnpermittedFlagStatus[] = [
  'CONFIRMED_PERMITTED', 'REMEDIATED', 'DISMISSED',
];

export default function UnpermittedFlagCard({
  propertyId,
  flag,
  onUpdate,
  onCreateRemediationCase,
  highlighted,
}: Props) {
  const [expanded, setExpanded] = useState(!!highlighted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState(flag.resolutionNotes ?? '');
  const [searchOutcome, setSearchOutcome] = useState<PermitRecordSearchOutcome>(flag.recordSearchOutcome);
  const [coverage, setCoverage] = useState(flag.recordsCoverageDescription ?? '');
  const [researchChannel, setResearchChannel] = useState<PermitResearchChannel>(flag.researchChannel);
  const [sourceReference, setSourceReference] = useState(flag.researchSourceReference ?? '');
  const [resolvedByPermitId, setResolvedByPermitId] = useState(flag.resolvedByPermitId ?? '');
  const [authorityOutcome, setAuthorityOutcome] = useState<'CONFIRMED_PERMITTED' | 'CONFIRMED_UNPERMITTED' | ''>(
    flag.authorityOutcome === 'CONFIRMED_PERMITTED' || flag.authorityOutcome === 'CONFIRMED_UNPERMITTED'
      ? flag.authorityOutcome
      : '',
  );
  const [proofDocuments, setProofDocuments] = useState<ProjectProof[]>([]);

  const evidenceDocumentIds = Array.from(new Set([
    ...flag.evidenceDocumentIds,
    ...proofDocuments.map((proof) => proof.documentId).filter((id): id is string => Boolean(id)),
  ]));

  function researchPatch(status?: PermitUnpermittedFlagStatus): UpdateFlagPayload {
    return {
      status,
      recordSearchOutcome: searchOutcome,
      recordsCoverageDescription: coverage.trim() || undefined,
      evidenceDocumentIds,
      researchChannel,
      researchSourceReference: sourceReference.trim() || undefined,
      resolvedByPermitId: resolvedByPermitId.trim() || undefined,
      authorityOutcome: authorityOutcome || undefined,
      authorityObservedAt: authorityOutcome ? new Date().toISOString().slice(0, 10) : undefined,
      resolutionNotes: note.trim() || undefined,
    };
  }

  async function saveResearch(status?: PermitUnpermittedFlagStatus) {
    setSaving(true);
    setError('');
    try {
      await onUpdate(researchPatch(status));
    } catch (caught: any) {
      setError(caught?.message ?? 'Could not save this research outcome.');
    } finally {
      setSaving(false);
    }
  }

  async function createRemediation() {
    setSaving(true);
    setError('');
    try {
      await onCreateRemediationCase();
    } catch (caught: any) {
      setError(caught?.message ?? 'Could not create the remediation case.');
    } finally {
      setSaving(false);
    }
  }

  const isResolved = RESOLVED_STATUSES.includes(flag.status);

  return (
    <div className={`overflow-hidden rounded-2xl border bg-[hsl(var(--mobile-card-bg))] ${isResolved ? 'opacity-80' : ''} ${highlighted ? 'ring-2 ring-sky-400' : ''}`}>
      <button
        className="flex w-full items-start gap-3 p-4 text-left"
        onClick={() => setExpanded((value) => !value)}
      >
        <ShieldQuestion className={`mt-0.5 h-5 w-5 shrink-0 ${flag.disclosureRisk === 'HIGH' ? 'text-red-500' : flag.disclosureRisk === 'MEDIUM' ? 'text-amber-500' : 'text-neutral-400'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{WORK_TYPE_LABELS[flag.workType]}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_COLOR[flag.disclosureRisk]}`}>
              {RISK_LABELS[flag.disclosureRisk]}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${FLAG_STATUS_COLOR[flag.status]}`}>
              {FLAG_STATUS_LABELS[flag.status]}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-[hsl(var(--mobile-text-secondary))]">{flag.flagReason}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {flag.recordSearchOutcome.replace(/_/g, ' ').toLowerCase()} · evidence confidence {flag.evidenceConfidence.toLowerCase().replace(/_/g, ' ')}
          </p>
        </div>
        {expanded ? <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-neutral-400" /> : <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-neutral-400" />}
      </button>

      {expanded && (
        <div className="space-y-4 border-t px-4 pb-4">
          <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
            A missing record is not proof that work was illegal or unpermitted. Record what was searched, attach evidence, and use an authority-backed outcome for any definitive disposition.
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">
              Record search outcome
              <select value={searchOutcome} onChange={(event) => setSearchOutcome(event.target.value as PermitRecordSearchOutcome)} className="h-10 w-full rounded-lg border bg-white px-2 text-xs">
                <option value="NOT_SEARCHED">Not searched</option>
                <option value="MATCH_FOUND">Match found</option>
                <option value="NOT_FOUND_IN_AVAILABLE_RECORDS">Not found in available records</option>
                <option value="RECORDS_UNAVAILABLE">Records unavailable</option>
                <option value="INCONCLUSIVE">Inconclusive</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium">
              Research channel
              <select value={researchChannel} onChange={(event) => setResearchChannel(event.target.value as PermitResearchChannel)} className="h-10 w-full rounded-lg border bg-white px-2 text-xs">
                <option value="NONE">Not started</option>
                <option value="OPEN_DATA">Open data</option>
                <option value="DOCUMENT_REVIEW">Document review</option>
                <option value="LICENSED_PROFESSIONAL">Licensed professional</option>
                <option value="MUNICIPAL_AUTHORITY">Municipal authority</option>
                <option value="REAL_ESTATE_ATTORNEY">Real-estate attorney</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1 text-xs font-medium">
            Records searched
            <input value={coverage} onChange={(event) => setCoverage(event.target.value)} placeholder="Portal, date range, uploaded closing file, permit index…" className="h-10 w-full rounded-lg border px-3 text-xs" />
          </label>
          <label className="block space-y-1 text-xs font-medium">
            Professional or authority source
            <input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} placeholder="Department, representative, correspondence, or report reference" className="h-10 w-full rounded-lg border px-3 text-xs" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">
              Matched permit ID
              <input value={resolvedByPermitId} onChange={(event) => setResolvedByPermitId(event.target.value)} placeholder="Authority-sourced permit record ID" className="h-10 w-full rounded-lg border px-3 text-xs" />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Authority outcome
              <select value={authorityOutcome} onChange={(event) => setAuthorityOutcome(event.target.value as typeof authorityOutcome)} className="h-10 w-full rounded-lg border bg-white px-2 text-xs">
                <option value="">No determination</option>
                <option value="CONFIRMED_PERMITTED">Confirmed permitted</option>
                <option value="CONFIRMED_UNPERMITTED">Confirmed unpermitted</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-xs font-medium">
            Research or disposition notes
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="w-full resize-none rounded-xl border bg-neutral-50 px-3 py-2 text-xs" />
          </label>

          <div>
            <p className="mb-2 text-xs font-medium">Evidence documents ({evidenceDocumentIds.length})</p>
            <ProjectProofUploader propertyId={propertyId} value={proofDocuments} onChange={setProofDocuments} />
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => saveResearch(flag.status === 'UNKNOWN' ? 'INVESTIGATING' : undefined)} disabled={saving} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
              <FileSearch className="mr-1 inline h-3.5 w-3.5" /> Save research
            </button>
            {!isResolved && (
              <>
                <button onClick={() => saveResearch('CONFIRMED_PERMITTED')} disabled={saving} className="rounded-xl border px-3 py-2 text-xs font-medium">Record permitted outcome</button>
                <button onClick={() => saveResearch('CONFIRMED_UNPERMITTED')} disabled={saving} className="rounded-xl border px-3 py-2 text-xs font-medium">Record authority gap</button>
                <button onClick={() => saveResearch('DISMISSED')} disabled={saving} className="rounded-xl border px-3 py-2 text-xs font-medium">Dismiss with evidence</button>
              </>
            )}
            {!flag.remediationCaseId && ['INVESTIGATING', 'CONFIRMED_UNPERMITTED'].includes(flag.status) && (
              <button onClick={createRemediation} disabled={saving} className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-medium text-purple-800">Create remediation case</button>
            )}
            {flag.remediationCaseId && flag.status === 'WILL_REMEDIATE' && (
              <button onClick={() => saveResearch('REMEDIATED')} disabled={saving} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">Record remediated outcome</button>
            )}
          </div>
          {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">{error}</p>}

          {flag.remediationCase && (
            <Link href={`/dashboard/properties/${propertyId}/renovations/${flag.remediationCase.id}/requirements`} className="block rounded-xl border border-purple-100 bg-purple-50 p-3 text-xs font-medium text-purple-800">
              Remediation case: {flag.remediationCase.name} · {flag.remediationCase.lifecycle.replace(/_/g, ' ').toLowerCase()}
            </Link>
          )}

          {(flag.historyEvents?.length ?? 0) > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold">Audit history</p>
              <div className="space-y-2">
                {flag.historyEvents?.map((event) => (
                  <div key={event.id} className="border-l-2 border-slate-200 pl-3 text-xs text-slate-600">
                    <p className="font-medium text-slate-800">{event.eventType.replace(/_/g, ' ').toLowerCase()}</p>
                    <p>{new Date(event.occurredAt).toLocaleString()}{event.toStatus ? ` · ${FLAG_STATUS_LABELS[event.toStatus]}` : ''}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
