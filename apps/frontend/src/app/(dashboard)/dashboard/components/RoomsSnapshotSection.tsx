'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Bath,
  BedDouble,
  Briefcase,
  Car,
  ChevronLeft,
  ChevronRight,
  FileText,
  Home,
  LayoutGrid,
  Package,
  Shirt,
  Sofa,
  UtensilsCrossed,
  Warehouse,
} from 'lucide-react';
import { getRoomInsights, listInventoryRooms } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import RoomHealthScoreRing from '@/components/rooms/RoomHealthScoreRing';
import type { InventoryRoom } from '@/types';

interface RoomsSnapshotSectionProps {
  propertyId?: string;
}

type WhyFactor = {
  label: string;
  detail?: string;
  impact?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
};

type RoomOperationalInsight = {
  summary: string;
  implication: string;
};

function safeString(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s.length > 0 ? s : null;
}

function normalizeImpact(v: unknown): 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | undefined {
  const up = String(v ?? '').toUpperCase();
  if (up === 'POSITIVE' || up === 'NEGATIVE' || up === 'NEUTRAL') return up;
  return undefined;
}

function buildWhyFactors(insights: any): WhyFactor[] {
  const raw = Array.isArray(insights?.healthScore?.factors) ? insights.healthScore.factors : [];

  return raw
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
    .filter(Boolean) as WhyFactor[];
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

function deriveLabel(score: number): string {
  if (score >= 80) return 'HEALTHY';
  if (score >= 40) return 'NEEDS ATTENTION';
  return 'AT RISK';
}

function statusPillClass(label: string): string {
  if (label === 'HEALTHY') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (label === 'NEEDS ATTENTION') return 'bg-amber-50 text-amber-700 border border-amber-200';
  return 'bg-red-50 text-red-700 border border-red-200';
}

/**
 * Builds one compact decision insight for the room card:
 * what is happening + what to do next.
 */
function buildRoomInsight(
  score: number,
  itemCount: number,
  docsCount: number,
  gapCount: number,
  whyFactors: WhyFactor[],
): RoomOperationalInsight {
  // Use top negative why-factor if available
  const topNegative = whyFactors.find((f) => f.impact === 'NEGATIVE');
  if (topNegative) {
    const raw = `${topNegative.label} ${topNegative.detail ?? ''}`.toLowerCase();
    if (raw.includes('moisture') || raw.includes('leak') || raw.includes('water')) {
      return {
        summary: 'Moisture watch item detected',
        implication: 'Inspect source areas soon and document any change.',
      };
    }
    if (raw.includes('filter')) {
      return {
        summary: 'Filter replacement may be due soon',
        implication: 'Plan a quick service check to keep performance stable.',
      };
    }
    return {
      summary: topNegative.detail || topNegative.label,
      implication: 'Open room details to review the highest-impact next step.',
    };
  }

  // Stats-based insight
  if (gapCount > 0) {
    return {
      summary: `${gapCount} coverage gap${gapCount === 1 ? '' : 's'} detected`,
      implication: 'Review protected items before the next claim scenario.',
    };
  }
  if (docsCount === 0 && itemCount > 0) {
    return {
      summary: 'Warranty docs are missing',
      implication: 'Upload key documents to improve claim readiness.',
    };
  }
  if (itemCount < 3) {
    return {
      summary: 'Inventory detail is still light',
      implication: 'Add key items to improve room-level tracking accuracy.',
    };
  }

  // Healthy state
  if (score >= 80) {
    return {
      summary: 'No active issues',
      implication: 'Keep checklist and documents current to maintain this status.',
    };
  }
  if (score < 40) {
    return {
      summary: 'Room health is slipping',
      implication: 'Review this room for the most urgent maintenance task.',
    };
  }
  return {
    summary: 'A few watch items are emerging',
    implication: 'Check room timeline and complete one preventive action.',
  };
}

function guessRoomType(name: string): string {
  const normalized = (name || '').toLowerCase();
  if (normalized.includes('kitchen')) return 'KITCHEN';
  if (normalized.includes('living') || normalized.includes('family') || normalized.includes('great')) return 'LIVING_ROOM';
  if (normalized.includes('bed') || normalized.includes('master') || normalized.includes('guest') || normalized.includes('kids')) return 'BEDROOM';
  if (normalized.includes('bath') || normalized.includes('toilet') || normalized.includes('powder')) return 'BATHROOM';
  if (normalized.includes('laundry') || normalized.includes('utility')) return 'LAUNDRY';
  if (normalized.includes('office') || normalized.includes('study') || normalized.includes('den')) return 'OFFICE';
  if (normalized.includes('garage')) return 'GARAGE';
  if (normalized.includes('basement') || normalized.includes('cellar')) return 'BASEMENT';
  return 'OTHER';
}

function roomIconFor(type: string) {
  switch (type) {
    case 'KITCHEN': return UtensilsCrossed;
    case 'LIVING_ROOM': return Sofa;
    case 'BEDROOM': return BedDouble;
    case 'BATHROOM': return Bath;
    case 'LAUNDRY': return Shirt;
    case 'OFFICE': return Briefcase;
    case 'GARAGE': return Car;
    case 'BASEMENT': return Warehouse;
    default: return Home;
  }
}

function isRateLimitedError(error: unknown): boolean {
  const candidate = error as { status?: number | string; message?: string } | undefined;
  if (!candidate) return false;
  if (candidate.status === 429 || candidate.status === '429') return true;
  return String(candidate.message || '').toLowerCase().includes('too many requests');
}

export function RoomsSnapshotSection({ propertyId }: RoomsSnapshotSectionProps) {
  const [rooms, setRooms] = React.useState<InventoryRoom[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [roomInsights, setRoomInsights] = React.useState<Record<string, any>>({});
  const [insightsLoading, setInsightsLoading] = React.useState<Record<string, boolean>>({});
  const scrollerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!propertyId) {
      setRooms([]);
      setLoading(false);
      setError(null);
      setRoomInsights({});
      setInsightsLoading({});
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setRoomInsights({});
    setInsightsLoading({});

    listInventoryRooms(propertyId)
      .then((result) => {
        if (cancelled) return;
        const sorted = [...result].sort((a, b) => {
          const byOrder = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
          if (byOrder !== 0) return byOrder;
          return String(a.name || '').localeCompare(String(b.name || ''));
        });
        setRooms(sorted);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          isRateLimitedError(err)
            ? 'Too many requests right now. Please wait a moment and try again.'
            : 'Unable to load rooms right now.'
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [propertyId]);

  React.useEffect(() => {
    if (!propertyId || rooms.length === 0) return;

    let cancelled = false;

    const fetchInsights = async () => {
      const loadingMap: Record<string, boolean> = {};
      for (const room of rooms) loadingMap[room.id] = true;
      setInsightsLoading(loadingMap);

      const results = await Promise.allSettled(
        rooms.map(async (room) => {
          const data = await getRoomInsights(propertyId, room.id);
          const normalized = (data as any)?.data ?? data;
          return { roomId: room.id, data: normalized };
        })
      );

      if (cancelled) return;

      const nextInsights: Record<string, any> = {};
      const nextLoading: Record<string, boolean> = {};
      for (const room of rooms) nextLoading[room.id] = false;

      for (const result of results) {
        if (result.status === 'fulfilled') {
          nextInsights[result.value.roomId] = result.value.data;
        }
      }

      setRoomInsights(nextInsights);
      setInsightsLoading(nextLoading);
    };

    fetchInsights();

    return () => { cancelled = true; };
  }, [propertyId, rooms]);

  const scrollBy = (direction: 'left' | 'right') => {
    if (!scrollerRef.current) return;
    const delta = direction === 'left' ? -420 : 420;
    scrollerRef.current.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const roomsHubHref = propertyId
    ? `/dashboard/properties/${propertyId}/rooms`
    : '/dashboard/properties';
  const roomsManageHref = propertyId
    ? `/dashboard/properties/${propertyId}/inventory/rooms`
    : '/dashboard/properties';

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <LayoutGrid className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Rooms</h2>
            <p className="text-sm text-gray-500">Room-level health with one clear cue per room.</p>
          </div>
        </div>

        {rooms.length > 0 && (
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => scrollBy('left')}
              className="p-2 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
              aria-label="Scroll rooms left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scrollBy('right')}
              className="p-2 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
              aria-label="Scroll rooms right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
          Loading rooms…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : rooms.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-base font-semibold text-gray-900">No rooms configured yet</h3>
          <p className="text-sm text-gray-600 mt-1">
            Add rooms to unlock room-level health scores, coverage tracking, and AI scan workflows.
          </p>
          <div className="mt-4">
            <Link
              href={roomsManageHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Set up rooms
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={scrollerRef}
            className="flex gap-4 overflow-x-auto pb-2 no-scrollbar snap-x scroll-smooth"
          >
            {rooms.map((room) => {
              const rawType = safeString((room as InventoryRoom & { type?: string }).type);
              const roomType = rawType || guessRoomType(room.name || '');
              const RoomIcon = roomIconFor(roomType);
              const insights = roomInsights[room.id];
              const stats = insights?.stats;
              const backendScore = Number(insights?.healthScore?.score);
              const score = insights
                ? (Number.isFinite(backendScore) ? backendScore : computeHealthScore(insights))
                : 0;
              const statusLabel = safeString(insights?.healthScore?.label) || deriveLabel(score);
              const whyFactors = insights ? buildWhyFactors(insights) : [];
              const itemCount = Number(stats?.itemCount ?? 0);
              const docsCount = Number(stats?.docsLinkedCount ?? 0);
              const gapCount = Number(stats?.coverageGapsCount ?? 0);
              const roomHref = `/dashboard/properties/${propertyId}/rooms/${room.id}`;
              const roomInsight = insights
                ? buildRoomInsight(score, itemCount, docsCount, gapCount, whyFactors)
                : null;

              return (
                <div
                  key={room.id}
                  className="snap-start min-w-[86%] sm:min-w-[70%] md:min-w-[calc((100%-1rem)/2)] lg:min-w-[calc((100%-2rem)/3)] flex-shrink-0 rounded-2xl border border-white/60 bg-white/85 p-4 shadow-sm backdrop-blur-sm will-change-transform transform-gpu"
                >
                  {/* Room header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <RoomIcon className="w-4 h-4 text-gray-500 shrink-0" />
                      <p className="text-base font-semibold text-gray-900 truncate">
                        {room.name || 'Unnamed room'}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${statusPillClass(statusLabel)}`}>
                      {statusLabel}
                    </span>
                  </div>

                  {/* Score + insight */}
                  <div className="mt-3 rounded-xl border border-black/10 bg-black/[0.02] p-3">
                    {insightsLoading[room.id] ? (
                      <div className="text-sm text-gray-400">Loading insights…</div>
                    ) : insights ? (
                      <div className="flex items-center gap-3">
                        <RoomHealthScoreRing
                          value={score}
                          size={56}
                          strokeWidth={8}
                          ringOnly
                          animateMs={600}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          {/* Insight text */}
                          {roomInsight ? (
                            <>
                              <p className="line-clamp-2 text-xs font-semibold text-gray-800 leading-snug">
                                {roomInsight.summary}
                              </p>
                              <p className="line-clamp-2 text-[11px] text-gray-600 leading-snug">
                                {roomInsight.implication}
                              </p>
                            </>
                          ) : null}
                          {/* Quick stats */}
                          <div className="flex flex-wrap gap-2 text-[11px] text-gray-500">
                            <span className="inline-flex items-center gap-0.5">
                              <Package className="h-3 w-3" />
                              {itemCount} items
                            </span>
                            <span className="inline-flex items-center gap-0.5">
                              <FileText className="h-3 w-3" />
                              {docsCount} docs
                            </span>
                            {gapCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-amber-600">
                                <AlertCircle className="h-3 w-3" />
                                {gapCount} gap{gapCount === 1 ? '' : 's'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">No insights yet — add items to get started.</p>
                    )}
                  </div>

                  {/* Explicit CTA */}
                  <div className="mt-3">
                    <Link
                      href={roomHref}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-brand-600/30 px-2.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
                    >
                      Open room details
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3">
            <Link
              href={roomsHubHref}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-brand-600 px-4 py-2 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
            >
              View all rooms
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
