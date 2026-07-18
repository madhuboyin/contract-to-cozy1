'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Clock, Plus, Trash2 } from 'lucide-react';
import type { HoaApprovalRecord, HoaApprovalStatus, HoaWorkType, CreateHoaApprovalRecordPayload, UpdateHoaApprovalRecordPayload } from '@/types';
import { APPROVAL_STATUS_LABELS, APPROVAL_STATUS_COLOR, WORK_TYPE_LABELS, formatDate } from './HoaUtils';
import { PropertyContextCapturePanel } from '@/components/property-context/PropertyContextCapturePanel';

interface Props {
  propertyId: string;
  records: HoaApprovalRecord[];
  onUpdate: (recordId: string, patch: UpdateHoaApprovalRecordPayload) => Promise<void>;
  onAdd: (payload: CreateHoaApprovalRecordPayload) => Promise<void>;
  onDelete: (recordId: string) => Promise<void>;
}

const WORK_TYPES = Object.keys(WORK_TYPE_LABELS) as HoaWorkType[];

function StatusIcon({ status }: { status: HoaApprovalStatus }) {
  if (status === 'APPROVED' || status === 'APPROVED_WITH_CONDITIONS') return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
  if (status === 'DENIED') return <XCircle className="h-5 w-5 text-red-500" />;
  if (status === 'SUBMITTED' || status === 'UNDER_REVIEW') return <Clock className="h-5 w-5 text-blue-500" />;
  return <div className="h-5 w-5 rounded-full border-2 border-neutral-300" />;
}

export default function ApprovalRecordList({ propertyId, records, onUpdate, onAdd, onDelete }: Props) {
  const [adding, setAdding] = useState(false);
  const [newWorkType, setNewWorkType] = useState<HoaWorkType>('FENCE');
  const [newDescription, setNewDescription] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contextInvoked, setContextInvoked] = useState(false);
  const [contextReady, setContextReady] = useState(false);
  const [resumeRequested, setResumeRequested] = useState(false);
  const addFormRef = useRef<HTMLFormElement>(null);
  const operationInput = useMemo(() => ({ workType: newWorkType }), [newWorkType]);

  useEffect(() => {
    setContextInvoked(false);
    setContextReady(false);
    setResumeRequested(false);
  }, [newWorkType]);

  useEffect(() => {
    if (!contextReady || !resumeRequested) return;
    setResumeRequested(false);
    addFormRef.current?.requestSubmit();
  }, [contextReady, resumeRequested]);

  async function handleStatusChange(record: HoaApprovalRecord, status: HoaApprovalStatus) {
    setSaving(record.id);
    try {
      const isDecision = status === 'APPROVED' || status === 'APPROVED_WITH_CONDITIONS' || status === 'DENIED';
      await onUpdate(record.id, {
        status,
        ...(status === 'SUBMITTED' ? { submittedDate: new Date().toISOString() } : {}),
        ...(isDecision ? { decisionDate: new Date().toISOString() } : {}),
      });
    } finally {
      setSaving(null);
    }
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!contextReady) {
      setContextInvoked(true);
      setResumeRequested(true);
      return;
    }
    setSaving('new');
    try {
      await onAdd({ workType: newWorkType, description: newDescription.trim() || undefined });
      setNewDescription('');
      setAdding(false);
      setContextInvoked(false);
      setContextReady(false);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-2">
      {records.map((record, idx) => (
        <div key={record.id} className="relative">
          {idx < records.length - 1 && (
            <div className="absolute left-[10px] top-6 bottom-0 w-0.5 bg-neutral-200 z-0" />
          )}

          <div className="relative z-10 flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              <StatusIcon status={record.status} />
            </div>

            <div
              className="flex-1 cursor-pointer rounded-xl border bg-[hsl(var(--mobile-card-bg))] p-3"
              onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{WORK_TYPE_LABELS[record.workType]}</span>
                  {record.description && (
                    <p className="mt-0.5 text-xs text-[hsl(var(--mobile-text-muted))] truncate">{record.description}</p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${APPROVAL_STATUS_COLOR[record.status]}`}>
                  {APPROVAL_STATUS_LABELS[record.status]}
                </span>
              </div>

              {record.submittedDate && (
                <p className="mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">
                  Submitted: {formatDate(record.submittedDate)}
                </p>
              )}

              {expandedId === record.id && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  {record.decisionDate && (
                    <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                      Decided: {formatDate(record.decisionDate)}
                    </p>
                  )}
                  {record.approvalConditions && (
                    <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">Conditions: {record.approvalConditions}</p>
                  )}
                  {record.denialReason && (
                    <p className="text-xs text-red-600">Denial reason: {record.denialReason}</p>
                  )}
                  {record.notes && (
                    <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">{record.notes}</p>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {(['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'APPROVED_WITH_CONDITIONS', 'DENIED'] as HoaApprovalStatus[])
                      .filter((s) => s !== record.status)
                      .map((s) => (
                        <button
                          key={s}
                          disabled={saving === record.id}
                          onClick={(e) => { e.stopPropagation(); handleStatusChange(record, s); }}
                          className="rounded-xl border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 disabled:opacity-50"
                        >
                          {APPROVAL_STATUS_LABELS[s]}
                        </button>
                      ))}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(record.id); }}
                      className="rounded-xl border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {adding ? (
        <form ref={addFormRef} onSubmit={handleAdd} className="space-y-2 pt-1">
          <select
            value={newWorkType}
            onChange={(e) => setNewWorkType(e.target.value as HoaWorkType)}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
          >
            {WORK_TYPES.map((wt) => (
              <option key={wt} value={wt}>{WORK_TYPE_LABELS[wt]}</option>
            ))}
          </select>
          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="What are you planning to do? (optional)"
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
          />
          {contextInvoked ? <PropertyContextCapturePanel
            propertyId={propertyId}
            featureKey="HOA_COMPLIANCE"
            operationKey="CREATE_APPROVAL_RECORD"
            operationInput={operationInput}
            onReady={() => setContextReady(true)}
          /> : null}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving === 'new'}
              className="rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Add
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-xs text-neutral-500">Cancel</button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 pt-1 text-xs text-[hsl(var(--mobile-brand-strong))] font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          Track a new approval
        </button>
      )}
    </div>
  );
}
