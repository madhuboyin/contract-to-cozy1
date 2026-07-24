import { z } from 'zod';
import {
  CAPABILITY_CONTEXT_TYPES,
  type ToolCapabilityDefinition,
} from './capability.contract';
import {
  CAPABILITY_READINESS_STATES,
  type CapabilityReadinessState,
} from './capabilityReadinessEvaluator';
import type { ToolCapabilityRegistry } from './capabilityRegistry';

const DEFAULT_LIMIT = 3;
const ABSOLUTE_LIMIT = 4;

const RelationshipSignalsSchema = z.object({
  explicit: z.boolean(),
  outputToInput: z.boolean(),
  sharedTriggerFamilies: z.array(z.string().trim().min(1).max(160)),
  sharedPrimaryJob: z.boolean(),
  sourceEntityCompatible: z.boolean(),
  sameDestination: z.boolean(),
  sameOutcome: z.boolean(),
});

const RelatedCapabilitySuggestionSchema = z.object({
  capabilityId: z.string().trim().min(1).max(120),
  manifestVersion: z.number().int().positive(),
  score: z.number().int().nonnegative(),
  readiness: z.enum(CAPABILITY_READINESS_STATES),
  signals: RelationshipSignalsSchema,
});

export const RelatedCapabilityResolutionSchema = z.object({
  registryVersion: z.string().trim().min(1).max(160),
  currentCapabilityId: z.string().trim().min(1).max(120),
  suggestions: z.array(RelatedCapabilitySuggestionSchema).max(ABSOLUTE_LIMIT),
  diagnostics: z.object({
    evaluatedCount: z.number().int().nonnegative(),
    relatedCount: z.number().int().nonnegative(),
    unavailableCount: z.number().int().nonnegative(),
    unreadiedCount: z.number().int().nonnegative(),
    governanceBlockedCount: z.number().int().nonnegative(),
    workflowContextBlockedCount: z.number().int().nonnegative(),
    suppressedCount: z.number().int().nonnegative(),
  }),
});

export type RelatedCapabilitySuggestion =
  z.infer<typeof RelatedCapabilitySuggestionSchema>;
export type RelatedCapabilityResolution =
  z.infer<typeof RelatedCapabilityResolutionSchema>;

export type RelatedCapabilityResolverContext = {
  availableCapabilityIds: readonly string[];
  readinessByCapabilityId: Readonly<Record<string, CapabilityReadinessState>>;
  canUseCapabilities: boolean;
  allowedSafetyTiers: readonly ToolCapabilityDefinition['governance']['safetyTier'][];
  enforceApprovals: boolean;
  approvedCapabilityIds: readonly string[];
  commercialActionsAllowed: boolean;
  workflowContextTypes?: readonly typeof CAPABILITY_CONTEXT_TYPES[number][];
  sourceEntityType?: typeof CAPABILITY_CONTEXT_TYPES[number] | null;
  suppressedCapabilityIds?: readonly string[];
};

type ScoredSuggestion = RelatedCapabilitySuggestion & {
  explicitIndex: number;
};

