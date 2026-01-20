// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryItemCard.tsx
'use client';

import React from 'react';
import { InventoryItem } from '@/types';

function money(cents: number | null | undefined, currency = 'USD') {
  if (cents === null || cents === undefined) return null;
  const v = cents / 100;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(v);
}

function getHasRecallAlerts(item: InventoryItem): boolean {
  const anyItem = item as any;

  // Preferred: explicit boolean from backend DTO
  if (typeof anyItem.hasRecallAlerts === 'boolean') return anyItem.hasRecallAlerts;

  // Alternative: count on DTO
  if (typeof anyItem.recallAlertsCount === 'number') return anyItem.recallAlertsCount > 0;

  // Fallback: matches array on DTO
  const matches = Array.isArray(anyItem.recallMatches) ? anyItem.recallMatches : [];
  return matches.some((m: any) => {
    const s = String(m?.status || '').toUpperCase();
    return s === 'OPEN' || s === 'NEEDS_CONFIRMATION';
  });
}

export default function InventoryItemCard(props: { item: InventoryItem; onClick: () => void }) {
  const { item } = props;
  const docsCount = item.documents?.length ?? 0;

  const hasRecallAlerts = getHasRecallAlerts(item);

  return (
    <button
      id={`item-${item.id}`}
      onClick={props.onClick}
      className="text-left rounded-2xl border border-black/10 p-4 hover:bg-black/5 transition"
    >

      <div className="flex items-start justify-between gap-2">
        <div className="font-medium">{item.name}</div>

        <div className="flex items-center gap-2">
          {hasRecallAlerts && (
            <span className="text-xs rounded bg-amber-100 text-amber-800 px-2 py-0.5">
              ⚠️ Recall
            </span>
          )}

          {(!item.warrantyId || !item.insurancePolicyId) && (
            <span className="text-xs rounded bg-red-100 text-red-700 px-2 py-0.5">
              Coverage gap
            </span>
          )}

          {docsCount > 0 && <div className="text-xs opacity-70">📎 {docsCount}</div>}
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
        {item.warrantyId && (
          <span className="text-xs px-2 py-1 rounded-full border border-black/10">Warranty</span>
        )}
        {item.insurancePolicyId && (
          <span className="text-xs px-2 py-1 rounded-full border border-black/10">Insurance</span>
        )}
      </div>
    </button>
  );
}
