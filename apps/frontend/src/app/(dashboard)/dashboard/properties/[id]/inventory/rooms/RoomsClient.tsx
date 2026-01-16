// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/rooms/RoomsClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';


import { InventoryRoom } from '@/types';
import {
  createInventoryRoom,
  deleteInventoryRoom,
  listInventoryRooms,
  updateInventoryRoom,
} from '../../../../inventory/inventoryApi';
import { SectionHeader } from '../../../../components/SectionHeader';

const ROOM_TYPES = [
  'KITCHEN',
  'LIVING_ROOM',
  'BEDROOM',
  'BATHROOM',
  'DINING',
  'LAUNDRY',
  'GARAGE',
  'OFFICE',
  'BASEMENT',
  'OTHER',
] as const;

type RoomTypeValue = (typeof ROOM_TYPES)[number];

function prettyType(t: string) {
  return t
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function defaultLabelForType(t: RoomTypeValue) {
  return prettyType(t);
}

export default function RoomsClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [rooms, setRooms] = useState<InventoryRoom[]>([]);
  const [saving, setSaving] = useState(false);

  const [roomType, setRoomType] = useState<RoomTypeValue>('KITCHEN');
  const [label, setLabel] = useState<string>('');

  const suggestedLabel = useMemo(() => defaultLabelForType(roomType), [roomType]);

  async function refresh() {
    const r = await listInventoryRooms(propertyId);
    setRooms(r);
  }

  useEffect(() => {
    if (propertyId) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  async function onAdd() {
    if (roomType === 'OTHER' && !label.trim()) return;

    setSaving(true);
    try {
      const nameToSend = label.trim() ? label.trim() : undefined;
      await createInventoryRoom(propertyId, { type: roomType, name: nameToSend });
      setLabel('');
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function onRename(room: InventoryRoom, nextName: string) {
    const name = nextName.trim();
    if (!name) return;
    await updateInventoryRoom(propertyId, room.id, { name });
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

      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="text-sm font-medium">Add room</div>
        <div className="text-xs opacity-60 mt-1">
          Choose a room template first. You can optionally customize the label (e.g., “Kids Bathroom”).
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
            <div className="text-xs uppercase tracking-wide opacity-60">Room type</div>
            <select
              value={roomType}
              onChange={(e) => setRoomType(e.target.value as RoomTypeValue)}
              className="mt-1 w-full text-sm bg-transparent outline-none"
            >
              {ROOM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {prettyType(t)}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-black/10 bg-white px-3 py-2 md:col-span-2">
            <div className="text-xs uppercase tracking-wide opacity-60">
              Label <span className="opacity-60">(optional)</span>
            </div>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={roomType === 'OTHER' ? 'e.g., “Music Room”' : `Default: “${suggestedLabel}”`}
              className="mt-1 w-full text-sm bg-transparent outline-none"
            />
            {roomType === 'OTHER' && !label.trim() ? (
              <div className="text-xs text-red-600 mt-1">Label is required for “Other”.</div>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={onAdd}
            disabled={saving || (roomType === 'OTHER' && !label.trim())}
            className="rounded-xl px-4 py-2 text-sm font-medium shadow-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add room'}
          </button>

          <div className="text-xs opacity-60">Tip: Leave label blank to use the default name for the selected template.</div>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="text-sm font-medium">Rooms</div>
        <div className="mt-3 space-y-2">
          {rooms.length === 0 ? (
            <div className="text-sm opacity-70">No rooms yet.</div>
          ) : (
            rooms.map((r) => <RoomRow key={r.id} room={r} onRename={onRename} onDelete={onDelete} />)
          )}
        </div>
      </div>
    </div>
  );
}

function RoomRow({
  room,
  onRename,
  onDelete,
}: {
  room: InventoryRoom;
  onRename: (room: InventoryRoom, nextName: string) => Promise<void>;
  onDelete: (room: InventoryRoom) => Promise<void>;
}) {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(room.name);

  useEffect(() => setName(room.name), [room.name]);

  //const href = `/dashboard/properties/${propertyId}/inventory/rooms/${room.id}`;
  const href = `/dashboard/properties/${propertyId}/rooms/${room.id}`;

  return (
    <div
      className={[
        'rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2',
        !editing ? 'hover:bg-black/[0.04] cursor-pointer' : '',
      ].join(' ')}
      role={!editing ? 'button' : undefined}
      tabIndex={!editing ? 0 : -1}
      onClick={() => {
        if (!editing) router.push(href);
      }}
      onKeyDown={(e) => {
        if (!editing && (e.key === 'Enter' || e.key === ' ')) router.push(href);
      }}
      title={!editing ? 'Open room' : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              value={name}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-sm bg-white rounded-lg border border-black/10 px-3 py-2 outline-none"
            />
          ) : (
            <div className="text-sm font-medium truncate">{room.name}</div>
          )}

          <div className="text-xs opacity-60 mt-1">
            Template: <span className="font-medium">{(room as any)?.type || '—'}</span>
          </div>
        </div>

        {/* Right rail: chevron + actions */}
        <div className="flex items-center gap-2">
          {!editing ? (
            <div className="text-black/30 text-lg leading-none select-none" aria-hidden>
              ›
            </div>
          ) : null}

          {editing ? (
            <>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  await onRename(room, name);
                  setEditing(false);
                }}
                className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
              >
                Save
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setName(room.name);
                  setEditing(false);
                }}
                className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
            >
              Rename
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(room);
            }}
            className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
            title="Delete room"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

