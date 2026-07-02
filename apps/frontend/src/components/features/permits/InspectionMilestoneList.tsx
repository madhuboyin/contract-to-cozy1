'use client';
import { useState } from 'react';
import { CheckCircle2, XCircle, Clock, AlertTriangle, Plus, Trash2, Camera } from 'lucide-react';
import type { InspectionMilestone, PermitInspectionStatus } from '@/types';
import { INSPECTION_STATUS_LABELS, INSPECTION_STATUS_COLOR, formatDate } from './PermitUtils';
import { READINESS_CHECKABLE_STAGE_TYPES } from './readinessCheckableStages';

interface Props {
  milestones: InspectionMilestone[];
  propertyId: string;
  permitId: string;
  onUpdate: (milestoneId: string, patch: { status?: PermitInspectionStatus; scheduledDate?: string; inspectedDate?: string; inspectorNotes?: string }) => Promise<void>;
  onAdd: (payload: { stageName: string; stageType: string; scheduledDate?: string }) => Promise<void>;
  onDelete: (milestoneId: string) => Promise<void>;
  onCheckReadiness: (milestone: InspectionMilestone) => void;
}

function StatusIcon({ status }: { status: PermitInspectionStatus }) {
  if (status === 'PASSED') return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
  if (status === 'FAILED') return <XCircle className="h-5 w-5 text-red-500" />;
  if (status === 'SCHEDULED') return <Clock className="h-5 w-5 text-blue-500" />;
  return <div className="h-5 w-5 rounded-full border-2 border-neutral-300" />;
}

export default function InspectionMilestoneList({ milestones, propertyId, permitId, onUpdate, onAdd, onDelete, onCheckReadiness }: Props) {
  const [adding, setAdding] = useState(false);
  const [newStage, setNewStage] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleStatusChange(milestone: InspectionMilestone, status: PermitInspectionStatus) {
    setSaving(milestone.id);
    try {
      await onUpdate(milestone.id, {
        status,
        ...(status === 'PASSED' || status === 'FAILED' ? { inspectedDate: new Date().toISOString().slice(0, 10) } : {}),
      });
    } finally {
      setSaving(null);
    }
  }

  async function handleAdd() {
    if (!newStage.trim()) return;
    setSaving('new');
    try {
      await onAdd({ stageName: newStage.trim(), stageType: 'OTHER' });
      setNewStage('');
      setAdding(false);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-2">
      {milestones.map((ms, idx) => (
        <div key={ms.id} className="relative">
          {/* vertical connector */}
          {idx < milestones.length - 1 && (
            <div className="absolute left-[10px] top-6 bottom-0 w-0.5 bg-neutral-200 z-0" />
          )}

          <div className="relative z-10 flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              <StatusIcon status={ms.status} />
            </div>

            <div
              className="flex-1 cursor-pointer rounded-xl border bg-[hsl(var(--mobile-card-bg))] p-3"
              onClick={() => setExpandedId(expandedId === ms.id ? null : ms.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{ms.stageName}</span>
                  {ms.isRequired && (
                    <span className="ml-1.5 text-xs text-[hsl(var(--mobile-text-muted))]">Required</span>
                  )}
                  {ms.isOverdue && ms.status === 'SCHEDULED' && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-amber-600">
                      <AlertTriangle className="h-3 w-3" />Overdue
                    </span>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${INSPECTION_STATUS_COLOR[ms.status]}`}>
                  {INSPECTION_STATUS_LABELS[ms.status]}
                </span>
              </div>

              {ms.scheduledDate && (
                <p className="mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">
                  Scheduled: {formatDate(ms.scheduledDate)}
                </p>
              )}

              {expandedId === ms.id && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  {ms.inspectedDate && (
                    <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                      Inspected: {formatDate(ms.inspectedDate)}
                    </p>
                  )}
                  {ms.inspectorNotes && (
                    <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">{ms.inspectorNotes}</p>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {(ms.status === 'NOT_SCHEDULED' || ms.status === 'SCHEDULED') &&
                      READINESS_CHECKABLE_STAGE_TYPES.has(ms.stageType) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onCheckReadiness(ms); }}
                          className="flex items-center gap-1 rounded-xl border border-[hsl(var(--mobile-brand-strong))]/30 bg-[hsl(var(--mobile-brand-strong))]/10 px-2.5 py-1 text-xs font-medium text-[hsl(var(--mobile-brand-strong))]"
                        >
                          <Camera className="h-3 w-3" /> Check Readiness
                        </button>
                      )}
                    {(['SCHEDULED', 'PASSED', 'FAILED', 'PARTIAL'] as PermitInspectionStatus[])
                      .filter((s) => s !== ms.status)
                      .map((s) => (
                        <button
                          key={s}
                          disabled={saving === ms.id}
                          onClick={(e) => { e.stopPropagation(); handleStatusChange(ms, s); }}
                          className="rounded-xl border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 disabled:opacity-50"
                        >
                          {INSPECTION_STATUS_LABELS[s]}
                        </button>
                      ))}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(ms.id); }}
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
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={newStage}
            onChange={(e) => setNewStage(e.target.value)}
            placeholder="Inspection name…"
            className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
            autoFocus
          />
          <button
            onClick={handleAdd}
            disabled={saving === 'new'}
            className="rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            Add
          </button>
          <button onClick={() => setAdding(false)} className="text-xs text-neutral-500">Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 pt-1 text-xs text-[hsl(var(--mobile-brand-strong))] font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          Add inspection
        </button>
      )}
    </div>
  );
}
