export const RADAR_ACTION_REGISTRY_VERSION = 'radar-actions-v1' as const;

export const RADAR_ACTION_CODES = [
  'CHARGE_DEVICES',
  'CHECK_AIR_FILTERS',
  'CHECK_ATTIC_INSULATION',
  'CHECK_FENCING',
  'CHECK_GUTTERS',
  'CHECK_SURGE_PROTECTORS',
  'CLEAR_DRAINS',
  'COMPARE_PROVIDERS',
  'DOCUMENT_ROOF',
  'FOOD_SAFETY',
  'GET_QUOTES',
  'INSPECT_ROOF',
  'INSPECT_SUMP_PUMP',
  'MONITOR_SITUATION',
  'MOVE_VALUABLES',
  'PREPARE_APPEAL',
  'PREPARE_BACKUP_HEAT',
  'PROTECT_PIPES',
  'REVIEW_ASSESSMENT',
  'REVIEW_ENERGY_USAGE',
  'REVIEW_POLICY',
  'SEAL_WINDOWS',
  'SECURE_OUTDOOR_ITEMS',
  'SERVICE_HVAC',
  'SHUT_OFF_IRRIGATION',
  'UNPLUG_APPLIANCES',
  'UPDATE_BUDGET',
  'USE_AIR_PURIFIER',
  'VERIFY_COOLING',
] as const;

export type RadarActionCode = typeof RADAR_ACTION_CODES[number];
export type RadarActionEventFamily =
  | 'weather'
  | 'air_quality'
  | 'disaster'
  | 'utility'
  | 'tax'
  | 'insurance'
  | 'other';
export type RadarActionImpact = 'none' | 'watch' | 'moderate' | 'high';
export type RadarActionConfidence = 'low' | 'medium' | 'high';
export type RadarActionSafetyClassification =
  | 'general'
  | 'property_protection'
  | 'health_safety'
  | 'electrical_safety'
  | 'financial_review'
  | 'official_instruction';
export type RadarActionCompletionEvidence =
  | 'match_acknowledgement'
  | 'user_attestation'
  | 'downstream_capability'
  | 'official_source_view';
export type RadarActionResponsibilityApplicability =
  | 'not_applicable'
  | 'owner_action_or_coordination'
  | 'verify_when_unknown';
export type RadarActionRequiredContext =
  | 'property_id'
  | 'match_id'
  | 'event_id'
  | 'official_source_url'
  | 'responsibility_scope';
export type RadarActionTaskOperation =
  | 'create_task'
  | 'create_reminder'
  | 'link_existing_task';
export type RadarActionDestinationPurpose =
  | 'coverage_review'
  | 'service_pricing'
  | 'maintenance'
  | 'document_vault'
  | 'provider_search'
  | 'official_instructions'
  | 'other_tool';

type InformationalDestination = {
  kind: 'informational';
  targetCapability: null;
  routeTemplate: null;
  purpose: null;
  label: null;
  queryParams: null;
};

type InternalDestination = {
  kind: 'internal';
  targetCapability: string;
  routeTemplate: string;
  purpose: Exclude<
    RadarActionDestinationPurpose,
    'maintenance' | 'provider_search' | 'official_instructions'
  >;
  label: string;
  queryParams: Readonly<Record<string, string>>;
};

type WorkflowDestination = {
  kind: 'workflow';
  targetCapability: null;
  routeTemplate: '/dashboard/maintenance' | '/dashboard/providers';
  purpose: 'maintenance' | 'provider_search';
  label: string;
  queryParams: Readonly<Record<string, string>>;
};

type OfficialSourceDestination = {
  kind: 'official_source';
  targetCapability: null;
  routeTemplate: null;
  purpose: 'official_instructions';
  label: string;
  queryParams: null;
};

export type RadarActionDestinationDefinition =
  | InformationalDestination
  | InternalDestination
  | WorkflowDestination
  | OfficialSourceDestination;

