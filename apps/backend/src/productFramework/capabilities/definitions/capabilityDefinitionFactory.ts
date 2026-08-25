import {
  defineToolCapability,
  type CapabilityOutcomeCategory,
  type CapabilityRecommendationMode,
  type ToolCapabilityDefinition,
} from '../capability.contract';

type CapabilitySeed = {
  id: string;
  version?: number;
  label: string;
  description: string;
  routeTemplate: string;
  routeAliases?: string[];
  navTarget?: string;
  outcomeCategory: CapabilityOutcomeCategory;
  rolloutKey: string;
  releaseStage: 'ACTIVE' | 'BETA';
  safetyTier: ToolCapabilityDefinition['governance']['safetyTier'];
  completionKind: ToolCapabilityDefinition['lifecycle']['completionKind'];
  mode: CapabilityRecommendationMode;
  iconName?: ToolCapabilityDefinition['presentation']['iconName'];
  intentAliases?: ToolCapabilityDefinition['presentation']['intentAliases'];
  homeownerOutcome?: string;
  expectedTimeToValue?: string;
  livingHomeRecordReads?: ToolCapabilityDefinition['productFramework']['livingHomeRecordReads'];
  livingHomeRecordWrites?: ToolCapabilityDefinition['productFramework']['livingHomeRecordWrites'];
  acceptedContext?: ToolCapabilityDefinition['destination']['acceptedContext'];
  triggerFamilies?: ToolCapabilityDefinition['recommendation']['triggerFamilies'];
  reasonTemplates?: ToolCapabilityDefinition['recommendation']['reasonTemplates'];
  readinessRequirements?: ToolCapabilityDefinition['recommendation']['readinessRequirements'];
  expectedOutput?: string;
  completionSignal?: string;
  outputEntityTypes?: ToolCapabilityDefinition['lifecycle']['outputEntityTypes'];
};

type ContextualDefinition = {
  sourceKinds: ToolCapabilityDefinition['recommendation']['sourceKinds'];
  triggerFamily: string;
  triggerFamilies?: string[];
  reason: string;
  reasonTemplates?: Record<string, string>;
  safePartialValue?: boolean;
  requiresExplicitTrigger?: boolean;
  recommendationDefinitionCodes?: string[];
  sourceCtaExclusionCapabilityIds?: string[];
  acceptedContext?: ToolCapabilityDefinition['destination']['acceptedContext'];
  readinessRequirements?: ToolCapabilityDefinition['recommendation']['readinessRequirements'];
};

const JOB_BY_OUTCOME: Record<
  CapabilityOutcomeCategory,
  ToolCapabilityDefinition['productFramework']['primaryJob']
> = {
  DECIDE_COMPARE: 'DECIDE',
  PROTECT_MONITOR: 'STAY_AHEAD',
  MAINTAIN_PREVENT: 'STAY_AHEAD',
  PLAN_BUDGET: 'MAJOR_MOMENT',
  SAVE_OPTIMIZE: 'DECIDE',
  UNDERSTAND_HOME: 'STAY_AHEAD',
};

const DESTINATION_BY_OUTCOME: Record<
  CapabilityOutcomeCategory,
  ToolCapabilityDefinition['productFramework']['primaryDestination']
> = {
  DECIDE_COMPARE: 'HOME',
  PROTECT_MONITOR: 'HOME',
  MAINTAIN_PREVENT: 'HOME',
  PLAN_BUDGET: 'PLAN_PROJECTS',
  SAVE_OPTIMIZE: 'HOME',
  UNDERSTAND_HOME: 'HOME_RECORD',
};

const ICON_BY_OUTCOME: Record<
  CapabilityOutcomeCategory,
  ToolCapabilityDefinition['presentation']['iconName']
