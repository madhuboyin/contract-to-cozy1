export type CapabilityOutcomeCategory =
  | 'DECIDE_COMPARE'
  | 'PROTECT_MONITOR'
  | 'MAINTAIN_PREVENT'
  | 'PLAN_BUDGET'
  | 'SAVE_OPTIMIZE'
  | 'UNDERSTAND_HOME';

export type CapabilityPrimaryJob = 'STAY_AHEAD' | 'DECIDE' | 'MAJOR_MOMENT';

export type CapabilityPrimaryDestination =
  | 'HOME'
  | 'PLAN_PROJECTS'
  | 'HOME_RECORD'
  | 'ASK'
  | 'PROFILE_SETTINGS';

export type CapabilityContextType =
  | 'PROPERTY'
  | 'HOME_ACTION'
  | 'INVENTORY_ITEM'
  | 'DOCUMENT'
  | 'PROJECT'
  | 'ROOM'
  | 'ISSUE'
  | 'SERVICE'
  | 'JOURNEY';

export type CapabilityReadinessRequirement = {
  kind:
    | 'PROPERTY'
    | 'KNOWN_FACTS'
    | 'TRACKED_SYSTEMS'
    | 'COVERAGE_GAPS'
    | 'SOURCE_CONTEXT'
    | 'JURISDICTION';
  minimum?: number;
  contextType?: CapabilityContextType;
  reason: string;
};

export type CapabilityCatalogItem = {
  id: string;
  version: number;
  label: string;
  shortDescription: string;
  longDescription: string;
  iconName: string;
  outcomeCategory: CapabilityOutcomeCategory;
  primaryJob: CapabilityPrimaryJob;
  primaryDestination: CapabilityPrimaryDestination;
  intentAliases: string[];
  supportedContext: CapabilityContextType[];
  readinessRequirements: CapabilityReadinessRequirement[];
  expectedOutput: string;
  routeTemplate: string;
  href: string;
  workflowOnly: boolean;
  releaseStage: 'ACTIVE' | 'BETA';
  badges: Array<'NEW' | 'BETA'>;
};

export type CapabilityCatalog = {
  registryVersion: string;
  propertyId: string | null;
  workflowContextIncluded: boolean;
  capabilities: CapabilityCatalogItem[];
};

export type RelatedCapabilityItem = {
  capabilityId: string;
  manifestVersion: number;
  label: string;
  shortDescription: string;
  iconName: string;
  href: string;
  readiness: 'READY' | 'NEEDS_CONTEXT';
  reasonCode:
    | 'EXPLICIT_RELATIONSHIP'
    | 'OUTPUT_COMPATIBLE'
    | 'SHARED_TRIGGER_FAMILY'
    | 'TAXONOMY_SIMILARITY';
  score: number;
};

export type RelatedCapabilitiesResponse = {
  registryVersion: string;
  recommendationVersion: 'capability-related-v1';
  contextVersion: string;
  currentCapabilityId: string;
  suggestions: RelatedCapabilityItem[];
};
