'use client';
import { useState } from 'react';
import { Pencil, Loader2, Building2 } from 'lucide-react';
import type { HoaAssociation, UpsertHoaAssociationPayload, HoaDuesFrequency } from '@/types';
import { formatCents, formatDate, DUES_FREQUENCY_LABELS } from './HoaUtils';

interface Props {
  association: HoaAssociation | null;
  onSave: (payload: UpsertHoaAssociationPayload) => Promise<void>;
}

const DUES_FREQUENCIES: HoaDuesFrequency[] = ['MONTHLY', 'QUARTERLY', 'ANNUAL'];

export default function HoaAssociationCard({ association, onSave }: Props) {
  const [editing, setEditing] = useState(!association);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: association?.name ?? '',
    managementCompany: association?.managementCompany ?? '',
    contactName: association?.contactName ?? '',
    contactEmail: association?.contactEmail ?? '',
    contactPhone: association?.contactPhone ?? '',
    duesAmountCents: association?.duesAmountCents != null ? String(association.duesAmountCents / 100) : '',
    duesFrequency: association?.duesFrequency ?? ('MONTHLY' as HoaDuesFrequency),
    notes: association?.notes ?? '',
  });

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        managementCompany: form.managementCompany.trim() || undefined,
        contactName: form.contactName.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        duesAmountCents: form.duesAmountCents ? Math.round(parseFloat(form.duesAmountCents) * 100) : undefined,
        duesFrequency: form.duesAmountCents ? form.duesFrequency : undefined,
        notes: form.notes.trim() || undefined,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-2xl border bg-[hsl(var(--mobile-card-bg))] p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--mobile-text-muted))]">
          {association ? 'Edit HOA / Association' : 'Add Your HOA / Association'}
        </p>
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Association name (required)"
          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
        />
        <input
          value={form.managementCompany}
          onChange={(e) => setForm((f) => ({ ...f, managementCompany: e.target.value }))}
          placeholder="Management company (optional)"
          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={form.contactName}
            onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
            placeholder="Contact name"
            className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
          />
          <input
            value={form.contactPhone}
            onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
            placeholder="Contact phone"
            className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
          />
        </div>
        <input
          value={form.contactEmail}
          onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
          placeholder="Contact email"
          type="email"
          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={form.duesAmountCents}
            onChange={(e) => setForm((f) => ({ ...f, duesAmountCents: e.target.value }))}
            placeholder="Dues amount ($)"
            type="number"
            min="0"
            step="0.01"
            className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
          />
          <select
            value={form.duesFrequency}
            onChange={(e) => setForm((f) => ({ ...f, duesFrequency: e.target.value as HoaDuesFrequency }))}
            className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
          >
            {DUES_FREQUENCIES.map((f) => (
              <option key={f} value={f}>{DUES_FREQUENCY_LABELS[f]}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className="flex items-center gap-1 rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
          </button>
          {association && (
            <button onClick={() => setEditing(false)} className="text-xs text-neutral-500">Cancel</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-[hsl(var(--mobile-card-bg))] p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-[hsl(var(--mobile-brand-strong))]" />
          <p className="text-sm font-semibold">{association!.name}</p>
        </div>
        <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-[hsl(var(--mobile-brand-strong))]">
          <Pencil className="h-3 w-3" /> Edit
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        {association!.managementCompany && (
          <div>
            <p className="text-[hsl(var(--mobile-text-muted))]">Management</p>
            <p className="font-medium">{association!.managementCompany}</p>
          </div>
        )}
        {association!.contactName && (
          <div>
            <p className="text-[hsl(var(--mobile-text-muted))]">Contact</p>
            <p className="font-medium">{association!.contactName}</p>
          </div>
        )}
        {association!.duesAmountCents != null && (
          <div>
            <p className="text-[hsl(var(--mobile-text-muted))]">Dues</p>
            <p className="font-medium">
              {formatCents(association!.duesAmountCents)}
              {association!.duesFrequency && ` / ${DUES_FREQUENCY_LABELS[association!.duesFrequency].toLowerCase()}`}
            </p>
          </div>
        )}
        {association!.nextDueDate && (
          <div>
            <p className="text-[hsl(var(--mobile-text-muted))]">Next Due</p>
            <p className="font-medium">{formatDate(association!.nextDueDate)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
