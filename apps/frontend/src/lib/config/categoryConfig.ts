import type { LucideIcon } from 'lucide-react';
import { resolveInventoryCategoryIcon } from '@/lib/icons';

export const CATEGORY_CONFIG: Record<
  string,
  {
    icon: LucideIcon;
    iconBg: string;
    iconColor: string;
  }
> = {
  FURNITURE: {
    icon: resolveInventoryCategoryIcon('FURNITURE'),
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-500',
  },
  APPLIANCE: {
    icon: resolveInventoryCategoryIcon('APPLIANCE'),
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
  },
  ELECTRONICS: {
    icon: resolveInventoryCategoryIcon('ELECTRONICS'),
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-500',
  },
  HVAC: {
    icon: resolveInventoryCategoryIcon('HVAC'),
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-500',
  },
  PLUMBING: {
    icon: resolveInventoryCategoryIcon('PLUMBING'),
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-500',
  },
  STRUCTURAL: {
    icon: resolveInventoryCategoryIcon('STRUCTURAL'),
    iconBg: 'bg-slate-50',
    iconColor: 'text-slate-500',
  },
  ROOF_EXTERIOR: {
    icon: resolveInventoryCategoryIcon('ROOF_EXTERIOR'),
    iconBg: 'bg-slate-50',
    iconColor: 'text-slate-500',
  },
  ELECTRICAL: {
    icon: resolveInventoryCategoryIcon('ELECTRICAL'),
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
  },
  SAFETY: {
    icon: resolveInventoryCategoryIcon('SAFETY'),
    iconBg: 'bg-red-50',
    iconColor: 'text-red-500',
  },
  OUTDOOR: {
    icon: resolveInventoryCategoryIcon('OUTDOOR'),
    iconBg: 'bg-green-50',
    iconColor: 'text-green-500',
  },
  SMART_HOME: {
    icon: resolveInventoryCategoryIcon('SMART_HOME'),
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-500',
  },
  DEFAULT: {
    icon: resolveInventoryCategoryIcon('UNKNOWN'),
    iconBg: 'bg-gray-100',
    iconColor: 'text-gray-400',
  },
} as const;
