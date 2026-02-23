'use client';

import {
  Bath,
  Bed,
  Car,
  Home,
  Monitor,
  Sofa,
  UtensilsCrossed,
  WashingMachine,
  type LucideIcon,
} from 'lucide-react';

export type RoomVisualConfig = {
  gradient: string;
  borderColor: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  headerStrip: string;
};

export const ROOM_CONFIG: Record<string, RoomVisualConfig> = {
  BEDROOM: {
    gradient: 'from-violet-50 to-slate-50',
    borderColor: 'border-violet-200/60',
    icon: Bed,
    iconColor: 'text-violet-500',
    iconBg: 'bg-violet-100',
    headerStrip: 'bg-gradient-to-r from-violet-400 to-fuchsia-400',
  },
  KITCHEN: {
    gradient: 'from-amber-50 to-orange-50',
    borderColor: 'border-amber-200/60',
    icon: UtensilsCrossed,
    iconColor: 'text-amber-500',
    iconBg: 'bg-amber-100',
    headerStrip: 'bg-gradient-to-r from-amber-400 to-orange-400',
  },
  LAUNDRY: {
    gradient: 'from-sky-50 to-cyan-50',
    borderColor: 'border-sky-200/60',
    icon: WashingMachine,
    iconColor: 'text-sky-500',
    iconBg: 'bg-sky-100',
    headerStrip: 'bg-gradient-to-r from-sky-400 to-cyan-400',
  },
  LIVING: {
    gradient: 'from-teal-50 to-emerald-50',
    borderColor: 'border-teal-200/60',
    icon: Sofa,
    iconColor: 'text-teal-500',
    iconBg: 'bg-teal-100',
    headerStrip: 'bg-gradient-to-r from-emerald-400 to-teal-400',
  },
  BATHROOM: {
    gradient: 'from-blue-50 to-indigo-50',
    borderColor: 'border-blue-200/60',
    icon: Bath,
    iconColor: 'text-blue-500',
    iconBg: 'bg-blue-100',
    headerStrip: 'bg-gradient-to-r from-blue-400 to-indigo-400',
  },
  GARAGE: {
    gradient: 'from-zinc-50 to-gray-50',
    borderColor: 'border-zinc-200/60',
    icon: Car,
    iconColor: 'text-zinc-500',
    iconBg: 'bg-zinc-100',
    headerStrip: 'bg-gradient-to-r from-zinc-400 to-slate-400',
  },
  OFFICE: {
    gradient: 'from-indigo-50 to-purple-50',
    borderColor: 'border-indigo-200/60',
    icon: Monitor,
    iconColor: 'text-indigo-500',
    iconBg: 'bg-indigo-100',
    headerStrip: 'bg-gradient-to-r from-indigo-400 to-purple-400',
  },
  DEFAULT: {
    gradient: 'from-teal-50 to-gray-50',
    borderColor: 'border-teal-200/60',
    icon: Home,
    iconColor: 'text-teal-500',
    iconBg: 'bg-teal-100',
    headerStrip: 'bg-gradient-to-r from-teal-400 to-slate-400',
  },
};

export function normalizeRoomType(type?: string | null): keyof typeof ROOM_CONFIG {
  const raw = String(type || '').toUpperCase();

  if (raw.includes('BED')) return 'BEDROOM';
  if (raw.includes('KITCHEN')) return 'KITCHEN';
  if (raw.includes('LAUNDRY') || raw.includes('UTILITY')) return 'LAUNDRY';
  if (raw.includes('LIVING') || raw.includes('FAMILY') || raw.includes('DINING')) return 'LIVING';
  if (raw.includes('BATH')) return 'BATHROOM';
  if (raw.includes('GARAGE')) return 'GARAGE';
  if (raw.includes('OFFICE') || raw.includes('STUDY') || raw.includes('DEN')) return 'OFFICE';

  return 'DEFAULT';
}

export function getRoomConfig(type?: string | null): RoomVisualConfig {
  return ROOM_CONFIG[normalizeRoomType(type)] || ROOM_CONFIG.DEFAULT;
}

export function getScoreColorHex(score: number): string {
  if (score < 40) return '#ef4444';
  if (score <= 65) return '#f59e0b';
  return '#0f766e';
}

export function getStatusLabel(score: number): 'AT RISK' | 'NEEDS ATTENTION' | 'HEALTHY' {
  if (score < 40) return 'AT RISK';
  if (score <= 65) return 'NEEDS ATTENTION';
  return 'HEALTHY';
}

export function getStatusColor(score: number): string {
  if (score < 40) return 'text-red-600';
  if (score <= 65) return 'text-amber-600';
  return 'text-emerald-600';
}

export function getHealthOverlay(score: number): string {
  if (score < 40) return 'bg-red-50/20';
  if (score <= 65) return 'bg-amber-50/20';
  return 'bg-emerald-50/10';
}

export function getSpecificRoomTip(stats: {
  itemCount: number;
  docCount: number;
  gapCount: number;
}): string {
  if (stats.docCount === 0 && stats.gapCount > 0) {
    return `Upload docs and fix ${stats.gapCount} coverage gap${stats.gapCount === 1 ? '' : 's'}`;
  }
  if (stats.docCount === 0) {
    return 'Upload receipts or warranties to improve score';
  }
  if (stats.gapCount > 0) {
    return `Fix ${stats.gapCount} coverage gap${stats.gapCount === 1 ? '' : 's'} to reduce risk`;
  }
  if (stats.itemCount < 3) {
    return 'Add more items for better coverage insights';
  }
  return 'Room is well tracked. Keep it up';
}
