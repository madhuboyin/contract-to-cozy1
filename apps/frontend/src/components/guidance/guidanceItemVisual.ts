import type { LucideIcon } from 'lucide-react';
import { Package } from 'lucide-react';
import { getInventoryItemIcon, resolveIcon } from '@/lib/icons';
import type { InventoryIconInput } from '@/lib/icons/getInventoryItemIcon';

// ── Category tone families ───────────────────────────────────────────────────
// Guidance-overview scoped — do not use on other surfaces.
// Tones follow a calm, premium palette: appliances=blue, water=teal,
// electronics=indigo, furniture=stone, HVAC=slate, electrical=amber.

type CategoryTones = {
  bg: string;
  color: string;
  selectedBg: string;
  selectedColor: string;
};

const GUIDANCE_CATEGORY_TONES: Record<string, CategoryTones> = {
  APPLIANCE:     { bg: 'bg-blue-50',    color: 'text-blue-600',    selectedBg: 'bg-blue-100',    selectedColor: 'text-blue-700'    },
  HVAC:          { bg: 'bg-slate-100',  color: 'text-slate-600',   selectedBg: 'bg-slate-200',   selectedColor: 'text-slate-700'   },
  PLUMBING:      { bg: 'bg-teal-50',    color: 'text-teal-600',    selectedBg: 'bg-teal-100',    selectedColor: 'text-teal-700'    },
  ELECTRICAL:    { bg: 'bg-amber-50',   color: 'text-amber-600',   selectedBg: 'bg-amber-100',   selectedColor: 'text-amber-700'   },
  ROOF_EXTERIOR: { bg: 'bg-stone-50',   color: 'text-stone-500',   selectedBg: 'bg-stone-100',   selectedColor: 'text-stone-600'   },
  SAFETY:        { bg: 'bg-rose-50',    color: 'text-rose-500',    selectedBg: 'bg-rose-100',    selectedColor: 'text-rose-600'    },
  SMART_HOME:    { bg: 'bg-violet-50',  color: 'text-violet-500',  selectedBg: 'bg-violet-100',  selectedColor: 'text-violet-600'  },
  FURNITURE:     { bg: 'bg-stone-50',   color: 'text-stone-500',   selectedBg: 'bg-stone-100',   selectedColor: 'text-stone-600'   },
  ELECTRONICS:   { bg: 'bg-indigo-50',  color: 'text-indigo-500',  selectedBg: 'bg-indigo-100',  selectedColor: 'text-indigo-600'  },
};

const TONE_FALLBACK: CategoryTones = {
  bg: 'bg-slate-100',
  color: 'text-slate-500',
  selectedBg: 'bg-slate-200',
  selectedColor: 'text-slate-600',
};

// ── Public type ───────────────────────────────────────────────────────────────

export type GuidanceItemVisual = CategoryTones & { icon: LucideIcon };

// ── Resolver ──────────────────────────────────────────────────────────────────
// 1. Resolves the best semantic icon for the item (item-name → keyword → category)
// 2. Picks the guidance-scoped category tone for the icon container.
// Preserves the existing resolution order in getInventoryItemIcon; only adds
// the guidance-specific color layer on top.

export function getGuidanceItemVisual(input: InventoryIconInput): GuidanceItemVisual {
  const iconName = getInventoryItemIcon(input);
  const icon = resolveIcon(iconName, Package);
  const tones = GUIDANCE_CATEGORY_TONES[input.category ?? ''] ?? TONE_FALLBACK;
  return { icon, ...tones };
}
