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
  CAPABILITY_RECOMMENDATION_VERSION,
  CapabilitySuggestionResponseSchema,
  canonicalCapabilityRegistry,
  evaluateCapabilityCandidateReadiness,
  matchCapabilityCandidates,
  rankCapabilityCandidates,
  enrichProjectComplianceCapabilitySources,
  inspectionDocumentCapabilitySource,
  inspectionJourneyTrigger,
  inspectionReportCapabilitySource,
  projectTrackerSignalFamilies,
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
import {
  canonicalizeToolLifecycleId,
  recordToolLifecycleEvents,
  type ToolLifecycleEventInput,
} from './analytics/toolLifecycle';
import { detectCoverageGaps } from './coverageGap.service';
import { visibleInventoryItemWhere } from './riskAssetApplicability';
import { buildPropertyContextCapabilitySources } from '../productFramework/capabilities/propertyContextCapabilitySources';
import { APP_CONFIG } from '../config/appConfig';
import { loadApprovedCapabilityIds } from './capabilityGovernanceReview.service';
import { capabilityRecommendationsEnabled } from './capabilityPromotionPolicy.service';

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
  loadApprovedCapabilityIds?: () => Promise<string[]>;
  enforceApprovals?: boolean;
  now: () => Date;
  recordEligibility?: (input: {
    userId: string;
    propertyId: string;
    events: ToolLifecycleEventInput[];
  }) => Promise<unknown>;
  recommendationsEnabled?: () => boolean;
}

const LIFECYCLE_SURFACE_BY_RECOMMENDATION_SURFACE: Record<
  CapabilitySuggestionSurface,
  string
> = {
  HOME: 'unified_home',
  PROPERTY: 'property_detail',
  WORKFLOW: 'workflow',
  RELATED: 'workflow',
  COMPLETION: 'completion',
};

async function recordEligibleSuggestions(
  input: CapabilitySuggestionsInput,
  response: CapabilitySuggestionResponse,
  recorder: NonNullable<
    CapabilityRecommendationDependencies['recordEligibility']
  >,
): Promise<void> {
  if (response.suggestions.length === 0) return;
  try {
    await recorder({
      userId: input.userId,
      propertyId: input.propertyId,
      events: response.suggestions.map((suggestion) => ({
        toolId: suggestion.capabilityId,
        stage: 'ELIGIBLE',
        surface:
          LIFECYCLE_SURFACE_BY_RECOMMENDATION_SURFACE[response.surface],
        manifestVersion: suggestion.manifestVersion,
        registryVersion: response.registryVersion,
        recommendationReason: suggestion.reasonCode,
        reasonCode: suggestion.reasonCode,
        recommendationVersion: suggestion.recommendationVersion,
        contextVersion: suggestion.contextVersion,
        sourceKind: suggestion.source.kind,
        sourceId: suggestion.source.id,
        sourceActionId: suggestion.source.actionId,
        sourceEntityType: suggestion.source.entityType,
        sourceEntityId: suggestion.source.entityId,
        journeyId: suggestion.source.journeyId,
        readiness: suggestion.readiness.state,
      })),
    });
  } catch (error) {
    logger.warn('Capability eligibility analytics could not be recorded', {
      propertyId: input.propertyId,
      surface: input.surface,
      error,
    });
  }
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
    SAVINGS_BENEFITS: null,
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
    const reviewedInspectionTrigger = inspectionJourneyTrigger(
      journey.journeyTypeKey,
    );
    return {
      id: journey.id,
      kind:
        reviewedInspectionTrigger
        ?? reviewedTrigger
        ?? journey.journeyTypeKey
        ?? 'GUIDANCE_JOURNEY',
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
      signalIntentFamilies: projectTrackerSignalFamilies({ milestoneKind }),
      sourceEntityType: 'PROJECT',
      sourceEntityId: project.id,
      observedAt: project.updatedAt.toISOString(),
    };
  });
}

export function isRecommendationDefinitionOperational(
  definition: {
    status: string;
    pausedAt: Date | null;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
  },
  now: Date,
): boolean {
  return definition.status === 'ACTIVE'
    && definition.pausedAt === null
    && (
      definition.effectiveFrom === null
      || definition.effectiveFrom <= now
    )
    && (
      definition.effectiveTo === null
      || definition.effectiveTo >= now
    );
}

