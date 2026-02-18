// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/rooms/RoomsHubClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Lightbulb, Sparkles } from 'lucide-react';

import { InventoryRoom } from '@/types';
import { listInventoryRooms, patchRoomMeta, getRoomInsights } from '../../../inventory/inventoryApi';
import { SectionHeader } from '../../../components/SectionHeader';
import RoomHealthScoreRing from '@/components/rooms/RoomHealthScoreRing';
import RoomScanModal from '@/app/(dashboard)/dashboard/components/inventory/RoomScanModal';
import OnboardingReturnBanner from '@/components/onboarding/OnboardingReturnBanner';


function guessRoomType(name: string) {
  const t = (name || '').toLowerCase();
  if (t.includes('kitchen')) return 'KITCHEN';
  if (t.includes('living') || t.includes('family') || t.includes('great')) return 'LIVING_ROOM';
  if (t.includes('bed') || t.includes('master') || t.includes('guest') || t.includes('kids') || t.includes('nursery'))
    return 'BEDROOM';
  if (t.includes('bath') || t.includes('toilet') || t.includes('powder') || t.includes('wc')) return 'BATHROOM';
  if (t.includes('dining') || t.includes('breakfast') || t.includes('eat')) return 'DINING';
  if (t.includes('laundry') || t.includes('utility') || t.includes('washer') || t.includes('dryer')) return 'LAUNDRY';
  if (t.includes('garage')) return 'GARAGE';
  if (t.includes('office') || t.includes('study') || t.includes('den')) return 'OFFICE';
  if (t.includes('basement') || t.includes('cellar') || t.includes('lower level') || t.includes('lower-level'))
    return 'BASEMENT';
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
function asArray<T = any>(v: any): T[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v) as T[];
  return [];
}
function safeString(v: any): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

function normalizeImpact(v: any): 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | undefined {
  const up = String(v ?? '').toUpperCase();
  if (up === 'POSITIVE' || up === 'NEGATIVE' || up === 'NEUTRAL') return up as any;
  return undefined;
}

