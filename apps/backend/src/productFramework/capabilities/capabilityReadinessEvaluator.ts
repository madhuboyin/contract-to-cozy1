import { z } from 'zod';
import {
  CAPABILITY_CONTEXT_TYPES,
  CAPABILITY_READINESS_REQUIREMENT_KINDS,
  type ToolCapabilityDefinition,
} from './capability.contract';
import {
  CapabilityCandidateMatchResultSchema,
  CapabilityCandidateSchema,
  type CapabilityCandidate,
  type CapabilityCandidateMatchResult,
} from './capabilityCandidateMatcher';
import {
  CapabilityRecommendationContextSchema,
  type CapabilityRecommendationContext,
} from './capabilityRecommendationContext';
import type { ToolCapabilityRegistry } from './capabilityRegistry';

export const CAPABILITY_READINESS_STATES = [
  'READY',
  'NEEDS_CONTEXT',
  'UNAVAILABLE',
] as const;

export const CAPABILITY_READINESS_RESULTS = ['TRUE', 'FALSE', 'UNKNOWN'] as const;

const ReadinessRequirementKindSchema = z.union([
  z.enum(CAPABILITY_READINESS_REQUIREMENT_KINDS),
  z.literal('ACCEPTED_CONTEXT'),
]);

const CapabilityReadinessCheckSchema = z.object({
  kind: ReadinessRequirementKindSchema,
  result: z.enum(CAPABILITY_READINESS_RESULTS),
  reasonCode: z.string().trim().min(1).max(160),
  explanation: z.string().trim().min(1).max(600),
  minimum: z.number().int().nonnegative().nullable(),
  observedCount: z.number().int().nonnegative().nullable(),
  contextType: z.enum(CAPABILITY_CONTEXT_TYPES).nullable(),
});

export const CapabilityReadinessSchema = z.object({
  state: z.enum(CAPABILITY_READINESS_STATES),
  safePartialValue: z.boolean(),
  reasonCodes: z.array(z.string().trim().min(1).max(160)),
  missingFactKeys: z.array(z.string().trim().min(1).max(160)),
  checks: z.array(CapabilityReadinessCheckSchema),
});

export const CapabilityReadyCandidateSchema = CapabilityCandidateSchema.extend({
  readiness: CapabilityReadinessSchema,
});

export const CapabilityReadinessResultSchema = z.object({
  registryVersion: z.string().trim().min(1).max(160),
  contextVersion: z.string().trim().min(1).max(160),
  candidates: z.array(CapabilityReadyCandidateSchema),
});

export type CapabilityReadinessState =
  typeof CAPABILITY_READINESS_STATES[number];
export type CapabilityReadiness = z.infer<typeof CapabilityReadinessSchema>;
export type CapabilityReadyCandidate =
  z.infer<typeof CapabilityReadyCandidateSchema>;
export type CapabilityReadinessResult =
  z.infer<typeof CapabilityReadinessResultSchema>;

type ReadinessCheck = z.infer<typeof CapabilityReadinessCheckSchema>;

function check(input: {
  kind: z.infer<typeof ReadinessRequirementKindSchema>;
  result: typeof CAPABILITY_READINESS_RESULTS[number];
  explanation: string;
  minimum?: number | null;
  observedCount?: number | null;
  contextType?: typeof CAPABILITY_CONTEXT_TYPES[number] | null;
}): ReadinessCheck {
  return {
    kind: input.kind,
    result: input.result,
    reasonCode: `${input.kind}_${input.result}`,
    explanation: input.explanation,
    minimum: input.minimum ?? null,
    observedCount: input.observedCount ?? null,
    contextType: input.contextType ?? null,
  };
}

function sourceContextTypes(
  candidate: CapabilityCandidate,
): Set<typeof CAPABILITY_CONTEXT_TYPES[number]> {
  const types = new Set<typeof CAPABILITY_CONTEXT_TYPES[number]>(['PROPERTY']);
  const sourceKind = candidate.source.kind;
  if (sourceKind === 'HOME_ACTION') types.add('HOME_ACTION');
  if (sourceKind === 'JOURNEY') types.add('JOURNEY');
  if (sourceKind === 'PROJECT') types.add('PROJECT');
  if (
    candidate.source.entityType
    && CAPABILITY_CONTEXT_TYPES.includes(
      candidate.source.entityType as typeof CAPABILITY_CONTEXT_TYPES[number],
    )
  ) {
    types.add(
      candidate.source.entityType as typeof CAPABILITY_CONTEXT_TYPES[number],
    );
  }
  return types;
}

function acceptedContextCheck(
  capability: ToolCapabilityDefinition,
  candidate: CapabilityCandidate,
): ReadinessCheck {
  const sourceTypes = sourceContextTypes(candidate);
  const accepted = capability.destination.acceptedContext.find(
    (contextType) => sourceTypes.has(contextType),
  );
  return check({
    kind: 'ACCEPTED_CONTEXT',
    result: accepted ? 'TRUE' : 'UNKNOWN',
    explanation: accepted
      ? `The source provides accepted ${accepted.toLowerCase().replace(/_/g, ' ')} context.`
      : 'Choose an accepted source context before using this capability.',
    contextType: accepted ?? capability.destination.acceptedContext[0] ?? null,
  });
}

