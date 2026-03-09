import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Ban,
  BarChart2,
  Bath,
  BatteryCharging,
  BedDouble,
  Bell,
  BellRing,
  BookOpen,
  Box,
  Brush,
  Bug,
  Building,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Car,
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  Cloud,
  CloudRain,
  Coffee,
  Cpu,
  CreditCard,
  Database,
  DollarSign,
  DoorOpen,
  Droplet,
  Droplets,
  Ellipsis,
  Eye,
  FileCheck,
  FilePlus,
  FileText,
  Filter,
  Flame,
  FolderOpen,
  Globe,
  Hammer,
  HelpCircle,
  Home,
  Key,
  Landmark,
  Layers,
  LayoutGrid,
  Leaf,
  Lightbulb,
  ListChecks,
  Lock,
  LogOut,
  Monitor,
  Package,
  Pencil,
  PlayCircle,
  Plus,
  Radar,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Snowflake,
  Sofa,
  Sparkles,
  Sun,
  Thermometer,
  Trash2,
  TrendingUp,
  TreePine,
  Trees,
  Truck,
  Umbrella,
  UserCheck,
  UtensilsCrossed,
  Wifi,
  Wind,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  getAiToolIcon,
  getCoreNavIcon,
  getHomeToolIcon,
  getInsightIcon,
  getInventoryCategoryIcon,
  getProtectionIcon,
  getRoomTypeIcon,
  getServiceCategoryIcon as getServiceCategoryIconFromConfig,
  getTaskStatusIcon,
} from '@/lib/config/iconMapping';
import type { CanonicalIconToken, IconConcept } from './featureIconMap';
import { CONCEPT_ICON_MAP } from './featureIconMap';
import { NAVIGATION_ICONS } from './navigationIcons';
import { TOOL_ICON_MAP } from './toolIcons';
import maintenanceTemplateIcons from './maintenanceTemplateIcons.json';

export const lucideIconMap = {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Ban,
  BarChart2,
  Bath,
  BatteryCharging,
  BedDouble,
  Bell,
  BellRing,
  BookOpen,
  Box,
  Brush,
  Bug,
  Building,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Car,
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  Cloud,
  CloudRain,
  Coffee,
  Cpu,
  CreditCard,
  Database,
  DollarSign,
  DoorOpen,
  Droplet,
  Droplets,
  Ellipsis,
  Eye,
  FileCheck,
  FilePlus,
  FileText,
  Filter,
  Flame,
  FolderOpen,
  Globe,
  Hammer,
  HelpCircle,
  Home,
  Key,
  Landmark,
  Layers,
  LayoutGrid,
  Leaf,
  Lightbulb,
  ListChecks,
  Lock,
  LogOut,
  Monitor,
  Package,
  Pencil,
  PlayCircle,
  Plus,
  Radar,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Snowflake,
  Sofa,
  Sparkles,
  Sun,
  Thermometer,
  Trash2,
  TrendingUp,
  TreePine,
  Trees,
  Truck,
  Umbrella,
  UserCheck,
  UtensilsCrossed,
  Wifi,
  Wind,
  Wrench,
  XCircle,
  Zap,
} satisfies Record<string, LucideIcon>;

const LUCIDE_NAME_LOOKUP: Record<string, keyof typeof lucideIconMap> = Object.keys(lucideIconMap).reduce(
  (acc, key) => {
    acc[key.toLowerCase().replace(/[-_\s]/g, '')] = key as keyof typeof lucideIconMap;
    return acc;
  },
  {} as Record<string, keyof typeof lucideIconMap>
);

export function resolveIcon(name?: string | null, fallback: LucideIcon = HelpCircle): LucideIcon {
  if (!name) return fallback;
  const direct = lucideIconMap[name as keyof typeof lucideIconMap];
  if (direct) return direct;

  const normalized = String(name).toLowerCase().replace(/[-_\s]/g, '');
  const aliased = LUCIDE_NAME_LOOKUP[normalized];
  if (aliased) return lucideIconMap[aliased];

  return fallback;
}

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
  calculator: BarChart2,
  key: Key,
  database: Database,
  'bell-ring': BellRing,
  'cloud-rain': CloudRain,
  'tree-pine': TreePine,
  flame: Flame,
  umbrella: Umbrella,
  settings: Settings,
  building: Building,
  receipt: Receipt,
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

function resolveAnyIconReference(nameOrToken: string, fallback: LucideIcon): LucideIcon {
  const token = coerceToken(nameOrToken);
  if (token) return ICON_BY_TOKEN[token] || fallback;
  return resolveIcon(nameOrToken, fallback);
}

export function resolveIconByToken(token: string, fallback: LucideIcon = HelpCircle): LucideIcon {
  const resolved = coerceToken(token);
  if (!resolved) return resolveIcon(token, fallback);
  return ICON_BY_TOKEN[resolved] || fallback;
}

