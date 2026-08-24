import type { IntelligenceConsumerDefinition } from './intelligenceConsumerRegistry.contract';
import { reconcileRadarCompoundInsightsForProperty } from '../../modules/homeEventRadar/services/radarCompoundInsight.service';
import RiskAssessmentService from '../RiskAssessment.service';
import { generateForecast } from '../maintenancePrediction.service';
import { materializeRecommendationsForProperty } from '../../modules/personalization/application/materializeRecommendations.usecase';
import { getSnapshotsReferencingFact } from '../decisionPlatform/homeIntelligenceGraph';
import { markThreadsStaleByIds, listActiveDecisionThreadsForProperty } from '../decisionPlatform/decisionThreadService';
import { markCoverageAnalysisStale, markItemCoverageAnalysesStale } from '../coverageAnalysis.service';
import { refreshSaleReadinessForRecompute } from '../propertySaleCase.service';
import { generateDueHomeBriefings } from '../../homeBriefing/homeBriefing.service';

/**
 * Home Intelligence Functional Completeness FRD §15 Phase 2 work item 4 —
 * registers real consumers against the orchestrator built in the prior
 * slice (intelligenceRecompute.service.ts). §15's "initial high-value
 * consumers" list names 10: Home Actions, compound Radar, risk, coverage,
 * maintenance prediction, sale readiness, personalization, capability
 * suggestions, Recommendation Snapshots, and Home Briefing.
 *
 * A first pass registered 5 (compound Radar, risk, maintenance prediction,
 * personalization, Recommendation Snapshots) and deferred coverage, sale
 * readiness, and Home Briefing over a userId/role mismatch: a recompute
 * handler only receives `{propertyId, target}`, and each of those three's
 * obvious entry point required more (a real `userId`, a resolved
 * `saleCaseId`, a `HouseholdRole`). Further investigation found a correct
 * fit for each without inventing a fake actor:
 *
 * - **coverage**: uses `markCoverageAnalysisStale`/
 *   `markItemCoverageAnalysesStale` (coverageAnalysis.service.ts) — the
 *   same "mark stale, don't eagerly regenerate" pattern the
 *   `recommendation-snapshots` consumer already uses below. Both are
 *   `propertyId`-only and need no user context at all, so there's no
 *   userId question to resolve. This is coverage's OWN independent
 *   staleness system (still called from ~30 other sites directly — not
 *   migrated, just now also reachable through this pipeline).
 * - **sale readiness**: `PropertySaleCase.propertyId` is a unique key — a
 *   property has zero or one sale case, never multiple — so "no case" (or
 *   a `CLOSED`/`CANCELLED` one) is a real, expected no-op, not an error.
 *   `refreshSaleReadinessForRecompute` (propertySaleCase.service.ts) makes
 *   that check and, when applicable, syncs with role `'OWNER'` — the
 *   strict-superset visibility role (verified: `projectRecords`' `visibleWhere`
 *   only restricts for non-OWNER roles), the objectively correct choice
 *   for an unrestricted background refresh, not an arbitrary guess.
 * - **Home Briefing**: `generateDueHomeBriefings(propertyId)`
 *   (homeBriefing.service.ts) resolves the real homeowner internally (same
 *   safe property→homeownerProfile.userId pattern `RiskAssessmentService`
 *   already uses), skips disabled preferences without throwing, and is
 *   already invoked on a schedule by a real worker job
 *   (`apps/workers/src/jobs/homeBriefingDelivery.job.ts`) — its own
 *   time-window-bucketed `deliveryKey` already makes a repeat call within
 *   the same window a no-op, so triggering it from recompute doesn't risk
 *   a duplicate delivery, just an earlier one.
 *
 * The remaining 2 stay deferred, documented rather than faked:
 *
 * - **Home Actions**: `getHomeActionFeed()` (homeActions.service.ts) has no
 *   persisted output today — it's computed live from source records on
 *   every read. There is no cache to mark stale (HI-REC-006's premise), so
 *   a registered consumer here would be a no-op that exists only for
 *   ceremony. Revisit once/if a materialized feed cache exists.
 * - **capability suggestions**: `getCapabilitySuggestionsFromAuthorizedSources`
 *   requires `userId` and `surface`, and re-confirmed to have zero
 *   persisted output anywhere (every call in capabilityRecommendation
 *   .service.ts is a read) — nothing to mark stale even if the userId
 *   question were resolved.
 *
 * Every registered consumer below either needs no user context at all, or
 * resolves a real user via the property's own homeownerProfile — verified
 * by direct code read for each — so none of them repeat the
 * hardcoded-system-user anti-pattern that previously caused a real bug in
 * this codebase (Coverage/Guidance Advisor "homeowner profile not found").
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
    // PropertyRadarCompoundInsight.status is RadarCompoundInsightStatus
    // (active/resolved) — a resolution lifecycle, not a staleness concept.
    // No real "mark this insight stale" mechanism exists, so declaring
    // MARK_STALE here would be an unenforced claim (see intelligenceRecompute
    // .service.ts's onPermanentFailure requirement) — RETRY_ONLY is honest
    // about what actually happens on permanent failure today: nothing
    // beyond the retries already exhausted.
    failureBehavior: 'RETRY_ONLY',
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
    // RiskAssessmentReport has no status/staleness column at all — only
    // lastCalculatedAt. There is nothing to mark; RETRY_ONLY is the honest
    // declaration until/unless a real staleness field exists.
    failureBehavior: 'RETRY_ONLY',
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
    // MaintenancePrediction.status is PredictionStatus (PENDING/COMPLETED/
    // DISMISSED/OVERDUE) — the homeowner's disposition toward the
    // prediction, not a data-freshness flag; repurposing it to represent
    // "recompute failed" would misrepresent a real homeowner decision.
    // RETRY_ONLY is the honest declaration.
    failureBehavior: 'RETRY_ONLY',
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
    // PersonalizedRecommendation.status (ACTIVE/COMPLETED/DISMISSED/EXPIRED/
    // SUPPRESSED) is a homeowner/evaluator lifecycle, already fully owned by
    // materializeRecommendationsForProperty's own evaluation logic — there is
    // no separate "stale" state to flip on a failed recompute without
    // conflicting with that lifecycle. RETRY_ONLY is the honest declaration.
    failureBehavior: 'RETRY_ONLY',
    recompute: async ({ propertyId }) => {
      await materializeRecommendationsForProperty(propertyId, 'INTELLIGENCE_RECOMPUTE');
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
    recompute: async ({ propertyId }) => {
      await Promise.all([
        markCoverageAnalysisStale(propertyId),
        markItemCoverageAnalysesStale(propertyId),
      ]);
    },
    // recompute above already IS the mark-stale action, so this is a
    // best-effort second attempt at exactly the same real, idempotent DB
    // update — not a distinct fabricated mechanism. Meaningful when
    // recompute failed for a reason unrelated to the mark-stale calls
    // themselves (e.g. a transient timeout on the first Promise.all before
    // it settled).
    onPermanentFailure: async ({ propertyId }) => {
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
    // SaleReadinessItem.status (OPEN/...) is the checklist item's own
    // lifecycle, not a data-freshness flag — no real staleness mechanism to
    // invoke on permanent failure. RETRY_ONLY is the honest declaration.
    failureBehavior: 'RETRY_ONLY',
    recompute: async ({ propertyId }) => {
      await refreshSaleReadinessForRecompute(propertyId);
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
    failureBehavior: 'RETRY_ONLY',
    recompute: async ({ propertyId }) => {
      await generateDueHomeBriefings(propertyId);
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
    resolveTargets: async ({ propertyId, triggerType, triggerEntityType, triggerEntityId }) => {
      // HI-REC-003: MANUAL_REFRESH must execute every applicable consumer,
      // not just the ones an entity-specific query happens to match — a
      // manual refresh has no single "changed entity" to resolve against.
      // Every other trigger type keeps the real fact-reference containment
      // query (bounded to the one entity that actually changed).
      const threadIds = triggerType === 'MANUAL_REFRESH'
        ? new Set((await listActiveDecisionThreadsForProperty(propertyId, 500)).map((thread) => thread.id))
        : new Set(
            (await getSnapshotsReferencingFact(propertyId, triggerEntityType, triggerEntityId))
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
    // Same rationale as coverage's onPermanentFailure above: recompute
    // already IS the mark-stale action here, so this is a best-effort
    // second attempt at the same real, idempotent update.
    onPermanentFailure: async ({ target }) => {
      if (!target.targetId) return;
      await markThreadsStaleByIds([target.targetId], DEPENDENCY_CHANGED_STALE_REASON);
    },
  },
] as const;
