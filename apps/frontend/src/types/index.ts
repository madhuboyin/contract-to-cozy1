// apps/frontend/src/types/index.ts
/**
 * Checklist Item Status - Synced with Backend Enum
 */
export type ChecklistItemStatus = 'PENDING' | 'COMPLETED' | 'NOT_NEEDED';

/**
 * User Roles
 */
export type UserRole = 'HOMEOWNER' | 'PROVIDER' | 'ADMIN';

/**
 * User Status
 */
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

/**
 * Booking Status
 */
export type BookingStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED';

/**
 * Service Category - Synced with Backend Enum
 */
export type ServiceCategory =
  | 'INSPECTION'
  | 'HANDYMAN'
  | 'GENERAL_HANDYMAN'
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'HVAC'
  | 'ROOFING'
  | 'WATER_HEATER'
  | 'FOUNDATION'
  | 'WINDOWS_DOORS'
  | 'INSULATION'
  | 'LANDSCAPING'
  | 'LANDSCAPING_DRAINAGE'
  | 'GUTTERS'
  | 'SOLAR'
  | 'FLOORING'
  | 'PAINTING'
  | 'SIDING'
  | 'MOLD_REMEDIATION'
  | 'APPLIANCE_REPAIR'
  | 'APPLIANCE_REPLACEMENT'
  | 'SECURITY_SAFETY'
  | 'CLEANING'
  | 'MOVING'
  | 'PEST_CONTROL'
  | 'LOCKSMITH'
  | 'INSURANCE'
  | 'ATTORNEY'
  | 'FINANCE'
  | 'WARRANTY'
  | 'ADMIN'
  | 'OTHER';

  export type WarrantyCategory = 
  | 'APPLIANCE'
  | 'HVAC'
  | 'ROOFING'
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'STRUCTURAL'
  | 'HOME_WARRANTY_PLAN'
  | 'OTHER';

  export type LocalUpdateCategory =
  | 'INTERNET'
  | 'INSURANCE'
  | 'MAINTENANCE'
  | 'ENERGY';  

// ---- Inventory Types ----

export type InventoryItemCategory =
  | 'APPLIANCE'
  | 'HVAC'
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'ROOF_EXTERIOR'
  | 'SAFETY'
  | 'SMART_HOME'
  | 'FURNITURE'
  | 'ELECTRONICS'
  | 'INTERIOR'
  | 'STRUCTURAL'
  | 'EXTERIOR'
  | 'SITE'
  | 'OTHER';

export type InventoryItemCondition = 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'UNKNOWN';
export type InventoryCoverageState = 'CONFIRMED' | 'MISSING' | 'MANAGED_ELSEWHERE' | 'INCOMPLETE' | 'NOT_REQUIRED';
export type InventoryRecordGroup = 'SYSTEMS_STRUCTURE' | 'APPLIANCES_BELONGINGS';

export type ImportBatchStatus = 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'ROLLED_BACK';

export type InventoryImportBatch = {
  id: string;
  propertyId: string;
  createdByUserId: string | null;
  fileName: string | null;
  templateVersion: number;
  status: ImportBatchStatus;
  createdCount: number;
  skippedCount: number;
  errorCount: number;
  notes: string | null;
  meta: any | null;
  createdAt: string;
  updatedAt: string;
};

export type InventoryRoom = {
  id: string;
  propertyId: string;
  name: string;
  floorLevel: number | null;
  sortOrder: number;
  itemCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type InventoryItem = {
  id: string;
  propertyId: string;
  roomId: string | null;

  warrantyId: string | null;
  insurancePolicyId: string | null;

  name: string;
  category: InventoryItemCategory;
  condition: InventoryItemCondition;

  brand: string | null;
  model: string | null;
  serialNo: string | null;

  installedOn: string | null;
  purchasedOn: string | null;
  lastServicedOn: string | null;

  purchaseCostCents: number | null;
  replacementCostCents: number | null;
  currency: string;

  notes: string | null;
  tags: string[];
  sourceHash: string | null;

  coverageNotRequired: boolean;
  coverageEvidenceStatus?: 'UNKNOWN' | 'NONE' | 'NOT_SURE';

  // Backend-owned Home Record presentation. These values keep cards,
  // summaries, and coverage actions on the same applicability policy.
  displayName?: string;
  recordGroup?: InventoryRecordGroup;
  locationLabel?: string;
  provenanceLabel?: string | null;
  isInferred?: boolean;
  responsibilityScope?: string | null;
  responsibleParty?: 'OWNER' | 'ASSOCIATION' | 'LANDLORD' | 'SHARED' | 'UNKNOWN' | null;
  coverageState?: InventoryCoverageState;
  coverageStateLabel?: string;
  coverageStateDetail?: string;
  coverageActionable?: boolean;
  missingContext?: string[];
  effectiveReplacementCostCents?: number | null;
  replacementValueSource?: 'RECORDED' | 'ESTIMATED' | null;
  sourceType?: 'MANUAL' | 'BULK_UPLOAD' | 'MOBILE_SCAN' | 'INTEGRATION';
  isVerified?: boolean;
  verificationSource?: string | null;
  assetType?: string | null;

  createdAt: string;
  updatedAt: string;

  room?: InventoryRoom | null;

  // If your backend includes these (it does in our code)
  warranty?: any | null;
  insurancePolicy?: any | null;

  documents?: any[]; // Document type exists already in your project; you can replace later
};

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
  code?: string;
};


/**
 * Recurrence Frequency Enum
 */
export enum RecurrenceFrequency {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  SEMI_ANNUALLY = 'SEMI_ANNUALLY',
  ANNUALLY = 'ANNUALLY',
}

export type ActivationEntryContextInput = {
  entryPath: 'EXISTING_OWNER_TRIGGER' | 'EXISTING_HOME_PURCHASE' | 'NEW_HOME_SETUP' | 'MAJOR_MOMENT' | 'EXPLORATION';
  ownershipState: 'SHOPPING' | 'UNDER_CONTRACT' | 'RECENT_OWNER' | 'ESTABLISHED_OWNER' | 'PREPARING_TRANSFER' | 'UNKNOWN';
  propertyOrigin: 'EXISTING_HOME' | 'NEW_CONSTRUCTION' | 'UNKNOWN';
  activeTrigger: {
    type: 'REPAIR' | 'REPLACEMENT' | 'CONTRACTOR_QUOTE' | 'MAINTENANCE_BACKLOG' | 'INSURANCE_COVERAGE' |
      'RENEWAL_DEADLINE' | 'PROJECT' | 'ANTICIPATED_COST' | 'INSPECTION_FINDING' |
      'PUNCH_LIST_WARRANTY' | 'CLAIM_DAMAGE' | 'SELLING_TRANSFER' | 'OTHER' | 'NONE_EXPLORING';
    label: string;
    detail?: string | null;
    entityType: 'PROPERTY' | 'INVENTORY_ITEM' | 'HOME_SYSTEM' | 'DOCUMENT' | 'QUOTE' | 'POLICY' |
      'WARRANTY' | 'PROJECT' | 'INCIDENT' | 'FREE_TEXT' | 'UNKNOWN';
    entityId?: string | null;
    source: 'USER_SELECTED' | 'CONVERSATION' | 'DOCUMENT' | 'PHOTO' | 'SYSTEM_SIGNAL' | 'OTHER';
  };
  consentContext?: string | null;
  sourceMetadata?: Record<string, unknown> | null;
};

export type ActivationHomeActionDTO = {
    id: string;
    priority: 'NOW' | 'SOON' | 'PLAN' | 'CONSIDER';
    signal: string;
    whyItMatters: string;
    recommendedAction: string;
    expectedOutcome: string;
    timing: {
      dueAt: string | null;
      windowStart: string | null;
      windowEnd: string | null;
      rationale: string;
    };
    evidence: Array<{ id: string; label: string; source: string; freshness: string; confidence: number | null }>;
    assumptions: Array<{ key: string; label: string; value: string; editable: boolean }>;
    confidence: { score: number | null; label: 'LOW' | 'MEDIUM' | 'HIGH'; missing: string[] };
    primaryCta: { label: string; href: string };
    secondaryCtas: Array<{ label: string; href: string }>;
};