async function loadDefaultPersonalizationRecommendations(
  propertyId: string,
): Promise<CapabilityPersonalizationSource[]> {
  const now = new Date();
  const [recommendations, inspectionReport, inspectionDocument] = await Promise.all([
    prisma.personalizedRecommendation.findMany({
      where: { propertyId, status: 'ACTIVE' },
      select: {
        id: true,
        status: true,
        ruleVersion: true,
        contentVersion: true,
        lastEvaluatedAt: true,
        definition: {
          select: {
            code: true,
            status: true,
            pausedAt: true,
            effectiveFrom: true,
            effectiveTo: true,
          },
        },
      },
      orderBy: [{ lastEvaluatedAt: 'desc' }, { id: 'asc' }],
      take: 100,
    }),
    prisma.inspectionReport.findFirst({
      where: { propertyId, status: { in: ['PROCESSING', 'REVIEW_PENDING'] } },
      select: { id: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    }),
    prisma.document.findFirst({
      where: { propertyId, type: 'INSPECTION_REPORT' },
      select: { id: true, type: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    }),
  ]);
  const activeRecommendations = recommendations
    .filter((recommendation) =>
      isRecommendationDefinitionOperational(recommendation.definition, now))
    .map((recommendation) => ({
      id: recommendation.id,
      definitionCode: recommendation.definition.code,
      status: recommendation.status,
      recommendationVersion:
        `${recommendation.ruleVersion}:${recommendation.contentVersion}`,
      lastEvaluatedAt: recommendation.lastEvaluatedAt.toISOString(),
    }));
  const inspectionSource = inspectionReport
    ? inspectionReportCapabilitySource(inspectionReport)
    : inspectionDocument
      ? inspectionDocumentCapabilitySource(inspectionDocument)
      : null;
  return inspectionSource
    ? [...activeRecommendations, inspectionSource]
    : activeRecommendations;
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
      completionKind: capability.lifecycle.completionKind,
      completionSignal: capability.lifecycle.completionSignal,
      sourceActionId: metadataValue(event.metadataJson, 'sourceActionId'),
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

type CapabilityLifecycleAnalyticsEvent = {
  featureKey: string | null;
  eventName: string | null;
  occurredAt: Date;
  metadataJson: unknown;
};

function lifecycleMetadata(
  value: unknown,
): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalLifecycleString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null;
}

export function aggregateCapabilityLifecycleEvents(
  events: readonly CapabilityLifecycleAnalyticsEvent[],
): CapabilityLifecycleSummary[] {
  const byCapability = new Map<string, CapabilityLifecycleAnalyticsEvent[]>();
  for (const event of events) {
    if (!event.featureKey) continue;
    const group = byCapability.get(event.featureKey) ?? [];
    group.push(event);
    byCapability.set(event.featureKey, group);
  }

  return [...byCapability.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([capabilityId, capabilityEvents]) => {
      const chronological = [...capabilityEvents].sort(
        (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
      );
      const impressions = chronological.filter(
        (event) => event.eventName === 'TOOL_DISCOVERED',
      );
      const scopeMap = new Map<string, {
        sourceActionId: string | null;
        contextVersion: string | null;
        count: number;
        lastImpressionAt: Date;
      }>();
      for (const impression of impressions) {
        const metadata = lifecycleMetadata(impression.metadataJson);
        const sourceActionId = optionalLifecycleString(metadata, 'sourceActionId');
        const contextVersion = optionalLifecycleString(metadata, 'contextVersion');
        const key = `${sourceActionId ?? ''}\u0000${contextVersion ?? ''}`;
        const existing = scopeMap.get(key);
        scopeMap.set(key, {
          sourceActionId,
          contextVersion,
          count: (existing?.count ?? 0) + 1,
          lastImpressionAt: impression.occurredAt,
        });
      }
      const latest = (eventName: string) =>
        [...chronological].reverse().find(
          (event) => event.eventName === eventName,
        ) ?? null;
      const lastSnooze = latest('TOOL_SNOOZED');
      const lastNotRelevant = latest('TOOL_NOT_RELEVANT');
      const lastCompleted = latest('TOOL_COMPLETED');
      const lastNotRelevantMetadata = lifecycleMetadata(
        lastNotRelevant?.metadataJson,
      );
      const lastCompletedMetadata = lifecycleMetadata(
        lastCompleted?.metadataJson,
      );
      const snoozedUntil = lastSnooze
        ? optionalLifecycleString(
            lifecycleMetadata(lastSnooze.metadataJson),
            'snoozedUntil',
          )
        : null;

      return {
        capabilityId,
        impressionCount30Days: impressions.length,
        lastImpressionAt:
          impressions.at(-1)?.occurredAt.toISOString() ?? null,
        lastDismissedAt:
          latest('TOOL_DISMISSED')?.occurredAt.toISOString() ?? null,
        lastNotRelevantAt:
          lastNotRelevant?.occurredAt.toISOString() ?? null,
        lastNotRelevantSourceActionId:
          optionalLifecycleString(lastNotRelevantMetadata, 'sourceActionId'),
        lastNotRelevantSourceVersion:
          optionalLifecycleString(lastNotRelevantMetadata, 'sourceVersion'),
        lastNotRelevantContextVersion:
          optionalLifecycleString(lastNotRelevantMetadata, 'contextVersion'),
        snoozedUntil:
          snoozedUntil && Number.isFinite(Date.parse(snoozedUntil))
            ? new Date(snoozedUntil).toISOString()
            : null,
        lastCompletedAt:
          lastCompleted?.occurredAt.toISOString() ?? null,
        lastCompletedSourceActionId:
          optionalLifecycleString(lastCompletedMetadata, 'sourceActionId'),
        lastCompletedSourceVersion:
          optionalLifecycleString(lastCompletedMetadata, 'sourceVersion'),
        lastCompletedContextVersion:
          optionalLifecycleString(lastCompletedMetadata, 'contextVersion'),
        impressionScopes30Days: [...scopeMap.values()]
          .sort((left, right) =>
            (left.sourceActionId ?? '').localeCompare(right.sourceActionId ?? '')
            || (left.contextVersion ?? '').localeCompare(right.contextVersion ?? ''))
          .map((scope) => ({
            ...scope,
            lastImpressionAt: scope.lastImpressionAt.toISOString(),
          })),
      };
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
  const events = await prisma.productAnalyticsEvent.findMany({
    where: {
      propertyId,
      userId,
      moduleKey: 'tool_discovery',
      featureKey: { in: capabilityIds },
      OR: [
        {
          eventName: 'TOOL_DISCOVERED',
          occurredAt: { gte: since },
        },
        {
          eventName: {
            in: [
              'TOOL_DISMISSED',
              'TOOL_NOT_RELEVANT',
              'TOOL_SNOOZED',
              'TOOL_COMPLETED',
            ],
          },
        },
      ],
    },
    select: {
      featureKey: true,
      eventName: true,
      occurredAt: true,
      metadataJson: true,
    },
    orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
    take: 5_000,
  });
  return aggregateCapabilityLifecycleEvents(events);
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
    loadApprovedCapabilityIds: () => loadApprovedCapabilityIds(registry),
    enforceApprovals: APP_CONFIG.enforceHumanPolicyApprovals,
    now,
    recordEligibility: recordToolLifecycleEvents,
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
  outputEntityType?: string | null;
  outputEntityId?: string | null;
  completionKind?: string | null;
  completionSignal?: string | null;
}>(values: readonly T[], source: CapabilityExplicitSourceContext | null): T[] {
  if (!source) return [...values];
  return values.filter((value) => {
    const entityType = value.sourceEntityType ?? value.outputEntityType;
    const entityId = value.sourceEntityId ?? value.outputEntityId;
    return (
      (
        value.id === source.id
        || (source.actionId && value.sourceActionId === source.actionId)
        || (
          source.entityId
          && entityId === source.entityId
          && (!source.entityType || entityType === source.entityType)
        )
      )
      && (!source.eventType || value.completionKind === source.eventType)
    );
  });
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
  recordEligibility?: boolean;
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
  const contextualProjects = enrichProjectComplianceCapabilitySources(
    required.propertyContext,
    projects,
  );
  const contextualPersonalizationRecommendations = [
    ...personalizationRecommendations,
    ...buildPropertyContextCapabilitySources(required.propertyContext),
  ];
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
    ['WORKFLOW', 'COMPLETION'].includes(input.surface),
  );
  const enforceApprovals =
    dependencies.enforceApprovals ?? APP_CONFIG.enforceHumanPolicyApprovals;
  const approvedCapabilityIds = enforceApprovals
    ? await optionalSource(
        'capability-governance-reviews',
        input.propertyId,
        () => dependencies.loadApprovedCapabilityIds?.() ?? Promise.resolve([]),
        [],
      )
    : [];
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
        ? sourceScoped(contextualProjects, sourceContext)
        : []
      : contextualProjects,
    personalizationRecommendations:
      sourceContext
        ? sourceContext.kind === 'PERSONALIZATION'
          ? sourceScoped(contextualPersonalizationRecommendations, sourceContext)
          : []
        : contextualPersonalizationRecommendations,
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
      enforceApprovals,
      approvedCapabilityIds,
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
  const response = buildCapabilitySuggestionResponse({
    registry: dependencies.registry,
    context,
    rankingResult,
  });
  if (input.recordEligibility !== false && dependencies.recordEligibility) {
    await recordEligibleSuggestions(
      input,
      response,
      dependencies.recordEligibility,
    );
  }
  return response;
}

export async function getCapabilitySuggestions(
  input: CapabilitySuggestionsInput,
  dependencies: CapabilityRecommendationDependencies = defaultDependencies(),
): Promise<CapabilitySuggestionResponse> {
  if (!(dependencies.recommendationsEnabled ?? capabilityRecommendationsEnabled)()) {
    return CapabilitySuggestionResponseSchema.parse({
      contractVersion: 'capability-suggestions-v1',
      registryVersion: dependencies.registry.version,
      recommendationVersion: CAPABILITY_RECOMMENDATION_VERSION,
      contextVersion: 'catalog-only',
      generatedAt: dependencies.now().toISOString(),
      surface: input.surface,
      suggestions: [],
    });
  }
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
  if (!(dependencies.recommendationsEnabled ?? capabilityRecommendationsEnabled)()) {
    return CapabilitySuggestionResponseSchema.parse({
      contractVersion: 'capability-suggestions-v1',
      registryVersion: dependencies.registry.version,
      recommendationVersion: CAPABILITY_RECOMMENDATION_VERSION,
      contextVersion: input.propertyContext.contextVersion,
      generatedAt: dependencies.now().toISOString(),
      surface: input.surface,
      suggestions: [],
    });
  }
  return evaluateCapabilitySuggestions(
    input,
    {
      propertyContext: input.propertyContext,
      actions: input.actions,
    },
    dependencies,
  );
}
