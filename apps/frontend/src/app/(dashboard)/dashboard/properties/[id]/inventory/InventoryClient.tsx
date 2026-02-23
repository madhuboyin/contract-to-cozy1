'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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
import OnboardingReturnBanner from '@/components/onboarding/OnboardingReturnBanner';
import ItemCard from '@/components/shared/ItemCard';

function getCoverageStatus(item: InventoryItem): 'uncovered' | 'partial' | 'covered' {
  const hasWarranty = Boolean(item.warrantyId);
  const hasInsurance = Boolean(item.insurancePolicyId);

  if (!hasWarranty && !hasInsurance) return 'uncovered';
  if (!hasWarranty || !hasInsurance) return 'partial';
  return 'covered';
}

function getCoveragePercent(item: InventoryItem): number {
  const status = getCoverageStatus(item);
  if (status === 'covered') return 100;
  if (status === 'partial') return 65;
  return 0;
}

function hasReplacementValue(item: InventoryItem): boolean {
  return Number(item.replacementCostCents || 0) > 0;
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
  const searchParams = useSearchParams();

  const openItemId = searchParams.get('openItemId');
  const scrollToItemId = searchParams.get('scrollToItemId');
  const highlightRecallMatchId = searchParams.get('highlightRecallMatchId');
  const roomIdFromUrl = searchParams.get('roomId');
  const from = searchParams.get('from');
  const tabFromUrl = searchParams.get('tab');

  const [rooms, setRooms] = useState<InventoryRoom[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'items' | 'coverage'>(tabFromUrl === 'coverage' ? 'coverage' : 'items');

  const [searchQuery, setSearchQuery] = useState('');
  const [roomFilter, setRoomFilter] = useState<string | null>(roomIdFromUrl || null);
  const [categoryFilter, setCategoryFilter] = useState<InventoryItemCategory | null>(null);
  const [docsFilter, setDocsFilter] = useState<'any' | 'with-docs' | 'no-docs'>('any');
  const [recallFilter, setRecallFilter] = useState<'any' | 'with-recalls' | 'no-recalls'>('any');
  const [activeSmartFilter, setActiveSmartFilter] = useState<SmartFilterId | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [autoOpenedFromUrl, setAutoOpenedFromUrl] = useState(false);
  const [autoScrolledFromUrl, setAutoScrolledFromUrl] = useState(false);
  const [highlightItemId, setHighlightItemId] = useState<string | null>(null);

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
    const totalValue = items.reduce((sum, item) => sum + Number(item.replacementCostCents || 0) / 100, 0);

    const coveredValue = items.reduce((sum, item) => {
      const value = Number(item.replacementCostCents || 0) / 100;
      return sum + (value * getCoveragePercent(item)) / 100;
    }, 0);

    const gapCount = items.filter((item) => getCoverageStatus(item) !== 'covered').length;
    const missingValueCount = items.filter((item) => !hasReplacementValue(item)).length;
    const docCount = items.filter((item) => (item.documents?.length ?? 0) > 0).length;

    return {
      totalValue,
      coveredValue,
      coverageRate: totalValue > 0 ? (coveredValue / totalValue) * 100 : 0,
      gapCount,
      missingValueCount,
      docCount,
      totalItems: items.length,
    };
  }, [items]);

  const exposedValue = useMemo(() => {
    return items
      .filter((item) => getCoverageStatus(item) !== 'covered')
      .reduce((sum, item) => sum + Number(item.replacementCostCents || 0) / 100, 0);
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

      if (activeSmartFilter === 'gaps' && getCoverageStatus(item) === 'covered') return false;
      if (activeSmartFilter === 'no-value' && hasReplacementValue(item)) return false;
      if (activeSmartFilter === 'recalls' && !hasRecall) return false;

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

  const portfolioFilter = (activeSmartFilter === 'gaps' || activeSmartFilter === 'no-value'
    ? activeSmartFilter
    : null) as InventoryPortfolioFilter;

  const recallCount = useMemo(() => {
    return items.filter((item) => hasOpenRecall(item.id)).length;
  }, [items, recallCountByItem]);

  async function handleExportCsv() {
    try {
      await downloadInventoryExport(propertyId);
    } catch (error) {
      console.error('Inventory export failed', error);
      alert('Failed to export CSV. Please try again.');
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

  return (
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
        onViewActions={() => router.push(`/dashboard/actions?propertyId=${propertyId}&filter=coverage-gaps`)}
      />

      <PortfolioIntelligenceStrip
        stats={portfolioStats}
        activeFilter={portfolioFilter}
        onToggleFilter={togglePortfolioFilter}
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
        missingValueCount={portfolioStats.missingValueCount}
        recallCount={recallCount}
        activeFilterCount={activeFilterCount}
        onClearAllFilters={clearAllFilters}
      />

      {activeSmartFilter ? (
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600">
            Active filter: {activeSmartFilter === 'no-value' ? 'missing values' : activeSmartFilter}
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
          onOpenCoverage={(item) => router.push(`/dashboard/properties/${propertyId}/inventory/items/${item.id}/coverage`)}
          onOpenActions={() => router.push(`/dashboard/actions?propertyId=${propertyId}&filter=coverage-gaps`)}
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
        <div className="grid auto-rows-fr grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filteredItems.map((item, index) => (
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
      )}

      <InventoryItemDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        propertyId={propertyId}
        rooms={rooms}
        initialItem={editingItem}
        highlightRecallMatchId={highlightRecallMatchId}
        onSaved={async () => {
          setDrawerOpen(false);
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
    </div>
  );
}
