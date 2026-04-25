'use client';

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  Grid,
  History,
  Plus,
  Search,
  Shield,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';

import type { InventoryItem, InventoryItemCategory, InventoryRoom } from '@/types';
import { CATEGORY_CONFIG } from '@/lib/config/categoryConfig';
import { INVENTORY_CATEGORY_FILTER_OPTIONS } from '@/lib/config/inventoryConfig';
import { getInventoryItemIcon, resolveIcon } from '@/lib/icons';
import { centsToDollars, formatCurrency } from '@/lib/utils/format';
import { normalizeDisplaySegments, titleCaseCategory } from '@/lib/utils/string';
import InlineValueEditor from './InlineValueEditor';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  IconBadge,
  MetricRow,
  MobileCard,
  StatusChip,
  SummaryCard,
} from '@/components/mobile/dashboard/MobilePrimitives';
import type { SmartFilterId } from './InventoryFilterBar';
import type { InventoryPortfolioFilter, PortfolioStats } from './PortfolioIntelligenceStrip';

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

function filterCardClass(active: boolean): string {
  return active
    ? 'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] text-[hsl(var(--mobile-brand-strong))]'
    : 'border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-primary))]';
}

function FilterDropdown(props: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
}) {
  return (
    <div className="relative">
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        aria-label={props.ariaLabel}
        className="h-11 w-full appearance-none rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 pr-8 text-sm font-medium text-[hsl(var(--mobile-text-primary))] outline-none transition-colors focus:border-[hsl(var(--mobile-brand-border))]"
      >
        {props.options.map((option) => (
          <option key={`${props.ariaLabel}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--mobile-text-muted))]" />
    </div>
  );
}

export function InventoryHeroCard({
  activeTab,
  onTabChange,
  onManageRooms,
  onExportCsv,
  onBulkUpload,
  onImportHistory,
  onAddItem,
}: {
  activeTab: 'items' | 'coverage';
  onTabChange: (tab: 'items' | 'coverage') => void;
  onManageRooms: () => void;
  onExportCsv: () => void;
  onBulkUpload: () => void;
  onImportHistory: () => void;
  onAddItem: () => void;
}) {
  return (
    <SummaryCard
      title="Home Inventory"
      subtitle="Track appliances, systems, and valuables with receipts, values, and coverage."
      action={
        <IconBadge tone="brand">
          <Sparkles className="h-4 w-4" />
        </IconBadge>
      }
    >
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={onAddItem}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          Add item
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
            >
              More
              <ChevronDown className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onManageRooms}>
              <Grid className="mr-2 h-3.5 w-3.5" />
              Manage rooms
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExportCsv}>
              <Download className="mr-2 h-3.5 w-3.5" />
              Export CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onBulkUpload}>
              <Upload className="mr-2 h-3.5 w-3.5" />
              Bulk upload
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onImportHistory}>
              <History className="mr-2 h-3.5 w-3.5" />
              Import history
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onTabChange('items')}
          className={[
            'min-h-[40px] rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
            filterCardClass(activeTab === 'items'),
          ].join(' ')}
        >
          Items
        </button>
        <button
          type="button"
          onClick={() => onTabChange('coverage')}
          className={[
            'min-h-[40px] rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
            filterCardClass(activeTab === 'coverage'),
          ].join(' ')}
        >
          Coverage
        </button>
      </div>
    </SummaryCard>
  );
}

export function CoverageSnapshotCard({
  stats,
  activeFilter,
  onToggleFilter,
}: {
  stats: PortfolioStats;
  activeFilter: InventoryPortfolioFilter;
  onToggleFilter: (filter: Exclude<InventoryPortfolioFilter, null>) => void;
}) {
  const roundedCoverage = Math.round(stats.coverageRate);
  const rateTone: 'good' | 'elevated' | 'needsAction' =
    roundedCoverage >= 80 ? 'good' : roundedCoverage >= 50 ? 'elevated' : 'needsAction';

  return (
    <SummaryCard title="Coverage Snapshot" subtitle={`${stats.totalItems} items tracked`}>
      <MetricRow label="Portfolio Value" value={formatCurrency(stats.totalValue)} />
      <MetricRow
        label="Coverage Rate"
        value={`${roundedCoverage}%`}
        trend={<StatusChip tone={rateTone}>{roundedCoverage >= 80 ? 'Healthy' : roundedCoverage >= 50 ? 'Watch' : 'Cost now'}</StatusChip>}
      />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onToggleFilter('gaps')}
          className={[
            'rounded-xl border px-3 py-2 text-left transition-colors',
            activeFilter === 'gaps'
              ? 'border-rose-300 bg-rose-50'
              : 'border-[hsl(var(--mobile-border-subtle))] bg-white',
          ].join(' ')}
        >
          <p className="mb-0 text-xs text-[hsl(var(--mobile-text-secondary))]">Coverage Gaps</p>
          <p className="mb-0 mt-1 text-lg font-semibold text-rose-600">{stats.gapCount}</p>
        </button>
        <button
          type="button"
          onClick={() => onToggleFilter('no-value')}
          className={[
            'rounded-xl border px-3 py-2 text-left transition-colors',
            activeFilter === 'no-value'
              ? 'border-amber-300 bg-amber-50'
              : 'border-[hsl(var(--mobile-border-subtle))] bg-white',
          ].join(' ')}
        >
          <p className="mb-0 text-xs text-[hsl(var(--mobile-text-secondary))]">Missing Values</p>
          <p className="mb-0 mt-1 text-lg font-semibold text-amber-600">{stats.missingValueCount}</p>
        </button>
      </div>

      <MetricRow
        label="Documents"
        value={`${stats.docCount}`}
        trend={<span className="text-[hsl(var(--mobile-text-secondary))]">receipts linked</span>}
      />
    </SummaryCard>
  );
}

export function CoverageOpportunityCard({
  gapCount,
  exposedValue,
  totalValue,
  onReviewGaps,
  onViewActions,
}: {
  gapCount: number;
  exposedValue: number;
  totalValue: number;
  onReviewGaps: () => void;
  onViewActions: () => void;
}) {
  if (gapCount === 0) {
    return (
      <SummaryCard
        title="Coverage Opportunity"
        subtitle="All high-value items are currently protected."
        action={
          <StatusChip tone="good">
            Protected
          </StatusChip>
        }
      >
        <MetricRow label="Protected value" value={formatCurrency(totalValue)} />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onReviewGaps}
            className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
          >
            Review gaps
          </button>
          <button
            type="button"
            onClick={onViewActions}
            className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
          >
            View actions
          </button>
        </div>
      </SummaryCard>
    );
  }

  return (
    <SummaryCard
      title="Coverage Opportunity"
      subtitle={`${gapCount} item${gapCount === 1 ? '' : 's'} need protection`}
      className="border-rose-200 bg-[linear-gradient(145deg,#fff,#fff5f5)]"
      action={
        <IconBadge tone="danger">
          <AlertTriangle className="h-4 w-4" />
        </IconBadge>
      }
    >
      <p className="mb-0 text-sm text-rose-700">
        <span className="font-semibold">{formatCurrency(exposedValue)}</span> unprotected replacement value
      </p>
      <button
        type="button"
        onClick={onReviewGaps}
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700"
      >
        Review gaps
      </button>
    </SummaryCard>
  );
}

export function InventoryFiltersPanel({
  searchQuery,
  onSearchQueryChange,
  roomFilter,
  onRoomFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  docsFilter,
  onDocsFilterChange,
  recallFilter,
  onRecallFilterChange,
  activeSmartFilter,
  onToggleSmartFilter,
  rooms,
  gapCount,
  missingValueCount,
  recallCount,
  activeFilterCount,
  onClearAllFilters,
}: {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  roomFilter: string | null;
  onRoomFilterChange: (value: string | null) => void;
  categoryFilter: InventoryItemCategory | null;
  onCategoryFilterChange: (value: InventoryItemCategory | null) => void;
  docsFilter: 'any' | 'with-docs' | 'no-docs';
  onDocsFilterChange: (value: 'any' | 'with-docs' | 'no-docs') => void;
  recallFilter: 'any' | 'with-recalls' | 'no-recalls';
  onRecallFilterChange: (value: 'any' | 'with-recalls' | 'no-recalls') => void;
  activeSmartFilter: SmartFilterId | null;
  onToggleSmartFilter: (value: SmartFilterId) => void;
  rooms: InventoryRoom[];
  gapCount: number;
  missingValueCount: number;
  recallCount: number;
  activeFilterCount: number;
  onClearAllFilters: () => void;
}) {
  const smartFilters = [
    gapCount > 0
      ? { id: 'gaps' as const, label: `${gapCount} coverage gap${gapCount === 1 ? '' : 's'}` }
      : null,
    missingValueCount > 0
      ? { id: 'no-value' as const, label: `${missingValueCount} missing value${missingValueCount === 1 ? '' : 's'}` }
      : null,
    recallCount > 0
      ? { id: 'recalls' as const, label: `${recallCount} safety recall${recallCount === 1 ? '' : 's'}` }
      : null,
  ].filter(Boolean) as Array<{ id: SmartFilterId; label: string }>;

  return (
    <MobileCard className="space-y-2.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--mobile-text-muted))]" />
        <input
          type="text"
          placeholder="Search name, brand, model, serial..."
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          className="h-11 w-full rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white py-2 pl-9 pr-9 text-sm text-[hsl(var(--mobile-text-primary))] outline-none transition-colors focus:border-[hsl(var(--mobile-brand-border))]"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => onSearchQueryChange('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--mobile-text-muted))]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FilterDropdown
          value={roomFilter ?? 'all'}
          onChange={(value) => onRoomFilterChange(value === 'all' ? null : value)}
          options={[{ value: 'all', label: 'All Rooms' }, ...rooms.map((room) => ({ value: room.id, label: room.name }))]}
          ariaLabel="Room filter"
        />
        <FilterDropdown
          value={categoryFilter ?? 'all'}
          onChange={(value) => onCategoryFilterChange(value === 'all' ? null : (value as InventoryItemCategory))}
          options={INVENTORY_CATEGORY_FILTER_OPTIONS.map((option) => ({ value: option.value ?? 'all', label: option.label }))}
          ariaLabel="Category filter"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FilterDropdown
          value={docsFilter}
          onChange={(value) => onDocsFilterChange(value as 'any' | 'with-docs' | 'no-docs')}
          options={[
            { value: 'any', label: 'Docs' },
            { value: 'with-docs', label: 'With docs' },
            { value: 'no-docs', label: 'No docs' },
          ]}
          ariaLabel="Docs filter"
        />
        <FilterDropdown
          value={recallFilter}
          onChange={(value) => onRecallFilterChange(value as 'any' | 'with-recalls' | 'no-recalls')}
          options={[
            { value: 'any', label: 'Recalls' },
            { value: 'with-recalls', label: 'Has recalls' },
            { value: 'no-recalls', label: 'No recalls' },
          ]}
          ariaLabel="Recall filter"
        />
      </div>

      {smartFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {smartFilters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => onToggleSmartFilter(filter.id)}
              className={[
                'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                activeSmartFilter === filter.id
                  ? filter.id === 'gaps'
                    ? 'border-rose-300 bg-rose-100 text-rose-700'
                    : filter.id === 'no-value'
                      ? 'border-amber-300 bg-amber-100 text-amber-700'
                      : 'border-orange-300 bg-orange-100 text-orange-700'
                  : filter.id === 'gaps'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : filter.id === 'no-value'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-orange-200 bg-orange-50 text-orange-700',
              ].join(' ')}
            >
              {filter.label}
            </button>
          ))}
          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={onClearAllFilters}
              className="ml-auto text-xs font-semibold text-[hsl(var(--mobile-text-secondary))]"
            >
              Clear all ({activeFilterCount})
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="-mx-1 overflow-x-auto px-1 no-scrollbar">
        <div className="flex w-max items-center gap-2">
          <button
            type="button"
            onClick={() => onRoomFilterChange(null)}
            className={[
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
              roomFilter === null
                ? 'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] text-[hsl(var(--mobile-brand-strong))]'
                : 'border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-secondary))]',
            ].join(' ')}
          >
            All
          </button>
          {rooms.map((room) => (
            <button
              key={`room-chip-${room.id}`}
              type="button"
              onClick={() => onRoomFilterChange(room.id)}
              className={[
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                roomFilter === room.id
                  ? 'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] text-[hsl(var(--mobile-brand-strong))]'
                  : 'border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-secondary))]',
              ].join(' ')}
            >
              {room.name}
            </button>
          ))}
        </div>
      </div>

      {smartFilters.length === 0 && activeFilterCount > 0 ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClearAllFilters}
            className="text-xs font-semibold text-[hsl(var(--mobile-text-secondary))]"
          >
            Clear all ({activeFilterCount})
          </button>
        </div>
      ) : null}
    </MobileCard>
  );
}

export function MobileInventoryItemCard({
  item,
  onClick,
  onGetCoverage,
  onReplaceRepair,
  onAddValue,
  onAttachDocument,
}: {
  item: InventoryItem;
  onClick?: (item: InventoryItem) => void;
  onGetCoverage?: (item: InventoryItem) => void;
  onReplaceRepair?: (item: InventoryItem) => void;
  onAddValue?: (itemId: string, value: number) => Promise<void>;
  onAttachDocument?: (itemId: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPathWithQuery = React.useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  const coverageStatus = getCoverageStatus(item);
  const coveragePercent = getCoveragePercent(item);
  const hasWarranty = Boolean(item.warrantyId);
  const hasInsurance = Boolean(item.insurancePolicyId);
  const replacementValue = getReplacementValue(item);
  const hasValue = Number(replacementValue || 0) > 0;
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
    router.push(`/dashboard/properties/${item.propertyId}/inventory/items/${item.id}/replace-repair`);
  }

  return (
    <div
      id={`item-${item.id}`}
      className={[
        'rounded-[20px] border p-3.5 shadow-[0_10px_22px_rgba(15,23,42,0.05)] transition-all duration-150',
        coverageStatus === 'gap'
          ? 'border-rose-200 bg-rose-50/30'
          : coverageStatus === 'partial'
            ? 'border-amber-200 bg-amber-50/30'
            : 'border-[hsl(var(--mobile-border-subtle))] bg-white',
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
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className={['inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', categoryConfig.iconBg].join(' ')}>
              <ItemIcon className={['h-4 w-4', categoryConfig.iconColor].join(' ')} />
            </div>
            <div className="min-w-0">
              <p className="mb-0 truncate text-[1.05rem] font-semibold leading-tight text-[hsl(var(--mobile-text-primary))]">
                {item.name || 'Untitled'}
              </p>
              <p className="mb-0 mt-1 text-xs text-[hsl(var(--mobile-text-secondary))]">
                {titleCaseCategory(String(item.category || 'OTHER'))} · {getRoomLabel(item)}
              </p>
            </div>
          </div>

          <StatusChip
            tone={
              coverageStatus === 'covered'
                ? 'good'
                : coverageStatus === 'partial'
                  ? 'elevated'
                  : 'needsAction'
            }
          >
            {coverageStatus === 'covered' ? 'Covered' : coverageStatus === 'partial' ? 'Partial' : 'Coverage Gap'}
          </StatusChip>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2">
            <p className="mb-0 text-[10px] font-semibold tracking-normal text-[hsl(var(--mobile-text-muted))]">
              Replacement Value
            </p>
            {hasValue ? (
              <p className="mb-0 mt-1 text-lg font-semibold text-[hsl(var(--mobile-text-primary))]">
                {formatCurrency(replacementValue)}
              </p>
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

          <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2">
            <p className="mb-0 text-[10px] font-semibold tracking-normal text-[hsl(var(--mobile-text-muted))]">
              Coverage
            </p>
            <p className="mb-0 mt-1 text-lg font-semibold text-[hsl(var(--mobile-text-primary))]">
              {hasValue ? `${coveragePercent}%` : '—'}
            </p>
          </div>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--mobile-bg-muted))]">
          {hasValue ? (
            <div
              className={[
                'h-full rounded-full transition-all duration-700',
                coverageStatus === 'covered'
                  ? 'bg-emerald-500'
                  : coverageStatus === 'partial'
                    ? 'bg-amber-400'
                    : 'bg-rose-500',
              ].join(' ')}
              style={{ width: `${coveragePercent}%` }}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasWarranty ? (
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">
              Warranty
            </span>
          ) : null}
          {hasInsurance ? (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">
              Insurance
            </span>
          ) : null}
          {documentCount > 0 ? (
            <span className="rounded-full border border-[hsl(var(--mobile-border-subtle))] bg-white px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--mobile-text-secondary))]">
              {documentCount} doc{documentCount === 1 ? '' : 's'}
            </span>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAttachDocument?.(item.id);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--mobile-border-subtle))] bg-white px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--mobile-brand-strong))]"
            >
              <Upload className="h-3 w-3" />
              Attach receipt
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {coverageStatus !== 'covered' ? (
            <button
              type="button"
              onClick={handleOpenCoverage}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-3 py-2 text-sm font-semibold text-white"
            >
              <Shield className="h-4 w-4" />
              Get coverage
            </button>
          ) : (
            <div className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Protected
            </div>
          )}

          <button
            type="button"
            onClick={handleOpenReplaceRepair}
            className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
          >
            Replace/Repair
          </button>
        </div>
      </div>
    </div>
  );
}
