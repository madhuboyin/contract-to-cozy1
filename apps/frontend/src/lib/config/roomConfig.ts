import type { LucideIcon } from 'lucide-react';
import { resolveRoomTypeIcon } from '@/lib/icons';

export type RoomConfig = {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  gradient: string;
  borderColor: string;
};

export const ROOM_CONFIG: Record<string, RoomConfig> = {
  KITCHEN: {
    icon: resolveRoomTypeIcon('KITCHEN'),
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
    gradient: 'from-amber-50 to-white',
    borderColor: 'border-amber-100',
  },
  BEDROOM: {
    icon: resolveRoomTypeIcon('BEDROOM'),
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-500',
    gradient: 'from-violet-50 to-white',
    borderColor: 'border-violet-100',
  },
  BATHROOM: {
    icon: resolveRoomTypeIcon('BATHROOM'),
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-500',
    gradient: 'from-cyan-50 to-white',
    borderColor: 'border-cyan-100',
  },
  LIVING_ROOM: {
    icon: resolveRoomTypeIcon('LIVING_ROOM'),
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
    gradient: 'from-emerald-50 to-white',
    borderColor: 'border-emerald-100',
  },
  LAUNDRY: {
    icon: resolveRoomTypeIcon('LAUNDRY'),
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-500',
    gradient: 'from-sky-50 to-white',
    borderColor: 'border-sky-100',
  },
  OFFICE: {
    icon: resolveRoomTypeIcon('OFFICE'),
    iconBg: 'bg-slate-50',
    iconColor: 'text-slate-500',
    gradient: 'from-slate-50 to-white',
    borderColor: 'border-slate-100',
  },
  GARAGE: {
    icon: resolveRoomTypeIcon('GARAGE'),
    iconBg: 'bg-zinc-50',
    iconColor: 'text-zinc-500',
    gradient: 'from-zinc-50 to-white',
    borderColor: 'border-zinc-100',
  },
  DINING: {
    icon: resolveRoomTypeIcon('DINING'),
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    gradient: 'from-orange-50 to-white',
    borderColor: 'border-orange-100',
  },
  DINING_ROOM: {
    icon: resolveRoomTypeIcon('DINING_ROOM'),
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    gradient: 'from-orange-50 to-white',
    borderColor: 'border-orange-100',
  },
  BASEMENT: {
    icon: resolveRoomTypeIcon('BASEMENT'),
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-500',
    gradient: 'from-indigo-50 to-white',
    borderColor: 'border-indigo-100',
  },
  ATTIC: {
    icon: resolveRoomTypeIcon('ATTIC'),
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-500',
    gradient: 'from-purple-50 to-white',
    borderColor: 'border-purple-100',
  },
  OTHER: {
    icon: resolveRoomTypeIcon('OTHER'),
    iconBg: 'bg-gray-100',
    iconColor: 'text-gray-500',
    gradient: 'from-gray-50 to-white',
    borderColor: 'border-gray-100',
  },
  DEFAULT: {
    icon: resolveRoomTypeIcon('UNKNOWN'),
    iconBg: 'bg-gray-100',
    iconColor: 'text-gray-400',
    gradient: 'from-gray-50 to-white',
    borderColor: 'border-gray-100',
  },
} as const;

export function getRoomConfig(type?: string | null): RoomConfig {
  const normalized = String(type || '').toUpperCase();
  if (!normalized) return ROOM_CONFIG.DEFAULT;
  if (normalized === 'LIVING') return ROOM_CONFIG.LIVING_ROOM;
  if (normalized === 'DINING_ROOM') return ROOM_CONFIG.DINING_ROOM;
  return ROOM_CONFIG[normalized] ?? ROOM_CONFIG.DEFAULT;
}
