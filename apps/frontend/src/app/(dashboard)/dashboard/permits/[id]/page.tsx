'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ShieldCheck, Pencil, Trash2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { PermitDetail, InspectionMilestone, PermitInspectionStatus } from '@/types';
import PermitStatusBadge from '@/components/features/permits/PermitStatusBadge';
import InspectionMilestoneList from '@/components/features/permits/InspectionMilestoneList';
import {
  CATEGORY_LABELS, WORK_TYPE_LABELS, SOURCE_LABELS,
  formatDate, formatCents,
} from '@/components/features/permits/PermitUtils';

const INSPECTION_STATUSES: PermitRecordStatus[] = ['ISSUED', 'INSPECTION_PENDING', 'INSPECTION_FAILED'];
type PermitRecordStatus = 'APPLIED' | 'ISSUED' | 'INSPECTION_PENDING' | 'INSPECTION_FAILED' | 'FINALED' | 'EXPIRED' | 'VOIDED' | 'UNKNOWN';

export default function PermitDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const permitId = params.id;
  const propertyId = searchParams.get('propertyId') ?? '';

  const [permit, setPermit] = useState<PermitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.getPermitDetail(propertyId, permitId)
      .then((p) => { setPermit(p); setNotes(p.notes ?? ''); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [permitId, propertyId]);

  async function handleMilestoneUpdate(milestoneId: string, patch: { status?: PermitInspectionStatus; scheduledDate?: string; inspectedDate?: string; inspectorNotes?: string }) {
    if (!permit) return;
    const updated = await api.updateInspectionMilestone(propertyId, permitId, milestoneId, patch);
    setPermit((p) => p ? {
      ...p,
      inspectionMilestones: p.inspectionMilestones.map((m) => m.id === milestoneId ? updated : m),
    } : p);
  }

  async function handleMilestoneAdd(payload: { stageName: string; stageType: string; scheduledDate?: string }) {
    if (!permit) return;
    const newMs = await api.addInspectionMilestone(propertyId, permitId, payload);
    setPermit((p) => p ? { ...p, inspectionMilestones: [...p.inspectionMilestones, newMs] } : p);
  }

  async function handleMilestoneDelete(milestoneId: string) {
    await api.deleteInspectionMilestone(propertyId, permitId, milestoneId);
    setPermit((p) => p ? {
      ...p,
      inspectionMilestones: p.inspectionMilestones.filter((m) => m.id !== milestoneId),
    } : p);
  }

  async function handleVerifyToggle() {
    if (!permit) return;
    setSaving(true);
    try {
      const updated = await api.updatePermit(propertyId, permitId, { isVerified: !permit.isVerified });
      setPermit(updated);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNotes() {
    if (!permit) return;
    setSaving(true);
    try {
      const updated = await api.updatePermit(propertyId, permitId, { notes });
      setPermit(updated);
      setEditingNotes(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this permit record? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await api.deletePermit(propertyId, permitId);
      router.push(`/dashboard/permits?propertyId=${propertyId}`);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-[hsl(var(--mobile-brand-strong))]" />
      </div>
    );
  }

  if (!permit) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">Permit not found.</p>
        <Link href={`/dashboard/permits?propertyId=${propertyId}`} className="mt-2 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]">
          Back to Permits
        </Link>
      </div>
    );
  }

  const isManual = permit.source === 'MANUAL_ENTRY';
  const showInspections = INSPECTION_STATUSES.includes(permit.status as any);

  return (
    <div className="space-y-5 p-4 pb-10">
      {/* Back nav */}
      <div className="flex items-center justify-between">
        <Link href={`/dashboard/permits?propertyId=${propertyId}`} className="flex items-center gap-1 text-sm text-[hsl(var(--mobile-text-secondary))]">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Link>
        {isManual && (
          <button onClick={handleDelete} disabled={deleting} className="flex items-center gap-1 text-xs text-red-500 disabled:opacity-50">
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete
          </button>
        )}
      </div>

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{CATEGORY_LABELS[permit.category]}</h1>
          {permit.permitNumber && (
            <span className="text-sm text-[hsl(var(--mobile-text-muted))]">#{permit.permitNumber}</span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <PermitStatusBadge status={permit.status} />
          <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
            {SOURCE_LABELS[permit.source]}
          </span>
        </div>
      </div>

      {/* Work types */}
      {permit.workTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {permit.workTypes.map((wt) => (
            <span key={wt} className="rounded-full bg-[hsl(var(--mobile-brand-strong))]/10 px-3 py-1 text-xs font-medium text-[hsl(var(--mobile-brand-strong))]">
              {WORK_TYPE_LABELS[wt]}
            </span>
          ))}
        </div>
      )}

      {/* Dates */}
      <div className="rounded-2xl border bg-[hsl(var(--mobile-card-bg))] p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--mobile-text-muted))]">Dates</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Applied', value: permit.applicationDate },
            { label: 'Issued', value: permit.issueDate },
            { label: 'Expires', value: permit.expirationDate },
            { label: 'Finaled', value: permit.finaledDate },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-[hsl(var(--mobile-text-muted))]">{label}</p>
              <p className="text-sm font-medium">{formatDate(value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contractor */}
      {(permit.contractorName || permit.contractorLicense) && (
        <div className="rounded-2xl border bg-[hsl(var(--mobile-card-bg))] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--mobile-text-muted))]">Contractor</p>
          {permit.contractorName && <p className="text-sm font-medium">{permit.contractorName}</p>}
          {permit.contractorLicense && <p className="text-xs text-[hsl(var(--mobile-text-muted))] mt-0.5">License #{permit.contractorLicense}</p>}
          {permit.applicantName && <p className="text-xs text-[hsl(var(--mobile-text-muted))] mt-0.5">Applicant: {permit.applicantName}</p>}
        </div>
      )}

      {/* Cost */}
      {(permit.estimatedCostCents || permit.finalCostCents) && (
        <div className="rounded-2xl border bg-[hsl(var(--mobile-card-bg))] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--mobile-text-muted))]">Project Cost</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-[hsl(var(--mobile-text-muted))]">Estimated</p>
              <p className="text-sm font-medium">{formatCents(permit.estimatedCostCents)}</p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--mobile-text-muted))]">Final</p>
              <p className="text-sm font-medium">{formatCents(permit.finalCostCents)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Description */}
      {permit.description && (
        <div className="rounded-2xl border bg-[hsl(var(--mobile-card-bg))] p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--mobile-text-muted))]">Description</p>
          <p className="text-sm">{permit.description}</p>
        </div>
      )}

      {/* Inspection Milestones */}
      {showInspections && (
        <section>
          <p className="mb-3 text-sm font-semibold">Inspection Milestones</p>
          <InspectionMilestoneList
            milestones={permit.inspectionMilestones}
            propertyId={propertyId}
            permitId={permitId}
            onUpdate={handleMilestoneUpdate}
            onAdd={handleMilestoneAdd}
            onDelete={handleMilestoneDelete}
          />
        </section>
      )}

      {/* Notes */}
      <div className="rounded-2xl border bg-[hsl(var(--mobile-card-bg))] p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--mobile-text-muted))]">Notes</p>
          {!editingNotes && (
            <button onClick={() => setEditingNotes(true)} className="flex items-center gap-1 text-xs text-[hsl(var(--mobile-brand-strong))]">
              <Pencil className="h-3 w-3" /> Edit
            </button>
          )}
        </div>
        {editingNotes ? (
          <div className="space-y-2">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30 resize-none"
              placeholder="Add notes…"
            />
            <div className="flex gap-2">
              <button onClick={handleSaveNotes} disabled={saving} className="flex items-center gap-1 rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
              </button>
              <button onClick={() => { setNotes(permit.notes ?? ''); setEditingNotes(false); }} className="text-xs text-neutral-500">Cancel</button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">{notes || 'No notes added.'}</p>
        )}
      </div>

      {/* Verified toggle */}
      <button
        onClick={handleVerifyToggle}
        disabled={saving}
        className={`w-full flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${
          permit.isVerified
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-neutral-200 bg-[hsl(var(--mobile-card-bg))]'
        }`}
      >
        <ShieldCheck className={`h-5 w-5 shrink-0 ${permit.isVerified ? 'text-emerald-500' : 'text-neutral-300'}`} />
        <div className="flex-1">
          <p className="text-sm font-medium">
            {permit.isVerified ? 'Verified — record confirmed accurate' : 'Mark as verified'}
          </p>
          <p className="text-xs text-[hsl(var(--mobile-text-muted))] mt-0.5">
            Confirm this permit record is accurate
          </p>
        </div>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />}
      </button>
    </div>
  );
}
