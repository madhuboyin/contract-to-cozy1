// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/rooms/[roomId]/RoomDetailClient.tsx
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
import DiningInsightsCard from '@/components/rooms/DiningInsightsCard';
import LaundryInsightsCard from '@/components/rooms/LaundryInsightsCard';
import GarageInsightsCard from '@/components/rooms/GarageInsightsCard';
import OfficeInsightsCard from '@/components/rooms/OfficeInsightsCard';
import RoomHealthScoreRing from '@/components/rooms/RoomHealthScoreRing';
import AnimatedTabPanel from '@/components/rooms/AnimatedTabPanel';
import BathroomInsightsCard from '@/components/rooms/BathroomInsightsCard';
import BasementInsightsCard from '@/components/rooms/BasementInsightsCard';

type Tab = 'PROFILE' | 'CHECKLIST' | 'TIMELINE';

type RoomBase =
  | 'KITCHEN'
  | 'LIVING'
  | 'BEDROOM'
  | 'BATHROOM'
  | 'DINING'
  | 'LAUNDRY'
  | 'GARAGE'
  | 'OFFICE'
  | 'BASEMENT'
  | 'OTHER';

type BedroomKind = 'MASTER' | 'KIDS' | 'GUEST' | null;

function normalizeBedroomKind(v: any): BedroomKind {
  if (v === 'MASTER' || v === 'KIDS' || v === 'GUEST') return v;
  return null;
}

function resolveRoomBaseFromType(type?: string | null): RoomBase | null {
  if (!type) return null;
  switch (type) {
    case 'KITCHEN':
      return 'KITCHEN';
    case 'LIVING_ROOM':
      return 'LIVING';
    case 'BEDROOM':
      return 'BEDROOM';
    case 'BATHROOM':
      return 'BATHROOM';
    case 'DINING':
      return 'DINING';
    case 'LAUNDRY':
      return 'LAUNDRY';
    case 'GARAGE':
      return 'GARAGE';
    case 'OFFICE':
      return 'OFFICE';
    case 'BASEMENT':
      return 'BASEMENT';
    default:
      return 'OTHER';
  }
}

function resolveRoomBaseFromName(name: string): RoomBase {
  const t = (name || '').toLowerCase();

  if (t.includes('kitchen')) return 'KITCHEN';
  if (t.includes('living') || t.includes('family') || t.includes('great')) return 'LIVING';
  if (t.includes('bed') || t.includes('master') || t.includes('guest') || t.includes('kids') || t.includes('nursery'))
    return 'BEDROOM';
  if (t.includes('dining') || t.includes('breakfast') || t.includes('eat')) return 'DINING';
  if (t.includes('laundry') || t.includes('utility') || t.includes('washer') || t.includes('dryer')) return 'LAUNDRY';
  if (t.includes('garage')) return 'GARAGE';
  if (t.includes('office') || t.includes('study') || t.includes('den')) return 'OFFICE';
  if (t.includes('bath') || t.includes('toilet') || t.includes('powder') || t.includes('wc')) return 'BATHROOM';
  if (t.includes('basement') || t.includes('cellar') || t.includes('lower level') || t.includes('lower-level')) return 'BASEMENT';
  return 'OTHER';
}

function resolveRoomBase(room: any): RoomBase {
  // ✅ Source of truth: room.type (set by RoomsHub / patchRoomMeta)
  const byType = resolveRoomBaseFromType(room?.type);
  if (byType) return byType;

  // Fallback: name matching
  return resolveRoomBaseFromName(room?.name || '');
}