> = {
  DECIDE_COMPARE: 'lightbulb',
  PROTECT_MONITOR: 'shield-alert',
  MAINTAIN_PREVENT: 'list-checks',
  PLAN_BUDGET: 'calendar',
  SAVE_OPTIMIZE: 'dollar-sign',
  UNDERSTAND_HOME: 'file-text',
};

const OUTPUT_BY_OUTCOME: Record<CapabilityOutcomeCategory, string> = {
  DECIDE_COMPARE: 'A structured comparison with a recorded decision.',
  PROTECT_MONITOR: 'A property-specific monitoring or risk view.',
  MAINTAIN_PREVENT: 'A practical maintenance or prevention action.',
  PLAN_BUDGET: 'An actionable plan, estimate, or timeline.',
  SAVE_OPTIMIZE: 'A quantified ownership or savings result.',
  UNDERSTAND_HOME: 'A durable home record or explanatory view.',
};

const DATA_SENSITIVITY_BY_CAPABILITY_ID: Record<
  string,
  ToolCapabilityDefinition['governance']['privacy']['dataSensitivity']
> = {
  'buyer-closing': 'SENSITIVE',
  claims: 'SENSITIVE',
  'coverage-intelligence': 'SENSITIVE',
  'coverage-options': 'SENSITIVE',
  documents: 'SENSITIVE',
  diy: 'SENSITIVE',
  financing: 'HIGHLY_SENSITIVE',
  'hoa-compliance': 'SENSITIVE',
  'home-digital-twin': 'SENSITIVE',
  'home-digital-will': 'HIGHLY_SENSITIVE',
  'home-briefing': 'SENSITIVE',
  'home-risk-replay': 'SENSITIVE',
  'inspection-hub': 'SENSITIVE',
  'insurance-trend': 'SENSITIVE',
  'mortgage-refinance-radar': 'HIGHLY_SENSITIVE',
  'ownership-costs': 'HIGHLY_SENSITIVE',
  permits: 'SENSITIVE',
  'project-tracker': 'HIGHLY_SENSITIVE',
  'property-brief': 'HIGHLY_SENSITIVE',
  'property-tax': 'SENSITIVE',
  'quote-comparison': 'SENSITIVE',
  'risk-premium-optimizer': 'SENSITIVE',
  'seller-prep': 'SENSITIVE',
};

function governanceDefinition(
  seed: CapabilitySeed,
): Pick<
  ToolCapabilityDefinition['governance'],
  | 'professionalBoundary'
  | 'jurisdictionPolicy'
  | 'conservativeFallback'
  | 'emergencyEscalation'
  | 'commercialDisclosure'
  | 'privacy'
> {
  const material = seed.safetyTier === 'MATERIAL_FINANCIAL';
  const regulated = seed.safetyTier === 'REGULATED_COVERAGE';
  const safety = seed.safetyTier === 'SAFETY_EMERGENCY';
  const renovationCompliance = seed.id === 'home-renovation-risk-advisor';
  const propertyBrief = seed.id === 'property-brief';
  const commercialAction = seed.id === 'financing';
  const dataSensitivity =
    DATA_SENSITIVITY_BY_CAPABILITY_ID[seed.id] ?? 'STANDARD';

  return {
    professionalBoundary: propertyBrief
      ? 'A Property Brief is homeowner-assembled information, not an inspection, appraisal, certification, title report, comprehensive disclosure, or professional opinion.'
      : renovationCompliance
      ? 'Renovation guidance organizes planning and evidence; verify permit, HOA, tax, safety, and professional requirements with the appropriate authority.'
      : material
      ? 'Estimates and comparisons are educational planning inputs, not financial, tax, valuation, or investment advice.'
      : regulated
        ? 'Coverage information is educational and is not licensed insurance, legal, or coverage advice.'
        : null,
    jurisdictionPolicy: regulated || renovationCompliance ? 'SOURCE_VERIFIED' : 'NOT_REQUIRED',
    conservativeFallback: safety
      ? 'Do not perform work or remain in an unsafe area when conditions may threaten people or property.'
      : null,
    emergencyEscalation: safety
      ? 'For immediate danger, leave the area and contact emergency services or the appropriate utility.'
      : null,
    commercialDisclosure: commercialAction
      ? {
          relationshipType: 'NOT_RECORDED',
          compensationMayOccur: true,
          rankingInfluenced: false,
          summary:
            'Commercial relationship and compensation terms must be recorded before this capability is approved for launch.',
          nonCommercialAlternative:
            'The homeowner can compare independent lenders or consult a financial professional without using this capability.',
        }
      : {
          relationshipType: 'NONE',
          compensationMayOccur: false,
          rankingInfluenced: false,
          summary: 'This capability does not include a commercial action.',
          nonCommercialAlternative: null,
        },
    privacy: {
      dataSensitivity,
      allowedPurpose:
        'Use the minimum property and workflow data needed to provide the homeowner-requested capability.',
      sharingBoundary: propertyBrief
        ? 'Share only homeowner-selected sections with an explicitly previewed recipient scope, expiration, revocation, access log, and sensitive-field warnings.'
        : 'Do not share capability data outside authorized household access and required service processors.',
      retentionBoundary:
        'Retain capability data only under the applicable account, property record, and verified privacy-request policy.',
    },
  };
}

