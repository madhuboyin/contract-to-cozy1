// The effects of recording a coverage-comparison decision, in one place (the Negotiation Shield D6 pattern).
//
// The desktop route and Ask both call this, so the Home Action resolution, the guided-journey completion, the capability lifecycle completion and the
// analytics event are identical whichever surface recorded the decision. coverageComparison.service.ts holds the persistence (and is idempotent for a
// replay of the same decision); this holds what the controller used to do around it. A replay returns early with no second round of effects.
import { logger } from '../lib/logger';
import { analyticsEmitter, AnalyticsEvent, AnalyticsFeature, AnalyticsModule } from './analytics';
import { recordCapabilityCompletionAndResolveNext } from './capabilityCompletion.service';
import { recordCoverageDecision } from './coverageComparison.service';
import { resolveCoverageHomeActionFromDecision } from './coverageLifecycle.service';
import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';

export type CoverageDecisionBody = Parameters<typeof recordCoverageDecision>[3];

export async function recordCoverageDecisionWithEffects(propertyId: string, comparisonId: string, userId: string, body: CoverageDecisionBody) {
  const result = await recordCoverageDecision(propertyId, comparisonId, userId, body);
  if (result.idempotentReplay) return { ...result, guidanceReported: null as boolean | null };

  try {
    await resolveCoverageHomeActionFromDecision({ propertyId, userId, sourceActionId: result.decision.sourceActionId, decisionId: result.decision.id });
  } catch (resolutionError) {
    logger.warn({ resolutionError }, '[COVERAGE] Home Action resolution hook failed');
  }

  // Whether the journey step was updated: null when no journey was named, false when the report failed (the decision itself is saved either way).
  let guidanceReported: boolean | null = null;
  if (body.guidanceJourneyId) {
    try {
      await guidanceJourneyService.recordToolCompletion({
        propertyId, actorUserId: userId, journeyId: body.guidanceJourneyId, signalIntentFamily: 'coverage_decision', issueDomain: 'INSURANCE',
        sourceToolKey: 'coverage-intelligence', sourceEntityType: 'COVERAGE_DECISION', sourceEntityId: result.decision.id,
        stepKey: body.guidanceStepKey || 'compare_options', status: 'COMPLETED',
        producedData: { proofType: 'coverage_decision', proofId: result.decision.id, comparisonId, decision: result.decision.decision, homeEventId: result.homeEvent.id },
      });
      guidanceReported = true;
    } catch (guidanceError) {
      guidanceReported = false;
      logger.warn({ guidanceError }, '[GUIDANCE] coverage decision hook failed');
    }
  }

  try {
    await recordCapabilityCompletionAndResolveNext({
      propertyId, userId, capabilityId: 'coverage-intelligence', completionKind: 'DECISION_RECORDED', outputEntityType: 'COVERAGE_DECISION',
      outputEntityId: result.decision.id, sourceActionId: body.sourceActionId ?? null, journeyId: body.guidanceJourneyId ?? null, surface: 'coverage-comparison',
    });
  } catch (completionError) {
    logger.warn({ completionError }, '[CAPABILITY] coverage decision lifecycle hook failed');
  }

  analyticsEmitter.track({
    eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.FINANCIAL, featureKey: AnalyticsFeature.COVERAGE_ANALYSIS,
    metadataJson: { actionType: 'coverage_decision_recorded', comparisonId, decision: result.decision.decision, sourceActionId: body.sourceActionId ?? null },
  });
  return { ...result, guidanceReported };
}
