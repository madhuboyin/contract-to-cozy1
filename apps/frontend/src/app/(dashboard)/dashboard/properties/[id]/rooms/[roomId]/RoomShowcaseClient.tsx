'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, History, Plus } from 'lucide-react';
import { motion } from 'framer-motion';

import { useCelebration } from '@/hooks/useCelebration';
import type { InventoryItem, InventoryRoom } from '@/types';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import InventoryItemDrawer from '@/app/(dashboard)/dashboard/components/inventory/InventoryItemDrawer';
import RoomScanModal from '@/app/(dashboard)/dashboard/components/inventory/RoomScanModal';
import QuickWins from '@/components/rooms/QuickWins';
import RoomAtAGlance from '@/components/rooms/RoomAtAGlance';
import RoomIntelligenceCard from '@/components/rooms/RoomIntelligenceCard';
import RoomPageHeader from '@/components/rooms/RoomPageHeader';
import ItemCard from '@/components/shared/ItemCard';

import {
  getDraftsCsvExportUrl,
  getRoomInsights,
  listInventoryItems,
  listInventoryRooms,
  listRoomScanSessions,
  updateInventoryItem,
} from '../../../../inventory/inventoryApi';

const MilestoneCelebration = dynamic(
  () => import('@/components/ui/MilestoneCelebration').then((m) => m.MilestoneCelebration),
  { ssr: false },
);

function computeHealthScore(insights: any, itemsFallback: InventoryItem[]) {
  const stats = insights?.stats || {};
  const itemCount = Number(stats.itemCount ?? itemsFallback.length ?? 0);
  const docs = Number(stats.docsLinkedCount || 0);
  const gaps = Number(stats.coverageGapsCount || 0);

  let score = 55;
  score += Math.min(20, itemCount * 2);
  score += Math.min(20, docs * 5);
  score -= Math.min(30, gaps * 8);

  const missing = insights?.kitchen?.missingAppliances?.length || 0;
  score -= Math.min(20, missing * 6);

  const hint = insights?.livingRoom?.comfortScoreHint;
  if (hint === 'HIGH') score += 6;
  if (hint === 'LOW') score -= 6;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function asArray<T = any>(v: any): T[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v) as T[];
  return [];
}

function tipCtaLabel(title: string): string {
  const normalized = title.toLowerCase();
  if (normalized.includes('coverage')) return 'Fix gaps';
  if (normalized.includes('document')) return 'Add docs';
  if (normalized.includes('item')) return 'Add items';
  if (normalized.includes('appliance')) return 'Add appliances';
  if (normalized.includes('comfort')) return 'Improve setup';
  return 'Take action';
}

const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, delay: index * 0.07, ease: 'easeOut' },
  }),
};

