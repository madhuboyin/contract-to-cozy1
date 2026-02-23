'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ChevronRight,
  FileText,
  Package,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';

import { getRoomConfig, getScoreColorHex, getSpecificRoomTip, getStatusColor, getStatusLabel } from './roomVisuals';

type RoomListCardProps = {
  propertyId: string;
  roomId: string;
  roomName: string;
  roomType?: string | null;
  healthScore: number;
  itemCount: number;
  docCount: number;
  gapCount: number;
  completenessPercent: number;
  loading?: boolean;
  onScan: () => void;
  scanLaunching?: boolean;
  headerAction?: React.ReactNode;
};

export default function RoomListCard({
  propertyId,
  roomId,
  roomName,
  roomType,
  healthScore,
  itemCount,
  docCount,
  gapCount,
  completenessPercent,
  loading,
  onScan,
  scanLaunching,
  headerAction,
}: RoomListCardProps) {
  const roomConfig = getRoomConfig(roomType);
  const RoomIcon: LucideIcon = roomConfig.icon;
  const scoreColor = getScoreColorHex(healthScore);
  const statusLabel = getStatusLabel(healthScore);
  const statusColor = getStatusColor(healthScore);

  const tipText = getSpecificRoomTip({
    itemCount,
    docCount,
    gapCount,
  });

  return (
    <div className="cursor-default overflow-hidden rounded-xl border border-gray-200 bg-white transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
      <div className={`h-1.5 w-full ${roomConfig.headerStrip}`} />

      <div className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className={`rounded-lg p-1.5 ${roomConfig.iconBg}`}>
            <RoomIcon className={`h-3.5 w-3.5 ${roomConfig.iconColor}`} />
          </div>
          <span className="truncate text-sm font-semibold text-gray-800">{roomName}</span>
          <ChevronRight className="ml-auto h-3.5 w-3.5 text-gray-400" />
        </div>

        {headerAction ? <div className="mb-3">{headerAction}</div> : null}

        <div className="mb-2 flex justify-center">
          <div className="h-[72px] w-[72px]">
            <CircularProgressbar
              value={healthScore}
              text={`${Math.round(healthScore)}`}
              strokeWidth={9}
              styles={buildStyles({
                textSize: '30px',
                textColor: '#111827',
                pathColor: scoreColor,
                trailColor: '#e5e7eb',
                pathTransitionDuration: 0.8,
              })}
            />
          </div>
        </div>

        <p className={`mb-3 text-center text-xs font-bold ${statusColor}`}>{statusLabel}</p>

        <div className="mb-3 flex items-center justify-center gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1">
            <Package className="h-3 w-3" />
            {itemCount}
          </span>
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {docCount}
          </span>
          <span className={`flex items-center gap-1 ${gapCount > 0 ? 'text-red-500' : ''}`}>
            <AlertCircle className="h-3 w-3" />
            {gapCount}
          </span>
        </div>

        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between text-[10px] text-gray-400">
            <span className="uppercase tracking-wider">Completeness</span>
            <span className="font-semibold text-gray-600">{completenessPercent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-teal-500 transition-all duration-700"
              style={{ width: `${completenessPercent}%` }}
            />
          </div>
        </div>

        <p className="text-center text-[10px] italic leading-relaxed text-gray-500">{tipText}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href={`/dashboard/properties/${propertyId}/rooms/${roomId}`}
            className="inline-flex min-h-[36px] flex-1 items-center justify-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900"
          >
            View
          </Link>
          <Link
            href={`/dashboard/properties/${propertyId}/inventory/rooms/${roomId}`}
            className="inline-flex min-h-[36px] flex-1 items-center justify-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900"
          >
            Edit
          </Link>
          <Link
            href={`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`}
            className="inline-flex min-h-[36px] flex-1 items-center justify-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900"
          >
            Items
          </Link>
        </div>

        <button
          type="button"
          onClick={onScan}
          disabled={loading}
          className="mt-2 inline-flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-60"
        >
          <Sparkles className={`h-3.5 w-3.5 ${scanLaunching ? 'animate-pulse text-amber-200' : 'text-white'}`} />
          {scanLaunching ? 'Launching...' : 'AI Scan'}
        </button>
      </div>
    </div>
  );
}