function intersects(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function relationshipSignals(input: {
  current: ToolCapabilityDefinition;
  candidate: ToolCapabilityDefinition;
  sourceEntityType?: typeof CAPABILITY_CONTEXT_TYPES[number] | null;
}) {
  const { current, candidate, sourceEntityType } = input;
  const sharedTriggerFamilies = current.recommendation.triggerFamilies
    .filter((family) => candidate.recommendation.triggerFamilies.includes(family));
  return {
    explicit: current.recommendation.explicitRelatedCapabilityIds
      .includes(candidate.id),
    outputToInput: intersects(
      current.lifecycle.outputEntityTypes,
      candidate.destination.acceptedContext,
    ),
    sharedTriggerFamilies,
    sharedPrimaryJob:
      current.productFramework.primaryJob === candidate.productFramework.primaryJob,
    sourceEntityCompatible: Boolean(
      sourceEntityType
      && current.destination.acceptedContext.includes(sourceEntityType)
      && candidate.destination.acceptedContext.includes(sourceEntityType),
    ),
    sameDestination:
      current.productFramework.primaryDestination
      === candidate.productFramework.primaryDestination,
    sameOutcome:
      current.presentation.outcomeCategory === candidate.presentation.outcomeCategory,
  };
}

function relationshipScore(
  signals: z.infer<typeof RelationshipSignalsSchema>,
): number {
  return (
    (signals.explicit ? 5 : 0)
    + (signals.outputToInput ? 4 : 0)
    + (signals.sharedTriggerFamilies.length > 0 ? 3 : 0)
    + (signals.sharedPrimaryJob ? 3 : 0)
    + (signals.sourceEntityCompatible ? 2 : 0)
    + (signals.sameDestination ? 1 : 0)
    + (signals.sameOutcome ? 1 : 0)
  );
}

function governanceAllows(
  capability: ToolCapabilityDefinition,
  context: RelatedCapabilityResolverContext,
): boolean {
  if (!context.canUseCapabilities) return false;
  if (!context.allowedSafetyTiers.includes(capability.governance.safetyTier)) {
    return false;
  }
  if (
    context.enforceApprovals
    && !context.approvedCapabilityIds.includes(capability.id)
  ) {
    return false;
  }
  if (capability.governance.commercialAction && !context.commercialActionsAllowed) {
    return false;
  }
  return true;
}

function workflowContextAllows(
  capability: ToolCapabilityDefinition,
  context: RelatedCapabilityResolverContext,
): boolean {
  if (!capability.destination.workflowOnly) return true;
  return intersects(
    capability.destination.acceptedContext,
    context.workflowContextTypes ?? [],
  );
}

/**
 * Resolves bounded related capabilities solely from canonical manifest
 * relationships and caller-supplied, already-authorized eligibility state.
 */
export function resolveRelatedCapabilities(input: {
  registry: ToolCapabilityRegistry;
  currentCapabilityId: string;
  context: RelatedCapabilityResolverContext;
  limit?: number;
}): RelatedCapabilityResolution {
  const current = input.registry.getById(input.currentCapabilityId);
  if (!current) {
    throw new Error(`Unknown current capability: ${input.currentCapabilityId}`);
  }
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), ABSOLUTE_LIMIT);
  const available = new Set(input.context.availableCapabilityIds);
  const suppressed = new Set(input.context.suppressedCapabilityIds ?? []);
  const diagnostics = {
    evaluatedCount: 0,
    relatedCount: 0,
    unavailableCount: 0,
    unreadiedCount: 0,
    governanceBlockedCount: 0,
    workflowContextBlockedCount: 0,
    suppressedCount: 0,
  };
  const scored: ScoredSuggestion[] = [];

  for (const candidate of input.registry.capabilities) {
    if (candidate.id === current.id) continue;
    diagnostics.evaluatedCount += 1;
    if (!available.has(candidate.id)) {
      diagnostics.unavailableCount += 1;
      continue;
    }
    const readiness = input.context.readinessByCapabilityId[candidate.id];
    if (readiness !== 'READY' && readiness !== 'NEEDS_CONTEXT') {
      diagnostics.unreadiedCount += 1;
      continue;
    }
    if (!governanceAllows(candidate, input.context)) {
      diagnostics.governanceBlockedCount += 1;
      continue;
    }
    if (!workflowContextAllows(candidate, input.context)) {
      diagnostics.workflowContextBlockedCount += 1;
      continue;
    }
    if (suppressed.has(candidate.id)) {
      diagnostics.suppressedCount += 1;
      continue;
    }

    const signals = relationshipSignals({
      current,
      candidate,
      sourceEntityType: input.context.sourceEntityType,
    });
    const score = relationshipScore(signals);
    if (score === 0) continue;
    diagnostics.relatedCount += 1;
    scored.push({
      capabilityId: candidate.id,
      manifestVersion: candidate.version,
      score,
      readiness,
      signals,
      explicitIndex: current.recommendation.explicitRelatedCapabilityIds
        .indexOf(candidate.id),
    });
  }

  scored.sort((left, right) => {
    if (left.signals.explicit !== right.signals.explicit) {
      return left.signals.explicit ? -1 : 1;
    }
    if (left.signals.explicit && left.explicitIndex !== right.explicitIndex) {
      return left.explicitIndex - right.explicitIndex;
    }
    if (left.signals.outputToInput !== right.signals.outputToInput) {
      return left.signals.outputToInput ? -1 : 1;
    }
    if (right.score !== left.score) return right.score - left.score;
    return left.capabilityId.localeCompare(right.capabilityId);
  });

  return RelatedCapabilityResolutionSchema.parse({
    registryVersion: input.registry.version,
    currentCapabilityId: current.id,
    suggestions: scored.slice(0, limit).map(({ explicitIndex: _, ...item }) => item),
    diagnostics,
  });
}
