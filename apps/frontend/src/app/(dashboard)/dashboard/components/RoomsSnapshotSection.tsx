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

function roomTip(itemCount: number, docsCount: number, gapCount: number): string {
  if (docsCount === 0) return '0 docs → Upload your appliance warranties';
  if (gapCount > 0) return `${gapCount} gaps → Add purchase receipts for tracked items`;
  if (itemCount < 3) return `${itemCount} items → Add key appliances to improve visibility`;
  return 'Keep inventory details current to maintain room health.';
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
    case 'KITCHEN':
      return UtensilsCrossed;
    case 'LIVING_ROOM':
      return Sofa;
    case 'BEDROOM':
      return BedDouble;
    case 'BATHROOM':
      return Bath;
    case 'LAUNDRY':
      return Shirt;
    case 'OFFICE':
      return Briefcase;
    case 'GARAGE':
      return Car;
    case 'BASEMENT':
      return Warehouse;
    default:
      return Home;
  }
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
      .catch(() => {
        if (cancelled) return;
        setError('Unable to load rooms right now.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  React.useEffect(() => {
    if (!propertyId || rooms.length === 0) return;

    let cancelled = false;

    const fetchInsights = async () => {
      const loadingMap: Record<string, boolean> = {};
      for (const room of rooms) {
        loadingMap[room.id] = true;
      }
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
      for (const room of rooms) {
        nextLoading[room.id] = false;
      }

      for (const result of results) {
        if (result.status === 'fulfilled') {
          nextInsights[result.value.roomId] = result.value.data;
        }
      }

      setRoomInsights(nextInsights);
      setInsightsLoading(nextLoading);
    };

    fetchInsights();

    return () => {
      cancelled = true;
    };
  }, [propertyId, rooms]);

  const scrollBy = (direction: 'left' | 'right') => {
    if (!scrollerRef.current) return;
    const delta = direction === 'left' ? -420 : 420;
    scrollerRef.current.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const roomsHubHref = propertyId ? `/dashboard/properties/${propertyId}?tab=rooms` : '/dashboard/properties';
  const roomsManageHref = propertyId ? `/dashboard/properties/${propertyId}/inventory/rooms` : '/dashboard/properties';

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <LayoutGrid className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Rooms</h2>
            <p className="text-sm text-gray-500">Room-level health and item access for this property.</p>
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
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading rooms...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : rooms.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-base font-semibold text-gray-900">No rooms configured yet</h3>
          <p className="text-sm text-gray-600 mt-1">
            Configure rooms for this property to unlock room-level health, items, and AI scan workflows.
          </p>
          <div className="mt-4">
            <Link
              href={roomsManageHref}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Manage rooms
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollerRef} className="flex gap-4 overflow-x-auto pb-2 no-scrollbar snap-x scroll-smooth">
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

              return (
                <Link
                  key={room.id}
                  href={`/dashboard/properties/${propertyId}/rooms/${room.id}`}
                  className="snap-start min-w-[86%] sm:min-w-[70%] md:min-w-[calc((100%-1rem)/2)] lg:min-w-[calc((100%-2rem)/3)] flex-shrink-0 rounded-2xl border border-white/60 bg-white/80 p-4 shadow-sm backdrop-blur-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md cursor-pointer select-none"
                >
                  <div className="min-w-0 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <RoomIcon className="w-4 h-4 text-gray-500 shrink-0" />
                      <div className="text-base font-semibold text-gray-900 truncate">
                        {room.name || 'Unnamed room'}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  </div>

                  <div className="mt-4 rounded-xl border border-black/10 bg-black/[0.02] p-3">
                    {insightsLoading[room.id] ? (
                      <div className="text-sm opacity-70">Loading insights...</div>
                    ) : insights ? (
                      <div className="space-y-3 text-center">
                        <div className="flex justify-center">
                          <RoomHealthScoreRing
                            value={score}
                            size={80}
                            strokeWidth={10}
                            ringOnly
                            animateMs={600}
                          />
                        </div>

                        <div className="flex justify-center">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${statusPillClass(statusLabel)}`}>
                            {statusLabel}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-gray-600">
                          <span className="inline-flex items-center gap-1">
                            <Package className="h-3.5 w-3.5 text-gray-500" />
                            {stats?.itemCount ?? 0} items
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <FileText className="h-3.5 w-3.5 text-gray-500" />
                            {stats?.docsLinkedCount ?? 0} docs
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <AlertCircle className="h-3.5 w-3.5 text-gray-500" />
                            {stats?.coverageGapsCount ?? 0} gaps
                          </span>
                        </div>

                        <p className="text-xs italic text-gray-500">
                          {roomTip(
                            Number(stats?.itemCount ?? 0),
                            Number(stats?.docsLinkedCount ?? 0),
                            Number(stats?.coverageGapsCount ?? 0)
                          )}
                        </p>
                      </div>
                    ) : (
                      <div className="text-sm opacity-70">No room insights yet.</div>
                    )}
                  </div>
                  {whyFactors.length > 0 && (
                    <p className="mt-2 line-clamp-1 text-xs text-gray-500">
                      Why: {whyFactors[0]?.label}
                    </p>
                  )}
                </Link>
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
