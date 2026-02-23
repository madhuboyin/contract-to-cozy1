import {
  Armchair,
  Building2,
  Droplets,
  Monitor,
  Package,
  Shield,
  Trees,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export const CATEGORY_CONFIG: Record<
  string,
  {
    icon: LucideIcon;
    iconBg: string;
    iconColor: string;
  }
> = {
  FURNITURE: { icon: Armchair, iconBg: 'bg-violet-50', iconColor: 'text-violet-500' },
  APPLIANCE: { icon: Zap, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
  ELECTRONICS: { icon: Monitor, iconBg: 'bg-blue-50', iconColor: 'text-blue-500' },
  HVAC: { icon: Wind, iconBg: 'bg-teal-50', iconColor: 'text-teal-500' },
  PLUMBING: { icon: Droplets, iconBg: 'bg-cyan-50', iconColor: 'text-cyan-500' },
  STRUCTURAL: { icon: Building2, iconBg: 'bg-slate-50', iconColor: 'text-slate-500' },
  ROOF_EXTERIOR: { icon: Building2, iconBg: 'bg-slate-50', iconColor: 'text-slate-500' },
  ELECTRICAL: { icon: Zap, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
  SAFETY: { icon: Shield, iconBg: 'bg-red-50', iconColor: 'text-red-500' },
  OUTDOOR: { icon: Trees, iconBg: 'bg-green-50', iconColor: 'text-green-500' },
  SMART_HOME: { icon: Zap, iconBg: 'bg-indigo-50', iconColor: 'text-indigo-500' },
  DEFAULT: { icon: Package, iconBg: 'bg-gray-100', iconColor: 'text-gray-400' },
} as const;
