// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryFilters.tsx
'use client';

import React from 'react';
import { InventoryItemCategory } from '@/types';

const CATEGORIES: { value: InventoryItemCategory; label: string }[] = [
  { value: 'APPLIANCE', label: 'Appliance' },
  { value: 'HVAC', label: 'HVAC' },
  { value: 'PLUMBING', label: 'Plumbing' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'ROOF_EXTERIOR', label: 'Roof/Exterior' },
  { value: 'SAFETY', label: 'Safety' },
  { value: 'SMART_HOME', label: 'Smart Home' },
  { value: 'FURNITURE', label: 'Furniture' },
  { value: 'ELECTRONICS', label: 'Electronics' },
  { value: 'OTHER', label: 'Other' },
];

export default function InventoryFilters(props: {
  q: string;
  onQChange: (v: string) => void;

  roomId?: string;
  onRoomChange: (v: string) => void;

  category?: InventoryItemCategory;
  onCategoryChange: (v: InventoryItemCategory | undefined) => void;

  hasDocuments?: boolean;
  onHasDocumentsChange: (v: boolean | undefined) => void;

  // ✅ NEW
  hasRecallAlerts?: boolean;
  onHasRecallAlertsChange: (v: boolean | undefined) => void;

  rooms: { id: string; name: string }[];
}) {
  return (
    <div className="rounded-2xl border border-black/10 p-4 flex flex-col gap-3 lg:flex-row">
      <input
        value={props.q}
        onChange={(e) => props.onQChange(e.target.value)}
        placeholder="Search (name, brand, model, serial)…"
        className="w-full lg:flex-1 rounded-xl border border-black/10 px-3 py-2 text-sm min-h-[44px]"
      />

      <select
        value={props.roomId ?? 'ALL'}
        onChange={(e) => props.onRoomChange(e.target.value)}
        className="w-full lg:w-auto rounded-xl border border-black/10 px-3 py-2 text-sm min-h-[44px]"
      >
        {props.rooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>

      <select
        value={props.category ?? ''}
        onChange={(e) => props.onCategoryChange((e.target.value as InventoryItemCategory) || undefined)}
        className="w-full lg:w-auto rounded-xl border border-black/10 px-3 py-2 text-sm min-h-[44px]"
      >
        <option value="">All categories</option>
        {CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>

      <select
        value={props.hasDocuments === undefined ? '' : props.hasDocuments ? 'true' : 'false'}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') props.onHasDocumentsChange(undefined);
          else props.onHasDocumentsChange(v === 'true');
        }}
        className="w-full lg:w-auto rounded-xl border border-black/10 px-3 py-2 text-sm min-h-[44px]"
      >
        <option value="">Docs: Any</option>
        <option value="true">Has docs</option>
        <option value="false">No docs</option>
      </select>

      {/* ✅ NEW */}
      <select
        value={props.hasRecallAlerts === undefined ? '' : props.hasRecallAlerts ? 'true' : 'false'}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') props.onHasRecallAlertsChange(undefined);
          else props.onHasRecallAlertsChange(v === 'true');
        }}
        className="w-full lg:w-auto rounded-xl border border-black/10 px-3 py-2 text-sm min-h-[44px]"
      >
        <option value="">Recalls: Any</option>
        <option value="true">Has recall alerts</option>
        <option value="false">No recall alerts</option>
      </select>
    </div>
  );
}
