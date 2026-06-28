'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import type { AdminDiyTemplateSummary, DiyTemplateStatus } from '@/types';

interface Props {
  template: AdminDiyTemplateSummary;
  onStatusChange: (id: string, status: DiyTemplateStatus) => void;
  onDuplicate: (newId: string) => void;
}

export default function TemplateStatusActions({ template, onStatusChange, onDuplicate }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function changeStatus(status: DiyTemplateStatus) {
    setOpen(false);
    setBusy(true);
    try {
      await api.adminUpdateDiyTemplateStatus(template.id, status);
      onStatusChange(template.id, status);
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

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-44 rounded-lg border bg-white py-1 shadow-lg">
          <button
            onClick={() => router.push(`/dashboard/admin/diy/templates/${template.id}/edit`)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50"
          >
            Edit
          </button>

          {template.status === 'DRAFT' && (
            <button onClick={() => changeStatus('ACTIVE')} className="w-full px-4 py-2 text-left text-sm text-green-700 hover:bg-green-50">
              Publish
            </button>
          )}
          {template.status === 'ACTIVE' && (
            <>
              <button onClick={() => changeStatus('DRAFT')} className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50">
                Unpublish to Draft
              </button>
              <button onClick={() => changeStatus('ARCHIVED')} className="w-full px-4 py-2 text-left text-sm text-yellow-700 hover:bg-yellow-50">
                Archive
              </button>
            </>
          )}
          {template.status === 'ARCHIVED' && (
            <button onClick={() => changeStatus('ACTIVE')} className="w-full px-4 py-2 text-left text-sm text-green-700 hover:bg-green-50">
              Restore to Active
            </button>
          )}

          <hr className="my-1 border-neutral-100" />
          <button onClick={duplicate} className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50">
            Duplicate
          </button>
        </div>
      )}
    </div>
  );
}