function buildWhyFactors(insights: any) {
  const raw = asArray((insights as any)?.healthScore?.factors);

  // only keep meaningful factors (no placeholders)
  const out = raw
    .map((f: any) => {
      const label = safeString(f?.label || f?.key);
      const detail = safeString(f?.detail);
      if (!label && !detail) return null;

      return {
        label: label || 'Factor',
        detail: detail || undefined,
        impact: normalizeImpact(f?.impact),
      };
    })
    .filter(Boolean) as Array<{ label: string; detail?: string; impact?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' }>;

  return out;
}

function getRoomGlyph(type?: string | null) {
  switch ((type || 'OTHER').toUpperCase()) {
    case 'BEDROOM':
      return '🛏️';
    case 'KITCHEN':
      return '🍳';
    case 'LAUNDRY':
      return '🧺';
    case 'LIVING_ROOM':
      return '🛋️';
    case 'BATHROOM':
      return '🛁';
    case 'DINING':
      return '🍽️';
    case 'OFFICE':
      return '💼';
    case 'GARAGE':
      return '🚗';
    case 'BASEMENT':
      return '🏚️';
    default:
      return '🏠';
  }
}

function scoreTone(score: number) {
  if (score >= 75) {
    return {
      panel: 'from-emerald-50/90 via-white/80 to-teal-50/70 border-emerald-200/60',
      status: 'text-emerald-700',
      label: 'HEALTHY',
    };
  }
  if (score >= 50) {
    return {
      panel: 'from-amber-50/90 via-white/80 to-yellow-50/70 border-amber-200/60',
      status: 'text-amber-700',
      label: 'NEEDS ATTENTION',
    };
  }
  return {
    panel: 'from-orange-50/90 via-white/80 to-rose-50/70 border-rose-200/60',
    status: 'text-orange-700',
    label: 'AT RISK',
  };
}

export default function RoomsHubClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [rooms, setRooms] = useState<InventoryRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [detectingId, setDetectingId] = useState<string | null>(null);

  // insights cache per room
  const [roomInsights, setRoomInsights] = useState<Record<string, any>>({});
  const [insightsLoading, setInsightsLoading] = useState<Record<string, boolean>>({});

  const [scanOpen, setScanOpen] = useState(false);
  const [scanRoomId, setScanRoomId] = useState<string | null>(null);
  const [scanRoomName, setScanRoomName] = useState<string | null>(null);
  const [scanLaunchingId, setScanLaunchingId] = useState<string | null>(null);

  function openScan(room: any) {
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
      const r = await listInventoryRooms(propertyId);
      setRooms(r);
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
    [rooms]
  );

  async function ensureType(room: any) {
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
    setInsightsLoading((m) => ({ ...m, [roomId]: true }));
    try {
      const data = await getRoomInsights(propertyId, roomId);
      const normalized = (data as any)?.data ?? data;
      setRoomInsights((m) => ({ ...m, [roomId]: normalized }));
    } catch {
      // keep empty
    } finally {
      setInsightsLoading((m) => ({ ...m, [roomId]: false }));
    }
  }

  // Lazy-load insights after rooms load (avoids blocking)
  const sortedIdsKey = useMemo(() => sorted.map((r) => r.id).join(','), [sorted]);
  useEffect(() => {
    if (!propertyId || sorted.length === 0) return;

    // load first 12 rooms by default (enough for most homes)
    const targets = sorted.slice(0, 12).map((r) => r.id);
    for (const id of targets) {
      if (roomInsights[id] || insightsLoading[id]) continue;
      loadInsight(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, sortedIdsKey]);

  const scoredRooms = useMemo(() => {
    return sorted
      .map((room: any) => {
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
    return Math.round(scoredRooms.reduce((sum, s) => sum + s.score, 0) / scoredRooms.length);
  }, [scoredRooms]);

  const lowestRoomName = useMemo(() => {
    if (scoredRooms.length === 0) return null;
    const low = scoredRooms.reduce((min, cur) => (cur.score < min.score ? cur : min), scoredRooms[0]);
    return sorted.find((r) => r.id === low.id)?.name || null;
  }, [scoredRooms, sorted]);

  return (
    <div className="p-4 sm:p-6 space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-6">
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

      {overallHealth !== null && (
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
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {loading && (
          <div className="rounded-2xl border border-white/70 bg-white/60 p-4 text-sm opacity-70 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/45">
            Loading rooms…
          </div>
        )}

        {!loading && sorted.length === 0 && (
          <div className="rounded-2xl border border-white/70 bg-white/60 p-4 text-sm opacity-70 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/45">
            No rooms yet. Create rooms in{' '}
            <Link className="underline" href={`/dashboard/properties/${propertyId}/inventory/rooms`}>
              Manage rooms
            </Link>
            .
          </div>
        )}

        {sorted.map((r: any) => {
          const inferred = r.type ? null : guessRoomType(r.name);
          const showDetect = !r.type && inferred !== 'OTHER';     
            
          const insights = roomInsights[r.id];
          const stats = insights?.stats;

          const backendScore = Number(insights?.healthScore?.score);
          const score = insights
            ? (Number.isFinite(backendScore) ? backendScore : computeHealthScore(insights))
            : 0;

          const whyFactors = insights ? buildWhyFactors(insights) : [];

          const improvements = Array.isArray(insights?.healthScore?.improvements)
            ? insights.healthScore.improvements
            : [];


          return (
            <div
              key={r.id}
              className="group flex flex-col rounded-2xl border border-white/70 bg-gradient-to-br from-[#fff7ef]/85 via-white/80 to-[#eef7f2]/70 p-4 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_36px_-24px_rgba(15,23,42,0.6)] dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/45 dark:to-slate-900/35"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/75 text-base shadow-sm dark:bg-slate-800/70">
                      {getRoomGlyph(r.type || inferred)}
                    </span>
                    <div className="font-semibold truncate text-[1.1rem] text-slate-900 dark:text-slate-100">{r.name}</div>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                    {r.type ? (
                      <>Template: <span className="font-medium">{r.type}</span></>
                    ) : showDetect ? (
                      <>
                        Template not set · Suggested: <span className="font-medium">{inferred}</span>
                      </>
                    ) : (
                      <>Template not set</>
                    )}
                  </div>
                </div>

                {showDetect && (
                  <button
                    onClick={() => ensureType(r)}
                    disabled={detectingId === r.id}
                    className="rounded-full border border-slate-300/70 bg-white/80 px-2.5 py-1 text-xs shadow-sm transition-colors hover:bg-white disabled:opacity-50 dark:border-slate-700/70 dark:bg-slate-900/60 dark:hover:bg-slate-900"
                    title="Auto-detect room template from name"
                  >
                    {detectingId === r.id ? 'Detecting…' : 'Apply'}
                  </button>
                )}
              </div>

              <div className={`mt-4 rounded-2xl border bg-gradient-to-br p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] ${scoreTone(score).panel} dark:from-slate-900/60 dark:to-slate-900/40`}>
                {insightsLoading[r.id] ? (
                  <div className="text-sm opacity-70">Loading insights…</div>
                ) : insights ? (
                  <div className="space-y-2">
                    <RoomHealthScoreRing
                      value={score}
                      size={96}
                      strokeWidth={14}
                      label={scoreTone(score).label}
                      sublabel={`${stats?.itemCount ?? 0} items · ${stats?.docsLinkedCount ?? 0} docs · ${stats?.coverageGapsCount ?? 0} gaps`}
                      whyTitle="Why this score?"
                      whyFactors={whyFactors}
                    />

                    {improvements.length > 0 && safeString(improvements?.[0]?.title) && (
                      <div className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                        <Lightbulb className="mt-0.5 h-3.5 w-3.5 text-amber-500" />
                        <span className="italic">
                          Tip:{' '}
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {String(improvements[0].title)}
                        </span>
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => loadInsight(r.id)}
                    className="rounded-xl border border-slate-300/70 bg-white/85 px-3 py-2 text-sm shadow-sm transition-colors hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/60 dark:hover:bg-slate-900"
                  >
                    Load health score
                  </button>
                )}
              </div>

              <div className="mt-4 mt-auto grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
                <Link
                  href={`/dashboard/properties/${propertyId}/rooms/${r.id}`}
                  className="inline-flex min-h-[46px] items-center justify-center rounded-xl border border-teal-300/70 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:-translate-y-0.5 hover:from-emerald-700 hover:to-teal-700"
                >
                  View room
                </Link>

                <Link
                  href={`/dashboard/properties/${propertyId}/inventory/rooms/${r.id}`}
                  className="inline-flex min-h-[46px] items-center justify-center rounded-xl border border-slate-300/70 bg-white/80 px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/55 dark:hover:bg-slate-900"
                >
                  Edit
                </Link>

                <Link
                  href={`/dashboard/properties/${propertyId}/inventory?roomId=${r.id}`}
                  className="inline-flex min-h-[46px] items-center justify-center rounded-xl border border-slate-300/70 bg-white/80 px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/55 dark:hover:bg-slate-900"
                >
                  Items
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openScan(r);
                  }}
                  className="inline-flex min-h-[46px] items-center justify-center gap-1 rounded-xl border border-slate-300/70 bg-white/80 px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/55 dark:hover:bg-slate-900"
                >
                  <Sparkles className={`h-3.5 w-3.5 ${scanLaunchingId === r.id ? 'animate-pulse text-amber-500' : 'text-teal-600 dark:text-teal-300'}`} />
                  {scanLaunchingId === r.id ? 'Launching…' : 'AI Scan'}
                </button>

              </div>
            </div>
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
