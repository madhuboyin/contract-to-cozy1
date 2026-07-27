import { z } from 'zod';
import {
  HOMEOWNER_JOBS,
  HOME_ACTION_SOURCE_KINDS,
} from '../homeAction.contract';
import { RecommendationSafetyTierSchema } from '../recommendationGovernance.contract';

export const CAPABILITY_OUTCOME_CATEGORIES = [
  'DECIDE_COMPARE',
  'PROTECT_MONITOR',
  'MAINTAIN_PREVENT',
  'PLAN_BUDGET',
  'SAVE_OPTIMIZE',
  'UNDERSTAND_HOME',
] as const;

export const CAPABILITY_DESTINATIONS = [
  'HOME',
  'PLAN_PROJECTS',
  'HOME_RECORD',
  'ASK',
  'PROFILE_SETTINGS',
] as const;

export const CAPABILITY_CONTEXT_TYPES = [
  'PROPERTY',
  'HOME_ACTION',
  'INVENTORY_ITEM',
  'DOCUMENT',
  'PROJECT',
  'ROOM',
  'ISSUE',
  'SERVICE',
  'JOURNEY',
  'COVERAGE_DECISION',
] as const;

export const CAPABILITY_RECOMMENDATION_MODES = [
  'CONTEXTUAL',
  'CATALOG_ONLY',
  'WORKFLOW_ONLY',
] as const;

export const CAPABILITY_RELEASE_STAGES = ['ACTIVE', 'BETA'] as const;
export const CAPABILITY_JURISDICTION_POLICIES = [
  'NOT_REQUIRED',
  'SOURCE_VERIFIED',
  'PROPERTY_STATE_REQUIRED',
  'LOCAL_JURISDICTION_REQUIRED',
] as const;
export const CAPABILITY_COMMERCIAL_RELATIONSHIPS = [
  'NONE',
  'OWNED',
  'REFERRAL_FEE',
  'COMMISSION',
  'AFFILIATE',
  'OTHER',
  'NOT_RECORDED',
] as const;
export const CAPABILITY_DATA_SENSITIVITY = [
  'STANDARD',
  'SENSITIVE',
  'HIGHLY_SENSITIVE',
] as const;

export const CAPABILITY_ICON_NAMES = [
  'alert-triangle',
  'badge-check',
  'bell',
  'bell-ring',
  'box',
  'building',
  'building-2',
  'calendar',
  'calendar-days',
  'clipboard-check',
  'clipboard-list',
  'cloud',
  'cloud-rain',
  'credit-card',
  'database',
  'dollar-sign',
  'droplet',
  'eye',
  'file-check',
  'file-text',
  'flame',
  'globe',
  'hammer',
  'key',
  'landmark',
  'layers',
  'layout-grid',
  'leaf',
  'lightbulb',
  'list-checks',
  'radar',
  'receipt',
  'refresh-cw',
  'search',
  'settings',
  'shield',
  'shield-alert',
  'shield-check',
  'siren',
  'sparkles',
  'sun',
  'thermometer',
  'tree-pine',
  'umbrella',
  'wind',
  'wrench',
  'zap',
] as const;

export const CAPABILITY_ROUTE_PARAMETERS = [
  'id',
  'itemId',
  'projectId',
  'documentId',
  'inventoryItemId',
  'issueId',
  'journeyId',
  'roomId',
  'serviceId',
] as const;

export const CAPABILITY_COMPLETION_KINDS = [
  'OUTPUT_VIEWED',
  'OUTPUT_GENERATED',
  'ARTIFACT_CREATED',
  'DECISION_RECORDED',
  'ACTION_INITIATED',
  'ACTION_COMPLETED',
  'PLAN_CREATED',
] as const;

export const CAPABILITY_READINESS_REQUIREMENT_KINDS = [
  'PROPERTY',
  'KNOWN_FACTS',
  'TRACKED_SYSTEMS',
  'COVERAGE_GAPS',
  'SOURCE_CONTEXT',
  'JURISDICTION',
] as const;

const CapabilityIdSchema = z.string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Capability IDs must use kebab-case.');

const NonEmptyBoundedString = z.string().trim().min(1).max(1000);

const RouteTemplateSchema = z.string()
  .trim()
  .min(1)
  .max(1000)
  .refine((value) => value.startsWith('/dashboard'), {
    message: 'Capability routes must be authenticated dashboard routes.',
  })
  .superRefine((value, ctx) => {
    const routeParameters = [...value.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]);
    const unknownParameters = routeParameters.filter(
      (parameter) => !CAPABILITY_ROUTE_PARAMETERS.includes(
        parameter as typeof CAPABILITY_ROUTE_PARAMETERS[number],
      ),
    );
    if (unknownParameters.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: `Unknown capability route parameter(s): ${[...new Set(unknownParameters)].join(', ')}`,
      });
    }
    if (new Set(routeParameters).size !== routeParameters.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Capability route parameters must not be repeated.',
      });
    }
  });

