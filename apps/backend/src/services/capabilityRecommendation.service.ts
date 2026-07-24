import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import {
  PROPERTY_CONTEXT_SCOPES,
  getPropertyContext,
  type PropertyContextSnapshot,
} from '../modules/propertyContext';
import {
  applyCapabilityGovernancePolicy,
  applyCapabilitySuppressionPolicy,
  buildCapabilityRecommendationContext,
  buildCapabilitySuggestionResponse,
  canonicalCapabilityRegistry,
  evaluateCapabilityCandidateReadiness,
  matchCapabilityCandidates,
  rankCapabilityCandidates,
  type BuildCapabilityRecommendationContextInput,
  type CapabilityActionSourceMetadata,
  type CapabilityCompletionSource,
  type CapabilityExplicitSourceContext,
  type CapabilityJourneySource,
  type CapabilityLifecycleSummary,
  type CapabilityPersonalizationSource,
  type CapabilityProjectSource,
  type CapabilitySuggestionResponse,
  type CapabilitySuggestionSurface,
  type ToolCapabilityRegistry,
} from '../productFramework/capabilities';
import { RECOMMENDATION_SAFETY_TIERS } from '../productFramework/recommendationGovernance.contract';
import type { RankedHomeAction } from './homeActions.service';
import {
  createToolDiscoveryCapabilityAvailabilityAdapter,
} from './toolDiscoveryAvailability.service';
import { canonicalizeToolLifecycleId } from './analytics/toolLifecycle';
import { detectCoverageGaps } from './coverageGap.service';
import { visibleInventoryItemWhere } from './riskAssetApplicability';

const EVALUATOR_SCOPES = PROPERTY_CONTEXT_SCOPES.filter(
  (scope) => scope !== 'OPTIONAL_HOUSEHOLD',
);

export interface CapabilityRecommendationSourceBundle {
  propertyContext: PropertyContextSnapshot;
  actions: RankedHomeAction[];
  journeys: CapabilityJourneySource[];
  projects: CapabilityProjectSource[];
  personalizationRecommendations: CapabilityPersonalizationSource[];
  completions: CapabilityCompletionSource[];
  lifecycle: CapabilityLifecycleSummary[];
  readinessMetrics: NonNullable<
    BuildCapabilityRecommendationContextInput['readinessMetrics']
  >;
}

export interface CapabilityRecommendationDependencies {
  registry: ToolCapabilityRegistry;
  loadRequiredSources: (
    propertyId: string,
    userId: string,
  ) => Promise<Pick<CapabilityRecommendationSourceBundle, 'propertyContext' | 'actions'>>;
  loadJourneys: (propertyId: string) => Promise<CapabilityJourneySource[]>;
  loadProjects: (propertyId: string) => Promise<CapabilityProjectSource[]>;
  loadPersonalizationRecommendations: (
    propertyId: string,
  ) => Promise<CapabilityPersonalizationSource[]>;
  loadCompletions: (propertyId: string, userId: string) => Promise<CapabilityCompletionSource[]>;
  loadLifecycle: (propertyId: string, userId: string) => Promise<CapabilityLifecycleSummary[]>;
  loadReadinessMetrics: (
    propertyId: string,
    propertyContext: PropertyContextSnapshot,
  ) => Promise<CapabilityRecommendationSourceBundle['readinessMetrics']>;
  availableCapabilityIds: (
    userId: string,
    includeWorkflowOnly: boolean,
  ) => string[];
  now: () => Date;
}