export interface RadarActionDefinition {
  code: RadarActionCode;
  labelTemplate: string;
  eventFamilies: readonly RadarActionEventFamily[];
  minimumImpact: RadarActionImpact;
  minimumConfidence: RadarActionConfidence;
  destination: RadarActionDestinationDefinition;
  requiredContext: readonly RadarActionRequiredContext[];
  responsibilityApplicability: RadarActionResponsibilityApplicability;
  completionEvidence: RadarActionCompletionEvidence;
  safetyClassification: RadarActionSafetyClassification;
  supportedTaskOperations: readonly RadarActionTaskOperation[];
}

export interface RadarStoredAction {
  code?: unknown;
  label?: unknown;
  priority?: unknown;
  responsibilityScope?: unknown;
  responsibleParty?: unknown;
  applicability?: unknown;
}

export interface RadarProjectedAction {
  code: RadarActionCode;
  label: string;
  priority: 'high' | 'medium' | 'low';
  responsibilityScope?: string;
  responsibleParty?: string;
  applicability?: 'owner_action' | 'coordinate' | 'verify_responsibility';
  registryVersion: typeof RADAR_ACTION_REGISTRY_VERSION;
  completionEvidence: RadarActionCompletionEvidence;
  safetyClassification: RadarActionSafetyClassification;
  targetCapability: string | null;
  supportedTaskOperations: RadarActionTaskOperation[];
  destination: {
    kind: 'informational' | 'internal' | 'external';
    purpose: RadarActionDestinationPurpose | null;
    label: string | null;
    href: string | null;
  };
}

const ALL_FAMILIES: readonly RadarActionEventFamily[] = [
  'weather',
  'air_quality',
  'disaster',
  'utility',
  'tax',
  'insurance',
  'other',
];
const WEATHER_FAMILIES: readonly RadarActionEventFamily[] = ['weather', 'disaster'];
const PHYSICAL_CONTEXT: readonly RadarActionRequiredContext[] = [
  'property_id',
  'match_id',
  'event_id',
  'responsibility_scope',
];
const GENERAL_CONTEXT: readonly RadarActionRequiredContext[] = [
  'property_id',
  'match_id',
  'event_id',
];

const INFORMATIONAL: InformationalDestination = {
  kind: 'informational',
  targetCapability: null,
  routeTemplate: null,
  purpose: null,
  label: null,
  queryParams: null,
};

function internal(
  targetCapability: string,
  routeTemplate: string,
  purpose: InternalDestination['purpose'] = 'other_tool',
  label = 'Continue',
  queryParams: Readonly<Record<string, string>> = {},
): InternalDestination {
  return {
    kind: 'internal',
    targetCapability,
    routeTemplate,
    purpose,
    label,
    queryParams,
  };
}

function workflow(
  routeTemplate: WorkflowDestination['routeTemplate'],
  purpose: WorkflowDestination['purpose'],
  label: string,
  queryParams: Readonly<Record<string, string>> = {},
): WorkflowDestination {
  return {
    kind: 'workflow',
    targetCapability: null,
    routeTemplate,
    purpose,
    label,
    queryParams,
  };
}

const OFFICIAL_SOURCE: OfficialSourceDestination = {
  kind: 'official_source',
  targetCapability: null,
  routeTemplate: null,
  purpose: 'official_instructions',
  label: 'Open official instructions',
  queryParams: null,
};

const ALL_TASK_OPERATIONS: readonly RadarActionTaskOperation[] = [
  'create_task',
  'create_reminder',
  'link_existing_task',
];

function reviewedAction(
  definition: Omit<RadarActionDefinition, 'supportedTaskOperations'> & {
    taskOperations?: readonly RadarActionTaskOperation[];
  },
): RadarActionDefinition {
  const supportedTaskOperations: readonly RadarActionTaskOperation[] =
    definition.taskOperations
    ?? (definition.completionEvidence === 'user_attestation'
      ? ['create_task', 'create_reminder', 'link_existing_task']
      : ['create_reminder']);
  const { taskOperations: _taskOperations, ...reviewedDefinition } = definition;
  return { ...reviewedDefinition, supportedTaskOperations };
}

