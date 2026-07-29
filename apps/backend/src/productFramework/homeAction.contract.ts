import { z } from 'zod';
import {
  RecommendationGovernanceSchema,
  type RecommendationSafetyTier,
} from './recommendationGovernance.contract';
import { RecommendationResponseContractSchema } from './recommendationResponse.contract';

export const HOME_ACTION_SOURCE_KINDS = [
  'GUIDANCE',
  'MAINTENANCE',
  'INCIDENT',
  'RECALL',
  'COVERAGE',
  'PERSONALIZATION',
  'PROJECT',
  'SYSTEM',
  'SAVINGS_BENEFITS',
] as const;

export const HOMEOWNER_JOBS = ['STAY_AHEAD', 'DECIDE', 'MAJOR_MOMENT'] as const;
export const HOME_ACTION_STATES = [
  'OPEN',
  'IN_PROGRESS',
  'SNOOZED',
  'COMPLETED',
  'DEFERRED',
  'DISMISSED',
  'SUPERSEDED',
] as const;
export const HOME_ACTION_PRIORITIES = ['NOW', 'SOON', 'PLAN', 'CONSIDER'] as const;
export const HOME_ACTION_FEEDBACK_CONTROLS = [
  'COMPLETE',
  'DEFER',
  'SNOOZE',
  'DISMISS',
  'ALREADY_DONE',
  'NOT_RELEVANT',
  'NO_MORTGAGE',
  'CORRECT_FACT',
  // ACKNOWLEDGE: for recommendations with no authoritative domain completion
  // adapter — records that the homeowner saw this without claiming the
  // underlying work was done. REMOVE_FROM_HOME: hides the action from Home
  // without asserting completion or irrelevance (e.g. it is now tracked
  // elsewhere, such as inside a project or guidance journey).
  'ACKNOWLEDGE',
  'REMOVE_FROM_HOME',
] as const;

export const HOME_ACTION_CTA_KINDS = [
  'START',
  'REVIEW',
  'SCHEDULE',
  'COMPARE',
  'UPLOAD',
  'SELECT_PROVIDER',
  'PURCHASE',
  'FINANCE',
  'ESCALATE',
  'CORRECT_FACT',
] as const;

/**
 * Canonical Home Action confidence is a 0..1 ratio. Some legacy producers
 * still expose a 0..100 percentage. Keep this normalization at the contract
 * boundary as a final safety net, in addition to normalizing in source
 * adapters, so one legacy producer cannot make the entire Home feed fail.
 */
export function normalizeHomeActionConfidenceScore(value: unknown): number | null {
  if (value == null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const ratio = numeric > 1 ? numeric / 100 : numeric;
  return Math.max(0, Math.min(1, ratio));
}

const ConfidenceRatioSchema = z.preprocess(
  (value) => typeof value === 'number' && Number.isFinite(value)
    ? normalizeHomeActionConfidenceScore(value)
    : value,
  z.number().min(0).max(1).nullable(),
);

const ActionLinkSchema = z.object({
  kind: z.enum(HOME_ACTION_CTA_KINDS),
  label: z.string().trim().min(1).max(120),
  href: z.string().trim().min(1).max(1000),
});

const EvidenceReferenceSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: z.enum(['PROPERTY_FACT', 'DOCUMENT', 'HOME_EVENT', 'USER_INPUT', 'EXTERNAL_SOURCE', 'SYSTEM_DERIVATION']),
  label: z.string().trim().min(1).max(240),
  source: z.string().trim().min(1).max(300),
  observedAt: z.string().datetime().nullable(),
  freshness: z.enum(['CURRENT', 'STALE', 'UNKNOWN']),
  confidence: ConfidenceRatioSchema,
});

const AssumptionSchema = z.object({
  key: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(240),
  value: z.string().trim().min(1).max(500),
  source: z.enum(['USER', 'PROPERTY_FACT', 'SYSTEM_DEFAULT', 'MARKET_DATA', 'UNKNOWN']),
  editable: z.boolean(),
});

const DecisionOptionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(240),
  summary: z.string().trim().min(1).max(1000),
  recommended: z.boolean(),
});

const TradeoffSchema = z.object({
  optionId: z.string().trim().min(1).max(120),
  dimension: z.enum(['COST', 'RISK', 'TIMING', 'EFFORT', 'COVERAGE', 'HOUSEHOLD_FIT', 'OTHER']),
  summary: z.string().trim().min(1).max(500),
});

