export const iconMapping = {
  inventory_categories: {
    APPLIANCE: 'Package',
    ELECTRICAL: 'Zap',
    PLUMBING: 'Droplets',
    HVAC: 'Wind',
    STRUCTURAL: 'Home',
    FLOORING: 'Layers',
    ROOFING: 'Umbrella',
    WINDOWS_DOORS: 'DoorOpen',
    LANDSCAPING: 'Leaf',
    SAFETY: 'ShieldAlert',
    SMART_HOME: 'Wifi',
    FURNITURE: 'Sofa',
    ELECTRONICS: 'Cpu',
    OUTDOOR: 'Sun',
    OTHER: 'HelpCircle',
  },
  room_types: {
    LIVING_ROOM: 'Sofa',
    KITCHEN: 'UtensilsCrossed',
    DINING: 'Coffee',
    BEDROOM: 'BedDouble',
    BATHROOM: 'Bath',
    GARAGE: 'Car',
    BASEMENT: 'ArrowDown',
    ATTIC: 'ArrowUp',
    OFFICE: 'Monitor',
    LAUNDRY: 'Package',
    OUTDOOR: 'Trees',
    OTHER: 'HelpCircle',
  },
  service_categories: {
    Plumbing: 'Droplets',
    Electrical: 'Zap',
    HVAC: 'Wind',
    Landscaping: 'Leaf',
    Cleaning: 'Brush',
    Renovation: 'Hammer',
    Roofing: 'Umbrella',
    'Pest Control': 'Bug',
    Security: 'Lock',
    Default: 'HelpCircle',
  },
  ai_tools: {
    coverage_intelligence: 'ShieldCheck',
    risk_radar: 'Radar',
    energy_audit: 'BatteryCharging',
    renovation_roi: 'TrendingUp',
    daily_snapshot: 'CalendarClock',
    appliance_advisor: 'Cpu',
    room_insights: 'Sparkles',
    seller_prep: 'Home',
    financial_efficiency: 'BarChart2',
    market_intel: 'Globe',
    predictive_maintenance: 'Activity',
    emergency_protocol: 'Siren',
    contractor_vetter: 'UserCheck',
    diy_guide: 'BookOpen',
    smart_home: 'Wifi',
  },
  home_tools: {
    rooms: 'LayoutGrid',
    inventory: 'Box',
    maintenance: 'Wrench',
    checklist: 'ListChecks',
    seasonal: 'CalendarDays',
    warranties: 'ShieldCheck',
    insurance: 'Shield',
    reports: 'BarChart2',
    documents: 'FolderOpen',
    expenses: 'Receipt',
  },
  core_nav: {
    home: 'Home',
    actions: 'AlertTriangle',
    rooms: 'LayoutGrid',
    services: 'Search',
    inventory: 'Box',
    more: 'Ellipsis',
    properties: 'Building',
    bookings: 'CalendarCheck',
    profile: 'Settings',
    logout: 'LogOut',
  },
  protection: {
    incidents: 'AlertOctagon',
    claims: 'FilePlus',
    recalls: 'RotateCcw',
  },
  insights: {
    daily_snapshot: 'CalendarClock',
    risk_radar: 'Radar',
    community_events: 'Calendar',
  },
  task_status: {
    PENDING: 'Clock',
    IN_PROGRESS: 'PlayCircle',
    COMPLETED: 'CheckCircle',
    CANCELLED: 'Ban',
    FAILED: 'XCircle',
  },
} as const;

type IconMapping = typeof iconMapping;
export type IconName =
  | IconMapping['inventory_categories'][keyof IconMapping['inventory_categories']]
  | IconMapping['room_types'][keyof IconMapping['room_types']]
  | IconMapping['service_categories'][keyof IconMapping['service_categories']]
  | IconMapping['ai_tools'][keyof IconMapping['ai_tools']]
  | IconMapping['home_tools'][keyof IconMapping['home_tools']]
  | IconMapping['core_nav'][keyof IconMapping['core_nav']]
  | IconMapping['protection'][keyof IconMapping['protection']]
  | IconMapping['insights'][keyof IconMapping['insights']]
  | IconMapping['task_status'][keyof IconMapping['task_status']];

type InventoryCategoryKey = keyof IconMapping['inventory_categories'];
type RoomTypeKey = keyof IconMapping['room_types'];
type ServiceCategoryKey = keyof IconMapping['service_categories'];
type AIToolKey = keyof IconMapping['ai_tools'];
type HomeToolKey = keyof IconMapping['home_tools'];
type CoreNavKey = keyof IconMapping['core_nav'];
type ProtectionKey = keyof IconMapping['protection'];
type InsightKey = keyof IconMapping['insights'];
type TaskStatusKey = keyof IconMapping['task_status'];

