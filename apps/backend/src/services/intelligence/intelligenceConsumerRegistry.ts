import type { IntelligenceConsumerDefinition } from './intelligenceConsumerRegistry.contract';
import { reconcileRadarCompoundInsightsForProperty } from '../../modules/homeEventRadar/services/radarCompoundInsight.service';
import RiskAssessmentService from '../RiskAssessment.service';
import { generateForecast } from '../maintenancePrediction.service';
import { materializeRecommendationsForProperty } from '../../modules/personalization/application/materializeRecommendations.usecase';
import { getSnapshotsReferencingFact } from '../decisionPlatform/homeIntelligenceGraph';
import { markThreadsStaleByIds } from '../decisionPlatform/decisionThreadService';

/**
 * Home Intelligence Functional Completeness FRD §15 Phase 2 work item 4 —
 * registers real consumers against the orchestrator built in the prior
 * slice (intelligenceRecompute.service.ts). §15's "initial high-value
 * consumers" list names 10: Home Actions, compound Radar, risk, coverage,
 * maintenance prediction, sale readiness, personalization, capability
 * suggestions, Recommendation Snapshots, and Home Briefing. This registry
 * populates 5 of those 10 for real, and documents — rather than fakes —
 * why the other 5 aren't registered yet:
 *
 * - **Home Actions**: `getHomeActionFeed()` (homeActions.service.ts) has no
 *   persisted output today — it's computed live from source records on
 *   every read. There is no cache to mark stale (HI-REC-006's premise), so
 *   a registered consumer here would be a no-op that exists only for
 *   ceremony. Revisit once/if a materialized feed cache exists.
 * - **coverage**: `CoverageIntelligenceService.run(propertyId, userId, ...)`
 *   requires a real `userId` for authorization/access, which a
 *   property-scoped background recompute handler (`{propertyId, target}`)
 *   doesn't have. Coverage also already has its own extensive, independent
 *   staleness system — `markCoverageAnalysisStale`/`markItemCoverageAnalysesStale`
 *   (coverageAnalysis.service.ts), called from ~30 sites across several
 *   controllers/services — so this isn't an uncovered gap today, just a
 *   parallel mechanism Phase 2 hasn't unified yet. Do not paper over the
 *   userId requirement with a hardcoded system user id — that exact
 *   anti-pattern already caused a real bug in this area (Coverage/Guidance
 *   Advisor "homeowner profile not found").
 * - **sale readiness**: `syncReadinessItems(saleCaseId, propertyId, role)`
 *   (propertySaleCase.service.ts) is not exported, requires a resolved
 *   `saleCaseId` (a property may have no active Sale Case at all) and a
 *   `HouseholdRole` a system-triggered recompute has no natural value for.
 * - **capability suggestions**: `getCapabilitySuggestionsFromAuthorizedSources`
 *   requires `userId` and `surface`, and has no persisted output — same
 *   userId mismatch as coverage, without even coverage's compensating
 *   parallel staleness system.
 * - **Home Briefing**: `generateHomeBriefing({propertyId, userId, now})`
 *   requires `userId` and is gated by a cadence window and delivery
 *   preference — regenerating/redelivering it off-cycle from a background
 *   recompute risks violating those delivery semantics, not just an
 *   authorization mismatch.
 *
 * All 5 registered below take (at most) an optional `actorUserId` with a
 * real system-triggered fallback already built into the function itself —
 * confirmed by direct code read, not assumed — so none of them repeat the
 * hardcoded-system-user anti-pattern above.
 */

const DEPENDENCY_CHANGED_STALE_REASON = 'INTELLIGENCE_RECOMPUTE_DEPENDENCY_CHANGED';

export const INTELLIGENCE_CONSUMER_REGISTRY: readonly IntelligenceConsumerDefinition[] = [
  {
    consumerKey: 'compound-radar',
    version: '1.0',
    resolutionMode: 'STATIC',
    relevantFactKeys: [],
    relevantSourceEntityTypes: ['HOME_EVENT', 'INTELLIGENCE_OBSERVATION'],
    outputOwner: 'reconcileRadarCompoundInsightsForProperty (modules/homeEventRadar/services/radarCompoundInsight.service.ts) — writes PropertyRadarCompoundInsight rows.',
    timeoutMs: 15_000,
    retryPolicy: { maxAttempts: 3, backoffMs: 60_000 },
    failureBehavior: 'MARK_STALE',
    recompute: async ({ propertyId }) => {
      await reconcileRadarCompoundInsightsForProperty(propertyId);
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
    failureBehavior: 'MARK_STALE',
    recompute: async ({ propertyId }) => {
      // actorUserId omitted deliberately: calculateAndSaveReport's own
      // requireApplicableContext already falls back to the property's
      // homeowner when no actor is supplied — verified by direct code
      // read, not a hardcoded system-user shortcut.
      await RiskAssessmentService.calculateAndSaveReport(propertyId);
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
    failureBehavior: 'MARK_STALE',
    recompute: async ({ propertyId }) => {
      await generateForecast(propertyId);
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
    failureBehavior: 'MARK_STALE',
    recompute: async ({ propertyId }) => {
      await materializeRecommendationsForProperty(propertyId, 'INTELLIGENCE_RECOMPUTE');
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
    relevantSourceEntityTypes: ['PROPERTY_FACT', 'MAINTENANCE_RECORD', 'CLAIM_RECORD'],
    outputOwner: 'markThreadsStaleByIds (services/decisionPlatform/decisionThreadService.ts) — marks DecisionThread.contextStatus stale.',
    timeoutMs: 10_000,
    retryPolicy: { maxAttempts: 3, backoffMs: 30_000 },
    failureBehavior: 'MARK_STALE',
    resolveTargets: async ({ propertyId, triggerEntityType, triggerEntityId }) => {
      const snapshots = await getSnapshotsReferencingFact(propertyId, triggerEntityType, triggerEntityId);
      const threadIds = new Set(
        snapshots
          .map((snapshot) => snapshot.decisionThreadId)
          .filter((id): id is string => Boolean(id)),
      );
      return [...threadIds].map((threadId) => ({
        targetKey: threadId,
        targetType: 'DecisionThread',
        targetId: threadId,
        targetVersion: null,
      }));
    },
    recompute: async ({ target }) => {
      if (!target.targetId) return;
      await markThreadsStaleByIds([target.targetId], DEPENDENCY_CHANGED_STALE_REASON);
    },
  },
] as const;
