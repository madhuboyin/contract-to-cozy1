// apps/frontend/src/app/(dashboard)/dashboard/components/coverage/InsuranceQuoteModal.tsx
'use client';

import React, { useState } from 'react';

export default function InsuranceQuoteModal(props: {
  open: boolean;
  onClose: () => void;
  apiBase: string;
  propertyId: string;
  inventoryItem?: {
    id: string;
    name: string;
    replacementCostCents?: number | null;
    currency?: string | null;
  };
  gapType?: string;
}) {
  const [preferredContact, setPreferredContact] = useState<'EMAIL' | 'SMS' | 'PHONE'>('EMAIL');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!props.open) return null;

  const exposureCents = props.inventoryItem?.replacementCostCents ?? null;
  const currency = props.inventoryItem?.currency ?? 'USD';

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`${props.apiBase}/api/properties/${props.propertyId}/insurance-quotes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventoryItemId: props.inventoryItem?.id || null,
          source: 'COVERAGE_GAP',
          gapType: props.gapType || null,
          exposureCents,
          currency,
          preferredContact,
          contactEmail: preferredContact === 'EMAIL' ? contactEmail : null,
          contactPhone: preferredContact !== 'EMAIL' ? contactPhone : null,
          zipCode: zipCode || null,
          notes: notes || null,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || `Request failed (${res.status})`);

      props.onClose();
    } catch (e: any) {
      setErr(e?.message || 'Failed to submit request');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl border border-black/10 shadow-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold">Get insurance quotes</div>
            <div className="text-sm opacity-70">
              We’ll help you compare options for this coverage gap.
            </div>
          </div>
          <button onClick={props.onClose} className="text-sm underline opacity-80 hover:opacity-100">
            Close
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-black/10 p-3">
          <div className="text-sm font-medium">{props.inventoryItem?.name || 'Item'}</div>
          <div className="text-xs opacity-70">
            Estimated exposure: {exposureCents != null ? `$${(exposureCents / 100).toFixed(0)}` : '—'} {currency}
          </div>
          {props.gapType && <div className="text-xs opacity-70">Gap type: {props.gapType}</div>}
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs opacity-70">Preferred contact</div>
            <select
              value={preferredContact}
              onChange={(e) => setPreferredContact(e.target.value as any)}
              className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
            >
              <option value="EMAIL">Email</option>
              <option value="SMS">Text (SMS)</option>
              <option value="PHONE">Phone call</option>
            </select>
          </div>

          <div>
            <div className="text-xs opacity-70">ZIP code (optional)</div>
            <input
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
              placeholder="e.g., 10001"
            />
          </div>

          {preferredContact === 'EMAIL' ? (
            <div className="md:col-span-2">
              <div className="text-xs opacity-70">Email</div>
              <input
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                placeholder="you@example.com"
              />
            </div>
          ) : (
            <div className="md:col-span-2">
              <div className="text-xs opacity-70">Phone</div>
              <input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                placeholder="+1 (555) 555-5555"
              />
            </div>
          )}

          <div className="md:col-span-2">
            <div className="text-xs opacity-70">Notes (optional)</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm min-h-[90px]"
              placeholder="Any constraints or preferences (deductible, carriers, etc.)"
            />
          </div>
        </div>

        {err && <div className="mt-3 text-sm text-red-600">{err}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={props.onClose}
            className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
          >
            {saving ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </div>
    </div>
  );
}