function requirementChecks(input: {
  capability: ToolCapabilityDefinition;
  candidate: CapabilityCandidate;
  context: CapabilityRecommendationContext;
}): ReadinessCheck[] {
  const { capability, candidate, context } = input;
  const metrics = context.propertyContext.readinessMetrics;
  const sourceTypes = sourceContextTypes(candidate);
  const checks: ReadinessCheck[] = [
    acceptedContextCheck(capability, candidate),
  ];

  for (const requirement of capability.recommendation.readinessRequirements) {
    const minimum = requirement.minimum ?? 0;
    if (requirement.kind === 'PROPERTY') {
      checks.push(check({
        kind: requirement.kind,
        result: context.propertyId ? 'TRUE' : 'UNKNOWN',
        explanation: requirement.reason,
      }));
    }
    if (requirement.kind === 'KNOWN_FACTS') {
      const observed = context.propertyContext.knownFactCount;
      checks.push(check({
        kind: requirement.kind,
        result: observed >= minimum ? 'TRUE' : 'UNKNOWN',
        explanation: requirement.reason,
        minimum,
        observedCount: observed,
      }));
    }
    if (requirement.kind === 'TRACKED_SYSTEMS') {
      const observed = metrics.trackedSystemCount;
      checks.push(check({
        kind: requirement.kind,
        result: observed != null && observed >= minimum ? 'TRUE' : 'UNKNOWN',
        explanation: requirement.reason,
        minimum,
        observedCount: observed,
      }));
    }
    if (requirement.kind === 'COVERAGE_GAPS') {
      const observed = metrics.coverageGapCount;
      checks.push(check({
        kind: requirement.kind,
        result: observed == null
          ? 'UNKNOWN'
          : observed >= minimum
            ? 'TRUE'
            : 'FALSE',
        explanation: requirement.reason,
        minimum,
        observedCount: observed,
      }));
    }
    if (requirement.kind === 'SOURCE_CONTEXT') {
      const requiredType = requirement.contextType!;
      checks.push(check({
        kind: requirement.kind,
        result: sourceTypes.has(requiredType) ? 'TRUE' : 'UNKNOWN',
        explanation: requirement.reason,
        contextType: requiredType,
      }));
    }
    if (requirement.kind === 'JURISDICTION') {
      checks.push(check({
        kind: requirement.kind,
        result: metrics.jurisdictionStatus === 'KNOWN'
          ? 'TRUE'
          : metrics.jurisdictionStatus === 'UNSUPPORTED'
            ? 'FALSE'
            : 'UNKNOWN',
        explanation: requirement.reason,
      }));
    }
  }
  return checks;
}

function missingFactKeys(
  candidate: CapabilityCandidate,
  context: CapabilityRecommendationContext,
): string[] {
  if (candidate.source.kind !== 'HOME_ACTION') return [];
  return context.actions.find((action) => action.id === candidate.source.actionId)
    ?.missingFactKeys ?? [];
}

function readinessFor(input: {
  capability: ToolCapabilityDefinition;
  candidate: CapabilityCandidate;
  context: CapabilityRecommendationContext;
}): CapabilityReadiness {
  const checks = requirementChecks(input);
  const hasFalse = checks.some((item) => item.result === 'FALSE');
  const hasUnknown = checks.some((item) => item.result === 'UNKNOWN');
  const safePartialValue =
    input.capability.recommendation.safePartialValue
    && input.capability.governance.safetyTier === 'LOW_CONSEQUENCE';
  const state: CapabilityReadinessState = hasFalse
    ? 'UNAVAILABLE'
    : hasUnknown
      ? safePartialValue ? 'NEEDS_CONTEXT' : 'UNAVAILABLE'
      : 'READY';
  const reasonCodes = checks
    .filter((item) => item.result !== 'TRUE')
    .map((item) => item.reasonCode);
  return CapabilityReadinessSchema.parse({
    state,
    safePartialValue,
    reasonCodes: [...new Set(reasonCodes)],
    missingFactKeys: state === 'READY' ? [] : missingFactKeys(
      input.candidate,
      input.context,
    ),
    checks,
  });
}

export function evaluateCapabilityCandidateReadiness(input: {
  registry: ToolCapabilityRegistry;
  context: CapabilityRecommendationContext;
  matchResult: CapabilityCandidateMatchResult;
}): CapabilityReadinessResult {
  const context = CapabilityRecommendationContextSchema.parse(input.context);
  const matchResult = CapabilityCandidateMatchResultSchema.parse(
    input.matchResult,
  );
  if (matchResult.registryVersion !== input.registry.version) {
    throw new Error('Capability candidate registry version does not match the readiness registry.');
  }
  if (matchResult.contextVersion !== context.contextVersion) {
    throw new Error('Capability candidate context version is stale.');
  }

  const candidates = matchResult.candidates.map((candidate) => {
    const capability = input.registry.getById(candidate.capabilityId);
    if (!capability || capability.version !== candidate.manifestVersion) {
      throw new Error(`Capability candidate manifest is stale: ${candidate.capabilityId}.`);
    }
    return {
      ...candidate,
      readiness: readinessFor({ capability, candidate, context }),
    };
  });

  return CapabilityReadinessResultSchema.parse({
    registryVersion: input.registry.version,
    contextVersion: context.contextVersion,
    candidates,
  });
}
