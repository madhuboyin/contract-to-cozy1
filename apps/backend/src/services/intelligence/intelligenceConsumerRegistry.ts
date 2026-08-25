import type { IntelligenceConsumerDefinition } from './intelligenceConsumerRegistry.contract';
import { prisma } from '../../lib/prisma';

/**
 * Phase 2's complete dependency registry. It covers canonical context,
 * orchestration and user-facing projections as well as the persisted
 * intelligence producers. Read-computed consumers still execute their real
 * read/materialization path so dependency failures are visible through the
 * durable currentness overlay instead of being silently presented as fresh.
 * Consumers that need a homeowner resolve the property's actual homeowner;
 * background work never substitutes a fabricated system actor.
 */

const DEPENDENCY_CHANGED_STALE_REASON = 'INTELLIGENCE_RECOMPUTE_DEPENDENCY_CHANGED';
const BROAD_CANONICAL_SOURCES = [
  'PROPERTY', 'PROPERTY_FACT', 'INVENTORY_ITEM', 'HOME_EVENT', 'DOCUMENT',
  'MAINTENANCE_RECORD', 'CLAIM_RECORD', 'PROJECT_RECORD',
  'OPERATIONAL_WORK_EVENT', 'OPERATIONAL_WORK_DUE', 'INTELLIGENCE_OBSERVATION',
  'DECISION_RECOMMENDATION_SNAPSHOT', 'DECISION_PREFERENCE_VALUE',
] as const;

async function homeownerForProperty(propertyId: string): Promise<string> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { homeownerProfile: { select: { userId: true } } },
  });
  const userId = property?.homeownerProfile?.userId;
  if (!userId) throw new Error(`No homeowner is available for property ${propertyId}.`);
  return userId;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new Error('Intelligence recompute aborted.');
}

async function propertyContextForRecompute(propertyId: string, userId: string) {
  const [{ getPropertyContext }, { PROPERTY_CONTEXT_SCOPES }] = await Promise.all([
    import('../../modules/propertyContext/application/getPropertyContext'),
    import('../../modules/propertyContext/domain/contracts'),
  ]);
  return getPropertyContext(propertyId, { userId }, { scopes: [...PROPERTY_CONTEXT_SCOPES] });
}

