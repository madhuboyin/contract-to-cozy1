'use client';
// Row actions for the DIY templates admin list. Lifecycle changes go through
// the capability-separated editorial transitions (ADMIN_MODULE_FRD.md §10.6)
// — each action requires a reason and is audited. The old direct status
// patch is gone; an action the current admin lacks the capability for fails
// with 403 from the server.
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { transitionDiyTemplate, LifecycleAction } from '@/lib/api/adminContentGovernance';
import type { AdminDiyTemplateSummary, DiyTemplateStatus } from '@/types';

interface Props {
  template: AdminDiyTemplateSummary;
  onStatusChange: (id: string, status: DiyTemplateStatus) => void;
  onDuplicate: (newId: string) => void;
}

const ACTIONS_FOR_STATUS: Record<string, { action: LifecycleAction; label: string; tone: string }[]> = {
  DRAFT: [{ action: 'SUBMIT_FOR_REVIEW', label: 'Submit for review', tone: 'text-green-700 hover:bg-green-50' }],
  REVIEW: [
    { action: 'APPROVE', label: 'Approve', tone: 'text-green-700 hover:bg-green-50' },
    { action: 'RETURN_TO_DRAFT', label: 'Return to draft', tone: 'hover:bg-neutral-50' },
  ],
  APPROVED: [
    { action: 'PUBLISH', label: 'Publish', tone: 'text-green-700 hover:bg-green-50' },
    { action: 'ARCHIVE', label: 'Archive', tone: 'text-yellow-700 hover:bg-yellow-50' },
  ],
  ACTIVE: [
    { action: 'UNPUBLISH', label: 'Unpublish', tone: 'hover:bg-neutral-50' },
    { action: 'ARCHIVE', label: 'Archive', tone: 'text-yellow-700 hover:bg-yellow-50' },
  ],
  ARCHIVED: [{ action: 'REVIVE_TO_DRAFT', label: 'Revive to draft', tone: 'text-green-700 hover:bg-green-50' }],
};

export default function TemplateStatusActions({ template, onStatusChange, onDuplicate }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reasonFor, setReasonFor] = useState<{ action: LifecycleAction; label: string } | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setReasonFor(null);
        setReason('');
        setError('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function confirmTransition() {
    if (!reasonFor || !reason.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await transitionDiyTemplate(template.id, reasonFor.action, reason.trim());
      onStatusChange(template.id, result.status as DiyTemplateStatus);
      setOpen(false);
      setReasonFor(null);
      setReason('');
    } catch (e: any) {
      setError(e?.message ?? 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    setOpen(false);
    setBusy(true);
    try {
      const detail = await api.adminGetDiyTemplate(template.id);
      const payload = {
        slug: `${detail.slug}-copy-${Date.now()}`,
        title: `${detail.title} (copy)`,
        shortDescription: detail.shortDescription,
        longDescription: detail.longDescription,
        category: detail.category,
        difficultyLevel: detail.difficultyLevel,
        requiredSkillLevel: detail.requiredSkillLevel,
        safetyLevel: detail.safetyLevel,
        permitRequirement: detail.permitRequirement,
        estimatedMinutes: detail.estimatedMinutes,
        estimatedMaterialCostMinCents: detail.estimatedMaterialCostMinCents,
        estimatedMaterialCostMaxCents: detail.estimatedMaterialCostMaxCents,
        professionalCostMinCents: detail.professionalCostMinCents,
        professionalCostMaxCents: detail.professionalCostMaxCents,
        tags: detail.tags ?? [],
        featuredOrder: undefined,
        geminiPromptHint: detail.geminiPromptHint,
        steps: (detail.steps ?? []).map(({ title, description, estimatedMinutes, safetyNote, tipNote, imageUrl, isOptional }) => ({
          title, description, estimatedMinutes, safetyNote, tipNote, imageUrl, isOptional,
        })),
        materials: (detail.materials ?? []).map(({ name, unit, quantityFormula, unitPriceCents, isOptional, purchaseNote }) => ({
          name, unit, quantityFormula, unitPriceCents, isOptional, purchaseNote,
        })),
        tools: (detail.tools ?? []).map(({ name, canonicalId, isRequired, defaultToolAction, rentDailyPriceCents, buyEstimatePriceCents }) => ({
          name, canonicalId, isRequired, defaultToolAction, rentDailyPriceCents, buyEstimatePriceCents,
        })),
      };
      const created = await api.adminCreateDiyTemplate(payload as any);
      onDuplicate(created.id);
      router.push(`/dashboard/admin/diy/templates/${created.id}/edit`);
    } finally {
      setBusy(false);
    }
  }

  const actions = ACTIONS_FOR_STATUS[template.status] ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={busy}
        className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"
        aria-label="Actions"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
        </svg>
      </button>

      {open && !reasonFor && (
        <div className="absolute right-0 z-50 mt-1 w-48 rounded-lg border bg-white py-1 shadow-lg">
          <button
            onClick={() => router.push(`/dashboard/admin/diy/templates/${template.id}/edit`)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50"
          >
            Edit
          </button>

          {actions.map((a) => (
            <button
              key={a.action}
              onClick={() => setReasonFor({ action: a.action, label: a.label })}
              className={`w-full px-4 py-2 text-left text-sm ${a.tone}`}
            >
              {a.label}
            </button>
          ))}

          <hr className="my-1 border-neutral-100" />
          <button onClick={duplicate} className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50">
            Duplicate
          </button>
        </div>
      )}

      {open && reasonFor && (
        <div className="absolute right-0 z-50 mt-1 w-64 rounded-lg border bg-white p-3 shadow-lg">
          <p className="mb-1.5 text-sm font-medium">{reasonFor.label}</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required) — recorded in the audit log"
            className="mb-2 w-full rounded border border-neutral-200 p-1.5 text-xs"
            rows={3}
          />
          {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setReasonFor(null); setReason(''); setError(''); }}
              className="rounded px-2 py-1 text-xs hover:bg-neutral-50"
              disabled={busy}
            >
              Cancel
            </button>
            <button
              onClick={confirmTransition}
              disabled={busy || !reason.trim()}
              className="rounded bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
