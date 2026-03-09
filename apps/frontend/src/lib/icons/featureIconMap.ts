export type IconLibrary = 'lucide';

export type IconConcept =
  | 'property'
  | 'room'
  | 'inventory'
  | 'warranty'
  | 'insurance'
  | 'maintenance'
  | 'claims'
  | 'incidents'
  | 'recalls'
  | 'documents'
  | 'reports'
  | 'alerts'
  | 'payments'
  | 'expenses'
  | 'taxes'
  | 'appliances'
  | 'safety'
  | 'weather'
  | 'ai-tools'
  | 'search'
  | 'filter'
  | 'add'
  | 'edit'
  | 'delete'
  | 'review'
  | 'renewal'
  | 'protection'
  | 'risk'
  | 'coverage'
  | 'recommendations'
  | 'tasks'
  | 'calendar'
  | 'notifications'
  | 'status-board'
  | 'providers'
  | 'community-events';

export type CanonicalIconToken =
  | 'building-2'
  | 'layout-grid'
  | 'box'
  | 'badge-check'
  | 'shield'
  | 'wrench'
  | 'clipboard-check'
  | 'shield-alert'
  | 'siren'
  | 'file-text'
  | 'file-check'
  | 'alert-triangle'
  | 'credit-card'
  | 'dollar-sign'
  | 'landmark'
  | 'zap'
  | 'shield-check'
  | 'cloud'
  | 'sparkles'
  | 'search'
  | 'filter'
  | 'plus'
  | 'pencil'
  | 'trash-2'
  | 'eye'
  | 'refresh-cw'
  | 'lightbulb'
  | 'list-checks'
  | 'calendar'
  | 'bell'
  | 'calendar-days';

export type CanonicalIconDefinition = {
  icon: CanonicalIconToken;
  library: IconLibrary;
  category: string;
  notes: string;
};

