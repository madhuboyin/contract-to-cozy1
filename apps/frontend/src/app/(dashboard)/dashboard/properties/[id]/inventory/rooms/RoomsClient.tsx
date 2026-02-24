// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/rooms/RoomsClient.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

import { AddRoomForm } from '@/components/manage-rooms/AddRoomForm';
import { ManageRoomsHeader } from '@/components/manage-rooms/ManageRoomsHeader';
import { RoomsList } from '@/components/manage-rooms/RoomsList';
import { MANAGE_ROOM_TYPE_VALUES, type ManageRoom, type ManageRoomType } from '@/components/manage-rooms/types';
import type { InventoryItem, InventoryRoom } from '@/types';

import {
  createInventoryRoom,
  deleteInventoryRoom,
  listInventoryItems,
  listInventoryRooms,
  updateInventoryRoom,
} from '../../../../inventory/inventoryApi';

type InventoryRoomWithType = InventoryRoom & {
  type?: string | null;
};

function isManageRoomType(value: string): value is ManageRoomType {
  return (MANAGE_ROOM_TYPE_VALUES as readonly string[]).includes(value);
}

function buildItemCountMap(items: InventoryItem[]): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    if (!item.roomId) return acc;
    acc[item.roomId] = (acc[item.roomId] ?? 0) + 1;
    return acc;
  }, {});
}

export default function RoomsClient() {
  const params = useParams<{ id: string }>();
  const propertyId = String(params.id || '');

  const [rooms, setRooms] = useState<InventoryRoomWithType[]>([]);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});

  const [roomType, setRoomType] = useState<ManageRoomType | ''>('');
  const [customLabel, setCustomLabel] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomsWithCounts = useMemo<ManageRoom[]>(
    () =>
      rooms.map((room) => ({
        ...room,
        itemCount: itemCounts[room.id] ?? 0,
      })),
    [rooms, itemCounts]
  );

  const totalItems = useMemo(
    () => roomsWithCounts.reduce((sum, room) => sum + room.itemCount, 0),
    [roomsWithCounts]
  );

  async function refresh() {
    if (!propertyId) return;

    try {
      const [nextRooms, items] = await Promise.all([
        listInventoryRooms(propertyId),
        listInventoryItems(propertyId, {}),
      ]);

      setRooms((nextRooms || []) as InventoryRoomWithType[]);
      setItemCounts(buildItemCountMap(items || []));
      setError(null);
    } catch (err) {
      console.error('Failed to load rooms:', err);
      setError('Failed to load rooms. Please try again.');
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

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
      setItemCounts((prev) => {
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
    } catch (err) {
      console.error('Failed to delete room:', err);
      setError('Failed to delete room. Please try again.');
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <ManageRoomsHeader
        propertyId={propertyId}
        roomsCount={roomsWithCounts.length}
        totalItems={totalItems}
      />

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

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

      <RoomsList
        propertyId={propertyId}
        rooms={roomsWithCounts}
        onRename={handleRename}
        onDelete={handleDelete}
      />
    </div>
  );
}
