import { z } from 'zod';
import {
  CapabilityRecommendationContextSchema,
  type CapabilityRecommendationContext,
} from './capabilityRecommendationContext';
import {
  CapabilityReadyCandidateSchema,
  CapabilityReadinessResultSchema,
  type CapabilityReadinessResult,
  type CapabilityReadyCandidate,
} from './capabilityReadinessEvaluator';
import type { ToolCapabilityRegistry } from './capabilityRegistry';

export const CAPABILITY_POLICY_DECISIONS = [
  'PROMOTABLE',
  'WITHHELD',
  'BLOCKED',
] as const;

export const CAPABILITY_POLICY_REASON_CODES = [
  'READINESS_UNAVAILABLE',
  'RELEASE_POLICY_UNAVAILABLE',
  'CAPABILITY_NOT_AVAILABLE',
  'CAPABILITY_PERMISSION_DENIED',
  'SAFETY_TIER_NOT_PERMITTED',
  'GOVERNANCE_APPROVAL_MISSING',
  'CONTEXT_STALE',
  'CONTEXT_FRESHNESS_UNKNOWN',
  'SOURCE_RESPONSE_LOW_CONFIDENCE',
  'SOURCE_RESPONSE_DATA_UNAVAILABLE',
  'SOURCE_RESPONSE_UPSTREAM_FAILURE',
  'SOURCE_MATERIAL_ACTION_WITHHELD',
  'EVIDENCE_ACCESS_RESTRICTED',
] as const;

const CapabilityPolicySchema = z.object({
  decision: z.enum(CAPABILITY_POLICY_DECISIONS),
  reasonCodes: z.array(z.enum(CAPABILITY_POLICY_REASON_CODES)),
  ctaAllowed: z.boolean(),
  evidenceMode: z.enum(['STRUCTURED_ONLY', 'OMIT']),
  policyVersion: z.string().trim().min(1).max(160).nullable(),
});

export const GovernedCapabilityCandidateSchema =
  CapabilityReadyCandidateSchema.extend({
    policy: CapabilityPolicySchema,
  });

export const CapabilityGovernanceResultSchema = z.object({
  registryVersion: z.string().trim().min(1).max(160),
  contextVersion: z.string().trim().min(1).max(160),
  candidates: z.array(GovernedCapabilityCandidateSchema),
  diagnostics: z.object({
    promotableCount: z.number().int().nonnegative(),
    withheldCount: z.number().int().nonnegative(),
    blockedCount: z.number().int().nonnegative(),
  }),
});

export type CapabilityPolicyDecision =
  typeof CAPABILITY_POLICY_DECISIONS[number];
export type GovernedCapabilityCandidate =
  z.infer<typeof GovernedCapabilityCandidateSchema>;
export type CapabilityGovernanceResult =
  z.infer<typeof CapabilityGovernanceResultSchema>;

function sourceAction(
  candidate: CapabilityReadyCandidate,
  context: CapabilityRecommendationContext,
) {
  if (candidate.source.kind !== 'HOME_ACTION') return null;
  return context.actions.find((action) => action.id === candidate.source.actionId)
    ?? null;
}

