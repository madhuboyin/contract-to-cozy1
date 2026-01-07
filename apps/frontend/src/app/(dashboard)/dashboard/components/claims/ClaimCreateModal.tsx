'use client';

import React, { useState } from 'react';
import type { ClaimDTO, ClaimType } from '@/types/claims.types';
import { createClaim } from '@/app/(dashboard)/dashboard/properties/[id]/claims/claimsApi';
import { toast } from '@/components/ui/use-toast';

const TYPE_OPTIONS: ClaimType[] = [
  'WATER_DAMAGE',
  'FIRE_SMOKE',
  'STORM_WIND_HAIL',
  'THEFT_VANDALISM',
  'LIABILITY',
  'HVAC',
  'PLUMBING',
  'ELECTRICAL',
  'APPLIANCE',
  'OTHER',
];

export default function ClaimCreateModal({
  open,
  onClose,
  propertyId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  onCreated: (claim: ClaimDTO) => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ClaimType>('WATER_DAMAGE');
  const [desc, setDesc] = useState('');
  const [providerName, setProviderName] = useState('');
  const [claimNumber, setClaimNumber] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  function resetForm() {
    setTitle('');
    setType('WATER_DAMAGE');
    setDesc('');
    setProviderName('');
    setClaimNumber('');
  }

  async function submit() {
    const t = title.trim();
    if (!t) return;

    setBusy(true);
    try {
      // 1. Await the API response
      const claim = await createClaim(propertyId, {
        title: t,
        description: desc.trim() || null,
        type,
        providerName: providerName.trim() || null,
        claimNumber: claimNumber.trim() || null,
        generateChecklist: true,
      });

      // 2. Pass the fresh claim object to the parent
      if (claim) {
        onCreated(claim);
        
        // 3. Reset local state only after successful creation
        setTitle('');
        setDesc('');
        setProviderName('');
        setClaimNumber('');
      }
    } catch (err) {
      console.error("Failed to create claim:", err);
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    if (busy) return;
    resetForm(); // optional: keep if you want clean reopen
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-gray-900">Create claim</div>
            <div className="mt-1 text-sm text-gray-600">
              We’ll generate a guided checklist and start a timeline automatically.
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg border px-2 py-1 text-sm hover:bg-gray-50"
            disabled={busy}
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <div className="text-xs font-semibold text-gray-700">Title</div>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Kitchen water leak"
              disabled={busy}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-gray-700">Type</div>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as ClaimType)}
                disabled={busy}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-700">Provider (optional)</div>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="e.g., State Farm"
                disabled={busy}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-gray-700">Claim # (optional)</div>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={claimNumber}
                onChange={(e) => setClaimNumber(e.target.value)}
                placeholder="Optional"
                disabled={busy}
              />
            </div>

            <div className="flex items-end">
              <div className="text-xs text-gray-500">
                Status will start as <span className="font-semibold">DRAFT</span>.
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-700">Description (optional)</div>
            <textarea
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              rows={3}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Short summary of what happened…"
              disabled={busy}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
              onClick={handleClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-800"
              onClick={submit}
              disabled={busy || !title.trim()}
            >
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
