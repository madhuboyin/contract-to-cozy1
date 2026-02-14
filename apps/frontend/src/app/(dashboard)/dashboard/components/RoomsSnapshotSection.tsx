'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import { listInventoryRooms } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import type { InventoryRoom } from '@/types';

interface RoomsSnapshotSectionProps {
  propertyId?: string;
}

export function RoomsSnapshotSection({ propertyId }: RoomsSnapshotSectionProps) {
  const [rooms, setRooms] = React.useState<InventoryRoom[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!propertyId) {
      setRooms([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    listInventoryRooms(propertyId)
      .then((result) => {
        if (cancelled) return;
        const sorted = [...result].sort((a, b) => {
          const byOrder = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
          if (byOrder !== 0) return byOrder;
          return String(a.name || '').localeCompare(String(b.name || ''));
        });
        setRooms(sorted);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Unable to load rooms right now.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const scrollBy = (direction: 'left' | 'right') => {
    if (!scrollerRef.current) return;
    const delta = direction === 'left' ? -320 : 320;
    scrollerRef.current.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const roomsHubHref = propertyId ? `/dashboard/properties/${propertyId}?tab=rooms` : '/dashboard/properties';
  const roomsManageHref = propertyId ? `/dashboard/properties/${propertyId}/inventory/rooms` : '/dashboard/properties';
  const roomBaseHref = propertyId ? `/dashboard/properties/${propertyId}` : '/dashboard/properties';

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <LayoutGrid className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Rooms</h2>
            <p className="text-sm text-gray-500">Room-level health and item access for this property.</p>
          </div>
        </div>

        {rooms.length > 0 && (
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => scrollBy('left')}
              className="p-2 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
              aria-label="Scroll rooms left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scrollBy('right')}
              className="p-2 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
              aria-label="Scroll rooms right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading rooms...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : rooms.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-base font-semibold text-gray-900">No rooms configured yet</h3>
          <p className="text-sm text-gray-600 mt-1">
            Configure rooms for this property to unlock room-level health, items, and AI scan workflows.
          </p>
          <div className="mt-4">
            <Link
              href={roomsManageHref}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Manage rooms
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollerRef} className="flex gap-4 overflow-x-auto pb-2 no-scrollbar snap-x scroll-smooth">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="snap-start min-w-[280px] md:min-w-[320px] flex-shrink-0 rounded-xl border border-gray-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">{room.name || 'Unnamed room'}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {room.floorLevel !== null
                        ? <>Floor: <span className="font-medium">{room.floorLevel}</span></>
                        : <>Floor not set</>}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link
                    href={`${roomBaseHref}/rooms/${room.id}`}
                    className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  >
                    View room
                  </Link>
                  <Link
                    href={`${roomBaseHref}/inventory?roomId=${room.id}`}
                    className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  >
                    Items
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3">
            <Link href={roomsHubHref} className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors">
              View all rooms
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
