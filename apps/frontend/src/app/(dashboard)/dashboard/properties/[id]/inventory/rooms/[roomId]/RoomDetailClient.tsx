// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/rooms/[roomId]/RoomDetailClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { SectionHeader } from '../../../../../components/SectionHeader';
import { listInventoryRooms, updateInventoryRoomProfile } from '../../../../../inventory/inventoryApi';

import RoomProfileForm from '@/components/rooms/RoomProfileForm';
import RoomChecklistPanel from '@/components/rooms/RoomChecklistPanel';
import RoomTimeline from '@/components/rooms/RoomTimeline';
import KitchenInsightsCard from '@/components/rooms/KitchenInsightsCard';
import LivingRoomInsightsCard from '@/components/rooms/LivingRoomInsightsCard';

type Tab = 'PROFILE' | 'CHECKLIST' | 'TIMELINE';

function normRoomType(name: string): 'KITCHEN' | 'LIVING' | 'OTHER' {
  const t = (name || '').toLowerCase();
  if (t.includes('kitchen')) return 'KITCHEN';
  if (t.includes('living')) return 'LIVING';
  return 'OTHER';
}

export default function RoomDetailClient() {
  const params = useParams<{ id: string; roomId: string }>();
  const propertyId = params.id;
  const roomId = params.roomId;

  const [tab, setTab] = useState<Tab>('PROFILE');
  const [room, setRoom] = useState<any>(null);

  const [profile, setProfile] = useState<any>({});
  const [savingProfile, setSavingProfile] = useState(false);

  const roomType = useMemo(() => (room?.name ? normRoomType(room.name) : 'OTHER'), [room?.name]);

  async function loadRoom() {
    const rooms = await listInventoryRooms(propertyId);
    const r = rooms.find((x: any) => x.id === roomId);
    setRoom(r || null);
    setProfile((r as any)?.profile || {});
  }

  useEffect(() => {
    if (!propertyId || !roomId) return;
    loadRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, roomId]);

  async function saveProfile(nextProfile: any) {
    setSavingProfile(true);
    try {
      // ✅ Safe call even if inventoryApi wrapper expects { profile }:
      // If your wrapper already wraps, it will still work since profile is JSON anyway.
      await updateInventoryRoomProfile(propertyId, roomId, nextProfile);
      await loadRoom();
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

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <SectionHeader
          icon={roomType === 'KITCHEN' ? '🍳' : roomType === 'LIVING' ? '🛋️' : '🏠'}
          title={room.name}
          description="Room profile, micro-checklists, and maintenance timeline."
        />
        <Link
          href={`/dashboard/properties/${propertyId}/inventory/rooms`}
          className="text-sm underline opacity-80 hover:opacity-100"
        >
          Back to rooms
        </Link>
      </div>

      {/* Tabs */}
      <div className="inline-flex items-center p-1 rounded-xl border border-black/10 bg-black/[0.03]">
        {(['PROFILE', 'CHECKLIST', 'TIMELINE'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition ${
              tab === t
                ? 'bg-white text-black shadow-sm border border-black/10'
                : 'text-black/60 hover:text-black'
            }`}
          >
            {t === 'PROFILE' ? 'Profile' : t === 'CHECKLIST' ? 'Checklist' : 'Timeline'}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      {tab === 'PROFILE' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: questionnaire */}
          <RoomProfileForm
            profile={profile}
            roomType={roomType}
            saving={savingProfile}
            onChange={setProfile}
            onSave={saveProfile}
          />

          {/* Right: insights */}
          <div className="space-y-3">
            {roomType === 'KITCHEN' && <KitchenInsightsCard profile={profile} />}
            {roomType === 'LIVING' && <LivingRoomInsightsCard profile={profile} />}

            {roomType === 'OTHER' && (
              <div className="rounded-2xl border border-black/10 bg-white p-5">
                <div className="text-sm font-semibold">Quick insights</div>
                <div className="text-xs opacity-70 mt-1">Rule-based, no AI.</div>
                <div className="mt-3 text-sm opacity-80">
                  Add a couple of micro-checklist items to build a maintenance rhythm.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'CHECKLIST' && <RoomChecklistPanel propertyId={propertyId} roomId={roomId} roomType={roomType} />}

      {tab === 'TIMELINE' && <RoomTimeline propertyId={propertyId} roomId={roomId} />}
    </div>
  );
}
