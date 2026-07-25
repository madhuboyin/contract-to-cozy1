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
  outcomeCategory: CapabilityOutcomeCategory;
  rolloutKey: string;
  releaseStage: 'ACTIVE' | 'BETA';
  safetyTier: ToolCapabilityDefinition['governance']['safetyTier'];
  completionKind: ToolCapabilityDefinition['lifecycle']['completionKind'];
  mode: CapabilityRecommendationMode;
  iconName?: ToolCapabilityDefinition['presentation']['iconName'];
  intentAliases?: ToolCapabilityDefinition['presentation']['intentAliases'];
  homeownerOutcome?: string;
  livingHomeRecordReads?: ToolCapabilityDefinition['productFramework']['livingHomeRecordReads'];
  livingHomeRecordWrites?: ToolCapabilityDefinition['productFramework']['livingHomeRecordWrites'];
  expectedOutput?: string;
  completionSignal?: string;
  outputEntityTypes?: ToolCapabilityDefinition['lifecycle']['outputEntityTypes'];
};

type ContextualDefinition = {
  sourceKinds: ToolCapabilityDefinition['recommendation']['sourceKinds'];
  triggerFamily: string;
  reason: string;
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

/**
 * Verified output identities used for related and post-completion
 * compatibility. An empty entry is intentional: we do not infer an entity
 * merely from a generic completion kind.
 */
const OUTPUT_ENTITY_TYPES: Record<
  string,
  ToolCapabilityDefinition['lifecycle']['outputEntityTypes']
> = {
  diy: ['PROJECT'],
  'hidden-asset-finder': ['INVENTORY_ITEM'],
  'hoa-compliance': ['DOCUMENT'],
  'home-digital-will': ['DOCUMENT'],
  'home-renovation-risk-advisor': ['PROJECT'],
  'inspection-hub': ['ISSUE'],
  'material-specs': ['DOCUMENT'],
  permits: ['DOCUMENT'],
  'project-tracker': ['PROJECT'],
  'quote-comparison': ['SERVICE'],
  'seller-prep': ['PROJECT'],
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
  'cost-growth': {
    sourceKinds: ['GUIDANCE'],
    triggerFamily: 'FINANCIAL_PRESSURE_ACTIVE',
    reason: 'Current financial pressure may compound into longer-term ownership costs.',
  },
  'coverage-options': {
    sourceKinds: ['COVERAGE'],
    triggerFamily: 'COVERAGE_GAPS_PRESENT',
    reason: 'Confirmed coverage gaps make a coverage comparison useful now.',
    readinessRequirements: [
      { kind: 'COVERAGE_GAPS', minimum: 1, reason: 'Identify at least one coverage gap.' },
    ],
  },
  diy: {
    sourceKinds: ['MAINTENANCE', 'PROJECT'],
    triggerFamily: 'LOW_RISK_DIY_ELIGIBLE',
    reason: 'A reviewed low-risk task may be suitable for a guided DIY project.',
    requiresExplicitTrigger: true,
    acceptedContext: ['PROPERTY', 'HOME_ACTION', 'PROJECT', 'ISSUE'],
  },
  'hidden-asset-finder': {
    sourceKinds: ['SYSTEM', 'PERSONALIZATION'],
    triggerFamily: 'PROPERTY_BENEFIT_EXPLORATION',
    reason: 'Existing systems can be checked for rebates, credits, and ownership benefits.',
    safePartialValue: true,
    readinessRequirements: [
      { kind: 'TRACKED_SYSTEMS', minimum: 1, reason: 'Add at least one home system.' },
    ],
  },
  'hoa-compliance': {
    sourceKinds: ['PROJECT'],
    triggerFamily: 'HOA_PROJECT_APPROVAL_REQUIRED',
    reason: 'An HOA-governed project may require approval before work starts.',
    requiresExplicitTrigger: true,
    acceptedContext: ['PROPERTY', 'PROJECT', 'DOCUMENT'],
  },
  'home-digital-twin': {
    sourceKinds: ['SYSTEM', 'PERSONALIZATION'],
    triggerFamily: 'PROPERTY_CONTEXT_INCOMPLETE',
    reason: 'Known, missing, or conflicting Home Record facts can be reviewed together.',
    safePartialValue: true,
    readinessRequirements: [
      { kind: 'KNOWN_FACTS', minimum: 1, reason: 'Add at least one verified Home Record fact.' },
    ],
  },
  'home-digital-will': {
    sourceKinds: ['PERSONALIZATION'],
    triggerFamily: 'TRUSTED_TRANSFER_PREPARATION',
    reason: 'Critical documents and trusted contacts should be prepared for transfer or emergency access.',
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
    reason: 'An active renovation should be reviewed for permit, contractor, and execution risk.',
    acceptedContext: ['PROPERTY', 'PROJECT', 'JOURNEY'],
  },
  'home-risk-replay': {
    sourceKinds: ['INCIDENT', 'GUIDANCE'],
    triggerFamily: 'SAFETY_SIGNAL_ACTIVE',
    reason: 'Recent risk and safety signals can clarify mitigation priorities.',
  },
  'inspection-hub': {
    sourceKinds: ['GUIDANCE', 'PROJECT'],
    triggerFamily: 'INSPECTION_DOCUMENT_AVAILABLE',
    reason: 'An inspection report or ownership journey has findings to organize and track.',
    acceptedContext: ['PROPERTY', 'DOCUMENT', 'ISSUE', 'JOURNEY'],
  },
  'insurance-trend': {
    sourceKinds: ['COVERAGE', 'GUIDANCE'],
    triggerFamily: 'INSURANCE_PRESSURE_ACTIVE',
    reason: 'Insurance or renewal signals indicate premium pressure worth reviewing.',
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
    triggerFamily: 'NEIGHBORHOOD_SIGNAL_ACTIVE',
    reason: 'External neighborhood changes may affect home value or livability.',
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
    acceptedContext: ['PROPERTY', 'PROJECT', 'DOCUMENT', 'JOURNEY'],
  },
  'sell-hold-rent': {
    sourceKinds: ['GUIDANCE', 'PERSONALIZATION'],
    triggerFamily: 'OWNERSHIP_OUTLOOK_SHIFT',
    reason: 'Ownership outlook signals make sell, hold, and rent tradeoffs timely.',
  },
  'seller-prep': {
    sourceKinds: ['PERSONALIZATION', 'PROJECT'],
    triggerFamily: 'SELLER_JOURNEY_ACTIVE',
    reason: 'Sale intent or a moving timeline makes seller preparation relevant.',
    requiresExplicitTrigger: true,
    recommendationDefinitionCodes: ['SELLER_SALE_INTENT_ACTIVE'],
    sourceCtaExclusionCapabilityIds: ['sell-hold-rent'],
    acceptedContext: ['PROPERTY', 'JOURNEY', 'PROJECT'],
  },
  'service-price-radar': {
    sourceKinds: ['MAINTENANCE', 'PROJECT', 'GUIDANCE'],
    triggerFamily: 'SERVICE_DECISION_ACTIVE',
    reason: 'A repair, maintenance, contractor, or quote decision is active.',
  },
  'status-board': {
    sourceKinds: ['GUIDANCE', 'MAINTENANCE', 'INCIDENT'],
    triggerFamily: 'MULTIPLE_PRIORITY_SIGNALS',
    reason: 'Multiple active signals benefit from a consolidated readiness view.',
  },
};

const RELATED_CAPABILITIES: Record<string, string[]> = {
  'break-even': ['sell-hold-rent', 'true-cost', 'cost-growth'],
  'capital-timeline': ['reserve-fund', 'home-timeline', 'seller-prep'],
  'cost-explainer': ['true-cost', 'break-even', 'cost-growth'],
  'cost-growth': ['cost-volatility', 'break-even', 'true-cost'],
  'cost-volatility': ['cost-growth', 'break-even', 'sell-hold-rent'],
  'coverage-options': ['insurance-trend', 'home-risk-replay', 'status-board'],
  financing: ['capital-timeline', 'mortgage-refinance-radar', 'break-even'],
  'guidance-overview': ['status-board', 'home-event-radar', 'home-risk-replay'],
  'hidden-asset-finder': ['home-digital-twin', 'home-digital-will', 'status-board'],
  'home-digital-twin': ['capital-timeline', 'status-board', 'home-risk-replay'],
  'home-digital-will': ['home-event-radar', 'home-risk-replay', 'status-board'],
  'home-event-radar': ['home-risk-replay', 'home-timeline', 'status-board'],
  'home-gazette': ['home-event-radar', 'home-risk-replay', 'status-board'],
  'home-habit-coach': ['home-event-radar', 'home-timeline', 'status-board'],
  'home-renovation-risk-advisor': ['capital-timeline', 'property-tax', 'home-digital-twin'],
  'home-risk-replay': ['home-event-radar', 'home-timeline', 'status-board'],
  'home-timeline': ['home-risk-replay', 'home-event-radar', 'seller-prep'],
  'insurance-trend': ['true-cost', 'cost-volatility', 'home-risk-replay'],
  'material-specs': ['project-tracker', 'inspection-hub', 'home-digital-twin'],
  'mortgage-refinance-radar': ['break-even', 'capital-timeline', 'true-cost'],
  'neighborhood-change-radar': ['home-event-radar', 'home-risk-replay', 'status-board'],
  'negotiation-shield': ['service-price-radar', 'cost-explainer', 'true-cost'],
  'plant-advisor': ['home-habit-coach', 'status-board', 'home-event-radar'],
  'price-finalization': ['quote-comparison', 'negotiation-shield', 'service-price-radar'],
  'property-tax': ['true-cost', 'cost-growth', 'capital-timeline'],
  'quote-comparison': ['service-price-radar', 'negotiation-shield', 'price-finalization'],
  'reserve-fund': ['capital-timeline', 'true-cost', 'break-even'],
  'sell-hold-rent': ['break-even', 'cost-volatility', 'capital-timeline'],
  'seller-prep': ['sell-hold-rent', 'home-timeline', 'capital-timeline'],
  'service-price-radar': ['negotiation-shield', 'cost-explainer', 'true-cost'],
  'status-board': ['home-event-radar', 'home-risk-replay', 'home-timeline'],
  'true-cost': ['cost-explainer', 'break-even', 'sell-hold-rent'],
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
  const acceptedContext = contextual?.acceptedContext ?? ['PROPERTY'];
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
      expectedTimeToValue: '2–5 minutes',
      livingHomeRecordReads:
        seed.livingHomeRecordReads
        ?? (requiresProperty ? ['property-context'] : []),
      livingHomeRecordWrites: seed.livingHomeRecordWrites ?? [],
    },
    destination: {
      routeTemplate: seed.routeTemplate,
      routeAliases: [],
      navTarget: `tool:${seed.id}`,
      acceptedContext,
      workflowOnly: seed.mode === 'WORKFLOW_ONLY',
    },
    recommendation: {
      mode: seed.mode,
      sourceKinds: contextual?.sourceKinds ?? [],
      jobs: contextual ? [primaryJob] : [],
      triggerFamilies: contextual ? [contextual.triggerFamily] : [],
      recommendationDefinitionCodes:
        contextual?.recommendationDefinitionCodes ?? [],
      reasonTemplates: contextual
        ? { [contextual.triggerFamily]: contextual.reason }
        : {},
      expectedOutcome: seed.homeownerOutcome ?? output,
      readinessRequirements: [
        ...(requiresProperty
          ? [{ kind: 'PROPERTY' as const, reason: 'Select a property first.' }]
          : []),
        ...(contextual?.readinessRequirements ?? []),
      ],
      safePartialValue: contextual?.safePartialValue ?? false,
      requiresExplicitTrigger: contextual?.requiresExplicitTrigger ?? false,
      sourceCtaExclusionCapabilityIds:
        contextual?.sourceCtaExclusionCapabilityIds ?? [],
      baseScore: contextual ? 60 : 0,
      explicitRelatedCapabilityIds: RELATED_CAPABILITIES[seed.id] ?? [],
      maxImpressionsPer30Days: contextual ? 3 : 0,
      cooldownDaysAfterDismissal: contextual ? 30 : 0,
    },
    governance: {
      safetyTier: seed.safetyTier,
      policyVersion: 'capability-registry-v1',
      rolloutKey: seed.rolloutKey,
      releaseStage: seed.releaseStage,
      commercialAction: seed.id === 'financing',
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
