import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from '../askOperationRegistry';

export type AskRouteRetirementState =
  | 'LEGACY_ACTIVE'
  | 'ASK_PARITY_IN_PROGRESS'
  | 'ASK_CERTIFIED'
  | 'STRUCTURED_SURFACE_RETAINED'
  | 'RETIRED';

export type AskSuccessorDestination = 'HOME' | 'WORK' | 'RECORD' | 'SAVED' | 'HISTORY';

export interface AskRouteRetirementEntry {
  id: string;
  /** Anchored regular expression evaluated against a normalized `/dashboard/...` route template. */
  routePattern: string;
  owner: string;
  state: AskRouteRetirementState;
  askOperationIds: readonly AskOperationId[];
  missingReads: readonly string[];
  missingWrites: readonly string[];
  successorDestination: AskSuccessorDestination;
  deepLinkRule: 'PRESERVE_UNTIL_CERTIFIED' | 'MAP_TO_EXACT_ASK_CONTEXT' | 'KEEP_STRUCTURED_SURFACE';
  evidenceTests: readonly string[];
}

const entry = (value: AskRouteRetirementEntry): AskRouteRetirementEntry => Object.freeze(value);

/**
 * Phase 0 route-family inventory. Entries describe route families rather than individual files; the generated inventory expands
 * them against the frontend app tree and proves that every homeowner page resolves to exactly one disposition.
 */