export function resolveIconByConcept(concept: IconConcept, fallback: LucideIcon = HelpCircle): LucideIcon {
  const definition = CONCEPT_ICON_MAP[concept];
  if (!definition) return fallback;
  return resolveIconByToken(definition.icon, fallback);
}

export function resolveHomeownerNavigationIcon(
  group: keyof typeof NAVIGATION_ICONS.homeowner,
  key: string,
  fallback: LucideIcon = HelpCircle
): LucideIcon {
  if (group === 'main') {
    return resolveIcon(getCoreNavIcon(key), fallback);
  }
  if (group === 'ownerGlobal') {
    return resolveIcon(getHomeToolIcon(key), fallback);
  }
  if (group === 'protection') {
    return resolveIcon(getProtectionIcon(key), fallback);
  }
  if (group === 'community') {
    return resolveIcon(getInsightIcon('community_events'), fallback);
  }

  const groupValue = NAVIGATION_ICONS.homeowner[group];
  if (!groupValue || typeof groupValue !== 'object') return fallback;
  const entry = (groupValue as Record<string, { icon: string }>)[key];
  return entry?.icon ? resolveAnyIconReference(entry.icon, fallback) : fallback;
}

export function resolveProviderNavigationIcon(
  key: keyof typeof NAVIGATION_ICONS.provider | string,
  fallback: LucideIcon = HelpCircle
): LucideIcon {
  const normalized = String(key).trim().toLowerCase();
  const providerCoreMap: Record<string, string> = {
    dashboard: 'home',
    bookings: 'bookings',
    services: 'services',
    calendar: 'bookings',
    profile: 'profile',
  };
  if (providerCoreMap[normalized]) {
    return resolveIcon(getCoreNavIcon(providerCoreMap[normalized]), fallback);
  }

  const entry = NAVIGATION_ICONS.provider[key as keyof typeof NAVIGATION_ICONS.provider];
  return entry?.icon ? resolveAnyIconReference(entry.icon, fallback) : fallback;
}

export function resolveToolIcon(
  group: keyof typeof TOOL_ICON_MAP,
  key: string,
  fallback: LucideIcon = Sparkles
): LucideIcon {
  if (group === 'ai') {
    return resolveIcon(getAiToolIcon(key), fallback);
  }
  if (group === 'home') {
    return resolveIcon(getHomeToolIcon(key), fallback);
  }
  if (group === 'insights') {
    return resolveIcon(getInsightIcon(key), fallback);
  }

  const groupValue = TOOL_ICON_MAP[group] as Record<string, { icon: string } | undefined>;
  if (!groupValue) return fallback;
  const entry = groupValue[key];
  return entry?.icon ? resolveAnyIconReference(entry.icon, fallback) : fallback;
}

export function resolveServiceCategoryIcon(iconOrCategory: string, fallback: LucideIcon = HelpCircle): LucideIcon {
  const fromSharedMapping = getServiceCategoryIconFromConfig(iconOrCategory);
  if (fromSharedMapping) {
    return resolveIcon(fromSharedMapping, fallback);
  }

  const normalized = normalizeToken(iconOrCategory);
  const alias =
    SERVICE_CATEGORY_ALIASES[normalized] ||
    SERVICE_CATEGORY_ALIASES[normalized.replace(/-/g, '_')] ||
    coerceToken(normalized);
  if (alias) {
    return resolveIconByToken(alias, fallback);
  }
  return resolveAnyIconReference(iconOrCategory, fallback);
}

export function resolveInventoryCategoryIcon(category: string, fallback: LucideIcon = HelpCircle): LucideIcon {
  return resolveIcon(getInventoryCategoryIcon(category), fallback);
}

export function resolveRoomTypeIcon(roomType: string, fallback: LucideIcon = HelpCircle): LucideIcon {
  return resolveIcon(getRoomTypeIcon(roomType), fallback);
}

export function resolveTaskStatusIcon(status: string, fallback: LucideIcon = HelpCircle): LucideIcon {
  return resolveIcon(getTaskStatusIcon(status), fallback);
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
    return resolveAnyIconReference(titleToken, ClipboardCheck);
  }

  const categoryKey = (input.serviceCategory || '').trim().toUpperCase();
  const categoryToken = categoryKey
    ? maintenanceTemplateIcons.categoryFallbackMap[
        categoryKey as keyof typeof maintenanceTemplateIcons.categoryFallbackMap
      ]
    : undefined;
  if (categoryToken) {
    return resolveAnyIconReference(categoryToken, ClipboardCheck);
  }

  return resolveAnyIconReference(maintenanceTemplateIcons.defaultIcon, ClipboardCheck);
}
