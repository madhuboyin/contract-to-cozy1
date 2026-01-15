// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/rooms/[roomId]/RoomDetailClient.tsx
// ✅ Changes:
// - Replace Master/Kids/Guest insights imports with BedroomInsightsCard
// - Render <BedroomInsightsCard profile={profile} /> for any BEDROOM
// - Keep “select bedroom type” helper when bedroomKind is not set (optional)
// - Keep passing bedroomKind to RoomChecklistPanel

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { SectionHeader } from '../../../../../components/SectionHeader';
import { listInventoryRooms, updateInventoryRoomProfile, getRoomInsights } from '../../../../../inventory/inventoryApi';

import RoomProfileForm from '@/components/rooms/RoomProfileForm';
import RoomChecklistPanel from '@/components/rooms/RoomChecklistPanel';
import RoomTimeline from '@/components/rooms/RoomTimeline';
import KitchenInsightsCard from '@/components/rooms/KitchenInsightsCard';
import LivingRoomInsightsCard from '@/components/rooms/LivingRoomInsightsCard';
import BedroomInsightsCard from '@/components/rooms/BedroomInsightsCard';
import RoomHealthScoreRing from '@/components/rooms/RoomHealthScoreRing';
import AnimatedTabPanel from '@/components/rooms/AnimatedTabPanel';

type Tab = 'PROFILE' | 'CHECKLIST' | 'TIMELINE';
type RoomBase = 'KITCHEN' | 'LIVING' | 'BEDROOM' | 'OTHER';
type BedroomKind = 'MASTER' | 'KIDS' | 'GUEST' | null;

function resolveRoomBase(name: string): RoomBase {
  const t = (name || '').toLowerCase();
  if (t.includes('kitchen')) return 'KITCHEN';
  if (t.includes('living')) return 'LIVING';
  if (t.includes('bed')) return 'BEDROOM';
  return 'OTHER';
}

function normalizeBedroomKind(v: any): BedroomKind {
  if (v === 'MASTER' || v === 'KIDS' || v === 'GUEST') return v;
  return null;
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

export default function RoomDetailClient() {
  const params = useParams<{ id: string; roomId: string }>();
  const propertyId = params.id;
  const roomId = params.roomId;

  const [tab, setTab] = useState<Tab>('PROFILE');
  const [room, setRoom] = useState<any>(null);
  const [profile, setProfile] = useState<any>({});
  const [savingProfile, setSavingProfile] = useState(false);

  const [insights, setInsights] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const roomBase = useMemo<RoomBase>(() => (room?.name ? resolveRoomBase(room.name) : 'OTHER'), [room?.name]);
  const bedroomKind = useMemo<BedroomKind>(() => normalizeBedroomKind(profile?.bedroomKind), [profile?.bedroomKind]);

  const healthScore = useMemo(() => computeHealthScore(insights), [insights]);

  async function loadRoom() {
    const rooms = await listInventoryRooms(propertyId);
    const r = rooms.find((x: any) => x.id === roomId);
    setRoom(r || null);
    setProfile((r as any)?.profile || {});
  }

  async function loadSummary() {
    setSummaryLoading(true);
    try {
      const data = await getRoomInsights(propertyId, roomId);
      setInsights((data as any)?.data ?? data);
    } catch {
      setInsights(null);
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => {
    if (!propertyId || !roomId) return;
    loadRoom();
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, roomId]);

  async function saveProfile(nextProfile: any) {
    setSavingProfile(true);
    try {
      await updateInventoryRoomProfile(propertyId, roomId, nextProfile);
      await Promise.all([loadRoom(), loadSummary()]);
    } finally {
      setSavingProfile(false);
    }
  }

  if (!room) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-black/10 p-4">Loading room…</div>
      </div>
    );
  }

  const stats = insights?.stats;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <SectionHeader
          icon={roomBase === 'KITCHEN' ? '🍳' : roomBase === 'LIVING' ? '🛋️' : roomBase === 'BEDROOM' ? '🛏️' : '🏠'}
          title={room.name}
          description="Profile, micro-checklists, and maintenance timeline."
        />
        <Link href={`/dashboard/properties/${propertyId}/inventory/rooms`} className="text-sm underline opacity-80 hover:opacity-100">
          Back to rooms
        </Link>
      </div>

      {/* Summary strip */}
      <div className="rounded-2xl border border-black/10 bg-white p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <RoomHealthScoreRing
          value={healthScore}
          label="Room health"
          sublabel={
            summaryLoading
              ? 'Updating…'
              : stats
                ? `${stats.itemCount ?? 0} items · ${stats.docsLinkedCount ?? 0} docs · ${stats.coverageGapsCount ?? 0} gaps`
                : 'Based on your room inventory + readiness signals'
          }
        />

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/properties/${propertyId}/rooms/${roomId}`}
            className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
          >
            View room page
          </Link>
          <Link
            href={`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`}
            className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
          >
            Manage items
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex items-center p-1 bg-black/5 rounded-xl border border-black/5">
        {(['PROFILE', 'CHECKLIST', 'TIMELINE'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition ${
              tab === t ? 'bg-white text-black shadow-sm border border-black/5' : 'text-black/60 hover:text-black'
            }`}
          >
            {t === 'PROFILE' ? 'Profile' : t === 'CHECKLIST' ? 'Checklist' : 'Timeline'}
          </button>
        ))}
      </div>

      {/* Animated content */}
      <AnimatedTabPanel tabKey={tab}>
        {tab === 'PROFILE' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <RoomProfileForm
              profile={profile}
              roomType={roomBase} // ✅ includes BEDROOM
              saving={savingProfile}
              onChange={setProfile}
              onSave={saveProfile}
            />

            <div className="rounded-2xl border border-black/10 bg-white p-5">
              <div className="text-sm font-semibold">Quick insights</div>
              <div className="text-xs opacity-70 mt-1">Rule-based, no AI.</div>

              <div className="mt-4 space-y-3">
                {roomBase === 'KITCHEN' && <KitchenInsightsCard profile={profile} />}
                {roomBase === 'LIVING' && <LivingRoomInsightsCard profile={profile} />}

                {roomBase === 'BEDROOM' && <BedroomInsightsCard profile={profile} />}

                {roomBase === 'BEDROOM' && !bedroomKind && (
                  <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3 text-sm">
                    Select a bedroom type (Master / Kids / Guest) to unlock tailored insights + checklist defaults.
                  </div>
                )}

                {roomBase === 'OTHER' && (
                  <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3 text-sm">
                    Add a couple of micro-checklist items to build a maintenance rhythm.
                  </div>
                )}

                {roomBase === 'KITCHEN' && insights?.kitchen?.missingAppliances?.length ? (
                  <div className="rounded-xl border border-black/10 p-3">
                    <div className="text-xs uppercase tracking-wide opacity-60">Missing common appliances</div>
                    <div className="text-sm mt-1">{insights.kitchen.missingAppliances.join(', ')}</div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {tab === 'CHECKLIST' && (
          <RoomChecklistPanel
            propertyId={propertyId}
            roomId={roomId}
            roomType={roomBase}
            bedroomKind={bedroomKind}
          />
        )}

        {tab === 'TIMELINE' && <RoomTimeline propertyId={propertyId} roomId={roomId} />}
      </AnimatedTabPanel>
    </div>
  );
}
