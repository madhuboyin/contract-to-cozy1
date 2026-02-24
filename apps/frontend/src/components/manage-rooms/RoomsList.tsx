'use client';

import { AnimatePresence } from 'framer-motion';
import { LayoutGrid } from 'lucide-react';

import { RoomRow } from './RoomRow';
import type { ManageRoom } from './types';

type RoomsListProps = {
  propertyId: string;
  rooms: ManageRoom[];
  onRename: (roomId: string, nextName: string) => Promise<void>;
  onDelete: (roomId: string) => Promise<void>;
};

export function RoomsList({ propertyId, rooms, onRename, onDelete }: RoomsListProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-gray-800">
          Your rooms
          {rooms.length > 0 && <span className="ml-2 text-xs font-normal text-gray-400">({rooms.length})</span>}
        </h2>
      </div>

      {rooms.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 rounded-full bg-gray-100 p-4">
            <LayoutGrid className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm font-semibold text-gray-700">No rooms yet</p>
          <p className="mt-1 text-xs text-gray-400">Add your first room using the form above.</p>
        </div>
      )}

      <AnimatePresence initial={false}>
        {rooms.map((room, index) => (
          <RoomRow
            key={room.id}
            propertyId={propertyId}
            room={room}
            index={index}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