export const INTELLIGENCE_CONSUMER_REGISTRY: readonly IntelligenceConsumerDefinition[] = [
  {
    consumerKey: 'property-context', version: '1.0', resolutionMode: 'STATIC',
    relevantFactKeys: [], relevantSourceEntityTypes: BROAD_CANONICAL_SOURCES,
    outputOwner: 'Property Context aggregation/facades — validates the complete canonical context snapshot.',
    timeoutMs: 20_000, retryPolicy: { maxAttempts: 3, backoffMs: 30_000 }, failureBehavior: 'MARK_STALE',
    recompute: async ({ propertyId, signal }) => {
      const userId = await homeownerForProperty(propertyId); throwIfAborted(signal);
      await propertyContextForRecompute(propertyId, userId); throwIfAborted(signal);
    },
  },
  {
    consumerKey: 'home-actions', version: '1.0', resolutionMode: 'STATIC',
    relevantFactKeys: [], relevantSourceEntityTypes: BROAD_CANONICAL_SOURCES,
    outputOwner: 'getHomeActionFeed — live canonical Home Action materialization/read validation.',
    timeoutMs: 30_000, retryPolicy: { maxAttempts: 3, backoffMs: 60_000 }, failureBehavior: 'MARK_STALE',
    recompute: async ({ propertyId, signal }) => {
      const userId = await homeownerForProperty(propertyId); throwIfAborted(signal);
      const { getHomeActionFeed } = await import('../homeActions.service'); throwIfAborted(signal);
      await getHomeActionFeed(propertyId, userId); throwIfAborted(signal);
    },
  },
  {
    consumerKey: 'compound-radar',
    version: '1.0',
    resolutionMode: 'STATIC',
    relevantFactKeys: [],
    relevantSourceEntityTypes: ['HOME_EVENT', 'INTELLIGENCE_OBSERVATION'],
    outputOwner: 'reconcileRadarCompoundInsightsForProperty (modules/homeEventRadar/services/radarCompoundInsight.service.ts) — writes PropertyRadarCompoundInsight rows.',
    timeoutMs: 15_000,
    retryPolicy: { maxAttempts: 3, backoffMs: 60_000 },
    // Domain lifecycle status remains untouched; currentness is persisted in
    // IntelligenceConsumerCurrentness.
    failureBehavior: 'MARK_STALE',
    recompute: async ({ propertyId, signal }) => {
      throwIfAborted(signal);
      const { reconcileRadarCompoundInsightsForProperty } = await import('../../modules/homeEventRadar/services/radarCompoundInsight.service');
      throwIfAborted(signal);
      await reconcileRadarCompoundInsightsForProperty(propertyId);
      throwIfAborted(signal);
    },
  },
  {
    consumerKey: 'risk-assessment',
    version: '1.0',
    resolutionMode: 'STATIC',
    relevantFactKeys: [],
    relevantSourceEntityTypes: ['PROPERTY_FACT', 'CLAIM_RECORD', 'HOME_EVENT', 'MAINTENANCE_RECORD'],
    outputOwner: 'RiskAssessmentService.calculateAndSaveReport (services/RiskAssessment.service.ts) — writes RiskAssessmentReport.',
    timeoutMs: 30_000,
    retryPolicy: { maxAttempts: 3, backoffMs: 60_000 },
    // RiskAssessmentReport lifecycle remains untouched; the shared overlay
    // marks the output unavailable after a permanent failure.
    failureBehavior: 'MARK_UNAVAILABLE',
    recompute: async ({ propertyId, signal }) => {
      // actorUserId omitted deliberately: calculateAndSaveReport's own
      // requireApplicableContext already falls back to the property's
      // homeowner when no actor is supplied — verified by direct code
      // read, not a hardcoded system-user shortcut.
      throwIfAborted(signal);
      const { default: RiskAssessmentService } = await import('../RiskAssessment.service'); throwIfAborted(signal);
      await RiskAssessmentService.calculateAndSaveReport(propertyId); throwIfAborted(signal);
    },
  },
  {
    consumerKey: 'maintenance-prediction',
    version: '1.0',
    resolutionMode: 'STATIC',
    relevantFactKeys: [],
    relevantSourceEntityTypes: ['MAINTENANCE_RECORD', 'PROPERTY_FACT'],
    outputOwner: 'generateForecast (services/maintenancePrediction.service.ts) — writes MaintenancePrediction rows.',
    timeoutMs: 30_000,
    retryPolicy: { maxAttempts: 3, backoffMs: 60_000 },
    // Prediction disposition is not freshness; the shared overlay carries
    // freshness without corrupting homeowner workflow state.
    failureBehavior: 'MARK_STALE',
    recompute: async ({ propertyId, signal }) => {
      throwIfAborted(signal);
      const { generateForecast } = await import('../maintenancePrediction.service'); throwIfAborted(signal);
      await generateForecast(propertyId); throwIfAborted(signal);
    },
  },
  {
    consumerKey: 'personalization',
    version: '1.0',
    resolutionMode: 'STATIC',
    relevantFactKeys: [],
    relevantSourceEntityTypes: [
      'PROPERTY_FACT', 'HOME_EVENT', 'MAINTENANCE_RECORD', 'CLAIM_RECORD',
      'PROJECT_RECORD', 'OPERATIONAL_WORK_EVENT', 'OPERATIONAL_WORK_DUE',
    ],
    outputOwner: 'materializeRecommendationsForProperty (modules/personalization/application/materializeRecommendations.usecase.ts).',
    timeoutMs: 20_000,
    retryPolicy: { maxAttempts: 3, backoffMs: 60_000 },
    // Recommendation lifecycle remains independent; freshness is carried by
    // the shared currentness overlay.
    failureBehavior: 'MARK_STALE',
    recompute: async ({ propertyId, signal }) => {
      throwIfAborted(signal);
      const { materializeRecommendationsForProperty } = await import('../../modules/personalization/application/materializeRecommendations.usecase'); throwIfAborted(signal);
      await materializeRecommendationsForProperty(propertyId, 'INTELLIGENCE_RECOMPUTE'); throwIfAborted(signal);
    },
  },
  {
    consumerKey: 'coverage',
    version: '1.0',
    resolutionMode: 'STATIC',
    relevantFactKeys: [],
    relevantSourceEntityTypes: ['PROPERTY_FACT', 'CLAIM_RECORD', 'DOCUMENT'],
    outputOwner: 'markCoverageAnalysisStale + markItemCoverageAnalysesStale (services/coverageAnalysis.service.ts) — marks CoverageAnalysis rows STALE; does not eagerly regenerate.',
    timeoutMs: 10_000,
    retryPolicy: { maxAttempts: 3, backoffMs: 30_000 },
    failureBehavior: 'MARK_STALE',
    successCurrentnessStatus: 'STALE',
    recompute: async ({ propertyId, signal }) => {
      throwIfAborted(signal);
      const { markCoverageAnalysisStale, markItemCoverageAnalysesStale } = await import('../coverageAnalysis.service');
      throwIfAborted(signal);
      await Promise.all([
        markCoverageAnalysisStale(propertyId),
        markItemCoverageAnalysesStale(propertyId),
      ]);
      throwIfAborted(signal);
    },
    // recompute above already IS the mark-stale action, so this is a
    // best-effort second attempt at exactly the same real, idempotent DB
    // update — not a distinct fabricated mechanism. Meaningful when
    // recompute failed for a reason unrelated to the mark-stale calls
    // themselves (e.g. a transient timeout on the first Promise.all before
    // it settled).
    onPermanentFailure: async ({ propertyId }) => {
      const { markCoverageAnalysisStale, markItemCoverageAnalysesStale } = await import('../coverageAnalysis.service');
      await Promise.all([
        markCoverageAnalysisStale(propertyId),
        markItemCoverageAnalysesStale(propertyId),
      ]);
    },
  },
  {
    consumerKey: 'sale-readiness',
    version: '1.0',
    resolutionMode: 'STATIC',
    relevantFactKeys: [],
    relevantSourceEntityTypes: ['PROPERTY_FACT', 'HOME_EVENT', 'MAINTENANCE_RECORD', 'PROJECT_RECORD', 'DOCUMENT'],
    outputOwner: 'refreshSaleReadinessForRecompute (services/propertySaleCase.service.ts) — writes SaleReadinessItem rows. No-op for a property with no PropertySaleCase, or one that is CLOSED/CANCELLED.',
    timeoutMs: 20_000,
    retryPolicy: { maxAttempts: 3, backoffMs: 60_000 },
    // Checklist lifecycle remains independent from the shared freshness
    // overlay.
    failureBehavior: 'MARK_STALE',
    recompute: async ({ propertyId, signal }) => {
      throwIfAborted(signal);
      const { refreshSaleReadinessForRecompute } = await import('../propertySaleCase.service'); throwIfAborted(signal);
      await refreshSaleReadinessForRecompute(propertyId); throwIfAborted(signal);
    },
  },
  {
    consumerKey: 'ownership-cost-refinance', version: '1.0', resolutionMode: 'STATIC',
    relevantFactKeys: [],
    relevantSourceEntityTypes: ['PROPERTY', 'PROPERTY_FACT', 'DOCUMENT', 'CLAIM_RECORD', 'PROJECT_RECORD', 'MAINTENANCE_RECORD'],
    outputOwner: 'ownershipCostConsumerProjectionService + RefinanceRadarService — persisted financial projections.',
    timeoutMs: 45_000, retryPolicy: { maxAttempts: 3, backoffMs: 120_000 }, failureBehavior: 'MARK_UNAVAILABLE',
    recompute: async ({ propertyId, signal }) => {
      const userId = await homeownerForProperty(propertyId); throwIfAborted(signal);
      const context = await propertyContextForRecompute(propertyId, userId); throwIfAborted(signal);
      const [{ ownershipCostConsumerProjectionService }, { RefinanceRadarService }] = await Promise.all([
        import('../ownershipCosts/ownershipCostConsumerProjection.service'),
        import('../../refinanceRadar/refinanceRadar.service'),
      ]); throwIfAborted(signal);
      await Promise.all([
        ownershipCostConsumerProjectionService.getProjection({ propertyId, userId, lens: 'CASH_OUTFLOW', horizonYears: 5 }),
        new RefinanceRadarService().evaluateProperty(propertyId, context.contextVersion),
      ]);
      throwIfAborted(signal);
    },
  },
  {
    consumerKey: 'home-briefing',
    version: '1.0',
    resolutionMode: 'STATIC',
    relevantFactKeys: [],
    relevantSourceEntityTypes: ['PROPERTY_FACT', 'HOME_EVENT', 'MAINTENANCE_RECORD', 'CLAIM_RECORD', 'PROJECT_RECORD'],
    outputOwner: 'generateDueHomeBriefings (homeBriefing/homeBriefing.service.ts) — same function apps/workers/src/jobs/homeBriefingDelivery.job.ts already calls on a schedule; its deliveryKey dedup makes a repeat call within the same window a no-op.',
    timeoutMs: 20_000,
    retryPolicy: { maxAttempts: 2, backoffMs: 60_000 },
    failureBehavior: 'MARK_STALE',
    recompute: async ({ propertyId, signal }) => {
      throwIfAborted(signal);
      const { generateDueHomeBriefings } = await import('../../homeBriefing/homeBriefing.service'); throwIfAborted(signal);
      await generateDueHomeBriefings(propertyId); throwIfAborted(signal);
    },
  },
  {
    consumerKey: 'capability-suggestions', version: '1.0', resolutionMode: 'STATIC',
    relevantFactKeys: [], relevantSourceEntityTypes: BROAD_CANONICAL_SOURCES,
    outputOwner: 'getCapabilitySuggestions — capability readiness/suggestion projection.',
    timeoutMs: 30_000, retryPolicy: { maxAttempts: 3, backoffMs: 60_000 }, failureBehavior: 'MARK_STALE',
    recompute: async ({ propertyId, signal }) => {
      const userId = await homeownerForProperty(propertyId); throwIfAborted(signal);
      const { getCapabilitySuggestions } = await import('../capabilityRecommendation.service'); throwIfAborted(signal);
      await getCapabilitySuggestions({ propertyId, userId, surface: 'HOME', recordEligibility: false });
      throwIfAborted(signal);
    },
  },
  /**
   * DYNAMIC. Recommendation Snapshots are immutable by design (Phase 3A's
   * "Persist an immutable Recommendation Snapshot") — there is no generic
   * "regenerate this snapshot" operation today (recomputeStaleThread exists
   * but is hardcoded to the HVAC decision family; a universal
   * decision-family adapter is explicit, not-yet-built Phase 3A work).
   * "Recompute" for this consumer therefore means exactly what HI-REC-006
   * asks for at this layer — marking the owning Decision Thread's existing
   * output stale — not regenerating it. resolveTargets does the real
   * fact-reference intersection HI-REC-001 requires via
   * getSnapshotsReferencingFact's canonicalFactReferences containment
   * query, deduplicated to one target per distinct Decision Thread (a
   * thread, not the immutable snapshot itself, is the thing whose
   * "current" status actually changes).
   */
  {
    consumerKey: 'recommendation-snapshots',
    version: '1.0',
    resolutionMode: 'DYNAMIC',
    relevantFactKeys: [],
    relevantSourceEntityTypes: ['PROPERTY', 'PROPERTY_FACT', 'INVENTORY_ITEM', 'MAINTENANCE_RECORD', 'CLAIM_RECORD', 'DOCUMENT'],
    outputOwner: 'markThreadsStaleByIds (services/decisionPlatform/decisionThreadService.ts) — marks DecisionThread.contextStatus stale.',
    timeoutMs: 10_000,
    retryPolicy: { maxAttempts: 3, backoffMs: 30_000 },
    failureBehavior: 'MARK_STALE',
    successCurrentnessStatus: 'STALE',
    resolveTargets: async ({ propertyId, triggerType, triggerEntityType, triggerEntityId, changedReferences, cursor, pageSize }) => {
      // HI-REC-003: MANUAL_REFRESH must execute every applicable consumer,
      // not just the ones an entity-specific query happens to match — a
      // manual refresh has no single "changed entity" to resolve against.
      // Both branches use the resolver contract's cursor/pageSize; target
      // materialization follows every bounded page and deduplicates thread
      // keys across pages.
      if (triggerType === 'MANUAL_REFRESH') {
        const { listActiveDecisionThreadsPageForProperty } = await import('../decisionPlatform/decisionThreadService');
        const page = await listActiveDecisionThreadsPageForProperty(propertyId, { cursor, pageSize });
        return {
          targets: page.threads.map((thread) => ({
            targetKey: thread.id,
            targetType: 'DecisionThread',
            targetId: thread.id,
            targetVersion: null,
          })),
          nextCursor: page.nextCursor,
        };
      }
      const references = changedReferences.length > 0
        ? changedReferences
        : [{ entityType: triggerEntityType, entityId: triggerEntityId }];
      const separator = cursor?.indexOf(':') ?? -1;
      const referenceIndex = separator >= 0 ? Number(cursor!.slice(0, separator)) : 0;
      const snapshotCursor = separator >= 0 ? cursor!.slice(separator + 1) || null : cursor;
      const reference = references[referenceIndex];
      if (!reference) return { targets: [], nextCursor: null };
      const { getSnapshotsReferencingFactPage } = await import('../decisionPlatform/homeIntelligenceGraph');
      const page = await getSnapshotsReferencingFactPage(
        propertyId,
        reference.entityType,
        reference.entityId,
        { cursor: snapshotCursor, pageSize, fieldPath: reference.fieldPath },
      );
      const threadIds = new Set(
        page.snapshots
          .map((snapshot) => snapshot.decisionThreadId)
          .filter((id): id is string => Boolean(id)),
      );
      return {
        targets: [...threadIds].map((threadId) => ({
          targetKey: threadId,
          targetType: 'DecisionThread',
          targetId: threadId,
          targetVersion: null,
        })),
        nextCursor: page.nextCursor
          ? `${referenceIndex}:${page.nextCursor}`
          : referenceIndex + 1 < references.length ? `${referenceIndex + 1}:` : null,
      };
    },
    recompute: async ({ target, signal }) => {
      throwIfAborted(signal);
      if (!target.targetId) return;
      const { markThreadsStaleByIds } = await import('../decisionPlatform/decisionThreadService');
      throwIfAborted(signal);
      await markThreadsStaleByIds([target.targetId], DEPENDENCY_CHANGED_STALE_REASON);
      throwIfAborted(signal);
    },
    // Same rationale as coverage's onPermanentFailure above: recompute
    // already IS the mark-stale action here, so this is a best-effort
    // second attempt at the same real, idempotent update.
    onPermanentFailure: async ({ target }) => {
      if (!target.targetId) return;
      const { markThreadsStaleByIds } = await import('../decisionPlatform/decisionThreadService');
      await markThreadsStaleByIds([target.targetId], DEPENDENCY_CHANGED_STALE_REASON);
    },
  },
] as const;
