// src/app/(dashboard)/dashboard/properties/[id]/inventory/coverage/CoverageClient.tsx
'use client';

import React from 'react';
import Link from 'next/link';
// 1. Import the unified API client
import { api } from '@/lib/api/client'; 
import { InventoryItem, InventoryRoom } from '@/types';
import { SectionHeader } from '../../../../components/SectionHeader';
import InsuranceQuoteModal from '@/app/(dashboard)/dashboard/components/coverage/InsuranceQuoteModal';
import WhatsCoveredModal from '@/app/(dashboard)/dashboard/components/coverage/WhatsCoveredModal';
import InventoryItemDrawer from '@/app/(dashboard)/dashboard/components/inventory/InventoryItemDrawer';
import { getInventoryItem, listInventoryRooms } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';

export default function CoverageClient({ propertyId }: { propertyId: string }) {
  // Use the standard API URL from the client
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';

  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [data, setData] = React.useState<any>(null);
  const [rooms, setRooms] = React.useState<InventoryRoom[]>([]);

  const [quoteOpen, setQuoteOpen] = React.useState(false);
  const [coveredOpen, setCoveredOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<any>(null);
  const [editingItem, setEditingItem] = React.useState<InventoryItem | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [openingItemId, setOpeningItemId] = React.useState<string | null>(null);

  async function refreshCoverageOnly() {
    const response = await api.get(`/api/properties/${propertyId}/inventory/coverage-gaps`);
    setData(response.data);
  }

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // Load coverage summary and room options in parallel for inline item editing.
        const [coverageRes, roomsRes] = await Promise.allSettled([
          api.get(`/api/properties/${propertyId}/inventory/coverage-gaps`),
          listInventoryRooms(propertyId),
        ]);

        if (cancelled) return;

        if (coverageRes.status === 'fulfilled') {
          setData(coverageRes.value.data);
        } else {
          const e: any = coverageRes.reason;
          setErr(e?.message || 'Failed to load coverage summary');
        }

        if (roomsRes.status === 'fulfilled') {
          setRooms(roomsRes.value);
        } else {
          setRooms([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [propertyId]); // Removed apiBase dependency as it's now internal to the client

  const gaps = data?.gaps || [];
  const counts = data?.counts || {};

  async function handleViewItem(itemId: string) {
    setOpeningItemId(itemId);
    try {
      const item = await getInventoryItem(propertyId, itemId);
      setEditingItem(item);
      setDrawerOpen(true);
    } catch (e) {
      console.error('[CoverageClient] failed to open item from coverage', e);
      alert('Unable to open this item from coverage. Please try again.');
    } finally {
      setOpeningItemId(null);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <SectionHeader
          icon="🛡️"
          title="Coverage"
          description="Review high-value items missing warranty or insurance coverage."
        />

        {/* Tabs */}
        <div className="inline-flex items-center p-1 bg-black/5 rounded-xl border border-black/5 shrink-0">
          <Link
            href={`/dashboard/properties/${propertyId}/inventory`}
            className="px-4 py-1.5 text-sm font-medium text-black/50 hover:text-black transition-colors duration-200"
          >
            Items
          </Link>
          <div className="px-4 py-1.5 text-sm font-medium bg-white text-black shadow-sm rounded-lg border border-black/5">
            Coverage
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-sm opacity-70">Loading…</div>
      ) : err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-black/10 p-4">
              <div className="text-xs opacity-70">Total gaps</div>
              <div className="text-2xl font-semibold mt-1">{counts.total || 0}</div>
            </div>
            <div className="rounded-2xl border border-black/10 p-4">
              <div className="text-xs opacity-70">Uncovered</div>
              <div className="text-2xl font-semibold mt-1">{counts.NO_COVERAGE || 0}</div>
            </div>
            <div className="rounded-2xl border border-black/10 p-4">
              <div className="text-xs opacity-70">Partial / expired</div>
              <div className="text-2xl font-semibold mt-1">
                {(counts.WARRANTY_ONLY || 0) + (counts.INSURANCE_ONLY || 0) + (counts.EXPIRED_WARRANTY || 0) + (counts.EXPIRED_INSURANCE || 0)}
              </div>
            </div>
          </div>

          {/* List */}
          <div className="rounded-2xl border border-black/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-black/10 text-sm font-medium">
              Items needing attention
            </div>

            {gaps.length === 0 ? (
              <div className="p-4 text-sm opacity-70">No high-value coverage gaps detected.</div>
            ) : (
              <div className="divide-y divide-black/10">
                {gaps.map((g: any) => (
                  <div key={g.inventoryItemId} className="p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {g.itemName}
                        {g.roomName ? <span className="text-xs opacity-70"> • {g.roomName}</span> : null}
                      </div>
                      <div className="text-xs opacity-70 mt-1">
                        {g.reasons?.join('. ') || 'Coverage gap detected'}
                      </div>
                      <div className="text-xs opacity-70 mt-1">
                        Exposure: ${Math.round((g.exposureCents || 0) / 100)} {g.currency || 'USD'} • {g.gapType}
                      </div>
                    </div>

                    {/* Buttons - always horizontal */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleViewItem(g.inventoryItemId)}
                        disabled={openingItemId === g.inventoryItemId}
                        className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
                      >
                        {openingItemId === g.inventoryItemId ? 'Opening…' : 'View'}
                      </button>

                      <button
                        onClick={() => { setSelected(g); setQuoteOpen(true); }}
                        className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
                      >
                        Quotes
                      </button>

                      <button
                        onClick={() => { setSelected(g); setCoveredOpen(true); }}
                        className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
                      >
                        Info
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {/* Modals */}
      <InsuranceQuoteModal
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        apiBase={apiBase}
        propertyId={propertyId}
        gapType={selected?.gapType}
        inventoryItem={
          selected
            ? {
                id: selected.inventoryItemId,
                name: selected.itemName,
                replacementCostCents: selected.exposureCents,
                currency: selected.currency,
              }
            : undefined
        }
      />

      {selected?.inventoryItemId && (
        <WhatsCoveredModal
          open={coveredOpen}
          onClose={() => setCoveredOpen(false)}
          apiBase={apiBase}
          propertyId={propertyId}
          itemId={selected.inventoryItemId}
        />
      )}

      <InventoryItemDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        propertyId={propertyId}
        rooms={rooms}
        initialItem={editingItem}
        onSaved={async () => {
          setDrawerOpen(false);
          await refreshCoverageOnly();
        }}
      />
    </div>
  );
}
