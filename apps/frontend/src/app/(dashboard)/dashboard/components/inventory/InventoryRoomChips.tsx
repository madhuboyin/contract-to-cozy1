// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryRoomChips.tsx
'use client';

import React from 'react';
import { InventoryRoom } from '@/types';

export default function InventoryRoomChips(props: {
  rooms: InventoryRoom[];
  selectedRoomId?: string;
  onSelect: (roomId: string | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-black/10 bg-white/85 p-3 backdrop-blur-sm">
      <button
        onClick={() => props.onSelect(undefined)}
        className={`px-3.5 py-2 rounded-full text-sm border transition-colors min-h-[40px] ${
          !props.selectedRoomId
            ? 'bg-teal-700 text-white border-teal-700 shadow-sm'
            : 'bg-white border-black/15 hover:bg-teal-50 hover:border-teal-200'
        }`}
      >
        All
      </button>

      {props.rooms.map((r) => (
        <button
          key={r.id}
          onClick={() => props.onSelect(r.id)}
          className={`px-3.5 py-2 rounded-full text-sm border transition-colors min-h-[40px] ${
            props.selectedRoomId === r.id
              ? 'bg-teal-700 text-white border-teal-700 shadow-sm'
              : 'bg-white border-black/15 hover:bg-teal-50 hover:border-teal-200'
          }`}
        >
          {r.name}
        </button>
      ))}
    </div>
  );
}
