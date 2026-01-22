// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/rooms/[roomId]/RoomShowcaseClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { InventoryItem, InventoryRoom } from '@/types';
import { SectionHeader } from '../../../../components/SectionHeader';
import InventoryItemCard from '../../../../components/inventory/InventoryItemCard';
import { getRoomInsights, listInventoryItems, listInventoryRooms } from '../../../../inventory/inventoryApi';

import RoomHealthScoreRing from '@/components/rooms/RoomHealthScoreRing';

function money(cents: number | null | undefined, currency = 'USD') {
  if (!cents) return '$0';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="text-xs rounded-full border border-black/10 px-2 py-1 bg-white">{children}</span>;
}

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

export default function RoomShowcaseClient() {
  const params = useParams<{ id: string; roomId: string }>();
  const propertyId = params.id;
  const roomId = params.roomId;

  const [room, setRoom] = useState<InventoryRoom | null>(null);
  const [insights, setInsights] = useState<any>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [rooms, insightData, roomItems] = await Promise.all([
        listInventoryRooms(propertyId),
        getRoomInsights(propertyId, roomId),
        listInventoryItems(propertyId, { roomId }),
      ]);

      setRoom(rooms.find((r) => r.id === roomId) || null);
      setInsights((insightData as any)?.data ?? insightData);
      setItems(roomItems);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (propertyId && roomId) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, roomId]);

  const template = (insights?.room?.type || 'OTHER') as string;
  const heroTitle =
    template === 'KITCHEN' ? 'Kitchen' :
    template === 'LIVING_ROOM' ? 'Living Room' :
    room?.name || 'Room';

  const quickWins = useMemo(() => {
    if (template === 'KITCHEN') return insights?.kitchen?.quickWins || [];
    if (template === 'LIVING_ROOM') return insights?.livingRoom?.quickWins || [];
    return [];
  }, [template, insights]);

  // ✅ Prefer backend score; fallback to legacy client computation during rollout
  const healthScore = insights?.healthScore;

  const score = useMemo(() => {
    const backend = Number(healthScore?.score);
    if (Number.isFinite(backend)) return backend;
    return computeHealthScore(insights, items); // fallback only
  }, [healthScore?.score, insights, items]);

  const scoreLabel = (healthScore?.label as string) || 'Room health';

  const improvements: Array<{ title: string; detail?: string }> =
    (healthScore?.improvements as any[]) || [];

  const scoreBadges: string[] = (healthScore?.badges as string[]) || [];


  const missingAppliances: string[] = insights?.kitchen?.missingAppliances || [];
  const comfort = insights?.livingRoom?.comfortScoreHint;

  const stats = insights?.stats;

  const whyFactors =
  (insights?.healthScore?.factors || []).map((f: any) => ({
    label: String(f?.label || f?.key || 'Factor'),
    detail: f?.detail ? String(f.detail) : undefined,
    impact: (String(f?.impact || '').toUpperCase() as any) || undefined,
  }));


  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <SectionHeader
          icon={template === 'KITCHEN' ? '🍳' : template === 'LIVING_ROOM' ? '🛋️' : '✨'}
          title={heroTitle}
          description="A lightweight, modern room page generated from your inventory."
        />
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/properties/${propertyId}/rooms`}
            className="text-sm underline opacity-80 hover:opacity-100"
          >
            Back to rooms
          </Link>
          <Link
            href={`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`}
            className="text-sm underline opacity-80 hover:opacity-100"
          >
            View items
          </Link>
          <Link
            href={`/dashboard/properties/${propertyId}/inventory/rooms/${roomId}`}
            className="text-sm underline opacity-80 hover:opacity-100"
          >
            Edit room
          </Link>
        </div>
      </div>

      {/* Hero strip */}
      <div className="rounded-3xl border border-black/10 p-5 bg-gradient-to-b from-black/[0.03] to-transparent">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <RoomHealthScoreRing
            value={score}
            label={scoreLabel} // ✅ uses backend "Good / Needs attention / At risk" if provided
            sublabel={
              loading
                ? 'Updating…'
                : stats
                  ? `${stats.itemCount ?? items.length} items · ${stats.docsLinkedCount ?? 0} docs · ${stats.coverageGapsCount ?? 0} gaps`
                  : `${items.length} items tracked`
            }
            whyTitle="Why this score?"
            whyFactors={whyFactors}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{template}</Badge>
            <Badge>{stats?.itemCount ?? items.length} items</Badge>
            <Badge>{money(stats?.replacementTotalCents)} replacement</Badge>
            <Badge>{stats?.docsLinkedCount ?? 0} docs</Badge>
            <Badge>{stats?.coverageGapsCount ?? 0} coverage gaps</Badge>
            {template === 'LIVING_ROOM' && comfort && <Badge>Comfort: {comfort}</Badge>}
          </div>
          {improvements.length > 0 && (
            <div className="mt-3 rounded-xl bg-black/[0.02] p-4">
              <div className="text-xs uppercase tracking-wide opacity-60">
                Improve your room health
              </div>

              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                {improvements.slice(0, 4).map((x, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-black/10 bg-white p-3"
                  >
                    <div className="text-sm font-medium">{x.title}</div>
                    {x.detail && (
                      <div className="mt-0.5 text-sm opacity-75">{x.detail}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {template === 'KITCHEN' && missingAppliances.length > 0 && (
          <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
            <div className="text-xs uppercase tracking-wide opacity-60">Kitchen completeness</div>
            <div className="text-sm mt-1">
              Missing common appliances: <span className="font-medium">{missingAppliances.join(', ')}</span>
            </div>
            <div className="text-xs opacity-60 mt-1">
              Add them as inventory items to strengthen warranty + recall + claims readiness.
            </div>
          </div>
        )}

        {loading && <div className="mt-3 text-sm opacity-60">Loading room…</div>}
      </div>

      {/* Kitchen / Living “full page” layout sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Quick wins + next actions */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-black/10 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Quick wins</div>
                <div className="text-xs opacity-70 mt-1">
                  Small, high-impact actions based on what’s in your room inventory.
                </div>
              </div>
              <Link
                href={`/dashboard/properties/${propertyId}/inventory/rooms/${roomId}?tab=CHECKLIST`}
                className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
              >
                Open checklist
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {quickWins.length === 0 ? (
                <div className="text-sm opacity-70">No quick wins yet—add items to this room to unlock suggestions.</div>
              ) : (
                quickWins.map((w: any, idx: number) => (
                  <div key={idx} className="rounded-2xl border border-black/10 p-4">
                    <div className="text-sm font-medium">{w.title}</div>
                    <div className="mt-1 text-sm opacity-75">{w.detail}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* “Kitchen layout” vs “Living layout” card */}
          {template === 'KITCHEN' ? (
            <div className="rounded-2xl border border-black/10 bg-white p-5">
              <div className="text-sm font-semibold">Kitchen readiness</div>
              <div className="text-xs opacity-70 mt-1">
                Designed for safety, maintenance rhythm, and appliance tracking.
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-black/10 p-4">
                  <div className="text-xs uppercase tracking-wide opacity-60">Safety</div>
                  <div className="text-sm mt-1">Ventilation + leak awareness</div>
                  <div className="text-xs opacity-60 mt-1">Track under-sink + hood filter.</div>
                </div>
                <div className="rounded-2xl border border-black/10 p-4">
                  <div className="text-xs uppercase tracking-wide opacity-60">Appliances</div>
                  <div className="text-sm mt-1">{stats?.appliancesCount ?? 0} appliances tracked</div>
                  <div className="text-xs opacity-60 mt-1">Better recalls + warranties.</div>
                </div>
                <div className="rounded-2xl border border-black/10 p-4">
                  <div className="text-xs uppercase tracking-wide opacity-60">Claims</div>
                  <div className="text-sm mt-1">{stats?.docsLinkedCount ?? 0} docs linked</div>
                  <div className="text-xs opacity-60 mt-1">Receipts + manuals matter.</div>
                </div>
              </div>
            </div>
          ) : template === 'LIVING_ROOM' ? (
            <div className="rounded-2xl border border-black/10 bg-white p-5">
              <div className="text-sm font-semibold">Living room readiness</div>
              <div className="text-xs opacity-70 mt-1">
                Designed for comfort, electronics, and claims-proof documentation.
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-black/10 p-4">
                  <div className="text-xs uppercase tracking-wide opacity-60">Comfort</div>
                  <div className="text-sm mt-1">Hint: {comfort || '—'}</div>
                  <div className="text-xs opacity-60 mt-1">Based on core items presence.</div>
                </div>
                <div className="rounded-2xl border border-black/10 p-4">
                  <div className="text-xs uppercase tracking-wide opacity-60">Electronics</div>
                  <div className="text-sm mt-1">Track TVs / routers</div>
                  <div className="text-xs opacity-60 mt-1">Receipts simplify claims.</div>
                </div>
                <div className="rounded-2xl border border-black/10 p-4">
                  <div className="text-xs uppercase tracking-wide opacity-60">Value</div>
                  <div className="text-sm mt-1">{money(stats?.replacementTotalCents)}</div>
                  <div className="text-xs opacity-60 mt-1">Room value snapshot.</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Right: “At a glance” + CTAs */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-black/10 bg-white p-5">
            <div className="text-sm font-semibold">At a glance</div>
            <div className="text-xs opacity-70 mt-1">Use this page as your room command card.</div>

            <div className="mt-4 space-y-2">
              <div className="rounded-xl border border-black/10 p-3">
                <div className="text-xs opacity-60">Coverage gaps</div>
                <div className="text-sm font-medium">{stats?.coverageGapsCount ?? 0}</div>
              </div>
              <div className="rounded-xl border border-black/10 p-3">
                <div className="text-xs opacity-60">Documents linked</div>
                <div className="text-sm font-medium">{stats?.docsLinkedCount ?? 0}</div>
              </div>
              <div className="rounded-xl border border-black/10 p-3">
                <div className="text-xs opacity-60">Items tracked</div>
                <div className="text-sm font-medium">{stats?.itemCount ?? items.length}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <Link
                href={`/dashboard/properties/${propertyId}/inventory/rooms/${roomId}`}
                className="rounded-xl px-4 py-2 text-sm font-medium border border-black/10 hover:bg-black/5"
              >
                Edit profile + checklist
              </Link>
              <Link
                href={`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`}
                className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5"
              >
                Add / manage items
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="rounded-2xl border border-black/10 p-4 bg-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Items in this room</div>
            <div className="text-xs opacity-60">This is the source of truth powering insights.</div>
          </div>
          <Link
            href={`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`}
            className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
          >
            Manage items
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.length === 0 ? (
            <div className="text-sm opacity-70">No items assigned to this room yet.</div>
          ) : (
            items.slice(0, 9).map((it) => (
              <InventoryItemCard key={it.id} item={it} onClick={() => {}} />
            ))
          )}
        </div>

        {items.length > 9 && (
          <div className="mt-3 text-xs opacity-60">Showing 9 of {items.length}. Open “Manage items” for the full list.</div>
        )}
      </div>
    </div>
  );
}
