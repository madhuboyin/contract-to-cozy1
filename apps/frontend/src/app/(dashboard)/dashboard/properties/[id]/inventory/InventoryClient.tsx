// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/InventoryClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { InventoryItem, InventoryItemCategory, InventoryRoom } from '@/types';
import { listInventoryItems, listInventoryRooms, downloadInventoryExport } from '../../../inventory/inventoryApi';
import InventoryItemDrawer from '../../../components/inventory/InventoryItemDrawer';
import InventoryFilters from '../../../components/inventory/InventoryFilters';
import InventoryRoomChips from '../../../components/inventory/InventoryRoomChips';
import InventoryItemCard from '../../../components/inventory/InventoryItemCard';
import { SectionHeader } from '../../../components/SectionHeader';

export default function InventoryClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [rooms, setRooms] = useState<InventoryRoom[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState('');
  const [roomId, setRoomId] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<InventoryItemCategory | undefined>(undefined);
  const [hasDocuments, setHasDocuments] = useState<boolean | undefined>(undefined);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const API_BASE = process.env.NEXT_PUBLIC_API_URL; // must already exist in your app

  const [gapLoading, setGapLoading] = React.useState(false);
  const [gapError, setGapError] = React.useState<string | null>(null);
  const [gapIds, setGapIds] = React.useState<Set<string>>(new Set());
  const [gapCounts, setGapCounts] = React.useState<any>(null);
  const [showOnlyGaps, setShowOnlyGaps] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setGapLoading(true);
        setGapError(null);
  
        const res = await fetch(
          `${API_BASE}/api/properties/${propertyId}/inventory/coverage-gaps`,
          { credentials: 'include', cache: 'no-store' }
        );
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.message || `Failed (${res.status})`);
  
        const gaps = json?.data?.gaps || [];
        const ids = new Set<string>(gaps.map((g: any) => g.inventoryItemId));
  
        if (!cancelled) {
          setGapIds(ids);
          setGapCounts(json?.data?.counts || null);
        }
      } catch (e: any) {
        if (!cancelled) setGapError(e?.message || 'Failed to load coverage gaps');
      } finally {
        if (!cancelled) setGapLoading(false);
      }
    })();
  
    return () => { cancelled = true; };
  }, [API_BASE, propertyId]);

  async function refreshAll() {
    if (!propertyId) return;
    setLoading(true);
    try {
      const [r, it] = await Promise.all([
        listInventoryRooms(propertyId),
        listInventoryItems(propertyId, { q, roomId, category, hasDocuments }),
      ]);
      setRooms(r);
      setItems(it);
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
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, roomId, category, hasDocuments]);

  const roomOptions = useMemo(
    () => [{ id: 'ALL', name: 'All Rooms' }, ...rooms.map((r) => ({ id: r.id, name: r.name }))],
    [rooms]
  );

  const visibleItems = useMemo(() => {
    if (!showOnlyGaps) return items;
    return items.filter((it) => gapIds.has(it.id));
  }, [items, showOnlyGaps, gapIds]);

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
      <div className="flex items-start justify-between gap-4">
        {/* LEFT: Title + Tabs */}
        <div className="flex items-start gap-6">
          <SectionHeader
            icon="📦"
            title="Home Inventory"
            description="Track appliances, systems, and valuables with receipts and replacement values."
          />

          <div className="flex items-center gap-2 mt-1">
            <div className="rounded-xl px-3 py-2 text-sm border border-black/10 bg-black/5">
              Items
            </div>

            <Link
              href={`/dashboard/properties/${propertyId}/inventory/coverage`}
              className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
            >
              Coverage
            </Link>
          </div>
        </div>

        {/* RIGHT: Actions */}
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/properties/${propertyId}/inventory/rooms`}
            className="text-sm underline opacity-80 hover:opacity-100"
          >
            Manage rooms
          </Link>

          <button
            onClick={onAdd}
            className="rounded-xl px-4 py-2 text-sm font-medium shadow-sm border border-black/10 hover:bg-black/5"
          >
            Add item
          </button>

          <button
            onClick={handleExport}
            className="rounded-xl px-4 py-2 text-sm font-medium shadow-sm border border-black/10 hover:bg-black/5"
          >
            Export CSV
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
        onSaved={async () => {
          setDrawerOpen(false);
          await refreshAll();
        }}
      />
    </div>
  );
}
