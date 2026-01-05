// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/rooms/RoomsClient.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { InventoryRoom } from '@/types';
import {
  createInventoryRoom,
  deleteInventoryRoom,
  listInventoryRooms,
  updateInventoryRoom,
} from '../../../../inventory/inventoryApi';
import { SectionHeader } from '../../../../components/SectionHeader';

export default function RoomsClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [rooms, setRooms] = useState<InventoryRoom[]>([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const r = await listInventoryRooms(propertyId);
    setRooms(r);
  }

  useEffect(() => {
    if (propertyId) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  async function onAdd() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createInventoryRoom(propertyId, { name: name.trim() });
      setName('');
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function onRename(room: InventoryRoom) {
    const next = prompt('Rename room', room.name);
    if (!next) return;
    await updateInventoryRoom(propertyId, room.id, { name: next.trim() });
    await refresh();
  }

  async function onDelete(room: InventoryRoom) {
    const ok = confirm(`Delete room "${room.name}"? Items in this room will become unassigned.`);
    if (!ok) return;
    await deleteInventoryRoom(propertyId, room.id);
    await refresh();
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <SectionHeader icon="🏠" title="Manage rooms" description="Create, rename, and organize rooms for inventory." />
        <Link
          href={`/dashboard/properties/${propertyId}/inventory`}
          className="text-sm underline opacity-80 hover:opacity-100"
        >
          Back to inventory
        </Link>
      </div>

      <div className="rounded-2xl border border-black/10 p-4">
        <div className="text-sm font-medium">Add a room</div>
        <div className="flex gap-2 mt-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Kitchen"
            className="flex-1 rounded-xl border border-black/10 px-3 py-2 text-sm"
          />
          <button
            onClick={onAdd}
            disabled={saving || !name.trim()}
            className="rounded-xl px-4 py-2 text-sm font-medium shadow-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 divide-y">
        {rooms.length === 0 ? (
          <div className="p-4 text-sm opacity-70">No rooms yet.</div>
        ) : (
          rooms.map((r) => (
            <div key={r.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs opacity-60">Sort: {r.sortOrder}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => onRename(r)} className="text-sm underline opacity-80 hover:opacity-100">
                  Rename
                </button>
                <button onClick={() => onDelete(r)} className="text-sm underline text-red-600 hover:text-red-700">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
