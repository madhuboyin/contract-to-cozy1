// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/rooms/RoomsHubClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { InventoryRoom } from '@/types';
import { getRoomInsights, listInventoryRooms, patchRoomMeta } from '../../../inventory/inventoryApi';
import { SectionHeader } from '../../../components/SectionHeader';
import RoomScanModal from '@/app/(dashboard)/dashboard/components/inventory/RoomScanModal';
import OnboardingReturnBanner from '@/components/onboarding/OnboardingReturnBanner';
import RoomListCard from '@/components/rooms/RoomListCard';

function guessRoomType(name: string) {
  const t = (name || '').toLowerCase();
  if (t.includes('kitchen')) return 'KITCHEN';
  if (t.includes('living') || t.includes('family') || t.includes('great')) return 'LIVING_ROOM';
  if (t.includes('bed') || t.includes('master') || t.includes('guest') || t.includes('kids') || t.includes('nursery')) {
    return 'BEDROOM';
  }
  if (t.includes('bath') || t.includes('toilet') || t.includes('powder') || t.includes('wc')) return 'BATHROOM';
  if (t.includes('dining') || t.includes('breakfast') || t.includes('eat')) return 'DINING';
  if (t.includes('laundry') || t.includes('utility') || t.includes('washer') || t.includes('dryer')) return 'LAUNDRY';
  if (t.includes('garage')) return 'GARAGE';
  if (t.includes('office') || t.includes('study') || t.includes('den')) return 'OFFICE';
  if (t.includes('basement') || t.includes('cellar') || t.includes('lower level') || t.includes('lower-level')) {
    return 'BASEMENT';
  }
  return 'OTHER';
}

