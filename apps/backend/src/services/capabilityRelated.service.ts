import { z } from 'zod';
import { prisma } from '../lib/prisma';
import {
  CAPABILITY_CONTEXT_TYPES,
  canonicalCapabilityRegistry,
  resolveRelatedCapabilities,
  type CapabilityReadinessState,
  type RelatedCapabilityResolverContext,
  type ToolCapabilityDefinition,
  type ToolCapabilityRegistry,
} from '../productFramework/capabilities';
import {
  PROPERTY_CONTEXT_SCOPES,
  getPropertyContext,
  type PropertyContextSnapshot,
} from '../modules/propertyContext';
import { RECOMMENDATION_SAFETY_TIERS } from '../productFramework/recommendationGovernance.contract';
import { detectCoverageGaps } from './coverageGap.service';
import { visibleInventoryItemWhere } from './riskAssetApplicability';
import { createToolDiscoveryCapabilityAvailabilityAdapter } from './toolDiscoveryAvailability.service';

const RELATED_RECOMMENDATION_VERSION = 'capability-related-v1' as const;
const RELATED_CONTEXT_SCOPES = PROPERTY_CONTEXT_SCOPES.filter(
  (scope) => scope !== 'OPTIONAL_HOUSEHOLD',
);

const RelatedCapabilityItemSchema = z.object({
  capabilityId: z.string().trim().min(1).max(120),
  manifestVersion: z.number().int().positive(),
  label: z.string().trim().min(1).max(120),
  shortDescription: z.string().trim().min(1).max(300),
  iconName: z.string().trim().min(1).max(120),
  href: z.string().trim().startsWith('/dashboard'),
  readiness: z.enum(['READY', 'NEEDS_CONTEXT']),
  reasonCode: z.enum([
    'EXPLICIT_RELATIONSHIP',
    'OUTPUT_COMPATIBLE',
    'SHARED_TRIGGER_FAMILY',
    'TAXONOMY_SIMILARITY',
  ]),
  score: z.number().int().nonnegative(),
});

export const RelatedCapabilitiesResponseSchema = z.object({
  registryVersion: z.string().trim().min(1).max(160),
  recommendationVersion: z.literal(RELATED_RECOMMENDATION_VERSION),
  contextVersion: z.string().trim().min(1).max(160),
  currentCapabilityId: z.string().trim().min(1).max(120),
  suggestions: z.array(RelatedCapabilityItemSchema).max(4),
});

export type RelatedCapabilitiesResponse =
  z.infer<typeof RelatedCapabilitiesResponseSchema>;

type ReadinessMetrics = {
  trackedSystemCount: number | null;
  coverageGapCount: number | null;
  jurisdictionStatus: 'KNOWN' | 'UNKNOWN' | 'UNSUPPORTED';
};

export interface CapabilityRelatedDependencies {
  registry: ToolCapabilityRegistry;
  loadPropertyContext: (
    propertyId: string,
    userId: string,
  ) => Promise<PropertyContextSnapshot>;
  loadReadinessMetrics: (
    propertyId: string,
    snapshot: PropertyContextSnapshot,
  ) => Promise<ReadinessMetrics>;
  availableCapabilityIds: (userId: string) => string[];
  loadRecentlyCompletedCapabilityIds: (
    propertyId: string,
    userId: string,
  ) => Promise<string[]>;
}

function knownFactCount(snapshot: PropertyContextSnapshot): number {
  return Object.values(snapshot.facts)
    .filter((fact) => fact.state === 'KNOWN').length;
}

function readinessFor(
  capability: ToolCapabilityDefinition,
  snapshot: PropertyContextSnapshot,
  metrics: ReadinessMetrics,
  contextTypes: ReadonlySet<string>,
): CapabilityReadinessState {
  let unavailable = !capability.destination.acceptedContext
    .some((contextType) => contextTypes.has(contextType));
  let unknown = false;
  const knownFacts = knownFactCount(snapshot);

  for (const requirement of capability.recommendation.readinessRequirements) {
    if (requirement.kind === 'PROPERTY') continue;
    if (requirement.kind === 'KNOWN_FACTS') {
      unknown ||= knownFacts < (requirement.minimum ?? 0);
    }
    if (requirement.kind === 'TRACKED_SYSTEMS') {
      unknown ||= (
        metrics.trackedSystemCount == null
        || metrics.trackedSystemCount < (requirement.minimum ?? 0)
      );
    }
    if (requirement.kind === 'COVERAGE_GAPS') {
      if (metrics.coverageGapCount == null) unknown = true;
      else unavailable ||= metrics.coverageGapCount < (requirement.minimum ?? 0);
    }
    if (requirement.kind === 'SOURCE_CONTEXT') {
      unknown ||= !contextTypes.has(requirement.contextType ?? '');
    }
    if (requirement.kind === 'JURISDICTION') {
      if (metrics.jurisdictionStatus === 'UNSUPPORTED') unavailable = true;
      else unknown ||= metrics.jurisdictionStatus !== 'KNOWN';
    }
  }

  if (unavailable) return 'UNAVAILABLE';
  if (!unknown) return 'READY';
  return (
    capability.recommendation.safePartialValue
    && capability.governance.safetyTier === 'LOW_CONSEQUENCE'
  ) ? 'NEEDS_CONTEXT' : 'UNAVAILABLE';
}

function countFactValue(snapshot: PropertyContextSnapshot, key: string): number | null {
  const fact = snapshot.facts[key];
  if (!fact || fact.state !== 'KNOWN') return null;
  if (typeof fact.value === 'number' && Number.isFinite(fact.value)) {
    return Math.max(0, Math.floor(fact.value));
  }
  if (Array.isArray(fact.value)) return fact.value.length;
  return null;
}