/**
 * Verified output identities used for related and post-completion
 * compatibility. An empty entry is intentional: we do not infer an entity
 * merely from a generic completion kind.
 */
const OUTPUT_ENTITY_TYPES: Record<
  string,
  ToolCapabilityDefinition['lifecycle']['outputEntityTypes']
> = {
  claims: ['STRUCTURED_RECORD'],
  documents: ['PROPERTY_RECORD'],
  diy: ['PROJECT'],
  'hoa-compliance': ['DOCUMENT'],
  'home-digital-will': ['HANDOFF_PACKAGE'],
  'home-renovation-risk-advisor': ['PROJECT'],
  'inspection-hub': ['ISSUE'],
  'material-specs': ['STRUCTURED_RECORD'],
  permits: ['DOCUMENT'],
  'project-tracker': ['PROJECT'],
  'quote-comparison': ['SERVICE'],
  'coverage-intelligence': ['COVERAGE_DECISION'],
  'seller-prep': ['SALE_CASE'],
};

const CONTEXTUAL_DEFINITIONS: Record<string, ContextualDefinition> = {
  'break-even': {
    sourceKinds: ['GUIDANCE', 'PROJECT'],
    triggerFamily: 'MATERIAL_DECISION_ACTIVE',
    reason: 'A material home decision is active and would benefit from break-even timing.',
  },
  'capital-timeline': {
    sourceKinds: ['SYSTEM', 'PROJECT'],
    triggerFamily: 'TRACKED_SYSTEMS_AVAILABLE',
    reason: 'Tracked systems or lifecycle signals can be placed on a capital timeline.',
    readinessRequirements: [
      { kind: 'TRACKED_SYSTEMS', minimum: 1, reason: 'Add at least one home system.' },
    ],
  },
  'ownership-costs': {
    sourceKinds: ['GUIDANCE', 'PROJECT', 'PERSONALIZATION'],
    triggerFamily: 'OWNERSHIP_COST_REVIEW_DUE',
    triggerFamilies: [
      'OWNERSHIP_COST_MATERIAL_CHANGE',
      'OWNERSHIP_COST_UPCOMING_EVENT',
      'OWNERSHIP_COST_HIGH_IMPACT_FACT_MISSING',
      'OWNERSHIP_COST_SCENARIO_STALE',
      'OWNERSHIP_COST_BUFFER_GAP',
      'OWNERSHIP_COST_REVIEW_DUE',
    ],
    reason: 'A material cost change, upcoming event, missing high-impact fact, stale scenario, or planning gap makes an ownership-cost review timely.',
    reasonTemplates: {
      OWNERSHIP_COST_MATERIAL_CHANGE: 'A verified material ownership-cost change needs review.',
      OWNERSHIP_COST_UPCOMING_EVENT: 'An upcoming renewal, reassessment, payment, or project may change ownership costs.',
      OWNERSHIP_COST_HIGH_IMPACT_FACT_MISSING: 'A missing high-impact cost fact is limiting the current plan.',
      OWNERSHIP_COST_SCENARIO_STALE: 'A saved ownership-cost scenario uses inputs that have changed.',
      OWNERSHIP_COST_BUFFER_GAP: 'The current budget or reserve plan may not cover a known ownership-cost need.',
      OWNERSHIP_COST_REVIEW_DUE: 'The ownership-cost snapshot is due for review.',
    },
    acceptedContext: ['PROPERTY', 'HOME_ACTION', 'DOCUMENT', 'PROJECT', 'JOURNEY'],
  },
  diy: {
    sourceKinds: ['MAINTENANCE', 'PROJECT'],
    triggerFamily: 'LOW_RISK_DIY_ELIGIBLE',
    reason: 'A reviewed low-risk task may be suitable for a guided DIY project.',
    requiresExplicitTrigger: true,
    acceptedContext: ['PROPERTY', 'HOME_ACTION', 'PROJECT', 'ISSUE'],
  },
  'hoa-compliance': {
    sourceKinds: ['PROJECT'],
    triggerFamily: 'HOA_PROJECT_APPROVAL_REQUIRED',
    reason: 'An HOA-governed project may require approval before work starts.',
    requiresExplicitTrigger: true,
    acceptedContext: ['PROPERTY', 'PROJECT', 'DOCUMENT'],
  },
  'home-digital-twin': {
    sourceKinds: ['SYSTEM', 'PROJECT', 'MAINTENANCE', 'INCIDENT'],
    triggerFamily: 'ACTIVE_SYSTEM_DECISION',
    reason: 'A specific home system has an active repair, replacement, upgrade, or wait decision.',
    requiresExplicitTrigger: true,
    acceptedContext: ['PROPERTY', 'HOME_ACTION', 'PROJECT', 'ISSUE'],
    readinessRequirements: [
      { kind: 'KNOWN_FACTS', minimum: 1, reason: 'Add at least one verified Home Record fact.' },
    ],
  },
  'home-digital-will': {
    sourceKinds: ['PERSONALIZATION'],
    triggerFamily: 'TRUSTED_TRANSFER_PREPARATION',
    reason: 'A continuity need makes it timely to prepare selected records and test recipient access.',
    requiresExplicitTrigger: true,
    acceptedContext: ['PROPERTY', 'DOCUMENT', 'JOURNEY'],
  },
  'home-event-radar': {
    sourceKinds: ['INCIDENT', 'GUIDANCE'],
    triggerFamily: 'WEATHER_SIGNAL_ACTIVE',
    reason: 'Active weather or local-condition signals affect this property.',
  },
  'home-habit-coach': {
    sourceKinds: ['MAINTENANCE', 'GUIDANCE'],
    triggerFamily: 'ROUTINE_DRIFT_ACTIVE',
    reason: 'Repeated maintenance signals suggest a lightweight home-care routine.',
  },
  'home-renovation-risk-advisor': {
    sourceKinds: ['PROJECT'],
    triggerFamily: 'ACTIVE_PROJECT_MOMENT',
    reason: 'An actionable renovation change should advance through its canonical governed workspace.',
    requiresExplicitTrigger: true,
    acceptedContext: ['PROPERTY', 'HOME_ACTION', 'PROJECT', 'JOURNEY'],
  },
  'home-risk-replay': {
    sourceKinds: ['INCIDENT', 'GUIDANCE'],
    triggerFamily: 'PAST_HAZARD_EVIDENCE_UPDATED',
    reason: 'Reviewed hazard coverage, a property fact, or linked evidence changed the bounded historical interpretation.',
    requiresExplicitTrigger: true,
    acceptedContext: ['PROPERTY', 'HOME_ACTION', 'DOCUMENT', 'ISSUE'],
  },
  'home-briefing': {
    sourceKinds: ['GUIDANCE', 'MAINTENANCE', 'INCIDENT', 'SYSTEM', 'PROJECT'],
    triggerFamily: 'MATERIAL_PROPERTY_CHANGE_UNSEEN',
    reason: 'A new material canonical property change has not yet been reviewed.',
    requiresExplicitTrigger: true,
    acceptedContext: ['PROPERTY', 'HOME_ACTION', 'DOCUMENT', 'PROJECT', 'ISSUE', 'JOURNEY'],
  },
  'inspection-hub': {
    sourceKinds: ['GUIDANCE', 'PROJECT'],
    triggerFamily: 'INSPECTION_DOCUMENT_AVAILABLE',
    reason: 'An inspection report or ownership journey has findings to organize and track.',
    recommendationDefinitionCodes: ['INSPECTION_DOCUMENT_AVAILABLE'],
    requiresExplicitTrigger: true,
    acceptedContext: ['PROPERTY', 'DOCUMENT', 'ISSUE', 'JOURNEY'],
  },
  'material-specs': {
    sourceKinds: ['PROJECT', 'MAINTENANCE'],
    triggerFamily: 'MATERIAL_RECORD_NEEDED',
    reason: 'A completed project or repair needs a durable finish and product record.',
    safePartialValue: true,
    acceptedContext: ['PROPERTY', 'PROJECT', 'ROOM', 'ISSUE'],
    readinessRequirements: [
      {
        kind: 'SOURCE_CONTEXT',
        contextType: 'PROJECT',
        reason: 'Choose a project, room, or repair context before recording materials.',
      },
    ],
  },
  'neighborhood-change-radar': {
    sourceKinds: ['GUIDANCE', 'PERSONALIZATION'],
    triggerFamily: 'REVIEWED_LOCAL_OBSERVATION_UPDATED',
    reason: 'A followed or materially relevant reviewed local observation is new or has changed lifecycle state.',
    requiresExplicitTrigger: true,
    acceptedContext: ['PROPERTY', 'HOME_ACTION', 'DOCUMENT'],
    readinessRequirements: [
      {
        kind: 'JURISDICTION',
        reason: 'Confirm precise or honestly bounded property geography before showing local observations.',
      },
    ],
  },
  permits: {
    sourceKinds: ['PROJECT'],
    triggerFamily: 'PERMIT_RELEVANT_PROJECT',
    reason: 'The planned work may require permit research or inspection tracking.',
    requiresExplicitTrigger: true,
    acceptedContext: ['PROPERTY', 'PROJECT', 'DOCUMENT', 'ISSUE'],
    readinessRequirements: [
      {
        kind: 'JURISDICTION',
        reason: 'Confirm the property state before researching local permit requirements.',
      },
    ],
  },
  'plant-advisor': {
    sourceKinds: ['MAINTENANCE', 'PERSONALIZATION'],
    triggerFamily: 'PLANT_SUITABLE_ROOM_CONTEXT',
    reason: 'Room light and maintenance context can support a plant recommendation.',
    safePartialValue: true,
    acceptedContext: ['PROPERTY', 'ROOM'],
    readinessRequirements: [
      {
        kind: 'SOURCE_CONTEXT',
        contextType: 'ROOM',
        reason: 'Choose a room and provide its light context.',
      },
    ],
  },
  'project-tracker': {
    sourceKinds: ['PROJECT'],
    triggerFamily: 'PROJECT_EXECUTION_STARTED',
    reason: 'Contractor selection, a contract upload, or a project start needs ongoing tracking.',
    requiresExplicitTrigger: true,
    acceptedContext: ['PROPERTY', 'PROJECT', 'DOCUMENT', 'JOURNEY'],
  },
  'savings-benefits': {
    sourceKinds: ['SYSTEM', 'PERSONALIZATION'],
    triggerFamily: 'PROPERTY_BENEFIT_EXPLORATION',
    reason: 'Existing systems can be checked for rebates, credits, and ownership benefits.',
    // Not safe-partial-value: this capability is MATERIAL_FINANCIAL (the
    // retired hidden-asset-finder was LOW_CONSEQUENCE), and safePartialValue
    // is restricted to LOW_CONSEQUENCE capabilities (see capability.contract.ts
    // superRefine).
    //
    // Gated on JURISDICTION (property location known), not TRACKED_SYSTEMS —
    // the audit explicitly critiques "add at least one system" as an
    // incorrect universal readiness gate (Slice 4): a nationwide property-tax
    // exemption or a location-based rebate needs no tracked system at all.
    // Location is the one fact nearly every benefit category depends on;
    // finer-grained, opportunity-specific readiness (equipment, occupancy,
    // utility territory) is surfaced per-match inside the workspace via
    // confidence level and unresolved-criteria caveats, not at this
    // coarse discoverability gate — see hiddenAssets/ruleEngine.ts.
    readinessRequirements: [
      {
        kind: 'JURISDICTION',
        reason: 'Confirm the property location before checking for rebates, credits, and benefits.',
      },
    ],
  },
  'sell-hold-rent': {
    sourceKinds: ['GUIDANCE', 'PERSONALIZATION'],
    triggerFamily: 'OWNERSHIP_OUTLOOK_SHIFT',
    reason: 'Ownership outlook signals make sell, hold, and rent tradeoffs timely.',
  },
  'seller-prep': {
    sourceKinds: ['PERSONALIZATION', 'PROJECT'],
    triggerFamily: 'SELLER_JOURNEY_ACTIVE',
    reason: 'Confirmed sale intent makes a governed readiness and handoff case relevant.',
    requiresExplicitTrigger: true,
    recommendationDefinitionCodes: ['SELLER_SALE_INTENT_ACTIVE'],
    sourceCtaExclusionCapabilityIds: ['sell-hold-rent'],
    acceptedContext: ['PROPERTY', 'JOURNEY', 'PROJECT'],
  },
  'service-price-radar': {
    sourceKinds: ['MAINTENANCE', 'PROJECT', 'GUIDANCE', 'INCIDENT', 'SYSTEM'],
    triggerFamily: 'SERVICE_DECISION_ACTIVE',
    reason: 'A quote or explicit service-quote decision is ready to review.',
    requiresExplicitTrigger: true,
    acceptedContext: [
      'PROPERTY',
      'INVENTORY_ITEM',
      'DOCUMENT',
      'PROJECT',
      'ROOM',
      'ISSUE',
      'SERVICE',
      'JOURNEY',
      'HOME_ACTION',
    ],
  },
  'status-board': {
    sourceKinds: ['GUIDANCE', 'MAINTENANCE', 'INCIDENT'],
    triggerFamily: 'MULTIPLE_PRIORITY_SIGNALS',
    reason: 'Multiple active signals benefit from a consolidated readiness view.',
  },
};