export const ASK_ROUTE_RETIREMENT_REGISTRY: readonly AskRouteRetirementEntry[] = Object.freeze([
  entry({
    id: 'ask-shell', routePattern: '^/dashboard/ask$', owner: 'ask-platform', state: 'STRUCTURED_SURFACE_RETAINED',
    askOperationIds: [], missingReads: [], missingWrites: [], successorDestination: 'HOME',
    deepLinkRule: 'KEEP_STRUCTURED_SURFACE', evidenceTests: ['apps/frontend/src/features/ask/__tests__/destinations.test.ts'],
  }),
  entry({
    id: 'ask-work', routePattern: '^/dashboard/ask/work$', owner: 'ask-platform', state: 'STRUCTURED_SURFACE_RETAINED',
    askOperationIds: [], missingReads: ['complete canonical work index'], missingWrites: ['exact resume coverage for every work type'], successorDestination: 'WORK',
    deepLinkRule: 'KEEP_STRUCTURED_SURFACE', evidenceTests: ['apps/frontend/src/features/ask/__tests__/destinations.test.ts'],
  }),
  entry({
    id: 'ask-record', routePattern: '^/dashboard/ask/record$', owner: 'ask-platform', state: 'STRUCTURED_SURFACE_RETAINED',
    askOperationIds: ['PROPERTY_SUMMARY'], missingReads: ['pageable canonical record sections'], missingWrites: ['complete inline correction parity'], successorDestination: 'RECORD',
    deepLinkRule: 'KEEP_STRUCTURED_SURFACE', evidenceTests: ['apps/frontend/src/features/ask/__tests__/destinations.test.ts'],
  }),
  entry({
    id: 'ask-saved', routePattern: '^/dashboard/ask/saved$', owner: 'ask-platform', state: 'STRUCTURED_SURFACE_RETAINED',
    askOperationIds: [], missingReads: ['saved artifact index'], missingWrites: [], successorDestination: 'SAVED',
    deepLinkRule: 'KEEP_STRUCTURED_SURFACE', evidenceTests: ['apps/frontend/src/features/ask/__tests__/destinations.test.ts'],
  }),
  entry({
    id: 'ask-notifications', routePattern: '^/dashboard/ask/notifications$', owner: 'ask-platform', state: 'STRUCTURED_SURFACE_RETAINED',
    askOperationIds: [], missingReads: [], missingWrites: [], successorDestination: 'HOME',
    deepLinkRule: 'KEEP_STRUCTURED_SURFACE', evidenceTests: ['apps/frontend/src/components/ask/__tests__/AskNotificationsDestination.test.tsx'],
  }),
  entry({
    id: 'ask-history', routePattern: '^/dashboard/ask/history$', owner: 'ask-platform', state: 'STRUCTURED_SURFACE_RETAINED',
    askOperationIds: [], missingReads: [], missingWrites: [], successorDestination: 'HISTORY',
    deepLinkRule: 'KEEP_STRUCTURED_SURFACE', evidenceTests: ['apps/frontend/src/features/ask/__tests__/destinations.test.ts'],
  }),
  entry({
    id: 'property-records', routePattern: '^/dashboard/properties/(?:\\[id\\])/(?:documents|inventory|rooms|materials|vault|reports|property-brief)(?:/.*)?$',
    owner: 'home-record', state: 'ASK_PARITY_IN_PROGRESS',
    askOperationIds: ['PROPERTY_SUMMARY', 'DOCUMENT_LOOKUP', 'INVENTORY_LOOKUP', 'MATERIAL_SPECS_LIST', 'PROPERTY_BRIEFS_LIST'],
    missingReads: ['pageable record collections', 'scoped home-record export'], missingWrites: ['complete inline correction parity'],
    successorDestination: 'RECORD', deepLinkRule: 'PRESERVE_UNTIL_CERTIFIED', evidenceTests: [],
  }),
  entry({
    id: 'property-work', routePattern: '^/dashboard/properties/(?:\\[id\\])/(?:maintenance|home-operations|projects|renovations|buyer-plan|guidance|new-home-plan|seller-prep)(?:/.*)?$',
    owner: 'home-work', state: 'ASK_PARITY_IN_PROGRESS',
    askOperationIds: ['MAINTENANCE_STATUS', 'HOME_ACTIONS', 'PROJECT_TRACKER_PROJECTS', 'GUIDANCE_JOURNEY_CONTINUE', 'SELLER_PREP_CHECKLIST'],
    missingReads: ['complete canonical work index'], missingWrites: ['exact resume coverage for every work type'],
    successorDestination: 'WORK', deepLinkRule: 'PRESERVE_UNTIL_CERTIFIED', evidenceTests: [],
  }),
  entry({
    id: 'property-protection', routePattern: '^/dashboard/properties/(?:\\[id\\])/(?:claims|incidents|protect|recalls|inspection-hub|risk-assessment|focus/coverage|focus/health)(?:/.*)?$',
    owner: 'protection', state: 'LEGACY_ACTIVE',
    askOperationIds: ['INCIDENT_CLAIM_STATUS', 'INSPECTION_FINDINGS', 'RECALL_REVIEW', 'COVERAGE_GAPS'],
    missingReads: ['full audit and collection parity'], missingWrites: ['complete claim, incident, inspection, and recall command parity'],
    successorDestination: 'WORK', deepLinkRule: 'PRESERVE_UNTIL_CERTIFIED', evidenceTests: [],
  }),
  entry({
    id: 'property-intelligence', routePattern: '^/dashboard/properties/(?:\\[id\\])/(?:environment-report|financial-efficiency|health-score|home-score|ownership-costs|status-board|timeline|focus/maintenance|focus/renewal)(?:/.*)?$',
    owner: 'home-intelligence', state: 'LEGACY_ACTIVE',
    askOperationIds: ['ENVIRONMENT_REPORT', 'OWNERSHIP_COSTS', 'HOME_STATUS_BOARD', 'HOME_TIMELINE_EVENTS'],
    missingReads: ['destination projection parity'], missingWrites: ['registered continuation parity'],
    successorDestination: 'HOME', deepLinkRule: 'PRESERVE_UNTIL_CERTIFIED', evidenceTests: [],
  }),
  entry({
    id: 'property-tools', routePattern: '^/dashboard/properties/(?:\\[id\\])/(?:tools|save)(?:/.*)?$', owner: 'home-tools',
    state: 'LEGACY_ACTIVE', askOperationIds: ['CAPABILITY_DISCOVERY'],
    missingReads: ['per-tool certified read parity', 'saved artifact index'], missingWrites: ['per-tool command and artifact parity'],
    successorDestination: 'SAVED', deepLinkRule: 'PRESERVE_UNTIL_CERTIFIED', evidenceTests: [],
  }),
  entry({
    id: 'property-settings', routePattern: '^/dashboard/properties/(?:\\[id\\])/(?:edit|onboarding|household)(?:/.*)?$', owner: 'property-platform',
    state: 'STRUCTURED_SURFACE_RETAINED', askOperationIds: ['HOUSEHOLD_INVITATION'],
    missingReads: ['read-only household access summary'], missingWrites: ['household administration is deferred'],
    successorDestination: 'RECORD', deepLinkRule: 'KEEP_STRUCTURED_SURFACE', evidenceTests: [],
  }),
  entry({
    id: 'property-home', routePattern: '^/dashboard/properties/(?:\\[id\\])$', owner: 'property-platform', state: 'LEGACY_ACTIVE',
    askOperationIds: ['PROPERTY_SUMMARY'], missingReads: ['Home destination projection'], missingWrites: [], successorDestination: 'HOME',
    deepLinkRule: 'PRESERVE_UNTIL_CERTIFIED', evidenceTests: [],
  }),
  entry({
    id: 'property-other', routePattern: '^/dashboard/properties/(?:\\[id\\])/(?:modifications)(?:/.*)?$', owner: 'property-platform', state: 'LEGACY_ACTIVE',
    askOperationIds: [], missingReads: ['route-specific parity review'], missingWrites: ['route-specific parity review'], successorDestination: 'RECORD',
    deepLinkRule: 'PRESERVE_UNTIL_CERTIFIED', evidenceTests: [],
  }),
  entry({
    id: 'property-collection', routePattern: '^/dashboard/properties(?:/new)?$', owner: 'property-platform', state: 'STRUCTURED_SURFACE_RETAINED',
    askOperationIds: [], missingReads: [], missingWrites: [], successorDestination: 'HOME', deepLinkRule: 'KEEP_STRUCTURED_SURFACE', evidenceTests: [],
  }),
  entry({
    id: 'homeowner-settings', routePattern: '^/dashboard/(?:profile|personalization|notifications)$', owner: 'account-platform', state: 'STRUCTURED_SURFACE_RETAINED',
    askOperationIds: [], missingReads: [], missingWrites: [], successorDestination: 'HOME', deepLinkRule: 'KEEP_STRUCTURED_SURFACE', evidenceTests: [],
  }),
  entry({
    id: 'provider-marketplace', routePattern: '^/dashboard/providers(?:/.*)?$', owner: 'provider-marketplace', state: 'STRUCTURED_SURFACE_RETAINED',
    askOperationIds: [], missingReads: [], missingWrites: [], successorDestination: 'HOME', deepLinkRule: 'KEEP_STRUCTURED_SURFACE', evidenceTests: [],
  }),
  entry({
    id: 'top-level-records', routePattern: '^/dashboard/(?:documents|inventory|vault|warranties)(?:/.*)?$', owner: 'home-record', state: 'LEGACY_ACTIVE',
    askOperationIds: ['DOCUMENT_LOOKUP', 'INVENTORY_LOOKUP', 'WARRANTY_LOOKUP'], missingReads: ['complete Record destination parity'], missingWrites: ['inline correction parity'],
    successorDestination: 'RECORD', deepLinkRule: 'PRESERVE_UNTIL_CERTIFIED', evidenceTests: [],
  }),
  entry({
    id: 'top-level-work', routePattern: '^/dashboard/(?:maintenance|maintenance-setup|diy|bookings|moving-concierge|resolution-center|modifications)(?:/.*)?$', owner: 'home-work', state: 'LEGACY_ACTIVE',
    askOperationIds: ['MAINTENANCE_STATUS', 'DIY_PROJECTS'], missingReads: ['complete Work destination parity'], missingWrites: ['exact resume parity'],
    successorDestination: 'WORK', deepLinkRule: 'PRESERVE_UNTIL_CERTIFIED', evidenceTests: [],
  }),
  entry({
    id: 'top-level-finance', routePattern: '^/dashboard/(?:budget|expenses|financing|ownership-costs|home-savings|savings-benefits|tax-appeal|appreciation)(?:/.*)?$', owner: 'home-finance', state: 'LEGACY_ACTIVE',
    askOperationIds: ['FINANCING_OVERVIEW', 'OWNERSHIP_COSTS', 'SAVINGS_OPPORTUNITIES'], missingReads: ['route-specific calculation parity'], missingWrites: ['saved scenario and evidence parity'],
    successorDestination: 'SAVED', deepLinkRule: 'PRESERVE_UNTIL_CERTIFIED', evidenceTests: [],
  }),
  entry({
    id: 'top-level-protection', routePattern: '^/dashboard/(?:insurance|protect|coverage-intelligence|risk-radar|risk-premium-optimizer|home-renovation-risk-advisor|emergency)(?:/.*)?$', owner: 'protection', state: 'LEGACY_ACTIVE',
    askOperationIds: ['COVERAGE_GAPS', 'HOME_EVENT_RADAR_FEED'], missingReads: ['full protection workspace parity'], missingWrites: ['complete governed command parity'],
    successorDestination: 'WORK', deepLinkRule: 'PRESERVE_UNTIL_CERTIFIED', evidenceTests: [],
  }),
  entry({
    id: 'top-level-tools', routePattern: '^/dashboard/(?:ai-tools|home-tools|oracle|quote-comparison|replace-repair|save|seasonal|visual-inspector|climate|community-events|daily-snapshot|energy|envelope-coverage|home-event-radar|home-lab|hoa|neighbourhood-trust|permits|quote-comparison|do-nothing-simulator)(?:/.*)?$',
    owner: 'home-tools', state: 'LEGACY_ACTIVE', askOperationIds: ['CAPABILITY_DISCOVERY'], missingReads: ['per-tool certified parity'], missingWrites: ['per-tool command parity'],
    successorDestination: 'HOME', deepLinkRule: 'PRESERVE_UNTIL_CERTIFIED', evidenceTests: [],
  }),
  entry({
    id: 'dashboard-home', routePattern: '^/dashboard$', owner: 'home-platform', state: 'LEGACY_ACTIVE', askOperationIds: ['HOME_ACTIONS'],
    missingReads: ['Ask Home projection'], missingWrites: [], successorDestination: 'HOME', deepLinkRule: 'PRESERVE_UNTIL_CERTIFIED', evidenceTests: [],
  }),
]);

