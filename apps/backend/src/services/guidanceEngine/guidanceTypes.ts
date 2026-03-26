import { APIError } from '../../middleware/error.middleware';
import { prisma } from '../../lib/prisma';

export const GUIDANCE_ISSUE_DOMAINS = [
  'SAFETY',
  'MAINTENANCE',
  'INSURANCE',
  'FINANCIAL',
  'COMPLIANCE',
  'MARKET_VALUE',
  'ASSET_LIFECYCLE',
  'CLAIMS',
  'PRICING',
  'NEGOTIATION',
  'BOOKING',
  'DOCUMENTATION',
  'NEIGHBORHOOD',
  'ONBOARDING',
  'WEATHER',
  'ENERGY',
  'OTHER',
] as const;

export const GUIDANCE_DECISION_STAGES = [
  'AWARENESS',
  'DIAGNOSIS',
  'DECISION',
  'EXECUTION',
  'VALIDATION',
  'TRACKING',
] as const;

export const GUIDANCE_EXECUTION_READINESS = [
  'NOT_READY',
  'NEEDS_CONTEXT',
  'READY',
  'TRACKING_ONLY',
  'UNKNOWN',
] as const;

export const GUIDANCE_SIGNAL_STATUS = ['ACTIVE', 'RESOLVED', 'SUPPRESSED', 'ARCHIVED'] as const;
export const GUIDANCE_JOURNEY_STATUS = ['ACTIVE', 'COMPLETED', 'ABORTED', 'ARCHIVED'] as const;
export const GUIDANCE_STEP_STATUS = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'BLOCKED'] as const;
export const GUIDANCE_SEVERITY = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN'] as const;
export const GUIDANCE_STEP_SKIP_POLICY = ['ALLOWED', 'DISCOURAGED', 'DISALLOWED'] as const;

export type GuidanceIssueDomain = (typeof GUIDANCE_ISSUE_DOMAINS)[number];
export type GuidanceDecisionStage = (typeof GUIDANCE_DECISION_STAGES)[number];
export type GuidanceExecutionReadiness = (typeof GUIDANCE_EXECUTION_READINESS)[number];
export type GuidanceSignalStatus = (typeof GUIDANCE_SIGNAL_STATUS)[number];
export type GuidanceJourneyStatus = (typeof GUIDANCE_JOURNEY_STATUS)[number];
export type GuidanceStepStatus = (typeof GUIDANCE_STEP_STATUS)[number];
export type GuidanceSeverity = (typeof GUIDANCE_SEVERITY)[number];
export type GuidanceStepSkipPolicy = (typeof GUIDANCE_STEP_SKIP_POLICY)[number];

export type GuidanceSignalSourceInput = {
  propertyId: string;
  homeAssetId?: string | null;
  inventoryItemId?: string | null;

  signalIntentFamily?: string | null;
  issueDomain?: GuidanceIssueDomain | null;
  decisionStage?: GuidanceDecisionStage | null;
  executionReadiness?: GuidanceExecutionReadiness | null;
  severity?: GuidanceSeverity | null;
  severityScore?: number | null;
  confidenceScore?: number | null;

  sourceType?: string | null;
  sourceFeatureKey?: string | null;
  sourceToolKey?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  sourceRunId?: string | null;
  sourceProvenanceId?: string | null;

  dedupeKey?: string | null;
  duplicateGroupKey?: string | null;
  actionWeaknessFlags?: string[] | null;
  contextPrerequisites?: string[] | null;
  missingContextKeys?: string[] | null;

  canonicalFirstStepKey?: string | null;
  recommendedToolKey?: string | null;
  recommendedFlowKey?: string | null;

  payloadJson?: Record<string, unknown> | null;
  metadataJson?: Record<string, unknown> | null;
};

export type NormalizedGuidanceSignalInput = {
  propertyId: string;
  homeAssetId: string | null;
  inventoryItemId: string | null;
  signalIntentFamily: string;
  issueDomain: GuidanceIssueDomain;
  decisionStage: GuidanceDecisionStage;
  executionReadiness: GuidanceExecutionReadiness;
  severity: GuidanceSeverity | null;
  severityScore: number | null;
  confidenceScore: number | null;

  sourceType: string | null;
  sourceFeatureKey: string | null;
  sourceToolKey: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  sourceRunId: string | null;
  sourceProvenanceId: string | null;

  dedupeKey: string;
  duplicateGroupKey: string;
  actionWeaknessFlags: string[];
  contextPrerequisites: string[];
  missingContextKeys: string[];

  canonicalFirstStepKey: string | null;
  recommendedToolKey: string | null;
  recommendedFlowKey: string | null;

  payloadJson: Record<string, unknown> | null;
  metadataJson: Record<string, unknown> | null;
};