const RELATED_CAPABILITIES: Record<string, string[]> = {
  'break-even': ['sell-hold-rent', 'ownership-costs', 'capital-timeline'],
  'buyer-closing': ['property-brief', 'inspection-hub', 'home-timeline'],
  'capital-timeline': ['reserve-fund', 'home-timeline', 'seller-prep'],
  claims: ['coverage-intelligence', 'home-timeline', 'property-brief'],
  // Moved from 'documents' → 'home-records': this related-capabilities set
  // (property-brief/home-timeline/material-specs) describes the canonical
  // records capability's natural relations — that's 'home-records' now
  // that the two ids no longer share one entry (see understandHome.ts and
  // the 4 other references below, also repointed).
  'home-records': ['property-brief', 'home-timeline', 'material-specs'],
  'ownership-costs': ['property-tax', 'coverage-intelligence', 'budget'],
  financing: ['capital-timeline', 'mortgage-refinance-radar', 'break-even'],
  'guidance-overview': ['status-board', 'home-event-radar', 'home-risk-replay'],
  'home-digital-twin': ['capital-timeline', 'status-board', 'home-risk-replay'],
  'home-digital-will': ['property-brief', 'home-records', 'home-timeline'],
  'home-event-radar': ['home-risk-replay', 'home-timeline', 'status-board'],
  'home-briefing': ['home-event-radar', 'home-timeline', 'status-board'],
  'home-habit-coach': ['home-event-radar', 'home-timeline', 'status-board'],
  'home-renovation-risk-advisor': ['project-tracker', 'permits', 'hoa-compliance'],
  'home-risk-replay': ['home-event-radar', 'home-timeline', 'status-board'],
  'home-timeline': ['property-brief', 'home-risk-replay', 'seller-prep'],
  'material-specs': ['home-records', 'project-tracker', 'property-brief'],
  'mortgage-refinance-radar': ['break-even', 'capital-timeline', 'ownership-costs'],
  'neighborhood-change-radar': ['home-event-radar', 'home-risk-replay', 'status-board'],
  'negotiation-shield': ['service-price-radar', 'quote-comparison', 'ownership-costs'],
  'plant-advisor': ['home-habit-coach', 'status-board', 'home-event-radar'],
  'price-finalization': ['quote-comparison', 'negotiation-shield', 'service-price-radar'],
  'property-tax': ['ownership-costs', 'capital-timeline', 'savings-benefits'],
  'quote-comparison': ['service-price-radar', 'negotiation-shield', 'price-finalization'],
  'reserve-fund': ['capital-timeline', 'ownership-costs', 'break-even'],
  'savings-benefits': ['property-tax', 'coverage-intelligence', 'mortgage-refinance-radar'],
  'sell-hold-rent': ['break-even', 'ownership-costs', 'capital-timeline'],
  'seller-prep': ['property-brief', 'home-timeline', 'home-records'],
  'service-price-radar': ['negotiation-shield', 'quote-comparison', 'ownership-costs'],
  'status-board': ['home-event-radar', 'home-risk-replay', 'home-timeline'],
  'property-brief': ['home-timeline', 'home-records', 'status-board'],
};

