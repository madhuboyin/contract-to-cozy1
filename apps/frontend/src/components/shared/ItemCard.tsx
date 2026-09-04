'use client';

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, HelpCircle, Info, Shield, Upload } from 'lucide-react';

import type { InventoryItem } from '@/types';
import { CATEGORY_CONFIG } from '@/lib/config/categoryConfig';
import { getInventoryItemIcon, resolveIcon } from '@/lib/icons';
import { centsToDollars, formatCurrency } from '@/lib/utils/format';
import { normalizeDisplaySegments, titleCaseCategory } from '@/lib/utils/string';
import InlineValueEditor from '@/app/(dashboard)/dashboard/components/inventory/InlineValueEditor';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';

type ItemCardVariant = 'room' | 'inventory';

type ItemCardProps = {
  item: InventoryItem;
  variant?: ItemCardVariant;
  onClick?: (item: InventoryItem) => void;
  onGetCoverage?: (item: InventoryItem) => void;
  onReplaceRepair?: (item: InventoryItem) => void;
  onAddValue?: (itemId: string, value: number) => Promise<void>;
  onAttachDocument?: (itemId: string) => void;
};

type CoverageStatus = 'missing' | 'confirmed' | 'managed' | 'incomplete' | 'not-required';

function getCoverageStatus(item: InventoryItem): CoverageStatus {
  if (item.coverageState) {
    return {
      CONFIRMED: 'confirmed',
      MISSING: 'missing',
      MANAGED_ELSEWHERE: 'managed',
      INCOMPLETE: 'incomplete',
      NOT_REQUIRED: 'not-required',
    }[item.coverageState] as CoverageStatus;
  }
  if (item.coverageNotRequired) return 'not-required';

  const hasWarranty = Boolean(item.warrantyId);
  const hasInsurance = Boolean(item.insurancePolicyId);

  if (!hasWarranty && !hasInsurance) return 'incomplete';
  return 'confirmed';
}

function getCoveragePercent(item: InventoryItem): number {
  const status = getCoverageStatus(item);
  if (status === 'confirmed') return 100;
  return 0;
}

function getRoomLabel(item: InventoryItem): string {
  const rawRoom =
    typeof (item as any).room === 'string'
      ? (item as any).room
      : item.room?.name || (item as any).roomName || item.locationLabel
        || (item.recordGroup === 'SYSTEMS_STRUCTURE' ? 'Whole home' : 'Room needed');

  return normalizeDisplaySegments(rawRoom);
}

function getReplacementValue(item: InventoryItem): number | null {
  const direct = (item as any).replacementValue;
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;

  return centsToDollars(item.effectiveReplacementCostCents ?? item.replacementCostCents);
}

function getDocumentCount(item: InventoryItem): number {
  const direct = (item as any).documentCount;
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;

  return item.documents?.length ?? 0;
}

