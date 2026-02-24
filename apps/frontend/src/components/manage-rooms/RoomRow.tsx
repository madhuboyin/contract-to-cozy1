'use client';

import { useState } from 'react';
import { AlertTriangle, Pencil, Settings, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

import { Input } from '@/components/ui/input';
import { getRoomConfig } from '@/lib/config/roomConfig';

import type { ManageRoom } from './types';

type RoomRowProps = {
  propertyId: string;
  room: ManageRoom;
  index: number;
  onRename: (roomId: string, nextName: string) => Promise<void>;
  onDelete: (roomId: string) => Promise<void>;
};

export function RoomRow({ propertyId, room, index, onRename, onDelete }: RoomRowProps) {
  const router = useRouter();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(room.name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSavingRename, setIsSavingRename] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const roomConfig = getRoomConfig(room.type);
  const RoomIcon = roomConfig.icon;

  async function saveRename() {
    const nextName = renameValue.trim();
    if (!nextName || isSavingRename) return;

    setIsSavingRename(true);
    try {
      await onRename(room.id, nextName);
      setIsRenaming(false);
    } finally {
      setIsSavingRename(false);
    }
  }

  async function confirmDelete() {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(room.id);
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  }

  const roomPath = `/dashboard/properties/${propertyId}/rooms/${room.id}`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.18) }}
      className="border-b border-gray-100 last:border-0"
    >
      {!isRenaming && !showDeleteConfirm && (
        <div className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-gray-50/60">
          <div className={`flex-shrink-0 rounded-lg p-2 ${roomConfig.iconBg}`}>
            <RoomIcon className={`h-4 w-4 ${roomConfig.iconColor}`} />
          </div>

          <div className="min-w-0 flex-1 cursor-pointer" onClick={() => router.push(roomPath)}>
            <p className="truncate text-sm font-semibold text-gray-800 transition-colors group-hover:text-teal-700">
              {room.name}
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              {room.itemCount > 0
                ? `${room.itemCount} item${room.itemCount === 1 ? '' : 's'} tracked`
                : 'No items yet'}
            </p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
            <button
              onClick={() => router.push(roomPath)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
            >
              <Settings className="h-3 w-3" />
              Edit
            </button>
            <button
              onClick={() => {
                setRenameValue(room.name);
                setIsRenaming(true);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
            >
              <Pencil className="h-3 w-3" />
              Rename
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 rounded-lg border border-red-100 bg-white px-2.5 py-1.5 text-xs text-red-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        </div>
      )}

      {isRenaming && (
        <div className="flex items-center gap-3 bg-blue-50/30 px-4 py-3.5">
          <div className={`flex-shrink-0 rounded-lg p-2 ${roomConfig.iconBg}`}>
            <RoomIcon className={`h-4 w-4 ${roomConfig.iconColor}`} />
          </div>

          <Input
            type="text"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void saveRename();
              }
              if (event.key === 'Escape') {
                setRenameValue(room.name);
                setIsRenaming(false);
              }
            }}
            className="flex-1 border-teal-400 bg-white text-sm font-semibold text-gray-800 ring-1 ring-teal-300"
          />

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => void saveRename()}
              disabled={!renameValue.trim() || isSavingRename}
              className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => {
                setRenameValue(room.name);
                setIsRenaming(false);
              }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="flex items-center gap-3 bg-red-50/40 px-4 py-3.5">
          <div className="flex-shrink-0 rounded-lg bg-red-100 p-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-red-700">Delete "{room.name}"?</p>
            <p className="mt-0.5 text-xs text-red-500">
              {room.itemCount > 0
                ? `This will unlink ${room.itemCount} item${room.itemCount === 1 ? '' : 's'}. Items won't be deleted.`
                : 'This room has no items. It will be removed permanently.'}
            </p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1.5">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => void confirmDelete()}
              disabled={isDeleting}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? 'Deleting...' : 'Yes, delete'}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