function clampScore(v: number) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function computeHealthScore(roomBase: RoomBase, profile: any, insights: any): number {
  const stats = insights?.stats || {};
  const itemCount = Number(stats.itemCount || 0);
  const docs = Number(stats.docsLinkedCount || 0);
  const gaps = Number(stats.coverageGapsCount || 0);

  let score = 55;

  // General readiness signals
  score += Math.min(20, itemCount * 2);
  score += Math.min(20, docs * 5);
  score -= Math.min(30, gaps * 8);

  // Existing room-specific nudges (keep)
  const missing = insights?.kitchen?.missingAppliances?.length || 0;
  if (roomBase === 'KITCHEN') score -= Math.min(20, missing * 6);

  const hint = insights?.livingRoom?.comfortScoreHint;
  if (roomBase === 'LIVING') {
    if (hint === 'HIGH') score += 6;
    if (hint === 'LOW') score -= 6;
  }

  // Lightweight profile completion boost (explainable)
  const completionKeys: Record<RoomBase, string[]> = {
    KITCHEN: ['countertops', 'cabinets', 'ventHood', 'flooring'],
    LIVING: ['seatingCapacity', 'primaryUse', 'tvMount', 'lighting', 'flooring'],
    BEDROOM: ['bedroomKind', 'bedSize', 'nightLighting'],
    BATHROOM: ['bathroomType', 'showerType', 'exhaustFan', 'gfciPresent', 'flooring'],
    DINING: ['seatingCapacity', 'tableMaterial', 'lighting', 'flooring'],
    LAUNDRY: ['washerType', 'dryerType', 'ventingType', 'leakPan', 'floorDrain'],
    GARAGE: ['carCapacity', 'doorType', 'storageType', 'fireExtinguisherPresent', 'waterHeaterLocatedHere'],
    OFFICE: ['primaryUse', 'monitorCount', 'cableManagement', 'ergonomicSetup', 'surgeProtection'],
    BASEMENT: ['basementType', 'humidityControl', 'sumpPump', 'floorDrain', 'egressWindow', 'flooring'],
    OTHER: ['flooring', 'style'],
  };

  const keys = completionKeys[roomBase] || [];
  const filled = keys.filter((k) => {
    const v = profile?.[k];
    return v !== null && v !== undefined && String(v).trim() !== '';
  }).length;

  if (keys.length > 0) {
    // up to +8 points for completion
    score += Math.min(8, Math.round((filled / keys.length) * 8));
  }

  // Extra simple readiness rules (small deltas)
  if (roomBase === 'LAUNDRY') {
    if (profile?.leakPan === 'YES') score += 2;
    if (profile?.floorDrain === 'YES') score += 1;
    if (profile?.ventingType) score += 1;
  }
  if (roomBase === 'GARAGE') {
    if (profile?.fireExtinguisherPresent === 'YES') score += 3;
    if (profile?.doorType === 'AUTO') score += 1;
  }
  if (roomBase === 'OFFICE') {
    if (profile?.surgeProtection === 'YES') score += 3;
    if (profile?.ergonomicSetup === 'YES') score += 1;
    if (profile?.cableManagement) score += 1;
  }

  if (roomBase === 'BATHROOM') {
    if (profile?.exhaustFan === 'YES') score += 2;
    if (profile?.gfciPresent === 'YES') score += 2;
    if (profile?.shutoffAccessible === 'YES') score += 1;
  }

  if (roomBase === 'BASEMENT') {
    if (profile?.humidityControl && profile.humidityControl !== 'NONE') score += 3;
    if (profile?.sumpPump === 'YES') score += 2;
    if (profile?.floorDrain === 'YES') score += 1;
  }
  
  return clampScore(score);
}

function roomIcon(base: RoomBase) {
  switch (base) {
    case 'KITCHEN':
      return '🍳';
    case 'LIVING':
      return '🛋️';
    case 'BEDROOM':
      return '🛏️';
    case 'DINING':
      return '🍽️';
    case 'LAUNDRY':
      return '🧺';
    case 'GARAGE':
      return '🚗';
    case 'OFFICE':
      return '🖥️';
    case 'BATHROOM':
      return '🚿';
    case 'BASEMENT':
      return '🧱';
    default:
      return '🏠';
  }
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

  const roomBase = useMemo<RoomBase>(() => (room ? resolveRoomBase(room) : 'OTHER'), [room]);
  const bedroomKind = useMemo<BedroomKind>(() => normalizeBedroomKind(profile?.bedroomKind), [profile?.bedroomKind]);

  const healthScore = useMemo(() => computeHealthScore(roomBase, profile, insights), [roomBase, profile, insights]);

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
      <div className="flex items-start justify-between gap-4">
        <SectionHeader
          icon={roomIcon(roomBase)}
          title={room.name}
          description="Profile, micro-checklists, and maintenance timeline."
        />
        <Link href={`/dashboard/properties/${propertyId}/inventory/rooms`} className="text-sm underline opacity-80 hover:opacity-100">
          Back to rooms
        </Link>
      </div>

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

      <AnimatedTabPanel tabKey={tab}>
        {tab === 'PROFILE' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <RoomProfileForm
              profile={profile}
              roomType={roomBase}
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
                {roomBase === 'DINING' && <DiningInsightsCard profile={profile} />}
                {roomBase === 'LAUNDRY' && <LaundryInsightsCard profile={profile} />}
                {roomBase === 'GARAGE' && <GarageInsightsCard profile={profile} />}
                {roomBase === 'OFFICE' && <OfficeInsightsCard profile={profile} />}
                {roomBase === 'BATHROOM' && <BathroomInsightsCard profile={profile} />}
                {roomBase === 'BASEMENT' && <BasementInsightsCard profile={profile} />}
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
          <RoomChecklistPanel propertyId={propertyId} roomId={roomId} roomType={roomBase} bedroomKind={bedroomKind} />
        )}

        {tab === 'TIMELINE' && <RoomTimeline propertyId={propertyId} roomId={roomId} />}
      </AnimatedTabPanel>
    </div>
  );
}