export const RADAR_ACTION_DEFINITIONS: readonly RadarActionDefinition[] = [
  reviewedAction({ code: 'CHARGE_DEVICES', labelTemplate: 'Charge phones, tablets, and backup batteries', eventFamilies: ['utility', 'weather', 'disaster'], minimumImpact: 'watch', minimumConfidence: 'low', destination: INFORMATIONAL, requiredContext: GENERAL_CONTEXT, responsibilityApplicability: 'not_applicable', completionEvidence: 'user_attestation', safetyClassification: 'general' }),
  reviewedAction({ code: 'CHECK_AIR_FILTERS', labelTemplate: 'Check or replace HVAC air filters', eventFamilies: ['weather', 'air_quality', 'disaster'], minimumImpact: 'watch', minimumConfidence: 'low', destination: workflow('/dashboard/maintenance', 'maintenance', 'Open maintenance plan', { view: 'open' }), requiredContext: PHYSICAL_CONTEXT, responsibilityApplicability: 'owner_action_or_coordination', completionEvidence: 'downstream_capability', safetyClassification: 'health_safety', taskOperations: ALL_TASK_OPERATIONS }),
  reviewedAction({ code: 'CHECK_ATTIC_INSULATION', labelTemplate: 'Check attic insulation to reduce heat transfer', eventFamilies: WEATHER_FAMILIES, minimumImpact: 'watch', minimumConfidence: 'medium', destination: INFORMATIONAL, requiredContext: PHYSICAL_CONTEXT, responsibilityApplicability: 'owner_action_or_coordination', completionEvidence: 'user_attestation', safetyClassification: 'property_protection' }),
  reviewedAction({ code: 'CHECK_FENCING', labelTemplate: 'Inspect fencing and gates for wind damage', eventFamilies: WEATHER_FAMILIES, minimumImpact: 'watch', minimumConfidence: 'medium', destination: INFORMATIONAL, requiredContext: PHYSICAL_CONTEXT, responsibilityApplicability: 'owner_action_or_coordination', completionEvidence: 'user_attestation', safetyClassification: 'property_protection' }),
  reviewedAction({ code: 'CHECK_GUTTERS', labelTemplate: 'Check gutters and downspouts', eventFamilies: WEATHER_FAMILIES, minimumImpact: 'watch', minimumConfidence: 'low', destination: INFORMATIONAL, requiredContext: PHYSICAL_CONTEXT, responsibilityApplicability: 'owner_action_or_coordination', completionEvidence: 'user_attestation', safetyClassification: 'property_protection' }),
  reviewedAction({ code: 'CHECK_SURGE_PROTECTORS', labelTemplate: 'Verify electronics use surge protection', eventFamilies: ['utility', 'weather', 'disaster'], minimumImpact: 'watch', minimumConfidence: 'medium', destination: INFORMATIONAL, requiredContext: PHYSICAL_CONTEXT, responsibilityApplicability: 'owner_action_or_coordination', completionEvidence: 'user_attestation', safetyClassification: 'electrical_safety' }),
  reviewedAction({ code: 'CLEAR_DRAINS', labelTemplate: 'Clear drains, gutters, and downspouts', eventFamilies: WEATHER_FAMILIES, minimumImpact: 'moderate', minimumConfidence: 'medium', destination: INFORMATIONAL, requiredContext: PHYSICAL_CONTEXT, responsibilityApplicability: 'owner_action_or_coordination', completionEvidence: 'user_attestation', safetyClassification: 'property_protection' }),
  reviewedAction({ code: 'COMPARE_PROVIDERS', labelTemplate: 'Compare utility providers or rate plans', eventFamilies: ['utility'], minimumImpact: 'watch', minimumConfidence: 'medium', destination: internal('home-savings', '/dashboard/home-savings'), requiredContext: GENERAL_CONTEXT, responsibilityApplicability: 'not_applicable', completionEvidence: 'downstream_capability', safetyClassification: 'financial_review' }),
  reviewedAction({ code: 'DOCUMENT_ROOF', labelTemplate: 'Document roof condition for insurance review', eventFamilies: ['insurance'], minimumImpact: 'moderate', minimumConfidence: 'medium', destination: internal('documents', '/dashboard/documents', 'document_vault', 'Upload roof documentation', { action: 'upload' }), requiredContext: PHYSICAL_CONTEXT, responsibilityApplicability: 'owner_action_or_coordination', completionEvidence: 'downstream_capability', safetyClassification: 'financial_review' }),
  reviewedAction({ code: 'FOOD_SAFETY', labelTemplate: 'Preserve refrigerator and freezer temperature', eventFamilies: ['utility', 'weather', 'disaster'], minimumImpact: 'watch', minimumConfidence: 'low', destination: INFORMATIONAL, requiredContext: GENERAL_CONTEXT, responsibilityApplicability: 'not_applicable', completionEvidence: 'match_acknowledgement', safetyClassification: 'health_safety' }),
  reviewedAction({ code: 'GET_QUOTES', labelTemplate: 'Compare reviewed insurance coverage options', eventFamilies: ['insurance'], minimumImpact: 'watch', minimumConfidence: 'medium', destination: internal('coverage-options', '/dashboard/properties/[id]/tools/coverage-options', 'coverage_review', 'Compare coverage options'), requiredContext: GENERAL_CONTEXT, responsibilityApplicability: 'not_applicable', completionEvidence: 'downstream_capability', safetyClassification: 'financial_review' }),
  reviewedAction({ code: 'INSPECT_ROOF', labelTemplate: 'Inspect roof shingles, flashing, and drainage', eventFamilies: WEATHER_FAMILIES, minimumImpact: 'watch', minimumConfidence: 'medium', destination: workflow('/dashboard/providers', 'provider_search', 'Find a roof professional', { category: 'INSPECTION', workCategory: 'ROOFING', serviceLabel: 'Roof inspection', intent: 'inspect_roof' }), requiredContext: PHYSICAL_CONTEXT, responsibilityApplicability: 'owner_action_or_coordination', completionEvidence: 'downstream_capability', safetyClassification: 'property_protection', taskOperations: ALL_TASK_OPERATIONS }),
  reviewedAction({ code: 'INSPECT_SUMP_PUMP', labelTemplate: 'Test the sump pump and backup', eventFamilies: WEATHER_FAMILIES, minimumImpact: 'moderate', minimumConfidence: 'medium', destination: INFORMATIONAL, requiredContext: PHYSICAL_CONTEXT, responsibilityApplicability: 'owner_action_or_coordination', completionEvidence: 'user_attestation', safetyClassification: 'property_protection' }),
  reviewedAction({ code: 'MONITOR_SITUATION', labelTemplate: 'Monitor official updates for this event', eventFamilies: ALL_FAMILIES, minimumImpact: 'none', minimumConfidence: 'low', destination: OFFICIAL_SOURCE, requiredContext: [...GENERAL_CONTEXT, 'official_source_url'], responsibilityApplicability: 'not_applicable', completionEvidence: 'official_source_view', safetyClassification: 'official_instruction' }),
  reviewedAction({ code: 'MOVE_VALUABLES', labelTemplate: 'Move valuables away from low-lying areas', eventFamilies: WEATHER_FAMILIES, minimumImpact: 'watch', minimumConfidence: 'medium', destination: INFORMATIONAL, requiredContext: GENERAL_CONTEXT, responsibilityApplicability: 'not_applicable', completionEvidence: 'user_attestation', safetyClassification: 'property_protection' }),
  reviewedAction({ code: 'PREPARE_APPEAL', labelTemplate: 'Prepare evidence for a property-tax appeal', eventFamilies: ['tax'], minimumImpact: 'watch', minimumConfidence: 'medium', destination: internal('tax-appeal', '/dashboard/tax-appeal'), requiredContext: GENERAL_CONTEXT, responsibilityApplicability: 'not_applicable', completionEvidence: 'downstream_capability', safetyClassification: 'financial_review' }),
  reviewedAction({ code: 'PREPARE_BACKUP_HEAT', labelTemplate: 'Prepare a safe backup heat source', eventFamilies: ['weather', 'utility', 'disaster'], minimumImpact: 'moderate', minimumConfidence: 'medium', destination: INFORMATIONAL, requiredContext: PHYSICAL_CONTEXT, responsibilityApplicability: 'owner_action_or_coordination', completionEvidence: 'user_attestation', safetyClassification: 'health_safety' }),
  reviewedAction({ code: 'PROTECT_PIPES', labelTemplate: 'Protect exposed plumbing before a freeze', eventFamilies: WEATHER_FAMILIES, minimumImpact: 'watch', minimumConfidence: 'medium', destination: INFORMATIONAL, requiredContext: PHYSICAL_CONTEXT, responsibilityApplicability: 'owner_action_or_coordination', completionEvidence: 'user_attestation', safetyClassification: 'property_protection' }),
  reviewedAction({ code: 'REVIEW_ASSESSMENT', labelTemplate: 'Review the property-tax assessment for accuracy', eventFamilies: ['tax'], minimumImpact: 'watch', minimumConfidence: 'medium', destination: internal('property-tax', '/dashboard/properties/[id]/tools/property-tax'), requiredContext: GENERAL_CONTEXT, responsibilityApplicability: 'not_applicable', completionEvidence: 'downstream_capability', safetyClassification: 'financial_review' }),
  reviewedAction({ code: 'REVIEW_ENERGY_USAGE', labelTemplate: 'Review home energy usage', eventFamilies: ['utility'], minimumImpact: 'watch', minimumConfidence: 'medium', destination: internal('energy', '/dashboard/energy'), requiredContext: GENERAL_CONTEXT, responsibilityApplicability: 'not_applicable', completionEvidence: 'downstream_capability', safetyClassification: 'financial_review' }),
  reviewedAction({ code: 'REVIEW_POLICY', labelTemplate: 'Review insurance coverage and limits', eventFamilies: ['insurance'], minimumImpact: 'watch', minimumConfidence: 'medium', destination: internal('coverage-intelligence', '/dashboard/coverage-intelligence', 'coverage_review', 'Open Coverage Intelligence'), requiredContext: GENERAL_CONTEXT, responsibilityApplicability: 'not_applicable', completionEvidence: 'downstream_capability', safetyClassification: 'financial_review' }),
  reviewedAction({ code: 'SEAL_WINDOWS', labelTemplate: 'Keep windows and doors closed', eventFamilies: ['air_quality', 'disaster'], minimumImpact: 'watch', minimumConfidence: 'low', destination: INFORMATIONAL, requiredContext: PHYSICAL_CONTEXT, responsibilityApplicability: 'owner_action_or_coordination', completionEvidence: 'user_attestation', safetyClassification: 'health_safety' }),
  reviewedAction({ code: 'SECURE_OUTDOOR_ITEMS', labelTemplate: 'Secure or bring in loose outdoor items', eventFamilies: WEATHER_FAMILIES, minimumImpact: 'watch', minimumConfidence: 'low', destination: INFORMATIONAL, requiredContext: PHYSICAL_CONTEXT, responsibilityApplicability: 'owner_action_or_coordination', completionEvidence: 'user_attestation', safetyClassification: 'property_protection' }),
  reviewedAction({ code: 'SERVICE_HVAC', labelTemplate: 'Arrange appropriate HVAC service', eventFamilies: [...WEATHER_FAMILIES, 'air_quality'], minimumImpact: 'moderate', minimumConfidence: 'medium', destination: internal('service-price-radar', '/dashboard/properties/[id]/tools/service-price-radar', 'service_pricing', 'Check HVAC service pricing', { category: 'HVAC', label: 'HVAC service' }), requiredContext: PHYSICAL_CONTEXT, responsibilityApplicability: 'owner_action_or_coordination', completionEvidence: 'downstream_capability', safetyClassification: 'health_safety', taskOperations: ALL_TASK_OPERATIONS }),
  reviewedAction({ code: 'SHUT_OFF_IRRIGATION', labelTemplate: 'Shut off and drain irrigation before a freeze', eventFamilies: WEATHER_FAMILIES, minimumImpact: 'moderate', minimumConfidence: 'medium', destination: INFORMATIONAL, requiredContext: PHYSICAL_CONTEXT, responsibilityApplicability: 'owner_action_or_coordination', completionEvidence: 'user_attestation', safetyClassification: 'property_protection' }),
  reviewedAction({ code: 'UNPLUG_APPLIANCES', labelTemplate: 'Unplug sensitive appliances when safe', eventFamilies: ['utility', 'weather', 'disaster'], minimumImpact: 'watch', minimumConfidence: 'medium', destination: INFORMATIONAL, requiredContext: GENERAL_CONTEXT, responsibilityApplicability: 'not_applicable', completionEvidence: 'user_attestation', safetyClassification: 'electrical_safety' }),
  reviewedAction({ code: 'UPDATE_BUDGET', labelTemplate: 'Update the homeownership budget', eventFamilies: ['tax'], minimumImpact: 'watch', minimumConfidence: 'medium', destination: internal('budget', '/dashboard/budget'), requiredContext: GENERAL_CONTEXT, responsibilityApplicability: 'not_applicable', completionEvidence: 'downstream_capability', safetyClassification: 'financial_review' }),
  reviewedAction({ code: 'USE_AIR_PURIFIER', labelTemplate: 'Use a HEPA air purifier indoors', eventFamilies: ['air_quality', 'disaster'], minimumImpact: 'watch', minimumConfidence: 'low', destination: INFORMATIONAL, requiredContext: GENERAL_CONTEXT, responsibilityApplicability: 'not_applicable', completionEvidence: 'user_attestation', safetyClassification: 'health_safety' }),
  reviewedAction({ code: 'VERIFY_COOLING', labelTemplate: 'Confirm access to a safe cooling option', eventFamilies: WEATHER_FAMILIES, minimumImpact: 'watch', minimumConfidence: 'low', destination: INFORMATIONAL, requiredContext: PHYSICAL_CONTEXT, responsibilityApplicability: 'verify_when_unknown', completionEvidence: 'user_attestation', safetyClassification: 'health_safety' }),
] as const;

