import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';
import { logger } from '../lib/logger';
import type { NegotiationShieldCaseDetailDTO, NegotiationShieldScenarioType } from './negotiationShield.types';

// The guided-journey completion that follows a Negotiation Shield analysis. It used to live inline in the analyze controller, so a caller that
// used only the service (Ask) would have skipped it and left a journey step open that the page would have completed. The controller and Ask now
// both call this one function, so the two surfaces keep identical side effects (ASK_COZY_NEGOTIATION_SHIELD_SLICE2_DESIGN.md, D6, finding F7).
//
// Best-effort by design, as it always was: a journey that cannot be updated must not fail an analysis that has already been saved.

export const NEGOTIATION_SHIELD_TOOL_KEY = 'negotiation-shield';
export const NEGOTIATION_SHIELD_DEFAULT_STEP_KEY = 'prepare_negotiation';

/** The guidance signal a scenario's analysis answers, used when the caller did not name one. */
export function negotiationShieldCompletionSignal(scenarioType: NegotiationShieldScenarioType): {
  signalIntentFamily: string;
  issueDomain: 'INSURANCE' | 'MAINTENANCE' | 'FINANCIAL' | 'ASSET_LIFECYCLE';
} {
  if (scenarioType === 'INSURANCE_PREMIUM_INCREASE') return { signalIntentFamily: 'coverage_gap', issueDomain: 'INSURANCE' };
  if (scenarioType === 'BUYER_INSPECTION_NEGOTIATION') return { signalIntentFamily: 'inspection_followup_needed', issueDomain: 'MAINTENANCE' };
  if (scenarioType === 'INSURANCE_CLAIM_SETTLEMENT') return { signalIntentFamily: 'financial_exposure', issueDomain: 'FINANCIAL' };
  return { signalIntentFamily: 'lifecycle_end_or_past_life', issueDomain: 'ASSET_LIFECYCLE' };
}

export type NegotiationShieldCompletionInput = {
  propertyId: string;
  actorUserId: string;
  /** The case detail returned by the analysis (only its case, latest analysis and latest draft are read). */
  detail: Pick<NegotiationShieldCaseDetailDTO, 'case' | 'latestAnalysis' | 'latestDraft'>;
  /** The journey and step the analysis was launched from, when it was. */
  journeyId?: string | null;
  stepKey?: string | null;
  /** A caller-named signal family (already lower-cased); otherwise the scenario's own. */
  signalIntentFamily?: string | null;
};

/** Returns whether the completion was recorded; a failure is logged and never thrown. */
export async function recordNegotiationShieldAnalysisCompletion(input: NegotiationShieldCompletionInput): Promise<boolean> {
  const { detail } = input;
  const inferred = negotiationShieldCompletionSignal(detail.case.scenarioType);
  try {
    await guidanceJourneyService.recordToolCompletion({
      propertyId: input.propertyId,
      actorUserId: input.actorUserId,
      journeyId: input.journeyId ?? null,
      signalIntentFamily: input.signalIntentFamily ?? inferred.signalIntentFamily,
      issueDomain: inferred.issueDomain,
      sourceToolKey: NEGOTIATION_SHIELD_TOOL_KEY,
      sourceEntityType: 'NEGOTIATION_SHIELD_CASE',
      sourceEntityId: detail.case.id,
      stepKey: input.stepKey ?? NEGOTIATION_SHIELD_DEFAULT_STEP_KEY,
      status: 'COMPLETED',
      // One report per saved analysis, so a replay of the same confirmation does not add a second evidence row.
      dedupeKey: `negotiation-shield:${input.propertyId}:${detail.case.id}:${detail.latestAnalysis?.id ?? 'none'}:${input.stepKey ?? NEGOTIATION_SHIELD_DEFAULT_STEP_KEY}`,
      producedData: {
        proofType: 'negotiation_analysis',
        proofId: detail.case.id,
        scenarioType: detail.case.scenarioType,
        caseStatus: detail.case.status,
        summary: detail.latestAnalysis?.summary ?? null,
        confidence: detail.latestAnalysis?.confidence ?? null,
        negotiationLeverage: detail.latestAnalysis?.negotiationLeverage ?? null,
        recommendedActions: detail.latestAnalysis?.recommendedActions ?? null,
        pricingAssessment: detail.latestAnalysis?.pricingAssessment ?? null,
        draftType: detail.latestDraft?.draftType ?? null,
      },
    });
    return true;
  } catch (guidanceError) {
    logger.warn({ guidanceError }, '[GUIDANCE] negotiation shield hook failed');
    return false;
  }
}
