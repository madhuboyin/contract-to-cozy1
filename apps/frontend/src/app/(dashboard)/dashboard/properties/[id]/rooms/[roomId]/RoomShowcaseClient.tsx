// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/rooms/[roomId]/RoomShowcaseClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { InventoryItem, InventoryRoom } from '@/types';
import { SectionHeader } from '../../../../components/SectionHeader';
import InventoryItemCard from '../../../../components/inventory/InventoryItemCard';

import RoomHealthScoreRing from '@/components/rooms/RoomHealthScoreRing';
import RoomScanModal from '@/app/(dashboard)/dashboard/components/inventory/RoomScanModal';
import {
  getRoomInsights,
  listInventoryItems,
  listInventoryRooms,
  listRoomScanSessions,
  getDraftsCsvExportUrl,
} from '../../../../inventory/inventoryApi';


function money(cents: number | null | undefined, currency = 'USD') {
  if (!cents) return '$0';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="text-xs rounded-full border border-black/10 px-2 py-1 bg-white">{children}</span>;
}
function impactPill(impact?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL') {
  if (impact === 'POSITIVE') return '↑ helps';
  if (impact === 'NEGATIVE') return '↓ hurts';
  if (impact === 'NEUTRAL') return '• neutral';
  return null;
}

function WhyScorePopover({
  title,
  factors,
}: {
  title: string;
  factors: Array<{ label: string; detail?: string; impact?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' }>;
}) {
  const items = Array.isArray(factors) ? factors.filter(Boolean) : [];
  if (items.length === 0) return null;

  return (
    <div className="relative inline-flex group">
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-black/5
                   focus:outline-none focus:ring-2 focus:ring-black/10"
        aria-label={title}
      >
        ⓘ {title}
      </button>

      {/* Popover */}
      <div
        className={[
          'absolute right-0 top-full mt-2 w-[340px] max-w-[80vw]',
          'rounded-2xl border border-black/10 bg-white p-3 shadow-lg',
          'opacity-0 pointer-events-none',
          'group-hover:opacity-100 group-hover:pointer-events-auto',
          'group-focus-within:opacity-100 group-focus-within:pointer-events-auto',
          'transition-opacity duration-150 z-50',
        ].join(' ')}
      >
        {/* Arrow */}
        <div className="absolute -top-2 right-4 h-4 w-4 rotate-45 bg-white border-l border-t border-black/10" />

        <div className="text-sm font-medium">{title}</div>

        <div className="mt-2 space-y-2">
          {items.slice(0, 6).map((f, idx) => {
            const it = impactPill(f.impact);
            return (
              <div key={idx} className="text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-gray-900">{f.label}</div>
                  {it && <div className="text-gray-500 whitespace-nowrap">{it}</div>}
                </div>
                {f.detail && <div className="mt-0.5 text-gray-600">{f.detail}</div>}
              </div>
            );
          })}
        </div>

        {items.length > 6 && (
          <div className="mt-2 text-xs text-gray-500">+{items.length - 6} more factors</div>
        )}
      </div>
    </div>
  );
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

function asArray<T = any>(v: any): T[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v) as T[];
  return [];
}

export default function RoomShowcaseClient() {
  const params = useParams<{ id: string; roomId: string }>();
  const router = useRouter();
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
    if (propertyId && roomId) {
      refresh();
      loadScanSessions();
    }
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

  const improvements: Array<{ title: string; detail?: string }> = asArray(healthScore?.improvements);

  const scoreBadges: string[] = asArray<string>(healthScore?.badges);

  const missingAppliances: string[] = insights?.kitchen?.missingAppliances || [];
  const comfort = insights?.livingRoom?.comfortScoreHint;

  const stats = insights?.stats;

  const [scanOpen, setScanOpen] = useState(false);
  const [scanSessions, setScanSessions] = useState<any[]>([]);
  const [scanSessionsLoading, setScanSessionsLoading] = useState(false);
  const [historySessionId, setHistorySessionId] = useState<string | null>(null);

  async function loadScanSessions() {
    setScanSessionsLoading(true);
    try {
      const sessions = await listRoomScanSessions(propertyId, roomId, 8);
      setScanSessions(Array.isArray(sessions) ? sessions : []);
    } catch (e) {
      console.error('[RoomShowcaseClient] listRoomScanSessions failed', e);
      setScanSessions([]);
    } finally {
      setScanSessionsLoading(false);
    }
  }

  const whyFactors = asArray((insights as any)?.healthScore?.factors).map((f: any) => ({
    label: String(f?.label || f?.key || 'Factor'),
    detail: f?.detail ? String(f.detail) : undefined,
    impact: (String(f?.impact || '').toUpperCase() as any) || undefined,
  }));
  
  return (
    <div className="p-4 sm:p-6 space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="w-full sm:w-auto">
          <SectionHeader
            icon={template === 'KITCHEN' ? '🍳' : template === 'LIVING_ROOM' ? '🛋️' : '✨'}
            title={heroTitle}
            description="A lightweight, modern room page generated from your inventory."
          />
        </div>
        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center sm:gap-3">
          <Link
            href={`/dashboard/properties/${propertyId}/rooms`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
          >
            Back to rooms
          </Link>
          <Link
            href={`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
          >
            View items
          </Link>
          <Link
            href={`/dashboard/properties/${propertyId}/inventory/rooms/${roomId}`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
          >
            Edit room
          </Link>

          {/* ✅ AI Scan */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setScanOpen(true);
            }}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
          >
            AI Scan
          </button>
        </div>
      </div>
      <RoomScanModal
        open={scanOpen}
        onClose={() => {
          setScanOpen(false);
          setHistorySessionId(null);
          loadScanSessions(); // refresh counts after confirm/dismiss
        }}
        propertyId={propertyId}
        roomId={roomId}
        roomName={room?.name}
        initialSessionId={historySessionId}
      />

      {/* ✅ Scan history */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold">Scan history</div>
            <div className="text-xs opacity-70">Reopen a scan or export the drafts.</div>
          </div>

          <button
            onClick={loadScanSessions}
            disabled={scanSessionsLoading}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
          >
            {scanSessionsLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {scanSessions.length === 0 ? (
          <div className="mt-3 text-sm opacity-70">No scans yet for this room.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {scanSessions.slice(0, 6).map((s) => {
              const created = s?.createdAt ? new Date(s.createdAt) : null;
              const label = created ? created.toLocaleString() : '—';
              const c = s?.counts || {};
              const exportUrl = getDraftsCsvExportUrl({ propertyId, scanSessionId: s.id });

              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-black/10 p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {label}{' '}
                      <span className="ml-2 text-xs rounded-full border border-black/10 px-2 py-0.5 opacity-70">
                        {String(s.status || '—')}
                      </span>
                    </div>
                    <div className="text-xs opacity-70 mt-0.5">
                      Drafts: <span className="font-medium">{c.drafts ?? 0}</span> · Confirmed:{' '}
                      <span className="font-medium">{c.confirmed ?? 0}</span> · Dismissed:{' '}
                      <span className="font-medium">{c.dismissed ?? 0}</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full sm:w-auto">
                    <button
                      onClick={() => {
                        setHistorySessionId(s.id);
                        setScanOpen(true);
                      }}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
                    >
                      Reopen
                    </button>

                    <a
                      href={exportUrl}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
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

      {/* Hero strip */}
      <div className="rounded-3xl border border-black/10 p-5 bg-gradient-to-b from-black/[0.03] to-transparent">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* LEFT: Score */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-black/10 bg-white p-4 h-full flex flex-col">
              {/* Top bar (in-flow, no absolute) */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wide text-gray-500">
                    {scoreLabel}
                  </div>

                  {/* Optional rating line (avoid repetition if scoreLabel already equals rating) */}
                  <div className="text-sm font-semibold">
                    {/** if you already compute rating outside, use it here */}
                    {/* {rating} */}
                  </div>
                </div>

                <div className="flex items-end gap-2 shrink-0">
                  {whyFactors?.length > 0 && (
                    <WhyScorePopover title="Why this score?" factors={whyFactors} />
                  )}
                </div>
              </div>

              {/* Stats line: right aligned, near top */}
              <div className="mt-1 text-xs text-gray-500 text-right">
                {loading
                  ? 'Updating…'
                  : stats
                    ? `${stats.itemCount ?? items.length} items • ${stats.docsLinkedCount ?? 0} docs • ${stats.coverageGapsCount ?? 0} gaps`
                    : `${items.length} items`}
              </div>

              {/* Ring: take remaining space, centered */}
              <div className="flex-1 min-h-[180px] flex items-center justify-center">
                <div className="scale-90 sm:scale-100 origin-center">
                  <RoomHealthScoreRing
                    value={score}
                    variant="hero"
                    ringOnly
                    size={210}
                    strokeWidth={18}
                  />
                </div>
              </div>

              {/* Tip */}
              {improvements?.[0]?.title && (
                <div className="mt-2 text-xs text-gray-500">
                  Tip:{' '}
                  <span className="font-medium text-gray-700">
                    {String(improvements[0].title)}
                  </span>
                </div>
              )}

              {/* Badges */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge>{template}</Badge>
                <Badge>{money(stats?.replacementTotalCents)} replacement</Badge>
                {template === 'LIVING_ROOM' && comfort && <Badge>Comfort: {comfort}</Badge>}
              </div>
            </div>
          </div>
          {/* RIGHT: Improve your room health */}
          <div className="lg:col-span-7">
            {improvements.length > 0 ? (
              <div className="rounded-2xl border border-black/10 bg-white p-4 h-full">
                <div className="text-xs uppercase tracking-wide opacity-60">
                  Improve your room health
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {improvements.slice(0, 4).map((x, idx) => (
                    <div key={idx} className="rounded-xl border border-black/10 p-3">
                      <div className="text-sm font-medium">{x.title}</div>
                      {x.detail && <div className="mt-0.5 text-sm opacity-75">{x.detail}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-black/10 bg-white p-4 h-full">
                <div className="text-xs uppercase tracking-wide opacity-60">Improve your room health</div>
                <div className="mt-2 text-sm opacity-70">
                  Add items, attach documents, and resolve coverage gaps to improve your score.
                </div>
              </div>
            )}
          </div>
        </div>
        {template === 'KITCHEN' && missingAppliances.length > 0 && (
          <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">
              Kitchen completeness
            </div>
            <div className="text-sm mt-1">
              Missing common appliances:{' '}
              <span className="font-medium">{missingAppliances.join(', ')}</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Add them as inventory items to strengthen warranty + recall + claims readiness.
            </div>
          </div>
        )}

        {loading && <div className="mt-3 text-sm text-gray-500">Loading room…</div>}
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
              <InventoryItemCard
                key={it.id}
                item={it}
                onClick={() => {
                  router.push(`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}&openItemId=${it.id}`);
                }}
              />
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
