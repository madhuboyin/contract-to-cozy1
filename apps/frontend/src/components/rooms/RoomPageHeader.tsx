'use client';

import React from 'react';
import { Settings, Sparkles } from 'lucide-react';

import { getRoomConfig } from './roomVisuals';

type RoomPageHeaderProps = {
  roomName: string;
  roomType?: string | null;
  onEdit: () => void;
  onScan: () => void;
};

export default function RoomPageHeader({
  roomName,
  roomType,
  onEdit,
  onScan,
}: RoomPageHeaderProps) {
  const roomConfig = getRoomConfig(roomType);
  const RoomIcon = roomConfig.icon;

  return (
    <header className="rounded-2xl border border-black/10 bg-white px-4 py-4 shadow-sm sm:px-6 sm:py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div
            className={[
              'rounded-2xl border bg-white/70 p-3 shadow-sm backdrop-blur-sm',
              roomConfig.borderColor,
            ].join(' ')}
          >
            <RoomIcon className={`h-6 w-6 ${roomConfig.iconColor}`} />
          </div>

          <div className="min-w-0">
            <h1 className="truncate text-2xl font-display font-bold leading-tight text-gray-900">{roomName}</h1>
            <p className="mt-0.5 text-sm text-gray-500">Room inventory and care</p>
          </div>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </button>

          <button
            type="button"
            onClick={onScan}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
          >
            <Sparkles className="h-4 w-4" />
            AI Scan
          </button>
        </div>
      </div>
    </header>
  );
}