export default function RoomShowcaseClient() {
  const params = useParams<{ id: string; roomId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const propertyId = params.id;
  const roomId = params.roomId;

  const from = searchParams.get('from');
  const fromStatusBoard = from === 'status-board';

  const [room, setRoom] = useState<InventoryRoom | null>(null);
  const [rooms, setRooms] = useState<InventoryRoom[]>([]);
  const [insights, setInsights] = useState<any>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const [scanOpen, setScanOpen] = useState(false);
  const [scanSessions, setScanSessions] = useState<any[]>([]);
  const [scanSessionsLoading, setScanSessionsLoading] = useState(false);
  const [historySessionId, setHistorySessionId] = useState<string | null>(null);
  const [scanHistoryOpen, setScanHistoryOpen] = useState(false);

  const itemsSectionRef = useRef<HTMLElement | null>(null);

  const { celebration, celebrate, dismiss } = useCelebration(`room-scan-${roomId}`);

  function withStatusBoardParam(path: string): string {
    if (!fromStatusBoard) return path;
    return `${path}${path.includes('?') ? '&' : '?'}from=status-board`;
  }

  async function loadScanSessions() {
    setScanSessionsLoading(true);
    try {
      const sessions = await listRoomScanSessions(propertyId, roomId, 8);
      setScanSessions(Array.isArray(sessions) ? sessions : []);
    } catch (error) {
      console.error('[RoomShowcaseClient] listRoomScanSessions failed', error);
      setScanSessions([]);
    } finally {
      setScanSessionsLoading(false);
    }
  }

  async function refresh() {
    setLoading(true);
    try {
      const [allRooms, insightData, roomItems] = await Promise.all([
        listInventoryRooms(propertyId),
        getRoomInsights(propertyId, roomId),
        listInventoryItems(propertyId, { roomId }),
      ]);

      setRooms(allRooms);
      setRoom(allRooms.find((r) => r.id === roomId) || null);

      const resolvedInsights = (insightData as any)?.data ?? insightData;
      setInsights(resolvedInsights);
      if (resolvedInsights) celebrate('scan');

      setItems(roomItems);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!propertyId || !roomId) return;
    refresh();
    loadScanSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, roomId]);

  const template = (insights?.room?.type || 'OTHER') as string;

  const quickWins = useMemo(() => {
    const normalized = String(template).toUpperCase();
    if (normalized === 'KITCHEN') return insights?.kitchen?.quickWins || [];
    if (normalized === 'LIVING_ROOM' || normalized === 'LIVING') return insights?.livingRoom?.quickWins || [];
    return [];
  }, [template, insights]);

  const healthScore = insights?.healthScore;

  const score = useMemo(() => {
    const backend = Number(healthScore?.score);
    if (Number.isFinite(backend)) return backend;
    return computeHealthScore(insights, items);
  }, [healthScore?.score, insights, items]);

  const stats = insights?.stats;

  const itemCount = Number(stats?.itemCount ?? items.length ?? 0);
  const docCount = Number(stats?.docsLinkedCount ?? 0);
  const gapCount = Number(stats?.coverageGapsCount ?? 0);
  const valueCount = items.filter((item) => Number(item.replacementCostCents || 0) > 0).length;

  const improvements = useMemo(() => {
    const source: Array<{ title?: string; detail?: string }> = asArray(healthScore?.improvements);

    return source
      .map((tip, index) => {
        const title = String(tip?.title || '').trim();
        if (!title) return null;

        return {
          id: `tip-${index}`,
          title,
          description: tip?.detail,
          ctaLabel: tipCtaLabel(title),
        };
      })
      .filter(Boolean) as Array<{ id: string; title: string; description?: string; ctaLabel: string }>;
  }, [healthScore?.improvements]);

  const scoreHistory = useMemo(() => {
    const history = scanSessions
      .slice()
      .reverse()
      .map((session) => {
        const value = Number(session?.healthScore?.score ?? session?.score ?? session?.meta?.score);
        return Number.isFinite(value) ? value : null;
      })
      .filter((v): v is number => Number.isFinite(v));

    if (history.length > 1) return history;
    return [score];
  }, [scanSessions, score]);

  function scrollToItems() {
    itemsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openItem(item: InventoryItem) {
    setEditingItem(item);
    setDrawerOpen(true);
  }

  function openItemById(itemId: string) {
    const found = items.find((item) => item.id === itemId);
    if (found) {
      openItem(found);
      return;
    }

    router.push(withStatusBoardParam(`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`));
  }

  async function onSaveRoomInlineValue(itemId: string, value: number) {
    const replacementCostCents = Math.round(value * 100);
    const updated = await updateInventoryItem(propertyId, itemId, { replacementCostCents });

    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return { ...item, ...updated };
      }),
    );
  }

  function handleTipAction(tip: { title: string }) {
    const normalized = tip.title.toLowerCase();
    if (normalized.includes('coverage')) {
      router.push(withStatusBoardParam(`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`));
      return;
    }
    if (normalized.includes('document')) {
      router.push(withStatusBoardParam(`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`));
      return;
    }
    if (normalized.includes('item') || normalized.includes('appliance')) {
      router.push(withStatusBoardParam(`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`));
      return;
    }
    if (normalized.includes('comfort')) {
      router.push(withStatusBoardParam(`/dashboard/properties/${propertyId}/inventory/rooms/${roomId}?tab=CHECKLIST`));
      return;
    }

    scrollToItems();
  }

  return (
    <>
      <MilestoneCelebration type={celebration.type} isOpen={celebration.isOpen} onClose={dismiss} />

      <div className="space-y-4 p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-6">
        <motion.div variants={sectionVariants} initial="hidden" animate="visible" custom={0}>
          <RoomPageHeader
            roomName={room?.name || insights?.room?.name || 'Room'}
            roomType={template}
            healthScore={score}
            itemCount={itemCount}
            gapCount={gapCount}
            docCount={docCount}
            backLabel={fromStatusBoard ? 'Back to Status Board' : 'Back'}
            onBack={() =>
              router.push(
                fromStatusBoard
                  ? `/dashboard/properties/${propertyId}/status-board`
                  : `/dashboard/properties/${propertyId}/rooms`,
              )
            }
            onItems={() => router.push(withStatusBoardParam(`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`))}
            onEdit={() => router.push(withStatusBoardParam(`/dashboard/properties/${propertyId}/inventory/rooms/${roomId}`))}
            onScan={() => setScanOpen(true)}
          />
        </motion.div>

        <RoomScanModal
          open={scanOpen}
          onClose={() => {
            setScanOpen(false);
            setHistorySessionId(null);
            loadScanSessions();
          }}
          propertyId={propertyId}
          roomId={roomId}
          roomName={room?.name}
          initialSessionId={historySessionId}
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="w-full space-y-4 xl:col-span-8">
            <motion.div variants={sectionVariants} initial="hidden" animate="visible" custom={1} className="w-full">
              <RoomIntelligenceCard
                healthScore={score}
                itemCount={itemCount}
                docCount={docCount}
                gapCount={gapCount}
                scoreHistory={scoreHistory}
                tips={improvements}
                onTipAction={handleTipAction}
                onScrollToItems={scrollToItems}
                onOpenAddDocument={() =>
                  router.push(withStatusBoardParam(`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`))
                }
                onScrollToGaps={() =>
                  router.push(withStatusBoardParam(`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`))
                }
              />
            </motion.div>

            <motion.section
              variants={sectionVariants}
              initial="hidden"
              animate="visible"
              custom={2}
              className="rounded-2xl border border-gray-200 bg-white p-4"
              ref={itemsSectionRef}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Items in this room</h2>
                  <p className="text-sm text-gray-500">Source of truth powering room insights</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    router.push(withStatusBoardParam(`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`))
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600 px-3 py-1.5 text-sm font-medium text-teal-600 transition-colors hover:bg-teal-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add item
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-2">
                {items.length === 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(withStatusBoardParam(`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`))
                    }
                    className="col-span-full rounded-xl border-2 border-dashed border-gray-200 p-6 text-left text-sm text-gray-500 transition-colors hover:border-teal-300 hover:bg-teal-50/30"
                  >
                    No items assigned to this room yet. Add your first item to unlock room insights.
                  </button>
                ) : (
                  items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      variant="room"
                      onClick={openItem}
                      onAddValue={onSaveRoomInlineValue}
                      onAttachDocument={openItemById}
                    />
                  ))
                )}
              </div>
            </motion.section>

            <motion.div variants={sectionVariants} initial="hidden" animate="visible" custom={3}>
              <QuickWins
                quickWins={quickWins}
                onAddItem={() =>
                  router.push(withStatusBoardParam(`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`))
                }
                onOpenChecklist={() =>
                  router.push(withStatusBoardParam(`/dashboard/properties/${propertyId}/inventory/rooms/${roomId}?tab=CHECKLIST`))
                }
              />
            </motion.div>

            <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={4} className="mt-6">
              <Collapsible open={scanHistoryOpen} onOpenChange={setScanHistoryOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-700">
                  <History className="h-4 w-4" />
                  Scan History
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${scanHistoryOpen ? 'rotate-180' : 'rotate-0'}`}
                  />
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-gray-500">Reopen a scan or export its drafts.</p>

                      <button
                        type="button"
                        onClick={loadScanSessions}
                        disabled={scanSessionsLoading}
                        className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 disabled:opacity-50"
                      >
                        {scanSessionsLoading ? 'Refreshing...' : 'Refresh'}
                      </button>
                    </div>

                    {scanSessions.length === 0 ? (
                      <p className="pl-1 text-sm text-gray-400">No scans yet. Run an AI Scan to analyze this room.</p>
                    ) : (
                      <div className="space-y-2">
                        {scanSessions.slice(0, 6).map((session) => {
                          const created = session?.createdAt ? new Date(session.createdAt) : null;
                          const label = created ? created.toLocaleString() : '-';
                          const counts = session?.counts || {};
                          const exportUrl = getDraftsCsvExportUrl({
                            propertyId,
                            scanSessionId: session.id,
                          });

                          return (
                            <div
                              key={session.id}
                              className="flex flex-col gap-3 rounded-xl border border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-gray-800">
                                  {label}
                                  <span className="ml-2 rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
                                    {String(session.status || '-')}
                                  </span>
                                </div>
                                <div className="mt-0.5 text-xs text-gray-500">
                                  Drafts: <span className="font-medium text-gray-700">{counts.drafts ?? 0}</span> - Images:{' '}
                                  <span className="font-medium text-gray-700">{counts.images ?? 0}</span>
                                </div>
                              </div>

                              <div className="flex w-full gap-2 sm:w-auto">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setHistorySessionId(session.id);
                                    setScanOpen(true);
                                  }}
                                  className="inline-flex min-h-[36px] flex-1 items-center justify-center rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 sm:flex-none"
                                >
                                  Reopen
                                </button>

                                <a
                                  href={exportUrl}
                                  className="inline-flex min-h-[36px] flex-1 items-center justify-center rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 sm:flex-none"
                                >
                                  Export CSV
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </motion.section>
          </div>

          <motion.div
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            custom={2}
            className="xl:col-span-4"
          >
            <div className="xl:sticky xl:top-6">
              <RoomAtAGlance
                itemCount={itemCount}
                gapCount={gapCount}
                docCount={docCount}
                valueCount={valueCount}
                onEditProfile={() =>
                  router.push(withStatusBoardParam(`/dashboard/properties/${propertyId}/inventory/rooms/${roomId}`))
                }
                onManageItems={() =>
                  router.push(withStatusBoardParam(`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`))
                }
              />

              {loading ? <p className="mt-2 text-xs text-gray-500">Updating room data...</p> : null}
            </div>
          </motion.div>
        </div>

        <InventoryItemDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          propertyId={propertyId}
          rooms={rooms}
          initialItem={editingItem}
          onSaved={async () => {
            setDrawerOpen(false);
            await refresh();
          }}
          existingItems={items}
        />
      </div>
    </>
  );
}
