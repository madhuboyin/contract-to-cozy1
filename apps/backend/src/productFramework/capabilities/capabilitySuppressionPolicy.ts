import { z } from 'zod';
import {
  CapabilityRecommendationContextSchema,
  type CapabilityRecommendationContext,
} from './capabilityRecommendationContext';
import {
  CapabilityGovernanceResultSchema,
  GovernedCapabilityCandidateSchema,
  type CapabilityGovernanceResult,
  type GovernedCapabilityCandidate,
} from './capabilityGovernancePolicy';
import type { ToolCapabilityDefinition } from './capability.contract';
import type { ToolCapabilityRegistry } from './capabilityRegistry';

export const CAPABILITY_SUPPRESSION_REASON_CODES = [
  'SOURCE_ACTION_ALREADY_LAUNCHES_CAPABILITY',
  'SOURCE_ACTION_TERMINAL',
  'SOURCE_ACTION_STALE',
  'RECENTLY_DISMISSED',
  'FREQUENCY_CAP_REACHED',
  'COMPLETED_WITHOUT_RENEWED_RELEVANCE',
  'POLICY_BLOCKED',
  'POLICY_WITHHELD',
  'WORKFLOW_CONTEXT_REQUIRED',
  'EQUIVALENT_OUTCOME_DUPLICATE',
] as const;

const CapabilitySuppressionSchema = z.object({
  suppressed: z.boolean(),
  reasonCodes: z.array(z.enum(CAPABILITY_SUPPRESSION_REASON_CODES)),
});

export const SuppressedCapabilityCandidateSchema =
  GovernedCapabilityCandidateSchema.extend({
    suppression: CapabilitySuppressionSchema,
  });

export const CapabilitySuppressionResultSchema = z.object({
  registryVersion: z.string().trim().min(1).max(160),
  contextVersion: z.string().trim().min(1).max(160),
  candidates: z.array(SuppressedCapabilityCandidateSchema),
  diagnostics: z.object({
    retainedCount: z.number().int().nonnegative(),
    suppressedCount: z.number().int().nonnegative(),
  }),
});

export type CapabilitySuppressionReasonCode =
  typeof CAPABILITY_SUPPRESSION_REASON_CODES[number];
export type SuppressedCapabilityCandidate =
  z.infer<typeof SuppressedCapabilityCandidateSchema>;
export type CapabilitySuppressionResult =
  z.infer<typeof CapabilitySuppressionResultSchema>;

function sourceAction(
  candidate: GovernedCapabilityCandidate,
  context: CapabilityRecommendationContext,
) {
  if (!candidate.source.actionId) return null;
  return context.actions.find(
    (action) => action.id === candidate.source.actionId,
  ) ?? null;
}

function lifecycleFor(
  capabilityId: string,
  context: CapabilityRecommendationContext,
) {
  return context.lifecycle.find(
    (lifecycle) => lifecycle.capabilityId === capabilityId,
  ) ?? null;
}

function recentlyDismissed(input: {
  dismissedAt: string | null;
  generatedAt: string;
  cooldownDays: number;
}): boolean {
  if (!input.dismissedAt || input.cooldownDays <= 0) return false;
  const elapsedMs = Date.parse(input.generatedAt) - Date.parse(input.dismissedAt);
  return elapsedMs <= input.cooldownDays * 24 * 60 * 60 * 1000;
}

function hasRenewedRelevance(
  candidate: GovernedCapabilityCandidate,
  lastCompletedAt: string,
): boolean {
  return candidate.source.observedAt !== null
    && Date.parse(candidate.source.observedAt) > Date.parse(lastCompletedAt);
}

