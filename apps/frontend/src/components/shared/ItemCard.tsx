'use client';

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, HelpCircle, Shield, Upload } from 'lucide-react';

import type { InventoryItem } from '@/types';
import { CATEGORY_CONFIG } from '@/lib/config/categoryConfig';
import { centsToDollars, formatCurrency } from '@/lib/utils/format';
import { normalizeDisplaySegments, titleCaseCategory } from '@/lib/utils/string';
import InlineValueEditor from '@/app/(dashboard)/dashboard/components/inventory/InlineValueEditor';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

type CoverageStatus = 'gap' | 'partial' | 'covered';

function getCoverageStatus(item: InventoryItem): CoverageStatus {
  const hasWarranty = Boolean(item.warrantyId);
  const hasInsurance = Boolean(item.insurancePolicyId);

  if (!hasWarranty && !hasInsurance) return 'gap';
  if (!hasWarranty || !hasInsurance) return 'partial';
  return 'covered';
}

function getCoveragePercent(item: InventoryItem): number {
  const status = getCoverageStatus(item);
  if (status === 'covered') return 100;
  if (status === 'partial') return 65;
  return 0;
}

function getRoomLabel(item: InventoryItem): string {
  const rawRoom =
    typeof (item as any).room === 'string'
      ? (item as any).room
      : item.room?.name || (item as any).roomName || 'Unassigned';

  return normalizeDisplaySegments(rawRoom);
}

function getReplacementValue(item: InventoryItem): number | null {
  const direct = (item as any).replacementValue;
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;

  return centsToDollars(item.replacementCostCents);
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
  const hasWarranty = Boolean(item.warrantyId);
  const hasInsurance = Boolean(item.insurancePolicyId);
  const replacementValue = getReplacementValue(item);
  const hasReplacementValue = Number(replacementValue || 0) > 0;
  const documentCount = getDocumentCount(item);

  const categoryKey = String(item.category || 'DEFAULT').toUpperCase();
  const categoryConfig = CATEGORY_CONFIG[categoryKey] ?? CATEGORY_CONFIG.DEFAULT;
  const CategoryIcon = categoryConfig.icon;

  const coverageStyle = {
    gap: 'border-l-4 border-l-red-400',
    partial: 'border-l-4 border-l-amber-400',
    covered: 'border-l-4 border-l-emerald-400',
  }[coverageStatus];

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

    router.push(`/dashboard/properties/${item.propertyId}/inventory/items/${item.id}/replace-repair`);
  }

  return (
    <div
      id={`item-${item.id}`}
      className={[
        'relative flex h-full cursor-pointer flex-col rounded-xl border border-gray-200 bg-white',
        'transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md',
        coverageStyle,
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
      <div className={`flex flex-1 flex-col gap-3 ${isCompact ? 'p-4' : 'p-5'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className={[
                'flex-shrink-0 rounded-lg',
                isCompact ? 'p-1.5' : 'p-2',
                categoryConfig.iconBg,
              ].join(' ')}
            >
              <CategoryIcon className={`${isCompact ? 'h-4 w-4' : 'h-5 w-5'} ${categoryConfig.iconColor}`} />
            </div>

            <div className="min-w-0">
              <p className={`truncate font-semibold leading-tight text-gray-900 ${isCompact ? 'text-sm' : 'text-base'}`}>
                {item.name || 'Untitled'}
              </p>
              <p className="mt-0.5 text-[10px] text-gray-400">
                {titleCaseCategory(String(item.category || 'OTHER'))} · {getRoomLabel(item)}
              </p>
            </div>
          </div>

          {coverageStatus === 'gap' ? (
            <span className="whitespace-nowrap rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
              Coverage gap
            </span>
          ) : coverageStatus === 'partial' ? (
            <span className="whitespace-nowrap rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Partial coverage
            </span>
          ) : (
            <span className="flex flex-shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              <CheckCircle className="h-2.5 w-2.5" />
              Covered
            </span>
          )}
        </div>

        <div className="flex min-h-[26px] items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Replacement</span>
          {hasReplacementValue ? (
            <span className="text-sm font-bold text-gray-800">{formatCurrency(replacementValue)}</span>
          ) : (
            <InlineValueEditor
              itemId={item.id}
              onSave={async (value) => {
                if (onAddValue) {
                  await onAddValue(item.id, value);
                }
              }}
            />
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[10px]">
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
                    % of replacement value protected by warranty + insurance.
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

        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Documents</span>
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

        <div className={`flex items-center gap-2 pt-1 ${isCompact ? '' : 'mt-1'}`}>
          {coverageStatus !== 'covered' ? (
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