export interface AskRouteInventoryRow {
  route: string;
  registryId: string;
  owner: string;
  state: AskRouteRetirementState;
  askOperationIds: readonly AskOperationId[];
  successorDestination: AskSuccessorDestination;
  missingReads: readonly string[];
  missingWrites: readonly string[];
  deepLinkRule: AskRouteRetirementEntry['deepLinkRule'];
}

export function matchingAskRouteRetirementEntries(route: string): AskRouteRetirementEntry[] {
  return ASK_ROUTE_RETIREMENT_REGISTRY.filter((candidate) => new RegExp(candidate.routePattern).test(route));
}

export function buildHomeownerRouteInventory(routes: readonly string[]): { rows: AskRouteInventoryRow[]; issues: string[] } {
  const rows: AskRouteInventoryRow[] = [];
  const issues: string[] = [];
  for (const route of [...new Set(routes)].sort()) {
    const matches = matchingAskRouteRetirementEntries(route);
    if (matches.length !== 1) {
      issues.push(matches.length === 0 ? `${route}: no retirement disposition` : `${route}: ambiguous retirement disposition (${matches.map((match) => match.id).join(', ')})`);
      continue;
    }
    const match = matches[0];
    rows.push({
      route, registryId: match.id, owner: match.owner, state: match.state, askOperationIds: match.askOperationIds,
      successorDestination: match.successorDestination, missingReads: match.missingReads, missingWrites: match.missingWrites,
      deepLinkRule: match.deepLinkRule,
    });
  }
  return { rows, issues };
}

