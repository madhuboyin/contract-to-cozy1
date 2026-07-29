'use client';

// Application/award outcome ledger UI (HSB-018/019/033) — shared between
// the benefits (PropertyHiddenAssetMatch) and recurring-cost
// (HomeSavingsOpportunity) families. Backend outcome recording
// (savingsOutcome.service.ts) has existed since Slice 7 but had zero
// frontend callers until this component — this is the first UI that lets a
// homeowner actually record SUBMITTED/APPROVED/DENIED/RECEIVED/WITHDRAWN
// and attach real Document Vault evidence, rather than just displaying
// system-generated status.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import type {
  HiddenAssetMatchOutcomeDTO,
  HomeSavingsOpportunityOutcomeDTO,
  SavingsOutcomeStageValue,
} from '@/types';
import { StatusChip, type StatusChipTone } from '@/components/mobile/dashboard/MobilePrimitives';
import DocumentUploadZone from '@/app/(dashboard)/dashboard/components/inventory/DocumentUploadZone';
import DocumentPickerModal from '@/app/(dashboard)/dashboard/components/inventory/DocumentPickerModal';

type OutcomeFamily = 'BENEFIT' | 'RECURRING_COST';
type OutcomeDTO = HiddenAssetMatchOutcomeDTO | HomeSavingsOpportunityOutcomeDTO;

const STAGE_LABEL: Record<SavingsOutcomeStageValue, string> = {
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  DENIED: 'Denied',
  RECEIVED: 'Received',
  WITHDRAWN: 'Withdrawn',
};

const STAGE_TONE: Record<SavingsOutcomeStageValue, StatusChipTone> = {
  SUBMITTED: 'info',
  APPROVED: 'protected',
  DENIED: 'danger',
  RECEIVED: 'good',
  WITHDRAWN: 'elevated',
};

// Mirrors savingsOutcome.service.ts's ALLOWED_NEXT_STAGES — kept in sync
// manually since this is a small, stable, backend-enforced state machine
// (the backend is the source of truth; this only pre-filters the picker so
// a homeowner isn't offered a transition that would just get rejected).
const ALLOWED_NEXT_STAGES: Record<SavingsOutcomeStageValue, SavingsOutcomeStageValue[]> = {
  SUBMITTED: ['APPROVED', 'DENIED', 'WITHDRAWN'],
  APPROVED: ['RECEIVED', 'WITHDRAWN'],
  DENIED: [],
  RECEIVED: [],
  WITHDRAWN: [],
};
function formatMoney(value: number | null, currency: string): string | null {
  if (value == null) return null;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `$${Math.round(value).toLocaleString()}`;
  }
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function valueForOutcome(family: OutcomeFamily, outcome: OutcomeDTO): number | null {
  if (family === 'BENEFIT') return (outcome as HiddenAssetMatchOutcomeDTO).amountReceived;
  const o = outcome as HomeSavingsOpportunityOutcomeDTO;
  return o.observedAnnualValue ?? (o.observedMonthlyValue != null ? o.observedMonthlyValue * 12 : null);
}

