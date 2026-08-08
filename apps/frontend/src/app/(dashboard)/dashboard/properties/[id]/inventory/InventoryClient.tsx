'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';

import type { InventoryItem, InventoryItemCategory, InventoryRoom } from '@/types';
import { listPropertyRecalls } from '../recalls/recallsApi';
import {
  downloadInventoryExport,
  listInventoryItems,
  listInventoryRooms,
  updateInventoryItem,
} from '../../../inventory/inventoryApi';
import InventoryItemDrawer from '../../../components/inventory/InventoryItemDrawer';
import InventoryBulkUploadModal from '../../../components/inventory/InventoryBulkUploadModal';
import InventoryImportHistoryModal from '../../../components/inventory/InventoryImportHistoryModal';
import InventoryPageHeader from '../../../components/inventory/InventoryPageHeader';
import PortfolioIntelligenceStrip, {
  type InventoryPortfolioFilter,
  type PortfolioStats,
} from '../../../components/inventory/PortfolioIntelligenceStrip';
import CoverageHealthBanner from '../../../components/inventory/CoverageHealthBanner';
import InventoryFilterBar, { type SmartFilterId } from '../../../components/inventory/InventoryFilterBar';
import CoverageTab from '../../../components/inventory/CoverageTab';
import {
  CoverageOpportunityCard,
  CoverageSnapshotCard,
  InventoryFiltersPanel,
  InventoryHeroCard,
  MobileInventoryItemCard,
} from '../../../components/inventory/MobileInventorySections';
import OnboardingReturnBanner from '@/components/onboarding/OnboardingReturnBanner';
import { CapabilityDiscoveryAnchor } from '@/features/tools/CapabilityDiscoveryAnchor';
import ItemCard from '@/components/shared/ItemCard';
import {
  EmptyStateCard,
  MobileCard,
  MobilePageContainer,
  MobileSection,
  MobileSectionHeader,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { useToast } from '@/components/ui/use-toast';
import { track } from '@/lib/analytics/events';
import TrustStrip from '../components/route-templates/TrustStrip';

function getCoverageStatus(item: InventoryItem): 'uncovered' | 'partial' | 'covered' | 'waived' {
  if (item.coverageState === 'NOT_REQUIRED' || item.coverageState === 'MANAGED_ELSEWHERE') return 'waived';
  if (item.coverageState === 'CONFIRMED') return 'covered';
  if (item.coverageState === 'MISSING') return 'uncovered';
  if (item.coverageState === 'INCOMPLETE') return 'partial';
  if (item.coverageNotRequired) return 'waived';

  const hasWarranty = Boolean(item.warrantyId);
  const hasInsurance = Boolean(item.insurancePolicyId);

  if (!hasWarranty && !hasInsurance) return 'uncovered';
  if (!hasWarranty || !hasInsurance) return 'partial';
  return 'covered';
}

const COVERAGE_ATTENTION_RANK: Record<ReturnType<typeof getCoverageStatus>, number> = {
  uncovered: 0,
  partial: 1,
  waived: 2,
  covered: 3,
};

function byNeedsAttentionFirst(a: InventoryItem, b: InventoryItem): number {
  return COVERAGE_ATTENTION_RANK[getCoverageStatus(a)] - COVERAGE_ATTENTION_RANK[getCoverageStatus(b)];
}

function getCoveragePercent(item: InventoryItem): number {
  const status = getCoverageStatus(item);
  if (status === 'covered') return 100;
  return 0;
}

function hasReplacementValue(item: InventoryItem): boolean {
  return Number(item.effectiveReplacementCostCents ?? item.replacementCostCents ?? 0) > 0;
}

function isActionableCoverageGap(item: InventoryItem): boolean {
  return item.coverageState === 'MISSING' && item.coverageActionable === true;
}

function smartFilterLabel(filter: SmartFilterId): string {
  switch (filter) {
    case 'incomplete':
      return 'needs confirmation';
    case 'no-value':
      return 'missing values';
    case 'not-required':
      return 'not required';
    case 'missing-age':
      return 'missing age';
    case 'missing-date':
      return 'missing purchase date';
    case 'missing-warranty':
      return 'missing warranty';
    default:
      return filter;
  }
}

function containsSearch(item: InventoryItem, query: string): boolean {
  if (!query.trim()) return true;

  const haystack = [item.name, item.brand, item.model, item.serialNo]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(query.trim().toLowerCase());
}

export default function InventoryClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const router = useRouter();
  const { toast } = useToast();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPathWithQuery = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  const openItemId = searchParams.get('openItemId');
  const scrollToItemId = searchParams.get('scrollToItemId');
  const highlightRecallMatchId = searchParams.get('highlightRecallMatchId');
  const roomIdFromUrl = searchParams.get('roomId');
  const from = searchParams.get('from');
  const tabFromUrl = searchParams.get('tab');
  const smartFromUrl = searchParams.get('smart') as SmartFilterId | null;
  const actionFromUrl = searchParams.get('action');
  const filterFromUrl = searchParams.get('filter');
  const categoryFromUrl = searchParams.get('category') as InventoryItemCategory | null;
  // Sale Readiness Value-Maximization Checklist plan §4.4b/§10 Phase 6:
  // Seller Prep's entry-flow routing card deep-links here with a returnTo,
  // same contract as /dashboard/warranties's existing returnTo support —
  // auto-return once an item is saved instead of leaving the homeowner to
  // navigate back manually.
  const safeReturnTo = useMemo(() => {
    const raw = searchParams.get('returnTo');
    return raw && raw.startsWith('/dashboard/') ? raw : null;
  }, [searchParams]);

  // CTAs across the sidebar promise specific missing-data scopes ("Complete age
  // assessment", "Add warranty details") via ?filter=/?action= — map those onto
  // the same smart-filter mechanism the filter chips use, so the promised list
  // actually shows up instead of the unfiltered inventory.
  const smartFilterFromUrl: SmartFilterId | null =
    filterFromUrl === 'missing-age' || actionFromUrl === 'add-ages'
      ? 'missing-age'
      : filterFromUrl === 'missing-date' || actionFromUrl === 'add-dates'
        ? 'missing-date'
        : filterFromUrl === 'missing-warranty' || actionFromUrl === 'add-warranty'
          ? 'missing-warranty'
          : smartFromUrl;

  const [rooms, setRooms] = useState<InventoryRoom[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'items' | 'coverage'>(tabFromUrl === 'coverage' ? 'coverage' : 'items');

  const [searchQuery, setSearchQuery] = useState('');
  const [roomFilter, setRoomFilter] = useState<string | null>(roomIdFromUrl || null);
  const [categoryFilter, setCategoryFilter] = useState<InventoryItemCategory | null>(null);
  const [docsFilter, setDocsFilter] = useState<'any' | 'with-docs' | 'no-docs'>('any');
  const [recallFilter, setRecallFilter] = useState<'any' | 'with-recalls' | 'no-recalls'>('any');
  const [activeSmartFilter, setActiveSmartFilter] = useState<SmartFilterId | null>(smartFilterFromUrl);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [autoOpenedFromUrl, setAutoOpenedFromUrl] = useState(false);
  const [autoScrolledFromUrl, setAutoScrolledFromUrl] = useState(false);
  const [highlightItemId, setHighlightItemId] = useState<string | null>(null);
  const [ingestedItemId, setIngestedItemId] = useState<string | null>(null);

  const [recallMatchesByItemId, setRecallMatchesByItemId] = useState<Record<string, any[]>>({});

  useEffect(() => {
    setActiveTab(tabFromUrl === 'coverage' ? 'coverage' : 'items');
  }, [tabFromUrl]);

  useEffect(() => {
    setRoomFilter((prev) => (prev === (roomIdFromUrl || null) ? prev : roomIdFromUrl || null));
  }, [roomIdFromUrl]);

  async function refreshAll() {
    if (!propertyId) return;

    setLoading(true);
    try {
      const [loadedRooms, loadedItems, recalls] = await Promise.all([
        listInventoryRooms(propertyId),
        listInventoryItems(propertyId, {}),
        listPropertyRecalls(propertyId),
      ]);

      setRooms(loadedRooms);
      setItems(loadedItems);

      const matches = (recalls as any)?.matches ?? (recalls as any)?.recallMatches ?? [];
      const nextMap: Record<string, any[]> = {};
      for (const match of matches) {
        const itemId = match?.inventoryItemId;
        if (!itemId) continue;
        (nextMap[itemId] ||= []).push(match);
      }
      setRecallMatchesByItemId(nextMap);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  useEffect(() => {
    if (autoOpenedFromUrl) return;
    if (!openItemId || items.length === 0) return;

    const found = items.find((item) => item.id === openItemId);
    if (found) {
      setEditingItem(found);
      setDrawerOpen(true);
      setAutoOpenedFromUrl(true);
    }
  }, [autoOpenedFromUrl, openItemId, items]);

  // Sidebar/dashboard CTAs like "Add appliance" promise a ready-to-fill add form,
  // not just landing on the list — honor ?action=add-item by opening it directly.
  useEffect(() => {
    if (autoOpenedFromUrl) return;
    if (openItemId) return;
    if (actionFromUrl !== 'add-item') return;

    setEditingItem(null);
    setDrawerOpen(true);
    setAutoOpenedFromUrl(true);
  }, [autoOpenedFromUrl, openItemId, actionFromUrl]);

  useEffect(() => {
    if (autoScrolledFromUrl) return;

    const targetId = scrollToItemId || openItemId;
    if (!targetId || items.length === 0) return;

    const timer = window.setTimeout(() => {
      const target = document.getElementById(`item-${targetId}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightItemId(targetId);
        window.setTimeout(() => setHighlightItemId(null), 1200);
        setAutoScrolledFromUrl(true);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [autoScrolledFromUrl, openItemId, scrollToItemId, items.length]);

  const recallCountByItem = useMemo(() => {
    const result: Record<string, number> = {};

    for (const [itemId, matches] of Object.entries(recallMatchesByItemId)) {
      const openCount = (matches || []).filter((match: any) => String(match?.status || '').toUpperCase() === 'OPEN').length;
      result[itemId] = openCount;
    }

    return result;
  }, [recallMatchesByItemId]);

  function hasOpenRecall(itemId: string): boolean {
    return Number(recallCountByItem[itemId] || 0) > 0;
  }

  const portfolioStats: PortfolioStats = useMemo(() => {
    const totalValue = items.reduce((sum, item) => sum + Number(item.effectiveReplacementCostCents ?? item.replacementCostCents ?? 0) / 100, 0);

    const assessableItems = items.filter((item) => item.coverageState === 'CONFIRMED' || isActionableCoverageGap(item));
    const assessableValue = assessableItems.reduce(
      (sum, item) => sum + Number(item.effectiveReplacementCostCents ?? item.replacementCostCents ?? 0) / 100,
      0,
    );

    const coveredValue = assessableItems.reduce((sum, item) => {
      const value = Number(item.effectiveReplacementCostCents ?? item.replacementCostCents ?? 0) / 100;
      return sum + (value * getCoveragePercent(item)) / 100;
    }, 0);

    const gapCount = items.filter(isActionableCoverageGap).length;
    const incompleteCount = items.filter((item) => item.coverageState === 'INCOMPLETE').length;
    const missingValueCount = items.filter((item) => !hasReplacementValue(item)).length;
    const docCount = items.filter((item) => (item.documents?.length ?? 0) > 0).length;
    const notRequiredCount = items.filter((item) => item.coverageState === 'NOT_REQUIRED' || item.coverageNotRequired).length;

    return {
      totalValue,
      coveredValue,
      coverageRate: assessableValue > 0 ? (coveredValue / assessableValue) * 100 : 0,
      gapCount,
      incompleteCount,
      missingValueCount,
      docCount,
      notRequiredCount,
      totalItems: items.length,
    };
  }, [items]);

  const exposedValue = useMemo(() => {
    return items
      .filter(isActionableCoverageGap)
      .reduce((sum, item) => sum + Number(item.effectiveReplacementCostCents ?? item.replacementCostCents ?? 0) / 100, 0);
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (!containsSearch(item, searchQuery)) return false;
      if (roomFilter && item.roomId !== roomFilter) return false;
      if (categoryFilter && item.category !== categoryFilter) return false;

      const docCount = item.documents?.length ?? 0;
      if (docsFilter === 'with-docs' && docCount === 0) return false;
      if (docsFilter === 'no-docs' && docCount > 0) return false;

      const hasRecall = hasOpenRecall(item.id);
      if (recallFilter === 'with-recalls' && !hasRecall) return false;
      if (recallFilter === 'no-recalls' && hasRecall) return false;

      if (activeSmartFilter === 'gaps' && !isActionableCoverageGap(item)) return false;
      if (activeSmartFilter === 'incomplete' && item.coverageState !== 'INCOMPLETE') return false;
      if (activeSmartFilter === 'no-value' && hasReplacementValue(item)) return false;
      if (activeSmartFilter === 'recalls' && !hasRecall) return false;
      if (activeSmartFilter === 'not-required' && !item.coverageNotRequired) return false;
      if (activeSmartFilter === 'missing-age' && item.installedOn) return false;
      if (activeSmartFilter === 'missing-date' && (item.recordGroup === 'SYSTEMS_STRUCTURE' || item.purchasedOn)) return false;
      if (activeSmartFilter === 'missing-warranty' && (!isActionableCoverageGap(item) || item.warrantyId)) return false;

      return true;
    });
  }, [items, searchQuery, roomFilter, categoryFilter, docsFilter, recallFilter, activeSmartFilter, recallCountByItem]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count += 1;
    if (roomFilter) count += 1;
    if (categoryFilter) count += 1;
    if (docsFilter !== 'any') count += 1;
    if (recallFilter !== 'any') count += 1;
    if (activeSmartFilter) count += 1;
    return count;
  }, [searchQuery, roomFilter, categoryFilter, docsFilter, recallFilter, activeSmartFilter]);

  const portfolioFilter = (activeSmartFilter === 'gaps' || activeSmartFilter === 'incomplete' || activeSmartFilter === 'no-value'
    ? activeSmartFilter
    : null) as InventoryPortfolioFilter;

  const recallCount = useMemo(() => {
    return items.filter((item) => hasOpenRecall(item.id)).length;
  }, [items, recallCountByItem]);

  const missingAgeCount = useMemo(() => items.filter((item) => !item.installedOn).length, [items]);
  const missingDateCount = useMemo(() => items.filter((item) => item.recordGroup !== 'SYSTEMS_STRUCTURE' && !item.purchasedOn).length, [items]);
  const missingWarrantyCount = useMemo(() => items.filter((item) => isActionableCoverageGap(item) && !item.warrantyId).length, [items]);

  const groupedItems = useMemo(() => ({
    systems: filteredItems.filter((item) => item.recordGroup === 'SYSTEMS_STRUCTURE').sort(byNeedsAttentionFirst),
    belongings: filteredItems.filter((item) => item.recordGroup !== 'SYSTEMS_STRUCTURE').sort(byNeedsAttentionFirst),
  }), [filteredItems]);

  async function handleExportCsv() {
    try {
      await downloadInventoryExport(propertyId);
    } catch (error) {
      console.error('Inventory export failed', error);
      toast({
        title: 'Export failed',
        description: 'We could not generate the CSV right now. Please try again.',
        variant: 'destructive',
      });
    }
  }

  function clearAllFilters() {
    setSearchQuery('');
    setRoomFilter(null);
    setCategoryFilter(null);
    setDocsFilter('any');
    setRecallFilter('any');
    setActiveSmartFilter(null);
  }

  function onAdd() {
    setEditingItem(null);
    setDrawerOpen(true);
  }

  function onEdit(item: InventoryItem) {
    setEditingItem(item);
    setDrawerOpen(true);
  }

  function openItemById(itemId: string) {
    const found = items.find((item) => item.id === itemId);
    if (!found) return;
    onEdit(found);
  }

  async function onSaveInlineValue(itemId: string, value: number) {
    const replacementCostCents = Math.round(value * 100);

    const updated = await updateInventoryItem(propertyId, itemId, { replacementCostCents });

    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          ...updated,
        };
      }),
    );
  }

  function toggleSmartFilter(filter: SmartFilterId) {
    setActiveSmartFilter((prev) => (prev === filter ? null : filter));
  }

  function togglePortfolioFilter(filter: Exclude<InventoryPortfolioFilter, null>) {
    setActiveSmartFilter((prev) => (prev === filter ? null : filter));
  }

  const hasItems = items.length > 0;
  const hasFilteredItems = filteredItems.length > 0;
  const filteredGapCount = useMemo(
    () => filteredItems.filter((item) => getCoverageStatus(item) !== 'covered' && getCoverageStatus(item) !== 'waived').length,
    [filteredItems],
  );

  return (
    <>
      {ingestedItemId ? (
        <div className="mx-auto w-full max-w-7xl px-4 pt-3 sm:px-6">
          <CapabilityDiscoveryAnchor
            anchor="INVENTORY_ITEM_INGESTED"
            propertyId={propertyId}
            entityId={ingestedItemId}
          />
        </div>
      ) : null}

      <div className="md:hidden">
        <MobilePageContainer className="mobile-stack-sections pb-[calc(8rem+env(safe-area-inset-bottom))]">
          <MobileSection className="pt-1">
            <OnboardingReturnBanner />
          </MobileSection>

          {from === 'status-board' ? (
            <MobileSection>
              <Link
                href={`/dashboard/properties/${propertyId}/status-board`}
                className="no-brand-style inline-flex min-h-[40px] items-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm font-medium text-[hsl(var(--mobile-text-primary))]"
              >
                Back to Status Board
              </Link>
            </MobileSection>
          ) : null}

          <MobileSection>
            <InventoryHeroCard
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onManageRooms={() => router.push(`/dashboard/properties/${propertyId}/inventory/rooms`)}
              onExportCsv={handleExportCsv}
              onBulkUpload={() => setBulkOpen(true)}
              onImportHistory={() => setHistoryOpen(true)}
              onAddItem={onAdd}
            />
          </MobileSection>

          <MobileSection>
            <CoverageSnapshotCard
              stats={portfolioStats}
              activeFilter={portfolioFilter}
              onToggleFilter={togglePortfolioFilter}
            />
          </MobileSection>

          <MobileSection>
            <TrustStrip
              variant="footnote"
              confidenceLabel={`${Math.round(portfolioStats.coverageRate)}% coverage rate for items with complete coverage context`}
              freshnessLabel="Updates from latest inventory, docs, recalls, and coverage links"
              sourceLabel="Inventory data + warranty/insurance linkage + recall matches"
            />
          </MobileSection>

          <MobileSection>
            <CoverageOpportunityCard
              gapCount={portfolioStats.gapCount}
              exposedValue={exposedValue}
              totalValue={portfolioStats.totalValue}
              onReviewGaps={() => setActiveSmartFilter('gaps')}
              onViewActions={() => router.push(`/dashboard/properties/${propertyId}/fix?filter=coverage`)}
              onAdd={onAdd}
            />
          </MobileSection>

          <MobileSection>
            <InventoryFiltersPanel
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              roomFilter={roomFilter}
              onRoomFilterChange={setRoomFilter}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={setCategoryFilter}
              docsFilter={docsFilter}
              onDocsFilterChange={setDocsFilter}
              recallFilter={recallFilter}
              onRecallFilterChange={setRecallFilter}
              activeSmartFilter={activeSmartFilter}
              onToggleSmartFilter={toggleSmartFilter}
              rooms={rooms}
              gapCount={portfolioStats.gapCount}
              incompleteCount={portfolioStats.incompleteCount}
              missingValueCount={portfolioStats.missingValueCount}
              recallCount={recallCount}
              notRequiredCount={portfolioStats.notRequiredCount}
              missingAgeCount={missingAgeCount}
              missingDateCount={missingDateCount}
              missingWarrantyCount={missingWarrantyCount}
              activeFilterCount={activeFilterCount}
              onClearAllFilters={clearAllFilters}
            />
          </MobileSection>

          {activeSmartFilter ? (
            <MobileSection>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-1 text-xs font-medium text-[hsl(var(--mobile-text-secondary))]">
                  Active filter: {activeSmartFilter ? smartFilterLabel(activeSmartFilter) : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveSmartFilter(null)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--mobile-text-secondary))]"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              </div>
            </MobileSection>
          ) : null}

          <MobileSection>
            {loading ? (
              <MobileCard variant="compact">
                <p className="mb-0 text-sm text-[hsl(var(--mobile-text-secondary))]">Loading inventory...</p>
              </MobileCard>
            ) : !hasItems ? (
              <EmptyStateCard
                title="No inventory items yet"
                description="Add your first item to start tracking replacement value, coverage, and documentation."
                action={
                  <button
                    type="button"
                    onClick={onAdd}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Add item
                  </button>
                }
              />
            ) : activeTab === 'coverage' ? (
              <CoverageTab
                items={filteredItems}
                rooms={rooms}
                onOpenCoverage={(item) =>
                  router.push(
                    `/dashboard/properties/${propertyId}/inventory/items/${item.id}/coverage?returnTo=${encodeURIComponent(currentPathWithQuery)}`
                  )
                }
                onOpenActions={(count) =>
                  router.push(`/dashboard/properties/${propertyId}/fix?filter=coverage&expectedCount=${count}`)
                }
              />
            ) : !hasFilteredItems ? (
              <EmptyStateCard
                title="No items match your filters"
                description="Try adjusting search or filters to see more items."
                action={
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
                  >
                    Clear all filters
                  </button>
                }
              />
            ) : (
              <div className="space-y-7">
                <MobileSectionHeader
                  title={filteredGapCount > 0 ? 'Needs attention' : 'Inventory List'}
                  subtitle={`${filteredItems.length} items`}
                />
                {([
                  { key: 'systems', title: 'Systems & Structure', subtitle: 'Whole-home equipment and structural components', items: groupedItems.systems },
                  { key: 'belongings', title: 'Appliances & Belongings', subtitle: 'Room-based appliances and belongings', items: groupedItems.belongings },
                ] as const).filter((group) => group.items.length > 0).map((group) => (
                  <section key={group.key} className="space-y-2.5">
                    <MobileSectionHeader title={group.title} subtitle={group.subtitle} />
                    <AnimatePresence mode="popLayout">
                      {group.items.map((item, index) => (
                        <motion.div
                          key={item.id}
                          layout
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.18, delay: index * 0.02 }}
                          className={highlightItemId === item.id ? 'rounded-[22px] ring-2 ring-amber-300' : ''}
                        >
                          <MobileInventoryItemCard
                            item={item}
                            onClick={onEdit}
                            onAddValue={onSaveInlineValue}
                            onAttachDocument={openItemById}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </section>
                ))}
              </div>
            )}
          </MobileSection>
        </MobilePageContainer>
      </div>

      <div className="hidden md:block">
        <div className="mx-auto max-w-7xl space-y-4 p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-6">
          <OnboardingReturnBanner />

          {from === 'status-board' ? (
            <Link
              href={`/dashboard/properties/${propertyId}/status-board`}
              className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-sm transition-colors hover:bg-black/5"
            >
              Back to Status Board
            </Link>
          ) : null}

          <InventoryPageHeader
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onManageRooms={() => router.push(`/dashboard/properties/${propertyId}/inventory/rooms`)}
            onExportCsv={handleExportCsv}
            onBulkUpload={() => setBulkOpen(true)}
            onImportHistory={() => setHistoryOpen(true)}
            onAddItem={onAdd}
          />

          <CoverageHealthBanner
            gapCount={portfolioStats.gapCount}
            exposedValue={exposedValue}
            totalValue={portfolioStats.totalValue}
            onReviewGaps={() => setActiveSmartFilter('gaps')}
            onViewActions={() => router.push(`/dashboard/properties/${propertyId}/fix?filter=coverage`)}
            onAdd={onAdd}
          />

          <PortfolioIntelligenceStrip
            stats={portfolioStats}
            activeFilter={portfolioFilter}
            onToggleFilter={togglePortfolioFilter}
          />

          <TrustStrip
            variant="footnote"
            confidenceLabel={`${Math.round(portfolioStats.coverageRate)}% coverage rate for items with complete coverage context`}
            freshnessLabel="Live from inventory updates, coverage links, and recall scans"
            sourceLabel="Inventory graph + documents + policy associations"
          />

          <InventoryFilterBar
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            roomFilter={roomFilter}
            onRoomFilterChange={setRoomFilter}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            docsFilter={docsFilter}
            onDocsFilterChange={setDocsFilter}
            recallFilter={recallFilter}
            onRecallFilterChange={setRecallFilter}
            activeSmartFilter={activeSmartFilter}
            onToggleSmartFilter={toggleSmartFilter}
            rooms={rooms}
            gapCount={portfolioStats.gapCount}
            incompleteCount={portfolioStats.incompleteCount}
            missingValueCount={portfolioStats.missingValueCount}
            recallCount={recallCount}
            notRequiredCount={portfolioStats.notRequiredCount}
            missingAgeCount={missingAgeCount}
            missingDateCount={missingDateCount}
            missingWarrantyCount={missingWarrantyCount}
            activeFilterCount={activeFilterCount}
            onClearAllFilters={clearAllFilters}
          />

          {activeSmartFilter ? (
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600">
                Active filter: {activeSmartFilter ? smartFilterLabel(activeSmartFilter) : ''}
              </span>
              <button
                type="button"
                onClick={() => setActiveSmartFilter(null)}
                className="inline-flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-700"
              >
                <X className="h-3 w-3" />
                Clear filter
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="text-sm opacity-70">Loading...</div>
          ) : !hasItems ? (
            <div className="rounded-2xl border border-black/10 p-6">
              <div className="text-base font-medium">No inventory items yet</div>
              <div className="mt-1 text-sm opacity-70">
                Add your first item to start tracking replacement value, coverage, and documentation.
              </div>
              <button
                type="button"
                onClick={onAdd}
                className="mt-4 rounded-xl border border-black/10 px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-black/5"
              >
                Add item
              </button>
            </div>
          ) : activeTab === 'coverage' ? (
            <CoverageTab
              items={filteredItems}
              rooms={rooms}
              onOpenCoverage={(item) =>
                router.push(
                  `/dashboard/properties/${propertyId}/inventory/items/${item.id}/coverage?returnTo=${encodeURIComponent(currentPathWithQuery)}`
                )
              }
              onOpenActions={(count) =>
                router.push(`/dashboard/properties/${propertyId}/fix?filter=coverage&expectedCount=${count}`)
              }
            />
          ) : !hasFilteredItems ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 rounded-full bg-gray-100 p-4">
                <Search className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-gray-700">No items match your filters</p>
              <p className="mt-1 text-xs text-gray-400">Try adjusting your search or filters</p>
              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-3 text-sm text-teal-600 transition-colors hover:underline"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="space-y-10">
              {([
                {
                  key: 'systems',
                  title: 'Systems & Structure',
                  description: 'Whole-home equipment and structural components. A room is optional.',
                  items: groupedItems.systems,
                },
                {
                  key: 'belongings',
                  title: 'Appliances & Belongings',
                  description: 'Room-based appliances, electronics, furniture, and valuables.',
                  items: groupedItems.belongings,
                },
              ] as const).filter((group) => group.items.length > 0).map((group) => (
                <section key={group.key} aria-labelledby={`inventory-group-${group.key}`}>
                  <div className="mb-4">
                    <h2 id={`inventory-group-${group.key}`} className="text-lg font-semibold text-gray-950">{group.title}</h2>
                    <p className="mt-1 text-sm text-gray-500">{group.description}</p>
                  </div>
                  <div className="grid auto-rows-fr grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
                    <AnimatePresence mode="popLayout">
                      {group.items.map((item, index) => (
                        <motion.div
                          key={item.id}
                          layout
                          initial={{ opacity: 0, scale: 0.97 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.97 }}
                          transition={{ duration: 0.2, delay: index * 0.03 }}
                          className={highlightItemId === item.id ? 'rounded-2xl ring-2 ring-amber-300' : ''}
                        >
                          <ItemCard
                            item={item}
                            variant="inventory"
                            onClick={onEdit}
                            onAddValue={onSaveInlineValue}
                            onAttachDocument={openItemById}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      <InventoryItemDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        propertyId={propertyId}
        rooms={rooms}
        initialItem={editingItem}
        initialRoomId={roomIdFromUrl}
        initialCategory={categoryFromUrl}
        highlightRecallMatchId={highlightRecallMatchId}
        onSaved={async (result) => {
          setDrawerOpen(false);
          if (result?.created) {
            setIngestedItemId(result.itemId);
            if (from === 'home-digital-twin') {
              track('action_completed', {
                tool: 'home-digital-twin',
                propertyId,
                actionType: 'canonical_fact_inventory_item_created',
              });
            }
          }
          if (safeReturnTo) {
            router.push(safeReturnTo);
            return;
          }
          await refreshAll();
        }}
        existingItems={items}
      />

      <InventoryBulkUploadModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        propertyId={propertyId}
        onImported={async () => {
          setBulkOpen(false);
          await refreshAll();
        }}
      />

      <InventoryImportHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        propertyId={propertyId}
        onChanged={async () => {
          await refreshAll();
        }}
      />
    </>
  );
}
