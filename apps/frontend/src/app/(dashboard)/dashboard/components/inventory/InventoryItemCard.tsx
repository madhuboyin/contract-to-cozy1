// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryItemCard.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, Droplet, Home, Package, Shield, Sparkles, Wind, Wrench, Zap } from 'lucide-react';
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

const CATEGORY_META: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    iconTone: string;
  }
> = {
  APPLIANCE: { icon: Wrench, iconTone: 'bg-cyan-100 text-cyan-700' },
  HVAC: { icon: Wind, iconTone: 'bg-blue-100 text-blue-700' },
  PLUMBING: { icon: Droplet, iconTone: 'bg-sky-100 text-sky-700' },
  ELECTRICAL: { icon: Zap, iconTone: 'bg-amber-100 text-amber-700' },
  ROOF_EXTERIOR: { icon: Home, iconTone: 'bg-emerald-100 text-emerald-700' },
  SAFETY: { icon: Shield, iconTone: 'bg-rose-100 text-rose-700' },
  SMART_HOME: { icon: Zap, iconTone: 'bg-violet-100 text-violet-700' },
  FURNITURE: { icon: Home, iconTone: 'bg-indigo-100 text-indigo-700' },
  ELECTRONICS: { icon: Package, iconTone: 'bg-fuchsia-100 text-fuchsia-700' },
  OTHER: { icon: Package, iconTone: 'bg-slate-100 text-slate-700' },
};

function formatCategory(category?: string) {
  if (!category) return 'OTHER';
  return category.replace(/_/g, ' / ');
}

export default function InventoryItemCard(props: { item: InventoryItem; onClick: () => void }) {
  const { item } = props;

  const docsCount = item.documents?.length ?? 0;
  const hasRecallAlerts = getHasRecallAlerts(item);
  const hasCoverageGap = !item.warrantyId || !item.insurancePolicyId;
  const hasWarranty = !!item.warrantyId;
  const hasInsurance = !!item.insurancePolicyId;

  const replacement = item.replacementCostCents
    ? money(item.replacementCostCents, item.currency)
    : null;
  const coveragePercent = hasWarranty && hasInsurance ? 100 : hasWarranty || hasInsurance ? 65 : 20;
  const categoryMeta = CATEGORY_META[item.category || 'OTHER'] || CATEGORY_META.OTHER;
  const CategoryIcon = categoryMeta.icon;
  const categoryLabel = formatCategory(item.category || 'OTHER');

  return (
    <div
      id={`item-${item.id}`}
      className={[
        'group relative overflow-hidden rounded-2xl border border-white/70',
        'bg-gradient-to-br from-[#fff5eb]/82 via-[#fffdf8]/90 to-[#eef8f3]/70',
        'backdrop-blur-sm shadow-[0_12px_26px_-20px_rgba(15,23,42,0.6)]',
        'transition-all duration-200 motion-safe:hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-[0_22px_38px_-20px_rgba(15,23,42,0.55)]',
        'h-[220px] w-full',
        "flex flex-col",
      ].join(' ')}
    >
      <button
        onClick={props.onClick}
        aria-label={`Open item ${item.name || 'Untitled'}`}
        className="flex-1 text-left p-4 rounded-t-2xl hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
      >
        {/* TOP: icon + title + badges */}
        <div className="min-h-[78px]">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${categoryMeta.iconTone}`}
              title={`${categoryLabel} category`}
            >
              <CategoryIcon className="h-5 w-5" aria-hidden="true" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="min-w-0 text-[1.1rem] font-semibold leading-snug line-clamp-2 pr-1 text-slate-900">
                  {item.name || 'Untitled'}
                </div>

                <div className="flex items-center justify-end gap-2 max-w-[190px] overflow-hidden">
                  {hasRecallAlerts && (
                    <span className="shrink-0 text-[11px] rounded-full bg-gradient-to-r from-amber-50 to-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 whitespace-nowrap">
                      Recall
                    </span>
                  )}

                  {hasCoverageGap && (
                    <span className="shrink-0 text-[11px] rounded-full bg-gradient-to-r from-orange-50 to-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 whitespace-nowrap">
                      Coverage gap
                    </span>
                  )}

                  {docsCount > 0 && (
                    <div className="shrink-0 text-[11px] text-slate-600 rounded-full border border-slate-200 px-2 py-0.5 whitespace-nowrap bg-white/80">
                      Docs {docsCount}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-1 text-xs text-slate-600 min-h-[16px] truncate">
                {categoryLabel}
                {item.room?.name ? ` • ${item.room.name}` : ''}
              </div>
            </div>
          </div>
        </div>

        {/* MIDDLE: replacement */}
        <div className="mt-3 min-h-[62px] leading-tight">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Replacement</div>
          {replacement ? (
            <div className="text-[1.45rem] font-semibold tabular-nums text-slate-900 sm:text-[1.5rem]">{replacement}</div>
          ) : (
            <div className="text-sm text-slate-500">No value yet</div>
          )}
          {replacement && (
            <div className="mt-2 max-w-[160px]">
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
                <span>Covered</span>
                <span>{coveragePercent}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/80">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-300"
                  style={{ width: `${coveragePercent}%` }}
                  role="progressbar"
                  aria-label={`Coverage level ${coveragePercent}%`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={coveragePercent}
                />
              </div>
            </div>
          )}
        </div>
      </button>

      {/* BOTTOM: chips + action */}
      <div className="px-4 pb-3 pt-2 border-t border-slate-200/70 bg-white/55 flex items-center justify-between gap-2">
        <div className="min-h-[28px] flex items-center gap-2 flex-wrap">
          {item.warrantyId && (
            <span className="text-xs px-2 py-1 rounded-full border border-violet-200 bg-violet-50 text-violet-700">
              Warranty
            </span>
          )}
          {item.insurancePolicyId && (
            <span className="text-xs px-2 py-1 rounded-full border border-cyan-200 bg-cyan-50 text-cyan-700">
              Insurance
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasCoverageGap && (
            <Link
              href={`/dashboard/properties/${item.propertyId}/inventory/items/${item.id}/coverage`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center justify-center gap-1 rounded-full px-3.5 py-2 text-xs font-medium min-h-[36px] bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 hover:shadow-[0_10px_20px_-12px_rgba(5,150,105,0.8)] active:scale-[0.98] whitespace-nowrap transition-all duration-150"
            >
              <Sparkles className="h-3.5 w-3.5 motion-safe:group-hover:animate-pulse" />
              Coverage worth-it
            </Link>
          )}

          <Link
            href={`/dashboard/properties/${item.propertyId}/inventory/items/${item.id}/replace-repair`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center gap-1 rounded-full px-3.5 py-2 text-sm font-medium min-h-[36px] border border-slate-300 bg-white/85 hover:bg-white whitespace-nowrap transition-colors duration-150"
          >
            {!hasCoverageGap && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
            Replace/Repair
          </Link>
        </div>
      </div>
    </div>
  );
}