function normalizeLookupKey(value?: string | null): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[ -]+/g, '_');
}

const INVENTORY_CATEGORY_ALIASES: Record<string, InventoryCategoryKey> = {
  ROOF_EXTERIOR: 'ROOFING',
  ROOF_EXTERIORS: 'ROOFING',
  WINDOWS: 'WINDOWS_DOORS',
  DOORS: 'WINDOWS_DOORS',
  DEFAULT: 'OTHER',
};

const ROOM_TYPE_ALIASES: Record<string, RoomTypeKey> = {
  LIVING: 'LIVING_ROOM',
  DINING_ROOM: 'DINING',
  DEFAULT: 'OTHER',
};

const SERVICE_CATEGORY_ALIASES: Record<string, ServiceCategoryKey> = {
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Electrical',
  HVAC: 'HVAC',
  LANDSCAPING: 'Landscaping',
  CLEANING: 'Cleaning',
  RENOVATION: 'Renovation',
  ROOFING: 'Roofing',
  PEST_CONTROL: 'Pest Control',
  SECURITY: 'Security',
  HANDYMAN: 'Renovation',
  LOCKSMITH: 'Security',
  INSPECTION: 'Renovation',
  ATTORNEY: 'Default',
  MOVING: 'Default',
  WARRANTY: 'Default',
  INSURANCE: 'Default',
  DEFAULT: 'Default',
};

const AI_TOOL_ALIASES: Record<string, AIToolKey> = {
  COVERAGE_INTELLIGENCE: 'coverage_intelligence',
  RISK_PREMIUM_OPTIMIZER: 'risk_radar',
  DO_NOTHING_SIMULATOR: 'predictive_maintenance',
  HOME_SAVINGS: 'financial_efficiency',
  CLIMATE: 'risk_radar',
  ENERGY: 'energy_audit',
  VISUAL_INSPECTOR: 'room_insights',
  APPRECIATION: 'market_intel',
  BUDGET: 'financial_efficiency',
  TAX_APPEAL: 'financial_efficiency',
  MODIFICATIONS: 'seller_prep',
  ORACLE: 'appliance_advisor',
  DOCUMENTS: 'diy_guide',
  EMERGENCY: 'emergency_protocol',
  REPLACE_REPAIR: 'predictive_maintenance',
  VIEW_ALL: 'room_insights',
};

const AI_TOOL_ICON_OVERRIDES: Record<string, IconName> = {
  REPLACE_REPAIR: 'Wrench',
  DOCUMENTS: 'FolderOpen',
  EMERGENCY: 'Siren',
  VIEW_ALL: 'Sparkles',
};

const HOME_TOOL_ALIASES: Record<string, HomeToolKey> = {
  ROOMS: 'rooms',
  INVENTORY: 'inventory',
  MAINTENANCE: 'maintenance',
  CHECKLIST: 'checklist',
  SEASONAL: 'seasonal',
  WARRANTIES: 'warranties',
  INSURANCE: 'insurance',
  REPORTS: 'reports',
  DOCUMENTS: 'documents',
  EXPENSES: 'expenses',
};

const HOME_TOOL_ICON_OVERRIDES: Record<string, IconName> = {
  HOME_EVENT_RADAR: 'Radar',
  HOME_RENOVATION_RISK_ADVISOR: 'Hammer',
  PROPERTY_TAX: 'Receipt',
  COST_GROWTH: 'BarChart2',
  INSURANCE_TREND: 'Shield',
  NEGOTIATION_SHIELD: 'ShieldCheck',
  COST_EXPLAINER: 'BarChart2',
  TRUE_COST: 'Receipt',
  SELL_HOLD_RENT: 'BarChart2',
  COST_VOLATILITY: 'BarChart2',
  BREAK_EVEN: 'TrendingUp',
  CAPITAL_TIMELINE: 'CalendarClock',
  SELLER_PREP: 'Home',
  HOME_TIMELINE: 'CalendarClock',
  STATUS_BOARD: 'Activity',
  HOME_DIGITAL_WILL: 'BookOpen',
  HIDDEN_ASSET_FINDER: 'Sparkles',
  HOME_DIGITAL_TWIN: 'Layers',
  NEIGHBORHOOD_CHANGE_RADAR: 'Radar',
  'NEIGHBORHOOD-CHANGE-RADAR': 'Radar',
  HOME_HABIT_COACH: 'ListChecks',
  'HOME-HABIT-COACH': 'ListChecks',
};