function normalizedPath(href: string): string {
  return href.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function routeMatches(
  routeTemplate: string,
  href: string,
  propertyId: string,
): boolean {
  const route = routeTemplate.replace('[id]', encodeURIComponent(propertyId));
  const pattern = escapeRegExp(route).replace(
    /\\\[[a-zA-Z][a-zA-Z0-9]*\\\]/g,
    '[^/]+',
  );
  return new RegExp(`^${pattern}/?$`).test(normalizedPath(href));
}

function actionEntityType(
  action: RankedHomeAction,
): string | null {
  return {
    COVERAGE: 'INVENTORY_ITEM',
    PROJECT: 'PROJECT',
    INCIDENT: 'ISSUE',
    RECALL: 'INVENTORY_ITEM',
    MAINTENANCE: null,
    GUIDANCE: null,
    PERSONALIZATION: null,
    SYSTEM: null,
  }[action.source.kind];
}

export function buildCapabilityActionSourceMetadata(input: {
  actions: readonly RankedHomeAction[];
  registry: ToolCapabilityRegistry;
  propertyId: string;
}): CapabilityActionSourceMetadata[] {
  return input.actions.map((action) => {
    const hrefs = [action.primaryCta, ...action.secondaryCtas]
      .map((cta) => cta.href);
    const ctaCapabilities = input.registry.capabilities.filter((capability) =>
      [capability.destination.routeTemplate, ...capability.destination.routeAliases]
        .some((route) =>
          hrefs.some((href) => routeMatches(route, href, input.propertyId))));
    return {
      actionId: action.id,
      freshness: 'CURRENT',
      sourceEntityType: actionEntityType(action),
      ctaCapabilityIds: ctaCapabilities.map((capability) => capability.id),
      signalIntentFamilies: ctaCapabilities.flatMap(
        (capability) => capability.recommendation.triggerFamilies,
      ),
      recommendationDefinitionCodes: [],
      missingFactKeys: [],
    };
  });
}

async function loadDefaultJourneys(
  propertyId: string,
  registry: ToolCapabilityRegistry,
): Promise<CapabilityJourneySource[]> {
  const journeys = await prisma.guidanceJourney.findMany({
    where: { propertyId, status: { in: ['ACTIVE', 'NOT_STARTED'] } },
    select: {
      id: true,
      journeyTypeKey: true,
      decisionStage: true,
      inventoryItemId: true,
      updatedAt: true,
      primarySignal: {
        select: {
          signalIntentFamily: true,
          sourceEntityType: true,
          sourceEntityId: true,
          recommendedToolKey: true,
          lastObservedAt: true,
        },
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: 100,
  });
  return journeys.map((journey) => {
    const recommendedId = canonicalizeToolLifecycleId(
      journey.primarySignal?.recommendedToolKey,
    );
    const reviewedTrigger = recommendedId
      ? registry.getById(recommendedId)?.recommendation.triggerFamilies[0]
      : null;
    return {
      id: journey.id,
      kind: reviewedTrigger ?? journey.journeyTypeKey ?? 'GUIDANCE_JOURNEY',
      status: 'ACTIVE',
      stage: String(journey.decisionStage),
      sourceEntityType:
        journey.primarySignal?.sourceEntityType
        ?? (journey.inventoryItemId ? 'INVENTORY_ITEM' : 'JOURNEY'),
      sourceEntityId:
        journey.primarySignal?.sourceEntityId
        ?? journey.inventoryItemId
        ?? journey.id,
      signalIntentFamily:
        reviewedTrigger
        ?? (journey.primarySignal?.signalIntentFamily
          ? String(journey.primarySignal.signalIntentFamily)
          : null),
      observedAt:
        journey.primarySignal?.lastObservedAt?.toISOString()
        ?? journey.updatedAt.toISOString(),
    };
  });
}

async function loadDefaultProjects(
  propertyId: string,
): Promise<CapabilityProjectSource[]> {
  const projects = await prisma.projectRecord.findMany({
    where: {
      propertyId,
      status: { in: ['DRAFT', 'PLANNING', 'IN_PROGRESS', 'PAUSED', 'DISPUTED'] },
    },
    select: {
      id: true,
      projectType: true,
      status: true,
      updatedAt: true,
      guidanceJourneyId: true,
      milestones: {
        where: { status: { not: 'COMPLETE' } },
        select: { milestoneType: true },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        take: 1,
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: 100,
  });
  return projects.map((project) => {
    const milestoneKind = project.milestones[0]?.milestoneType
      ? String(project.milestones[0].milestoneType)
      : null;
    return {
      id: project.id,
      kind: String(project.projectType),
      status: project.status === 'DRAFT' ? 'PLANNING' : String(project.status),
      milestoneKind,
      signalIntentFamilies: [
        'ACTIVE_PROJECT_MOMENT',
        ...(project.status === 'IN_PROGRESS'
          ? ['PROJECT_EXECUTION_STARTED']
          : []),
        ...(milestoneKind === 'PERMIT_INSPECTION'
          ? ['PERMIT_RELEVANT_PROJECT']
          : []),
      ],
      sourceEntityType: 'PROJECT',
      sourceEntityId: project.id,
      observedAt: project.updatedAt.toISOString(),
    };
  });
}

async function loadDefaultPersonalizationRecommendations(
  propertyId: string,
): Promise<CapabilityPersonalizationSource[]> {
  const recommendations = await prisma.personalizedRecommendation.findMany({
    where: { propertyId, status: 'ACTIVE' },
    select: {
      id: true,
      status: true,
      ruleVersion: true,
      contentVersion: true,
      lastEvaluatedAt: true,
      definition: { select: { code: true } },
    },
    orderBy: [{ lastEvaluatedAt: 'desc' }, { id: 'asc' }],
    take: 100,
  });
  return recommendations.map((recommendation) => ({
    id: recommendation.id,
    definitionCode: recommendation.definition.code,
    status: recommendation.status,
    recommendationVersion:
      `${recommendation.ruleVersion}:${recommendation.contentVersion}`,
    lastEvaluatedAt: recommendation.lastEvaluatedAt.toISOString(),
  }));
}

function metadataValue(
  metadata: unknown,
  key: string,
): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[key];
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 160 ? normalized : null;
}

async function loadDefaultCompletions(
  propertyId: string,
  userId: string,
  registry: ToolCapabilityRegistry,
): Promise<CapabilityCompletionSource[]> {
  const events = await prisma.productAnalyticsEvent.findMany({
    where: {
      propertyId,
      userId,
      moduleKey: 'tool_discovery',
      eventName: 'TOOL_COMPLETED',
      featureKey: { in: registry.capabilities.map((capability) => capability.id) },
    },
    select: {
      id: true,
      featureKey: true,
      occurredAt: true,
      metadataJson: true,
    },
    orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
    distinct: ['featureKey'],
  });
  return events.flatMap((event): CapabilityCompletionSource[] => {
    const capability = event.featureKey
      ? registry.getById(event.featureKey)
      : undefined;
    if (!capability) return [];
    return [{
      id: event.id,
      capabilityId: capability.id,
      capabilityVersion: capability.version,
      completionSignal: capability.lifecycle.completionSignal,
      outputEntityType:
        metadataValue(event.metadataJson, 'outputEntityType')
        ?? capability.lifecycle.outputEntityTypes[0]
        ?? 'DOCUMENT',
      outputEntityId:
        metadataValue(event.metadataJson, 'outputEntityId')
        ?? metadataValue(event.metadataJson, 'outputKey'),
      verifiedAt: event.occurredAt.toISOString(),
    }];
  });
}

async function loadDefaultLifecycle(
  propertyId: string,
  userId: string,
  registry: ToolCapabilityRegistry,
  now: Date,
): Promise<CapabilityLifecycleSummary[]> {
  const capabilityIds = registry.capabilities.map((capability) => capability.id);
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [recentImpressions, latestCompletions] = await Promise.all([
    prisma.productAnalyticsEvent.groupBy({
      by: ['featureKey'],
      where: {
        propertyId,
        userId,
        moduleKey: 'tool_discovery',
        featureKey: { in: capabilityIds },
        eventName: 'TOOL_DISCOVERED',
        occurredAt: { gte: since },
      },
      _count: { _all: true },
      _max: { occurredAt: true },
    }),
    prisma.productAnalyticsEvent.findMany({
      where: {
        propertyId,
        userId,
        moduleKey: 'tool_discovery',
        featureKey: { in: capabilityIds },
        eventName: 'TOOL_COMPLETED',
      },
      select: { featureKey: true, occurredAt: true },
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      distinct: ['featureKey'],
    }),
  ]);
  const impressionByCapability = new Map(
    recentImpressions.flatMap((group) =>
      group.featureKey
        ? [[group.featureKey, {
            count: group._count._all,
            lastAt: group._max.occurredAt,
          }] as const]
        : []),
  );
  const completionByCapability = new Map(
    latestCompletions.flatMap((event) =>
      event.featureKey ? [[event.featureKey, event.occurredAt] as const] : []),
  );
  return [...new Set([
    ...impressionByCapability.keys(),
    ...completionByCapability.keys(),
  ])].sort().map((capabilityId) => {
    const impressions = impressionByCapability.get(capabilityId);
    return {
      capabilityId,
      impressionCount30Days: impressions?.count ?? 0,
      lastImpressionAt: impressions?.lastAt?.toISOString() ?? null,
      lastDismissedAt: null,
      lastCompletedAt:
        completionByCapability.get(capabilityId)?.toISOString() ?? null,
    };
  });
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

async function loadDefaultReadinessMetrics(
  propertyId: string,
  snapshot: PropertyContextSnapshot,
): Promise<CapabilityRecommendationSourceBundle['readinessMetrics']> {
  const [inventoryCount, gaps] = await Promise.all([
    prisma.inventoryItem.count({
      where: { propertyId, ...visibleInventoryItemWhere() },
    }),
    detectCoverageGaps(propertyId),
  ]);
  const stateKnown = snapshot.facts['location.state']?.state === 'KNOWN';
  return {
    trackedSystemCount:
      countFactValue(snapshot, 'inventory.items') ?? inventoryCount,
    coverageGapCount: gaps.length,
    jurisdictionStatus: stateKnown ? 'KNOWN' : 'UNKNOWN',
  };
}

function defaultDependencies(
  registry: ToolCapabilityRegistry = canonicalCapabilityRegistry,
): CapabilityRecommendationDependencies {
  const now = () => new Date();
  return {
    registry,
    loadRequiredSources: async (propertyId, userId) => {
      const { getHomeActionFeed } = await import('./homeActions.service');
      const [propertyContext, feed] = await Promise.all([
        getPropertyContext(
          propertyId,
          { userId },
          { scopes: [...EVALUATOR_SCOPES] },
        ),
        getHomeActionFeed(propertyId, userId),
      ]);
      return { propertyContext, actions: feed.actions };
    },
    loadJourneys: (propertyId) => loadDefaultJourneys(propertyId, registry),
    loadProjects: loadDefaultProjects,
    loadPersonalizationRecommendations: loadDefaultPersonalizationRecommendations,
    loadCompletions: (propertyId, userId) =>
      loadDefaultCompletions(propertyId, userId, registry),
    loadLifecycle: (propertyId, userId) =>
      loadDefaultLifecycle(propertyId, userId, registry, now()),
    loadReadinessMetrics: loadDefaultReadinessMetrics,
    availableCapabilityIds: (userId, includeWorkflowOnly) =>
      createToolDiscoveryCapabilityAvailabilityAdapter(registry)
        .listAvailable({ userId, includeWorkflowOnly })
        .map((capability) => capability.id),
    now,
  };
}

async function optionalSource<T>(
  label: string,
  propertyId: string,
  load: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    logger.warn(
      { err: error, propertyId, source: label },
      'Capability recommendation source failed closed',
    );
    return fallback;
  }
}

function sourceScoped<T extends {
  id: string;
  sourceActionId?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
}>(values: readonly T[], source: CapabilityExplicitSourceContext | null): T[] {
  if (!source) return [...values];
  return values.filter((value) =>
    value.id === source.id
    || (source.actionId && value.sourceActionId === source.actionId)
    || (
      source.entityId
      && value.sourceEntityId === source.entityId
      && (!source.entityType || value.sourceEntityType === source.entityType)
  ));
}

function conservativeLifecycleFallback(
  registry: ToolCapabilityRegistry,
): CapabilityLifecycleSummary[] {
  return registry.capabilities
    .filter((capability) => capability.recommendation.mode !== 'CATALOG_ONLY')
    .map((capability) => ({
      capabilityId: capability.id,
      impressionCount30Days:
        capability.recommendation.maxImpressionsPer30Days,
      lastImpressionAt: null,
      lastDismissedAt: null,
      lastCompletedAt: null,
    }));
}

export interface CapabilitySuggestionsInput {
  propertyId: string;
  userId: string;
  surface: CapabilitySuggestionSurface;
  limit?: number;
  sourceContext?: CapabilityExplicitSourceContext | null;
}

type AuthorizedCapabilitySources = Pick<
  CapabilityRecommendationSourceBundle,
  'propertyContext' | 'actions'
>;

async function evaluateCapabilitySuggestions(
  input: CapabilitySuggestionsInput,
  required: AuthorizedCapabilitySources,
  dependencies: CapabilityRecommendationDependencies,
): Promise<CapabilitySuggestionResponse> {
  const [journeys, projects, personalizationRecommendations, completions, lifecycle, readinessMetrics] =
    await Promise.all([
      optionalSource('journeys', input.propertyId, () =>
        dependencies.loadJourneys(input.propertyId), []),
      optionalSource('projects', input.propertyId, () =>
        dependencies.loadProjects(input.propertyId), []),
      optionalSource('personalization', input.propertyId, () =>
        dependencies.loadPersonalizationRecommendations(input.propertyId), []),
      optionalSource('completions', input.propertyId, () =>
        dependencies.loadCompletions(input.propertyId, input.userId), []),
      optionalSource('lifecycle', input.propertyId, () =>
        dependencies.loadLifecycle(input.propertyId, input.userId),
      conservativeLifecycleFallback(dependencies.registry)),
      optionalSource('readiness', input.propertyId, () =>
        dependencies.loadReadinessMetrics(
          input.propertyId,
          required.propertyContext,
        ), {
          trackedSystemCount: null,
          coverageGapCount: null,
          jurisdictionStatus: 'UNKNOWN' as const,
        }),
    ]);
  const sourceContext = input.sourceContext ?? null;
  const actions = sourceContext
    ? required.actions.filter((action) =>
        action.id === sourceContext.actionId
        || (
          sourceContext.kind === 'HOME_ACTION'
          && action.id === sourceContext.id
        )
        || (
          sourceContext.entityId
          && action.source.entityId === sourceContext.entityId
        )
        || (
          ['PROJECT', 'JOURNEY'].includes(sourceContext.kind)
          && action.source.entityId === sourceContext.id
        ))
    : required.actions;
  const availableCapabilityIds = dependencies.availableCapabilityIds(
    input.userId,
    input.surface === 'WORKFLOW',
  );
  const context = buildCapabilityRecommendationContext({
    propertyId: input.propertyId,
    propertyContext: required.propertyContext,
    actions,
    actionSourceMetadata: buildCapabilityActionSourceMetadata({
      actions,
      registry: dependencies.registry,
      propertyId: input.propertyId,
    }),
    journeys: sourceContext
      ? sourceContext.kind === 'JOURNEY'
        ? sourceScoped(journeys, sourceContext)
        : []
      : journeys,
    projects: sourceContext
      ? sourceContext.kind === 'PROJECT'
        ? sourceScoped(projects, sourceContext)
        : []
      : projects,
    personalizationRecommendations:
      sourceContext
        ? sourceContext.kind === 'PERSONALIZATION'
          ? sourceScoped(personalizationRecommendations, sourceContext)
          : []
        : personalizationRecommendations,
    completions: sourceContext
      ? sourceContext.kind === 'COMPLETION'
        ? sourceScoped(completions, sourceContext)
        : []
      : completions,
    lifecycle,
    readinessMetrics,
    availableCapabilityIds,
    availabilityPolicyVersion: 'tool-discovery-policy-v1',
    availabilityStatus: 'EVALUATED',
    governance: {
      canUseCapabilities: true,
      allowedSafetyTiers: [...RECOMMENDATION_SAFETY_TIERS],
      enforceApprovals: false,
      evidenceAccess: 'ALLOWED',
      contextFreshness: 'CURRENT',
    },
    sourceContext,
    surface: input.surface,
    limit: input.limit,
    generatedAt: dependencies.now().toISOString(),
  });
  const matchResult = matchCapabilityCandidates({
    registry: dependencies.registry,
    context,
  });
  const readinessResult = evaluateCapabilityCandidateReadiness({
    registry: dependencies.registry,
    context,
    matchResult,
  });
  const governanceResult = applyCapabilityGovernancePolicy({
    registry: dependencies.registry,
    context,
    readinessResult,
  });
  const suppressionResult = applyCapabilitySuppressionPolicy({
    registry: dependencies.registry,
    context,
    governanceResult,
  });
  const rankingResult = rankCapabilityCandidates({
    registry: dependencies.registry,
    context,
    suppressionResult,
  });
  return buildCapabilitySuggestionResponse({
    registry: dependencies.registry,
    context,
    rankingResult,
  });
}

export async function getCapabilitySuggestions(
  input: CapabilitySuggestionsInput,
  dependencies: CapabilityRecommendationDependencies = defaultDependencies(),
): Promise<CapabilitySuggestionResponse> {
  const required = await dependencies.loadRequiredSources(
    input.propertyId,
    input.userId,
  );
  return evaluateCapabilitySuggestions(input, required, dependencies);
}

/**
 * Evaluates suggestions from sources already loaded inside an authorized
 * parent response. This keeps Unified Home actions and Property Context on the
 * exact same snapshot instead of reloading them through the standalone API.
 */
export async function getCapabilitySuggestionsFromAuthorizedSources(
  input: CapabilitySuggestionsInput & AuthorizedCapabilitySources,
  dependencies: CapabilityRecommendationDependencies = defaultDependencies(),
): Promise<CapabilitySuggestionResponse> {
  return evaluateCapabilitySuggestions(
    input,
    {
      propertyContext: input.propertyContext,
      actions: input.actions,
    },
    dependencies,
  );
}
