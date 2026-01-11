// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/InventoryClient.tsx
'use client';
import { api } from '@/lib/api/client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSearchParams } from 'next/navigation';

import { listInventoryItemRecalls } from '../recalls/recallsApi';
import { InventoryItem, InventoryItemCategory, InventoryRoom } from '@/types';
import { listInventoryItems, listInventoryRooms, downloadInventoryExport } from '../../../inventory/inventoryApi';
import InventoryItemDrawer from '../../../components/inventory/InventoryItemDrawer';
import InventoryFilters from '../../../components/inventory/InventoryFilters';
import InventoryRoomChips from '../../../components/inventory/InventoryRoomChips';
import InventoryItemCard from '../../../components/inventory/InventoryItemCard';
import { SectionHeader } from '../../../components/SectionHeader';
import { listPropertyRecalls } from '../recalls/recallsApi';

export default function InventoryClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const searchParams = useSearchParams();
  const openItemId = searchParams.get('openItemId');
  const highlightRecallMatchId = searchParams.get('highlightRecallMatchId');

  const [rooms, setRooms] = useState<InventoryRoom[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState('');
  const [roomId, setRoomId] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<InventoryItemCategory | undefined>(undefined);
  const [hasDocuments, setHasDocuments] = useState<boolean | undefined>(undefined);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const [gapLoading, setGapLoading] = React.useState(false);
  const [gapError, setGapError] = React.useState<string | null>(null);
  const [gapIds, setGapIds] = React.useState<Set<string>>(new Set());
  const [gapCounts, setGapCounts] = React.useState<any>(null);
  const [showOnlyGaps, setShowOnlyGaps] = React.useState(false);
  const [hasRecallAlerts, setHasRecallAlerts] = useState<boolean | undefined>(undefined);
  const [autoOpenedFromUrl, setAutoOpenedFromUrl] = useState(false);

  const [recallMatchesByItemId, setRecallMatchesByItemId] = useState<Record<string, any[]>>({});
  const [recallsLoading, setRecallsLoading] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setGapLoading(true);
        setGapError(null);
  
        // 2. REPLACE the native fetch with the api client
        // Note: use api.get() which handles headers and base URLs automatically
        const response = await api.get(`/api/properties/${propertyId}/inventory/coverage-gaps`);
  
        if (!cancelled) {
          // The api client returns the data object directly on success
          const gaps = response.data?.gaps || [];
          const ids = new Set<string>(gaps.map((g: any) => g.inventoryItemId));
          
          setGapIds(ids);
          setGapCounts(response.data?.counts || null);
        }
      } catch (e: any) {
        if (!cancelled) {
          // The api client throws an APIError with a clear message
          setGapError(e?.message || 'Failed to load coverage gaps');
        }
      } finally {
        if (!cancelled) setGapLoading(false);
      }
    })();
  
    return () => { cancelled = true; };
  }, [propertyId]); 

  async function refreshAll() {
    if (!propertyId) return;
    setLoading(true);
  
    try {
      const [r, it, recalls] = await Promise.all([
        listInventoryRooms(propertyId),
        // ⛔️ remove hasRecallAlerts from server call (we’ll filter in UI)
        listInventoryItems(propertyId, { q, roomId, category, hasDocuments }),
        listPropertyRecalls(propertyId),
      ]);
  
      setRooms(r);
      setItems(it);
  
      // Handle both shapes defensively: { matches } (new) or { recallMatches } (old)
      const matches = (recalls as any)?.matches ?? (recalls as any)?.recallMatches ?? [];
      const map: Record<string, any[]> = {};
      for (const m of matches) {
        const id = m?.inventoryItemId;
        if (!id) continue;
        (map[id] ||= []).push(m);
      }
      setRecallMatchesByItemId(map);
    } finally {
      setLoading(false);
    }
  }
  

  async function handleExport() {
    try {
      await downloadInventoryExport(propertyId);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export CSV. Please try again.');
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  useEffect(() => {
    if (autoOpenedFromUrl) return;
    if (!openItemId || items.length === 0) return;
  
    const existing = items.find((it) => it.id === openItemId);
    if (existing) {
      setEditingItem(existing);
      setDrawerOpen(true);
      setAutoOpenedFromUrl(true);
    }
  }, [openItemId, items, autoOpenedFromUrl]);
  

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, roomId, category, hasDocuments]);
  

  const roomOptions = useMemo(
    () => [{ id: 'ALL', name: 'All Rooms' }, ...rooms.map((r) => ({ id: r.id, name: r.name }))],
    [rooms]
  );

  const visibleItems = useMemo(() => {
    let out = items;
  
    // gap filter
    if (showOnlyGaps) {
      out = out.filter((it) => gapIds.has(it.id));
    }
  
    // ✅ recall alerts filter (OPEN only)
    if (hasRecallAlerts !== undefined) {
      out = out.filter((it) => {
        const matches = recallMatchesByItemId[it.id] ?? [];
        const hasOpen = matches.some((m) => m?.status === 'OPEN');
  
        return hasRecallAlerts ? hasOpen : !hasOpen;
      });
    }
  
    return out;
  }, [items, showOnlyGaps, gapIds, hasRecallAlerts, recallMatchesByItemId]);
  

  function onAdd() {
    setEditingItem(null);
    setDrawerOpen(true);
  }

  function onEdit(item: InventoryItem) {
    setEditingItem(item);
    setDrawerOpen(true);
  }

  const hasAnyItems = items.length > 0;
  const hasVisibleItems = visibleItems.length > 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-4">
        {/* ROW 1: Title + Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <SectionHeader
            icon="📦"
            title="Home Inventory"
            description="Track appliances, systems, and valuables with receipts and replacement values."
          />

          <div className="inline-flex items-center p-1 bg-black/5 rounded-xl border border-black/5 shrink-0">
            <div className="px-4 py-1.5 text-sm font-medium bg-white text-black shadow-sm rounded-lg border border-black/5">
              Items
            </div>
            <Link
              href={`/dashboard/properties/${propertyId}/inventory/coverage`}
              className="px-4 py-1.5 text-sm font-medium text-black/50 hover:text-black transition-colors duration-200"
            >
              Coverage
            </Link>
          </div>
        </div>

        {/* ROW 2: Actions - wrap on mobile */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Link
            href={`/dashboard/properties/${propertyId}/inventory/rooms`}
            className="text-sm underline opacity-80 hover:opacity-100"
          >
            <span className="hidden sm:inline">Manage rooms</span>
            <span className="sm:hidden">Rooms</span>
          </Link>

          <button
            onClick={onAdd}
            className="rounded-xl px-3 sm:px-4 py-2 text-sm font-medium shadow-sm border border-black/10 hover:bg-black/5"
          >
            <span className="hidden sm:inline">Add item</span>
            <span className="sm:hidden">+ Add</span>
          </button>

          <button
            onClick={handleExport}
            className="rounded-xl px-3 sm:px-4 py-2 text-sm font-medium shadow-sm border border-black/10 hover:bg-black/5"
          >
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>
      </div>
  
      {/* Coverage Gap Banner */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Coverage gaps</div>
            {gapLoading ? (
              <div className="text-xs opacity-70 mt-1">Checking your inventory…</div>
            ) : gapError ? (
              <div className="text-xs text-red-600 mt-1">{gapError}</div>
            ) : (
              <div className="text-xs opacity-70 mt-1">
                {gapCounts?.total ? (
                  <>
                    {gapCounts.total} high-value item{gapCounts.total === 1 ? '' : 's'} may be
                    missing active coverage.
                    {gapCounts.NO_COVERAGE ? ` • ${gapCounts.NO_COVERAGE} uncovered` : ''}
                  </>
                ) : (
                  <>No high-value coverage gaps detected.</>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowOnlyGaps((v) => !v)}
              disabled={gapLoading || !!gapError || !gapCounts?.total}
              className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
            >
              {showOnlyGaps ? 'Show all' : 'Review gaps'}
            </button>

            <a
              href={`/dashboard/actions?propertyId=${propertyId}&filter=coverage-gaps`}
              className="text-sm underline opacity-80 hover:opacity-100"
            >
              View in Actions
            </a>
          </div>
        </div>
      </div>

      <InventoryFilters
        q={q}
        onQChange={setQ}
        roomId={roomId}
        onRoomChange={(val) => {
          if (val === 'ALL') {
            setRoomId(undefined);
          } else {
            setRoomId(val);
          }
        }}
        category={category}
        onCategoryChange={setCategory}
        hasDocuments={hasDocuments}
        onHasDocumentsChange={setHasDocuments}
        hasRecallAlerts={hasRecallAlerts}
        onHasRecallAlertsChange={setHasRecallAlerts}
        rooms={roomOptions}
      />

      <InventoryRoomChips rooms={rooms} selectedRoomId={roomId} onSelect={(id) => setRoomId(id)} />

      {loading ? (
          <div className="text-sm opacity-70">Loading…</div>
        ) : !hasAnyItems ? (
          // ✅ truly no items in inventory
          <div className="rounded-2xl border border-black/10 p-6">
            <div className="text-base font-medium">No inventory items yet</div>
            <div className="text-sm opacity-70 mt-1">
              Add your first item (HVAC, water heater, appliances, valuables) to build your home asset library.
            </div>
            <button
              onClick={onAdd}
              className="mt-4 rounded-xl px-4 py-2 text-sm font-medium shadow-sm border border-black/10 hover:bg-black/5"
            >
              Add item
            </button>
          </div>
        ) : !hasVisibleItems ? (
          // ✅ items exist, but filters/gap filter hide them
          <div className="rounded-2xl border border-black/10 p-6">
            <div className="text-base font-medium">No items match your filters</div>
            <div className="text-sm opacity-70 mt-1">
              Try clearing search/filters{showOnlyGaps ? ' or switch to "Show all".' : '.'}
            </div>
            <div className="mt-4 flex items-center gap-3">
              {showOnlyGaps && (
                <button
                  onClick={() => setShowOnlyGaps(false)}
                  className="rounded-xl px-4 py-2 text-sm font-medium shadow-sm border border-black/10 hover:bg-black/5"
                >
                  Show all
                </button>
              )}
              <button
                onClick={onAdd}
                className="rounded-xl px-4 py-2 text-sm font-medium shadow-sm border border-black/10 hover:bg-black/5"
              >
                Add item
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleItems.map((item) => (
              <InventoryItemCard key={item.id} item={item} onClick={() => onEdit(item)} />
            ))}
          </div>
        )}
        
      <InventoryItemDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        propertyId={propertyId}
        rooms={rooms}
        initialItem={editingItem}
        highlightRecallMatchId={highlightRecallMatchId}
        onSaved={async () => {
          setDrawerOpen(false);
          await refreshAll();
        }}
      />
    </div>
  );
}
