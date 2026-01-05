// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryItemCard.tsx
'use client';

import React from 'react';
import { InventoryItem } from '@/types';

function money(cents: number | null | undefined, currency = 'USD') {
  if (cents === null || cents === undefined) return null;
  const v = cents / 100;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(v);
}

export default function InventoryItemCard(props: { item: InventoryItem; onClick: () => void }) {
  const { item } = props;
  const docsCount = item.documents?.length ?? 0;

  return (
    <button
      onClick={props.onClick}
      className="text-left rounded-2xl border border-black/10 p-4 hover:bg-black/5 transition"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium">{item.name}</div>

        <div className="flex items-center gap-2">
          {(!item.warrantyId || !item.insurancePolicyId) && (
            <span className="text-xs rounded bg-red-100 text-red-700 px-2 py-0.5">
              Coverage gap
            </span>
          )}

          {docsCount > 0 && (
            <div className="text-xs opacity-70">📎 {docsCount}</div>
          )}
        </div>
      </div>

      <div className="mt-1 text-xs opacity-70">
        {item.category}
        {item.room?.name ? ` • ${item.room.name}` : ''}
      </div>

      <div className="mt-3 text-sm">
        {item.replacementCostCents ? (
          <>
            <div className="text-xs opacity-70">Replacement</div>
            <div className="font-medium">{money(item.replacementCostCents, item.currency)}</div>
          </>
        ) : (
          <div className="text-xs opacity-60">No replacement value yet</div>
        )}
      </div>

      <div className="mt-3 flex gap-2 flex-wrap">
        {item.warrantyId && <span className="text-xs px-2 py-1 rounded-full border border-black/10">Warranty</span>}
        {item.insurancePolicyId && <span className="text-xs px-2 py-1 rounded-full border border-black/10">Insurance</span>}
      </div>
    </button>
  );
}
