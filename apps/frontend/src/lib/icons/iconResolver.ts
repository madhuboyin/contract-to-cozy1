import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  BellRing,
  Box,
  Building,
  Building2,
  Bug,
  Calendar,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Cloud,
  CloudRain,
  CreditCard,
  Database,
  DollarSign,
  Droplet,
  Eye,
  FileCheck,
  FileText,
  Filter,
  Flame,
  Landmark,
  LayoutGrid,
  Leaf,
  Lightbulb,
  ListChecks,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Snowflake,
  Sun,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Thermometer,
  Trash2,
  TreePine,
  Truck,
  Umbrella,
  Wind,
  Wrench,
  Zap,
  Key,
  Calculator,
  Globe,
} from 'lucide-react';
import type { CanonicalIconToken, IconConcept } from './featureIconMap';
import { CONCEPT_ICON_MAP } from './featureIconMap';
import { NAVIGATION_ICONS } from './navigationIcons';
import { TOOL_ICON_MAP } from './toolIcons';
import maintenanceTemplateIcons from './maintenanceTemplateIcons.json';

type KnownResolverToken =
  | CanonicalIconToken
  | 'clipboard-list'
  | 'truck'
  | 'bug'
  | 'wind'
  | 'droplet'
  | 'leaf'
  | 'calculator'
  | 'key'
  | 'database'
  | 'bell-ring'
  | 'cloud-rain'
  | 'tree-pine'
  | 'flame'
  | 'umbrella'
  | 'settings'
  | 'building'
  | 'receipt'
  | 'sun'
  | 'snowflake'
  | 'thermometer'
  | 'globe';

const ICON_BY_TOKEN: Record<KnownResolverToken, LucideIcon> = {
  'alert-triangle': AlertTriangle,
  'badge-check': BadgeCheck,
  bell: Bell,
  box: Box,
  'building-2': Building2,
  calendar: Calendar,
  'calendar-days': CalendarDays,
  'clipboard-check': ClipboardCheck,
  cloud: Cloud,
  'credit-card': CreditCard,
  'dollar-sign': DollarSign,
  eye: Eye,
  'file-check': FileCheck,
  'file-text': FileText,
  filter: Filter,
  landmark: Landmark,
  'layout-grid': LayoutGrid,
  lightbulb: Lightbulb,
  'list-checks': ListChecks,
  pencil: Pencil,
  plus: Plus,
  'refresh-cw': RefreshCw,
  search: Search,
  shield: Shield,
  'shield-alert': ShieldAlert,
  'shield-check': ShieldCheck,
  siren: Siren,
  sparkles: Sparkles,
  'trash-2': Trash2,
  wrench: Wrench,
  zap: Zap,
  'clipboard-list': ClipboardList,
  truck: Truck,
  bug: Bug,
  wind: Wind,
  droplet: Droplet,
  leaf: Leaf,
  calculator: Calculator,
  key: Key,
  database: Database,
  'bell-ring': BellRing,
  'cloud-rain': CloudRain,
  'tree-pine': TreePine,
  flame: Flame,
  umbrella: Umbrella,
  settings: Settings,
  building: Building,
  receipt: CreditCard,
  sun: Sun,
  snowflake: Snowflake,
  thermometer: Thermometer,
  globe: Globe,
};

const TOKEN_ALIASES: Record<string, KnownResolverToken> = {
  building2: 'building-2',
  'clipboard-check': 'clipboard-check',
  clipboardcheck: 'clipboard-check',
  'clipboard-list': 'clipboard-list',
  clipboardlist: 'clipboard-list',
  dollar: 'dollar-sign',
  dollarsign: 'dollar-sign',
  filecheck: 'file-check',
  filetext: 'file-text',
  shieldalert: 'shield-alert',
  shieldcheck: 'shield-check',
  refresh: 'refresh-cw',
  refreshcw: 'refresh-cw',
  layoutgrid: 'layout-grid',
  calendardays: 'calendar-days',
  listchecks: 'list-checks',
  alert: 'alert-triangle',
  badgecheck: 'badge-check',
  creditcard: 'credit-card',
  treepine: 'tree-pine',
  cloudrain: 'cloud-rain',
  bellring: 'bell-ring',
};