function policyFor(
  candidate: CapabilityReadyCandidate,
  context: CapabilityRecommendationContext,
): z.infer<typeof CapabilityPolicySchema> {
  const blockReasons: Array<
    typeof CAPABILITY_POLICY_REASON_CODES[number]
  > = [];
  const withholdReasons: Array<
    typeof CAPABILITY_POLICY_REASON_CODES[number]
  > = [];
  const evidenceReasons: Array<
    typeof CAPABILITY_POLICY_REASON_CODES[number]
  > = [];
  const governance = context.governance;
  const availability = context.availability;
  const action = sourceAction(candidate, context);

  if (candidate.readiness.state === 'UNAVAILABLE') {
    blockReasons.push('READINESS_UNAVAILABLE');
  }
  if (availability.status !== 'EVALUATED') {
    blockReasons.push('RELEASE_POLICY_UNAVAILABLE');
  } else if (!availability.availableCapabilityIds.includes(candidate.capabilityId)) {
    blockReasons.push('CAPABILITY_NOT_AVAILABLE');
  }
  if (!governance.canUseCapabilities) {
    blockReasons.push('CAPABILITY_PERMISSION_DENIED');
  }
  if (!governance.allowedSafetyTiers.includes(candidate.safetyTier)) {
    blockReasons.push('SAFETY_TIER_NOT_PERMITTED');
  }
  if (
    governance.enforceApprovals
    && !governance.approvedCapabilityIds.includes(candidate.capabilityId)
  ) {
    blockReasons.push('GOVERNANCE_APPROVAL_MISSING');
  }
  if (governance.contextFreshness === 'STALE') {
    blockReasons.push('CONTEXT_STALE');
  }
  if (governance.contextFreshness === 'UNKNOWN') {
    blockReasons.push('CONTEXT_FRESHNESS_UNKNOWN');
  }

  if (action?.recommendationStatus === 'LOW_CONFIDENCE') {
    withholdReasons.push('SOURCE_RESPONSE_LOW_CONFIDENCE');
  }
  if (action?.recommendationStatus === 'DATA_UNAVAILABLE') {
    withholdReasons.push('SOURCE_RESPONSE_DATA_UNAVAILABLE');
  }
  if (action?.recommendationStatus === 'UPSTREAM_FAILURE') {
    withholdReasons.push('SOURCE_RESPONSE_UPSTREAM_FAILURE');
  }
  if (action && !action.materialActionAllowed) {
    withholdReasons.push('SOURCE_MATERIAL_ACTION_WITHHELD');
  }
  if (governance.evidenceAccess !== 'ALLOWED') {
    evidenceReasons.push('EVIDENCE_ACCESS_RESTRICTED');
  }

  const reasonCodes = [
    ...new Set([...blockReasons, ...withholdReasons, ...evidenceReasons]),
  ];
  const decision: CapabilityPolicyDecision = blockReasons.length > 0
    ? 'BLOCKED'
    : withholdReasons.length > 0
      ? 'WITHHELD'
      : 'PROMOTABLE';
  return CapabilityPolicySchema.parse({
    decision,
    reasonCodes,
    ctaAllowed: decision === 'PROMOTABLE',
    evidenceMode: (
      decision === 'PROMOTABLE'
      && governance.evidenceAccess === 'ALLOWED'
    ) ? 'STRUCTURED_ONLY' : 'OMIT',
    policyVersion: availability.policyVersion,
  });
}

export function applyCapabilityGovernancePolicy(input: {
  registry: ToolCapabilityRegistry;
  context: CapabilityRecommendationContext;
  readinessResult: CapabilityReadinessResult;
}): CapabilityGovernanceResult {
  const context = CapabilityRecommendationContextSchema.parse(input.context);
  const readinessResult = CapabilityReadinessResultSchema.parse(
    input.readinessResult,
  );
  if (readinessResult.registryVersion !== input.registry.version) {
    throw new Error('Capability readiness registry version does not match the governance registry.');
  }
  if (readinessResult.contextVersion !== context.contextVersion) {
    throw new Error('Capability readiness context version is stale.');
  }

  const candidates = readinessResult.candidates.map((candidate) => {
    const capability = input.registry.getById(candidate.capabilityId);
    if (!capability || capability.version !== candidate.manifestVersion) {
      throw new Error(`Capability governance manifest is stale: ${candidate.capabilityId}.`);
    }
    return {
      ...candidate,
      policy: policyFor(candidate, context),
    };
  });
  const count = (decision: CapabilityPolicyDecision) =>
    candidates.filter((candidate) => candidate.policy.decision === decision)
      .length;

  return CapabilityGovernanceResultSchema.parse({
    registryVersion: input.registry.version,
    contextVersion: context.contextVersion,
    candidates,
    diagnostics: {
      promotableCount: count('PROMOTABLE'),
      withheldCount: count('WITHHELD'),
      blockedCount: count('BLOCKED'),
    },
  });
}
