// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/rooms/RoomsHubClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { InventoryRoom } from '@/types';
import { listInventoryRooms, patchRoomMeta, getRoomInsights } from '../../../inventory/inventoryApi';
import { SectionHeader } from '../../../components/SectionHeader';
import RoomHealthScoreRing from '@/components/rooms/RoomHealthScoreRing';
import RoomScanModal from '@/app/(dashboard)/dashboard/components/inventory/RoomScanModal';


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

  function openScan(room: any) {
    setScanRoomId(room.id);
    setScanRoomName(room.name || null);
    setScanOpen(true);
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <SectionHeader
          icon="✨"
          title="Rooms"
          description="Select a room to see health, value snapshot, and quick wins."
        />
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/properties/${propertyId}/inventory/rooms`}
            className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
          >
            Manage rooms
          </Link>
          <Link
            href={`/dashboard/properties/${propertyId}/inventory`}
            className="text-sm underline opacity-80 hover:opacity-100"
          >
            Back to inventory
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading && (
          <div className="rounded-2xl border border-black/10 p-4 text-sm opacity-70">Loading rooms…</div>
        )}

        {!loading && sorted.length === 0 && (
          <div className="rounded-2xl border border-black/10 p-4 text-sm opacity-70">
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

          // Prefer backend label if it's non-empty; otherwise use a stable label
          const scoreLabel = safeString(insights?.healthScore?.label) || 'Room health';

          const whyFactors = insights ? buildWhyFactors(insights) : [];

          const improvements = Array.isArray(insights?.healthScore?.improvements)
            ? insights.healthScore.improvements
            : [];


          return (
            <div key={r.id} className="rounded-2xl border border-black/10 p-4 bg-white flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-xs opacity-60 mt-1">
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
                    className="text-xs rounded-full border border-black/10 px-2 py-1 hover:bg-black/5 disabled:opacity-50"
                    title="Auto-detect room template from name"
                  >
                    {detectingId === r.id ? 'Detecting…' : 'Apply'}
                  </button>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-black/10 bg-black/[0.02] p-3">
                {insightsLoading[r.id] ? (
                  <div className="text-sm opacity-70">Loading insights…</div>
                ) : insights ? (
                  <div className="space-y-2">
                    <RoomHealthScoreRing
                      value={score}
                      label={scoreLabel}
                      sublabel={`${stats?.itemCount ?? 0} items · ${stats?.docsLinkedCount ?? 0} docs · ${stats?.coverageGapsCount ?? 0} gaps`}
                      whyTitle="Why this score?"
                      whyFactors={whyFactors}
                      // optionally: if you want bigger rings on hub cards
                      // size={84}
                    />

                    {improvements.length > 0 && safeString(improvements?.[0]?.title) && (
                      <div className="text-xs text-gray-500">
                        Tip:{' '}
                        <span className="font-medium text-gray-700">
                          {String(improvements[0].title)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => loadInsight(r.id)}
                    className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5 bg-white"
                  >
                    Load health score
                  </button>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 mt-auto">
                <Link
                  href={`/dashboard/properties/${propertyId}/rooms/${r.id}`}
                  className="rounded-xl px-4 py-2 text-sm font-medium shadow-sm border border-black/10 hover:bg-black/5"
                >
                  View room
                </Link>

                <Link
                  href={`/dashboard/properties/${propertyId}/inventory/rooms/${r.id}`}
                  className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5"
                >
                  Edit
                </Link>

                <Link
                  href={`/dashboard/properties/${propertyId}/inventory?roomId=${r.id}`}
                  className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5"
                >
                  Items
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openScan(r);
                  }}
                  className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
                >
                  AI Scan
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
