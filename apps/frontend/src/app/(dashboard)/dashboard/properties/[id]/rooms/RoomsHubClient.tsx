// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/rooms/RoomsHubClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Lightbulb, Sparkles } from 'lucide-react';

import { InventoryRoom } from '@/types';
import { listInventoryRooms, patchRoomMeta, getRoomInsights } from '../../../inventory/inventoryApi';
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
      panel:
        'from-emerald-400/10 via-slate-900/60 to-teal-400/10 border-emerald-300/30',
      status: 'text-emerald-300',
      label: 'HEALTHY',
    };
  }
  if (score >= 50) {
    return {
      panel:
        'from-amber-400/10 via-slate-900/60 to-yellow-300/10 border-amber-300/30',
      status: 'text-amber-300',
      label: 'NEEDS ATTENTION',
    };
  }
  return {
    panel:
      'from-orange-400/10 via-slate-900/60 to-rose-400/10 border-rose-300/30',
    status: 'text-orange-300',
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
    <div className="dark relative isolate space-y-5 p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] text-slate-100 sm:p-6 lg:pb-6">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[36px] bg-[#06090f]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_10%,rgba(251,146,60,0.28),transparent_34%),radial-gradient(circle_at_84%_16%,rgba(56,189,248,0.22),transparent_36%),radial-gradient(circle_at_52%_86%,rgba(251,191,36,0.14),transparent_42%),linear-gradient(145deg,#070b14_0%,#0d1622_52%,#101824_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(125deg,rgba(255,255,255,0.06)_0%,transparent_34%,rgba(255,255,255,0.03)_100%)]" />
      </div>

      <OnboardingReturnBanner />

      <div className="relative overflow-hidden rounded-[30px] border border-white/15 bg-[radial-gradient(circle_at_10%_0%,rgba(251,191,36,0.18),transparent_36%),radial-gradient(circle_at_86%_6%,rgba(45,212,191,0.2),transparent_40%),linear-gradient(150deg,rgba(15,23,42,0.82),rgba(17,24,39,0.68))] p-4 shadow-[0_30px_65px_-44px_rgba(2,6,23,0.95)]">
        <div className="sticky top-2 z-20 rounded-2xl border border-white/20 bg-slate-950/38 p-3 backdrop-blur-2xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.34)]">
                <span className="text-xl">✨</span>
              </div>
              <div className="min-w-0">
                <h2 className="text-[1.85rem] font-semibold tracking-tight text-white">Rooms</h2>
                <p className="mt-1 text-sm text-slate-300/90">
                  Select a room to see health, value snapshot, and quick wins.
                </p>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:items-center">
              <Link
                href={`/dashboard/properties/${propertyId}/inventory/rooms`}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/22 bg-white/10 px-4 py-2 text-sm font-medium text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-md transition-all hover:bg-white/16"
              >
                Manage rooms
              </Link>
              <Link
                href={`/dashboard/properties/${propertyId}/inventory`}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/22 bg-white/10 px-4 py-2 text-sm font-medium text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-md transition-all hover:bg-white/16"
              >
                Back to inventory
              </Link>
            </div>
          </div>
        </div>
      </div>

      {overallHealth !== null && (
        <div className="rounded-2xl border border-white/15 bg-[radial-gradient(circle_at_0%_0%,rgba(251,146,60,0.15),transparent_38%),radial-gradient(circle_at_100%_20%,rgba(45,212,191,0.2),transparent_40%),linear-gradient(132deg,rgba(15,23,42,0.66),rgba(15,23,42,0.5))] p-4 shadow-[0_20px_36px_-30px_rgba(2,6,23,0.9)] backdrop-blur-2xl">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-300/85">Home Rooms Health</p>
              <p className="mt-1 text-3xl font-semibold text-white">{overallHealth}% cozy</p>
            </div>
            <p className="text-sm text-slate-200/90">
              {lowestRoomName
                ? `Focus next on ${lowestRoomName} to lift your overall room score.`
                : 'Load room insights to see where quick wins are available.'}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {loading && (
          <div className="rounded-2xl border border-white/20 bg-slate-900/45 p-4 text-sm text-slate-200 opacity-80 backdrop-blur-xl">
            Loading rooms…
          </div>
        )}

        {!loading && sorted.length === 0 && (
          <div className="rounded-2xl border border-white/20 bg-slate-900/45 p-4 text-sm text-slate-200 opacity-85 backdrop-blur-xl">
            No rooms yet. Create rooms in{' '}
            <Link className="underline decoration-white/70 underline-offset-2" href={`/dashboard/properties/${propertyId}/inventory/rooms`}>
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
              className="group flex flex-col rounded-2xl border border-white/16 bg-[radial-gradient(circle_at_5%_0%,rgba(251,146,60,0.16),transparent_32%),radial-gradient(circle_at_100%_14%,rgba(56,189,248,0.13),transparent_36%),linear-gradient(152deg,rgba(15,23,42,0.74),rgba(15,23,42,0.58))] p-4 shadow-[0_22px_40px_-30px_rgba(2,6,23,0.95)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-white/24 hover:shadow-[0_26px_48px_-30px_rgba(2,6,23,0.95)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/14 text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]">
                      {getRoomGlyph(r.type || inferred)}
                    </span>
                    <div className="truncate text-[1.1rem] font-semibold text-white">{r.name}</div>
                  </div>
                </div>

                {showDetect && (
                  <button
                    onClick={() => ensureType(r)}
                    disabled={detectingId === r.id}
                    className="rounded-full border border-white/24 bg-white/10 px-2.5 py-1 text-xs text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] transition-colors hover:bg-white/16 disabled:opacity-50"
                    title="Auto-detect room template from name"
                  >
                    {detectingId === r.id ? 'Detecting…' : 'Apply'}
                  </button>
                )}
              </div>

              <div className={`mt-4 rounded-2xl border bg-gradient-to-br p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] ${scoreTone(score).panel}`}>
                {insightsLoading[r.id] ? (
                  <div className="text-sm text-slate-200 opacity-80">Loading insights…</div>
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
                      <div className="flex items-start gap-1.5 text-xs text-slate-200">
                        <Lightbulb className="mt-0.5 h-3.5 w-3.5 text-amber-500" />
                        <span className="italic text-slate-300">
                          Tip:{' '}
                          <span className="font-medium text-white">
                            {String(improvements[0].title)}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => loadInsight(r.id)}
                    className="rounded-xl border border-white/24 bg-white/10 px-3 py-2 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] transition-colors hover:bg-white/16"
                  >
                    Load health score
                  </button>
                )}
              </div>

              <div className="mt-4 mt-auto overflow-x-auto">
                <div className="flex w-max items-center gap-2">
                  <Link
                    href={`/dashboard/properties/${propertyId}/rooms/${r.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-white/24 bg-white/10 px-4 text-sm font-medium text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] transition-colors hover:bg-white/16"
                  >
                    View
                  </Link>

                  <Link
                    href={`/dashboard/properties/${propertyId}/inventory/rooms/${r.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-white/24 bg-white/10 px-4 text-sm font-medium text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] transition-colors hover:bg-white/16"
                  >
                    Edit
                  </Link>

                  <Link
                    href={`/dashboard/properties/${propertyId}/inventory?roomId=${r.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-white/24 bg-white/10 px-4 text-sm font-medium text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] transition-colors hover:bg-white/16"
                  >
                    Items
                  </Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openScan(r);
                    }}
                    className="inline-flex h-10 items-center justify-center gap-1 rounded-full border border-white/24 bg-white/10 px-4 text-sm font-medium text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] transition-colors hover:bg-white/16"
                  >
                    <Sparkles className={`h-3.5 w-3.5 ${scanLaunchingId === r.id ? 'animate-pulse text-amber-300' : 'text-teal-300'}`} />
                    {scanLaunchingId === r.id ? 'Launching…' : 'AI Scan'}
                  </button>
                </div>
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