function resolveHref(
  capability: ToolCapabilityDefinition,
  propertyId: string,
): string | null {
  const href = capability.destination.routeTemplate
    .split('[id]')
    .join(encodeURIComponent(propertyId));
  return href.includes('[') ? null : href;
}

function reasonCode(
  signals: {
    explicit: boolean;
    outputToInput: boolean;
    sharedTriggerFamilies: string[];
  },
): RelatedCapabilitiesResponse['suggestions'][number]['reasonCode'] {
  if (signals.explicit) return 'EXPLICIT_RELATIONSHIP';
  if (signals.outputToInput) return 'OUTPUT_COMPATIBLE';
  if (signals.sharedTriggerFamilies.length > 0) return 'SHARED_TRIGGER_FAMILY';
  return 'TAXONOMY_SIMILARITY';
}

function defaultDependencies(): CapabilityRelatedDependencies {
  const registry = canonicalCapabilityRegistry;
  return {
    registry,
    loadPropertyContext: (propertyId, userId) => getPropertyContext(
      propertyId,
      { userId },
      { scopes: [...RELATED_CONTEXT_SCOPES] },
    ),
    loadReadinessMetrics: async (propertyId, snapshot) => {
      const [inventoryCount, gaps] = await Promise.all([
        prisma.inventoryItem.count({
          where: { propertyId, ...visibleInventoryItemWhere() },
        }),
        detectCoverageGaps(propertyId),
      ]);
      return {
        trackedSystemCount:
          countFactValue(snapshot, 'inventory.items') ?? inventoryCount,
        coverageGapCount: gaps.length,
        jurisdictionStatus:
          snapshot.facts['location.state']?.state === 'KNOWN'
            ? 'KNOWN'
            : 'UNKNOWN',
      };
    },
    availableCapabilityIds: (userId) =>
      createToolDiscoveryCapabilityAvailabilityAdapter(registry)
        .listAvailable({ userId, includeWorkflowOnly: true })
        .map((capability) => capability.id),
    loadRecentlyCompletedCapabilityIds: async (propertyId, userId) => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const events = await prisma.productAnalyticsEvent.findMany({
        where: {
          propertyId,
          userId,
          moduleKey: 'tool_discovery',
          eventName: 'TOOL_COMPLETED',
          occurredAt: { gte: since },
        },
        select: { featureKey: true },
        distinct: ['featureKey'],
      });
      return events.flatMap((event) => event.featureKey ? [event.featureKey] : []);
    },
  };
}

export async function getRelatedCapabilities(
  input: {
    propertyId: string;
    userId: string;
    currentCapabilityId: string;
    limit?: number;
    sourceEntityType?: typeof CAPABILITY_CONTEXT_TYPES[number] | null;
    workflowContextTypes?: readonly typeof CAPABILITY_CONTEXT_TYPES[number][];
  },
  dependencies: CapabilityRelatedDependencies = defaultDependencies(),
): Promise<RelatedCapabilitiesResponse> {
  const current = dependencies.registry.getById(input.currentCapabilityId);
  if (!current) {
    throw new Error(`Unknown current capability: ${input.currentCapabilityId}`);
  }
  const [snapshot, completedCapabilityIds] = await Promise.all([
    dependencies.loadPropertyContext(input.propertyId, input.userId),
    dependencies.loadRecentlyCompletedCapabilityIds(input.propertyId, input.userId),
  ]);
  const metrics = await dependencies.loadReadinessMetrics(
    input.propertyId,
    snapshot,
  );
  const contextTypes = new Set<string>([
    'PROPERTY',
    ...current.lifecycle.outputEntityTypes,
    ...(input.workflowContextTypes ?? []),
    ...(input.sourceEntityType ? [input.sourceEntityType] : []),
  ]);
  const readinessByCapabilityId = Object.fromEntries(
    dependencies.registry.capabilities.map((capability) => [
      capability.id,
      readinessFor(capability, snapshot, metrics, contextTypes),
    ]),
  );
  const resolverContext: RelatedCapabilityResolverContext = {
    availableCapabilityIds: dependencies.availableCapabilityIds(input.userId),
    readinessByCapabilityId,
    canUseCapabilities: true,
    allowedSafetyTiers: [...RECOMMENDATION_SAFETY_TIERS],
    enforceApprovals: false,
    approvedCapabilityIds: [],
    commercialActionsAllowed: false,
    workflowContextTypes: input.workflowContextTypes ?? [],
    sourceEntityType: input.sourceEntityType ?? null,
    suppressedCapabilityIds: completedCapabilityIds,
  };
  const resolution = resolveRelatedCapabilities({
    registry: dependencies.registry,
    currentCapabilityId: current.id,
    context: resolverContext,
    limit: input.limit,
  });
  const suggestions = resolution.suggestions.flatMap((suggestion) => {
    const capability = dependencies.registry.getById(suggestion.capabilityId);
    if (!capability) return [];
    const href = resolveHref(capability, input.propertyId);
    if (!href) return [];
    return [{
      capabilityId: capability.id,
      manifestVersion: capability.version,
      label: capability.presentation.label,
      shortDescription: capability.presentation.shortDescription,
      iconName: capability.presentation.iconName,
      href,
      readiness: suggestion.readiness,
      reasonCode: reasonCode(suggestion.signals),
      score: suggestion.score,
    }];
  });

  return RelatedCapabilitiesResponseSchema.parse({
    registryVersion: dependencies.registry.version,
    recommendationVersion: RELATED_RECOMMENDATION_VERSION,
    contextVersion: snapshot.contextVersion,
    currentCapabilityId: current.id,
    suggestions,
  });
}
