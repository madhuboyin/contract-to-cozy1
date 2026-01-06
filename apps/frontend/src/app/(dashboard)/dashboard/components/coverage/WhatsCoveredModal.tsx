// apps/frontend/src/app/(dashboard)/dashboard/components/coverage/WhatsCoveredModal.tsx
'use client';
import { api } from '@/lib/api/client';
import React, { useEffect, useState } from 'react';

export default function WhatsCoveredModal(props: {
  open: boolean;
  onClose: () => void;
  apiBase: string; // Keep for prop compatibility, though internal client handles base URL
  propertyId: string;
  itemId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open || !props.itemId || !props.propertyId) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // 2. REFACTORED: Use the api client instead of native fetch
        // The client handles Authorization headers and base URLs automatically
        const response = await api.get(
          `/api/properties/${props.propertyId}/inventory/items/${props.itemId}/coverage-summary`
        );

        if (!cancelled) {
          // The api.get helper returns the 'data' property from the JSON response
          setData(response.data);
        }
      } catch (e: any) {
        if (!cancelled) {
          // The api client throws APIError with standardized error messages
          setErr(e?.message || 'Failed to load coverage summary');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [props.open, props.propertyId, props.itemId])

  if (!props.open) return null;

  const item = data?.item;
  const w = data?.warranty;
  const p = data?.insurancePolicy;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl border border-black/10 shadow-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold">What’s covered?</div>
            <div className="text-sm opacity-70">
              Warranty and insurance typically cover different things. Here’s what we found for this item.
            </div>
          </div>
          <button onClick={props.onClose} className="text-sm underline opacity-80 hover:opacity-100">
            Close
          </button>
        </div>

        {loading ? (
          <div className="mt-4 text-sm opacity-70">Loading…</div>
        ) : err ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
        ) : (
          <>
            <div className="mt-4 rounded-xl border border-black/10 p-3">
              <div className="text-sm font-medium">{item?.name || 'Item'}</div>
              <div className="text-xs opacity-70">
                Replacement estimate: {item?.replacementCostCents != null ? `$${(item.replacementCostCents / 100).toFixed(0)}` : '—'} {item?.currency || 'USD'}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-black/10 p-3">
                <div className="text-sm font-medium">Warranty</div>
                {w ? (
                  <>
                    <div className="text-xs opacity-70 mt-1">
                      {w.providerName} {w.policyNumber ? `• ${w.policyNumber}` : ''}
                    </div>
                    <div className="text-xs opacity-70">
                      Status: {w.active ? 'Active' : 'Expired'} • exp {new Date(w.expiryDate).toLocaleDateString()}
                    </div>
                    {w.coverageDetails && (
                      <div className="mt-2 text-xs whitespace-pre-wrap rounded-lg bg-black/5 p-2">
                        {w.coverageDetails}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-xs opacity-70 mt-1">No warranty linked.</div>
                )}
              </div>

              <div className="rounded-xl border border-black/10 p-3">
                <div className="text-sm font-medium">Insurance</div>
                {p ? (
                  <>
                    <div className="text-xs opacity-70 mt-1">
                      {p.carrierName} • {p.policyNumber}
                    </div>
                    <div className="text-xs opacity-70">
                      Type: {p.coverageType || '—'}
                    </div>
                    <div className="text-xs opacity-70">
                      Status: {p.active ? 'Active' : 'Expired'} • exp {new Date(p.expiryDate).toLocaleDateString()}
                    </div>
                  </>
                ) : (
                  <div className="text-xs opacity-70 mt-1">No insurance policy linked.</div>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-black/10 p-3">
              <div className="text-sm font-medium">Quick guide</div>
              <ul className="mt-2 text-sm list-disc pl-5 space-y-1 opacity-80">
                <li><b>Warranty</b> usually covers repair/replacement due to breakdown (terms vary).</li>
                <li><b>Insurance</b> usually covers loss from covered events (fire, water, theft, etc.).</li>
                <li>Many claims require proof (receipts, serial/model, photos) — attach documents to the item.</li>
              </ul>
              <div className="mt-2 text-xs opacity-60">
                This is general guidance, not legal/insurance advice. Final coverage depends on your policy and contract terms.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