function baseSuppressionReasons(input: {
  capability: ToolCapabilityDefinition;
  candidate: GovernedCapabilityCandidate;
  context: CapabilityRecommendationContext;
}): CapabilitySuppressionReasonCode[] {
  const { capability, candidate, context } = input;
  const reasons: CapabilitySuppressionReasonCode[] = [];
  const action = sourceAction(candidate, context);
  const lifecycle = lifecycleFor(candidate.capabilityId, context);

  if (action?.ctaCapabilityIds.includes(candidate.capabilityId)) {
    reasons.push('SOURCE_ACTION_ALREADY_LAUNCHES_CAPABILITY');
  }
  if (
    action
    && ['COMPLETED', 'DISMISSED', 'SUPERSEDED'].includes(action.state)
  ) {
    reasons.push('SOURCE_ACTION_TERMINAL');
  }
  if (action && action.freshness !== 'CURRENT') {
    reasons.push('SOURCE_ACTION_STALE');
  }
  if (lifecycle && recentlyDismissed({
    dismissedAt: lifecycle.lastDismissedAt,
    generatedAt: context.generatedAt,
    cooldownDays: capability.recommendation.cooldownDaysAfterDismissal,
  })) {
    reasons.push('RECENTLY_DISMISSED');
  }
  if (
    lifecycle
    && lifecycle.impressionCount30Days
      >= capability.recommendation.maxImpressionsPer30Days
  ) {
    reasons.push('FREQUENCY_CAP_REACHED');
  }
  if (
    lifecycle?.lastCompletedAt
    && !hasRenewedRelevance(candidate, lifecycle.lastCompletedAt)
  ) {
    reasons.push('COMPLETED_WITHOUT_RENEWED_RELEVANCE');
  }
  if (candidate.policy.decision === 'BLOCKED') {
    reasons.push('POLICY_BLOCKED');
  }
  if (candidate.policy.decision === 'WITHHELD') {
    reasons.push('POLICY_WITHHELD');
  }
  if (capability.destination.workflowOnly && context.surface !== 'WORKFLOW') {
    reasons.push('WORKFLOW_CONTEXT_REQUIRED');
  }

  return [...new Set(reasons)];
}

function duplicatePreference(
  left: SuppressedCapabilityCandidate,
  right: SuppressedCapabilityCandidate,
): number {
  const readinessRank = (state: string) => (
    state === 'READY' ? 0 : state === 'NEEDS_CONTEXT' ? 1 : 2
  );
  return left.primaryMatch.precedence - right.primaryMatch.precedence
    || readinessRank(left.readiness.state) - readinessRank(right.readiness.state)
    || right.baseScore - left.baseScore
    || left.capabilityId.localeCompare(right.capabilityId);
}

/**
 * Applies auditable suppression after governance and before ranking. Suppressed
 * candidates remain in the result so diagnostics can explain why a capability
 * was not eligible without exposing those reasons in homeowner-facing copy.
 */
export function applyCapabilitySuppressionPolicy(input: {
  registry: ToolCapabilityRegistry;
  context: CapabilityRecommendationContext;
  governanceResult: CapabilityGovernanceResult;
}): CapabilitySuppressionResult {
  const context = CapabilityRecommendationContextSchema.parse(input.context);
  const governanceResult = CapabilityGovernanceResultSchema.parse(
    input.governanceResult,
  );
  if (governanceResult.registryVersion !== input.registry.version) {
    throw new Error('Capability governance registry version does not match the suppression registry.');
  }
  if (governanceResult.contextVersion !== context.contextVersion) {
    throw new Error('Capability governance context version is stale.');
  }

  const candidates = governanceResult.candidates.map((candidate) => {
    const capability = input.registry.getById(candidate.capabilityId);
    if (!capability || capability.version !== candidate.manifestVersion) {
      throw new Error(`Capability suppression manifest is stale: ${candidate.capabilityId}.`);
    }
    const reasonCodes = baseSuppressionReasons({
      capability,
      candidate,
      context,
    });
    return {
      ...candidate,
      suppression: {
        suppressed: reasonCodes.length > 0,
        reasonCodes,
      },
    };
  });

  const eligibleGroups = new Map<string, SuppressedCapabilityCandidate[]>();
  for (const candidate of candidates) {
    if (candidate.suppression.suppressed) continue;
    const key = [
      candidate.source.kind,
      candidate.source.id,
      candidate.outcomeCategory,
    ].join(':');
    const group = eligibleGroups.get(key) ?? [];
    group.push(candidate);
    eligibleGroups.set(key, group);
  }
  for (const group of eligibleGroups.values()) {
    if (group.length < 2) continue;
    const [, ...duplicates] = [...group].sort(duplicatePreference);
    for (const duplicate of duplicates) {
      duplicate.suppression.suppressed = true;
      duplicate.suppression.reasonCodes.push('EQUIVALENT_OUTCOME_DUPLICATE');
    }
  }

  const suppressedCount = candidates.filter(
    (candidate) => candidate.suppression.suppressed,
  ).length;
  return CapabilitySuppressionResultSchema.parse({
    registryVersion: input.registry.version,
    contextVersion: context.contextVersion,
    candidates,
    diagnostics: {
      retainedCount: candidates.length - suppressedCount,
      suppressedCount,
    },
  });
}