const IMPACT_RANK: Record<RadarActionImpact, number> = {
  none: 0,
  watch: 1,
  moderate: 2,
  high: 3,
};
const CONFIDENCE_RANK: Record<RadarActionConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};
const PRIORITIES = new Set(['high', 'medium', 'low']);
const APPLICABILITIES = new Set(['owner_action', 'coordinate', 'verify_responsibility']);

function validateDefinitions(
  definitions: readonly RadarActionDefinition[],
): ReadonlyMap<RadarActionCode, RadarActionDefinition> {
  const allowedQueryKeys: Record<RadarActionDestinationPurpose, ReadonlySet<string>> = {
    coverage_review: new Set(),
    service_pricing: new Set(['category', 'label']),
    maintenance: new Set(['view']),
    document_vault: new Set(['action']),
    provider_search: new Set(['category', 'workCategory', 'serviceLabel', 'intent']),
    official_instructions: new Set(),
    other_tool: new Set(),
  };
  const byCode = new Map<RadarActionCode, RadarActionDefinition>();
  for (const definition of definitions) {
    if (byCode.has(definition.code)) {
      throw new Error(`Duplicate Radar action code: ${definition.code}`);
    }
    if (!definition.labelTemplate.trim() || definition.eventFamilies.length === 0) {
      throw new Error(`Incomplete Radar action definition: ${definition.code}`);
    }
    if (
      definition.destination.kind === 'internal'
      && (
        !definition.destination.targetCapability
        || !definition.destination.routeTemplate.startsWith('/dashboard')
        || definition.destination.routeTemplate.includes('://')
      )
    ) {
      throw new Error(`Unsafe Radar action destination: ${definition.code}`);
    }
    if (
      definition.destination.kind === 'workflow'
      && (
        !['/dashboard/maintenance', '/dashboard/providers']
          .includes(definition.destination.routeTemplate)
        || (
          definition.destination.purpose === 'maintenance'
          && definition.destination.routeTemplate !== '/dashboard/maintenance'
        )
        || (
          definition.destination.purpose === 'provider_search'
          && definition.destination.routeTemplate !== '/dashboard/providers'
        )
      )
    ) {
      throw new Error(`Unsafe Radar workflow destination: ${definition.code}`);
    }
    if (definition.destination.kind !== 'informational') {
      const destination = definition.destination;
      const allowedKeys = allowedQueryKeys[destination.purpose];
      const hasInvalidQueryParam = Object.entries(destination.queryParams ?? {}).some(
        ([key, value]) => (
          !allowedKeys.has(key)
          || !value.trim()
          || value.length > 120
          || /[\u0000-\u001F\u007F]/.test(value)
        ),
      );
      if (
        !destination.label.trim()
        || destination.label.length > 120
        || hasInvalidQueryParam
      ) {
        throw new Error(`Invalid Radar handoff policy: ${definition.code}`);
      }
    }
    if (
      !definition.requiredContext.includes('property_id')
      || !definition.requiredContext.includes('match_id')
      || !definition.requiredContext.includes('event_id')
      || (
        definition.destination.kind === 'official_source'
        && !definition.requiredContext.includes('official_source_url')
      )
      || (
        definition.responsibilityApplicability !== 'not_applicable'
        && !definition.requiredContext.includes('responsibility_scope')
      )
      || (
        ['internal', 'workflow'].includes(definition.destination.kind)
        && definition.completionEvidence !== 'downstream_capability'
      )
      || (
        definition.destination.kind === 'official_source'
        && definition.completionEvidence !== 'official_source_view'
      )
    ) {
      throw new Error(`Incoherent Radar action policy: ${definition.code}`);
    }
    if (
      definition.supportedTaskOperations.length === 0
      || new Set(definition.supportedTaskOperations).size
        !== definition.supportedTaskOperations.length
    ) {
      throw new Error(`Invalid Radar task operations: ${definition.code}`);
    }
    byCode.set(definition.code, Object.freeze(definition));
  }
  if (byCode.size !== RADAR_ACTION_CODES.length) {
    throw new Error('Radar action registry does not cover every reviewed action code');
  }
  return byCode;
}

