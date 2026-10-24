// Running the canonical coverage analysis, with everything around it, in one place (continuation FRD section 34).
//
// The Desktop controller and Ask both run the persisted analysis (the property's, or one item's). The page ran the item gates and emitted the analytics; neither surface reported the journey's
// coverage `check_*` steps. Both now call this function, so the gates, the analytics and the journey proof cannot drift.
//
// The proof for a coverage check step is a FRESH, canonical, persisted evaluation scoped to the journey's subject: the analysis this function just saved, for the journey's item (or for the property when the
// journey has none), with its coverage status, confidence and evaluation time. Opening or reading a review, a transient answer, and a decision on a comparison are not proof.

import { CoverageIntelligenceService, type CoverageAnalysisOverrides, type ItemCoverageAnalysisOverrides } from './coverageAnalysis.service';
import { InventoryService } from './inventory.service';
import { evaluateFeatureContext } from '../modules/propertyContext/application/evaluateFeatureContext';
import { analyticsEmitter, AnalyticsEvent, AnalyticsFeature, AnalyticsModule } from './analytics';
import { APIError } from '../middleware/error.middleware';
import { logger } from '../lib/logger';
import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';
import { resolveGuidanceStepBinding, type GuidanceStepBindingResult } from './guidanceEngine/guidanceStepBinding';

const service = new CoverageIntelligenceService();
const inventoryService = new InventoryService();

export const COVERAGE_CHECK_TOOL_KEY = 'coverage-intelligence';
/** The coverage steps a fresh scoped evaluation proves. compare_coverage_options (a saved decision) and the review steps have their own proofs. */
export const COVERAGE_CHECK_STEP_KEYS = [
  'check_coverage', 'check_replacement_coverage', 'check_inspection_coverage', 'check_recall_coverage', 'check_weather_coverage', 'check_financial_coverage', 'check_inaction_coverage', 'check_compliance_coverage',
] as const;

export type CoverageAnalysisScope = { kind: 'PROPERTY' } | { kind: 'ITEM'; itemId: string };

/**
 * Which scope a journey step's evaluation must have: the journey's own item, or the property when it has none. The scope the caller asked for is never trusted: a journey about an item is
 * proved only by that item's analysis, and a property-level journey only by the property's.
 */
export function coverageScopeForBinding(binding: { inventoryItemId: string | null }): CoverageAnalysisScope {
  return binding.inventoryItemId ? { kind: 'ITEM', itemId: binding.inventoryItemId } : { kind: 'PROPERTY' };
}
const sameScope = (a: CoverageAnalysisScope, b: CoverageAnalysisScope) => a.kind === b.kind && (a.kind === 'PROPERTY' || (b.kind === 'ITEM' && a.itemId === b.itemId));

export async function resolveCoverageCheckBinding(propertyId: string, stepId: string, scope: CoverageAnalysisScope): Promise<GuidanceStepBindingResult> {
  const bound = await resolveGuidanceStepBinding(propertyId, stepId, { toolKey: COVERAGE_CHECK_TOOL_KEY, stepKeys: COVERAGE_CHECK_STEP_KEYS });
  if (!bound.ok) return bound;
  return sameScope(coverageScopeForBinding(bound.binding), scope) ? bound : { ok: false, reason: 'WRONG_SUBJECT' };
}

export type CoverageAnalysisRunResult = {
  analysis: any;
  scope: CoverageAnalysisScope;
  /** Whether the journey step was updated: null when no step was named, false when it did not fit or the report failed. */
  guidanceReported: boolean | null;
  guidanceRefusal: string | null;
};