export type GuidanceStepTemplate = {
  stepOrder: number;
  stepKey: string;
  stepType?: string;
  label: string;
  description?: string;
  decisionStage: GuidanceDecisionStage;
  executionReadiness: GuidanceExecutionReadiness;
  isRequired: boolean;
  toolKey?: string;
  // S6-39: flowKey removed — was stored for future sub-flow routing but never read.
  routePath?: string;
  requiredContextKeys?: string[];
  skipPolicy?: GuidanceStepSkipPolicy;
};

export type GuidanceJourneyTemplate = {
  journeyTypeKey: string;
  journeyKey: string;
  // S6-40: version string in semver format, e.g. "1.0.0". Stored as
  // "<journeyTypeKey>@<version>" on GuidanceJourney.templateVersion at creation.
  version: string;
  signalIntentFamilies: string[];
  issueDomain: GuidanceIssueDomain;
  defaultDecisionStage: GuidanceDecisionStage;
  defaultReadiness: GuidanceExecutionReadiness;
  canonicalFirstStepKey: string;
  steps: GuidanceStepTemplate[];
};

export type GuidanceToolCompletionInput = {
  propertyId: string;
  actorUserId?: string | null;
  journeyId?: string | null;
  signalIntentFamily?: string | null;
  issueDomain?: GuidanceIssueDomain | null;
  homeAssetId?: string | null;
  inventoryItemId?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  sourceToolKey: string;
  stepKey?: string | null;
  status: Extract<GuidanceStepStatus, 'COMPLETED' | 'SKIPPED' | 'BLOCKED' | 'IN_PROGRESS'>;
  producedData?: Record<string, unknown> | null;
  reasonCode?: string | null;
  reasonMessage?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type GuidanceNextStepResult = {
  journeyId: string;
  currentStep: any | null;
  nextStep: any | null;
  executionReadiness: GuidanceExecutionReadiness;
  missingPrerequisites: Array<{ stepKey: string; label: string }>;
  warnings: string[];
  blockedReason: string | null;
  recommendedToolKey: string | null;
  recommendedFlowKey: string | null;
};

export type GuidanceExecutionGuardRequest = {
  propertyId: string;
  targetAction: 'BOOKING' | 'CLAIM_ESCALATION' | 'INSPECTION_SCHEDULING' | 'PROVIDER_HANDOFF' | 'EXECUTION';
  journeyId?: string | null;
  inventoryItemId?: string | null;
  homeAssetId?: string | null;
};

export type GuidanceExecutionGuardResult = {
  blocked: boolean;
  targetAction: GuidanceExecutionGuardRequest['targetAction'];
  blockedReason: string | null;
  reasons: string[];
  missingPrerequisites: Array<{
    journeyId: string;
    journeyTypeKey: string | null;
    stepKey: string;
    stepLabel: string;
  }>;
  safeNextStep: {
    journeyId: string;
    journeyTypeKey: string | null;
    stepKey: string;
    stepLabel: string;
  } | null;
  evaluatedJourneyIds: string[];
};

export function getGuidanceModels() {
  const db = prisma as any;

  const guidanceSignal = db.guidanceSignal;
  const guidanceJourney = db.guidanceJourney;
  const guidanceJourneyStep = db.guidanceJourneyStep;
  const guidanceJourneyEvent = db.guidanceJourneyEvent;

  if (!guidanceSignal || !guidanceJourney || !guidanceJourneyStep || !guidanceJourneyEvent) {
    throw new APIError(
      'Guidance Engine models are unavailable. Apply Step 1 schema and run prisma generate.',
      500,
      'GUIDANCE_MODEL_UNAVAILABLE'
    );
  }

  return {
    guidanceSignal,
    guidanceJourney,
    guidanceJourneyStep,
    guidanceJourneyEvent,
  };
}

export function isTerminalStepStatus(status: GuidanceStepStatus): boolean {
  return status === 'COMPLETED' || status === 'SKIPPED';
}

export function isActionableStepStatus(status: GuidanceStepStatus): boolean {
  return status === 'PENDING' || status === 'IN_PROGRESS' || status === 'BLOCKED';
}

export function clampSeverityScore(value?: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function clampConfidenceToDecimal(value?: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  if (value > 1) {
    return Math.max(0, Math.min(1, value / 100));
  }
  return Math.max(0, Math.min(1, value));
}

export function decimalToNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object' && value && 'toNumber' in (value as Record<string, unknown>)) {
    try {
      const parsed = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}
