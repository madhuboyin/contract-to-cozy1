// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/rooms/[roomId]/RoomShowcaseClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { InventoryItem, InventoryRoom } from '@/types';
import { SectionHeader } from '../../../../components/SectionHeader';
import InventoryItemCard from '../../../../components/inventory/InventoryItemCard';
import { getRoomInsights, listInventoryItems, listInventoryRooms } from '../../../../inventory/inventoryApi';

function money(cents: number | null | undefined, currency = 'USD') {
  if (cents === null || cents === undefined) return '$0';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

function Badge(props: { children: React.ReactNode }) {
  return <span className="text-xs rounded-full border border-black/10 px-2 py-1 bg-white">{props.children}</span>;
}

/**
 * Normalize room type across older/newer naming:
 * - Backend/Prisma might emit: KITCHEN, LIVING_ROOM, OTHER
 * - Some UI code uses: LIVING
 */
function normRoomType(v: any): 'KITCHEN' | 'LIVING' | 'OTHER' {
  const t = String(v || '')
    .trim()
    .toUpperCase();

  if (t === 'KITCHEN') return 'KITCHEN';
  if (t === 'LIVING' || t === 'LIVING_ROOM') return 'LIVING';
  return 'OTHER';
}

/**
 * Our backend returns: { success: true, data: RoomInsightsDTO }
 * But some helpers might already unwrap.
 */
function unwrapInsights(x: any) {
  if (!x) return null;
  // axios => x.data is payload
  if (x?.data?.success && x?.data?.data) return x.data.data;
  // already payload
  if (x?.success && x?.data) return x.data;
  // already unwrapped dto
  if (x?.room && x?.stats) return x;
  // some previous code used {data: dto}
  if (x?.data?.room && x?.data?.stats) return x.data;
  return x;
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
      const [rooms, insightRaw, roomItems] = await Promise.all([
        listInventoryRooms(propertyId),
        getRoomInsights(propertyId, roomId),
        listInventoryItems(propertyId, { roomId }),
      ]);

      setRoom(rooms.find((r) => r.id === roomId) || null);
      setInsights(unwrapInsights(insightRaw));
      setItems(roomItems);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (propertyId && roomId) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, roomId]);

  const template = useMemo(() => normRoomType(insights?.room?.type), [insights?.room?.type]);

  const quickWins = useMemo(() => {
    if (template === 'KITCHEN') return insights?.kitchen?.quickWins || [];
    if (template === 'LIVING') return insights?.livingRoom?.quickWins || [];
    return [];
  }, [template, insights]);

  const heroTitle =
    template === 'KITCHEN'
      ? 'Kitchen'
      : template === 'LIVING'
        ? 'Living Room'
        : room?.name || insights?.room?.name || 'Room';

  const heroIcon = template === 'KITCHEN' ? '🍳' : template === 'LIVING' ? '🛋️' : '✨';

  const workspaceHref = `/dashboard/properties/${propertyId}/inventory/rooms/${roomId}`;
  const inventoryHref = `/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`;
  const roomsShowcaseBackHref = `/dashboard/properties/${propertyId}/rooms`;

  const statItemCount = insights?.stats?.itemCount ?? items.length;
  const statReplacement = insights?.stats?.replacementTotalCents ?? null;
  const statDocs = insights?.stats?.docsLinkedCount ?? 0;
  const statGaps = insights?.stats?.coverageGapsCount ?? 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <SectionHeader
          icon={heroIcon}
          title={heroTitle}
          description="A lightweight, modern room page generated from your inventory."
        />

        {/* UX: quick cross-links between Showcase ↔ Workspace */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Link href={roomsShowcaseBackHref} className="text-sm underline opacity-80 hover:opacity-100">
            Back to rooms
          </Link>

          <span className="opacity-30">•</span>

          <Link href={workspaceHref} className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5">
            Edit room
          </Link>

          <Link href={inventoryHref} className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5">
            Manage items
          </Link>
        </div>
      </div>

      {/* HERO STRIP */}
      <div className="rounded-3xl border border-black/10 p-5 bg-gradient-to-b from-black/[0.03] to-transparent">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{template}</Badge>
          <Badge>{statItemCount} items</Badge>
          <Badge>{money(statReplacement)} replacement</Badge>
          <Badge>{statDocs} docs</Badge>
          <Badge>{statGaps} coverage gaps</Badge>

          {template === 'LIVING' && insights?.livingRoom?.comfortScoreHint && (
            <Badge>Comfort: {insights.livingRoom.comfortScoreHint}</Badge>
          )}
        </div>

        {template === 'KITCHEN' && (insights?.kitchen?.missingAppliances?.length ?? 0) > 0 && (
          <div className="mt-3 text-sm opacity-80">
            Missing common appliances:{' '}
            <span className="font-medium">{insights.kitchen.missingAppliances.join(', ')}</span>
          </div>
        )}

        {/* UX: better empty/loading messaging */}
        {loading ? (
          <div className="mt-3 text-sm opacity-60">Loading room…</div>
        ) : statItemCount === 0 ? (
          <div className="mt-3 text-sm opacity-70">
            Add a couple of items to this room to unlock richer insights.
            <span className="ml-2">
              <Link href={inventoryHref} className="underline opacity-80 hover:opacity-100">
                Add items
              </Link>
            </span>
          </div>
        ) : null}
      </div>

      {/* QUICK WINS */}
      {quickWins.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quickWins.map((w: any, idx: number) => (
            <div key={idx} className="rounded-2xl border border-black/10 p-4 bg-white">
              <div className="text-sm font-medium">{w.title}</div>
              <div className="mt-1 text-sm opacity-75">{w.detail}</div>
            </div>
          ))}
        </div>
      )}

      {/* ITEMS */}
      <div className="rounded-2xl border border-black/10 p-4 bg-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Items in this room</div>
            <div className="text-xs opacity-60">This is the source of truth powering insights.</div>
          </div>

          {/* keep CTA here too (redundant but helpful) */}
          <Link
            href={inventoryHref}
            className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
          >
            Manage items
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.length === 0 ? (
            <div className="text-sm opacity-70">
              No items assigned to this room yet.{' '}
              <Link href={inventoryHref} className="underline opacity-80 hover:opacity-100">
                Add items
              </Link>
            </div>
          ) : (
            items.slice(0, 9).map((it) => (
              <InventoryItemCard
                key={it.id}
                item={it}
                onClick={() => {
                  // optional: deep link to drawer via query param (future)
                }}
              />
            ))
          )}
        </div>

        {items.length > 9 && (
          <div className="mt-3 text-xs opacity-60">
            Showing 9 of {items.length}. Open “Manage items” for the full list.
          </div>
        )}
      </div>
    </div>
  );
}