function computeHealthScore(insights: any): number {
  const stats = insights?.stats || {};
  const itemCount = Number(stats.itemCount || 0);
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

export default function RoomsHubClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [rooms, setRooms] = useState<InventoryRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [detectingId, setDetectingId] = useState<string | null>(null);

  const [roomInsights, setRoomInsights] = useState<Record<string, any>>({});
  const [insightsLoading, setInsightsLoading] = useState<Record<string, boolean>>({});

  const [scanOpen, setScanOpen] = useState(false);
  const [scanRoomId, setScanRoomId] = useState<string | null>(null);
  const [scanRoomName, setScanRoomName] = useState<string | null>(null);
  const [scanLaunchingId, setScanLaunchingId] = useState<string | null>(null);

  function openScan(room: InventoryRoom) {
    setScanLaunchingId(room.id);
    setScanRoomId(room.id);
    setScanRoomName(room.name || null);
    setScanOpen(true);

    window.setTimeout(() => {
      setScanLaunchingId((current) => (current === room.id ? null : current));
    }, 700);
  }

  async function refreshRooms() {
    setLoading(true);
    try {
      const result = await listInventoryRooms(propertyId);
      setRooms(result);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (propertyId) refreshRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const sorted = useMemo(
    () => [...rooms].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [rooms],
  );

  async function ensureType(room: InventoryRoom & { type?: string | null }) {
    if (room?.type) return;
    const inferred = guessRoomType(room.name);
    if (inferred === 'OTHER') return;

    setDetectingId(room.id);
    try {
      await patchRoomMeta(propertyId, room.id, { type: inferred });
      await refreshRooms();
    } catch {
      // non-blocking
    } finally {
      setDetectingId(null);
    }
  }

  async function loadInsight(roomId: string) {
    setInsightsLoading((prev) => ({ ...prev, [roomId]: true }));
    try {
      const data = await getRoomInsights(propertyId, roomId);
      const normalized = (data as any)?.data ?? data;
      setRoomInsights((prev) => ({ ...prev, [roomId]: normalized }));
    } catch {
      // keep empty on failure
    } finally {
      setInsightsLoading((prev) => ({ ...prev, [roomId]: false }));
    }
  }

  const sortedIdsKey = useMemo(() => sorted.map((room) => room.id).join(','), [sorted]);

  useEffect(() => {
    if (!propertyId || sorted.length === 0) return;

    const targets = sorted.slice(0, 12).map((room) => room.id);
    for (const id of targets) {
      if (roomInsights[id] || insightsLoading[id]) continue;
      loadInsight(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, sortedIdsKey]);

  const scoredRooms = useMemo(() => {
    return sorted
      .map((room) => {
        const insights = roomInsights[room.id];
        if (!insights) return null;

        const backendScore = Number(insights?.healthScore?.score);
        const score = Number.isFinite(backendScore) ? backendScore : computeHealthScore(insights);
        return { id: room.id, score };
      })
      .filter(Boolean) as Array<{ id: string; score: number }>;
  }, [roomInsights, sorted]);

  const overallHealth = useMemo(() => {
    if (scoredRooms.length === 0) return null;
    return Math.round(scoredRooms.reduce((sum, room) => sum + room.score, 0) / scoredRooms.length);
  }, [scoredRooms]);

  const lowestRoomName = useMemo(() => {
    if (scoredRooms.length === 0) return null;
    const lowest = scoredRooms.reduce((min, room) => (room.score < min.score ? room : min), scoredRooms[0]);
    return sorted.find((room) => room.id === lowest.id)?.name || null;
  }, [scoredRooms, sorted]);

  return (
    <div className="space-y-4 p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-6">
      <OnboardingReturnBanner />

      <div className="relative overflow-hidden rounded-[30px] border border-slate-200/70 bg-[radial-gradient(circle_at_8%_8%,rgba(251,191,36,0.14),transparent_40%),radial-gradient(circle_at_88%_12%,rgba(20,184,166,0.14),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.82))] p-4 shadow-[0_24px_50px_-36px_rgba(15,23,42,0.6)] dark:border-slate-700/70 dark:bg-[radial-gradient(circle_at_8%_8%,rgba(251,191,36,0.12),transparent_40%),radial-gradient(circle_at_88%_12%,rgba(20,184,166,0.12),transparent_38%),linear-gradient(180deg,rgba(2,6,23,0.88),rgba(2,6,23,0.78))]">
        <div className="sticky top-2 z-20 rounded-2xl border border-white/70 bg-white/55 p-3 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/45">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <SectionHeader
              icon="✨"
              title="Rooms"
              description="Select a room to see health, value snapshot, and quick wins."
            />
            <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:items-center">
              <Link
                href={`/dashboard/properties/${propertyId}/inventory/rooms`}
                className="inline-flex min-h-[46px] items-center justify-center rounded-xl border border-slate-300/70 bg-white/80 px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/55 dark:hover:bg-slate-900"
              >
                Manage rooms
              </Link>
              <Link
                href={`/dashboard/properties/${propertyId}/inventory`}
                className="inline-flex min-h-[46px] items-center justify-center rounded-xl border border-slate-300/70 bg-white/80 px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/55 dark:hover:bg-slate-900"
              >
                Back to inventory
              </Link>
            </div>
          </div>
        </div>
      </div>

      {overallHealth !== null ? (
        <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/75 via-amber-50/55 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-amber-950/20 dark:to-teal-950/20">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">Home Rooms Health</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900 dark:text-slate-100">{overallHealth}% cozy</p>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {lowestRoomName
                ? `Focus next on ${lowestRoomName} to lift your overall room score.`
                : 'Load room insights to see where quick wins are available.'}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className="rounded-2xl border border-white/70 bg-white/60 p-4 text-sm opacity-70 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/45">
            Loading rooms...
          </div>
        ) : null}

        {!loading && sorted.length === 0 ? (
          <div className="rounded-2xl border border-white/70 bg-white/60 p-4 text-sm opacity-70 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/45">
            No rooms yet. Create rooms in{' '}
            <Link className="underline" href={`/dashboard/properties/${propertyId}/inventory/rooms`}>
              Manage rooms
            </Link>
            .
          </div>
        ) : null}

        {sorted.map((room) => {
          const roomWithType = room as InventoryRoom & { type?: string | null };
          const inferredType = roomWithType.type ? null : guessRoomType(room.name);
          const showDetect = !roomWithType.type && inferredType !== 'OTHER';

          const insights = roomInsights[room.id];
          const stats = insights?.stats;

          const backendScore = Number(insights?.healthScore?.score);
          const score = insights
            ? Number.isFinite(backendScore)
              ? backendScore
              : computeHealthScore(insights)
            : 0;

          const itemCount = Number(stats?.itemCount ?? 0);
          const docCount = Number(stats?.docsLinkedCount ?? 0);
          const gapCount = Number(stats?.coverageGapsCount ?? 0);
          const hasValues = Number(stats?.replacementTotalCents ?? 0) > 0;
          const completenessPercent = (itemCount > 0 ? 33 : 0) + (docCount > 0 ? 33 : 0) + (hasValues ? 34 : 0);

          const headerActions = (
            <div className="flex flex-wrap items-center gap-2">
              {showDetect ? (
                <button
                  type="button"
                  onClick={() => ensureType(roomWithType)}
                  disabled={detectingId === room.id}
                  className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900 disabled:opacity-50"
                  title="Auto-detect room template from name"
                >
                  {detectingId === room.id ? 'Detecting...' : 'Apply type'}
                </button>
              ) : null}

              {!insights && !insightsLoading[room.id] ? (
                <button
                  type="button"
                  onClick={() => loadInsight(room.id)}
                  className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900"
                >
                  Load health score
                </button>
              ) : null}

              {insightsLoading[room.id] ? <span className="text-xs text-gray-500">Loading insights...</span> : null}
            </div>
          );

          return (
            <RoomListCard
              key={room.id}
              propertyId={propertyId}
              roomId={room.id}
              roomName={room.name}
              roomType={roomWithType.type || inferredType}
              healthScore={score}
              itemCount={itemCount}
              docCount={docCount}
              gapCount={gapCount}
              completenessPercent={completenessPercent}
              loading={insightsLoading[room.id]}
              onScan={() => openScan(room)}
              scanLaunching={scanLaunchingId === room.id}
              headerAction={headerActions}
            />
          );
        })}
      </div>

      {scanRoomId ? (
        <RoomScanModal
          open={scanOpen}
          onClose={() => {
            setScanOpen(false);
            setScanRoomId(null);
            setScanRoomName(null);
          }}
          propertyId={propertyId}
          roomId={scanRoomId}
          roomName={scanRoomName}
        />
      ) : null}
    </div>
  );
}