export type ActivationFirstValueDTO = {
  entryContext: {
    id: string;
    activeTrigger: { type: string; label: string; detail: string | null };
    firstValue: { type: string; deliveredAt: string | null };
  };
  action: ActivationHomeActionDTO;
  baseline: {
    supportedFacts: Array<{ label: string; value: string; source: string }>;
    unknownFacts: string[];
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  plan: Record<'NOW' | 'SOON' | 'PLAN' | 'CONSIDER', ActivationHomeActionDTO[]>;
};

export type ActivationTriggerEvidenceInput = {
  kind: 'FREE_TEXT' | 'CONVERSATION' | 'DOCUMENT' | 'QUOTE' | 'INVOICE' | 'PHOTO' | 'EMAIL_PDF';
  label: string;
  detail?: string | null;
  documentId?: string | null;
  observedAt?: string | null;
  consentContext: string;
};

export type HomeActionCommand =
  | 'COMPLETE'
  | 'DEFER'
  | 'SNOOZE'
  | 'DISMISS'
  | 'ALREADY_DONE'
  | 'NOT_RELEVANT'
  | 'NO_MORTGAGE'
  | 'CORRECT_FACT'
  | 'ACKNOWLEDGE'
  | 'REMOVE_FROM_HOME';

// Home Operations Item #16: shared with the write-API surface below, so the
// work-item state machine is typed in exactly one place on the frontend.
export type OperationalWorkItemState =
  | 'CANDIDATE' | 'ACCEPTED' | 'SCHEDULED' | 'IN_PROGRESS' | 'IN_GUIDANCE' | 'IN_PROJECT'
  | 'BLOCKED' | 'DEFERRED' | 'REPORTED_COMPLETE' | 'REOPENED' | 'VERIFIED' | 'FOLLOW_UP_DUE' | 'CLOSED';
export type OperationalWorkItemAcceptanceState = 'PROPOSED' | 'ACCEPTED' | 'DECLINED';
export type OperationalWorkItemDisposition = 'NOT_RELEVANT' | 'DUPLICATE' | 'EXPIRED' | 'DISMISSED';
export type OperationalWorkEvidenceType =
  | 'PROPERTY_FACT' | 'DOCUMENT' | 'HOME_EVENT' | 'USER_ATTESTATION' | 'DOMAIN_COMPLETION_RECORD' | 'SYSTEM_DERIVATION';
export type OperationalWorkEvidenceVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
export type ClosureDispositionRule = 'REQUIRED' | 'FORBIDDEN' | 'OPTIONAL';

export type WorkItemListEntryDTO = {
  id: string;
  workKey: string;
  subjectType: string;
  subjectId: string;
  obligationType: string;
  state: OperationalWorkItemState;
  acceptanceState: OperationalWorkItemAcceptanceState;
  disposition: OperationalWorkItemDisposition | null;
  priority: 'NOW' | 'SOON' | 'PLAN' | 'CONSIDER';
  safetyTier: 'LOW_CONSEQUENCE' | 'MATERIAL_FINANCIAL' | 'REGULATED_COVERAGE' | 'SAFETY_EMERGENCY';
  title: string;
  homeownerReason: string;
  expectedOutcome: string;
  dueWindowStart: string | null;
  dueAt: string | null;
  dueWindowEnd: string | null;
  scheduleOverrideAt: string | null;
  recurrenceTemplateKey: string | null;
  occurrenceKey: string | null;
  ownerUserId: string | null;
  confidence: number | null;
  missingContext: string[];
  snoozedUntil: string | null;
  understoodAt: string | null;
  materialApprovalRequired: boolean;
  materialApprovedAt: string | null;
  isRoutine: boolean;
  executions: Array<{ executionType: string; executionEntityId: string; role: string; responsibleParty: string }>;
  reconciliationPending: boolean;
  supersededByWorkItemId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkItemDetailDTO = WorkItemListEntryDTO & {
  acceptedAt: string | null;
  startedAt: string | null;
  reportedCompletedAt: string | null;
  verifiedAt: string | null;
  deferredUntil: string | null;
  dismissedAt: string | null;
  closedAt: string | null;
  sources: Array<{ sourceType: string; sourceEntityId: string; sourceVersion: string | null; sourceRole: string; active: boolean }>;
  executions: Array<{ executionType: string; executionEntityId: string; role: string; responsibleParty: string }>;
  evidence: Array<{
    id: string;
    evidenceType: OperationalWorkEvidenceType;
    evidenceEntityId: string;
    verificationStatus: OperationalWorkEvidenceVerificationStatus | null;
    observedAt: string;
  }>;
  watchers: Array<{ userId: string; addedAt: string }>;
  materialApprovedByUserId: string | null;
  // Home Operations Item #16: computed server-side so the frontend never
  // carries its own copy of the state machine.
  legalNextStates: OperationalWorkItemState[];
  closureDispositionRule: ClosureDispositionRule | null;
};

export type RankedHomeActionDTO = ActivationHomeActionDTO & {
  lineageId: string;
  state: 'OPEN' | 'IN_PROGRESS' | 'SNOOZED' | 'COMPLETED' | 'DEFERRED' | 'DISMISSED' | 'SUPERSEDED';
  job: 'STAY_AHEAD' | 'DECIDE' | 'MAJOR_MOMENT';
  source: { kind: string; entityId: string; version: string | null };
  governance: { safetyTier: 'LOW_CONSEQUENCE' | 'MATERIAL_FINANCIAL' | 'REGULATED_COVERAGE' | 'SAFETY_EMERGENCY' };
  feedbackControls: HomeActionCommand[];
  ranking: {
    rank: number;
    score: number;
    explanation: string;
    components: {
      consequence: number;
      urgency: number;
      confidence: number;
      householdRelevance: number;
      actionability: number;
      missingContextPenalty: number;
    };
  };
  deduplication: { canonicalKey: string; mergedActionIds: string[] };
  // Home Operations Slice 2: the durable work item this action resolved to,
  // if it represents genuine work (Maintenance/Guidance/Project/Incident/
  // Recall/Coverage) rather than an advisory-only recommendation. null for
  // advisory sources and for a resolution that failed this request.
  workItem: {
    id: string;
    workKey: string;
    state: OperationalWorkItemState;
    acceptanceState: OperationalWorkItemAcceptanceState;
    disposition: OperationalWorkItemDisposition | null;
  } | null;
};

export type HomeFirstValueInsightDTO = {
  kind: 'WATCH' | 'VERIFIED_OUTLOOK' | 'MONITORING_READY';
  badge: string;
  title: string;
  summary: string;
  detail: string;
  timeframe: string | null;
  source: string;
  href: string;
  generatedAt: string;
};

// Home Operations Item #12 (§5.16): distinguishes why the ranked action feed
// is empty instead of implying "nothing needs attention" in every case.
// Non-null only when diagnostics.surfacedCount === 0.
export type HomeActionEmptyStateReason =
  | 'DATA_UNAVAILABLE'
  | 'RECOMMENDATIONS_PAUSED'
  | 'SOURCE_EVALUATION_PENDING'
  | 'MISSING_FACTS'
  | 'NO_ACCEPTED_WORK'
  | 'ALL_CAUGHT_UP';

export type HomeActionFeedDTO = {
  contractVersion: 'phase2-v1';
  propertyId: string;
  generatedAt: string;
  actions: RankedHomeActionDTO[];
  firstValueInsight: HomeFirstValueInsightDTO | null;
  buckets: Record<'NOW' | 'SOON' | 'PLAN' | 'CONSIDER', RankedHomeActionDTO[]>;
  diagnostics: {
    candidateCount: number;
    surfacedCount: number;
    duplicateCount: number;
    suppressedCount: number;
    snoozedCount: number;
    promotedCount: number;
    personalization: {
      status: 'AVAILABLE' | 'PAUSED' | 'FAILED';
      evaluatedCount: number;
      activeCount: number;
    };
    emptyStateReason: HomeActionEmptyStateReason | null;
  };
};

export type CapabilitySuggestionDTO = {
  suggestionId: string;
  capabilityId: string;
  manifestVersion: number;
  recommendationVersion: 'capability-recommendation-v1';
  contextVersion: string;
  rank: number;
  scoreBand: 'LOW' | 'MEDIUM' | 'HIGH';
  label: string;
  shortDescription: string;
  iconName: string;
  outcomeCategory: string;
  reasonCode: string;
  whyNow: string;
  expectedOutcome: string;
  readiness: {
    state: 'READY' | 'NEEDS_CONTEXT';
    reasonCodes: string[];
    missingFactKeys: string[];
    explanations: string[];
  };
  evidence: {
    mode: 'STRUCTURED_ONLY' | 'OMIT';
    summary: string | null;
    sourceObservedAt: string | null;
    actionConfidence: {
      score: number | null;
      label: 'LOW' | 'MEDIUM' | 'HIGH';
    } | null;
    contextWarningCodes: Array<'CONFLICT' | 'STALE_SOURCE' | 'PARTIAL_SCOPE'>;
  };
  source: {
    kind:
      | 'HOME_ACTION'
      | 'JOURNEY'
      | 'PROJECT'
      | 'PROPERTY_CONTEXT'
      | 'PERSONALIZATION'
      | 'COMPLETION';
    id: string;
    actionId: string | null;
    journeyId: string | null;
    entityType: string | null;
    entityId: string | null;
    sourceVersion: string | null;
    observedAt: string | null;
  };
  launch: {
    label: string;
    href: string;
  };
};

export type CapabilitySuggestionSurfaceDTO =
  | 'HOME'
  | 'PROPERTY'
  | 'WORKFLOW'
  | 'RELATED'
  | 'COMPLETION';

export type CapabilitySuggestionResponseDTO = {
  contractVersion: 'capability-suggestions-v1';
  registryVersion: string;
  recommendationVersion: 'capability-recommendation-v1';
  contextVersion: string;
  generatedAt: string;
  surface: CapabilitySuggestionSurfaceDTO;
  suggestions: CapabilitySuggestionDTO[];
};

export type CapabilityFeedbackTypeDTO =
  | 'OPENED'
  | 'DISMISSED'
  | 'NOT_RELEVANT'
  | 'SNOOZED'
  | 'COMPLETED';

export type CapabilityFeedbackResponseDTO = {
  status: 'RECORDED' | 'DUPLICATE';
  eventId: string;
  type: CapabilityFeedbackTypeDTO;
  recordedAt: string;
};

export type CapabilityCompletionNextResponseDTO = {
  contractVersion: 'capability-completion-next-v1';
  propertyId: string;
  recordedAt: string;
  completion: {
    capabilityId: string;
    capabilityVersion: number;
    completionKind: import('@/features/tools/capabilityTypes').CapabilityCompletionEventType;
    outputEntityType: import('@/features/tools/capabilityTypes').CapabilityContextType;
    outputEntityId: string;
  };
  registryVersion: string;
  recommendationVersion: 'capability-recommendation-v1';
  contextVersion: string;
  suggestion: CapabilitySuggestionDTO | null;
  exploreToolsHref: string;
};

export type UnifiedHomeCapabilitySuggestionsDTO =
  Omit<CapabilitySuggestionResponseDTO, 'surface'> & {
    status: 'AVAILABLE' | 'DISABLED' | 'UNAVAILABLE';
    surface: 'HOME';
  };

export type UnifiedHomeDTO = {
  contractVersion: 'phase2-home-v1';
  property: {
    id: string;
    name: string;
    address: string;
    dwellingType: string;
    updatedAt: string;
  };
  propertyContext: {
    contextVersion: string;
    scopes: PropertyContextScope[];
    completenessPercent: number;
    knownFactCount: number;
    missingFactCount: number;
    conflictedFactCount: number;
    staleFactCount: number;
    warningCount: number;
  };
  attention: {
    actions: RankedHomeActionDTO[];
    totalCount: number;
    planHref: string;
    firstValueInsight: HomeFirstValueInsightDTO | null;
  };
  decisions: RankedHomeActionDTO[];
  capabilitySuggestions: UnifiedHomeCapabilitySuggestionsDTO;
  activeMajorMoment: null | {
    kind: 'PROJECT' | 'GUIDANCE_JOURNEY';
    id: string;
    title: string;
    stage: string;
    blocker: string | null;
    nextMilestone: string;
    href: string;
  };
  glance: {
    recordCompleteness: number;
    knownPropertyFacts: number;
    trackedSystems: number;
    verifiedSystems: number;
    documentCount: number;
    verifiedDocumentCount: number;
    coverageGapCount: number;
    openWorkCount: number;
    recentChanges: Array<{
      id: string;
      title: string;
      summary: string | null;
      type: string;
      importance: string;
      occurredAt: string;
    }>;
    recordHref: string;
    systemsHref: string;
    coverageHref: string;
    workHref: string;
  };
  diagnostics: HomeActionFeedDTO['diagnostics'];
  generatedAt: string;
};

export type ToolDiscoveryAvailabilityDTO = {
  releaseMode?: 'INTERNAL_BETA' | 'REAL_USER_LAUNCH';
  failureMode?: 'BETA_FAIL_OPEN' | 'LAUNCH_FAIL_CLOSED';
  releaseReady?: boolean;
  releaseBlockers?: string[];
  enabled: boolean;
  enforceReleaseGates: boolean;
  disabledToolIds: string[];
  unknownDisabledToolIds?: string[];
  brokenRouteToolIds?: string[];
  unknownBrokenRouteToolIds?: string[];
  releaseGateBlockedToolIds?: string[];
  unknownReleaseGateBlockedToolIds?: string[];
  registryVersion?: string;
  expectedRegistryVersion?: string | null;
  registryVersionMatches?: boolean;
  manifestVersions?: Record<string, number>;
  manifestVersionMismatchedToolIds?: string[];
  configurationValid?: boolean;
  invalidConfigurationEntries?: string[];
  manifestVersionConfigValid?: boolean;
  invalidManifestVersionEntries?: string[];
  rolloutKeyParity?: {
    valid: boolean;
    missingKeys: string[];
    unknownKeys: string[];
  };
  rollouts: Record<string, {
    enabled: boolean;
    cohort: 'DISABLED' | 'INTERNAL' | 'BETA' | 'FULL';
    rolloutPct: number;
  }>;
  generatedAt: string;
};

export type ToolLifecycleStageDTO =
  | 'DISCOVERED'
  | 'CLICKED'
  | 'STARTED'
  | 'OUTPUT_GENERATED'
  | 'COMPLETED'
  | 'ABANDONED'
  | 'DISMISSED'
  | 'NOT_RELEVANT'
  | 'SNOOZED';

export type ToolLifecycleEventDTO = {
  toolId: string;
  stage: ToolLifecycleStageDTO;
  surface: string;
  manifestVersion?: number | null;
  registryVersion?: string | null;
  recommendationReason?: string | null;
  reasonCode?: string | null;
  recommendationVersion?: string | null;
  contextVersion?: string | null;
  sourceKind?: 'HOME_ACTION' | 'JOURNEY' | 'PROJECT' | 'PROPERTY_CONTEXT' | 'PERSONALIZATION' | 'COMPLETION' | 'CATALOG' | 'DIRECT' | null;
  sourceId?: string | null;
  sourceActionId?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  journeyId?: string | null;
  readiness?: 'READY' | 'NEEDS_CONTEXT' | 'UNKNOWN' | null;
  rolloutCohort?: 'DISABLED' | 'INTERNAL' | 'BETA' | 'FULL' | 'UNKNOWN' | null;
  completionKind?: string | null;
  outputKey?: string | null;
  durationSeconds?: number | null;
  sessionKey?: string | null;
  metadata?: Record<string, unknown> | null;
};

// ============================================================================
// NEW PROPERTY ENUMS (FIX: ADDED RUNTIME CONSTANTS)
// ============================================================================

export type DwellingType =
  | 'DETACHED_SINGLE_FAMILY' | 'ATTACHED_SINGLE_FAMILY' | 'TOWNHOUSE' | 'CONDO_UNIT'
  | 'APARTMENT_UNIT' | 'DUPLEX' | 'MULTI_FAMILY' | 'MANUFACTURED_HOME' | 'OTHER' | 'UNKNOWN';
export type OwnershipForm = 'FEE_SIMPLE' | 'CONDOMINIUM' | 'COOPERATIVE' | 'LEASEHOLD' | 'OTHER' | 'UNKNOWN';
export type PropertyUse =
  | 'PRIMARY_RESIDENCE' | 'SECOND_HOME' | 'LONG_TERM_RENTAL' | 'SHORT_TERM_RENTAL'
  | 'VACANT' | 'UNDER_RENOVATION' | 'FOR_SALE' | 'OTHER' | 'UNKNOWN';
export type OccupancyStatus = 'OWNER_OCCUPIED' | 'TENANT_OCCUPIED' | 'FAMILY_OCCUPIED' | 'MIXED' | 'VACANT' | 'UNKNOWN';
export type OutdoorSpaceType = 'PRIVATE_YARD' | 'BALCONY' | 'PATIO' | 'DECK' | 'GARDEN_BED' | 'SHARED_YARD' | 'ROOFTOP';
export type PropertyResponsibilityScope =
  | 'ROOF' | 'BUILDING_EXTERIOR' | 'LANDSCAPING' | 'TREES_SHRUBS'
  | 'DRIVEWAY_WALKWAYS' | 'DECK_PATIO_BALCONY' | 'PLUMBING' | 'HVAC'
  | 'COMMON_SAFETY' | 'SNOW_ICE' | 'PEST_CONTROL' | 'SHARED_SYSTEMS';
export type ResponsibleParty = 'OWNER' | 'ASSOCIATION' | 'LANDLORD' | 'SHARED' | 'UNKNOWN';

export interface PropertyResponsibilityInput {
  scope: PropertyResponsibilityScope;
  party: ResponsibleParty;
  notes?: string | null;
}

export interface PropertyExteriorProfile {
  hasPrivateOutdoorSpace?: boolean | null;
  outdoorSpaceTypes?: OutdoorSpaceType[];
  lotSizeSqFt?: number | null;
  hasLawn?: boolean | null;
  hasTreesOrShrubs?: boolean | null;
  hasDriveway?: boolean | null;
  hasFence?: boolean | null;
  hasPoolOrSpa?: boolean | null;
  hasIrrigation?: boolean | null;
  hasOutdoorFaucets?: boolean | null;
  hasDrainageIssues?: boolean | null;
}

export const HeatingTypes = {
  HVAC: 'HVAC',
  FURNACE: 'FURNACE',
  HEAT_PUMP: 'HEAT_PUMP',
  RADIATORS: 'RADIATORS',
  UNKNOWN: 'UNKNOWN',
} as const;
export type HeatingType = keyof typeof HeatingTypes;

export const CoolingTypes = {
  CENTRAL_AC: 'CENTRAL_AC',
  WINDOW_AC: 'WINDOW_AC',
  UNKNOWN: 'UNKNOWN',
} as const;
export type CoolingType = keyof typeof CoolingTypes;

export const WaterHeaterTypes = {
  TANK: 'TANK',
  TANKLESS: 'TANKLESS',
  HEAT_PUMP: 'HEAT_PUMP',
  SOLAR: 'SOLAR',
  UNKNOWN: 'UNKNOWN',
} as const;
export type WaterHeaterType = keyof typeof WaterHeaterTypes;

export const RoofTypes = {
  SHINGLE: 'SHINGLE',
  TILE: 'TILE',
  FLAT: 'FLAT',
  METAL: 'METAL',
  UNKNOWN: 'UNKNOWN',
} as const;
export type RoofType = keyof typeof RoofTypes;

export const FoundationTypes = {
  BASEMENT: 'BASEMENT',
  CRAWL_SPACE: 'CRAWL_SPACE',
  SLAB: 'SLAB',
  PIER_AND_BEAM: 'PIER_AND_BEAM',
  RAISED: 'RAISED',
  MIXED: 'MIXED',
  OTHER: 'OTHER',
  UNKNOWN: 'UNKNOWN',
} as const;
export type FoundationType = keyof typeof FoundationTypes;

// ============================================================================
// NEW RISK ASSESSMENT TYPES (PHASE 3)
// ============================================================================

export type RiskCategory = 'STRUCTURE' | 'SYSTEMS' | 'SAFETY' | 'FINANCIAL_GAP';

/**
 * Result structure for a single asset calculation (from backend riskCalculator.util.ts)
 */
export interface AssetRiskDetail {
    assetName: string;
    systemType: string;
    category: RiskCategory;
    inventoryItemId?: string | null;
    age: number;
    expectedLife: number;
    replacementCost: number;
    probability: number;       
    coverageFactor: number;    
    outOfPocketCost: number;   
    riskDollar: number;        
    riskLevel: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH';
    actionCta?: string;
}

/**
 * Full Risk Assessment Report (Matches Prisma model output for frontend use)
 */
export interface RiskAssessmentReport {
    id: string;
    propertyId: string;
    riskScore: number; // 0.0 to 100.0
    financialExposureTotal: number; // Total Risk Dollar Exposure (Converted from Decimal)
    details: AssetRiskDetail[]; // Parsed from JSON
    lastCalculatedAt: string; // ISO Date string
    createdAt: string;
    updatedAt: string;
}

// [NEW TYPE] Lightweight Risk Summary for Dashboard (Epic A)
export type RiskSummaryStatus = 'CALCULATED' | 'QUEUED' | 'MISSING_DATA' | 'NO_PROPERTY';

export interface PrimaryRiskSummary {
  propertyId: string;
  propertyName: string | null;
  riskScore: number;
  financialExposureTotal: number; // Converted from Decimal on backend
  // FIX: Added | null to support the fallback summary state in the dashboard component
  lastCalculatedAt: Date | string | null; 
  status: RiskSummaryStatus;
  message?: string; // For NO_PROPERTY status
}


// ============================================================================

export type PropertyScoreType = 'HEALTH' | 'RISK';

export interface PropertyScoreTrendPoint {
  weekStart: string;
  score: number;
  scoreMax: number | null;
  scoreBand: string | null;
  computedAt: string;
  snapshot: Record<string, unknown> | null;
}

export interface PropertyScoreSeries {
  scoreType: PropertyScoreType;
  latest: PropertyScoreTrendPoint | null;
  previous: PropertyScoreTrendPoint | null;
  deltaFromPreviousWeek: number | null;
  trend: PropertyScoreTrendPoint[];
}

export interface PropertyScoreSnapshotSummary {
  propertyId: string;
  weeks: number;
  scores: {
    HEALTH: PropertyScoreSeries;
    RISK: PropertyScoreSeries;
  };
}

export type HomeScoreComponentKey = 'HEALTH' | 'RISK';
export type HomeScoreConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type HomeScoreProvenance = 'SYSTEM_COMPUTED' | 'USER_STATED' | 'INFERRED';
export type HomeScoreImpact = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
export type HomeScoreConsistencyStatus = 'PASS' | 'WARN' | 'FAIL';
export type HomeScoreConsistencySeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type HomeScoreVerificationStatus = 'VERIFIED' | 'REVIEW_NEEDED' | 'UNVERIFIED' | 'UNKNOWN';
export type HomeScoreCorrectionStatus = 'SUBMITTED' | 'APPLIED' | 'REJECTED';
export type HomeScoreGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type HomeScoreRatingTier = 'EXCELLENT' | 'STRONG' | 'STABLE' | 'MODERATE_RISK' | 'HIGH_RISK';
export type HomeScoreProvenanceBadge =
  | 'VERIFIED'
  | 'DOCUMENT_BACKED'
  | 'PUBLIC_RECORD'
  | 'USER_REPORTED'
  | 'INFERRED'
  | 'MISSING';

export interface HomeScoreComponent {
  key: HomeScoreComponentKey;
  label: string;
  score: number;
  scoreMax: number;
  deltaFromPreviousWeek: number | null;
  status: string;
  confidence: HomeScoreConfidence;
  provenance: HomeScoreProvenance;
  sourceSummary: string;
  lastUpdatedAt: string | null;
}

export interface HomeScoreReason {
  id: string;
  title: string;
  detail: string;
  component: HomeScoreComponentKey;
  impact: HomeScoreImpact;
  weight: number;
  confidence: HomeScoreConfidence;
  provenance: HomeScoreProvenance;
  actionHref?: string;
}

export interface HomeScoreTrendPoint {
  weekStart: string;
  homeScore: number;
  healthScore: number | null;
  riskScore: number | null;
}

export interface HomeScoreConsistencyCheck {
  id: string;
  title: string;
  status: HomeScoreConsistencyStatus;
  severity: HomeScoreConsistencySeverity;
  detail: string;
  actionHref?: string;
}

export interface HomeScoreVerificationOpportunity {
  id: string;
  title: string;
  detail: string;
  component: HomeScoreComponentKey | 'GENERAL';
  verificationType: 'PROFILE' | 'DOCUMENT' | 'SYSTEM';
  estimatedConfidenceGain: HomeScoreConfidence;
  href?: string;
}

export interface HomeScoreFieldFact {
  id: string;
  key: string;
  label: string;
  value: string;
  component: HomeScoreComponentKey | 'GENERAL';
  provenance: HomeScoreProvenance;
  confidence: HomeScoreConfidence;
  verificationStatus: HomeScoreVerificationStatus;
  lastUpdatedAt: string | null;
  verifyHref?: string;
}

export interface HomeScoreCorrection {
  id: string;
  fieldKey: string;
  title: string;
  detail: string;
  proposedValue: string | null;
  status: HomeScoreCorrectionStatus;
  submittedAt: string;
  submittedBy: string | null;
}

export interface HomeScoreChangeLogEntry {
  id: string;
  weekStart: string;
  title: string;
  detail: string;
  component: HomeScoreComponentKey | 'GENERAL';
  impact: HomeScoreImpact;
  delta: number | null;
  confidence: HomeScoreConfidence;
  provenance: HomeScoreProvenance;
}

export interface HomeScoreUncertainty {
  scoreRangeLow: number;
  scoreRangeHigh: number;
  riskExposureRangeLow: number | null;
  riskExposureRangeHigh: number | null;
  accuracyScore: number;
  detail: string;
}

export interface HomeScoreGradeBandConfig {
  min: number;
  max: number;
  grade: HomeScoreGrade;
  ratingTier: HomeScoreRatingTier;
  label: string;
}

export interface HomeScoreReportMeta {
  reportTitle: string;
  propertyAddress: string;
  reportId: string;
  generatedDate: string;
  dwellingType?: string | null;
  yearBuilt?: number | null;
  preparedFor: string | null;
  ownerName: string | null;
  dataCoveragePercentage: number;
  verificationStatusSummary: string;
  confidenceLevel: HomeScoreConfidence;
  reportMode: 'HOMEOWNER';
  reportVersion: string;
  gradeMapping: HomeScoreGradeBandConfig[];
}

export interface HomeScoreExecutiveSummary {
  homeScore: number;
  homeScoreMax: number;
  grade: HomeScoreGrade;
  ratingTier: HomeScoreRatingTier;
  confidenceLevel: HomeScoreConfidence;
  valueProtectionScore: number;
  moneyAtRiskHeadline: number;
  moneyAtRiskHorizonMonths: number;
  scoreDeltaFromPreviousPeriod: number | null;
  trendStatus: 'AVAILABLE' | 'INSUFFICIENT_HISTORY';
}

export interface HomeScoreRadarAxis {
  key: 'MAINTENANCE' | 'INSURANCE' | 'SAFETY' | 'WEATHER';
  label: string;
  score: number;
  confidence: HomeScoreConfidence;
  estimated: boolean;
}

export interface HomeScoreRadar {
  axes: HomeScoreRadarAxis[];
  weakestArea: string;
  strongestArea: string;
  explanation: string;
}

export interface HomeScoreDriver {
  id: string;
  title: string;
  explanation: string;
  scoreImpact: number;
  financialImpact: number | null;
  confidence: HomeScoreConfidence;
  provenance: HomeScoreProvenanceBadge;
  actionHref?: string;
}

export interface HomeScoreTimelineEvent {
  id: string;
  title: string;
  summary: string | null;
  eventType: string;
  occurredAt: string | null;
  year: number | null;
  datePrecision: 'DATE' | 'YEAR';
  provenance: HomeScoreProvenanceBadge;
  verified: boolean;
}

export interface HomeScoreSystemHealthRow {
  key:
    | 'ROOF'
    | 'HVAC'
    | 'WATER_HEATER'
    | 'PLUMBING'
    | 'ELECTRICAL'
    | 'SAFETY_SYSTEMS'
    | 'EXTERIOR_ENVELOPE'
    | 'FOUNDATION_STRUCTURE';
  label: string;
  grade: HomeScoreGrade;
  statusLabel: string;
  ageYears: number | null;
  serviceWindow: string | null;
  verification: HomeScoreProvenanceBadge;
  nextRecommendedAction: string;
  projectedRiskHorizonMonths: number | null;
  isPlaceholder: boolean;
}

export interface HomeScoreFinancialExposureLine {
  id: string;
  label: string;
  exposure: number;
  confidence: HomeScoreConfidence;
  provenance: HomeScoreProvenanceBadge;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface HomeScoreFinancialExposure {
  currency: 'USD';
  headlineMoneyAtRisk: number;
  horizon12Months: number;
  horizon3Years: number;
  horizon5Years: number;
  confidenceRangeLow: number | null;
  confidenceRangeHigh: number | null;
  lines: HomeScoreFinancialExposureLine[];
  whatReducesRisk: Array<{
    title: string;
    detail: string;
  }>;
}

export interface HomeScoreTrustAndVerification {
  dataCoveragePct: number;
  verifiedPct: number;
  estimatedPct: number;
  userReportedPct: number;
  publicRecordPct: number;
  documentBackedPct: number;
  confidenceScore: number;
  confidenceLevel: HomeScoreConfidence;
  badgeTaxonomy: HomeScoreProvenanceBadge[];
  explanation: string;
}

export interface HomeScoreIntegrityCheckItem {
  id: string;
  title: string;
  status: HomeScoreConsistencyStatus;
  detail: string;
  remediation: string | null;
  actionHref?: string;
}

export interface HomeScoreBenchmarkItem {
  key: 'NEIGHBORHOOD' | 'ZIP' | 'CITY' | 'STATE' | 'TOP_PERCENTILE' | 'PLATFORM_COMPARABLES';
  label: string;
  score: number;
  sampleSize: number | null;
  available: boolean;
}

export interface HomeScoreBenchmarks {
  thisHomeScore: number;
  percentile: number | null;
  sources: HomeScoreBenchmarkItem[];
  interpretation: string;
}

export interface HomeScoreImprovementAction {
  id: string;
  title: string;
  projectedPointGain: number;
  projectedRiskReduction: number;
  estimatedCostToImprove: number | null;
  estimatedConfidenceGain: HomeScoreConfidence;
  effort: 'LOW' | 'MEDIUM' | 'HIGH';
  urgency: 'LOW' | 'MEDIUM' | 'HIGH';
  actionHref?: string;
}

export interface HomeScoreImprovementPlan {
  actions: HomeScoreImprovementAction[];
  potentialNewScore: number;
  potentialMoneyAtRiskReduction: number;
}

export interface HomeScoreMethodology {
  summary: string;
  inputsUsed: string[];
  intendedUse: string;
  disclosures: string[];
  methodologyHref: string | null;
  dataSources: Array<{
    key: string;
    label: string;
    status: 'AVAILABLE' | 'PARTIAL' | 'PLANNED';
  }>;
}

export interface HomeScoreReport {
  propertyId: string;
  protectionContext?: ProtectionContextSummary;
  generatedAt: string;
  homeScore: number;
  scoreBand: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'NEEDS_ATTENTION';
  deltaFromPreviousWeek: number | null;
  confidence: HomeScoreConfidence;
  verificationLadder: {
    userStated: number;
    inferred: number;
    systemComputed: number;
  };
  components: HomeScoreComponent[];
  topReasonsScoreNotHigher: HomeScoreReason[];
  whatChangedSinceLastWeek: HomeScoreReason[];
  consistencyChecks: HomeScoreConsistencyCheck[];
  verificationOpportunities: HomeScoreVerificationOpportunity[];
  fieldFacts: HomeScoreFieldFact[];
  correctionHistory: HomeScoreCorrection[];
  changeLog: HomeScoreChangeLogEntry[];
  uncertainty: HomeScoreUncertainty;
  nextBestAction: {
    title: string;
    detail: string;
    href?: string;
  } | null;
  trend: HomeScoreTrendPoint[];
  reportMeta: HomeScoreReportMeta;
  executiveSummary: HomeScoreExecutiveSummary;
  radar: HomeScoreRadar;
  scoreDrivers: HomeScoreDriver[];
  timeline: {
    events: HomeScoreTimelineEvent[];
    emptyState: {
      title: string;
      detail: string;
      ctaLabel: string;
      ctaHref: string;
    } | null;
  };
  systemHealth: HomeScoreSystemHealthRow[];
  financialExposure: HomeScoreFinancialExposure;
  trustAndVerification: HomeScoreTrustAndVerification;
  integrityChecks: HomeScoreIntegrityCheckItem[];
  benchmarks: HomeScoreBenchmarks;
  improvementPlan: HomeScoreImprovementPlan;
  methodology: HomeScoreMethodology;
}

// ============================================================================
// COMMUNITY EVENTS TYPES (PHASE 6)
// ============================================================================

/**
 * Community Event Category
 */
export type CommunityEventCategory =
  | 'FARMERS_MARKET'
  | 'FESTIVAL'
  | 'HOA_MEETING'
  | 'TRASH_PICKUP'
  | 'RECYCLING'
  | 'STREET_PARKING'
  | 'SNOW_EMERGENCY'
  | 'COMMUNITY_ALERT'
  | 'SERVICE_PROVIDER'
  | 'OTHER';

/**
 * Source of the community event
 */
export type CommunityEventSource =
  | 'CITY'
  | 'HOA'
  | 'COUNTY'
  | 'THIRD_PARTY'
  | 'INTERNAL';


// ============================================================================
// NEW DOCUMENT UPLOAD TYPES (ADDED)
// ============================================================================

/**
 * Document Type Enum (Synced with Backend Enum)
 */
export type DocumentType = 
  | 'INSPECTION_REPORT'
  | 'ESTIMATE'
  | 'INVOICE'
  | 'CONTRACT'
  | 'PERMIT'
  | 'PHOTO'
  | 'VIDEO'
  | 'INSURANCE_CERTIFICATE'
  | 'LICENSE'
  | 'OTHER';

/**
 * Document Upload Request DTO
 * Note: The file itself is sent as 'file' in a separate multipart/form-data field.
 */
export interface DocumentUploadInput {
  type: DocumentType;
  name: string;
  description?: string;
  // Exactly one of the following is typically required
  propertyId?: string;
  warrantyId?: string;
  policyId?: string;
}

// ============================================================================
// NEW HOMEOWNER MANAGEMENT TYPES
// ============================================================================

/**
 * Expense Category Enum
 */
export type ExpenseCategory = 
  | 'REPAIR_SERVICE'
  | 'PROPERTY_TAX'
  | 'HOA_FEE'
  | 'UTILITY'
  | 'APPLIANCE'
  | 'MATERIALS'
  | 'OTHER';

/**
 * Core Document Type (Extended to include new relations)
 */
export interface Document {
  id: string;
  name: string;
  /** S3 key — not a usable URL. Use fileSignedUrl for display/download. */
  fileUrl?: string;
  /** Presigned S3 URL (1-hour expiry) returned by the API for display/download. */
  fileSignedUrl?: string | null;
  type: DocumentType; // Updated type to use the new DocumentType enum
  description: string | null;
  fileSize: number;
  mimeType: string;
  propertyId: string | null;
  warrantyId: string | null;
  policyId: string | null;
  createdAt: string;
}

/**
 * Expense Interface
 */
export interface Expense {
  id: string;
  homeownerProfileId: string;
  propertyId: string | null;
  bookingId: string | null;
  description: string;
  category: ExpenseCategory;
  amount: number;
  transactionDate: string; // ISO Date string
  createdAt: string;
  updatedAt: string;
}

/**
 * Warranty Interface
 */
export interface Warranty {
  id: string;
  homeownerProfileId: string;
  propertyId: string | null;
  inventoryItemId: string | null;
  category: WarrantyCategory;
  providerName: string;
  policyNumber: string | null;
  coverageDetails: string | null;
  cost: number | null;
  startDate: string; // ISO Date string
  expiryDate: string; // ISO Date string
  documents: Document[]; // Array of associated documents
  createdAt: string;
  updatedAt: string;
  applicability?: CoverageApplicability;
}

/**
 * Insurance Policy Interface
 */
export interface InsurancePolicy {
  id: string;
  homeownerProfileId: string;
  propertyId: string | null;
  carrierName: string;
  policyNumber: string;
  coverageType: string | null;
  premiumAmount: number | null;
  personalPropertyLimitCents: number | null;
  deductibleCents: number | null;
  isVerified: boolean;
  lastVerifiedAt: string | null;
  startDate: string | null; // ISO Date string when known
  expiryDate: string | null; // ISO Date string when known
  documents: Document[]; // Array of associated documents
  createdAt: string;
  updatedAt: string;
  applicability?: CoverageApplicability;
}

export interface InsurancePolicyFact {
  id: string;
  policyTermId: string;
  factKey: string;
  valueType: 'AMOUNT' | 'TEXT' | 'BOOLEAN' | 'JSON';
  amountValue: string | number | null;
  textValue: string | null;
  booleanValue: boolean | null;
  jsonValue: unknown;
  currency: string | null;
  sourceDocumentId: string | null;
  sourcePage: number | null;
  sourceExcerptHash: string | null;
  extractionMethod: string;
  confidence: number | null;
  confirmationStatus: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  confirmedByUserId: string | null;
  confirmedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  sourceDocument?: Pick<Document, 'id' | 'name'> | null;
}

export interface InsurancePolicyTerm {
  id: string;
  insurancePolicyId: string;
  propertyId: string;
  termStart: string | null;
  termEnd: string | null;
  annualPremium: string | number | null;
  status: 'PENDING_CONFIRMATION' | 'REVIEWED';
  verificationStatus: 'UNVERIFIED' | 'VERIFIED';
  verifiedAt: string | null;
  sourceDocumentId: string | null;
  sourceDocument?: Pick<Document, 'id' | 'name'> | null;
  facts: InsurancePolicyFact[];
  createdAt: string;
  updatedAt: string;
}

export interface InsurancePolicyRecord extends InsurancePolicy {
  terms: InsurancePolicyTerm[];
  readiness: {
    state: 'NO_TERM' | 'NEEDS_CONFIRMATION' | 'CONFIRMED' | 'UNKNOWN';
    pendingFactCount: number;
    confirmedFactCount: number;
    unknownFactKeys: string[];
  };
}

export interface CoverageApplicability {
  status: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  lifecycle: 'ACTIVE' | 'FUTURE' | 'EXPIRED' | 'INVALID';
  reasonCodes: string[];
  evaluatedAt: string;
  validUntil: string | null;
}

export interface InsuranceProtectionGapSummary {
  propertyId: string;
  policyId: string | null;
  hasActivePolicy: boolean;
  isPolicyVerified: boolean;
  totalInventoryValueCents: number;
  personalPropertyLimitCents: number;
  deductibleCents: number;
  gapCents: number;
  underInsuredCents: number;
}

export interface HomeEquitySummary {
  propertyContext?: import('@/components/property-context/propertyContextTypes').PropertyContextEnvelope;
  calculationContext?: { mode: 'CANONICAL'; overrideFields: string[] };
  propertyId: string;
  isEquityVerified: boolean;
  purchasePriceCents: number | null;
  purchaseDate: string | null;
  lastAppraisedValueCents: number;
  appreciationCents: number;
  baseEquityCents: number;
  maintenanceSpendCents: number;
  maintenancePremiumRate: number;
  bonusMultiplier: number;
  maintenancePremiumCents: number;
  totalEquityWithMaintenanceCents: number;
  healthScore: number | null;
  resaleAdvantageBaseline: number;
  hasResaleAdvantage: boolean;
}

// --- CHECKLIST TYPES (FIX: ADDED MISSING TYPES) ---
/**
 * Checklist Item Interface
 */
export interface ChecklistItem {
  id: string;
  title: string;
  description: string | null;
  status: 'PENDING' | 'COMPLETED' | 'NOT_NEEDED'; // Assuming enum values
  serviceCategory: ServiceCategory | null;
  isRecurring: boolean;
  frequency: RecurrenceFrequency | null;
  nextDueDate: string | null;
  lastCompletedDate: string | null;
  checklistId: string;
  propertyId: string | null; // FIX: Added propertyId to the ChecklistItem
  createdAt: string; 
  updatedAt: string;
}

/**
 * Checklist Interface
 */
export interface Checklist {
  id: string;
  homeownerProfileId: string;
  createdAt: string;
  updatedAt: string;
}

// NEW DTO for updating a ChecklistItem
export interface UpdateChecklistItemInput {
  title?: string;
  description?: string | null;
  status?: 'PENDING' | 'COMPLETED' | 'NOT_NEEDED';
  serviceCategory?: ServiceCategory | null;
  isRecurring?: boolean;
  frequency?: RecurrenceFrequency | null;
  nextDueDate?: string | null; // ISO Date string
  lastCompletedDate?: string | null; // ISO Date string
}
// --- END CHECKLIST TYPES ---

// ============================================================================
// CORE APPLICATION TYPES (Existing)
// ============================================================================

/**
 * Homeowner Profile (NEWLY ADDED)
 */
export interface HomeownerProfile {
  id: string;
  userId: string;

  // Purchase Information 
  closingDate: string | null; // ISO Date string
  purchasePrice: number | null; // Converted from Decimal (12, 2)

  // Preferences
  preferredContactMethod: string | null;
  notificationPreferences: any; // JSON

  // Budget tracking
  totalBudget: number | null; // Converted from Decimal (12, 2)
  spentAmount: number; // Converted from Decimal (12, 2)

  createdAt: string;
  updatedAt: string;
}


/**
 * User
 */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  role: UserRole;
  emailVerified: boolean;
  status: UserStatus;
  mfaEnabled?: boolean;
  // FIX: Add missing creation date property to resolve the build error in profile/page.tsx
  createdAt: string; 
  homeownerProfile?: { 
    // Now just link to the main type since it's defined separately
    id: string;
  } | null;
}

/**
 * Auth Response
 */
// FIX: Add success property to LoginResponse
export interface LoginResponse {
  success: true; 
  sessionEstablished: true;
  user: User;
}

export interface MfaChallengeResponse {
  mfaRequired: true;
  mfaToken: string;
}

export type AuthLoginResponse = LoginResponse | MfaChallengeResponse;

export interface MfaStatusResponse {
  mfaEnabled: boolean;
  recoveryCodesRemaining: number;
}

export interface MfaRecoveryCodesResponse {
  recoveryCodes: string[];
}

// FIX: Add success property to RegisterResponse
export interface RegisterResponse {
  success: true;
  message: string;
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role' | 'emailVerified' | 'status' | 'mfaEnabled'>;
  emailVerificationToken?: string;
}

/**
 * Provider - UPDATED to match backend response
 */
export interface Provider {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    email?: string;
  };
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  businessName: string;
  averageRating: number;
  totalReviews: number;
  totalCompletedJobs: number;
  serviceRadius: number;
  serviceCategories: ServiceCategory[];
  /** Typical response time label, e.g. "Within 2 hours". Populated by backend when available. */
  responseTime?: string | null;
  website?: string | null;
  /** Provider Trust & Compliance Verification — categories this provider is currently verified for. */
  verifiedCategories?: ServiceCategory[];
}

/**
 * Service - Updated to match database schema
 */
export interface Service {
  id: string;
  name: string;
  category: ServiceCategory;
  inspectionType?: string | null;
  handymanType?: string | null;
  basePrice: string;
  priceUnit: string;
  description: string;
  minimumCharge?: string | null;
  estimatedDuration: number | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Add these interfaces to your apps/frontend/src/types/index.ts (or the file aliased as "../types")

/**
 * Interface representing the detailed breakdown of the Property Health Score,
 * matching the object returned by the calculateHealthScore utility on the backend.
 */
export interface HealthScoreResult {
  totalScore: number;
  baseScore: number;
  unlockedScore: number;
  maxPotentialScore: number;
  maxBaseScore: number;
  maxExtraScore: number;
  insights: { factor: string; status: string; score: number; details?: string[] }[];
  ctaNeeded: boolean;
}

/**
 * Major-appliance projection backed by canonical InventoryItem records.
 */
export interface PropertyAppliance {
  id: string;
  propertyId: string;
  assetType: string;
  installationYear: number | null;
  modelNumber: string | null;
  serialNumber: string | null;
  lastServiced: string | null;
  efficiencyRating: string | null;
  warranties?: Warranty[];
}

/**
 * The standard Property interface, updated to include all new optional fields 
 * from the extended database schema (Phase 1).
 */
export interface Property {
  id: string;
  homeownerProfileId: string;
  name: string | null;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  isPrimary: boolean;
  householdRole?: HouseholdRole | null; // Present when user is a household member (not the owner)
  
  // New Basic/Migrated Fields
  dwellingType: DwellingType;
  ownershipForm: OwnershipForm;
  propertyUse: PropertyUse;
  occupancyStatus: OccupancyStatus;
  propertySize: number | null;
  yearBuilt: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  
  // New Advanced Fields
  occupantsCount: number | null;
  heatingType: HeatingType | null; // Use new type
  coolingType: CoolingType | null; // Use new type
  waterHeaterType: WaterHeaterType | null; // Use new type
  roofType: RoofType | null; // Use new type
  hvacInstallYear: number | null;
  waterHeaterInstallYear: number | null;
  roofReplacementYear: number | null;
  foundationType: FoundationType | null;
  sidingType: string | null;
  electricalPanelAge: number | null;
  lotSize: number | null;
  hasIrrigation: boolean | null;
  hasDrainageIssues: boolean | null;
  hasSmokeDetectors: boolean | null;
  hasCoDetectors: boolean | null;
  hasSecuritySystem: boolean | null;
  hasFireExtinguisher: boolean | null;
  hasSumpPump: boolean | null;
  hasSumpPumpBackup: boolean | null;
  primaryHeatingFuel: string | null;
  hasSecondaryHeat: boolean | null;
  // Homeowner-reported territory facts used by the Hidden Asset Finder's
  // geography resolver (self-reported, never inferred from an external lookup).
  utilityProvider: string | null;
  gasProvider: string | null;
  inHistoricDistrict: boolean | null;
  historicRegistryStatus: string | null;
  inHurricaneZone: boolean | null;
  inFloodZone: boolean | null;
  inWildfireZone: boolean | null;
  isResilienceVerified: boolean;
  isUtilityVerified: boolean;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  bonusMultiplier: number;
  purchasePriceCents: number | null;
  purchaseDate: string | null;
  lastAppraisedValue: number | null;
  lastAppraisalDate: string | null;
  estimatedMaintenancePremiumCents: number;
  isEquityVerified: boolean;
  coverPhotoDocumentId: string | null;
  applianceAges: any;
  coverPhoto?: Document | null;
  exteriorProfile?: PropertyExteriorProfile | null;
  
  // Canonical InventoryItem-backed appliance projection for property setup.
  majorAppliances?: PropertyAppliance[];
  
  createdAt: string;
  updatedAt: string;
  // ... include any other existing fields ...
}

export type PropertyContextScope =
  | 'CORE' | 'LOCATION' | 'STRUCTURE' | 'EXTERIOR' | 'RESPONSIBILITY' | 'SYSTEMS'
  | 'SAFETY' | 'ROOMS' | 'INVENTORY' | 'MAINTENANCE' | 'RECALLS' | 'INSPECTION'
  | 'COVERAGE' | 'RISK' | 'FINANCIAL' | 'COMPLIANCE' | 'PROJECTS' | 'EVENTS'
  | 'ENVIRONMENT' | 'GUIDANCE_STATE' | 'PRODUCT_CONTEXT' | 'OPTIONAL_HOUSEHOLD';

export interface PropertyContextFact<T = unknown> {
  key: string;
  value: T | null;
  state: 'KNOWN' | 'UNKNOWN' | 'CONFLICTED' | 'STALE';
  source: 'USER_REPORTED' | 'DOCUMENT' | 'INSPECTION' | 'PUBLIC_RECORD' | 'INTEGRATION' | 'SYSTEM_DERIVED' | null;
  verified: boolean;
  confidence: number | null;
  observedAt: string | null;
  validUntil: string | null;
  correctionPath: string | null;
}

export interface PropertyContextSnapshot {
  propertyId: string;
  contextVersion: string;
  generatedAt: string;
  scopes: PropertyContextScope[];
  facts: Record<string, PropertyContextFact>;
  warnings: Array<{ code: 'CONFLICT' | 'STALE_SOURCE' | 'PARTIAL_SCOPE'; factKeys: string[] }>;
}

export interface PropertyContextFeatureDecision {
  status: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  reasonCodes: string[];
  usedFactKeys: string[];
  missingFactKeys: string[];
  conflictedFactKeys: string[];
  validUntil: string | null;
  correctionPaths?: string[];
}

export interface ProtectionContextSummary {
  contextVersion: string;
  decisions: {
    riskAssessment: PropertyContextFeatureDecision;
    currentRiskOutput: PropertyContextFeatureDecision;
    inspectionEvidence: PropertyContextFeatureDecision;
    coverageEvidence: PropertyContextFeatureDecision;
    recallEvidence: PropertyContextFeatureDecision;
    guidanceState: PropertyContextFeatureDecision;
  };
}

export interface PropertyContextCompleteness {
  propertyId: string;
  contextVersion: string;
  completenessPercent: number;
  scopes: Array<{
    scope: PropertyContextScope;
    totalFacts: number;
    knownFacts: number;
    completenessPercent: number;
    missingFactKeys: string[];
    conflictedFactKeys: string[];
    staleFactKeys: string[];
  }>;
}

/**
 * The final type returned by the API for property fetches/updates,
 * which includes the calculated health score.
 */
export interface ScoredProperty extends Property {
    healthScore: HealthScoreResult;
}

export type NarrativeRunStatus = 'ACTIVE' | 'DISMISSED' | 'COMPLETED' | 'EXPIRED';

export interface PropertyNarrativePayloadBlock {
  id: string;
  type: 'HERO' | 'WHY_IT_MATTERS' | 'MONEY_AT_RISK' | 'NEXT_90_DAYS' | 'CONFIDENCE_NUDGE' | 'CTA' | string;
  title?: string;
  body?: string;
  bullets?: string[];
  data?: Record<string, any>;
  ctas?: Array<{ key: string; label: string; action: string }>;
}

export interface PropertyNarrativePayload {
  metadata: {
    runVersion: string;
    confidenceScore: number;
    propertyId: string;
    computedAt: string;
    heroVariant: string;
  };
  blocks: PropertyNarrativePayloadBlock[];
}

export interface PropertyNarrativeRun {
  id: string;
  propertyId: string;
  userId: string;
  version: string;
  status: NarrativeRunStatus;
  snapshotId?: string | null;
  planJson: Record<string, any>;
  payloadJson: PropertyNarrativePayload;
  startedAt: string;
  completedAt?: string | null;
  dismissedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyOnboardingNarrativeState {
  propertyId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
  currentStep: 1 | 2 | 3 | 4 | 5;
  dismissedAt: string | null;
  setupScore: number;
  steps: Array<{
    step: 1 | 2 | 3 | 4 | 5;
    title: string;
    description: string;
    complete: boolean;
    ctaLabel: string;
    href: string;
  }>;
  recommendedNextStep: 1 | 2 | 3 | 4 | 5;
}

export interface PropertyDashboardBootstrap {
  property: ScoredProperty;
  onboarding: PropertyOnboardingNarrativeState;
  narrativeRun: PropertyNarrativeRun | null;
}

/**
 * Booking Timeline Entry
 */
export interface BookingTimelineEntry {
  id: string;
  status: BookingStatus;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

/**
 * Booking
 */
export interface Booking {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  category: ServiceCategory;
  homeowner: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  provider: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    businessName: string;
  };
  service: {
    id: string;
    name: string;
    category: ServiceCategory;
    basePrice: string;
    priceUnit: string;
  };
  property: {
    id: string;
    name: string | null;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  scheduledDate: string | null;
  startTime: string | null;
  endTime: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  estimatedPrice: string;
  finalPrice: string | null;
  depositAmount: string | null;
  description: string;
  specialRequests: string | null;
  internalNotes: string | null;
  insightFactor: string | null;
  insightContext: string | null;
  maintenancePredictionId: string | null;
  inventoryItemId: string | null;
  priceFinalizationId: string | null;
  sourceRadarMatchId?: string | null;
  sourceRadarEventId?: string | null;
  sourceIncidentId?: string | null;
  sourceRadarActionCode?: string | null;
  sourceLaunchSurface?: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  completedAt: string | null;
  timeline: BookingTimelineEntry[];
  createdAt: string;
  updatedAt: string;
  /**
   * Provider Trust & Compliance Verification — non-blocking warning set only
   * on the createBooking response when the provider isn't currently verified
   * for this category. Absent/null otherwise.
   */
  providerEligibilityWarning?: {
    serviceCategory: ServiceCategory;
    missingCredentialTypes: ProviderCredentialType[];
  } | null;
}

/**
 * Community Event
 * Represents a single local event or alert associated with a property location
 */
export interface CommunityEvent {
  id: string;

  // Location context
  city: string;
  state: string;
  zipCode?: string | null;

  // Classification
  category: CommunityEventCategory;
  source: CommunityEventSource;

  // Display
  title: string;
  description?: string | null;

  // Timing
  startTime: string; // ISO date string
  endTime?: string | null;

  // Metadata
  externalUrl?: string | null;
  isAllDay?: boolean;
  isActive: boolean;

  // Audit
  createdAt: string;
  updatedAt: string;
}


// --- ADD CHAT TYPES ---
export type ChatMessageRole = 'user' | 'model';

export interface ChatMessage {
  role: ChatMessageRole;
  text: string;
}

/**
 * API Response Types
 */
export interface APIError {
  success: false;
  message: string;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  errors?: any[];
}

export interface APISuccess<T = any> {
  success: true;
  data: T;
  message?: string;
}

export type APIResponse<T = any> = APISuccess<T> | APIError;

/**
 * Pagination
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ============================================================================
// FORM INPUTS (DTOs for Frontend)
// ============================================================================

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  acceptedTerms: boolean;
}

export interface CreateBookingInput {
  providerId: string;
  serviceId: string;
  propertyId: string;
  scheduledDate?: string;
  startTime?: string;
  endTime?: string;
  description: string;
  specialRequests?: string;
  estimatedPrice: number;
  depositAmount?: number;
  // NEW: Health Insight Tracking
  insightFactor?: string;     // e.g., "Age Factor", "Roof Age"
  insightContext?: string;    // e.g., "Property age: 35 years"
  maintenancePredictionId?: string;
  inventoryItemId?: string;
  priceFinalizationId?: string;
  guidanceJourneyId?: string;
  guidanceStepKey?: string;
  guidanceSignalIntentFamily?: string;
  workCategory?: string;
  guidanceEnforceGuard?: boolean;
  sourceRadarMatchId?: string;
  sourceRadarEventId?: string;
  sourceIncidentId?: string;
  sourceRadarActionCode?: string;
  sourceLaunchSurface?: 'home_event_radar';
}

/**
 * Maintenance Task Template
 */
export interface MaintenanceTaskTemplate {
  id: string;
  title: string;
  description: string | null;
  serviceCategory: ServiceCategory | null;
  defaultFrequency: RecurrenceFrequency;
  sortOrder: number;
  contextInput?: Record<string, unknown>;
  applicability?: PropertyContextFeatureDecision;
}

/**
 * Service Category Config (for UI display)
 */
export interface ServiceCategoryConfig {
  category: ServiceCategory;
  displayName: string;
  description: string;
  icon: string;
}

/**
 * Maintenance Task Configuration
 */
export interface MaintenanceTaskConfig {
  templateId: string;
  title: string;
  description: string | null;
  isRecurring: boolean;
  frequency: RecurrenceFrequency | null;
  nextDueDate: Date | null;
  serviceCategory: ServiceCategory | null;
  propertyId: string; // FIX: ADDED propertyId
}

// NEW DTOs for Home Management

export interface CreateExpenseInput {
  propertyId?: string;
  bookingId?: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  transactionDate: string; // ISO date string
}
export interface UpdateExpenseInput extends Partial<CreateExpenseInput> {}


export interface CreateWarrantyInput {
  propertyId?: string;
  inventoryItemId?: string;
  category: WarrantyCategory;
  providerName: string;
  policyNumber?: string;
  coverageDetails?: string;
  cost?: number;
  startDate: string; // ISO date string
  expiryDate: string; // ISO date string
}
export interface UpdateWarrantyInput extends Partial<CreateWarrantyInput> {}


export interface CreateInsurancePolicyInput {
  propertyId?: string;
  carrierName: string;
  policyNumber: string;
  coverageType?: string;
  premiumAmount: number;
  personalPropertyLimitCents?: number | null;
  deductibleCents?: number | null;
  isVerified?: boolean;
  startDate: string; // ISO date string
  expiryDate: string; // ISO date string
}
export interface UpdateInsurancePolicyInput extends Partial<CreateInsurancePolicyInput> {}

// ============================================================================
// NEW APPLIANCE ORACLE TYPES (PHASE 3)
// ============================================================================

export interface ApplianceRecommendation {
  brand: string;
  model: string;
  features: string[];
  estimatedCost: number;
  energyRating: string;
  warranty: string;
  reasoning: string;
}

export interface ApplianceFailurePrediction {
  applianceName: string;
  category: string;
  currentAge: number;
  expectedLife: number;
  remainingLife: number;
  failureRisk: number; // 0-100%
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  estimatedFailureDate: Date; // ISO Date string in transit, Date object on backend service. Use string here for API response clarity.
  replacementCost: number;
  recommendations: ApplianceRecommendation[];
  maintenanceImpact: string;
}

export interface OracleReport {
  propertyId: string;
  propertyAddress: string;
  totalAppliances: number;
  criticalCount: number;
  highRiskCount: number;
  estimatedTotalCost: number;
  predictions: ApplianceFailurePrediction[];
  generatedAt: string; // ISO Date string
  propertyContext?: import('@/components/property-context/propertyContextTypes').PropertyContextEnvelope;
}

// ============================================================================
// HIDDEN ASSET FINDER
// ============================================================================

export type HiddenAssetCategory =
  | 'TAX_EXEMPTION'
  | 'REBATE'
  | 'UTILITY_INCENTIVE'
  | 'INSURANCE_DISCOUNT'
  | 'ENERGY_CREDIT'
  | 'LOCAL_GRANT'
  | 'HISTORIC_BENEFIT'
  | 'STORM_RESILIENCE';

export type HiddenAssetConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type HiddenAssetBenefitType =
  | 'TAX_SAVINGS'
  | 'TAX_CREDIT'
  | 'REBATE'
  | 'DISCOUNT'
  | 'GRANT'
  | 'CREDIT'
  | 'OTHER';

export type HiddenAssetMatchStatus =
  | 'DETECTED'
  | 'VIEWED'
  | 'DISMISSED'
  | 'PURSUING'
  | 'EXPIRED'
  | 'INACTIVE';

export interface HiddenAssetMatchDTO {
  id: string;
  propertyId: string;
  programId: string;
  programName: string;
  category: HiddenAssetCategory;
  description: string | null;
  benefitType: HiddenAssetBenefitType;
  estimatedValue: number | null;
  estimatedValueMin: number | null;
  estimatedValueMax: number | null;
  benefitPeriod: 'UNKNOWN' | 'ONE_TIME' | 'MONTHLY' | 'ANNUAL';
  currency: string;
  confidenceLevel: HiddenAssetConfidenceLevel;
  /** Human-friendly match-stage label from backend ("Strong property match", etc.) — never implies approval. */
  eligibilityLabel: string;
  status: HiddenAssetMatchStatus;
  matchedRuleCount: number | null;
  totalRuleCount: number | null;
  matchReasons: string[] | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  eligibilityNotes: string | null;
  lastVerifiedAt: string | null;
  expiresAt: string | null;
  fundingStatus: 'UNKNOWN' | 'OPEN' | 'CLOSED';
  applicationWindowOpensAt: string | null;
  applicationWindowClosesAt: string | null;
  isProgramActive: boolean;
  /** Non-null when program data is stale — surface as a caveat in UI. */
  freshnessNote: string | null;
  lastEvaluatedAt: string;
  firstDetectedAt: string;
  dismissedAt: string | null;
  pursuedAt: string | null;
  propertyContextVersion: string | null;
  /** program.version this match was last evaluated against. */
  programVersionAtMatch: number | null;
  /** Other currently-visible match IDs sharing this program's exclusion group — never all stack. */
  mutuallyExclusiveWith: string[];
  /** Whether this benefit belongs to the property or the household (HSB-038). */
  beneficiaryScope: HiddenAssetBeneficiaryScope;
}

export type HiddenAssetBeneficiaryScope = 'PROPERTY' | 'HOUSEHOLD' | 'EITHER';

export interface HiddenAssetMatchSummaryDTO {
  totalMatches: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  categoryCounts: Partial<Record<HiddenAssetCategory, number>>;
  lastScanAt: string | null;
  /** Null = never scanned. 0 = scanned, but no reviewed programs cover this region. */
  programsEvaluated: number | null;
}

export interface HiddenAssetMatchListDTO {
  propertyId: string;
  matches: HiddenAssetMatchDTO[];
  summary: HiddenAssetMatchSummaryDTO;
  propertyContextVersion: string | null;
  propertyContext?: import('@/components/property-context/propertyContextTypes').PropertyContextEnvelope;
}

export interface HiddenAssetProgramDetailDTO {
  id: string;
  name: string;
  category: HiddenAssetCategory;
  description: string | null;
  regionType: string;
  regionValue: string;
  benefitType: HiddenAssetBenefitType;
  benefitEstimateMin: number | null;
  benefitEstimateMax: number | null;
  currency: string;
  sourceUrl: string | null;
  sourceLabel: string | null;
  eligibilityNotes: string | null;
  isActive: boolean;
  expiresAt: string | null;
  lastVerifiedAt: string | null;
  beneficiaryScope: HiddenAssetBeneficiaryScope;
  createdAt: string;
  updatedAt: string;
}

export interface HiddenAssetRefreshResultDTO {
  scanRunId: string;
  propertyId: string;
  programsEvaluated: number;
  matchesFound: number;
  matchesExpired: number;
  matchesInactivated: number;
  durationMs: number;
  matches: HiddenAssetMatchDTO[];
  propertyContextVersion: string;
  propertyContext?: import('@/components/property-context/propertyContextTypes').PropertyContextEnvelope;
}

export interface HiddenAssetCoverageSourceDTO {
  id: string;
  name: string;
  sourceKind: string;
  officialUrl: string;
  lastReviewedAt: string | null;
  stale: boolean;
}

export interface HiddenAssetCoverageDTO {
  propertyId: string;
  generatedAt: string;
  regionsChecked: string[];
  sources: HiddenAssetCoverageSourceDTO[];
  categoriesCovered: HiddenAssetCategory[];
  categoriesNotCovered: HiddenAssetCategory[];
  nextReviewAt: string | null;
}

// ============================================================================
// SENSITIVE ELIGIBILITY FACTS (consent-gated, per-match)
// ============================================================================

export type HiddenAssetSensitiveFactKey =
  | 'INCOME'
  | 'DISABILITY'
  | 'AGE'
  | 'VETERAN_STATUS'
  | 'TAX_FILING_STATUS'
  | 'HOUSEHOLD_COMPOSITION'
  | 'HARDSHIP_STATUS'
  | 'IMMIGRATION_STATUS'
  | 'OTHER';

export type HiddenAssetSensitiveFactStatus = 'REQUESTED' | 'PROVIDED' | 'DECLINED';

export interface SensitiveFactStatusDTO {
  factKey: HiddenAssetSensitiveFactKey;
  status: HiddenAssetSensitiveFactStatus;
  purpose: string;
  consentedAt: string | null;
  respondedAt: string | null;
}

// ============================================================================
// SAVINGS OUTCOME LEDGER (application/award trail — HSB-018/019/033)
// ============================================================================

export type SavingsOutcomeStageValue =
  | 'SUBMITTED'
  | 'APPROVED'
  | 'DENIED'
  | 'RECEIVED'
  | 'WITHDRAWN'
  | 'EXPIRED'
  | 'NO_ACTION';
export type SavingsOutcomeVerificationState = 'SELF_REPORTED' | 'EVIDENCE_ATTACHED' | 'VERIFIED' | 'REVOKED';

export interface SavingsOutcomeDocumentDTO {
  id: string;
  name: string;
  type: string;
  mimeType: string;
  fileSize: number;
}

export interface HiddenAssetMatchOutcomeDTO {
  id: string;
  matchId: string;
  actionId: string | null;
  stage: SavingsOutcomeStageValue;
  amountReceived: number | null;
  currency: string;
  evidenceNote: string | null;
  denialReason: string | null;
  closureReason: string | null;
  verificationState: SavingsOutcomeVerificationState;
  verifiedAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  supersedesOutcomeId: string | null;
  recordedBy: string;
  recordedAt: string;
  documents: SavingsOutcomeDocumentDTO[];
}

export interface HomeSavingsOpportunityOutcomeDTO {
  id: string;
  opportunityId: string;
  actionId: string | null;
  stage: SavingsOutcomeStageValue;
  observedMonthlyValue: number | null;
  observedAnnualValue: number | null;
  currency: string;
  evidenceNote: string | null;
  denialReason: string | null;
  closureReason: string | null;
  verificationState: SavingsOutcomeVerificationState;
  observationStartedAt: string | null;
  observationEndedAt: string | null;
  verifiedAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  supersedesOutcomeId: string | null;
  recordedBy: string;
  recordedAt: string;
  documents: SavingsOutcomeDocumentDTO[];
}

// ============================================================================
// SAVINGS & BENEFITS — UNIFIED READ VIEW
// Normalizes PropertyHiddenAssetMatch (benefits) and HomeSavingsOpportunity
// (recurring-cost) into one shape. Read-only projection; each family's own
// write actions (refresh, status updates, plan editing) still live on their
// dedicated endpoints/tabs.
// ============================================================================

export type SavingsBenefitsFamily = 'BENEFIT' | 'RECURRING_COST';
export type SavingsBenefitsLifecycle = 'IN_PROGRESS' | 'REALIZED';
export type SavingsBenefitsValueBasis = 'ONE_TIME' | 'MONTHLY' | 'ANNUAL' | 'UNKNOWN';

export interface SavingsBenefitsUnifiedItemDTO {
  id: string;
  family: SavingsBenefitsFamily;
  lifecycle: SavingsBenefitsLifecycle;
  title: string;
  category: string;
  explanation: string | null;
  estimatedValue: number | null;
  estimatedValueBasis: SavingsBenefitsValueBasis;
  realizedValue: number | null;
  currency: string;
  deadline: string | null;
  sourceLabel: string | null;
  statusLabel: string;
  outcomeStage: 'SUBMITTED' | 'APPROVED' | 'DENIED' | 'RECEIVED' | 'WITHDRAWN' | null;
  verificationState: SavingsOutcomeVerificationState | null;
  detailHref: string;
  updatedAt: string;
  /** Other item IDs sharing this program's exclusion group — never hides real recorded value, only flags it. */
  mutuallyExclusiveWith: string[];
  canonicalAction: {
    id: string;
    actionType: string;
    state: 'STARTED' | 'COMPLETED' | 'CANCELLED';
    handoffStatus: 'CONSENTED' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'FULFILLED' | 'FAILED' | 'REVOKED' | null;
    partner: { id: string; name: string } | null;
  } | null;
}

export interface SavingsBenefitsExclusionConflictDTO {
  exclusionGroupKey: string;
  itemIds: string[];
}

export type SavingsBenefitsRelatedDomain = 'PROPERTY_TAX' | 'COVERAGE' | 'REFINANCE';

export interface SavingsBenefitsRelatedPointerDTO {
  domain: SavingsBenefitsRelatedDomain;
  summary: string;
  detailHref: string;
  updatedAt: string | null;
}

export interface SavingsBenefitsUnifiedResponseDTO {
  propertyId: string;
  inProgress: SavingsBenefitsUnifiedItemDTO[];
  realized: SavingsBenefitsUnifiedItemDTO[];
  relatedOpportunities: SavingsBenefitsRelatedPointerDTO[];
  totals: {
    inProgressCount: number;
    realizedCount: number;
    realizedValueTotal: number | null;
    realizedValueCurrency: string | null;
    realizedValueByCurrency: Record<string, number>;
    verifiedValueByCurrency: Record<string, number>;
    realizedValueByFamily: Record<SavingsBenefitsFamily, Record<string, number>>;
    exclusionConflicts: SavingsBenefitsExclusionConflictDTO[];
  };
}

// ============================================================================
// NEW BUDGET FORECASTER TYPES (PHASE 3)
// ============================================================================

export interface MonthlyForecast {
  month: string;
  routine: number;
  preventive: number;
  unexpected: number;
  total: number;
  tasks: string[];
}

export interface CategoryBreakdown {
  category: string;
  annualCost: number;
  percentage: number;
  items: string[];
}

export interface BudgetForecast {
  propertyId: string;
  propertyAddress: string;
  propertyAge: number;
  totalAnnualCost: number;
  monthlyAverage: number;
  confidenceLevel: number;
  monthlyForecasts: MonthlyForecast[];
  categoryBreakdowns: CategoryBreakdown[];
  recommendations: string[];
  generatedAt: string; // ISO Date string
}

// ============================================================================
// ORCHESTRATION TYPES (PHASE 7)
// Central intelligence contract between backend + frontend
// ============================================================================

/**
 * Source of an orchestrated action
 */
export type OrchestrationSource = 'RISK' | 'CHECKLIST';

/**
 * Why an action was suppressed
 */
export type SuppressionReason =
  | 'BOOKING_EXISTS'
  | 'COVERED'
  | 'CHECKLIST_TRACKED'
  | 'NOT_ACTIONABLE'
  | 'USER_MARKED_COMPLETE'
  | 'USER_UNMARKED_COMPLETE'
  | 'UNKNOWN';

/**
 * Coverage context (from warranty / insurance)
 */
export type CoverageType = 'HOME_WARRANTY' | 'INSURANCE' | 'NONE';

export interface CoverageInfoDTO {
  hasCoverage: boolean;
  type: CoverageType;
  expiresOn: string | null;
  sourceId?: string | null;
}

/**
 * Individual suppression explanation
 */
export interface SuppressionReasonEntryDTO {
  reason: SuppressionReason;
  message: string;
  relatedId?: string | null;
  relatedType?: 'BOOKING' | 'WARRANTY' | 'INSURANCE' | 'CHECKLIST' | 'MAINTENANCE_TASK' | null;
}

/**
 * Decision trace step (Gap 5)
 */
export interface DecisionTraceStepDTO {
  rule: string; // stable rule identifier
  outcome: 'APPLIED' | 'SKIPPED';
  details?: Record<string, any> | null;
  confidenceImpact?: number; // -1.0 → +1.0
}

export interface ActionConfidenceDTO {
  score: number; // 0 → 100
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  explanation?: string[];
};

export interface SnoozeInfoDTO {
  snoozedAt: string;
  snoozeUntil: string;
  snoozeReason: string | null;
  daysRemaining: number;
}
/**
 * Orchestrated Action DTO
 * Returned by /api/orchestration/:propertyId
 */
export interface OrchestratedActionDTO {
  id: string;
  actionKey: string;
  source: OrchestrationSource;
  propertyId: string;

  title: string;
  description?: string | null;

  // Risk-specific
  systemType?: string | null;
  category?: string | null;
  riskLevel?: string | null;
  age?: number | null;
  expectedLife?: number | null;
  exposure?: number | null;
  orchestrationActionId?: string | null;

  // Checklist-specific
  checklistItemId?: string | null;
  status?: string | null;
  nextDueDate?: string | null;
  isRecurring?: boolean | null;
  serviceCategory?: ServiceCategory | null;
  signalSources?: SignalSourceBadgeDTO[];
  primarySignalSource?: SignalSourceBadgeDTO | null;


  coverage?: CoverageInfoDTO;

  cta?: {
    show: boolean;
    label: string | null;
    reason: 'COVERED' | 'MISSING_DATA' | 'ACTION_REQUIRED' | 'NONE';
  };

  suppression: {
    suppressed: boolean;
    reasons: SuppressionReasonEntryDTO[];
    suppressionSource?: SuppressionSourceDTO;
  };

  hasRelatedChecklistItem?: boolean;
  relatedEntity?: {
    type: 'INVENTORY_ITEM' | 'BOOKING' | 'WARRANTY' | 'INSURANCE' | 'CHECKLIST';
    id: string;
  } | null;

  // 🔑 NEW: Related checklist item details
  relatedChecklistItem?: {
    id: string;
    title: string;
    nextDueDate: string | null;
    isRecurring: boolean;
    frequency: string | null;
    status: string;
    lastCompletedDate: string | null;
  };
  snooze?: SnoozeInfoDTO;  
  decisionTrace?: {
    steps: DecisionTraceStepDTO[];
  };

  confidence?: ActionConfidenceDTO;

  priority: number;
  overdue: boolean;
  createdAt?: string | null;
}

export interface OrchestrationSignalHighlightDTO {
  signalKey: string;
  label: string;
  valueNumber: number | null;
  valueText: string | null;
  capturedAt: string;
  validUntil: string | null;
  isFresh: boolean;
}

export interface OrchestrationSharedContextDTO {
  generatedAt: string;
  activeScenario: {
    assumptionSetId: string;
    toolKey: string;
    scenarioKey: string | null;
    createdAt: string;
  } | null;
  posture: {
    preferenceProfileId: string;
    riskTolerance: string | null;
    deductiblePreferenceStyle: string | null;
    cashBufferPosture: string | null;
    bundlingPreference: string | null;
    updatedAt: string;
  } | null;
  signalHighlights: OrchestrationSignalHighlightDTO[];
  strongestPressure: string | null;
  strongestOpportunity: string | null;
}

export interface OrchestrationNextBestMoveDTO {
  title: string;
  detail: string;
  reasonCode:
    | 'ACTION_CENTER'
    | 'COVERAGE_PRESSURE'
    | 'RISK_SPIKE'
    | 'COST_PRESSURE'
    | 'SCENARIO_CONTINUITY'
    | 'DEFAULT';
  sourceActionKey?: string | null;
  signalKey?: string | null;
  targetTool: string;
  targetPath: string;
  assumptionSetId?: string | null;
}

export interface OrchestrationHandoffDTO {
  fromTool: string;
  toTool: string;
  label: string;
  path: string;
  assumptionSetId?: string | null;
}

/**
 * Orchestration Summary DTO
 */
export interface OrchestrationSummaryDTO {
  propertyId: string;
  pendingActionCount: number;
  aggregationContext?: import('@/components/property-context/propertyContextTypes').PropertyContextEnvelope | null;

  derivedFrom: {
    riskAssessment: boolean;
    checklist: boolean;
  };

  // Actionable only
  actions: OrchestratedActionDTO[];

  // Explicitly suppressed (transparent UX)
  suppressedActions: OrchestratedActionDTO[];
  snoozedActions: OrchestratedActionDTO[];

  counts: {
    riskActions: number;
    checklistActions: number;
    suppressedActions: number;
    snoozedActions: number;
  };

  nextBestMove?: OrchestrationNextBestMoveDTO | null;
  sharedContext?: OrchestrationSharedContextDTO | null;
  handoffs?: OrchestrationHandoffDTO[];
}

export type SuppressionSourceDTO =
  | {
      type: 'PROPERTY_MAINTENANCE_TASK';
      task: {
        id: string;
        title: string;
        nextDueDate: string | null;
        status: string;
      };
    }
  | {
      type: 'CHECKLIST_ITEM';
      checklistItem: {
        id: string;
        title: string;
        frequency?: string | null;
        nextDueDate?: string | null;
        status: string;
      };
    }
  | {
      type: 'USER_EVENT';
      eventType: 'USER_MARKED_COMPLETE' | 'USER_UNMARKED_COMPLETE';
      createdAt: string;
    }
  | undefined;

  // Completion types
export interface CompletionDataDTO {
  completedAt: string;
  cost?: number | null;
  didItMyself?: boolean;
  serviceProviderName?: string | null;
  serviceProviderRating?: number | null;
  notes?: string | null;
  photoIds?: string[];
}

export interface CompletionResponseDTO {
  id: string;
  actionKey: string;
  completedAt: string;
  cost: number | null;
  didItMyself: boolean;
  serviceProviderName: string | null;
  serviceProviderRating: number | null;
  notes: string | null;
  photoCount: number;
  photos: CompletionPhotoDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface CompletionPhotoDTO {
  id: string;
  thumbnailUrl: string;
  originalUrl: string;
  fileName: string;
  fileSize: number;
  order: number;
}


export type SignalSourceType =
  | 'SCHEDULED'
  | 'INTELLIGENCE'
  | 'COVERAGE'
  | 'MANUAL'
  | 'SENSOR'
  | 'DOCUMENT'
  | 'EXTERNAL';

export type SignalTriggerType =
  | 'RULE'
  | 'MODEL'
  | 'EXTRACTION'
  | 'USER_ACTION'
  | 'SCHEDULE'
  | 'INGEST';

export type SignalSourceBadgeDTO = {
  sourceType: SignalSourceType;
  triggerType: SignalTriggerType;
  sourceSystem?: string | null;
  summary?: string | null;
  confidence?: number | null; // 0..1
};

/**
 * Community Events API payload
 */
export interface CommunityEventsResponse {
  events: CommunityEvent[];
  context?: import('@/components/property-context/propertyContextTypes').PropertyContextEnvelope;
}

/**
 * Lightweight community event summary for dashboard cards
 */
export interface CommunityEventSummary {
  id: string;
  title: string;
  category: CommunityEventCategory;
  startTime: string;
  externalUrl?: string | null;
}

// --- LOCAL UPDATES TYPES (NEW) ---

export interface LocalUpdate {
  id: string;
  title: string;
  shortDescription: string;
  category: LocalUpdateCategory;
  sourceName: string;
  isSponsored: boolean;
  ctaText: string;
  ctaUrl?: string | null;
}

// -----------------------------------------------------------------------------
// HOME BUYER TASK TYPES
// -----------------------------------------------------------------------------

export type HomeBuyerTaskStatus = 
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'NOT_NEEDED';

export type BuyerPlanPhase = 'PRE_CLOSE' | 'FIRST_30_DAYS' | 'DAYS_31_TO_90' | 'RECURRING_HOME';
export type BuyerPlanPriority = 'NOW' | 'SOON' | 'PLAN' | 'CONSIDER';
export type BuyerTaskSourceType = 'SYSTEM' | 'USER' | 'INSPECTION_FINDING' | 'DOCUMENT' | 'GUIDANCE_JOURNEY' | 'HOME_ACTION';
export type BuyerFindingDisposition = 'PENDING_REVIEW' | 'VERIFIED_FACT' | 'PRE_CLOSE_NEGOTIATION' | 'POST_CLOSE_ACTION' | 'DISMISSED';

export type HomeBuyerTaskServiceCategory =
  | 'INSPECTION'
  | 'MOVING'
  | 'INSURANCE'
  | 'ATTORNEY'
  | 'CLEANING'
  | 'LOCKSMITH'
  | 'HVAC'
  | 'PEST_CONTROL';

export type HomeBuyerTaskFrequency =
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'SEMI_ANNUALLY'
  | 'ANNUALLY';

export interface HomeBuyerTask {
  id: string;
  checklistId: string;
  title: string;
  description: string | null;
  status: HomeBuyerTaskStatus;
  actionKey: string;
  phase: BuyerPlanPhase;
  priority: BuyerPlanPriority;
  dueAt: string | null;
  anchorOffsetDays: number | null;
  assignedToUserId: string | null;
  sourceType: BuyerTaskSourceType;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  guidanceJourneyId: string | null;
  homeActionKey: string | null;
  serviceCategory: HomeBuyerTaskServiceCategory | null;
  frequency: HomeBuyerTaskFrequency | null;
  estimatedCostCents: number | null;
  sortOrder: number;
  bookingId: string | null;
  completedAt: Date | null;
  completionEvidenceJson: Record<string, unknown> | null;
  handedOffMaintenanceTaskId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HomeBuyerChecklist {
  id: string;
  propertyId: string;
  status: 'ACTIVE' | 'HANDED_OFF' | 'ARCHIVED';
  planStartDate: string;
  targetCloseDate: string | null;
  ownershipStartedAt: string | null;
  transitionedToRecurringAt: string | null;
  handoffCompletedAt: string | null;
  tasks: HomeBuyerTask[];
  createdAt: Date;
  updatedAt: Date;
}

export interface HomeBuyerTaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  notNeeded: number;
  progressPercentage: number;
}

export interface CreateHomeBuyerTaskInput {
  title: string;
  description?: string | null;
  serviceCategory?: HomeBuyerTaskServiceCategory | null;
  actionKey?: string;
  phase?: BuyerPlanPhase;
  priority?: BuyerPlanPriority;
  dueAt?: string | null;
  assignedToUserId?: string | null;
  completionEvidenceJson?: Record<string, unknown> | null;
}

export interface UpdateHomeBuyerTaskInput {
  title?: string;
  description?: string | null;
  status?: HomeBuyerTaskStatus;
  serviceCategory?: HomeBuyerTaskServiceCategory | null;
  sortOrder?: number;
  phase?: BuyerPlanPhase;
  priority?: BuyerPlanPriority;
  dueAt?: string | null;
  assignedToUserId?: string | null;
  completionEvidenceJson?: Record<string, unknown> | null;
}

export interface BuyerImportReadiness {
  propertyId: string;
  inspectionReports: { total: number; reviewPending: number; confirmed: number; openMaterialFindings: number };
  documents: { total: number; verified: number; unverified: number };
  nextRecommendedStep: 'IMPORT_INSPECTION' | 'REVIEW_EXTRACTION' | 'VERIFY_MATERIAL_FINDINGS' | 'VERIFY_DOCUMENTS' | 'BUILD_90_DAY_PLAN';
}

export interface BuyerEvidenceFinding {
  id: string;
  reportId: string;
  homeSystem: string;
  subsystem: string | null;
  location: string | null;
  severity: 'SAFETY' | 'MAJOR' | 'MINOR' | 'MONITOR' | 'INFORMATIONAL';
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED' | 'ACCEPTED_AS_IS';
  inspectorDescription: string;
  aiInterpretation: string;
  estimatedCostCentsLow: number | null;
  estimatedCostCentsHigh: number | null;
  extractionConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  buyerDisposition: BuyerFindingDisposition;
  buyerDispositionNotes: string | null;
  buyerDispositionAt: string | null;
  buyerTaskId: string | null;
  buyerGuidanceJourneyId: string | null;
  buyerRepairJourneyId: string | null;
}

export interface BuyerEvidenceReview {
  reports: Array<{
    id: string;
    reportType: string;
    inspectionDate: string;
    inspectorName: string | null;
    status: 'PROCESSING' | 'REVIEW_PENDING' | 'CONFIRMED' | 'ARCHIVED';
    findings: BuyerEvidenceFinding[];
  }>;
  documents: Array<{
    id: string;
    name: string;
    type: string;
    description: string | null;
    verificationStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
    verifiedAt: string | null;
    parserVersion: string | null;
    ocrQualityScore: number | null;
    createdAt: string;
  }>;
}

export interface BuyerAcceptanceStatus {
  propertyId: string;
  planStatus: 'ACTIVE' | 'HANDED_OFF' | 'ARCHIVED';
  findings: { total: number; reviewed: number; material: number; materialBranched: number };
  documents: { total: number; verified: number };
  tasks: { total: number; assigned: number; completed: number };
  handoff: { completed: boolean; completedAt: string | null };
  acceptanceReady: boolean;
}

export type NewHomePilotDecision = 'PENDING' | 'ELIGIBLE' | 'HOLD';
export type NewHomePilotAdmissionDecision = 'PENDING' | 'ADMITTED' | 'REJECTED';
export type NewHomeDocumentAvailability = 'NONE' | 'SOME' | 'COMPLETE';
export type NewHomePlanPhase = 'WALKTHROUGH' | 'FIRST_30_DAYS' | 'DAYS_31_TO_90' | 'FIRST_YEAR' | 'RECURRING_HOME';
export type NewHomeResponsibility = 'BUILDER' | 'HOMEOWNER' | 'SHARED' | 'UNKNOWN';

export interface NewHomePilotAssessment {
  id: string;
  propertyId: string;
  demandScore: number;
  documentAvailability: NewHomeDocumentAvailability;
  builderFollowupPainScore: number;
  engagementIntentScore: number;
  channelSource: string | null;
  estimatedAcquisitionCents: number | null;
  decision: NewHomePilotDecision;
  decisionReasons: string[];
  admissionDecision: NewHomePilotAdmissionDecision;
  admissionReasons: string[];
  cohortKey: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  notes: string | null;
  assessedAt: string;
}

export interface NewHomeSetupTask {
  id: string;
  planId: string;
  actionKey: string;
  title: string;
  description: string | null;
  status: HomeBuyerTaskStatus;
  phase: NewHomePlanPhase;
  priority: BuyerPlanPriority;
  responsibility: NewHomeResponsibility;
  dueAt: string | null;
  assignedToUserId: string | null;
  completionEvidenceJson: Record<string, unknown> | null;
  completedAt: string | null;
}

export interface NewHomeSetupPlan {
  id: string;
  propertyId: string;
  status: 'ACTIVE' | 'HANDED_OFF' | 'ARCHIVED';
  planStartDate: string;
  targetMoveInDate: string | null;
  ownershipStartedAt: string | null;
  builderWarrantyEndsAt: string | null;
  oneYearInspectionDueAt: string | null;
  transitionedToRecurringAt: string | null;
  tasks: NewHomeSetupTask[];
}

export interface NewHomeSetupOverview {
  humanPolicyApprovalEnforced: boolean;
  assessment: NewHomePilotAssessment | null;
  plan: NewHomeSetupPlan | null;
  evidence: {
    documents: { total: number; verified: number };
    warranties: number;
    inventory: { total: number; modelAndSerialCaptured: number };
    inspections: number;
  };
  punchList: Array<{ id: string; title: string; description: string | null; location: string | null; priority: BuyerPlanPriority; status: 'OPEN' | 'ACKNOWLEDGED' | 'SCHEDULED' | 'RESOLVED' | 'DISPUTED' | 'CLOSED'; promisedBy: string | null; builderContact: string | null; responses: Array<{ id: string; responseType: 'COMMENT' | 'ACKNOWLEDGED' | 'SCHEDULED' | 'REJECTED' | 'RESOLVED'; message: string | null; promisedBy: string | null; createdAt: string }> }>;
  warrantyRights: Array<{ id: string; coverageTitle: string; coverageSummary: string; sourceCitation: string; expiresAt: string; noticeDeadlineAt: string | null; status: 'DRAFT' | 'VERIFIED' | 'NOTICE_DUE' | 'CLAIMED' | 'EXPIRED'; deadlineTaskId: string | null }>;
  registrations: Array<{ id: string; inventoryItemId: string; manufacturer: string; modelNumber: string; serialNumber: string; status: 'NOT_STARTED' | 'SUBMITTED' | 'CONFIRMED' | 'NOT_REQUIRED' }>;
  evidenceRecords: Array<{ id: string; evidenceType: string; label: string; sourceCitation: string | null; verifiedAt: string | null }>;
  inspectionBundles: Array<{ id: string; milestone: 'DAY_30' | 'DAY_90' | 'ONE_YEAR'; status: 'PREPARING' | 'READY' | 'COMPLETED'; dueAt: string; checklistJson: string[]; inspectionReportId: string | null }>;
  inventoryCandidates: Array<{ id: string; name: string; manufacturer: string | null; modelNumber: string | null; serialNumber: string | null }>;
  documentCandidates: Array<{ id: string; name: string; type: string; verificationStatus: string }>;
  inspectionCandidates: Array<{ id: string; reportType: string; inspectionDate: string; status: string }>;
}

// -----------------------------------------------------------------------------
// PROPERTY MAINTENANCE TASK TYPES
// -----------------------------------------------------------------------------

export type MaintenanceTaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type MaintenanceTaskPriority =
  | 'URGENT'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW';

export type MaintenanceTaskSource =
  | 'USER_CREATED'
  | 'ACTION_CENTER'
  | 'SEASONAL'
  | 'RISK_ASSESSMENT'
  | 'WARRANTY_RENEWAL'
  | 'TEMPLATE';

export type MaintenanceTaskRiskLevel =
  | 'CRITICAL'
  | 'HIGH'
  | 'ELEVATED'
  | 'MODERATE'
  | 'LOW';

export type MaintenanceTaskFrequency =
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'SEMI_ANNUALLY'
  | 'ANNUALLY';

export type MaintenanceTaskServiceCategory =
  | 'HVAC'
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'HANDYMAN'
  | 'LANDSCAPING'
  | 'CLEANING'
  | 'PEST_CONTROL'
  | 'LOCKSMITH'
  | 'ROOFING'
  | 'APPLIANCE_REPAIR';

export interface PropertyMaintenanceTask {
  id: string;
  propertyId: string;
  title: string;
  description: string | null;
  status: MaintenanceTaskStatus;
  priority: MaintenanceTaskPriority;
  source: MaintenanceTaskSource;
  
  // Risk/Asset Information
  assetType: string | null;
  riskLevel: MaintenanceTaskRiskLevel | null;
  
  // Scheduling
  nextDueDate: string | null;
  isRecurring: boolean;
  frequency: MaintenanceTaskFrequency | null;
  lastCompletedDate: string | null;
  
  // Cost
  estimatedCost: number | null;
  actualCost: number | null;
  
  // Service
  serviceCategory: MaintenanceTaskServiceCategory | null;
  serviceProviderId: string | null;
  bookingId: string | null;
  
  // Relationships
  inventoryItemId: string | null;
  warrantyId: string | null;
  seasonalChecklistItemId: string | null;
  
  // Action Center Integration
  actionKey: string | null;

  // Task assignment (Household Collaboration)
  assignedToUserId?: string | null;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface MaintenanceTaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  overdue: number;
  dueThisWeek: number;
  dueThisMonth: number;
  
  byPriority: {
    urgent: number;
    high: number;
    medium: number;
    low: number;
  };
  
  bySource: {
    userCreated: number;
    actionCenter: number;
    seasonal: number;
    riskAssessment: number;
    warrantyRenewal: number;
    template: number;
  };
  
  totalEstimatedCost: number;
  totalActualCost: number;
}

export interface MaintenanceTaskFilters {
  status?: MaintenanceTaskStatus | MaintenanceTaskStatus[];
  priority?: MaintenanceTaskPriority | MaintenanceTaskPriority[];
  source?: MaintenanceTaskSource | MaintenanceTaskSource[];
  serviceCategory?: MaintenanceTaskServiceCategory | MaintenanceTaskServiceCategory[];
  isOverdue?: boolean;
  isDueSoon?: boolean;
  isRecurring?: boolean;
  hasBooking?: boolean;
  includeCompleted?: boolean;
  search?: string;
}

export interface CreateMaintenanceTaskInput {
  title: string;
  description?: string | null;
  priority?: MaintenanceTaskPriority;
  assetType?: string | null;
  estimatedCost?: number | null;
  serviceCategory?: MaintenanceTaskServiceCategory | null;
  isRecurring?: boolean;
  frequency?: MaintenanceTaskFrequency | null;
  nextDueDate?: string | null;
  inventoryItemId?: string | null;
  warrantyId?: string | null;
  templateId?: string;
}

export interface CreateMaintenanceTaskFromActionCenterInput {
  propertyId: string;
  title: string;
  description?: string | null;
  assetType: string;
  priority: MaintenanceTaskPriority;
  riskLevel?: MaintenanceTaskRiskLevel | null;
  serviceCategory?: MaintenanceTaskServiceCategory | null;
  estimatedCost?: number | null;
  nextDueDate: string;
  actionKey?: string; // 🔑 ADD: Optional actionKey from orchestration
}

export interface CreateMaintenanceTasksFromTemplatesInput {
  propertyId: string;
  templateIds: string[];
}

export interface UpdateMaintenanceTaskInput {
  title?: string;
  description?: string | null;
  priority?: MaintenanceTaskPriority;
  estimatedCost?: number | null;
  actualCost?: number | null;
  serviceCategory?: MaintenanceTaskServiceCategory | null;
  isRecurring?: boolean;
  frequency?: MaintenanceTaskFrequency | null;
  nextDueDate?: string | null;
  serviceProviderId?: string | null;
}

export type MaintenancePredictionStatus =
  | 'PENDING'
  | 'COMPLETED'
  | 'DISMISSED'
  | 'OVERDUE';

export interface MaintenancePrediction {
  id: string;
  propertyId: string;
  inventoryItemId: string | null;
  taskName: string;
  predictedDate: string;
  priority: number;
  reasoning: string | null;
  confidenceScore: number;
  status: MaintenancePredictionStatus;
  recommendedServiceCategory: ServiceCategory;
  booking: {
    id: string;
    status: BookingStatus;
  } | null;
  createdAt: string;
  updatedAt: string;
  inventoryItem: {
    id: string;
    name: string;
    category: InventoryItemCategory;
    lastServicedOn: string | null;
    isVerified: boolean;
  } | null;
}

export interface MaintenanceForecastSummary {
  propertyId: string;
  windowMonths: number;
  generatedAt: string;
  totalCandidates: number;
  created: number;
  updated: number;
}

// -----------------------------------------------------------------------------
// SEASONAL MAINTENANCE INTEGRATION TYPES
// -----------------------------------------------------------------------------

export interface SeasonalMaintenanceResult {
  success: boolean;
  message: string;
  task: PropertyMaintenanceTask;
}

export interface RemoveSeasonalMaintenanceResult {
  success: boolean;
  message: string;
}

// -----------------------------------------------------------------------------
// BOOKING LINK TYPES
// -----------------------------------------------------------------------------

export interface LinkBookingInput {
  bookingId: string;
}

export interface LinkBookingResponse {
  success: boolean;
  taskId: string;
  bookingId: string;
  message: string;
}

// =============================================================================
// END PHASE 3 TYPES

// =============================================================================
// SELLER'S VAULT TYPES
// =============================================================================

export interface VaultAsset {
  id: string;
  name: string;
  category: string;
  manufacturer: string | null;
  modelNumber: string | null;
  serialNumber: string | null;
  installedOn: string | null;
  purchasedOn: string | null;
  condition: string;
  expectedExpiryDate: string | null;
}

export interface VaultServiceEntry {
  id: string;
  category: string;
  description: string;
  completedAt: string | null;
  finalPrice: string | null;
  providerBusinessName: string | null;
}

export interface VaultData {
  overview: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
    name: string | null;
    yearBuilt: number | null;
    propertySize: number | null;
    healthScore: number;
  };
  gamification: {
    currentStreak: number;
    longestStreak: number;
    bonusMultiplier: number;
    unlockedBadges: string[];
  };
  verifiedAssets: VaultAsset[];
  serviceTimeline: VaultServiceEntry[];
}

export interface VaultShareLinkResponse {
  shareUrl: string;
  accessToken: string;
  expiresAt: string;
}

// =============================================================================
// HOME EVENT RADAR
// =============================================================================

export type RadarUserState = 'new' | 'seen' | 'saved' | 'dismissed' | 'acted_on';
export type RadarFeedbackType =
  | 'helpful'
  | 'wrong_location'
  | 'not_relevant'
  | 'duplicate'
  | 'stale'
  | 'other';

export interface RadarInteractionStateRecord {
  id: string;
  propertyRadarMatchId: string;
  state: RadarUserState;
  createdAt: string;
  updatedAt: string;
}

export interface RadarFeedbackRecord {
  feedbackType: RadarFeedbackType;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}
export type RadarSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type RadarImpactLevel = 'none' | 'watch' | 'moderate' | 'high';
export type RadarPriorityBand = 'low' | 'medium' | 'high' | 'urgent';
export type RadarMatchLifecycleStatus =
  | 'now'
  | 'upcoming'
  | 'recently_ended'
  | 'no_longer_applicable';
export type RadarSourceFreshnessStatus = 'fresh' | 'stale' | 'unknown';
export type RadarLifecycleStatus = 'active' | 'updated' | 'resolved' | 'expired' | 'retracted';
export type RadarTimingGroup = 'now' | 'upcoming' | 'recently_ended';

export interface RadarFeedItem {
  propertyRadarMatchId: string;
  radarEventId: string;
  propertyId: string;
  eventType: string;
  eventSubType: string | null;
  title: string;
  summary: string | null;
  severity: RadarSeverity;
  startAt: string;
  endAt: string | null;
  lifecycleStatus: RadarLifecycleStatus;
  timingGroup: RadarTimingGroup;
  impactLevel: RadarImpactLevel;
  impactSummary: string | null;
  priorityBand: RadarPriorityBand;
  matchLifecycleStatus: RadarMatchLifecycleStatus;
  sourceFreshnessStatus: RadarSourceFreshnessStatus;
  isSourceStale: boolean;
  isMaterialUpdate: boolean;
  isVisible: boolean;
  state: RadarUserState;
  createdAt: string;
}

export interface RadarRecommendedAction {
  code: string;
  label: string;
  priority: 'high' | 'medium' | 'low';
  responsibility?: {
    status: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
    reasonCodes: string[];
    missingFactKeys: string[];
    correctionPaths?: string[];
  };
}

export interface RadarImpactDriver {
  code: string;
  effect: 'increase' | 'decrease' | 'neutral';
  description: string;
}

export interface RadarMatchedSystem {
  type: string;
  relevance: 'high' | 'medium' | 'low';
}

export interface RadarMatchDetail {
  propertyRadarMatchId: string;
  radarEventId: string;
  propertyId: string;
  matchScore: number | null;
  impactLevel: RadarImpactLevel;
  impactSummary: string | null;
  impactFactorsJson: {
    property?: { yearBuilt?: number | null; propertySize?: number | null; dwellingType?: string | null };
    location?: { state?: string; city?: string; zip?: string };
    event?: { eventType?: string; eventSubType?: string | null; severity?: string };
    drivers?: RadarImpactDriver[];
  } | null;
  recommendedActionsJson: { actions?: RadarRecommendedAction[] } | null;
  matchedSystemsJson: { systems?: RadarMatchedSystem[] } | null;
  priorityBand: RadarPriorityBand;
  priorityVersion: string | null;
  priorityEvaluatedAt: string | null;
  matchLifecycleStatus: RadarMatchLifecycleStatus;
  lifecycleReason: string | null;
  lifecycleVersion: string | null;
  sourceFreshnessStatus: RadarSourceFreshnessStatus;
  sourceFreshnessReason: string | null;
  isSourceStale: boolean;
  isMaterialUpdate: boolean;
  materialUpdatedAt: string | null;
  noLongerApplicableAt: string | null;
  isVisible: boolean;
  visibleFrom: string | null;
  visibleUntil: string | null;
  event: {
    id: string;
    eventType: string;
    eventSubType: string | null;
    title: string;
    summary: string | null;
    sourceType: string;
    severity: RadarSeverity;
    startAt: string;
    endAt: string | null;
    locationType: string;
    locationKey: string;
    status: string;
  } | null;
  state: RadarUserState;
  stateMetaJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export type RadarMonitoringState =
  | 'ACTIVE'
  | 'PARTIAL'
  | 'DEGRADED'
  | 'UNCOVERED'
  | 'SETUP_NEEDED';
export type RadarFeedState =
  | 'HAS_EVENTS'
  | 'CONFIRMED_CLEAR'
  | 'PARTIAL_COVERAGE'
  | 'DEGRADED'
  | 'UNCOVERED';
export type RadarSourceFamily =
  | 'weather'
  | 'air_quality'
  | 'disaster'
  | 'utility'
  | 'tax'
  | 'insurance'
  | 'other';
export type RadarCanonicalSeverity = 'info' | 'low' | 'moderate' | 'high' | 'severe' | 'extreme';
export type RadarCanonicalImpact = 'none' | 'low' | 'moderate' | 'high' | 'critical';
export type RadarConfidence = 'low' | 'medium' | 'high' | 'verified';
export type RadarNotificationChannel = 'in_app' | 'email' | 'push';
export type RadarNotificationDeliveryMode = 'immediate' | 'digest';

export interface RadarNotificationPreferences {
  propertyId: string;
  userId: string;
  isEnabled: boolean;
  enabledCategories: RadarSourceFamily[];
  channels: RadarNotificationChannel[];
  minimumSeverity: RadarCanonicalSeverity;
  minimumImpact: RadarCanonicalImpact;
  deliveryMode: RadarNotificationDeliveryMode;
  criticalSafetyOverrideEnabled: boolean;
  quietHours: { start: string; end: string } | null;
  timezone: string;
  persisted: boolean;
  updatedAt: string | null;
}

export type UpdateRadarNotificationPreferencesInput = Pick<
  RadarNotificationPreferences,
  | 'isEnabled'
  | 'enabledCategories'
  | 'channels'
  | 'minimumSeverity'
  | 'minimumImpact'
  | 'deliveryMode'
  | 'criticalSafetyOverrideEnabled'
  | 'quietHours'
  | 'timezone'
>;

export interface RadarCategoryCoverage {
  family: RadarSourceFamily;
  status: 'covered' | 'not_covered' | 'disabled' | 'failed' | 'stale' | 'unknown';
  sourceDefinitionIds: string[];
  sourceNames: string[];
  detail: string;
  evaluatedAt: string | null;
  dataFreshThrough: string | null;
}

export interface RadarOverview {
  propertyId: string;
  generatedAt: string;
  monitoringState: RadarMonitoringState;
  readiness?: {
    state: 'READY' | 'PROPERTY_SETUP_REQUIRED' | 'MONITORING_NOT_INITIALIZED';
    reasonCode:
      | 'PROPERTY_LOCATION_INCOMPLETE'
      | 'COVERAGE_EVALUATION_NOT_RECORDED'
      | null;
    missingLocationFields: Array<'state' | 'postal_or_locality' | 'verified_location'>;
  };
  lastSuccessfulCheckAt: string | null;
  coverage: RadarCategoryCoverage[];
  counts: {
    active: number;
    new: number;
    upcoming: number;
    recentlyEnded: number;
    saved: number;
    dismissed: number;
  };
  homeSummary: {
    activeMaterialEventCount: number;
    mostUrgentMatch: {
      propertyMatchId: string;
      eventId: string;
      title: string;
      explanation: string;
      sourceFamily: RadarSourceFamily;
      sourceName: string;
      severity: RadarCanonicalSeverity;
      impact: RadarCanonicalImpact;
      confidence: RadarConfidence | null;
      priorityBand: RadarPriorityBand;
      effectiveAt: string;
      expiresAt: string | null;
      href: string;
    } | null;
  };
  propertyContext: import('@/components/property-context/propertyContextTypes').PropertyContextEnvelope;
}

export interface RadarCanonicalFeedItem {
  id: string;
  propertyMatchId: string;
  eventId: string;
  eventType: string;
  sourceFamily: RadarSourceFamily;
  title: string;
  summary: string;
  severity: RadarCanonicalSeverity;
  impact: RadarCanonicalImpact;
  confidence?: RadarConfidence;
  priorityBand: RadarPriorityBand;
  priorityScore: number;
  matchLifecycleStatus: Exclude<RadarMatchLifecycleStatus, 'no_longer_applicable'>;
  sourceFreshnessStatus: RadarSourceFreshnessStatus;
  sourceFreshnessReason: string | null;
  isSourceStale: boolean;
  isMaterialUpdate: boolean;
  lifecycleStatus: RadarLifecycleStatus;
  effectiveAt: string;
  expiresAt: string | null;
  sourceName: string;
  provider: string | null;
  userState: RadarUserState;
}

export type RadarNormalizedGeography =
  | { type: 'property'; propertyId: string }
  | { type: 'point'; latitude: number; longitude: number }
  | { type: 'radius'; center: { latitude: number; longitude: number }; radiusMeters: number }
  | { type: 'postal_code'; countryCode: string; postalCode: string }
  | { type: 'administrative_area'; countryCode: string; level: string; name: string; code?: string }
  | { type: 'polygon'; geoJson: Record<string, unknown> };

export type RadarActionTaskOperation =
  | 'create_task'
  | 'create_reminder'
  | 'link_existing_task';

export interface RadarTaskLink {
  id: string;
  actionCode: string;
  operation: RadarActionTaskOperation;
  dueAt: string | null;
  dueDateSource:
    | 'user_provided'
    | 'event_effective'
    | 'event_expiration'
    | 'active_window'
    | null;
  task: {
    id: string;
    title: string;
    status: string;
    nextDueDate: string | null;
    assignedToUserId: string | null;
    href: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface RadarTaskCandidate {
  id: string;
  title: string;
  status: string;
  priority: string;
  nextDueDate: string | null;
  assignedToUserId: string | null;
}

export interface RadarTaskIntegrationInput {
  operation: RadarActionTaskOperation;
  maintenanceTaskId?: string | null;
  dueAt?: string | null;
  assigneeUserId?: string | null;
}

export interface RadarCanonicalDetail extends RadarCanonicalFeedItem {
  geography: RadarNormalizedGeography | null;
  matchExplanation: {
    matcherVersion: string;
    matchedAt: string;
    matchType: string;
    confidence: RadarConfidence;
    homeownerExplanation?: string;
    distanceMeters?: number | null;
    reasons: string[];
    propertyFactsUsed: string[];
    missingFactReasons?: Array<{
      component: string;
      code: string;
      detail: string;
    }>;
  } | null;
  impactSummary: string | null;
  impactFactors: {
    drivers?: RadarImpactDriver[];
    missingFacts?: Array<{ factKey: string; reasonCode: string }>;
    responsibilityDecisions?: Array<{
      scope: string;
      party: string;
      decision: string;
    }>;
    [key: string]: unknown;
  } | null;
  matchedSystems: RadarMatchedSystem[];
  recommendedActions: Array<{
    code: string;
    label: string;
    priority: 'high' | 'medium' | 'low';
    responsibilityScope?: string;
    responsibleParty?: string;
    applicability?: 'owner_action' | 'coordinate' | 'verify_responsibility';
    registryVersion: 'radar-actions-v1';
    completionEvidence:
      | 'match_acknowledgement'
      | 'user_attestation'
      | 'downstream_capability'
      | 'official_source_view';
    safetyClassification:
      | 'general'
      | 'property_protection'
      | 'health_safety'
      | 'electrical_safety'
      | 'financial_review'
      | 'official_instruction';
    targetCapability: string | null;
    supportedTaskOperations: RadarActionTaskOperation[];
    taskLink: RadarTaskLink | null;
    destination: {
      kind: 'informational' | 'internal' | 'external';
      purpose:
        | 'coverage_review'
        | 'service_pricing'
        | 'maintenance'
        | 'document_vault'
        | 'provider_search'
        | 'official_instructions'
        | 'other_tool'
        | null;
      label: string | null;
      href: string | null;
    };
  }>;
  compoundInsights?: Array<{
    id: string;
    ruleCode: string;
    ruleVersion: string;
    title: string;
    summary: string;
    sourceMatchIds: string[];
    sourceEventIds: string[];
    sourceEvidence: Array<{
      matchId: string;
      eventId: string;
      eventType: string;
      eventSubType: string | null;
      severity: string;
      effectiveAt: string;
      expiresAt: string | null;
      sourceDefinitionId: string | null;
      sourceName: string | null;
      provider: string | null;
      canonicalUrl: string | null;
    }>;
    factEvidence: Array<{
      factKey: string;
      state: 'confirmed' | 'absent' | 'unknown' | 'current' | 'due';
      value: string | boolean | null;
    }>;
    evaluatedAt: string;
  }>;
  canonicalUrl: string | null;
  observedAt: string;
  revision: {
    observedAt: string;
    receivedAt: string;
    materialUpdatedAt: string | null;
  };
  sourceEvidence: {
    providerEventId: string | null;
    providerRevision: string | null;
    revisionIdentity: string | null;
  };
  missingFacts: Array<{
    factKey: string;
    reasonCode: string;
    detail: string;
    correctionPath: string;
  }>;
  propertyGeographyVersion: number | null;
  matcherVersion: string | null;
  relatedIncident: {
    id: string;
    status:
      | 'DETECTED'
      | 'EVALUATED'
      | 'ACTIVE'
      | 'ACTIONED'
      | 'MITIGATED'
      | 'RESOLVED'
      | 'SUPPRESSED'
      | 'EXPIRED';
    resolutionState: 'not_started' | 'in_progress' | 'resolved' | 'closed';
    title: string;
    summary: string | null;
    resolvedAt: string | null;
    expiredAt: string | null;
    updatedAt: string;
    href: string;
  } | null;
  relatedGuidance: {
    id: string;
    status:
      | 'NOT_STARTED'
      | 'ACTIVE'
      | 'BRANCHED'
      | 'COMPLETED'
      | 'ABORTED'
      | 'ARCHIVED'
      | 'DISMISSED';
    resolutionState: 'not_started' | 'in_progress' | 'resolved' | 'closed';
    currentStepKey: string | null;
    currentStep: {
      key: string;
      label: string;
      status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'BLOCKED';
      order: number;
    } | null;
    completedAt: string | null;
    updatedAt: string;
    href: string;
  } | null;
  resolutionContinuity: {
    state: 'not_started' | 'in_progress' | 'resolved' | 'closed';
    incidentState: 'not_started' | 'in_progress' | 'resolved' | 'closed' | null;
    guidanceState: 'not_started' | 'in_progress' | 'resolved' | 'closed' | null;
    continueResolution: {
      label: 'Start resolution' | 'Continue resolution';
      href: string;
    } | null;
  };
  userFeedback: RadarFeedbackRecord | null;
}

export interface RadarAppliedFilters {
  lifecycle: Array<'now' | 'upcoming' | 'recently_ended'>;
  sourceFamily: RadarSourceFamily[];
  severity: Array<'info' | 'low' | 'moderate' | 'high' | 'severe'>;
  impact: Array<'none' | 'low' | 'moderate' | 'high'>;
  confidence: RadarConfidence[];
  state: RadarUserState[];
  attention: Array<'new' | 'updated'>;
}

export interface RadarCanonicalFeed {
  propertyId: string;
  items: RadarCanonicalFeedItem[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
  totalCount: number;
  appliedFilters: RadarAppliedFilters;
  feedState: RadarFeedState;
  asOf: string;
}

export interface RadarCanonicalFeedParams extends Partial<RadarAppliedFilters> {
  limit?: number;
  cursor?: string;
}
// =============================================================================

// ============================================================================
// HOME DIGITAL TWIN
// ============================================================================

export type HomeDigitalTwinStatus = 'DRAFT' | 'ACTIVE' | 'STALE' | 'ARCHIVED';

export type HomeTwinComponentType =
  | 'HVAC'
  | 'WATER_HEATER'
  | 'ROOF'
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'INSULATION'
  | 'WINDOWS'
  | 'SOLAR'
  | 'APPLIANCE'
  | 'FLOORING'
  | 'EXTERIOR'
  | 'FOUNDATION'
  | 'OTHER';

export type HomeTwinComponentStatus = 'KNOWN' | 'ESTIMATED' | 'NEEDS_REVIEW' | 'RETIRED';

export type HomeTwinScenarioType =
  | 'MAINTAIN_COMPONENT'
  | 'REPAIR_COMPONENT'
  | 'REPLACE_COMPONENT'
  | 'UPGRADE_COMPONENT'
  | 'WAIT_MONITOR'
  | 'ENERGY_IMPROVEMENT'
  | 'RESILIENCE_IMPROVEMENT'
  | 'ADD_FEATURE'
  | 'RENOVATION'
  | 'REMOVE_FEATURE'
  | 'CUSTOM';

export type HomeTwinScenarioStatus = 'DRAFT' | 'READY' | 'COMPUTED' | 'FAILED' | 'ARCHIVED';

export type HomeTwinImpactType =
  | 'UPFRONT_COST'
  | 'ANNUAL_SAVINGS'
  | 'PAYBACK_PERIOD'
  | 'PROPERTY_VALUE_CHANGE'
  | 'RISK_REDUCTION'
  | 'ENERGY_USE_CHANGE'
  | 'MAINTENANCE_COST_CHANGE'
  | 'INSURANCE_IMPACT'
  | 'EMISSIONS_IMPACT'
  | 'COMFORT_IMPACT'
  | 'CUSTOM';

export type HomeTwinImpactDirection = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export type HomeTwinDataQualityDimension =
  | 'PROPERTY_PROFILE'
  | 'SYSTEMS'
  | 'APPLIANCES'
  | 'DOCUMENTATION'
  | 'COST_BASIS'
  | 'ENERGY_BASIS'
  | 'RISK_BASIS';

export type HomeTwinDataQualityStatus = 'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT' | 'UNKNOWN';

export type HomeTwinFactState =
  | 'VERIFIED'
  | 'REPORTED'
  | 'DOCUMENT_DERIVED'
  | 'INFERRED'
  | 'DEFAULT'
  | 'CONFLICTED'
  | 'UNKNOWN';

export type HomeTwinComponentLifecycleState = 'ACTIVE' | 'RETIRED' | 'SUPERSEDED';

/**
 * Field-level provenance for a single derived value on a component — see
 * HomeTwinProjectedFact in the backend schema. Each entry carries its own
 * source and fact state; none of it should be presented with more
 * confidence than that state implies.
 */
export interface HomeTwinProjectedFactDTO {
  id: string;
  fieldName: string;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  factState: HomeTwinFactState;
  sourceType: string;
  sourceRecordType: string | null;
  sourceRecordId: string | null;
  sourceField: string | null;
  observedAt: string | null;
  derivationMethod: string | null;
  derivationVersion: number;
  modelVersion: string;
  sourceVerified: boolean | null;
  confidenceScore: number | null;
  conflictGroupId: string | null;
  correctionDestination: string | null;
}

export interface HomeTwinComponentDTO {
  id: string;
  identityKey: string;
  componentType: HomeTwinComponentType;
  label: string | null;
  status: HomeTwinComponentStatus;
  sourceType: string;
  sourceReferenceId: string | null;
  lifecycleState: HomeTwinComponentLifecycleState;
  installYear: number | null;
  estimatedAgeYears: number | null;
  usefulLifeYears: number | null;
  conditionScore: number | null;
  failureRiskScore: number | null;
  replacementCostEstimate: number | null;
  annualOperatingCostEstimate: number | null;
  annualMaintenanceCostEstimate: number | null;
  energyImpactScore: number | null;
  resilienceImpactScore: number | null;
  confidenceScore: number | null;
  isUserConfirmed: boolean;
  metadata: Record<string, unknown> | null;
  lastModeledAt: string | null;
  createdAt: string;
  updatedAt: string;
  projectedFacts: HomeTwinProjectedFactDTO[];
}

export interface HomeTwinDataQualityDTO {
  dimension: HomeTwinDataQualityDimension;
  status: HomeTwinDataQualityStatus;
  score: number | null;
  missingFields: string[];
  lastEvaluatedAt: string | null;
}

export interface HomeTwinScenarioImpactDTO {
  id: string;
  impactType: HomeTwinImpactType;
  direction: HomeTwinImpactDirection;
  sourceClass: 'HOMEOWNER_ASSUMPTION' | 'CANONICAL_RECORD' | 'SYSTEM_CALCULATION' | 'CATEGORY_DEFAULT';
  sourceAsOf: string | null;
  assumptionsJson: Record<string, unknown> | null;
  qualificationText: string | null;
  valueNumeric: number | null;
  // Low/high bound the same figure with the uncertainty implied by its
  // source. Null on both when no defensible range exists (e.g. a
  // homeowner-typed number with no basis for a spread) — render the point
  // value in that case, not a fabricated range.
  valueLow: number | null;
  valueHigh: number | null;
  valueText: string | null;
  unit: string | null;
  confidenceScore: number | null;
  sortOrder: number;
  // True when this row reflects an input assumption or a calculation that
  // depends on input assumptions. Must be rendered distinctly from independent
  // system-derived impacts and never blended in as system evidence.
  isUserSupplied: boolean;
}

export interface HomeTwinScenarioSensitivityFactorDTO {
  assumption: string;
  baselineYears: number | null;
  lowYears: number | null;
  highYears: number | null;
  swingYears: number;
}

export interface HomeTwinScenarioDTO {
  id: string;
  name: string;
  scenarioType: HomeTwinScenarioType;
  status: HomeTwinScenarioStatus;
  description: string | null;
  inputPayload: Record<string, unknown>;
  baselineSnapshot: Record<string, unknown> | null;
  baselineDependencyFingerprint: string | null;
  staleAt: string | null;
  staleReason: string | null;
  isPinned: boolean;
  isArchived: boolean;
  lastComputedAt: string | null;
  createdAt: string;
  updatedAt: string;
  impacts: HomeTwinScenarioImpactDTO[];
  // The specific real system this decision is about, when set.
  componentId: string | null;
  component: { id: string; componentType: HomeTwinComponentType; label: string | null } | null;
  // Category-specific professional/safety boundary for the linked
  // component, computed at read time — null when the component type has
  // none.
  safetyBoundary: string | null;
  // Which assumption (cost vs. savings) moves the payback estimate more —
  // empty when the scenario type has no payback math to be sensitive about.
  sensitivity: HomeTwinScenarioSensitivityFactorDTO[];
  latestRun: {
    status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
    startedAt: string;
    completedAt: string | null;
    errorMessage: string | null;
  } | null;
  // Decision and execution loop — the homeowner's disposition on this
  // option, separate from `status` above (which only tracks computation).
  decisionStatus: HomeTwinScenarioDecisionStatus;
  decisionReason: string | null;
  decidedAt: string | null;
  // Pre-fill for the existing "new project" flow (see projectPrefill on the
  // backend service) — not persisted, computed at read time from the
  // linked component's type.
  projectPrefill: {
    projectType: string;
    category: string | null;
    inventoryItemId: string | null;
  };
}

export interface HomeTwinScenarioRunDTO {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  modelVersion: string;
  inputSnapshot: Record<string, unknown> | null;
  sourceSnapshot: Record<string, unknown> | null;
  outputSnapshot: Record<string, unknown> | null;
  calculationVersion: string | null;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export type HomeTwinScenarioDecisionStatus = 'OPEN' | 'SELECTED' | 'DEFERRED' | 'REJECTED' | 'CLOSED';

/**
 * Everything needed to act on a decided scenario without re-entering what's
 * already known — a link to any project already created from it, a
 * pre-fill href for creating a new one, and wayfinding links to the other
 * surfaces a decision might need next. Assembled at read time; nothing here
 * is persisted by this endpoint.
 */
export interface HomeTwinScenarioHandoffDTO {
  linkedProject: { id: string; name: string; status: string; projectType: string } | null;
  /**
   * Expected-vs-actual cost — only present once the linked project's
   * completion has been verified. Homeowner-scoped: this comes back only
   * inside this scenario's own handoff response, never aggregated.
   */
  actualOutcome: {
    projectedCostLow: number | null;
    projectedCostHigh: number | null;
    projectedCostSourceClass: 'HOMEOWNER_ASSUMPTION' | 'CANONICAL_RECORD' | 'SYSTEM_CALCULATION' | 'CATEGORY_DEFAULT' | null;
    actualCostCents: number;
    varianceCents: number | null;
  } | null;
  projectPrefill: {
    projectType: string;
    category: string | null;
    inventoryItemId: string | null;
  };
  createProjectHref: string;
  handoffLinks: {
    inspection: string;
    servicePriceRadar: string;
    renovationAdvisor: string;
    incentives: string;
    reserveFund: string;
    capitalTimeline: string;
  };
}

export interface HomeDigitalTwinDTO {
  id: string;
  propertyId: string;
  status: HomeDigitalTwinStatus;
  version: number;
  completenessScore: number | null;
  confidenceScore: number | null;
  lastComputedAt: string | null;
  lastSyncedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Property Context version the projection was computed from. */
  contextVersion: string | null;
  /**
   * Last successful build/refresh — preserved even after a failed run, so
   * this always reflects real projection freshness rather than the most
   * recent attempt.
   */
  lastGoodComputedAt: string | null;
  lastGoodContextVersion: string | null;
  /** Why the most recent run failed, if it did. Null once a run succeeds. */
  staleReason: string | null;
  /**
   * True when your property profile, inventory, or risk report has changed
   * since this projection was last built — a refresh would produce
   * different numbers. Distinct from staleReason (which only reflects a
   * failed run).
   */
  needsRecompute: boolean;
  /** Current-context decision envelope attached by the twin read API. */
  context?: import('@/components/property-context/propertyContextTypes').PropertyContextEnvelope | null;
  components: HomeTwinComponentDTO[];
  dataQuality: HomeTwinDataQualityDTO[];
  recentScenarios: HomeTwinScenarioDTO[];
}

/**
 * A single fact needing homeowner attention on the Home Record hub —
 * conflicting, defaulted, or unknown. correctionDestination links to the
 * existing surface that owns this fact (property edit, a specific
 * inventory item, or the inventory list); there is no separate correction
 * UI to build.
 */
export interface HomeTwinFactReadinessItemDTO {
  componentId: string;
  componentType: HomeTwinComponentType;
  componentLabel: string;
  fieldName: string;
  fieldLabel: string;
  factState: HomeTwinFactState;
  reason: string;
  correctionDestination: string | null;
  isConflict: boolean;
}

export interface HomeTwinFactReadinessSummaryDTO {
  hasTwin: boolean;
  knownFactCount: number;
  needsAttentionCount: number;
  confirmedComponentCount: number;
  totalComponentCount: number;
  items: HomeTwinFactReadinessItemDTO[];
}

/** Scenario-specific readiness — what's known/missing for one decision, not the twin's global completeness score. */
export interface HomeTwinScenarioReadinessDTO {
  readiness: 'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT';
  componentFound: boolean;
  known: string[];
  missing: { field: string; whyItMatters: string }[];
  safetyBoundary: string | null;
}

export interface HomeTwinScenarioComparisonDTO {
  component: { id: string; componentType: HomeTwinComponentType; label: string | null };
  options: HomeTwinScenarioDTO[];
}

export interface ScenarioSuggestionDTO {
  key: string;
  title: string;
  description: string;
  scenarioType: HomeTwinScenarioType;
  componentType: HomeTwinComponentType | null;
  componentId: string | null;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedUpfrontCost: number | null;
  reason: string;
  suggestedInputPayload: Record<string, unknown>;
}

export interface CreateScenarioInput {
  name: string;
  scenarioType: HomeTwinScenarioType;
  description?: string | null;
  inputPayload: Record<string, unknown>;
  isPinned?: boolean;
  componentId?: string | null;
}

export interface UpdateScenarioInput {
  isPinned?: boolean;
  isArchived?: boolean;
  name?: string;
  description?: string | null;
  inputPayload?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Home Renovation Risk Advisor
// ---------------------------------------------------------------------------

export type RenovationAdvisorSessionStatus =
  | 'DRAFT'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'ARCHIVED';

export type RenovationAdvisorConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNAVAILABLE';

export type RenovationAdvisorRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';

export type RenovationPermitRequirementStatus =
  | 'REQUIRED'
  | 'LIKELY_REQUIRED'
  | 'UNLIKELY_REQUIRED'
  | 'NOT_REQUIRED'
  | 'UNKNOWN'
  | 'DATA_UNAVAILABLE';

export interface RenovationAdvisorSourceMeta {
  sourceType: string;
  sourceLabel: string;
  sourceReferenceUrl: string | null;
  sourceRefreshedAt: string | null;
  freshnessLabel: string | null;
}

export interface RenovationAdvisorPermit {
  requirementStatus: RenovationPermitRequirementStatus;
  confidenceLevel: string;
  confidenceReason: string;
  costRange: { min: number | null; max: number | null };
  timelineRangeDays: { min: number | null; max: number | null };
  permitTypes: {
    permitType: string;
    isRequired: boolean;
    confidenceLevel: string;
    note: string | null;
    displayOrder: number;
  }[];
  inspectionStages: {
    inspectionStageType: string;
    isLikelyRequired: boolean;
    note: string | null;
    displayOrder: number;
  }[];
  applicationPortal: { url: string | null; label: string | null };
  summary: string;
  sourceMeta: RenovationAdvisorSourceMeta;
  dataAvailable: boolean;
}

export interface RenovationAdvisorTaxImpact {
  confidenceLevel: string;
  confidenceReason: string;
  assessedValueIncreaseRange: { min: number | null; max: number | null };
  annualTaxIncreaseRange: { min: number | null; max: number | null };
  monthlyTaxIncreaseRange: { min: number | null; max: number | null };
  reassessmentTriggerType: string;
  reassessmentTimelineSummary: string;
  reassessmentRuleSummary: string;
  plainLanguageSummary: string;
  sourceMeta: RenovationAdvisorSourceMeta;
  dataAvailable: boolean;
}

export interface RenovationAdvisorLicensing {
  requirementStatus: RenovationPermitRequirementStatus;
  confidenceLevel: string;
  confidenceReason: string;
  applicableCategories: {
    licenseCategoryType: string;
    isApplicable: boolean;
    confidenceLevel: string;
    note: string | null;
    displayOrder: number;
  }[];
  consequenceSummary: string;
  verificationTool: { url: string | null; label: string | null };
  plainLanguageSummary: string;
  sourceMeta: RenovationAdvisorSourceMeta & Record<string, any>;
  dataAvailable: boolean;
}

export interface RenovationAdvisorAssumption {
  assumptionKey: string;
  assumptionLabel: string;
  assumptionValueText: string | null;
  assumptionValueNumber: number | null;
  assumptionUnit: string | null;
  sourceType: string;
  confidenceLevel: string;
  rationale: string | null;
  isUserVisible: boolean;
  displayOrder: number;
}

export interface RenovationAdvisorWarning {
  code: string;
  title: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'IMMEDIATE';
  description: string;
}

export interface RetroactiveCandidate {
  timelineEventId: string;
  propertyId: string;
  eventTitle: string;
  occurredAt: string;
  amount: number | null;
  suggestedRenovationType: string | null;
  suggestedRenovationLabel: string | null;
  hasLinkedAdvisorSession: boolean;
  existingRenovationCaseId: string | null;
}

export interface RenovationAdvisorNextAction {
  key: string;
  label: string;
  description: string;
  destinationType: string;
  destinationRef: string | null;
  priority: number;
}

export interface RenovationAdvisorComplianceChecklist {
  permitObtainedStatus: string;
  licensedContractorUsedStatus: string;
  reassessmentReceivedStatus: string;
  notes: string | null;
  lastReviewedAt: string | null;
}

export interface RenovationAdvisorSession {
  id: string;
  propertyId: string;
  status: RenovationAdvisorSessionStatus;
  renovationType: string;
  renovationLabel: string;
  entryPoint: string;
  flowType: string;
  createdAt: string;
  updatedAt: string;
  lastEvaluatedAt: string | null;
  jurisdiction: {
    state: string | null;
    county: string | null;
    city: string | null;
    postalCode: string | null;
    jurisdictionLevel: string;
    normalizedKey: string | null;
  };
  projectCost: {
    inputValue: number | null;
    source: string;
    assumptionNote: string | null;
  };
  overallConfidence: RenovationAdvisorConfidence;
  overallRiskLevel: RenovationAdvisorRiskLevel;
  overallSummary: string | null;
  warningsSummary: string | null;
  nextStepsSummary: string | null;
  disclaimerVersion: string | null;
  disclaimerText?: string | null;
  isRetroactiveCheck: boolean;
  completedModificationReported: boolean;
  permit: RenovationAdvisorPermit | null;
  taxImpact: RenovationAdvisorTaxImpact | null;
  licensing: RenovationAdvisorLicensing | null;
  assumptions: RenovationAdvisorAssumption[];
  warnings: RenovationAdvisorWarning[];
  nextActions: RenovationAdvisorNextAction[];
  linkedEntities: {
    timelineEventId: string | null;
    riskEntityId: string | null;
    tcoEntityId: string | null;
    breakEvenEntityId: string | null;
    digitalTwinEntityId: string | null;
    chatContextId: string | null;
  };
  uiMeta: {
    displayModeHints: string[];
    unsupportedArea: boolean;
    partialCoverage: boolean;
    lowConfidenceAreas: string[];
  };
  complianceChecklist: RenovationAdvisorComplianceChecklist | null;
}

export interface RenovationAdvisorSessionSummary {
  id: string;
  propertyId: string;
  status: string;
  renovationType: string;
  renovationLabel: string;
  overallConfidence: string;
  overallRiskLevel: string;
  overallSummary: string | null;
  lastEvaluatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isRetroactiveCheck: boolean;
}

export interface CreateRenovationAdvisorSessionInput {
  propertyId: string;
  renovationType: string;
  entryPoint: string;
  flowType?: string;
  projectCostInput?: number;
  isRetroactiveCheck?: boolean;
}

export interface UpdateRenovationAdvisorSessionInput {
  projectCostInput?: number | null;
  renovationType?: string;
}

export interface EvaluateRenovationAdvisorSessionInput {
  forceRefresh?: boolean;
  evaluationMode?: 'FULL' | 'PERMIT_ONLY' | 'TAX_ONLY' | 'LICENSING_ONLY';
}

export type ResolutionCaseKind =
  | 'coverage_gap'
  | 'repair_replace'
  | 'maintenance'
  | 'incident'
  | 'renewal'
  | 'health_insight';

export type ResolutionCenterActionType =
  | 'MAINTENANCE_OVERDUE'
  | 'MAINTENANCE_UNSCHEDULED'
  | 'RENEWAL_EXPIRED'
  | 'RENEWAL_UPCOMING'
  | 'HEALTH_INSIGHT'
  | 'INCIDENT'
  | 'COVERAGE_GAP'
  | 'COVERAGE_PARTIAL';

export interface ResolutionCenterAction {
  id: string;
  type: ResolutionCenterActionType;
  title: string;
  description: string;
  dueDate?: Date | string | null;
  daysUntilDue?: number;
  propertyId: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  entityType?: 'Warranty' | 'Insurance';
  itemId?: string;
  status?: string;
}

export type ResolutionCaseStatus =
  | 'detected'
  | 'needs_analysis'
  | 'options_ready'
  | 'in_progress'
  | 'resolved';

export type ResolutionCasePriority = 'critical' | 'high' | 'medium' | 'low';

export type ResolutionCaseSource =
  | 'inventory'
  | 'coverage'
  | 'replace_repair'
  | 'incident'
  | 'health_score'
  | 'checklist';

export interface ResolutionCase {
  id: string;
  propertyId: string;
  kind: ResolutionCaseKind;
  status: ResolutionCaseStatus;
  priority: ResolutionCasePriority;
  title: string;
  summary: string;
  href: string;
  itemId?: string;
  dueDate?: string | null;
  source: ResolutionCaseSource;
  badges?: string[];
  metadata?: Record<string, unknown>;
}

export type DecisionInsightKind = 'repair_replace' | 'coverage_recommendation';

export interface DecisionInsight {
  id: string;
  propertyId: string;
  kind: DecisionInsightKind;
  title: string;
  subject: string;
  summary: string;
  href: string;
  itemId?: string;
  trust: {
    confidenceLabel: string;
    freshnessLabel: string;
    sourceLabel: string;
    rationale: string;
  };
  metadata?: Record<string, unknown>;
}

export type ExecutionItemKind = 'booking';

export interface ExecutionItem {
  id: string;
  propertyId: string;
  kind: ExecutionItemKind;
  title: string;
  subtitle?: string | null;
  statusLabel: string;
  href: string;
  scheduledLabel?: string | null;
  priceLabel?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ResolutionCenterData {
  cases: ResolutionCase[];
  decisionInsights: DecisionInsight[];
  executionItems: ExecutionItem[];
  counts: {
    openCases: number;
    decisionsReady: number;
    activeBookings: number;
    activeIncidents: number;
  };
}

export interface ResolutionCenterPayload extends ResolutionCenterData {
  urgentActions: ResolutionCenterAction[];
}

// ============================================================================
// MATERIAL SPEC REGISTRY TYPES
// ============================================================================

export type MaterialCategory = 'PAINT' | 'TILE' | 'FLOORING' | 'GROUT' | 'COUNTERTOP' | 'CABINET' | 'HARDWARE' | 'TRIM_MOLDING' | 'WALLPAPER' | 'ROOFING' | 'SIDING' | 'WINDOW' | 'DOOR' | 'INSULATION' | 'OTHER';
export type MaterialScopeLevel = 'ROOM' | 'PROPERTY';
export type MaterialSurface = 'WALLS' | 'CEILING' | 'FLOOR' | 'BACKSPLASH' | 'SHOWER_WALLS' | 'SHOWER_FLOOR' | 'TUB_SURROUND' | 'COUNTERTOP' | 'EXTERIOR_FACADE' | 'TRIM' | 'DOORS' | 'WINDOWS' | 'CABINETRY' | 'OTHER';
export type MaterialSpecExportStatus = 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
export type MaterialLifecycleStatus = 'PROPOSED' | 'APPROVED' | 'SUBSTITUTED' | 'INSTALLED' | 'AS_BUILT';
export type MaterialVerificationConfidence = 'REPORTED' | 'DOCUMENTED' | 'VERIFIED';
export type MaterialComplianceCheckStatus = 'NOT_CONFIGURED' | 'REVIEW_REQUIRED' | 'PASSED' | 'FAILED';

export interface MaterialSpecPhoto {
  id: string; materialSpecId: string; propertyId: string;
  photoUrl: string; fileKey: string; caption?: string | null; sortOrder: number; createdAt: string;
}

export interface MaterialSpec {
  id: string; propertyId: string; roomId?: string | null;
  scopeLevel: MaterialScopeLevel; category: MaterialCategory; surface?: MaterialSurface | null;
  label: string; manufacturer?: string | null; productLine?: string | null; productName?: string | null;
  sku?: string | null; colorCode?: string | null; colorHex?: string | null; finish?: string | null;
  dimensions?: string | null; material?: string | null; supplier?: string | null; supplierUrl?: string | null;
  purchaseDate?: string | null; quantityPurchased?: string | null; lotBatch?: string | null;
  notes?: string | null; isActive: boolean;
  linkedInventoryItemId?: string | null; projectId?: string | null;
  scopeVersionId?: string | null; sourceProgressLogId?: string | null;
  sourceChangeOrderId?: string | null; substitutedFromId?: string | null;
  lifecycleStatus: MaterialLifecycleStatus;
  verificationConfidence: MaterialVerificationConfidence;
  complianceRelevance?: {
    permitRelevant?: boolean;
    hoaRelevant?: boolean;
    attributes?: string[];
  } | null;
  permitAttributeCheck: MaterialComplianceCheckStatus;
  hoaAttributeCheck: MaterialComplianceCheckStatus;
  submittalDocumentIds: string[];
  approvalDocumentIds: string[];
  receiptDocumentId?: string | null;
  warrantyDocumentId?: string | null;
  manualDocumentId?: string | null;
  careInstructions?: string | null;
  quantityInstalled?: string | null;
  quantityRemaining?: string | null;
  remainingStorageLocation?: string | null;
  installedAt?: string | null;
  installedByName?: string | null;
  verifiedAt?: string | null;
  verifiedByUserId?: string | null;
  createdAt: string; updatedAt: string;
  photos: MaterialSpecPhoto[];
  room?: { id: string; name: string } | null;
  extractionReviews?: MaterialExtractionReview[];
  lifecycleEvents?: Array<{
    id: string;
    eventType: string;
    fromStatus?: MaterialLifecycleStatus | null;
    toStatus: MaterialLifecycleStatus;
    evidenceDocumentIds: string[];
    notes?: string | null;
    occurredAt: string;
  }>;
}

export interface MaterialExtractionReview {
  id: string;
  materialSpecId: string;
  propertyId: string;
  sourceDocumentId?: string | null;
  sourcePhotoKey?: string | null;
  extractionMethod: string;
  parserVersion?: string | null;
  candidateFields: Record<string, unknown>;
  confidence?: Record<string, unknown> | null;
  status: 'NEEDS_REVIEW' | 'CONFIRMED' | 'REJECTED';
  reviewedFields?: Record<string, unknown> | null;
  reviewNotes?: string | null;
  reviewedAt?: string | null;
}

export interface MaterialSpecExport {
  id: string; propertyId: string; requestedByUserId: string;
  status: MaterialSpecExportStatus; scopeType: string; title: string;
  totalSpecs?: number | null; fileUrl?: string | null; fileKey?: string | null;
  expiresAt?: string | null; errorMessage?: string | null;
  createdAt: string; updatedAt: string;
  signedUrl?: string | null;
}

// ============================================================================
// HOUSEHOLD COLLABORATION TYPES
// ============================================================================

export type HouseholdRole = 'OWNER' | 'CONTRIBUTOR' | 'VIEWER';
export type HouseholdInviteStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
export type HouseholdActivityType =
  | 'MEMBER_INVITED' | 'MEMBER_JOINED' | 'MEMBER_REMOVED' | 'MEMBER_ROLE_CHANGED'
  | 'TASK_ASSIGNED' | 'TASK_COMPLETED' | 'TASK_CREATED'
  | 'HOME_EVENT_LOGGED' | 'INVENTORY_ITEM_ADDED' | 'INCIDENT_UPDATED'
  | 'CLAIM_FILED' | 'DOCUMENT_UPLOADED' | 'GUIDANCE_STEP_COMPLETED' | 'NOTE_ADDED';

export interface HouseholdMemberUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string | null;
  lastLoginAt?: string | null;
}

export interface HouseholdMember {
  id: string;
  propertyId: string;
  userId: string;
  role: HouseholdRole;
  isPrimaryOwner: boolean;
  displayName?: string | null;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
  user: HouseholdMemberUser;
}

export interface HouseholdInvite {
  id: string;
  propertyId: string;
  invitedByUserId: string;
  inviteeEmail: string;
  inviteeUserId?: string | null;
  role: HouseholdRole;
  status: HouseholdInviteStatus;
  token: string;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

export interface InvitePreview {
  propertyAddressSnippet: string;
  invitedByName: string;
  role: HouseholdRole;
  expiresAt: string;
  isExpired: boolean;
}

export interface HouseholdActivityItem {
  id: string;
  propertyId: string;
  actorUserId: string;
  activityType: HouseholdActivityType;
  targetUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  summaryText: string;
  metaJson?: Record<string, unknown> | null;
  createdAt: string;
  actorUser: {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string | null;
  };
}

export interface SendInvitePayload {
  email: string;
  role: HouseholdRole;
}

export interface ActivityFeedParams {
  limit?: number;
  cursor?: string;
  activityTypes?: HouseholdActivityType[];
}

// ─── Home Improvement Financing Center ───────────────────────────────────────

export type FinancingOptionType =
  | 'HELOC'
  | 'HOME_EQUITY_LOAN'
  | 'PERSONAL_LOAN'
  | 'CONTRACTOR_FINANCING'
  | 'PAY_CASH';

export type MortgageType =
  | 'FIXED_30'
  | 'FIXED_15'
  | 'FIXED_20'
  | 'ARM_5'
  | 'ARM_7'
  | 'FHA_30'
  | 'VA_30'
  | 'JUMBO_30'
  | 'OTHER';

export type PropertyMortgageStatus = 'UNKNOWN' | 'MORTGAGED' | 'NO_MORTGAGE';

export type FinancingScenarioStatus = 'DRAFT' | 'SAVED' | 'ARCHIVED';

export type FinancingEntryPoint =
  | 'REPLACE_REPAIR'
  | 'CAPITAL_TIMELINE'
  | 'BUDGET_FORECASTER'
  | 'DIGITAL_TWIN'
  | 'DIRECT'
  | 'GUIDANCE_STEP';

export interface PropertyFinancingProfile {
  propertyContext?: import('@/components/property-context/propertyContextTypes').PropertyContextEnvelope;
  id: string;
  propertyId: string;
  mortgageStatus?: PropertyMortgageStatus;
  purchasePriceCents?: number;
  purchaseDate?: string;
  mortgageType?: MortgageType;
  originalMortgageBalanceCents?: number;
  currentMortgageBalanceCents?: number;
  mortgageBalanceAsOfDate?: string;
  interestRateBps?: number;
  remainingTermMonths?: number;
  monthlyPaymentCents?: number;
  hasSecondMortgage: boolean;
  secondMortgageBalanceCents?: number;
  hasPMI: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EquityPosition {
  propertyContext?: import('@/components/property-context/propertyContextTypes').PropertyContextEnvelope;
  propertyContextVersion?: string | null;
  id: string;
  propertyId: string;
  estimatedValueCents: number;
  estimatedValueSource: 'APPRECIATION_TRACKER' | 'PURCHASE_PRICE' | 'USER_ENTERED';
  mortgageBalanceCents: number;
  secondMortgageBalanceCents: number;
  equityCents: number;
  equityPercent: number;
  ltvPercent: number;
  helocCapacityCents: number;
  helocEligible: boolean;
  computedAt: string;
}

export interface HELOCResult {
  drawMonthlyPaymentCents: number;
  repaymentMonthlyPaymentCents: number;
  totalCostCents: number;
  totalInterestCents: number;
  rateBps: number;
}

export interface HomeEquityLoanResult {
  monthlyPaymentCents: number;
  totalInterestCents: number;
  termYears: number;
  rateBps: number;
}

export interface PersonalLoanScenario {
  termYears: number;
  rateBps: number;
  monthlyPaymentCents: number;
  totalInterestCents: number;
}

export interface PersonalLoanResult {
  scenarios: PersonalLoanScenario[];
}

export interface ContractorFinancingResult {
  promoMonths: number;
  promoMonthlyIfPaidInFullCents: number;
  deferredInterestRiskCents: number;
  ongoingMonthlyIfNotPaidCents: number;
  ongoingAprBps: number;
  warningText: string;
}

export interface PayCashResult {
  opportunityCostFiveYearCents: number;
  opportunityCostTenYearCents: number;
  opportunityCostRateBps: number;
}

export interface FinancingResultSet {
  propertyContext?: import('@/components/property-context/propertyContextTypes').PropertyContextEnvelope;
  calculationContext?: { mode: 'SCENARIO'; overrideFields: string[] };
  projectCostCents: number;
  helocEligible: boolean;
  helocCapacityCents: number;
  heloc: HELOCResult;
  homeEquityLoan: HomeEquityLoanResult;
  personalLoan: PersonalLoanResult;
  contractorFinancing: ContractorFinancingResult;
  payCash: PayCashResult;
  ratesAsOf: string;
  disclaimer: string;
}

export interface FinancingScenarioSummary {
  propertyContext?: import('@/components/property-context/propertyContextTypes').PropertyContextEnvelope;
  propertyContextVersion?: string | null;
  id: string;
  title: string;
  projectCostCents: number;
  status: FinancingScenarioStatus;
  entryPoint: FinancingEntryPoint;
  selectedOption?: FinancingOptionType;
  createdAt: string;
}

export interface FinancingScenario extends FinancingScenarioSummary {
  projectDescription?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  equitySnapshotCents?: number;
  helocCapacitySnapshotCents?: number;
  resultsJson: FinancingResultSet;
  notes?: string;
}

export interface FinancingProfilePayload {
  mortgageStatus?: PropertyMortgageStatus;
  purchasePriceCents?: number;
  purchaseDate?: string;
  mortgageType?: MortgageType;
  originalMortgageBalanceCents?: number;
  currentMortgageBalanceCents?: number;
  mortgageBalanceAsOfDate?: string;
  interestRateBps?: number;
  remainingTermMonths?: number;
  monthlyPaymentCents?: number;
  hasSecondMortgage?: boolean;
  secondMortgageBalanceCents?: number;
  hasPMI?: boolean;
}

export interface CreateScenarioPayload {
  title: string;
  projectDescription?: string;
  projectCostCents: number;
  entryPoint: FinancingEntryPoint;
  sourceEntityType?: string;
  sourceEntityId?: string;
  notes?: string;
}

export interface UpdateScenarioPayload {
  title?: string;
  notes?: string;
  selectedOption?: FinancingOptionType;
  status?: FinancingScenarioStatus;
}

// ─── DIY Project Center ────────────────────────────────────────────────────────

export type DiyProjectCategory = 'HVAC' | 'PLUMBING' | 'ELECTRICAL' | 'PAINTING' | 'GENERAL' | 'EXTERIOR' | 'FLOORING' | 'APPLIANCE' | 'LANDSCAPING' | 'OTHER';
export type DiySkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type DiyDifficultyLevel = 'EASY' | 'MODERATE' | 'HARD' | 'EXPERT_ONLY';
export type DiyProjectStatus = 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED' | 'HIRED_OUT';
export type DiyDecisionVerdict = 'DIY_RECOMMENDED' | 'BORDERLINE' | 'HIRE_RECOMMENDED' | 'HIRE_REQUIRED';
export type DiyStepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
export type DiyToolAction = 'ALREADY_OWNED' | 'RENT' | 'BUY';
export type DiySafetyLevel = 'LOW' | 'MODERATE' | 'HIGH';
export type DiyPermitRequirement =
  | 'REQUIRED'
  | 'NOT_REQUIRED'
  | 'LIKELY_REQUIRED'
  | 'LIKELY_NOT_REQUIRED'
  | 'UNKNOWN'
  | 'DATA_UNAVAILABLE';
export type DiyAiGuideStatus = 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';

export interface DiySkillProfile {
  id: string;
  hvac: DiySkillLevel;
  plumbing: DiySkillLevel;
  electrical: DiySkillLevel;
  painting: DiySkillLevel;
  general: DiySkillLevel;
  exterior: DiySkillLevel;
  flooring: DiySkillLevel;
  appliance: DiySkillLevel;
  landscaping: DiySkillLevel;
  toolsOwnedJson: string[];
  assessedAt: string;
}

export interface DiySkillProfilePayload {
  hvac: DiySkillLevel;
  plumbing: DiySkillLevel;
  electrical: DiySkillLevel;
  painting: DiySkillLevel;
  general: DiySkillLevel;
  exterior: DiySkillLevel;
  flooring: DiySkillLevel;
  appliance: DiySkillLevel;
  landscaping: DiySkillLevel;
  toolsOwnedJson?: string[];
  quizAnswersJson?: object;
}

export interface DiyTemplateSummary {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  category: DiyProjectCategory;
  difficultyLevel: DiyDifficultyLevel;
  requiredSkillLevel: DiySkillLevel;
  safetyLevel: DiySafetyLevel;
  estimatedMinutes: number;
  estimatedMaterialCostMinCents?: number;
  estimatedMaterialCostMaxCents?: number;
  professionalCostMinCents?: number;
  professionalCostMaxCents?: number;
  tags: string[];
  featuredOrder?: number;
}

export interface DiyTemplateStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  estimatedMinutes?: number;
  safetyNote?: string;
  tipNote?: string;
  imageUrl?: string;
  isOptional: boolean;
}

export interface DiyTemplateMaterial {
  id: string;
  name: string;
  unit: string;
  quantityFormula: string;
  unitPriceCents: number;
  isOptional: boolean;
  purchaseNote?: string;
}

export interface DiyTemplateTool {
  id: string;
  name: string;
  canonicalId?: string;
  isRequired: boolean;
  defaultToolAction: DiyToolAction;
  rentDailyPriceCents?: number;
  buyEstimatePriceCents?: number;
}

export interface DiyTemplateDetail extends DiyTemplateSummary {
  longDescription?: string;
  permitRequirement: DiyPermitRequirement;
  steps: DiyTemplateStep[];
  materials: DiyTemplateMaterial[];
  tools: DiyTemplateTool[];
}

export interface DiyDecisionFactor {
  code: string;
  label: string;
  effect: 'positive' | 'negative' | 'neutral';
  contributionPoints: number;
  description: string;
}

export interface DiyDecisionResult {
  verdict: DiyDecisionVerdict;
  score: number;
  factors: DiyDecisionFactor[];
  blockers: string[];
  savingsEstimateCents: number;
  reasoning: string;
}

export interface DiyDecisionInput {
  projectCategory: DiyProjectCategory;
  difficultyLevel: DiyDifficultyLevel;
  safetyLevel: DiySafetyLevel;
  permitRequirement: DiyPermitRequirement;
  requiredSkillLevel: DiySkillLevel;
  estimatedMinutes: number;
  requiredToolCanonicalIds: string[];
  estimatedMaterialCostMinCents?: number;
  estimatedMaterialCostMaxCents?: number;
  professionalCostMinCents?: number;
  professionalCostMaxCents?: number;
}

export interface DiyProjectSummary {
  id: string;
  title: string;
  category: DiyProjectCategory;
  status: DiyProjectStatus;
  decisionVerdict?: DiyDecisionVerdict;
  requiredStepCount: number;
  completedStepCount: number;
  templateId?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface DiyProjectStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  estimatedMinutes?: number;
  safetyNote?: string;
  tipNote?: string;
  isOptional: boolean;
  status: DiyStepStatus;
  notes?: string;
  completedAt?: string;
}

export interface DiyProjectMaterial {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  unitPriceCents: number;
  totalEstimateCents: number;
  isOptional: boolean;
  purchaseNote?: string;
  isPurchased: boolean;
}

export interface DiyProjectTool {
  id: string;
  name: string;
  isRequired: boolean;
  defaultToolAction: DiyToolAction;
  userToolAction?: DiyToolAction;
  rentDailyPriceCents?: number;
  buyEstimatePriceCents?: number;
}

export interface DiyProjectDetail extends DiyProjectSummary {
  description?: string;
  maintenanceTaskId?: string;
  incidentId?: string;
  inventoryItemId?: string;
  homeEventId?: string;
  notesJson: { text: string; createdAt: string }[];
  photoUrls: string[];
  actualMinutes?: number;
  actualMaterialCostCents?: number;
  steps: DiyProjectStep[];
  materials: DiyProjectMaterial[];
  tools: DiyProjectTool[];
  aiGuideId?: string;
  aiGuide?: { generatedSummary?: string; safetyWarningsJson?: string[] };
}

export interface DiyAiGuide {
  id: string;
  status: DiyAiGuideStatus;
  userPrompt: string;
  category?: DiyProjectCategory;
  generatedTitle?: string;
  generatedSummary?: string;
  safetyLevel?: DiySafetyLevel;
  permitRequirement?: DiyPermitRequirement;
  stepsJson?: object[];
  materialsJson?: object[];
  toolsJson?: object[];
  decisionVerdict?: DiyDecisionVerdict;
  safetyWarningsJson?: string[];
  errorMessage?: string;
  createdAt: string;
}

export interface DiyTemplateListParams {
  category?: string | string[];
  difficulty?: string | string[];
  maxSkillLevel?: DiySkillLevel;
  search?: string;
  limit?: number;
  cursor?: string;
}

export interface DiyProjectListParams {
  status?: string | string[];
  category?: string | string[];
  limit?: number;
  cursor?: string;
}

export interface CreateDiyProjectPayload {
  templateId?: string;
  aiGuideId?: string;
  maintenanceTaskId?: string;
  incidentId?: string;
  inventoryItemId?: string;
  decisionVerdict?: DiyDecisionVerdict;
  decisionScoreJson?: object;
}

export interface UpdateDiyProjectPayload {
  notesJson?: { text: string; createdAt: string }[];
  photoUrls?: string[];
}

// ─── DIY Admin ───────────────────────────────────────────────────────────────

export type DiyTemplateStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'ACTIVE' | 'ARCHIVED';

export interface AdminDiyTemplateSummary {
  id: string;
  slug: string;
  title: string;
  category: DiyProjectCategory;
  difficultyLevel: DiyDifficultyLevel;
  requiredSkillLevel: DiySkillLevel;
  safetyLevel: DiySafetyLevel;
  status: DiyTemplateStatus;
  featuredOrder?: number;
  stepCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDiyTemplateDetail extends DiyTemplateDetail {
  slug: string;
  status: DiyTemplateStatus;
  permitRequirement: DiyPermitRequirement;
  tags: string[];
  featuredOrder?: number;
  geminiPromptHint?: string;
}

export interface DiyTemplateStepInput {
  title: string;
  description: string;
  estimatedMinutes?: number;
  safetyNote?: string;
  tipNote?: string;
  imageUrl?: string;
  isOptional: boolean;
}

export interface DiyTemplateMaterialInput {
  name: string;
  description?: string;
  unit: string;
  quantityFormula: string;
  unitPriceCents: number;
  isOptional: boolean;
  purchaseNote?: string;
}

export interface DiyTemplateToolInput {
  name: string;
  canonicalId?: string;
  description?: string;
  isRequired: boolean;
  defaultToolAction: DiyToolAction;
  rentDailyPriceCents?: number;
  buyEstimatePriceCents?: number;
}

export interface AdminDiyTemplatePayload {
  slug: string;
  title: string;
  shortDescription: string;
  longDescription?: string;
  category: DiyProjectCategory;
  difficultyLevel: DiyDifficultyLevel;
  requiredSkillLevel: DiySkillLevel;
  safetyLevel: DiySafetyLevel;
  permitRequirement: DiyPermitRequirement;
  estimatedMinutes: number;
  estimatedMaterialCostMinCents?: number;
  estimatedMaterialCostMaxCents?: number;
  professionalCostMinCents?: number;
  professionalCostMaxCents?: number;
  tags: string[];
  featuredOrder?: number;
  geminiPromptHint?: string;
  steps: DiyTemplateStepInput[];
  materials: DiyTemplateMaterialInput[];
  tools: DiyTemplateToolInput[];
}

// ─── Permit History & Unpermitted Work Tracker ───────────────────────────────

export type PermitRecordCategory =
  | 'BUILDING' | 'ELECTRICAL' | 'PLUMBING' | 'MECHANICAL' | 'STRUCTURAL'
  | 'ROOFING' | 'ZONING' | 'DEMOLITION' | 'GRADING' | 'FIRE' | 'OTHER';

export type PermitWorkType =
  | 'HVAC_NEW' | 'HVAC_REPLACEMENT' | 'ELECTRICAL_PANEL' | 'ELECTRICAL_WIRING'
  | 'PLUMBING_NEW' | 'PLUMBING_REPAIR' | 'ROOF_REPLACEMENT' | 'ROOF_REPAIR'
  | 'ROOM_ADDITION' | 'GARAGE_CONVERSION' | 'ADU' | 'BASEMENT_FINISH' | 'DECK_PATIO'
  | 'FENCE' | 'SWIMMING_POOL' | 'SOLAR' | 'WINDOWS_DOORS' | 'FIREPLACE'
  | 'SEWER_WATER_LINE' | 'STRUCTURAL_REPAIR' | 'INTERIOR_REMODEL' | 'EXTERIOR_REMODEL'
  | 'DEMOLITION' | 'GRADING_DRAINAGE' | 'OTHER';

export type PermitRecordStatus =
  | 'APPLIED' | 'UNDER_REVIEW' | 'CORRECTION_REQUESTED' | 'RESUBMITTED'
  | 'ISSUED' | 'INSPECTION_PENDING' | 'INSPECTION_FAILED'
  | 'FINALED' | 'EXPIRED' | 'VOIDED' | 'UNKNOWN';

export type PermitReportedWorkflowStatus =
  | 'DRAFT' | 'PREPARING_APPLICATION' | 'SUBMITTED' | 'UNDER_REVIEW'
  | 'CORRECTION_REQUESTED' | 'RESUBMITTED' | 'ISSUED_REPORTED'
  | 'INSPECTIONS_IN_PROGRESS' | 'CLOSEOUT_REQUESTED' | 'COMPLETED_REPORTED'
  | 'EXPIRED_REPORTED' | 'WITHDRAWN';

export type PermitStatusTruthLayer = 'DOCUMENTED' | 'SOURCE_OBSERVED' | 'AUTHORITY_CONFIRMED';

export type PermitStatusSourceType =
  | 'AUTHORITY_OPEN_DATA' | 'AUTHORITY_PORTAL' | 'AUTHORITY_DOCUMENT'
  | 'AUTHORITY_EMAIL' | 'AUTHORITY_REPRESENTATIVE' | 'OTHER';

export type PermitRecordSource = 'OPEN_DATA_API' | 'MANUAL_ENTRY' | 'DOCUMENT_UPLOAD';

export type PermitInspectionStatus =
  | 'NOT_SCHEDULED' | 'SCHEDULED' | 'PASSED' | 'FAILED' | 'PARTIAL' | 'CANCELLED';

export type PermitUnpermittedFlagStatus =
  | 'UNKNOWN' | 'FLAGGED' | 'INVESTIGATING' | 'CONFIRMED_PERMITTED' | 'CONFIRMED_UNPERMITTED'
  | 'WILL_REMEDIATE' | 'REMEDIATED' | 'DISMISSED';

export type PermitDisclosureRisk = 'LOW' | 'MEDIUM' | 'HIGH';
export type PermitHistoricalWorkOrigin = 'CURRENT_OWNER' | 'PRIOR_OWNER' | 'UNKNOWN';
export type PermitHistoricalWorkStage = 'ALREADY_STARTED' | 'COMPLETED' | 'UNKNOWN';
export type PermitRecordSearchOutcome =
  | 'NOT_SEARCHED'
  | 'MATCH_FOUND'
  | 'NOT_FOUND_IN_AVAILABLE_RECORDS'
  | 'RECORDS_UNAVAILABLE'
  | 'INCONCLUSIVE';
export type PermitEvidenceConfidence = 'LOW' | 'MEDIUM' | 'HIGH' | 'AUTHORITY_CONFIRMED';
export type PermitResearchChannel =
  | 'NONE'
  | 'OPEN_DATA'
  | 'DOCUMENT_REVIEW'
  | 'LICENSED_PROFESSIONAL'
  | 'MUNICIPAL_AUTHORITY'
  | 'REAL_ESTATE_ATTORNEY'
  | 'OTHER';

export type PermitFetchJobStatus =
  | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'NO_DATA_SOURCE';

export interface PermitFetchJobSummary {
  id: string;
  status: PermitFetchJobStatus;
  dataSourceName?: string;
  permitsFound?: number;
  permitsInserted?: number;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

export interface PermitSummary {
  id: string;
  permitNumber?: string;
  category: PermitRecordCategory;
  workTypes: PermitWorkType[];
  description?: string;
  status: PermitRecordStatus;
  reportedStatus: PermitReportedWorkflowStatus;
  officialTruthLayer?: PermitStatusTruthLayer;
  officialSourceType?: PermitStatusSourceType;
  officialSourceReference?: string;
  officialEvidenceDocumentId?: string;
  officialObservedAt?: string;
  authorityReferenceNumber?: string;
  source: PermitRecordSource;
  issueDate?: string;
  finaledDate?: string;
  expirationDate?: string;
  contractorName?: string;
  isVerified: boolean;
  hasOpenInspections: boolean;
}

export interface InspectionMilestone {
  id: string;
  stageName: string;
  stageType: string;
  status: PermitInspectionStatus;
  scheduledDate?: string;
  inspectedDate?: string;
  inspectorNotes?: string;
  isRequired: boolean;
  sortOrder: number;
  isOverdue: boolean;
}

export type InspectionReadinessVerdict = 'READY' | 'NOT_READY' | 'NEEDS_REVIEW';

export type InspectionReadinessChecklistVerdict = 'MET' | 'NOT_MET' | 'UNABLE_TO_VERIFY';

export interface ChecklistItemResult {
  itemKey: string;
  itemLabel: string;
  verdict: InspectionReadinessChecklistVerdict;
  aiNote: string;
}

export interface InspectionReadinessCheckResult {
  id: string;
  milestoneId: string;
  propertyId: string;
  permitRecordId: string;
  stageType: string;
  checklistVersion: string;
  photoDocumentIds: string[];
  overallVerdict: InspectionReadinessVerdict;
  overallSummary?: string;
  checklistResults: ChecklistItemResult[];
  ranByUserId: string;
  createdAt: string;
}

export interface PermitDetail extends PermitSummary {
  applicantName?: string;
  contractorLicense?: string;
  workLocation?: string;
  applicationDate?: string;
  estimatedCostCents?: number;
  finalCostCents?: number;
  notes?: string;
  documentIds: string[];
  inspectionMilestones: InspectionMilestone[];
  renovationAdvisorSessionId?: string;
}

export type HoaDuesFrequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

export type HoaWorkType =
  | 'EXTERIOR_PAINT' | 'FENCE' | 'ROOFING' | 'ROOM_ADDITION' | 'DECK_PATIO'
  | 'LANDSCAPING' | 'SOLAR' | 'WINDOWS_DOORS' | 'DRIVEWAY' | 'SHED_OUTBUILDING'
  | 'POOL' | 'SATELLITE_ANTENNA' | 'OTHER';

export type HoaApprovalStatus =
  | 'NOT_SUBMITTED' | 'SUBMITTED' | 'UNDER_REVIEW' | 'CORRECTION_REQUESTED'
  | 'RESUBMITTED' | 'APPROVED' | 'APPROVED_WITH_CONDITIONS' | 'DENIED'
  | 'EXPIRED' | 'WITHDRAWN';

export type HoaDecisionStatus =
  | 'APPROVED' | 'APPROVED_WITH_CONDITIONS' | 'DENIED' | 'EXPIRED';

export type HoaDecisionTruthLayer =
  | 'DOCUMENTED' | 'SOURCE_OBSERVED' | 'ASSOCIATION_CONFIRMED';

export type HoaDecisionSourceType =
  | 'ASSOCIATION_DOCUMENT' | 'ASSOCIATION_PORTAL' | 'ASSOCIATION_EMAIL'
  | 'ASSOCIATION_REPRESENTATIVE' | 'OTHER';

export interface HoaAssociation {
  id: string;
  propertyId: string;
  name: string;
  managementCompany?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  duesAmountCents?: number;
  duesFrequency?: HoaDuesFrequency;
  nextDueDate?: string;
  documentIds: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HoaApprovalRecord {
  id: string;
  propertyId: string;
  hoaAssociationId: string;
  workType: HoaWorkType;
  description?: string;
  reportedStatus: HoaApprovalStatus;
  reportedAt?: string;
  reportedByUserId?: string;
  decisionStatus?: HoaDecisionStatus;
  decisionTruthLayer?: HoaDecisionTruthLayer;
  decisionSourceType?: HoaDecisionSourceType;
  decisionSourceReference?: string;
  decisionEvidenceDocumentId?: string;
  associationReferenceNumber?: string;
  decisionObservedAt?: string;
  decisionEffectiveDate?: string;
  decisionRecordedByUserId?: string;
  submittedDate?: string;
  approvalConditions?: string;
  denialReason?: string;
  expirationDate?: string;
  documentIds: string[];
  notes?: string;
  renovationAdvisorSessionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertHoaAssociationPayload {
  name: string;
  managementCompany?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  duesAmountCents?: number;
  duesFrequency?: HoaDuesFrequency;
  nextDueDate?: string;
  documentIds?: string[];
  notes?: string;
}

export interface CreateHoaApprovalRecordPayload {
  workType: HoaWorkType;
  description?: string;
  reportedStatus?: HoaApprovalStatus;
  submittedDate?: string;
  documentIds?: string[];
  notes?: string;
  approvalConditions?: string;
  denialReason?: string;
  expirationDate?: string;
  renovationAdvisorSessionId?: string;
  sourceActionId?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  sourceJourneyId?: string;
  decisionStatus?: HoaDecisionStatus | null;
  decisionTruthLayer?: HoaDecisionTruthLayer | null;
  decisionSourceType?: HoaDecisionSourceType | null;
  decisionSourceReference?: string | null;
  decisionEvidenceDocumentId?: string | null;
  associationReferenceNumber?: string | null;
  decisionObservedAt?: string | null;
  decisionEffectiveDate?: string | null;
}

export interface UpdateHoaApprovalRecordPayload {
  workType?: HoaWorkType;
  description?: string;
  reportedStatus?: HoaApprovalStatus;
  submittedDate?: string;
  approvalConditions?: string;
  denialReason?: string;
  expirationDate?: string;
  documentIds?: string[];
  notes?: string;
  decisionStatus?: HoaDecisionStatus | null;
  decisionTruthLayer?: HoaDecisionTruthLayer | null;
  decisionSourceType?: HoaDecisionSourceType | null;
  decisionSourceReference?: string | null;
  decisionEvidenceDocumentId?: string | null;
  associationReferenceNumber?: string | null;
  decisionObservedAt?: string | null;
  decisionEffectiveDate?: string | null;
}

export interface ReportHoaViolationPayload {
  workType?: HoaWorkType;
  summary: string;
  description?: string;
  cureDeadline?: string;
  fineAmountCents?: number;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
}

export type HoaViolationStatus =
  | 'DETECTED' | 'EVALUATED' | 'ACTIVE' | 'ACTIONED' | 'MITIGATED'
  | 'RESOLVED' | 'SUPPRESSED' | 'EXPIRED';

export interface HoaViolationSummary {
  id: string;
  title: string;
  summary?: string;
  status: HoaViolationStatus;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  description?: string;
  cureDeadline?: string;
  fineAmountCents?: number;
  openedAt: string;
  resolvedAt?: string;
  journeyId?: string | null;
}

export interface PermitFlagItem {
  id: string;
  workType: PermitWorkType;
  triggerType: string;
  flagReason: string;
  status: PermitUnpermittedFlagStatus;
  disclosureRisk: PermitDisclosureRisk;
  inventoryItemId?: string;
  resolvedByPermitId?: string;
  resolvedByPermitNumber?: string;
  resolutionNotes?: string;
  workOrigin: PermitHistoricalWorkOrigin;
  workStage: PermitHistoricalWorkStage;
  workStartedAt?: string;
  workCompletedAt?: string;
  recordSearchOutcome: PermitRecordSearchOutcome;
  recordsSearchedAt?: string;
  recordsCoverageDescription?: string;
  evidenceConfidence: PermitEvidenceConfidence;
  evidenceDocumentIds: string[];
  researchChannel: PermitResearchChannel;
  researchSourceReference?: string;
  authorityOutcome?: PermitUnpermittedFlagStatus;
  authorityObservedAt?: string;
  remediationCaseId?: string;
  remediationCase?: { id: string; name: string; lifecycle: string };
  dispositionAt?: string;
  historyEvents?: Array<{
    id: string;
    eventType: string;
    fromStatus?: PermitUnpermittedFlagStatus;
    toStatus?: PermitUnpermittedFlagStatus;
    evidenceDocumentIds: string[];
    payload?: Record<string, unknown>;
    occurredAt: string;
  }>;
  _count?: { historyEvents: number };
  createdAt: string;
  updatedAt: string;
}

export interface PermitHubSummary {
  totalPermits: number;
  activePermits: number;
  finaledPermits: number;
  openFlags: number;
  highRiskFlags: number;
  hasFetchData: boolean;
  jurisdictionHasOpenData: boolean;
  lastFetchAt?: string;
}

export interface PermitDisclosureExportItem {
  id: string;
  status: 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
  totalPermits?: number;
  openFlags?: number;
  fileUrl?: string;
  expiresAt?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface PermitListParams {
  category?: string | string[];
  status?: string | string[];
  source?: string | string[];
  workType?: string | string[];
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface FlagListParams {
  status?: string | string[];
  risk?: string | string[];
  limit?: number;
  cursor?: string;
}

export interface CreatePermitPayload {
  permitNumber?: string;
  category: PermitRecordCategory;
  workTypes: PermitWorkType[];
  description?: string;
  reportedStatus: PermitReportedWorkflowStatus;
  applicantName?: string;
  contractorName?: string;
  contractorLicense?: string;
  workLocation?: string;
  applicationDate?: string;
  issueDate?: string;
  expirationDate?: string;
  finaledDate?: string;
  estimatedCostCents?: number;
  finalCostCents?: number;
  documentIds?: string[];
  notes?: string;
  sourceActionId?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  sourceJourneyId?: string;
}

export interface UpdatePermitPayload {
  permitNumber?: string;
  category?: PermitRecordCategory;
  workTypes?: PermitWorkType[];
  description?: string;
  reportedStatus?: PermitReportedWorkflowStatus;
  contractorName?: string;
  notes?: string;
}

export interface AddMilestonePayload {
  stageName: string;
  stageType: string;
  status?: PermitInspectionStatus;
  scheduledDate?: string;
  isRequired?: boolean;
}

export interface UpdateMilestonePayload {
  status?: PermitInspectionStatus;
  scheduledDate?: string;
  inspectedDate?: string;
  inspectorNotes?: string;
  stageName?: string;
}

export interface UpdateFlagPayload {
  status?: PermitUnpermittedFlagStatus;
  disclosureRisk?: PermitDisclosureRisk;
  resolvedByPermitId?: string;
  resolutionNotes?: string;
  workOrigin?: PermitHistoricalWorkOrigin;
  workStage?: PermitHistoricalWorkStage;
  workStartedAt?: string;
  workCompletedAt?: string;
  recordSearchOutcome?: PermitRecordSearchOutcome;
  recordsCoverageDescription?: string;
  evidenceDocumentIds?: string[];
  researchChannel?: PermitResearchChannel;
  researchSourceReference?: string;
  authorityOutcome?: 'CONFIRMED_PERMITTED' | 'CONFIRMED_UNPERMITTED';
  authorityObservedAt?: string;
}

export interface CreateFlagPayload {
  workType: PermitWorkType;
  flagReason?: string;
  disclosureRisk: PermitDisclosureRisk;
  inventoryItemId?: string;
  resolutionNotes?: string;
  workOrigin: PermitHistoricalWorkOrigin;
  workStage: PermitHistoricalWorkStage;
  workStartedAt?: string;
  workCompletedAt?: string;
  recordSearchOutcome?: PermitRecordSearchOutcome;
  recordsCoverageDescription?: string;
  evidenceDocumentIds?: string[];
  researchChannel?: PermitResearchChannel;
  researchSourceReference?: string;
}

// ─── Inspection Report Intelligence ─────────────────────────────────────────

export type InspectionReportType =
  | 'GENERAL' | 'ROOF' | 'HVAC' | 'SEWER' | 'ELECTRICAL' | 'FOUNDATION'
  | 'PRE_PURCHASE' | 'PRE_LISTING' | 'ANNUAL' | 'OTHER';

export type InspectionReportStatus = 'PROCESSING' | 'REVIEW_PENDING' | 'CONFIRMED' | 'ARCHIVED';

export type InspectionHomeSystem =
  | 'ROOF' | 'EXTERIOR' | 'FOUNDATION' | 'BASEMENT_CRAWLSPACE' | 'STRUCTURAL'
  | 'ELECTRICAL' | 'PLUMBING' | 'HVAC' | 'INTERIOR' | 'ATTIC_INSULATION'
  | 'APPLIANCES' | 'GARAGE' | 'SITE_GRADING';

export type InspectionFindingSeverity = 'SAFETY' | 'MAJOR' | 'MINOR' | 'MONITOR' | 'INFORMATIONAL';
export type InspectionConditionRating = 'GOOD' | 'FAIR' | 'POOR' | 'SAFETY_CONCERN';
export type InspectionFindingStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED' | 'ACCEPTED_AS_IS';
export type InspectionWorkDisposition = 'PENDING_REVIEW' | 'ACCEPTED' | 'MONITOR' | 'DUPLICATE' | 'ALREADY_RESOLVED' | 'NOT_APPLICABLE' | 'CORRECTION_REQUESTED';
export type InspectionExtractionConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type InspectionResolutionMethod =
  | 'CONTRACTOR_WORK' | 'DIY' | 'SELLER_REPAIR' | 'CREDITED_AT_CLOSING' | 'DISMISSED';

export interface InspectionReportSummary {
  id: string;
  reportType: InspectionReportType;
  inspectionDate: string;
  inspectorName?: string;
  inspectorCompany?: string;
  status: InspectionReportStatus;
  totalFindings: number;
  openFindings: number;
  safetyFindings: number;
  majorFindings: number;
  confirmedAt?: string;
  processedAt?: string;
  createdAt: string;
}

export interface InspectionFinding {
  id: string;
  reportId: string;
  propertyId: string;
  homeSystem: InspectionHomeSystem;
  subsystem?: string;
  location?: string;
  conditionRating: InspectionConditionRating;
  severity: InspectionFindingSeverity;
  inspectorDescription: string;
  inspectorRecommendation: string;
  aiInterpretation: string;
  estimatedCostCentsLow?: number;
  estimatedCostCentsHigh?: number;
  extractionConfidence: InspectionExtractionConfidence;
  status: InspectionFindingStatus;
  workDisposition: InspectionWorkDisposition;
  workDispositionNotes?: string;
  workDispositionAt?: string;
  resolvedAt?: string;
  resolutionMethod?: InspectionResolutionMethod;
  resolutionNotes?: string;
  resolutionCostCents?: number;
  warrantyExpiresAt?: string;
  photoKeys: string[];
  createdAt: string;
  updatedAt: string;
  // populated on open-items fetch
  report?: Pick<InspectionReportSummary, 'reportType' | 'inspectionDate' | 'inspectorName'>;
}

export interface InspectionHubSummary {
  reports: InspectionReportSummary[];
  openCount: number;
  safetyCount: number;
  majorCount: number;
}

export interface InspectionWriteBackPreview {
  digitalTwinUpdates: number;
  permitFlagsToCreate: number;
  coverageGapsToFlag: number;
  findingCount: number;
}

export interface InspectionNegotiationPackage {
  report: Pick<InspectionReportSummary, 'id' | 'inspectionDate' | 'inspectorName' | 'inspectorCompany'>;
  negotiateCredit: InspectionNegotiationItem[];
  requestRepair: InspectionNegotiationItem[];
  acceptAsIs: InspectionNegotiationItem[];
  requestedCreditTotalCents: number;
  requestedCreditTotalDollars: string;
}

export interface InspectionNegotiationItem extends Pick<InspectionFinding,
  'id' | 'homeSystem' | 'subsystem' | 'severity' | 'inspectorDescription' | 'aiInterpretation' | 'estimatedCostCentsLow' | 'estimatedCostCentsHigh'
> {
  findingId: string;
  decision: 'negotiate_credit' | 'request_repair' | 'accept_as_is';
}

export interface InspectionFixDisclosureItem extends Pick<InspectionFinding,
  'homeSystem' | 'subsystem' | 'severity' | 'inspectorDescription' | 'aiInterpretation' | 'estimatedCostCentsLow' | 'estimatedCostCentsHigh' | 'status'
> {
  findingId: string;
  fixDisclosureDecision?: {
    fixDisclosure: 'FIX' | 'DISCLOSE_PRICE_ADJUST' | 'DISCLOSE_CREDIT';
    estimatedFixCostCents?: number;
    sellerNote?: string;
  } | null;
}

// ============================================================================
// LIVE PROJECT EXECUTION TRACKER
// ============================================================================

export type ProjectStatus = 'DRAFT' | 'PLANNING' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';

export type ProjectType =
  | 'ROOF_REPLACEMENT' | 'HVAC_REPLACEMENT' | 'HVAC_REPAIR' | 'KITCHEN_REMODEL'
  | 'BATHROOM_REMODEL' | 'ELECTRICAL_PANEL' | 'PLUMBING_REPIPING' | 'WATER_HEATER'
  | 'FOUNDATION_WORK' | 'WINDOW_REPLACEMENT' | 'FLOORING' | 'PAINTING_INTERIOR'
  | 'PAINTING_EXTERIOR' | 'DECK_PATIO' | 'ADDITION' | 'SEWER_LINE'
  | 'SOLAR_INSTALLATION' | 'LANDSCAPING_MAJOR' | 'GENERAL_REPAIR' | 'CUSTOM';

export type ProjectMilestoneStatus = 'UPCOMING' | 'IN_PROGRESS' | 'COMPLETE' | 'DELAYED' | 'DISPUTED' | 'BLOCKED';
export type ProjectMilestoneType = 'STANDARD' | 'PERMIT_INSPECTION' | 'PAYMENT_TRIGGER' | 'CUSTOM';
export type ProjectExecutionSourceType = 'MANUAL' | 'PERMIT_CORRECTION' | 'PERMIT_INSPECTION' | 'HOA_CONDITION';
export type ProjectExecutionSyncStatus = 'NOT_APPLICABLE' | 'PENDING' | 'HEALTHY' | 'ERROR';
export type ProjectPaymentStatus = 'PENDING' | 'DUE' | 'PAID' | 'OVERDUE' | 'DISPUTED' | 'ON_HOLD';
export type ProjectPaymentTriggerType = 'MILESTONE' | 'DATE' | 'MANUAL';
export type ProjectChangeOrderStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'VOIDED';
export type ProjectChangeOrderCategory =
  | 'HOMEOWNER_REQUEST' | 'UNFORESEEN_CONDITION' | 'MATERIAL_SUBSTITUTION'
  | 'DESIGN_CHANGE' | 'ERROR_CORRECTION' | 'OTHER';
export type ProjectIssueSeverity = 'MINOR' | 'MAJOR' | 'BLOCKING';
export type ProjectIssueStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'ESCALATED';
export type ProjectProgressLogEntryType = 'MILESTONE_PHOTO' | 'DAILY_NOTE' | 'ISSUE_PHOTO' | 'MATERIAL_DELIVERY';

export interface ProjectMilestoneSummary {
  id: string;
  name: string;
  milestoneType: ProjectMilestoneType;
  status: ProjectMilestoneStatus;
  scheduledDate?: string | null;
  actualCompletedDate?: string | null;
  requiresPhotoEvidence: boolean;
  position: number;
  daysDelayed?: number | null;
  linkedPermitMilestoneId?: string | null;
  executionSourceType: ProjectExecutionSourceType;
  executionSourceId?: string | null;
  sourceStatus?: string | null;
  sourceUpdatedAt?: string | null;
  lastReconciledAt?: string | null;
  reconciliationStatus: ProjectExecutionSyncStatus;
  reconciliationAttempts: number;
  reconciliationError?: string | null;
}

export interface ProjectMilestone extends ProjectMilestoneSummary {
  projectId: string;
  propertyId: string;
  description?: string | null;
  completionNotes?: string | null;
  completedByUserId?: string | null;
  dependsOnMilestoneId?: string | null;
  daysDelayed?: number | null;
  createdAt: string;
  updatedAt: string;
  triggeredPayments?: Array<{ id: string; description: string; amountCents: number; status: ProjectPaymentStatus }>;
}

export interface ProjectPayment {
  id: string;
  projectId: string;
  description: string;
  amountCents: number;
  triggerType: ProjectPaymentTriggerType;
  triggerMilestoneId?: string | null;
  dueDate?: string | null;
  status: ProjectPaymentStatus;
  paidDate?: string | null;
  paymentMethod?: string | null;
  receiptDocumentKey?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  triggerMilestone?: { id: string; name: string; status: ProjectMilestoneStatus } | null;
}

export interface ProjectChangeOrder {
  id: string;
  projectId: string;
  changeNumber: number;
  title: string;
  description: string;
  category: ProjectChangeOrderCategory;
  costDeltaCents: number;
  status: ProjectChangeOrderStatus;
  proposedByName: string;
  supportingDocumentKey?: string | null;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  notes?: string | null;
  complianceStatus: 'NOT_EVALUATED' | 'NO_RECHECK_REQUIRED' | 'RECHECK_REQUIRED' | 'RECHECK_COMPLETE';
  complianceImpact?: {
    workItemsChanged: boolean;
    spacesChanged: boolean;
    systemsChanged: boolean;
    dimensionsChanged: boolean;
    structuralEffectsChanged: boolean;
    exteriorEffectsChanged: boolean;
    regulatedMaterialsChanged: boolean;
    scheduleOnly: boolean;
    explanation: string;
  } | null;
  complianceReviewNotes?: string | null;
  complianceEvidenceDocumentIds: string[];
  amendedPermitStatus: 'NOT_APPLICABLE' | 'REQUIRED' | 'REQUESTED' | 'CONFIRMED';
  hoaReapprovalStatus: 'NOT_APPLICABLE' | 'REQUIRED' | 'REQUESTED' | 'CONFIRMED';
  complianceReviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectProgressLog {
  id: string;
  projectId: string;
  milestoneId?: string | null;
  entryDate: string;
  entryType: ProjectProgressLogEntryType;
  notes?: string | null;
  photoKeys: string[];
  roomId?: string | null;
  materialType?: string | null;
  materialBrand?: string | null;
  materialModel?: string | null;
  materialColor?: string | null;
  materialSupplier?: string | null;
  materialQuantity?: string | null;
  loggedByUserId: string;
  createdAt: string;
  milestone?: { id: string; name: string } | null;
  room?: { id: string; name: string } | null;
}

export interface ProjectIssue {
  id: string;
  projectId: string;
  title: string;
  description: string;
  severity: ProjectIssueSeverity;
  category: string;
  status: ProjectIssueStatus;
  blocksPayment: boolean;
  resolutionNotes?: string | null;
  resolvedAt?: string | null;
  attachmentKeys: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: string;
  propertyId: string;
  contractorId?: string | null;
  contractorName?: string | null;
  contractorLicense?: string | null;
  contractorPhone?: string | null;
  contractorEmail?: string | null;
  projectType: ProjectType;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  sourceType: 'PRICE_FINALIZATION' | 'BOOKING' | 'GUIDANCE' | 'MANUAL';
  guidanceJourneyId?: string | null;
  inventoryItemId?: string | null;
  priceFinalizationId?: string | null;
  bookingId?: string | null;
  executionPath?: 'REPAIR' | 'REPLACEMENT' | null;
  fulfillmentMode: 'PROVIDER' | 'DIY';
  fundingMode: 'SELF_PAID' | 'COVERED' | 'MIXED';
  complexity: 'MINOR' | 'MAJOR';
  recommendationVersion?: string | null;
  renovationCaseId?: string | null;
  renovationScopeVersionId?: string | null;
  renovationScopeSnapshot?: {
    version: number;
    summary?: string | null;
    workItems: unknown[];
    spacesAffected: string[];
    systemsAffected: string[];
    intendedUse?: string | null;
    approvalStatus: string;
    contractCostCents?: number | null;
  } | null;
  inheritedConditions?: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    isBlocking: boolean;
    dueAt?: string | null;
    evidenceDocumentId?: string | null;
  }> | null;
  inheritedDependencies?: Array<{
    readinessItemId: string;
    title: string;
    isBlocking: boolean;
    overrideAcknowledgedAt?: string | null;
    dueAt?: string | null;
  }> | null;
  evidenceRequirements?: Array<{
    readinessItemId: string;
    title: string;
    evidenceRequired: string;
    evidenceDocumentId?: string | null;
    sourceType: string;
    sourceId: string;
  }> | null;
  contractDocumentIds?: string[];
  permitApplicability: ProjectRequirementApplicability;
  permitApplicabilityBasis?: string | null;
  hoaApplicability: ProjectRequirementApplicability;
  hoaApplicabilityBasis?: string | null;
  providerRankingRationale?: string | null;
  commercialDisclosure?: Record<string, unknown> | null;
  credentialCheck?: Record<string, unknown> | null;
  contractAmountCents: number;
  approvedChangeOrderDeltaCents: number;
  currentContractAmountCents: number;
  paidToDateCents: number;
  startDate: string;
  expectedEndDate?: string | null;
  actualEndDate?: string | null;
  homeSystemsAffected: string[];
  serviceCategory?: string | null;
  contractDocumentKey?: string | null;
  completionRecordKey?: string | null;
  warrantyDocumentKey?: string | null;
  warrantyPeriodMonths?: number | null;
  warrantyExpiresAt?: string | null;
  outcomeStatus?: 'VERIFIED_SUCCESS' | 'INCOMPLETE' | 'FAILED' | 'DISPUTED' | 'DELAYED' | 'UNSAFE' | null;
  commissioningResult?: 'PASSED' | 'FAILED' | 'NOT_REQUIRED' | 'UNRESOLVED' | null;
  functionalVerificationResult?: 'PASSED' | 'FAILED' | 'NOT_REQUIRED' | 'UNRESOLVED' | null;
  safetyCheckResult?: 'PASSED' | 'FAILED' | 'NOT_REQUIRED' | 'UNRESOLVED' | null;
  inspectionResult?: 'PASSED' | 'FAILED' | 'NOT_REQUIRED' | 'UNRESOLVED' | null;
  unresolvedExceptions?: unknown[] | null;
  completionEvidence?: Record<string, unknown> | null;
  actualCostCents?: number | null;
  providerOutcome?: string | null;
  recommendationOverridden?: boolean;
  recommendationComprehensionConfirmed?: boolean;
  recommendationComprehensionConfirmedAt?: string | null;
  verifiedAt?: string | null;
  followUpDueAt?: string | null;
  followUpHealth?: 'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED' | null;
  followUpCompletedAt?: string | null;
  contractorRatingQuality?: number | null;
  contractorRatingTimeline?: number | null;
  contractorRatingComms?: number | null;
  contractorRatingBudget?: number | null;
  contractorReviewText?: string | null;
  writeBackAppliedAt?: string | null;
  closeoutPackage?: ProjectCloseoutPackage | null;
  closeoutPackageGeneratedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  // Included in detail view
  milestones?: ProjectMilestone[];
  payments?: ProjectPayment[];
  changeOrders?: ProjectChangeOrder[];
  issues?: ProjectIssue[];
  _count?: { milestones: number; issues: number; progressLogs: number };
}

export interface ProjectCompletionCheck {
  key: string;
  label: string;
  status: 'PASSED' | 'FAILED' | 'NOT_EVALUATED' | 'NOT_APPLICABLE' | 'WAIVED';
  passed: boolean;
  blockers: string[];
}

export interface ProjectCompletionChecklist {
  renovationCaseId?: string | null;
  checks: ProjectCompletionCheck[];
  allPassed: boolean;
  authorityCloseout?: {
    permit: { applicability: ProjectRequirementApplicability; status: string; recordId?: string | null };
    hoa: { applicability: ProjectRequirementApplicability; status: string; recordId?: string | null };
  };
}

export type ProjectCloseoutCategory =
  | 'PUNCH_LIST'
  | 'CORRECTIONS'
  | 'LIEN_WAIVER'
  | 'PAYMENT'
  | 'WARRANTY'
  | 'COMMISSIONING'
  | 'SAFETY'
  | 'INSPECTION';

export interface ProjectCloseoutDeclaration {
  category: ProjectCloseoutCategory;
  disposition: 'SATISFIED' | 'NOT_APPLICABLE' | 'OPEN_EXCEPTION';
  evidenceDocumentIds: string[];
  notes: string;
  responsibleParty?: 'HOUSEHOLD' | 'CONTRACTOR' | 'SHARED' | 'AUTHORITY';
  dueAt?: string;
}

export interface ProjectCloseoutPackage {
  schemaVersion: string;
  generatedAt: string;
  propertyId: string;
  project: {
    id: string;
    name: string;
    outcomeStatus: string;
    actualEndDate: string;
    actualCostCents?: number | null;
  };
  renovationCase?: { id: string; name: string; lifecycle: string; outcomeStatus: string } | null;
  authorityCloseout: ProjectCompletionChecklist['authorityCloseout'];
  checklist: Array<ProjectCompletionCheck & {
    applicability?: string;
    evidenceDocumentIds?: string[];
  }>;
  unresolvedItems: Array<Record<string, unknown>>;
  evidence: {
    documentIds: string[];
    materialSpecIds: string[];
    commissioningResult: string;
    functionalVerificationResult: string;
    safetyCheckResult: string;
    inspectionResult: string;
  };
  reconciledRecords: Record<string, unknown>;
  refreshes: Array<{ targetSystem: string; status: string }>;
  verifiedInstalledFactsApplied: boolean;
}

export type ProjectRequirementApplicability =
  | 'UNKNOWN'
  | 'REQUIRED'
  | 'NOT_REQUIRED_CONFIRMED'
  | 'NOT_APPLICABLE'
  | 'WAIVED_WITH_ACKNOWLEDGMENT';

// ============================================================================
// NEIGHBOURHOOD TRUST NETWORK
// ============================================================================

export interface NeighbourhoodStats {
  totalEndorsements: number;
  activeProviders: number;
  recentJobs: number;
}

export interface NeighbourhoodZipInfo {
  zipCode: string;
  city: string;
  state: string;
  stats: NeighbourhoodStats;
}

export interface NeighbourhoodTrustSummary {
  zipCode: string;
  totalJobs: number;
  verifiedJobs: number;
  avgRating: number;
  avgQualityRating: number | null;
  avgCommunicationRating: number | null;
  avgValueRating: number | null;
  lastJobAt: string | null;
}

export interface NeighbourhoodProvider {
  trustProfile: NeighbourhoodTrustSummary;
  provider: {
    id: string;
    businessName: string;
    description: string | null;
    averageRating: number;
    totalCompletedJobs: number;
    insuranceVerified: boolean;
    licenseVerified: boolean;
    serviceCategories: string[];
    yearsInBusiness: number | null;
  };
}

export interface NeighbourhoodFeedEntry {
  id: string;
  zipCode: string;
  entryType: 'JOB_COMPLETED' | 'ENDORSEMENT_ADDED' | 'PROVIDER_FIRST_JOB';
  providerBusinessName: string;
  serviceCategory: string;
  starRating: number | null;
  highlightTags: string[];
  jobCompletedAt: string | null;
  createdAt: string;
}

export interface NeighbourhoodEndorsement {
  id: string;
  bookingId: string;
  wouldHireAgain: boolean;
  highlightTags: string[];
  anonymousToNeighbors: boolean;
  createdAt: string;
}

export interface BuyerReportData {
  reportMeta: HomeScoreReportMeta;
  executiveSummary: HomeScoreExecutiveSummary;
  radar: HomeScoreRadar;
  systemHealth: HomeScoreSystemHealthRow[];
  timeline: { events: HomeScoreTimelineEvent[]; emptyState: { title: string; detail: string } | null };
  trustAndVerification: HomeScoreTrustAndVerification;
  methodology: HomeScoreMethodology;
  generatedAt: string;
  confidence: string;
}

// ============================================================================
// PROVIDER TRUST & COMPLIANCE VERIFICATION
// ============================================================================

export type ProviderCredentialType =
  | 'TRADE_LICENSE'
  | 'LIABILITY_INSURANCE'
  | 'WORKERS_COMP_INSURANCE'
  | 'BONDING'
  | 'CERTIFICATION'
  | 'BACKGROUND_CHECK';

export type ProviderCredentialStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';

export type ProviderComplianceAlertType =
  | 'EXPIRING_SOON'
  | 'EXPIRED_NO_BOOKING_IMPACT'
  | 'REJECTED'
  | 'MISSING_REQUIRED_CREDENTIAL';

export type ProviderComplianceAlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type ProviderComplianceAlertStatus = 'NEW' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface ProviderCredential {
  id: string;
  providerProfileId: string;
  type: ProviderCredentialType;
  serviceCategories: ServiceCategory[];
  status: ProviderCredentialStatus;
  issuingAuthority: string;
  credentialNumber?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  renewalOfCredentialId?: string | null;
  createdAt: string;
  updatedAt: string;
  providerProfile?: {
    id: string;
    businessName: string;
    userId: string;
  };
}

export interface ProviderCategoryEligibility {
  id: string;
  providerProfileId: string;
  serviceCategory: ServiceCategory;
  isEligible: boolean;
  missingCredentialTypes: ProviderCredentialType[];
  computedAt: string;
}

export interface ProviderComplianceAlert {
  id: string;
  providerProfileId: string;
  credentialId?: string | null;
  alertType: ProviderComplianceAlertType;
  severity: ProviderComplianceAlertSeverity;
  status: ProviderComplianceAlertStatus;
  title: string;
  summary?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitProviderCredentialPayload {
  type: ProviderCredentialType;
  serviceCategories: ServiceCategory[];
  issuingAuthority: string;
  credentialNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  documentId?: string;
}

export type RenewProviderCredentialPayload = Partial<SubmitProviderCredentialPayload>;

export interface ProviderVerificationSummary {
  verifiedCategories: ServiceCategory[];
  unverifiedCategories: ServiceCategory[];
  credentialTypesPresent: ProviderCredentialType[];
}

// ─────────────────────────────────────────────────────────────────────────
// Environment Report
// ─────────────────────────────────────────────────────────────────────────

export type SectionResult<T> =
  | { status: 'ok'; data: T; fetchedAt: string }
  | { status: 'unavailable'; reason?: string };

export interface WeatherCurrentConditions {
  temperatureF: number;
  apparentTemperatureF: number;
  humidityPercent: number;
  windSpeedMph: number;
  precipitationIn: number;
  weatherCode: number;
  isDay: boolean;
  observedAt: string;
}
export interface WeatherHourlyPoint {
  time: string;
  temperatureF: number;
  precipitationProbabilityPercent: number;
  weatherCode: number;
}
export interface WeatherDailyForecastPoint {
  date: string;
  tempMaxF: number;
  tempMinF: number;
  precipitationSumIn: number;
  weatherCode: number;
}
export interface WeatherHistoryPoint {
  date: string;
  tempMaxF: number;
  tempMinF: number;
  precipitationSumIn: number;
}
export interface WeatherReportData {
  current: WeatherCurrentConditions;
  hourly: WeatherHourlyPoint[];
  tenDayForecast: WeatherDailyForecastPoint[];
  thirtyDayHistory: WeatherHistoryPoint[];
}

export interface AirQualityCurrent {
  aqi: number;
  pm2_5: number;
  pm10: number;
  observedAt: string;
}
export interface AirQualityHistoryPoint {
  date: string;
  avgAqi: number;
  avgPm2_5: number;
}
export interface AirQualityData {
  current: AirQualityCurrent;
  history: AirQualityHistoryPoint[];
}

export type DroughtCategory = 'None' | 'D0' | 'D1' | 'D2' | 'D3' | 'D4';
export interface DroughtWeekPoint {
  date: string;
  dominantCategory: DroughtCategory;
  percentArea: Record<DroughtCategory, number>;
}
export interface DroughtData {
  current: DroughtWeekPoint | null;
  history: DroughtWeekPoint[];
}

export interface FloodElevationData {
  femaFloodZone: string | null;
  femaZoneSubtype: string | null;
  elevationFeet: number | null;
}

export interface RadonData {
  zone: 1 | 2 | 3;
  zoneDescription: string;
  countyName: string | null;
  stateName: string | null;
}

export interface HardinessZoneData {
  zone: string;
  temperatureRangeF: string;
}

export interface ClimateNormalsMonthlyPoint {
  month: number;
  avgTempF: number | null;
  avgHighF: number | null;
  avgLowF: number | null;
}
export interface ClimateNormalsData {
  stationId: string;
  stationName: string;
  monthly: ClimateNormalsMonthlyPoint[];
  annualHeatingDegreeDays: number | null;
  annualCoolingDegreeDays: number | null;
  firstFrostDate: null;
  lastFrostDate: null;
}
export interface ClimateSectionData {
  normals: SectionResult<ClimateNormalsData>;
  hardinessZone: SectionResult<HardinessZoneData>;
}

export interface HazardFacility {
  registryId: string;
  name: string;
  address: string;
  programs: string[];
  complianceStatus: string | null;
  significantNoncompliance: boolean;
  inspectionCount: number;
  lastInspectionDate: string | null;
  penaltyCount: number;
  latitude: number | null;
  longitude: number | null;
  distanceMiles: number | null;
}
export interface EnvironmentalHazardsData {
  facilities: HazardFacility[];
  totalFacilitiesInRadius: number;
  totalPenaltiesInRadius: string | null;
  searchRadiusMiles: number;
}

export interface LongTermHazardContextItem {
  propertyMatchId: string;
  hazardType: string;
  hazardLabel: string;
  category: 'LONG_TERM_CONTEXT';
  title: string;
  factualSummary: string | null;
  lifecycleStatus: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  geography: {
    sourceType: string;
    sourceKey: string | null;
    matchedGeography: string;
    precision: string;
    distanceMiles: number | null;
    matchMethod: string;
  };
  source: {
    key: string;
    provider: string;
    url: string | null;
    publishedAt: string | null;
    lastVerifiedAt: string;
    revision: number;
  };
  interpretation: {
    relevance: string;
    confidence: number;
    missingFacts: string[];
    boundedExplanation: string;
  };
}

export interface EnvironmentLongTermHazardContext {
  coverage: {
    state: 'CURRENT' | 'DEGRADED' | 'STALE' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
    comprehensive: false;
    checkedThrough: string | null;
    sources: Array<{
      source: { key: string; family: string; provider: string; termsVersion: string | null };
      geography: { type: string; key: string | null } | null;
      state: string;
      checkedThrough: string | null;
      limitations: string[];
      reasonCodes: string[];
    }>;
    limitations: string[];
  };
  hazards: LongTermHazardContextItem[];
  emptyState: string | null;
  pastHazardHref: string;
}

export interface EnvironmentReportDTO {
  propertyId: string;
  property: {
    name: string | null;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  location: {
    latitude: number | null;
    longitude: number | null;
    countyFips: string | null;
    zipCode: string | null;
  };
  generatedAt: string;
  applicability: {
    feature: PropertyContextFeatureDecision;
    hvacFilterMaintenance: PropertyContextFeatureDecision;
  };
  insights: EnvironmentInsight[];
  questions: EnvironmentQuestion[];
  plantAdvisorModules: PlantAdvisorWeatherModule[];
  longTermHazardContext: EnvironmentLongTermHazardContext;
  sections: {
    weather: SectionResult<WeatherReportData>;
    airQuality: SectionResult<AirQualityData>;
    drought: SectionResult<DroughtData>;
    floodElevation: SectionResult<FloodElevationData>;
    radon: SectionResult<RadonData>;
    hazards: SectionResult<EnvironmentalHazardsData>;
    climate: SectionResult<ClimateSectionData>;
  };
}

export interface EnvironmentInsightAction {
  label: string;
  href: string;
  kind: 'primary' | 'secondary';
}

export interface PlantAdvisorWeatherModule {
  id: string;
  trigger: 'heat' | 'freeze' | 'low_humidity' | 'storm' | 'air_quality';
  relatedInsightId: string | null;
  title: string;
  summary: string;
  contextLevel: 'added_plants' | 'saved_recommendations' | 'room_profiles' | 'setup';
  plantNames: string[];
  roomNames: string[];
  action: { label: string; href: string };
}

export interface EnvironmentInsight {
  id: string;
  category: 'rain' | 'snow' | 'freeze' | 'heat' | 'storm' | 'air_quality' | 'drought';
  severity: 'info' | 'watch' | 'action';
  title: string;
  summary: string;
  homeImplication: string;
  timeframe: string;
  effectiveFrom: string;
  effectiveTo: string;
  affectedSystems: string[];
  recommendedActions: string[];
  actions: EnvironmentInsightAction[];
  source: string;
  relatedIncident?: {
    id: string;
    title: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL' | null;
    status: string;
    typeKey: string;
    isOfficialAlert: boolean;
  };
}

export type WeatherPreparationItemStatus = 'CREATED' | 'COMPLETED' | 'CANCELED';

export interface WeatherPreparationPlan {
  id: string;
  propertyId: string;
  insightId: string;
  title: string;
  summary: string;
  timeframe: string;
  effectiveFrom: string;
  effectiveTo: string;
  source: string;
  status: string;
  progress: { completed: number; skipped: number; resolved: number; total: number };
  items: Array<{
    id: string;
    label: string;
    status: WeatherPreparationItemStatus;
    sortOrder: number;
  }>;
}

export type EnvironmentQuestionField =
  | 'hasDrainageIssues'
  | 'hasSumpPump'
  | 'hasSumpPumpBackup'
  | 'coolingType'
  | 'hvacInstallYear'
  | 'roofType'
  | 'roofReplacementYear'
  | 'heatingType'
  | 'hasSecondaryHeat'
  | 'hasIrrigation'
  | 'foundationType'
  | 'hvacFilterLastCompletedDate';

export interface EnvironmentQuestion {
  id: string;
  insightId: string;
  field: EnvironmentQuestionField;
  prompt: string;
  reason: string;
  inputType: 'choice' | 'year' | 'date' | 'text';
  options?: Array<{ label: string; value: string | number | boolean | null }>;
  placeholder?: string;
}
