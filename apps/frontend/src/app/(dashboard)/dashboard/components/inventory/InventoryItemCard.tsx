// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryItemCard.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { InventoryItem } from '@/types';

function money(cents: number | null | undefined, currency = 'USD') {
  if (cents === null || cents === undefined) return null;
  const v = cents / 100;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(v);
}

function getHasRecallAlerts(item: InventoryItem): boolean {
  const anyItem = item as any;

  if (typeof anyItem.hasRecallAlerts === 'boolean') return anyItem.hasRecallAlerts;
  if (typeof anyItem.recallAlertsCount === 'number') return anyItem.recallAlertsCount > 0;

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
  const hasCoverageGap = !item.warrantyId || !item.insurancePolicyId;

  const replacement = item.replacementCostCents
    ? money(item.replacementCostCents, item.currency)
    : null;

  return (
    <div
      id={`item-${item.id}`}
      className={[
        "rounded-2xl border border-black/10 bg-white shadow-sm hover:shadow-md transition",
        "h-[192px] w-full",
        "flex flex-col",
      ].join(' ')}
    >
      <button
        onClick={props.onClick}
        className="flex-1 text-left p-4 rounded-t-2xl hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
      >
        {/* TOP: title + badges (reserved height) */}
        <div className="min-h-[64px]">
          <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="min-w-0 font-medium leading-snug line-clamp-2 pr-1">
              {item.name || 'Untitled'}
            </div>

            <div className="flex items-center justify-end gap-2 max-w-[160px] overflow-hidden">
              {hasRecallAlerts && (
                <span className="shrink-0 text-xs rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 whitespace-nowrap">
                  ⚠️ Recall
                </span>
              )}

              {hasCoverageGap && (
                <span className="shrink-0 text-xs rounded-full bg-red-100 text-red-700 px-2 py-0.5 whitespace-nowrap">
                  Coverage gap
                </span>
              )}

              {docsCount > 0 && (
                <div className="shrink-0 text-xs opacity-70 whitespace-nowrap">
                  📎 {docsCount}
                </div>
              )}
            </div>
          </div>

          <div className="mt-1 text-xs text-gray-500 min-h-[16px] truncate">
            {item.category}
            {item.room?.name ? ` • ${item.room.name}` : ''}
          </div>
        </div>

        {/* MIDDLE: replacement */}
        <div className="mt-3 min-h-[44px] leading-tight">
          <div className="text-xs text-gray-500">Replacement</div>
          {replacement ? (
            <div className="font-medium tabular-nums">{replacement}</div>
          ) : (
            <div className="text-xs text-gray-400">No value yet</div>
          )}
        </div>
      </button>

      {/* BOTTOM: chips + action */}
      <div className="px-4 pb-3 pt-2 border-t border-black/5 flex items-center justify-between gap-2">
        <div className="min-h-[28px] flex items-center gap-2 flex-wrap">
          {item.warrantyId && (
            <span className="text-xs px-2 py-1 rounded-full border border-black/10">
              Warranty
            </span>
          )}
          {item.insurancePolicyId && (
            <span className="text-xs px-2 py-1 rounded-full border border-black/10">
              Insurance
            </span>
          )}
        </div>

        {hasCoverageGap && (
          <Link
            href={`/dashboard/properties/${item.propertyId}/inventory/items/${item.id}/coverage`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium bg-teal-600 text-white hover:bg-teal-700"
          >
            Coverage worth-it
          </Link>
        )}
      </div>
    </div>
  );
}