export function buildCoverageEvaluationCompletion(propertyId: string, actorUserId: string, analysis: any, scope: CoverageAnalysisScope, target: { journeyId: string; stepKey: string; signalIntentFamily: string | null }) {
  const status = scope.kind === 'ITEM' ? analysis.scenarioState : analysis.insuranceReviewState;
  return {
    propertyId, actorUserId, journeyId: target.journeyId, inventoryItemId: scope.kind === 'ITEM' ? scope.itemId : null,
    signalIntentFamily: target.signalIntentFamily ?? 'coverage_gap', issueDomain: 'INSURANCE' as const,
    sourceToolKey: COVERAGE_CHECK_TOOL_KEY, sourceEntityType: scope.kind === 'ITEM' ? 'COVERAGE_ITEM_ANALYSIS' : 'COVERAGE_ANALYSIS', sourceEntityId: analysis.id,
    stepKey: target.stepKey, status: 'COMPLETED' as const,
    dedupeKey: `coverage-evaluation:${propertyId}:${analysis.id}:${target.stepKey}`,
    producedData: {
      proofType: 'coverage_evaluation', proofId: analysis.id, analysisId: analysis.id, scope: scope.kind, inventoryItemId: scope.kind === 'ITEM' ? scope.itemId : null,
      coverageStatus: status ?? null, analysisStatus: analysis.status ?? null, confidence: analysis.confidence ?? null, evaluatedAt: analysis.computedAt ?? null,
      // The source records the evaluation used are the persisted analysis' own inputs (its inputsSnapshot), referenced by the analysis id and the shared context it was built on.
      assumptionSetId: analysis.assumptionSetId ?? null, preferenceProfileId: analysis.preferenceProfileId ?? null,
    },
  };
}

export async function runCoverageAnalysisWithEffects(
  propertyId: string, userId: string, scope: CoverageAnalysisScope,
  options: { overrides?: CoverageAnalysisOverrides | ItemCoverageAnalysisOverrides; assumptionSetId?: string; guidanceStepId?: string | null } = {},
): Promise<CoverageAnalysisRunResult> {
  let analysis: any;
  if (scope.kind === 'PROPERTY') {
    analysis = await service.run(propertyId, userId, (options.overrides ?? {}) as CoverageAnalysisOverrides, { assumptionSetId: options.assumptionSetId });
    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.FINANCIAL, featureKey: AnalyticsFeature.COVERAGE_ANALYSIS,
      metadataJson: { actionType: 'run_analysis', insuranceReviewState: analysis.insuranceReviewState, confidence: analysis.confidence },
    });
  } else {
    const item = await inventoryService.getItem(propertyId, scope.itemId);
    const featureContext = await evaluateFeatureContext(propertyId, userId, {
      featureKey: 'COVERAGE_INTELLIGENCE', operationKey: 'ASSESS_ITEM_COVERAGE',
      operationInput: { inventoryItemId: scope.itemId, responsibilityScope: item.responsibilityScope ?? undefined, hasDisclosedEstimate: item.replacementValueSource === 'ESTIMATED' },
    });
    if (!featureContext.canExecute || !['MISSING', 'CONFIRMED'].includes(item.coverageState)) {
      throw new APIError(
        item.coverageState === 'MANAGED_ELSEWHERE' ? 'This system is managed by another responsible party.' : 'Complete the item coverage information before running an analysis.',
        409, 'PROPERTY_CONTEXT_REQUIRED', featureContext,
      );
    }
    analysis = await service.runItemAnalysis(propertyId, scope.itemId, userId, (options.overrides ?? {}) as ItemCoverageAnalysisOverrides);
    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.FINANCIAL, featureKey: AnalyticsFeature.COVERAGE_ANALYSIS,
      metadataJson: { actionType: 'run_item_analysis', itemId: scope.itemId, scenarioComparisonReady: true },
    });
  }
  if (!options.guidanceStepId) return { analysis, scope, guidanceReported: null, guidanceRefusal: null };
  // The analysis is saved. The journey step is re-read now and the evaluation must be for the journey's own subject; nothing else is completed in its place.
  const bound = await resolveCoverageCheckBinding(propertyId, options.guidanceStepId, scope);
  if (!bound.ok) return { analysis, scope, guidanceReported: false, guidanceRefusal: bound.reason };
  try {
    await guidanceJourneyService.recordToolCompletion(buildCoverageEvaluationCompletion(propertyId, userId, analysis, scope, bound.binding));
    return { analysis, scope, guidanceReported: true, guidanceRefusal: null };
  } catch (guidanceError) {
    logger.warn({ guidanceError, analysisId: analysis?.id }, '[GUIDANCE] coverage evaluation completion report failed');
    return { analysis, scope, guidanceReported: false, guidanceRefusal: null };
  }
}
