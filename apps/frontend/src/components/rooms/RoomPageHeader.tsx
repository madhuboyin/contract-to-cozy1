'use client';

import React from 'react';
import { ArrowLeft, Package, Settings, Sparkles } from 'lucide-react';

import { getHealthOverlay, getRoomConfig } from './roomVisuals';

type RoomPageHeaderProps = {
  roomName: string;
  roomType?: string | null;
  healthScore: number;
  itemCount: number;
  gapCount: number;
  docCount: number;
  backLabel?: string;
  onBack: () => void;
  onItems: () => void;
  onEdit: () => void;
  onScan: () => void;
};

export default function RoomPageHeader({
  roomName,
  roomType,
  healthScore,
  itemCount,
  gapCount,
  docCount,
  backLabel = 'Back',
  onBack,
  onItems,
  onEdit,
  onScan,
}: RoomPageHeaderProps) {
  const roomConfig = getRoomConfig(roomType);
  const RoomIcon = roomConfig.icon;

  return (
    <header
      className={[
        'relative overflow-hidden rounded-2xl border',
        `bg-gradient-to-br ${roomConfig.gradient}`,
        roomConfig.borderColor,
        'px-4 py-4 sm:px-6 sm:py-5',
      ].join(' ')}
    >
      <div className={`pointer-events-none absolute inset-0 ${getHealthOverlay(healthScore)}`} />

      <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
            <p className="mt-0.5 text-sm text-gray-500">
              {itemCount} items tracked - {gapCount} gaps - {docCount} documents
            </p>
          </div>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[42px] items-center justify-center rounded-lg border border-gray-200 bg-white/70 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            {backLabel}
          </button>
          <button
            type="button"
            onClick={onItems}
            className="inline-flex min-h-[42px] items-center justify-center rounded-lg border border-gray-200 bg-white/70 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900"
          >
            <Package className="mr-1.5 h-3.5 w-3.5" />
            Items
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-[42px] items-center justify-center rounded-lg border border-gray-200 bg-white/70 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900"
          >
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </button>

          <button
            type="button"
            onClick={onScan}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-teal-500 bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm shadow-teal-600/20 transition-colors hover:bg-teal-700"
          >
            <Sparkles className="h-4 w-4" />
            AI Scan
          </button>
        </div>
      </div>
    </header>
  );
}
