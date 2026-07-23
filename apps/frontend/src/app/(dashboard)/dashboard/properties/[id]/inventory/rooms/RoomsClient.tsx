// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/rooms/RoomsClient.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

import { AddRoomForm } from '@/components/manage-rooms/AddRoomForm';
import { ManageRoomsHeader } from '@/components/manage-rooms/ManageRoomsHeader';
import { RoomsList } from '@/components/manage-rooms/RoomsList';
import { MANAGE_ROOM_TYPE_VALUES, type ManageRoom, type ManageRoomType } from '@/components/manage-rooms/types';
import type { InventoryRoom } from '@/types';

import {
  createInventoryRoom,
  deleteInventoryRoom,
  listInventoryRooms,
  updateInventoryRoom,
} from '../../../../inventory/inventoryApi';
import {
  BottomSafeAreaReserve,
  MobilePageContainer,
  MobilePageIntro,
  MobileToolWorkspace,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

type InventoryRoomWithType = InventoryRoom & {
  type?: string | null;
};

function isManageRoomType(value: string): value is ManageRoomType {
  return (MANAGE_ROOM_TYPE_VALUES as readonly string[]).includes(value);
}

type RequestError = {
  status?: number | string;
  payload?: { retryAfterSeconds?: number };
};

function getRateLimitRetrySeconds(error: unknown): number | null {
  const requestError = error as RequestError;
  if (Number(requestError?.status) !== 429) return null;
  const seconds = Number(requestError.payload?.retryAfterSeconds);
  return Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 60;
}

export default function RoomsClient() {
  const params = useParams<{ id: string }>();
  const propertyId = String(params.id || '');

  const [rooms, setRooms] = useState<InventoryRoomWithType[]>([]);
  const [hasLoadedRooms, setHasLoadedRooms] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);

  const [roomType, setRoomType] = useState<ManageRoomType | ''>('');
  const [customLabel, setCustomLabel] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomsWithCounts = useMemo<ManageRoom[]>(
    () =>
      rooms.map((room) => ({
        ...room,
        itemCount: room.itemCount ?? 0,
      })),
    [rooms]
  );

  const totalItems = useMemo(
    () => roomsWithCounts.reduce((sum, room) => sum + room.itemCount, 0),
    [roomsWithCounts]
  );

  async function refresh() {
    if (!propertyId) return;

    setIsLoading(true);
    try {
      const nextRooms = await listInventoryRooms(propertyId);
      setRooms((nextRooms || []) as InventoryRoomWithType[]);
      setHasLoadedRooms(true);
      setRetryAfterSeconds(0);
      setError(null);
    } catch (err) {
      console.error('Failed to load rooms:', err);
      const retrySeconds = getRateLimitRetrySeconds(err);
      if (retrySeconds !== null) {
        setRetryAfterSeconds(retrySeconds);
        setError('Rooms are temporarily unavailable because several requests were made recently.');
      } else {
        setError('We could not load your rooms. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  useEffect(() => {
    if (retryAfterSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setRetryAfterSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAfterSeconds]);

  async function handleAddRoom() {
    if (!propertyId || !roomType || isAdding) return;

    setIsAdding(true);
    try {
      await createInventoryRoom(propertyId, {
        type: roomType,
        name: customLabel.trim() ? customLabel.trim() : undefined,
      });
      setCustomLabel('');
      await refresh();
    } catch (err) {
      console.error('Failed to add room:', err);
      setError('Failed to add room. Please try again.');
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRename(roomId: string, nextName: string) {
    const trimmedName = nextName.trim();
    if (!propertyId || !trimmedName) return;

    try {
      await updateInventoryRoom(propertyId, roomId, { name: trimmedName });
      setRooms((prev) =>
        prev.map((room) => (room.id === roomId ? { ...room, name: trimmedName } : room))
      );
    } catch (err) {
      console.error('Failed to rename room:', err);
      setError('Failed to rename room. Please try again.');
    }
  }

  async function handleDelete(roomId: string) {
    if (!propertyId) return;
    try {
      await deleteInventoryRoom(propertyId, roomId);
      setRooms((prev) => prev.filter((room) => room.id !== roomId));
    } catch (err) {
      console.error('Failed to delete room:', err);
      setError('Failed to delete room. Please try again.');
    }
  }

  return (
    <MobileToolWorkspace
      className="space-y-6 lg:max-w-7xl lg:px-8 lg:pb-10"
      intro={
        <MobilePageIntro
          eyebrow="Inventory"
          title="Manage Rooms"
          subtitle="Organize rooms and keep item tracking clean."
        />
      }
      summary={
        <ResultHeroCard
          title="Room Inventory"
          value={isLoading && !hasLoadedRooms
            ? 'Loading…'
            : !hasLoadedRooms && error
              ? 'Unavailable'
              : `${roomsWithCounts.length} room${roomsWithCounts.length === 1 ? '' : 's'}`}
          status={hasLoadedRooms
            ? <StatusChip tone={roomsWithCounts.length > 0 ? 'good' : 'info'}>{totalItems} item{totalItems === 1 ? '' : 's'}</StatusChip>
            : undefined}
          summary="Add, rename, and remove rooms without leaving inventory flow."
        />
      }
      footer={<BottomSafeAreaReserve size="chatAware" />}
    >
      <div className="hidden md:block">
        <ManageRoomsHeader
          propertyId={propertyId}
          roomsCount={roomsWithCounts.length}
          totalItems={totalItems}
        />
      </div>

      {error && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{error}</p>
            {retryAfterSeconds > 0 && (
              <p className="mt-1 text-xs text-amber-800">Try again in {retryAfterSeconds} second{retryAfterSeconds === 1 ? '' : 's'}.</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isLoading || retryAfterSeconds > 0}
            className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold text-amber-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Trying again…' : 'Try again'}
          </button>
        </div>
      )}

      <ScenarioInputCard title="Add Room" subtitle="Create a room before assigning inventory items.">
        <AddRoomForm
          roomType={roomType}
          customLabel={customLabel}
          isAdding={isAdding}
          onRoomTypeChange={(value) => {
            if (!isManageRoomType(value)) return;
            setRoomType(value);
          }}
          onCustomLabelChange={setCustomLabel}
          onAddRoom={() => void handleAddRoom()}
        />
      </ScenarioInputCard>

      <ScenarioInputCard title="Rooms" subtitle="Tap a room to rename, review items, or delete when empty.">
        <RoomsList
          propertyId={propertyId}
          rooms={roomsWithCounts}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      </ScenarioInputCard>
    </MobileToolWorkspace>
  );
}