export const RADAR_ACTION_REGISTRY = validateDefinitions(RADAR_ACTION_DEFINITIONS);

export function getRadarActionDefinition(code: unknown): RadarActionDefinition | null {
  return typeof code === 'string'
    ? RADAR_ACTION_REGISTRY.get(code as RadarActionCode) ?? null
    : null;
}

function internalHref(
  routeTemplate: string,
  propertyId: string,
  matchId: string,
  eventId: string,
  actionCode: RadarActionCode,
  queryParams: Readonly<Record<string, string>>,
  continuity: {
    incidentId?: string | null;
    guidanceJourneyId?: string | null;
    guidanceStepKey?: string | null;
  },
): string | null {
  if (
    !routeTemplate.startsWith('/dashboard')
    || routeTemplate.includes('://')
    || (routeTemplate.includes('[id]') && !propertyId)
  ) return null;
  const route = routeTemplate.replace(/\[id\]/g, encodeURIComponent(propertyId));
  if (/\[[^\]]+\]/.test(route)) return null;
  const url = new URL(route, 'https://radar.internal');
  for (const [key, value] of Object.entries(queryParams)) {
    if (key && value) url.searchParams.set(key, value);
  }
  url.searchParams.set('propertyId', propertyId);
  url.searchParams.set('radarMatchId', matchId);
  url.searchParams.set('radarEventId', eventId);
  url.searchParams.set('launchSurface', 'home_event_radar');
  url.searchParams.set('sourceEntityType', 'RADAR_MATCH');
  url.searchParams.set('sourceEntityId', matchId);
  url.searchParams.set('recommendationReason', actionCode);
  url.searchParams.set('recommendationVersion', RADAR_ACTION_REGISTRY_VERSION);
  url.searchParams.set('from', 'home-event-radar');
  const returnTo = new URL(
    `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/home-event-radar`,
    'https://radar.internal',
  );
  returnTo.searchParams.set('matchId', matchId);
  url.searchParams.set('returnTo', `${returnTo.pathname}${returnTo.search}`);
  if (continuity.incidentId) {
    url.searchParams.set('incidentId', continuity.incidentId);
  }
  if (continuity.guidanceJourneyId) {
    url.searchParams.set('journeyId', continuity.guidanceJourneyId);
    url.searchParams.set('guidanceJourneyId', continuity.guidanceJourneyId);
  }
  if (continuity.guidanceStepKey) {
    url.searchParams.set('guidanceStepKey', continuity.guidanceStepKey);
  }
  return `${url.pathname}${url.search}`;
}