export function OutcomeRecorder({
  family,
  id,
  propertyId,
  defaultCurrency = 'USD',
}: {
  family: OutcomeFamily;
  id: string;
  propertyId: string;
  defaultCurrency?: string;
}) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<SavingsOutcomeStageValue>('SUBMITTED');
  const [amount, setAmount] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [denialReason, setDenialReason] = useState('');
  const [observationStartedAt, setObservationStartedAt] = useState('');
  const [observationEndedAt, setObservationEndedAt] = useState('');
  const [documents, setDocuments] = useState<Array<{ id: string; name: string }>>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [checklistDocumentTarget, setChecklistDocumentTarget] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const outcomesQuery = useQuery<OutcomeDTO[]>({
    queryKey: ['savings-outcome', family, id],
    queryFn: (): Promise<OutcomeDTO[]> =>
      family === 'BENEFIT'
        ? api.listHiddenAssetMatchOutcomes(id)
        : api.listHomeSavingsOpportunityOutcomes(id),
    staleTime: 30_000,
  });
  const actionDetailQuery = useQuery({
    queryKey: ['savings-benefits-action-detail', propertyId, id],
    queryFn: () => api.getSavingsBenefitsOpportunityDetail(propertyId, id),
    staleTime: 30_000,
  });
  const activeAction =
    actionDetailQuery.data?.opportunity.savingsBenefitActions?.find(
      (action) => action.state === 'STARTED',
    ) ?? null;
  const actionChecklist = activeAction?.checklistJson ?? [];

  const outcomes: OutcomeDTO[] = outcomesQuery.data ?? [];
  const latest = [...outcomes].reverse().find((outcome) => !outcome.revokedAt) ?? null;
  const allowedStages: SavingsOutcomeStageValue[] = latest ? ALLOWED_NEXT_STAGES[latest.stage] : ['SUBMITTED'];
  const isTerminal = latest != null && allowedStages.length === 0;

  useMemo(() => {
    if (allowedStages.length > 0 && !allowedStages.includes(stage)) {
      setStage(allowedStages[0]);
    }
  }, [allowedStages, stage]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['savings-outcome', family, id] });
    queryClient.invalidateQueries({ queryKey: ['savings-benefits-unified', propertyId] });
    if (family === 'BENEFIT') {
      queryClient.invalidateQueries({ queryKey: ['hidden-assets', propertyId] });
    }
  }

  const submitMutation = useMutation({
    mutationFn: (): Promise<OutcomeDTO | null> => {
      const documentIds = documents.map((d) => d.id);
      if (family === 'BENEFIT') {
        return api.recordHiddenAssetMatchOutcome(id, {
          stage,
          amountReceived: stage === 'RECEIVED' && amount ? Number(amount) : undefined,
          currency: defaultCurrency,
          evidenceNote: evidenceNote.trim() || undefined,
          denialReason: stage === 'DENIED' ? denialReason.trim() || undefined : undefined,
          documentIds,
        });
      }
      return api.recordHomeSavingsOpportunityOutcome(id, {
        stage,
        observedAnnualValue: stage === 'RECEIVED' && amount ? Number(amount) : undefined,
        currency: defaultCurrency,
        evidenceNote: evidenceNote.trim() || undefined,
        denialReason: stage === 'DENIED' ? denialReason.trim() || undefined : undefined,
        documentIds,
        observationStartedAt:
          stage === 'RECEIVED' && observationStartedAt
            ? new Date(`${observationStartedAt}T00:00:00.000Z`).toISOString()
            : undefined,
        observationEndedAt:
          stage === 'RECEIVED' && observationEndedAt
            ? new Date(`${observationEndedAt}T00:00:00.000Z`).toISOString()
            : undefined,
      });
    },
    onSuccess: () => {
      setAmount('');
      setEvidenceNote('');
      setDenialReason('');
      setObservationStartedAt('');
      setObservationEndedAt('');
      setDocuments([]);
      invalidate();
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async ({ outcomeId, reason }: { outcomeId: string; reason: string }) => {
      if (family === 'BENEFIT') {
        await api.revokeHiddenAssetMatchOutcome(outcomeId, reason);
      } else {
        await api.revokeHomeSavingsOpportunityOutcome(outcomeId, reason);
      }
    },
    onSuccess: invalidate,
  });

  const actionMutation = useMutation({
    mutationFn: (input: Parameters<typeof api.updateSavingsBenefitsAction>[2]) => {
      if (!activeAction) throw new Error('No active action is available.');
      return api.updateSavingsBenefitsAction(propertyId, activeAction.id, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['savings-benefits-action-detail', propertyId, id],
      });
      queryClient.invalidateQueries({ queryKey: ['savings-benefits-unified', propertyId] });
      invalidate();
    },
  });

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const result = await api.analyzeDocument(file, propertyId, false);
      if (!result.success || !result.data?.document) {
        throw new Error(result.message || 'Failed to upload document');
      }
      const doc = result.data.document;
      setDocuments((prev) => [...prev, { id: doc.id, name: doc.name || file.name }]);
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  }

  const needsAmount = stage === 'RECEIVED';
  const needsDenialReason = stage === 'DENIED';
  const needsEvidence = stage === 'RECEIVED';
  const needsObservationWindow = family === 'RECURRING_COST' && stage === 'RECEIVED';
  const observationWindowIsSufficient = (() => {
    if (!needsObservationWindow) return true;
    if (!observationStartedAt || !observationEndedAt) return false;
    const started = new Date(`${observationStartedAt}T00:00:00.000Z`).getTime();
    const ended = new Date(`${observationEndedAt}T00:00:00.000Z`).getTime();
    return ended - started >= 28 * 24 * 60 * 60 * 1000;
  })();
  const canSubmit =
    !submitMutation.isPending &&
    (!needsAmount || amount.trim().length > 0) &&
    (!needsDenialReason || denialReason.trim().length > 0) &&
    (!needsEvidence || evidenceNote.trim().length > 0 || documents.length > 0) &&
    observationWindowIsSufficient;

  return (
    <div className="space-y-3">
      {activeAction ? (
        <section
          className="space-y-2 rounded-lg border border-[hsl(var(--mobile-border-subtle))] p-3"
          aria-labelledby={`savings-action-checklist-${activeAction.id}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3
              id={`savings-action-checklist-${activeAction.id}`}
              className="text-xs font-semibold text-[hsl(var(--mobile-text-primary))]"
            >
              Resume preparation
            </h3>
            <StatusChip tone="info">{activeAction.actionType.replace(/_/g, ' ')}</StatusChip>
          </div>
          {actionChecklist.length > 0 ? (
            <ul className="space-y-2">
              {actionChecklist.map((item) => (
                <li key={item.key}>
                  <label className="flex min-h-11 items-start gap-2 text-xs text-[hsl(var(--mobile-text-secondary))]">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-5 w-5"
                      checked={Boolean(item.completedAt)}
                      disabled={actionMutation.isPending}
                      onChange={(event) => actionMutation.mutate({
                        checklist: [{
                          key: item.key,
                          completed: event.target.checked,
                          evidenceDocumentIds: item.evidenceDocumentIds,
                        }],
                      })}
                    />
                    <span>
                      {item.label}
                      {item.required ? <span className="ml-1 font-medium">(required)</span> : null}
                      {item.evidenceRequired ? (
                        <span className="ml-1 font-medium">(evidence required)</span>
                      ) : null}
                    </span>
                  </label>
                  {item.evidenceRequired ? (
                    <div className="ml-7 mt-1 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="min-h-11 rounded-md border border-[hsl(var(--mobile-border-subtle))] px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                        disabled={actionMutation.isPending}
                        onClick={() => {
                          setChecklistDocumentTarget(item.key);
                          setPickerOpen(true);
                        }}
                      >
                        Attach Vault evidence
                      </button>
                      <span className="text-[11px] text-[hsl(var(--mobile-text-secondary))]">
                        {item.evidenceDocumentIds.length} attached
                      </span>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
              No evidence checklist applies to this action.
            </p>
          )}
          {actionMutation.isError ? (
            <p role="alert" className="text-xs text-rose-700">
              {actionMutation.error instanceof Error
                ? actionMutation.error.message
                : 'Could not update the action.'}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-11 rounded-md bg-[hsl(var(--mobile-brand-strong))] px-3 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50"
              disabled={
                actionMutation.isPending
                || actionChecklist.some((item) =>
                  (item.required && !item.completedAt)
                  || (item.evidenceRequired && item.evidenceDocumentIds.length === 0))
              }
              onClick={() => actionMutation.mutate({ state: 'COMPLETED' })}
            >
              Complete preparation
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md border border-[hsl(var(--mobile-border-subtle))] px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              disabled={actionMutation.isPending}
              onClick={() => actionMutation.mutate({ state: 'CANCELLED' })}
            >
              Cancel action
            </button>
          </div>
        </section>
      ) : null}
      <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
        Application &amp; outcome trail
      </h3>

      {outcomesQuery.isLoading ? (
        <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">Loading history…</p>
      ) : outcomes.length > 0 ? (
        <div className="space-y-2">
          {outcomes.map((outcome) => {
            const value = formatMoney(valueForOutcome(family, outcome), outcome.currency);
            return (
              <div
                key={outcome.id}
                className="rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusChip tone={STAGE_TONE[outcome.stage]}>{STAGE_LABEL[outcome.stage]}</StatusChip>
                  <span className="text-[11px] text-[hsl(var(--mobile-text-secondary))]">{formatDate(outcome.recordedAt)}</span>
                </div>
                {value ? <p className="mt-1.5 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">{value}</p> : null}
                <p className="mt-1 text-[11px] text-[hsl(var(--mobile-text-secondary))]">
                  {outcome.verificationState === 'VERIFIED'
                    ? 'Independently verified'
                    : outcome.verificationState === 'EVIDENCE_ATTACHED'
                      ? 'Evidence attached — not independently verified'
                      : outcome.verificationState === 'REVOKED'
                        ? 'Revoked'
                        : 'Self-reported'}
                </p>
                {outcome.evidenceNote ? (
                  <p className="mt-1 text-xs leading-snug text-[hsl(var(--mobile-text-secondary))]">{outcome.evidenceNote}</p>
                ) : null}
                {outcome.denialReason ? (
                  <p className="mt-1 text-xs leading-snug text-[hsl(var(--mobile-text-secondary))]">Reason: {outcome.denialReason}</p>
                ) : null}
                {outcome.documents.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5">
                    {outcome.documents.map((d) => (
                      <li key={d.id} className="text-[11px] text-[hsl(var(--mobile-text-secondary))]">📄 {d.name}</li>
                    ))}
                  </ul>
                ) : null}
                {!outcome.revokedAt ? (
                  <button
                    type="button"
                    className="mt-2 text-[11px] font-medium text-rose-700 underline-offset-2 hover:underline"
                    disabled={revokeMutation.isPending}
                    onClick={() => {
                      const reason = window.prompt('Why should this recorded outcome be revoked?');
                      if (reason?.trim() && reason.trim().length >= 3) {
                        revokeMutation.mutate({ outcomeId: outcome.id, reason: reason.trim() });
                      }
                    }}
                  >
                    Revoke or correct this entry
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
          No submissions recorded yet. Log what actually happened, once it does.
        </p>
      )}

      {isTerminal ? (
        <p className="text-xs italic text-[hsl(var(--mobile-text-secondary))]">
          This has reached a final state ({STAGE_LABEL[latest!.stage].toLowerCase()}) — nothing further to record.
        </p>
      ) : (
        <div className="space-y-2 rounded-lg border border-[hsl(var(--mobile-border-subtle))] p-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Outcome stage to record">
            {allowedStages.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={stage === s}
                onClick={() => setStage(s)}
                className={`h-7 rounded-full px-3 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                  stage === s
                    ? 'bg-[hsl(var(--mobile-brand-strong))] text-white'
                    : 'bg-[hsl(var(--mobile-bg-muted))] text-[hsl(var(--mobile-text-secondary))]'
                }`}
              >
                {STAGE_LABEL[s]}
              </button>
            ))}
          </div>

          {needsAmount ? (
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={family === 'BENEFIT' ? 'Amount received ($)' : 'Annual value observed ($/yr)'}
              aria-label={family === 'BENEFIT' ? 'Amount received in dollars' : 'Annual value observed in dollars per year'}
              className="h-8 w-full rounded-md border border-[hsl(var(--mobile-border-subtle))] bg-white px-2 text-xs dark:bg-slate-900"
            />
          ) : null}

          {needsDenialReason ? (
            <input
              type="text"
              value={denialReason}
              onChange={(e) => setDenialReason(e.target.value)}
              placeholder="Reason given for the denial"
              aria-label="Reason given for the denial"
              className="h-8 w-full rounded-md border border-[hsl(var(--mobile-border-subtle))] bg-white px-2 text-xs dark:bg-slate-900"
            />
          ) : null}

          {needsObservationWindow ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-[11px] text-[hsl(var(--mobile-text-secondary))]">
                Observation started
                <input
                  type="date"
                  value={observationStartedAt}
                  onChange={(e) => setObservationStartedAt(e.target.value)}
                  className="mt-1 h-8 w-full rounded-md border border-[hsl(var(--mobile-border-subtle))] bg-white px-2 text-xs dark:bg-slate-900"
                />
              </label>
              <label className="text-[11px] text-[hsl(var(--mobile-text-secondary))]">
                Observation ended
                <input
                  type="date"
                  value={observationEndedAt}
                  onChange={(e) => setObservationEndedAt(e.target.value)}
                  className="mt-1 h-8 w-full rounded-md border border-[hsl(var(--mobile-border-subtle))] bg-white px-2 text-xs dark:bg-slate-900"
                />
              </label>
              {!observationWindowIsSufficient ? (
                <p className="text-[11px] text-amber-700 sm:col-span-2">
                  Use at least 28 days of observed bills before recording recurring value.
                </p>
              ) : null}
            </div>
          ) : null}

          <textarea
            value={evidenceNote}
            onChange={(e) => setEvidenceNote(e.target.value)}
            placeholder={
              needsEvidence
                ? 'What backs this — confirmation letter, portal screenshot, award notice…'
                : 'Optional note'
            }
            aria-label="Evidence note"
            className="min-h-[60px] w-full rounded-md border border-[hsl(var(--mobile-border-subtle))] bg-white px-2 py-1.5 text-xs dark:bg-slate-900"
          />

          <DocumentUploadZone
            disabled={submitMutation.isPending}
            uploading={uploading}
            uploadError={uploadError}
            documents={documents}
            onUpload={handleUpload}
            onAttachExisting={() => setPickerOpen(true)}
            onRemove={(docId) => setDocuments((prev) => prev.filter((d) => d.id !== docId))}
          />

          <button
            type="button"
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-[hsl(var(--mobile-brand-strong))] text-xs font-semibold text-white disabled:opacity-50"
            disabled={!canSubmit}
            onClick={() => submitMutation.mutate()}
          >
            {submitMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Record ${STAGE_LABEL[stage].toLowerCase()}`}
          </button>
          {submitMutation.isError ? (
            <p className="text-xs text-rose-600">{(submitMutation.error as any)?.message || 'Failed to record outcome.'}</p>
          ) : null}
        </div>
      )}

      <DocumentPickerModal
        open={pickerOpen}
        propertyId={propertyId}
        alreadyLinkedIds={new Set(
          checklistDocumentTarget
            ? actionChecklist.find((item) => item.key === checklistDocumentTarget)
                ?.evidenceDocumentIds ?? []
            : documents.map((d) => d.id),
        )}
        onClose={() => {
          setPickerOpen(false);
          setChecklistDocumentTarget(null);
        }}
        onPick={(doc) => {
          if (checklistDocumentTarget && activeAction) {
            const item = actionChecklist.find((entry) => entry.key === checklistDocumentTarget);
            if (item) {
              actionMutation.mutate({
                checklist: [{
                  key: item.key,
                  completed: Boolean(item.completedAt),
                  evidenceDocumentIds: [...new Set([...item.evidenceDocumentIds, doc.id])],
                }],
              });
            }
            setChecklistDocumentTarget(null);
            setPickerOpen(false);
            return;
          }
          setDocuments((prev) => [...prev, { id: doc.id, name: doc.name || doc.id }]);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
