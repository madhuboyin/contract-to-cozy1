'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { CreatePermitPayload, PermitRecordCategory, PermitWorkType, PermitRecordStatus } from '@/types';
import { CATEGORY_LABELS, WORK_TYPE_LABELS, STATUS_LABELS } from './PermitUtils';

interface Props {
  onSubmit: (payload: CreatePermitPayload) => Promise<void>;
  onCancel: () => void;
}

const CATEGORIES: PermitRecordCategory[] = [
  'BUILDING', 'ELECTRICAL', 'PLUMBING', 'MECHANICAL', 'STRUCTURAL',
  'ROOFING', 'ZONING', 'DEMOLITION', 'GRADING', 'FIRE', 'OTHER',
];

const WORK_TYPES: PermitWorkType[] = [
  'HVAC_NEW', 'HVAC_REPLACEMENT', 'ELECTRICAL_PANEL', 'ELECTRICAL_WIRING',
  'PLUMBING_NEW', 'PLUMBING_REPAIR', 'ROOF_REPLACEMENT', 'ROOF_REPAIR',
  'ROOM_ADDITION', 'GARAGE_CONVERSION', 'ADU', 'BASEMENT_FINISH', 'DECK_PATIO',
  'FENCE', 'SWIMMING_POOL', 'SOLAR', 'WINDOWS_DOORS', 'FIREPLACE',
  'SEWER_WATER_LINE', 'STRUCTURAL_REPAIR', 'INTERIOR_REMODEL', 'EXTERIOR_REMODEL',
  'DEMOLITION', 'GRADING_DRAINAGE', 'OTHER',
];

const STATUSES: PermitRecordStatus[] = [
  'APPLIED', 'ISSUED', 'INSPECTION_PENDING', 'INSPECTION_FAILED',
  'FINALED', 'EXPIRED', 'VOIDED', 'UNKNOWN',
];

export default function AddPermitForm({ onSubmit, onCancel }: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    permitNumber: string;
    category: PermitRecordCategory;
    workTypes: PermitWorkType[];
    description: string;
    status: PermitRecordStatus;
    contractorName: string;
    contractorLicense: string;
    applicationDate: string;
    issueDate: string;
    expirationDate: string;
    finaledDate: string;
    notes: string;
  }>({
    permitNumber: '',
    category: 'BUILDING',
    workTypes: ['OTHER'],
    description: '',
    status: 'ISSUED',
    contractorName: '',
    contractorLicense: '',
    applicationDate: '',
    issueDate: '',
    expirationDate: '',
    finaledDate: '',
    notes: '',
  });

  function toggleWorkType(wt: PermitWorkType) {
    setForm((f) => ({
      ...f,
      workTypes: f.workTypes.includes(wt)
        ? f.workTypes.filter((x) => x !== wt)
        : [...f.workTypes, wt],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.workTypes.length === 0) return;
    setSaving(true);
    try {
      const payload: CreatePermitPayload = {
        ...(form.permitNumber && { permitNumber: form.permitNumber }),
        category: form.category,
        workTypes: form.workTypes,
        ...(form.description && { description: form.description }),
        status: form.status,
        ...(form.contractorName && { contractorName: form.contractorName }),
        ...(form.contractorLicense && { contractorLicense: form.contractorLicense }),
        ...(form.applicationDate && { applicationDate: new Date(form.applicationDate).toISOString() }),
        ...(form.issueDate && { issueDate: new Date(form.issueDate).toISOString() }),
        ...(form.expirationDate && { expirationDate: new Date(form.expirationDate).toISOString() }),
        ...(form.finaledDate && { finaledDate: new Date(form.finaledDate).toISOString() }),
        ...(form.notes && { notes: form.notes }),
      };
      await onSubmit(payload);
    } finally {
      setSaving(false);
    }
  }

  const field = 'w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30';
  const label = 'block text-xs font-medium text-[hsl(var(--mobile-text-secondary))] mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={label}>Category *</label>
        <select
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as PermitRecordCategory }))}
          className={field}
          required
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={label}>Status *</label>
        <select
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PermitRecordStatus }))}
          className={field}
          required
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={label}>Permit Number</label>
        <input
          type="text"
          value={form.permitNumber}
          onChange={(e) => setForm((f) => ({ ...f, permitNumber: e.target.value }))}
          placeholder="e.g. 2024-BC-00123"
          className={field}
        />
      </div>

      <div>
        <label className={label}>Work Types * <span className="font-normal">(select all that apply)</span></label>
        <div className="flex flex-wrap gap-2">
          {WORK_TYPES.map((wt) => (
            <button
              key={wt}
              type="button"
              onClick={() => toggleWorkType(wt)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                form.workTypes.includes(wt)
                  ? 'bg-[hsl(var(--mobile-brand-strong))] text-white'
                  : 'bg-neutral-100 text-neutral-600'
              }`}
            >
              {WORK_TYPE_LABELS[wt]}
            </button>
          ))}
        </div>
        {form.workTypes.length === 0 && (
          <p className="mt-1 text-xs text-red-500">Select at least one work type</p>
        )}
      </div>

      <div>
        <label className={label}>Description</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Brief description of the permitted work…"
          rows={2}
          className={`${field} resize-none`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Application Date</label>
          <input
            type="date"
            value={form.applicationDate}
            onChange={(e) => setForm((f) => ({ ...f, applicationDate: e.target.value }))}
            className={field}
          />
        </div>
        <div>
          <label className={label}>Issue Date</label>
          <input
            type="date"
            value={form.issueDate}
            onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
            className={field}
          />
        </div>
        <div>
          <label className={label}>Expiration Date</label>
          <input
            type="date"
            value={form.expirationDate}
            onChange={(e) => setForm((f) => ({ ...f, expirationDate: e.target.value }))}
            className={field}
          />
        </div>
        <div>
          <label className={label}>Finaled Date</label>
          <input
            type="date"
            value={form.finaledDate}
            onChange={(e) => setForm((f) => ({ ...f, finaledDate: e.target.value }))}
            className={field}
          />
        </div>
      </div>

      <div>
        <label className={label}>Contractor Name</label>
        <input
          type="text"
          value={form.contractorName}
          onChange={(e) => setForm((f) => ({ ...f, contractorName: e.target.value }))}
          placeholder="Licensed contractor name"
          className={field}
        />
      </div>

      <div>
        <label className={label}>Contractor License #</label>
        <input
          type="text"
          value={form.contractorLicense}
          onChange={(e) => setForm((f) => ({ ...f, contractorLicense: e.target.value }))}
          placeholder="License number"
          className={field}
        />
      </div>

      <div>
        <label className={label}>Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Any additional notes…"
          rows={2}
          className={`${field} resize-none`}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-2xl border border-neutral-200 py-3 text-sm font-medium text-neutral-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || form.workTypes.length === 0}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--mobile-brand-strong))] py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Permit'}
        </button>
      </div>
    </form>
  );
}