export function buildAskOperationInventory() {
  return Object.values(ASK_OPERATION_DEFINITIONS)
    .map((definition) => ({
      operationId: definition.operationId,
      family: definition.family,
      executionMode: definition.executionMode,
      safetyClass: definition.safetyClass,
      propertyRoleFloor: definition.propertyRoleFloor,
      requiresProperty: definition.requiresProperty,
      messageRoutable: definition.messageRoutable,
      adapterKey: definition.adapterKey,
    }))
    .sort((left, right) => left.operationId.localeCompare(right.operationId));
}

export function validateAskRouteRetirementRegistry(entries: readonly AskRouteRetirementEntry[] = ASK_ROUTE_RETIREMENT_REGISTRY): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const patterns = new Set<string>();
  for (const route of entries) {
    if (!route.id.trim() || ids.has(route.id)) issues.push(`route-retirement: duplicate or empty id ${route.id || '(empty)'}`);
    ids.add(route.id);
    if (patterns.has(route.routePattern)) issues.push(`route-retirement/${route.id}: duplicate route pattern`);
    patterns.add(route.routePattern);
    if (!route.owner.trim()) issues.push(`route-retirement/${route.id}: missing owner`);
    try {
      const pattern = new RegExp(route.routePattern);
      if (!route.routePattern.startsWith('^') || !route.routePattern.endsWith('$')) issues.push(`route-retirement/${route.id}: route pattern must be anchored`);
      if (!pattern.test('/dashboard') && !pattern.test('/dashboard/ask') && !route.routePattern.includes('/dashboard/')) {
        issues.push(`route-retirement/${route.id}: route pattern must target homeowner dashboard routes`);
      }
      if (pattern.test('/dashboard/admin')) issues.push(`route-retirement/${route.id}: homeowner registry must not match admin routes`);
    } catch {
      issues.push(`route-retirement/${route.id}: invalid route pattern`);
    }
    for (const operationId of route.askOperationIds) {
      if (!(operationId in ASK_OPERATION_DEFINITIONS)) issues.push(`route-retirement/${route.id}: unknown operation ${operationId}`);
    }
    if (route.state === 'RETIRED' && route.deepLinkRule !== 'MAP_TO_EXACT_ASK_CONTEXT') {
      issues.push(`route-retirement/${route.id}: retired routes require an exact Ask deep-link mapping`);
    }
  }
  return issues;
}

