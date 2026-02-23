'use client';

import React from 'react';
import Link from 'next/link';
import {
  Armchair,
  Building2,
  CheckCircle,
  Droplets,
  HelpCircle,
  Monitor,
  Package,
  Shield,
  Sparkles,
  Trees,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import type { InventoryItem } from '@/types';
import InlineValueEditor from './InlineValueEditor';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { centsToDollars, formatCurrency } from '@/lib/utils/format';

type CoverageStatus = 'gap' | 'partial' | 'covered';

const CATEGORY_CONFIG: Record<
  string,
  {
    icon: LucideIcon;
    iconBg: string;
    iconColor: string;
  }
> = {
  FURNITURE: { icon: Armchair, iconBg: 'bg-violet-50', iconColor: 'text-violet-500' },
  APPLIANCE: { icon: Zap, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
  ELECTRONICS: { icon: Monitor, iconBg: 'bg-blue-50', iconColor: 'text-blue-500' },
  HVAC: { icon: Wind, iconBg: 'bg-teal-50', iconColor: 'text-teal-500' },
  PLUMBING: { icon: Droplets, iconBg: 'bg-cyan-50', iconColor: 'text-cyan-500' },
  STRUCTURAL: { icon: Building2, iconBg: 'bg-slate-50', iconColor: 'text-slate-500' },
  ROOF_EXTERIOR: { icon: Building2, iconBg: 'bg-slate-50', iconColor: 'text-slate-500' },
  SAFETY: { icon: Shield, iconBg: 'bg-red-50', iconColor: 'text-red-500' },
  OUTDOOR: { icon: Trees, iconBg: 'bg-green-50', iconColor: 'text-green-500' },
  DEFAULT: { icon: Package, iconBg: 'bg-gray-100', iconColor: 'text-gray-400' },
};

const COVERAGE_STYLE: Record<
  CoverageStatus,
  {
    border: string;
    badge?: string;
    label?: string;
  }
> = {
  gap: {
    border: 'border-l-4 border-l-red-400',
    badge: 'border-red-200 bg-red-100 text-red-700',
    label: 'Coverage gap',
  },
  partial: {
    border: 'border-l-4 border-l-amber-400',
    badge: 'border-amber-200 bg-amber-100 text-amber-700',
    label: 'Partial coverage',
  },
  covered: {
    border: 'border-l-4 border-l-emerald-400',
  },
};

function titleCase(value?: string | null): string {
  if (!value) return 'Other';
  return value
    .toLowerCase()
    .split('_')
    .map((chunk) => `${chunk.slice(0, 1).toUpperCase()}${chunk.slice(1)}`)
    .join(' ');
}

function getCoverageStatus(item: InventoryItem): CoverageStatus {
  const hasWarranty = Boolean(item.warrantyId);
  const hasInsurance = Boolean(item.insurancePolicyId);

  if (!hasWarranty && !hasInsurance) return 'gap';
  if (!hasWarranty || !hasInsurance) return 'partial';
  return 'covered';
}

function getCoveragePercent(item: InventoryItem): number {
  const hasWarranty = Boolean(item.warrantyId);
  const hasInsurance = Boolean(item.insurancePolicyId);
  if (hasWarranty && hasInsurance) return 100;
  if (hasWarranty || hasInsurance) return 65;
  return 0;
}

function hasRecallAlert(item: InventoryItem): boolean {
  const anyItem = item as any;
  if (typeof anyItem.hasRecallAlerts === 'boolean') return anyItem.hasRecallAlerts;

  const matches = Array.isArray(anyItem.recallMatches) ? anyItem.recallMatches : [];
  return matches.some((match: any) => {
    const status = String(match?.status || '').toUpperCase();
    return status === 'OPEN' || status === 'NEEDS_CONFIRMATION';
  });
}

export default function InventoryItemCard(props: {
  item: InventoryItem;
  onClick: () => void;
  onValueSave: (itemId: string, value: number) => Promise<void>;
}) {
  const { item } = props;
  const coverageStatus = getCoverageStatus(item);
  const coverageStyle = COVERAGE_STYLE[coverageStatus];
  const coveragePercent = getCoveragePercent(item);
  const hasWarranty = Boolean(item.warrantyId);
  const hasInsurance = Boolean(item.insurancePolicyId);
  const docsCount = item.documents?.length ?? 0;
  const recall = hasRecallAlert(item);

  const replacementValue = centsToDollars(item.replacementCostCents);
  const hasReplacementValue = Number(replacementValue || 0) > 0;

  const categoryKey = String(item.category || 'DEFAULT').toUpperCase();
  const categoryConfig = CATEGORY_CONFIG[categoryKey] || CATEGORY_CONFIG.DEFAULT;
  const CategoryIcon = categoryConfig.icon;

  return (
    <div
      id={`item-${item.id}`}
      className={[
        'relative flex h-full min-h-[292px] cursor-pointer flex-col rounded-xl border border-gray-200 bg-white transition-all duration-150',
        coverageStyle.border,
        'hover:-translate-y-0.5 hover:shadow-md',
      ].join(' ')}
      onClick={props.onClick}
    >
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className={`flex-shrink-0 rounded-lg p-1.5 ${categoryConfig.iconBg}`}>
              <CategoryIcon className={`h-4 w-4 ${categoryConfig.iconColor}`} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-gray-900">{item.name || 'Untitled'}</p>
              <p className="mt-0.5 text-[10px] text-gray-400">
                {titleCase(item.category)} · {item.room?.name || 'Unassigned'}
              </p>
            </div>
          </div>

          {coverageStyle.badge ? (
            <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${coverageStyle.badge}`}>
              {coverageStyle.label}
            </span>
          ) : (
            <span className="flex flex-shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              <CheckCircle className="h-2.5 w-2.5" />
              Covered
            </span>
          )}
        </div>

        {(recall || docsCount > 0) && (
          <div className="flex min-h-[18px] items-center gap-2">
            {recall ? (
              <span className="rounded-full border border-orange-200 bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                Recall
              </span>
            ) : null}
            {docsCount > 0 ? (
              <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                {docsCount} doc{docsCount === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
        )}

        <div className="flex min-h-[26px] items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Replacement</span>
          {hasReplacementValue ? (
            <span className="text-sm font-bold text-gray-800">{formatCurrency(replacementValue)}</span>
          ) : (
            <InlineValueEditor
              itemId={item.id}
              onSave={(value) => props.onValueSave(item.id, value)}
            />
          )}
        </div>

        <div>
          <div className="mb-1 flex min-h-[16px] items-center justify-between text-[10px]">
            <span className="flex items-center gap-1 text-gray-400">
              Covered
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(event) => event.stopPropagation()}
                      className="text-gray-300 transition-colors hover:text-gray-500"
                      aria-label="Coverage percentage info"
                    >
                      <HelpCircle className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Percentage of replacement value protected by warranty plus insurance.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>

            {hasReplacementValue ? (
              <span
                className={`font-semibold ${
                  coveragePercent === 100
                    ? 'text-emerald-600'
                    : coveragePercent >= 50
                      ? 'text-amber-500'
                      : 'text-red-500'
                }`}
              >
                {coveragePercent}%
              </span>
            ) : (
              <span className="text-gray-300">—</span>
            )}
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            {hasReplacementValue ? (
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  coveragePercent === 100
                    ? 'bg-emerald-500'
                    : coveragePercent >= 50
                      ? 'bg-amber-400'
                      : 'bg-red-400'
                }`}
                style={{ width: `${coveragePercent}%` }}
              />
            ) : null}
          </div>
        </div>

        <div className="mt-auto flex items-center gap-2 pt-1">
          {coverageStatus === 'gap' || coverageStatus === 'partial' ? (
            <>
              <Link
                href={`/dashboard/properties/${item.propertyId}/inventory/items/${item.id}/coverage`}
                onClick={(event) => event.stopPropagation()}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-700"
              >
                <Shield className="h-3.5 w-3.5" />
                Get coverage
              </Link>

              <Link
                href={`/dashboard/properties/${item.propertyId}/inventory/items/${item.id}/replace-repair`}
                onClick={(event) => event.stopPropagation()}
                className="whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300"
              >
                Replace/Repair
              </Link>
            </>
          ) : (
            <>
              <div className="flex flex-1 items-center gap-1.5">
                {hasWarranty ? (
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-700">
                    Warranty
                  </span>
                ) : null}
                {hasInsurance ? (
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700">
                    Insurance
                  </span>
                ) : null}
              </div>

              <Link
                href={`/dashboard/properties/${item.propertyId}/inventory/items/${item.id}/replace-repair`}
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300"
              >
                <CheckCircle className="h-3 w-3 text-emerald-500" />
                Replace/Repair
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
