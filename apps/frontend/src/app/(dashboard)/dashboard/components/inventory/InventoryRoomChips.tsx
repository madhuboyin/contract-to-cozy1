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
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => props.onSelect(undefined)}
        className={`px-3 py-1.5 rounded-full text-sm border ${
          !props.selectedRoomId ? 'bg-black text-white border-black' : 'border-black/10 hover:bg-black/5'
        }`}
      >
        All
      </button>

      {props.rooms.map((r) => (
        <button
          key={r.id}
          onClick={() => props.onSelect(r.id)}
          className={`px-3 py-1.5 rounded-full text-sm border ${
            props.selectedRoomId === r.id ? 'bg-black text-white border-black' : 'border-black/10 hover:bg-black/5'
          }`}
        >
          {r.name}
        </button>
      ))}
    </div>
  );
}