const SERVICE_CATEGORY_ALIASES: Record<string, KnownResolverToken> = {
  inspection: 'clipboard-check',
  handyman: 'wrench',
  plumbing: 'droplet',
  electrical: 'zap',
  hvac: 'wind',
  cleaning: 'sparkles',
  landscaping: 'leaf',
  finance: 'calculator',
  warranty: 'shield-check',
  admin: 'clipboard-list',
  locksmith: 'key',
  attorney: 'file-text',
  moving: 'truck',
  pest_control: 'bug',
  pestcontrol: 'bug',
  insurance: 'shield-check',
};

function normalizeToken(token: string): string {
  return token.trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function coerceToken(token: string): KnownResolverToken | undefined {
  const normalized = normalizeToken(token);
  if (normalized in ICON_BY_TOKEN) {
    return normalized as KnownResolverToken;
  }
  return TOKEN_ALIASES[normalized];
}

export function resolveIconByToken(token: string, fallback: LucideIcon = FileText): LucideIcon {
  const resolved = coerceToken(token);
  if (!resolved) return fallback;
  return ICON_BY_TOKEN[resolved] || fallback;
}

export function resolveIconByConcept(concept: IconConcept, fallback: LucideIcon = FileText): LucideIcon {
  const definition = CONCEPT_ICON_MAP[concept];
  if (!definition) return fallback;
  return resolveIconByToken(definition.icon, fallback);
}

export function resolveHomeownerNavigationIcon(
  group: keyof typeof NAVIGATION_ICONS.homeowner,
  key: string,
  fallback: LucideIcon = FileText
): LucideIcon {
  const groupValue = NAVIGATION_ICONS.homeowner[group];
  if (!groupValue || typeof groupValue !== 'object') return fallback;
  const entry = (groupValue as Record<string, { icon: string }>)[key];
  return entry?.icon ? resolveIconByToken(entry.icon, fallback) : fallback;
}

export function resolveProviderNavigationIcon(
  key: keyof typeof NAVIGATION_ICONS.provider | string,
  fallback: LucideIcon = FileText
): LucideIcon {
  const entry = NAVIGATION_ICONS.provider[key as keyof typeof NAVIGATION_ICONS.provider];
  return entry?.icon ? resolveIconByToken(entry.icon, fallback) : fallback;
}

export function resolveToolIcon(
  group: keyof typeof TOOL_ICON_MAP,
  key: string,
  fallback: LucideIcon = Sparkles
): LucideIcon {
  const groupValue = TOOL_ICON_MAP[group] as Record<string, { icon: string } | undefined>;
  if (!groupValue) return fallback;
  const entry = groupValue[key];
  return entry?.icon ? resolveIconByToken(entry.icon, fallback) : fallback;
}

export function resolveServiceCategoryIcon(iconOrCategory: string, fallback: LucideIcon = Wrench): LucideIcon {
  const normalized = normalizeToken(iconOrCategory);
  const alias =
    SERVICE_CATEGORY_ALIASES[normalized] ||
    SERVICE_CATEGORY_ALIASES[normalized.replace(/-/g, '_')] ||
    coerceToken(normalized);
  if (alias) {
    return resolveIconByToken(alias, fallback);
  }
  return resolveIconByToken(iconOrCategory, fallback);
}

export function resolveMaintenanceTemplateIcon(input: {
  title?: string | null;
  serviceCategory?: string | null;
}): LucideIcon {
  const normalizedTitle = normalizeToken(input.title || '');
  const titleToken = normalizedTitle
    ? maintenanceTemplateIcons.titleIconMap[normalizedTitle as keyof typeof maintenanceTemplateIcons.titleIconMap]
    : undefined;
  if (titleToken) {
    return resolveIconByToken(titleToken, ClipboardCheck);
  }

  const categoryKey = (input.serviceCategory || '').trim().toUpperCase();
  const categoryToken = categoryKey
    ? maintenanceTemplateIcons.categoryFallbackMap[
        categoryKey as keyof typeof maintenanceTemplateIcons.categoryFallbackMap
      ]
    : undefined;
  if (categoryToken) {
    return resolveIconByToken(categoryToken, ClipboardCheck);
  }

  return resolveIconByToken(maintenanceTemplateIcons.defaultIcon, ClipboardCheck);
}