function completionSignal(seed: CapabilitySeed): string {
  const suffix = {
    OUTPUT_VIEWED: 'output_viewed',
    OUTPUT_GENERATED: 'output_generated',
    ARTIFACT_CREATED: 'artifact_created',
    DECISION_RECORDED: 'decision_recorded',
    ACTION_INITIATED: 'action_initiated',
    ACTION_COMPLETED: 'action_completed',
    PLAN_CREATED: 'plan_created',
    OUTCOME_VERIFIED: 'outcome_verified',
  }[seed.completionKind];
  return `${seed.id.replace(/-/g, '_')}_${suffix}`;
}

export function buildCapabilityDefinition(seed: CapabilitySeed): ToolCapabilityDefinition {
  const contextual = CONTEXTUAL_DEFINITIONS[seed.id];
  if (seed.mode === 'CONTEXTUAL' && !contextual) {
    throw new Error(`Missing reviewed contextual definition for ${seed.id}`);
  }
  if (seed.mode !== 'CONTEXTUAL' && contextual) {
    throw new Error(`Unexpected contextual definition for ${seed.id}`);
  }

  const primaryJob = JOB_BY_OUTCOME[seed.outcomeCategory];
  const requiresProperty = seed.routeTemplate.includes('[id]');
  const acceptedContext = seed.acceptedContext ?? contextual?.acceptedContext ?? ['PROPERTY'];
  const output = OUTPUT_BY_OUTCOME[seed.outcomeCategory];

  return defineToolCapability({
    id: seed.id,
    version: seed.version ?? 1,
    owner: 'Homeowner Product',
    presentation: {
      label: seed.label,
      shortDescription: seed.description,
      longDescription: `${seed.description} The capability uses the current Home Record and preserves the homeowner's context across the workflow.`,
      iconName: seed.iconName ?? ICON_BY_OUTCOME[seed.outcomeCategory],
      intentAliases: seed.intentAliases ?? [
        seed.label.toLowerCase(),
        seed.id.replace(/-/g, ' '),
      ],
      outcomeCategory: seed.outcomeCategory,
      badges: seed.releaseStage === 'BETA' ? ['BETA'] : [],
    },
    productFramework: {
      primaryJob,
      secondaryJobs: [],
      primaryDestination: DESTINATION_BY_OUTCOME[seed.outcomeCategory],
      homeownerOutcome: seed.homeownerOutcome ?? output,
      expectedTimeToValue: seed.expectedTimeToValue ?? '2–5 minutes',
      livingHomeRecordReads:
        seed.livingHomeRecordReads
        ?? (requiresProperty ? ['property-context'] : []),
      livingHomeRecordWrites: seed.livingHomeRecordWrites ?? [],
    },
    destination: {
      routeTemplate: seed.routeTemplate,
      routeAliases: seed.routeAliases ?? [],
      navTarget: seed.navTarget ?? `tool:${seed.id}`,
      acceptedContext,
      workflowOnly: seed.mode === 'WORKFLOW_ONLY',
    },
    recommendation: {
      mode: seed.mode,
      sourceKinds: contextual?.sourceKinds ?? [],
      jobs: contextual ? [primaryJob] : [],
      triggerFamilies: seed.triggerFamilies ?? (contextual
        ? contextual.triggerFamilies ?? [contextual.triggerFamily]
        : []),
      recommendationDefinitionCodes:
        contextual?.recommendationDefinitionCodes ?? [],
      reasonTemplates: seed.reasonTemplates ?? (contextual
        ? contextual.reasonTemplates ?? { [contextual.triggerFamily]: contextual.reason }
        : {}),
      expectedOutcome: seed.homeownerOutcome ?? output,
      readinessRequirements: [
        ...(requiresProperty
          ? [{ kind: 'PROPERTY' as const, reason: 'Select a property first.' }]
          : []),
        ...(seed.readinessRequirements ?? contextual?.readinessRequirements ?? []),
      ],
      safePartialValue: contextual?.safePartialValue ?? false,
      requiresExplicitTrigger: contextual?.requiresExplicitTrigger ?? false,
      sourceCtaExclusionCapabilityIds:
        contextual?.sourceCtaExclusionCapabilityIds ?? [],
      baseScore: contextual
        ? seed.id === 'ownership-costs' ? 65 : 60
        : 0,
      explicitRelatedCapabilityIds: RELATED_CAPABILITIES[seed.id] ?? [],
      maxImpressionsPer30Days: contextual ? 3 : 0,
      cooldownDaysAfterDismissal: contextual ? 30 : 0,
    },
    governance: {
      safetyTier: seed.safetyTier,
      policyVersion: 'capability-governance-v2',
      rolloutKey: seed.rolloutKey,
      releaseStage: seed.releaseStage,
      commercialAction: seed.id === 'financing',
      ...governanceDefinition(seed),
    },
    lifecycle: {
      expectedOutput: seed.expectedOutput ?? output,
      completionKind: seed.completionKind,
      completionSignal: seed.completionSignal ?? completionSignal(seed),
      outputEntityTypes:
        seed.outputEntityTypes
        ?? OUTPUT_ENTITY_TYPES[seed.id]
        ?? [],
    },
  });
}

export function buildCapabilityDefinitions(
  seeds: readonly CapabilitySeed[],
): ToolCapabilityDefinition[] {
  return seeds.map(buildCapabilityDefinition);
}