export const CONCEPT_ICON_MAP: Record<IconConcept, CanonicalIconDefinition> = {
  property: { icon: 'building-2', library: 'lucide', category: 'navigation', notes: 'Property navigation and cards.' },
  room: { icon: 'layout-grid', library: 'lucide', category: 'navigation', notes: 'Room navigation and room surfaces.' },
  inventory: { icon: 'box', library: 'lucide', category: 'navigation', notes: 'Inventory navigation and inventory lists.' },
  warranty: { icon: 'badge-check', library: 'lucide', category: 'protection', notes: 'Warranty pages and renewal surfaces.' },
  insurance: { icon: 'shield', library: 'lucide', category: 'protection', notes: 'Insurance flows and policy surfaces.' },
  maintenance: { icon: 'wrench', library: 'lucide', category: 'operations', notes: 'Maintenance tasks and setup.' },
  claims: { icon: 'clipboard-check', library: 'lucide', category: 'protection', notes: 'Claims workflow and claim pages.' },
  incidents: { icon: 'shield-alert', library: 'lucide', category: 'protection', notes: 'Incident alerts and incident pages.' },
  recalls: { icon: 'siren', library: 'lucide', category: 'protection', notes: 'Recalls and recall actions.' },
  documents: { icon: 'file-text', library: 'lucide', category: 'admin', notes: 'Documents and uploads.' },
  reports: { icon: 'file-check', library: 'lucide', category: 'admin', notes: 'Reports and report summaries.' },
  alerts: { icon: 'alert-triangle', library: 'lucide', category: 'status', notes: 'Warnings and urgent actions.' },
  payments: { icon: 'credit-card', library: 'lucide', category: 'finance', notes: 'Payments and dues.' },
  expenses: { icon: 'dollar-sign', library: 'lucide', category: 'finance', notes: 'Expenses and budget flows.' },
  taxes: { icon: 'landmark', library: 'lucide', category: 'finance', notes: 'Tax planning and tax reminders.' },
  appliances: { icon: 'zap', library: 'lucide', category: 'inventory', notes: 'Appliance category and appliance insights.' },
  safety: { icon: 'shield-check', library: 'lucide', category: 'risk', notes: 'Safety-positive states.' },
  weather: { icon: 'cloud', library: 'lucide', category: 'risk', notes: 'Weather and climate risk.' },
  'ai-tools': { icon: 'sparkles', library: 'lucide', category: 'intelligence', notes: 'AI tools entry point.' },
  search: { icon: 'search', library: 'lucide', category: 'action', notes: 'Search controls.' },
  filter: { icon: 'filter', library: 'lucide', category: 'action', notes: 'Filter controls.' },
  add: { icon: 'plus', library: 'lucide', category: 'action', notes: 'Add/create actions.' },
  edit: { icon: 'pencil', library: 'lucide', category: 'action', notes: 'Edit/update actions.' },
  delete: { icon: 'trash-2', library: 'lucide', category: 'action', notes: 'Delete/remove actions.' },
  review: { icon: 'eye', library: 'lucide', category: 'action', notes: 'Review/preview actions.' },
  renewal: { icon: 'refresh-cw', library: 'lucide', category: 'lifecycle', notes: 'Renewal workflows.' },
  protection: { icon: 'shield-check', library: 'lucide', category: 'risk', notes: 'Protection indicators.' },
  risk: { icon: 'shield-alert', library: 'lucide', category: 'risk', notes: 'Risk indicators and risk alerts.' },
  coverage: { icon: 'shield-check', library: 'lucide', category: 'risk', notes: 'Coverage intelligence and coverage state.' },
  recommendations: { icon: 'lightbulb', library: 'lucide', category: 'insights', notes: 'Recommendation rows and cards.' },
  tasks: { icon: 'list-checks', library: 'lucide', category: 'operations', notes: 'Task/checklist UI.' },
  calendar: { icon: 'calendar', library: 'lucide', category: 'scheduling', notes: 'Calendar and booking flows.' },
  notifications: { icon: 'bell', library: 'lucide', category: 'status', notes: 'Notifications and notification center.' },
  'status-board': { icon: 'layout-grid', library: 'lucide', category: 'monitoring', notes: 'Status board surfaces.' },
  providers: { icon: 'search', library: 'lucide', category: 'navigation', notes: 'Service provider discovery.' },
  'community-events': { icon: 'calendar-days', library: 'lucide', category: 'community', notes: 'Community events features.' },
};

export const FEATURE_ICON_MAP = {
  navigation: {
    dashboard: 'property',
    actions: 'alerts',
    properties: 'property',
    rooms: 'room',
    inventory: 'inventory',
    bookings: 'calendar',
    providers: 'providers',
    warranties: 'warranty',
    insurance: 'insurance',
    expenses: 'expenses',
    documents: 'documents',
    reports: 'reports',
    incidents: 'incidents',
    claims: 'claims',
    recalls: 'recalls',
    notifications: 'notifications',
  },
  protection: {
    coverage: 'coverage',
    risk: 'risk',
    safety: 'safety',
    incidents: 'incidents',
    claims: 'claims',
    recalls: 'recalls',
  },
  finance: {
    expenses: 'expenses',
    payments: 'payments',
    taxes: 'taxes',
  },
  maintenance: {
    maintenance: 'maintenance',
    tasks: 'tasks',
    recommendations: 'recommendations',
    renewal: 'renewal',
  },
  tools: {
    aiTools: 'ai-tools',
    statusBoard: 'status-board',
    weather: 'weather',
    appliances: 'appliances',
  },
  community: {
    events: 'community-events',
  },
} as const satisfies Record<string, Record<string, IconConcept>>;

export type FeatureArea = keyof typeof FEATURE_ICON_MAP;

export function getConceptIcon(concept: IconConcept): CanonicalIconDefinition {
  return CONCEPT_ICON_MAP[concept];
}

export function getFeatureIconConcept(
  featureArea: FeatureArea,
  featureKey: string
): IconConcept | undefined {
  return FEATURE_ICON_MAP[featureArea][featureKey as keyof (typeof FEATURE_ICON_MAP)[FeatureArea]];
}