const CORE_NAV_ALIASES: Record<string, CoreNavKey> = {
  DASHBOARD: 'home',
  HOME: 'home',
  ACTIONS: 'actions',
  ROOMS: 'rooms',
  SERVICES: 'services',
  PROVIDERS: 'services',
  INVENTORY: 'inventory',
  MORE: 'more',
  PROPERTIES: 'properties',
  BOOKINGS: 'bookings',
  PROFILE: 'profile',
  LOGOUT: 'logout',
};

const INSIGHT_ALIASES: Record<string, InsightKey> = {
  DAILY_SNAPSHOT: 'daily_snapshot',
  'DAILY-SNAPSHOT': 'daily_snapshot',
  RISK_RADAR: 'risk_radar',
  'RISK-RADAR': 'risk_radar',
  COMMUNITY_EVENTS: 'community_events',
  'COMMUNITY-EVENTS': 'community_events',
};

const TASK_STATUS_ALIASES: Record<string, TaskStatusKey> = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
};

export function getInventoryCategoryIcon(category?: string | null): IconName {
  const normalized = normalizeLookupKey(category);
  const canonical = (normalized in iconMapping.inventory_categories
    ? normalized
    : INVENTORY_CATEGORY_ALIASES[normalized]) as InventoryCategoryKey | undefined;
  return canonical
    ? iconMapping.inventory_categories[canonical]
    : iconMapping.inventory_categories.OTHER;
}

export function getRoomTypeIcon(roomType?: string | null): IconName {
  const normalized = normalizeLookupKey(roomType);
  const canonical = (normalized in iconMapping.room_types
    ? normalized
    : ROOM_TYPE_ALIASES[normalized]) as RoomTypeKey | undefined;
  return canonical ? iconMapping.room_types[canonical] : iconMapping.room_types.OTHER;
}

export function getServiceCategoryIcon(category?: string | null): IconName {
  const normalized = normalizeLookupKey(category);
  const canonical = SERVICE_CATEGORY_ALIASES[normalized] || 'Default';
  return iconMapping.service_categories[canonical];
}

export function getAiToolIcon(key?: string | null): IconName {
  const normalized = normalizeLookupKey(key).toLowerCase();
  const direct = normalized as AIToolKey;
  if (direct in iconMapping.ai_tools) {
    return iconMapping.ai_tools[direct];
  }
  const normalizedAlias = normalizeLookupKey(key);
  if (AI_TOOL_ICON_OVERRIDES[normalizedAlias]) {
    return AI_TOOL_ICON_OVERRIDES[normalizedAlias];
  }
  const canonical = AI_TOOL_ALIASES[normalizedAlias];
  return canonical ? iconMapping.ai_tools[canonical] : iconMapping.ai_tools.room_insights;
}

export function getHomeToolIcon(key?: string | null): IconName {
  const normalized = normalizeLookupKey(key).toLowerCase();
  const direct = normalized as HomeToolKey;
  if (direct in iconMapping.home_tools) {
    return iconMapping.home_tools[direct];
  }
  const normalizedAlias = normalizeLookupKey(key);
  if (HOME_TOOL_ICON_OVERRIDES[normalizedAlias]) {
    return HOME_TOOL_ICON_OVERRIDES[normalizedAlias];
  }
  const canonical = HOME_TOOL_ALIASES[normalizedAlias];
  return canonical ? iconMapping.home_tools[canonical] : iconMapping.home_tools.reports;
}

export function getCoreNavIcon(key?: string | null): IconName {
  const normalized = normalizeLookupKey(key);
  const canonical = CORE_NAV_ALIASES[normalized];
  return canonical ? iconMapping.core_nav[canonical] : iconMapping.core_nav.more;
}

export function getProtectionIcon(key?: string | null): IconName {
  const normalized = String(key || '').trim().toLowerCase();
  const map: Record<string, ProtectionKey> = {
    incidents: 'incidents',
    claims: 'claims',
    recalls: 'recalls',
  };
  const canonical = map[normalized];
  return canonical ? iconMapping.protection[canonical] : iconMapping.protection.incidents;
}

export function getInsightIcon(key?: string | null): IconName {
  const normalized = normalizeLookupKey(key);
  const canonical = INSIGHT_ALIASES[normalized];
  return canonical ? iconMapping.insights[canonical] : iconMapping.insights.daily_snapshot;
}

export function getTaskStatusIcon(status?: string | null): IconName {
  const normalized = normalizeLookupKey(status);
  const canonical = TASK_STATUS_ALIASES[normalized];
  return canonical ? iconMapping.task_status[canonical] : 'HelpCircle';
}
