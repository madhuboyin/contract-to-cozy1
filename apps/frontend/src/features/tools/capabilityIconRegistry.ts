import type { LucideIcon } from 'lucide-react';
import { HelpCircle } from 'lucide-react';
import { resolveIconByToken } from '@/lib/icons';

export const CAPABILITY_ICON_NAMES = [
  'alert-triangle',
  'badge-check',
  'bell',
  'bell-ring',
  'box',
  'building',
  'building-2',
  'calendar',
  'calendar-days',
  'clipboard-check',
  'clipboard-list',
  'cloud',
  'cloud-rain',
  'credit-card',
  'database',
  'dollar-sign',
  'droplet',
  'eye',
  'file-check',
  'file-text',
  'flame',
  'globe',
  'hammer',
  'key',
  'landmark',
  'layers',
  'layout-grid',
  'leaf',
  'lightbulb',
  'list-checks',
  'radar',
  'receipt',
  'refresh-cw',
  'search',
  'settings',
  'shield',
  'shield-alert',
  'shield-check',
  'siren',
  'sparkles',
  'sun',
  'thermometer',
  'tree-pine',
  'umbrella',
  'wind',
  'wrench',
  'zap',
] as const;

export type CapabilityIconName = typeof CAPABILITY_ICON_NAMES[number];

export const CAPABILITY_ICON_REGISTRY = Object.freeze(
  Object.fromEntries(
    CAPABILITY_ICON_NAMES.map((name) => [name, resolveIconByToken(name, HelpCircle)]),
  ),
) as Readonly<Record<CapabilityIconName, LucideIcon>>;

export function isCapabilityIconName(value: string): value is CapabilityIconName {
  return Object.prototype.hasOwnProperty.call(CAPABILITY_ICON_REGISTRY, value);
}

export function resolveCapabilityIcon(
  iconName: string,
  fallback: LucideIcon = HelpCircle,
): LucideIcon {
  return isCapabilityIconName(iconName)
    ? CAPABILITY_ICON_REGISTRY[iconName]
    : fallback;
}