export default function ItemCard({
  item,
  variant = 'inventory',
  onClick,
  onGetCoverage,
  onReplaceRepair,
  onAddValue,
  onAttachDocument,
}: ItemCardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPathWithQuery = React.useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  const isCompact = variant === 'inventory';
  const coverageStatus = getCoverageStatus(item);
  const coveragePercent = getCoveragePercent(item);
  const hasAssessableCoverage = coverageStatus === 'confirmed' || coverageStatus === 'missing';
  const hasWarranty = Boolean(item.warrantyId);
  const hasInsurance = Boolean(item.insurancePolicyId);
  const replacementValue = getReplacementValue(item);
  const hasReplacementValue = Number(replacementValue || 0) > 0;
  const documentCount = getDocumentCount(item);

  const categoryKey = String(item.category || 'DEFAULT').toUpperCase();
  const categoryConfig = CATEGORY_CONFIG[categoryKey] ?? CATEGORY_CONFIG.DEFAULT;
  const ItemIcon = resolveIcon(
    getInventoryItemIcon({
      name: item.name,
      type: (item as any).type ?? (item as any).itemType,
      category: item.category,
      subtype: (item as any).subtype,
      kind: (item as any).kind,
      label: (item as any).label ?? (item as any).displayName,
      applianceType: (item as any).applianceType,
      sourceHash: item.sourceHash,
    }),
    categoryConfig.icon,
  );

  function handleOpenCoverage(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (onGetCoverage) {
      onGetCoverage(item);
      return;
    }

    router.push(
      `/dashboard/properties/${item.propertyId}/inventory/items/${item.id}/coverage?returnTo=${encodeURIComponent(currentPathWithQuery)}`
    );
  }

  function handleOpenReplaceRepair(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (onReplaceRepair) {
      onReplaceRepair(item);
      return;
    }

    router.push(buildGuidanceOverviewHref({
      propertyId: item.propertyId,
      inventoryItemId: item.id,
      assetName: item.name,
      issueType: 'past_life',
      backTo: currentPathWithQuery,
    }));
  }

  return (
    <div
      id={`item-${item.id}`}
      className={[
        'relative flex h-full cursor-pointer flex-col rounded-2xl border border-gray-200/80 bg-white shadow-sm',
        'transition-all duration-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lg',
      ].join(' ')}
      onClick={() => onClick?.(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.(item);
        }
      }}
    >
      <div className={`flex flex-1 flex-col gap-3.5 ${isCompact ? 'p-4' : 'p-5'}`}>
        <div className="flex items-start gap-2.5">
          <div
            className={[
              'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl',
              categoryConfig.iconBg,
            ].join(' ')}
          >
            <ItemIcon className={`h-5 w-5 ${categoryConfig.iconColor}`} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1.5">
              <p
                className={`line-clamp-2 min-w-0 flex-1 font-semibold leading-tight text-gray-900 ${isCompact ? 'text-sm' : 'text-base'}`}
                title={item.displayName || item.name || 'Untitled'}
              >
                {item.displayName || item.name || 'Untitled'}
              </p>

              {item.provenanceLabel ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={(event) => event.stopPropagation()}
                        className={`flex-shrink-0 ${item.provenanceLabel.startsWith('Confirmed') ? 'text-emerald-500 hover:text-emerald-600' : 'text-sky-400 hover:text-sky-600'}`}
                        aria-label={item.provenanceLabel}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{item.provenanceLabel}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </div>

            <p
              className="mt-0.5 truncate whitespace-nowrap text-[11px] text-gray-400"
              title={`${titleCaseCategory(String(item.category || 'OTHER'))} · ${getRoomLabel(item)}`}
            >
              {titleCaseCategory(String(item.category || 'OTHER'))} · {getRoomLabel(item)}
            </p>

            <div className="mt-2 flex items-center" title={item.coverageStateDetail || undefined}>
              {coverageStatus === 'missing' ? (
                <span className="whitespace-nowrap rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                  Coverage missing
                </span>
              ) : coverageStatus === 'incomplete' ? (
                <span className="whitespace-nowrap rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                  Coverage information incomplete
                </span>
              ) : coverageStatus === 'managed' ? (
                <span className="whitespace-nowrap rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                  {item.coverageStateLabel || 'Managed elsewhere'}
                </span>
              ) : coverageStatus === 'not-required' ? (
                <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                  Coverage not required
                </span>
              ) : (
                <span className="flex flex-shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle className="h-2.5 w-2.5" />
                  Coverage confirmed
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-gray-100 bg-gray-50/80">
          <div className="min-w-0 border-r border-gray-100 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Replacement</span>
            {hasReplacementValue ? (
              <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
                <span className="truncate text-base font-bold text-gray-900">{formatCurrency(replacementValue)}</span>
                {item.replacementValueSource === 'ESTIMATED' ? (
                  <span className="flex-shrink-0 text-[10px] font-medium text-gray-400">Est.</span>
                ) : null}
              </div>
            ) : (
              <div className="mt-1">
                <InlineValueEditor
                  itemId={item.id}
                  onSave={async (value) => {
                    if (onAddValue) {
                      await onAddValue(item.id, value);
                    }
                  }}
                />
              </div>
            )}
          </div>

          <div className="min-w-0 px-3 py-2.5">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
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
                    % of replacement value protected by warranty + insurance.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>

            <span
              className={`mt-0.5 block text-base font-bold ${
                hasReplacementValue && hasAssessableCoverage
                  ? coveragePercent === 100
                    ? 'text-emerald-600'
                    : coveragePercent >= 50
                      ? 'text-amber-500'
                      : 'text-red-500'
                  : 'text-gray-300'
              }`}
            >
              {hasReplacementValue && hasAssessableCoverage ? `${coveragePercent}%` : '—'}
            </span>

            {hasReplacementValue && hasAssessableCoverage ? (
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-200">
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
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-normal text-gray-400">Documents</span>
          {documentCount > 0 ? (
            <span className="text-xs font-semibold text-gray-700">{documentCount} attached</span>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAttachDocument?.(item.id);
              }}
              className="flex items-center gap-1 text-xs font-medium text-teal-600 underline-offset-2 transition-colors hover:text-teal-700 hover:underline"
            >
              <Upload className="h-3 w-3" />
              Attach receipt
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {coverageStatus === 'missing' ? (
            <>
              <button
                type="button"
                onClick={handleOpenCoverage}
                className={[
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal-600 text-xs font-semibold text-white transition-colors hover:bg-teal-700',
                  isCompact ? 'py-2' : 'py-2.5',
                ].join(' ')}
              >
                <Shield className="h-3.5 w-3.5" />
                Get coverage
              </button>

              <button
                type="button"
                onClick={handleOpenReplaceRepair}
                className={[
                  'whitespace-nowrap rounded-lg border border-gray-200 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300',
                  isCompact ? 'px-3 py-2' : 'px-4 py-2.5',
                ].join(' ')}
              >
                Replace/Repair
              </button>
            </>
          ) : coverageStatus === 'incomplete' ? (
            <button
              type="button"
              onClick={handleOpenCoverage}
              className={[
                'flex flex-1 items-center justify-center rounded-lg bg-sky-600 text-xs font-semibold text-white transition-colors hover:bg-sky-700',
                isCompact ? 'py-2' : 'py-2.5',
              ].join(' ')}
            >
              Complete details
            </button>
          ) : coverageStatus === 'managed' ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                router.push(`/dashboard/properties/${item.propertyId}/edit#responsibility`);
              }}
              className="flex flex-1 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100"
            >
              Review responsibility
            </button>
          ) : coverageStatus === 'not-required' ? (
            <>
              <span className="flex-1 text-xs font-medium text-slate-500">
                Coverage not required
              </span>

              <button
                type="button"
                onClick={handleOpenReplaceRepair}
                className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300"
              >
                <CheckCircle className="h-3 w-3 text-emerald-500" />
                Replace/Repair
              </button>
            </>
          ) : (
            <>
              <div className="flex flex-1 items-center gap-1.5">
                {hasWarranty ? (
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-700">
                    Warranty
                  </span>
                ) : null}
                {hasInsurance ? (
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
                    Insurance
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={handleOpenReplaceRepair}
                className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300"
              >
                <CheckCircle className="h-3 w-3 text-emerald-500" />
                Replace/Repair
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