function officialSourceHref(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : `${value[0].toLowerCase()}${value.slice(1)}`;
}

function projectedLabel(
  definition: RadarActionDefinition,
  applicability: RadarProjectedAction['applicability'],
  responsibleParty: string | undefined,
): string {
  if (applicability === 'coordinate') {
    const instruction = lowerFirst(definition.labelTemplate);
    if (responsibleParty === 'ASSOCIATION') {
      return `Contact your association to ${instruction}`;
    }
    if (responsibleParty === 'LANDLORD') {
      return `Contact your landlord to ${instruction}`;
    }
    return `Coordinate with the responsible party to ${instruction}`;
  }
  if (applicability === 'verify_responsibility') {
    return `Confirm responsibility, then ${lowerFirst(definition.labelTemplate)}`;
  }
  return definition.labelTemplate;
}

export function projectRadarActions(input: {
  storedActions: readonly RadarStoredAction[];
  sourceFamily: RadarActionEventFamily;
  impact: RadarActionImpact;
  confidence: RadarActionConfidence;
  propertyId: string;
  matchId: string;
  eventId: string;
  officialSourceUrl?: string | null;
  incidentId?: string | null;
  guidanceJourneyId?: string | null;
  guidanceStepKey?: string | null;
}): RadarProjectedAction[] {
  return input.storedActions.flatMap((storedAction) => {
    const definition = getRadarActionDefinition(storedAction.code);
    if (
      !definition
      || !definition.eventFamilies.includes(input.sourceFamily)
      || IMPACT_RANK[input.impact] < IMPACT_RANK[definition.minimumImpact]
      || CONFIDENCE_RANK[input.confidence] < CONFIDENCE_RANK[definition.minimumConfidence]
      || !PRIORITIES.has(String(storedAction.priority))
    ) return [];

    const href = (
      definition.destination.kind === 'internal'
      || definition.destination.kind === 'workflow'
    )
      ? internalHref(
          definition.destination.routeTemplate,
          input.propertyId,
          input.matchId,
          input.eventId,
          definition.code,
          definition.destination.queryParams ?? {},
          {
            incidentId: input.incidentId,
            guidanceJourneyId: input.guidanceJourneyId,
            guidanceStepKey: input.guidanceStepKey,
          },
        )
      : definition.destination.kind === 'official_source'
        ? officialSourceHref(input.officialSourceUrl)
        : null;
    const kind = (
      definition.destination.kind === 'internal'
      || definition.destination.kind === 'workflow'
    ) && href
      ? 'internal'
      : definition.destination.kind === 'official_source' && href
        ? 'external'
        : 'informational';
    const hasResponsibilityPolicy =
      definition.responsibilityApplicability !== 'not_applicable';
    const responsibilityScope = hasResponsibilityPolicy
      && typeof storedAction.responsibilityScope === 'string'
      && storedAction.responsibilityScope.length <= 128
      ? storedAction.responsibilityScope
      : undefined;
    const responsibleParty = hasResponsibilityPolicy
      && typeof storedAction.responsibleParty === 'string'
      && storedAction.responsibleParty.length <= 128
      ? storedAction.responsibleParty
      : undefined;
    const applicability = hasResponsibilityPolicy
      && APPLICABILITIES.has(String(storedAction.applicability))
      ? storedAction.applicability as RadarProjectedAction['applicability']
      : undefined;

    return [{
      code: definition.code,
      label: projectedLabel(definition, applicability, responsibleParty),
      priority: storedAction.priority as RadarProjectedAction['priority'],
      ...(responsibilityScope ? { responsibilityScope } : {}),
      ...(responsibleParty ? { responsibleParty } : {}),
      ...(applicability ? { applicability } : {}),
      registryVersion: RADAR_ACTION_REGISTRY_VERSION,
      completionEvidence: definition.completionEvidence,
      safetyClassification: definition.safetyClassification,
      targetCapability: definition.destination.targetCapability,
      supportedTaskOperations: [...definition.supportedTaskOperations],
      destination: {
        kind,
        purpose: kind === 'informational' ? null : definition.destination.purpose,
        label: kind === 'informational' ? null : definition.destination.label,
        href,
      },
    }];
  });
}
