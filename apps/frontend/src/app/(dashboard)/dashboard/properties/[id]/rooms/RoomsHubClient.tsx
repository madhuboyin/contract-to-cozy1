// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/rooms/RoomsHubClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { InventoryRoom } from '@/types';
import { listInventoryRooms, patchRoomMeta } from '../../../inventory/inventoryApi';
import { SectionHeader } from '../../../components/SectionHeader';

function guessRoomType(name: string) {
  const t = (name || '').toLowerCase();
  if (t.includes('kitchen')) return 'KITCHEN';
  if (t.includes('living')) return 'LIVING_ROOM';
  return 'OTHER';
}

function roomIcon(type?: string | null, name?: string) {
  const t = String(type || '').toUpperCase();
  if (t === 'KITCHEN') return '🍳';
  if (t === 'LIVING_ROOM' || t === 'LIVING') return '🛋️';

  const n = (name || '').toLowerCase();
  if (n.includes('bed')) return '🛏️';
  if (n.includes('bath')) return '🛁';
  if (n.includes('office') || n.includes('study')) return '🧠';
  if (n.includes('garage')) return '🚗';
  return '✨';
}

export default function RoomsHubClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [rooms, setRooms] = useState<InventoryRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [detectingId, setDetectingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await listInventoryRooms(propertyId);
      setRooms(r);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (propertyId) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const sorted = useMemo(
    () => [...rooms].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [rooms]
  );

  async function ensureType(room: any) {
    if (!propertyId || !room?.id) return;

    // already set
    if (room?.type) return;

    const inferred = guessRoomType(room.name);
    if (inferred === 'OTHER') return;

    setDetectingId(room.id);
    try {
      await patchRoomMeta(propertyId, room.id, { type: inferred });
      await refresh();
    } catch {
      // non-blocking
    } finally {
      setDetectingId(null);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <SectionHeader
          icon="✨"
          title="Rooms"
          description="Beautiful room pages powered by your inventory—insights, value snapshot, and checklists."
        />
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/properties/${propertyId}/inventory/rooms`}
            className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
          >
            Manage rooms
          </Link>
          <Link
            href={`/dashboard/properties/${propertyId}/inventory`}
            className="text-sm underline opacity-80 hover:opacity-100"
          >
            Back to inventory
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading && (
          <div className="rounded-2xl border border-black/10 p-4 text-sm opacity-70">
            Loading rooms…
          </div>
        )}

        {!loading && sorted.length === 0 && (
          <div className="rounded-2xl border border-black/10 p-4 text-sm opacity-70">
            No rooms yet. Create rooms in{' '}
            <Link className="underline" href={`/dashboard/properties/${propertyId}/inventory/rooms`}>
              Manage rooms
            </Link>
            .
          </div>
        )}

        {sorted.map((r: any) => {
          const inferred = r.type ? null : guessRoomType(r.name);
          const showDetect = !r.type && inferred !== 'OTHER';

          return (
            <div key={r.id} className="rounded-2xl border border-black/10 p-4 bg-white">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{roomIcon(r.type, r.name)}</span>
                    <div className="font-medium truncate">{r.name}</div>
                  </div>

                  <div className="text-xs opacity-60 mt-1">
                    {r.type ? (
                      <>Template: <span className="font-medium">{r.type}</span></>
                    ) : showDetect ? (
                      <>
                        Template not set · Suggested: <span className="font-medium">{inferred}</span>
                      </>
                    ) : (
                      <>Template not set</>
                    )}
                  </div>
                </div>

                {showDetect && (
                  <button
                    onClick={() => ensureType(r)}
                    disabled={detectingId === r.id}
                    className="text-xs rounded-full border border-black/10 px-2 py-1 hover:bg-black/5 disabled:opacity-50"
                    title="Auto-detect Kitchen / Living Room from name"
                  >
                    {detectingId === r.id ? 'Detecting…' : 'Apply'}
                  </button>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Link
                  href={`/dashboard/properties/${propertyId}/rooms/${r.id}`}
                  className="rounded-xl px-4 py-2 text-sm font-medium shadow-sm border border-black/10 hover:bg-black/5"
                >
                  View room
                </Link>

                {/* UX: cross-link to workspace */}
                <Link
                  href={`/dashboard/properties/${propertyId}/inventory/rooms/${r.id}`}
                  className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5"
                >
                  Edit
                </Link>

                <Link
                  href={`/dashboard/properties/${propertyId}/inventory?roomId=${r.id}`}
                  className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5"
                >
                  Items
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
