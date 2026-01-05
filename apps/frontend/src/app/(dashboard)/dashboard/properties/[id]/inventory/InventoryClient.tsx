// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/InventoryClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { InventoryItem, InventoryItemCategory, InventoryRoom } from '@/types';
import { listInventoryItems, listInventoryRooms } from '../../../inventory/inventoryApi';
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

  function onAdd() {
    setEditingItem(null);
    setDrawerOpen(true);
  }

  function onEdit(item: InventoryItem) {
    setEditingItem(item);
    setDrawerOpen(true);
  }

  const API_BASE = process.env.NEXT_PUBLIC_API_URL; // must already exist in your app
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <SectionHeader
          icon="📦"
          title="Home Inventory"
          description="Track appliances, systems, and valuables with receipts and replacement values."
        />
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
  
          <a
            href={`${API_BASE}/api/properties/${propertyId}/inventory/export?format=csv`}
            className="rounded-xl px-4 py-2 text-sm font-medium shadow-sm border border-black/10 hover:bg-black/5"
            target="_blank"
            rel="noreferrer"
          >
            Export CSV
          </a>
        </div>
      </div>
  

      <InventoryFilters
        q={q}
        onQChange={setQ}
        roomId={roomId}
        onRoomChange={(val) => setRoomId(val === 'ALL' ? undefined : val)}
        category={category}
        onCategoryChange={setCategory}
        hasDocuments={hasDocuments}
        onHasDocumentsChange={setHasDocuments}
        rooms={roomOptions}
      />

      <InventoryRoomChips rooms={rooms} selectedRoomId={roomId} onSelect={(id) => setRoomId(id)} />

      {loading ? (
        <div className="text-sm opacity-70">Loading…</div>
      ) : items.length === 0 ? (
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => (
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