const CapabilityReadinessRequirementSchema = z.object({
  kind: z.enum(CAPABILITY_READINESS_REQUIREMENT_KINDS),
  minimum: z.number().int().min(0).max(10000).optional(),
  contextType: z.enum(CAPABILITY_CONTEXT_TYPES).optional(),
  reason: z.string().trim().min(1).max(300),
}).superRefine((value, ctx) => {
  if (
    ['KNOWN_FACTS', 'TRACKED_SYSTEMS', 'COVERAGE_GAPS'].includes(value.kind)
    && value.minimum == null
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['minimum'],
      message: `${value.kind} readiness requires a minimum.`,
    });
  }
  if (value.kind === 'SOURCE_CONTEXT' && !value.contextType) {
    ctx.addIssue({
      code: 'custom',
      path: ['contextType'],
      message: 'SOURCE_CONTEXT readiness requires a context type.',
    });
  }
});

export const ToolCapabilityDefinitionSchema = z.object({
  id: CapabilityIdSchema,
  version: z.number().int().positive(),
  owner: z.string().trim().min(1).max(160),
  presentation: z.object({
    label: z.string().trim().min(1).max(120),
    shortDescription: z.string().trim().min(1).max(300),
    longDescription: z.string().trim().min(1).max(1200),
    iconName: z.enum(CAPABILITY_ICON_NAMES),
    intentAliases: z.array(z.string().trim().min(1).max(160)).max(50),
    outcomeCategory: z.enum(CAPABILITY_OUTCOME_CATEGORIES),
    badges: z.array(z.enum(['NEW', 'BETA'])).max(2),
  }),
  productFramework: z.object({
    primaryJob: z.enum(HOMEOWNER_JOBS),
    secondaryJobs: z.array(z.enum(HOMEOWNER_JOBS)).max(HOMEOWNER_JOBS.length),
    primaryDestination: z.enum(CAPABILITY_DESTINATIONS),
    homeownerOutcome: NonEmptyBoundedString,
    expectedTimeToValue: z.string().trim().min(1).max(160),
    livingHomeRecordReads: z.array(z.string().trim().min(1).max(160)).max(50),
    livingHomeRecordWrites: z.array(z.string().trim().min(1).max(160)).max(50),
  }),
  destination: z.object({
    routeTemplate: RouteTemplateSchema,
    routeAliases: z.array(RouteTemplateSchema).max(30),
    navTarget: z.string().trim().min(1).max(160),
    acceptedContext: z.array(z.enum(CAPABILITY_CONTEXT_TYPES)).min(1),
    workflowOnly: z.boolean(),
  }),
  recommendation: z.object({
    mode: z.enum(CAPABILITY_RECOMMENDATION_MODES),
    sourceKinds: z.array(z.enum(HOME_ACTION_SOURCE_KINDS)).max(HOME_ACTION_SOURCE_KINDS.length),
    jobs: z.array(z.enum(HOMEOWNER_JOBS)).max(HOMEOWNER_JOBS.length),
    triggerFamilies: z.array(z.string().trim().min(1).max(160)).max(50),
    recommendationDefinitionCodes: z.array(z.string().trim().min(1).max(160)).max(50),
    reasonTemplates: z.record(z.string(), z.string().trim().min(1).max(600)),
    expectedOutcome: NonEmptyBoundedString,
    readinessRequirements: z.array(CapabilityReadinessRequirementSchema).max(30),
    safePartialValue: z.boolean().default(false),
    requiresExplicitTrigger: z.boolean().default(false),
    sourceCtaExclusionCapabilityIds: z.array(CapabilityIdSchema).max(30).default([]),
    baseScore: z.number().min(0).max(100),
    explicitRelatedCapabilityIds: z.array(CapabilityIdSchema).max(30),
    maxImpressionsPer30Days: z.number().int().min(0).max(100),
    cooldownDaysAfterDismissal: z.number().int().min(0).max(3650),
  }),
  governance: z.object({
    safetyTier: RecommendationSafetyTierSchema,
    policyVersion: z.string().trim().min(1).max(80),
    rolloutKey: z.string().trim().min(1).max(160),
    releaseStage: z.enum(CAPABILITY_RELEASE_STAGES),
    commercialAction: z.boolean(),
    professionalBoundary: z.string().trim().min(1).max(600).nullable().default(null),
    jurisdictionPolicy: z.enum(CAPABILITY_JURISDICTION_POLICIES).default('NOT_REQUIRED'),
    conservativeFallback: z.string().trim().min(1).max(600).nullable().default(null),
    emergencyEscalation: z.string().trim().min(1).max(600).nullable().default(null),
    commercialDisclosure: z.object({
      relationshipType: z.enum(CAPABILITY_COMMERCIAL_RELATIONSHIPS),
      compensationMayOccur: z.boolean(),
      rankingInfluenced: z.boolean(),
      summary: z.string().trim().min(1).max(500),
      nonCommercialAlternative: z.string().trim().min(1).max(500).nullable(),
    }).default({
      relationshipType: 'NONE',
      compensationMayOccur: false,
      rankingInfluenced: false,
      summary: 'This capability does not include a commercial action.',
      nonCommercialAlternative: null,
    }),
    privacy: z.object({
      dataSensitivity: z.enum(CAPABILITY_DATA_SENSITIVITY),
      allowedPurpose: z.string().trim().min(1).max(500),
      sharingBoundary: z.string().trim().min(1).max(500),
      retentionBoundary: z.string().trim().min(1).max(500),
    }).default({
      dataSensitivity: 'STANDARD',
      allowedPurpose: 'Use property context only to provide the requested homeowner capability.',
      sharingBoundary: 'Do not share property context outside authorized users and required service processors.',
      retentionBoundary: 'Retain capability data only under the applicable account and property retention policy.',
    }),
  }),
  lifecycle: z.object({
    expectedOutput: NonEmptyBoundedString,
    completionKind: z.enum(CAPABILITY_COMPLETION_KINDS),
    completionSignal: z.string().trim().min(1).max(160),
    outputEntityTypes: z.array(z.string().trim().min(1).max(160)).max(30),
  }),
}).superRefine((value, ctx) => {
  const contextualSources = (
    value.recommendation.sourceKinds.length
    + value.recommendation.triggerFamilies.length
    + value.recommendation.recommendationDefinitionCodes.length
  );
  if (value.recommendation.mode === 'CONTEXTUAL' && contextualSources === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['recommendation'],
      message: 'Contextual capabilities require at least one reviewed contextual source.',
    });
  }
  if (
    value.recommendation.mode === 'CONTEXTUAL'
    && Object.keys(value.recommendation.reasonTemplates).length === 0
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['recommendation', 'reasonTemplates'],
      message: 'Contextual capabilities require at least one reason template.',
    });
  }
  if (
    value.recommendation.safePartialValue
    && (
      value.recommendation.mode !== 'CONTEXTUAL'
      || value.governance.safetyTier !== 'LOW_CONSEQUENCE'
    )
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['recommendation', 'safePartialValue'],
      message: 'Safe partial value is limited to explicitly reviewed low-consequence contextual capabilities.',
    });
  }
  if (
    value.recommendation.requiresExplicitTrigger
    && (
      value.recommendation.triggerFamilies.length
      + value.recommendation.recommendationDefinitionCodes.length
    ) === 0
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['recommendation', 'requiresExplicitTrigger'],
      message: 'Explicit-trigger capabilities require a reviewed trigger family or recommendation definition.',
    });
  }
  if (
    value.destination.workflowOnly
    && value.recommendation.mode !== 'WORKFLOW_ONLY'
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['recommendation', 'mode'],
      message: 'Workflow-only destinations must use WORKFLOW_ONLY recommendation mode.',
    });
  }
  if (
    value.recommendation.mode === 'WORKFLOW_ONLY'
    && !value.destination.workflowOnly
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['destination', 'workflowOnly'],
      message: 'WORKFLOW_ONLY recommendation mode requires a workflow-only destination.',
    });
  }
  if (value.productFramework.secondaryJobs.includes(value.productFramework.primaryJob)) {
    ctx.addIssue({
      code: 'custom',
      path: ['productFramework', 'secondaryJobs'],
      message: 'The primary job must not be repeated as a secondary job.',
    });
  }
  if (new Set(value.destination.routeAliases).size !== value.destination.routeAliases.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['destination', 'routeAliases'],
      message: 'Route aliases must be unique within a capability.',
    });
  }
  if (value.destination.routeAliases.includes(value.destination.routeTemplate)) {
    ctx.addIssue({
      code: 'custom',
      path: ['destination', 'routeAliases'],
      message: 'The canonical route must not be repeated as an alias.',
    });
  }
});

export type ToolCapabilityDefinition = z.infer<typeof ToolCapabilityDefinitionSchema>;
export type CapabilityOutcomeCategory = typeof CAPABILITY_OUTCOME_CATEGORIES[number];
export type CapabilityRecommendationMode = typeof CAPABILITY_RECOMMENDATION_MODES[number];

export function defineToolCapability(input: ToolCapabilityDefinition): ToolCapabilityDefinition {
  return ToolCapabilityDefinitionSchema.parse(input);
}