export const HomeActionSchema = z.object({
  id: z.string().trim().min(1).max(160),
  propertyId: z.string().trim().min(1).max(120),
  lineageId: z.string().trim().min(1).max(160),
  source: z.object({
    kind: z.enum(HOME_ACTION_SOURCE_KINDS),
    entityId: z.string().trim().min(1).max(160),
    version: z.string().trim().min(1).max(80).nullable(),
  }),
  job: z.enum(HOMEOWNER_JOBS),
  state: z.enum(HOME_ACTION_STATES),
  priority: z.enum(HOME_ACTION_PRIORITIES),
  signal: z.string().trim().min(1).max(500),
  whyItMatters: z.string().trim().min(1).max(1200),
  recommendedAction: z.string().trim().min(1).max(1000),
  expectedOutcome: z.string().trim().min(1).max(1000),
  timing: z.object({
    dueAt: z.string().datetime().nullable(),
    windowStart: z.string().datetime().nullable(),
    windowEnd: z.string().datetime().nullable(),
    rationale: z.string().trim().min(1).max(600),
  }),
  evidence: z.array(EvidenceReferenceSchema).min(1).max(50),
  assumptions: z.array(AssumptionSchema).max(30),
  options: z.array(DecisionOptionSchema).max(20),
  tradeoffs: z.array(TradeoffSchema).max(50),
  confidence: z.object({
    score: ConfidenceRatioSchema,
    label: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    missing: z.array(z.string().trim().min(1).max(240)).max(30),
  }),
  recommendationResponse: RecommendationResponseContractSchema,
  governance: RecommendationGovernanceSchema,
  primaryCta: ActionLinkSchema,
  secondaryCtas: z.array(ActionLinkSchema).max(10),
  feedbackControls: z.array(z.enum(HOME_ACTION_FEEDBACK_CONTROLS)).min(1),
  relatedJourneyId: z.string().trim().min(1).max(120).nullable(),
  createdAt: z.string().datetime(),
  lastEvaluatedAt: z.string().datetime(),
}).superRefine((value, ctx) => {
  const tier: RecommendationSafetyTier = value.governance.safetyTier;
  const material = tier === 'MATERIAL_FINANCIAL' || tier === 'REGULATED_COVERAGE';

  if (material && value.assumptions.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['assumptions'],
      message: 'Material recommendations require at least one explicit assumption.',
    });
  }
  if (material && value.options.length < 2) {
    ctx.addIssue({
      code: 'custom',
      path: ['options'],
      message: 'Material recommendations require at least two realistic options.',
    });
  }
  if (material && value.tradeoffs.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['tradeoffs'],
      message: 'Material recommendations require explicit tradeoffs.',
    });
  }

  if (tier === 'SAFETY_EMERGENCY') {
    const hasEscalation = [value.primaryCta, ...value.secondaryCtas]
      .some((cta) => cta.kind === 'ESCALATE');
    if (!hasEscalation) {
      ctx.addIssue({
        code: 'custom',
        path: ['primaryCta'],
        message: 'Safety and emergency actions require an escalation CTA.',
      });
    }
  }

  const commercialCtaKinds = new Set(['SELECT_PROVIDER', 'PURCHASE', 'FINANCE']);
  const hasCommercialCta = [value.primaryCta, ...value.secondaryCtas]
    .some((cta) => commercialCtaKinds.has(cta.kind));
  if (hasCommercialCta && !value.governance.commercialDisclosure.involvesCommercialAction) {
    ctx.addIssue({
      code: 'custom',
      path: ['governance', 'commercialDisclosure', 'involvesCommercialAction'],
      message: 'Provider, purchase, and financing CTAs require a commercial disclosure.',
    });
  }

  const materialCtaKinds = new Set(['START', 'SCHEDULE', 'COMPARE', 'SELECT_PROVIDER', 'PURCHASE', 'FINANCE']);
  const hasMaterialCta = [value.primaryCta, ...value.secondaryCtas]
    .some((cta) => materialCtaKinds.has(cta.kind));
  if (!value.recommendationResponse.materialActionAllowed && hasMaterialCta) {
    ctx.addIssue({
      code: 'custom',
      path: ['primaryCta'],
      message: 'Degraded recommendations may expose only review, evidence, correction, or escalation actions.',
    });
  }
});

export type HomeAction = z.infer<typeof HomeActionSchema>;

export function parseHomeAction(input: unknown): HomeAction {
  return HomeActionSchema.parse(input);
}
