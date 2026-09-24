'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { roomFloors } from '@/features/ask/displayPatterns';
import type { AskGroupedListItem } from '@/features/ask/types';
import { ItemDetailSheet, type ItemActionHandler } from './PatternParts';

// IW-PRES-019 (FRD v1.72). Rooms as tiles, one floor at a time, grouped by the stored floor level. The grid is an
// ordering, not a floor plan: tiles are all the same size and imply nothing about room sizes or positions.
// A domain list with its own live detail (Rooms, FRD v1.79) passes `onOpenRoom` and shows the detail itself.
export function RoomMapView({ items, onItemAction, disabled, onOpenRoom }: { items: AskGroupedListItem[]; onItemAction: ItemActionHandler; disabled: boolean; onOpenRoom?: (item: AskGroupedListItem) => void }) {
  const floors = roomFloors(items);
  const [floorKey, setFloorKey] = useState(floors[0]?.key ?? '');
  const [openItem, setOpenItem] = useState<AskGroupedListItem | null>(null);
  const floor = floors.find((entry) => entry.key === floorKey) ?? floors[0];
  if (!floor) return null;
  return (
    <div className="space-y-3 p-4">
      {floors.length > 1 && (
        <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Floor">
          {floors.map((entry) => (
            <button key={entry.key} type="button" aria-pressed={entry.key === floor.key} onClick={() => setFloorKey(entry.key)}
              className={cn('min-h-8 rounded-lg px-3 text-xs font-semibold', entry.key === floor.key ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:bg-white')}>
              {entry.label} <span className="font-normal text-slate-500">({entry.items.length})</span>
            </button>
          ))}
        </div>
      )}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={`${floor.label}, ${floor.items.length} room${floor.items.length === 1 ? '' : 's'}`}>
        {floor.items.map((room) => (
          <li key={room.id}>
            <button type="button" onClick={() => (onOpenRoom ? onOpenRoom(room) : setOpenItem(room))} data-ask-room-tile={room.id} data-room-detail-trigger={room.id}
              className="flex min-h-[5.5rem] w-full flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-teal-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600">
              <span className="text-sm font-semibold text-slate-950">{room.title}</span>
              {room.countLabel && <span className="text-xs text-slate-500">{room.countLabel}</span>}
              {room.badgeLabel && <span className="mt-auto self-start rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">{room.badgeLabel}</span>}
            </button>
          </li>
        ))}
      </ul>
      {!onOpenRoom && <ItemDetailSheet item={openItem} open={Boolean(openItem)} onOpenChange={(open) => { if (!open) setOpenItem(null); }} onItemAction={onItemAction} disabled={disabled} />}
    </div>
  );
}
