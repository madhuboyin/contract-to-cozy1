// apps/backend/src/modules/personalization/application/shadowEvaluateHvacFilterProof.usecase.ts
//
// Migration step 5's "shadow evaluate" half for the one real definition
// this codebase has (hvac_filter_replacement_check_proof — see
// adr for migration steps 4-6). Runs the existing evaluation pipeline
// (evaluateHvacFilterProof.usecase.ts) and, only when the result is
// eligible, persists a PersonalizedRecommendation + RecommendationExplanation
// via recommendationRepository.ts. Nothing reads these rows yet — this
// proves the schema/lifecycle mechanism works, it does not surface
// anything to a user (see the migration-steps-4-6 plan's explicit
// "shadow only" scope).
//
// Ineligible (FALSE/UNKNOWN) results retire a previously-ACTIVE recommendation
// (see expireRecommendationIfActive) rather than leaving it stale. An eligible
// result that's covered by an active RecommendationSuppression (user-dismissed
// or system-set) is suppressed instead of (re)created — see
// suppressRecommendationIfActive. Cross-definition dedupe/diversity/ranking
// beyond this single-definition suppression check is later work, once a
// second real rule-bearing definition exists to make it meaningful.
import {
  evaluateHvacFilterProofForProperty,
  EvaluateHvacFilterProofResult,
} from './evaluateHvacFilterProof.usecase';
import { HVAC_FILTER_PROOF_CATEGORY, HVAC_FILTER_PROOF_DEFINITION_CODE } from '../catalog/proofDefinition';
import { HVAC_FILTER_OVERDUE_THRESHOLD_DAYS } from '../domain/traits';
import { computeHvacFilterProofScore } from '../domain/scoring';
import {
  upsertShadowRecommendation,
  expireRecommendationIfActive,
  suppressRecommendationIfActive,
} from '../infrastructure/recommendationRepository';
import { findActiveSuppression } from '../infrastructure/suppressionRepository';
import { isToolEnabled } from '../../../config/featureFlags';

export interface ShadowEvaluateResult {
  evaluation: EvaluateHvacFilterProofResult | { status: 'SHADOW_DISABLED' };
  recommendationCreated: boolean;
  recommendationId?: string;
  suppressed?: boolean;
}

export async function shadowEvaluateHvacFilterProofForProperty(
  propertyId: string,
): Promise<ShadowEvaluateResult> {
  // PERSONALIZATION_SHADOW rollout gate (adr-0001: "if a route is added later
  // it must be gated behind the already-existing PERSONALIZATION_SHADOW
  // rollout flag"). Bucketed by propertyId — this use case is property-
  // scoped and has no userId of its own to bucket by.
  if (!isToolEnabled('PERSONALIZATION_SHADOW', propertyId)) {
    return { evaluation: { status: 'SHADOW_DISABLED' }, recommendationCreated: false };
  }

  const evaluation = await evaluateHvacFilterProofForProperty(
    propertyId,
    HVAC_FILTER_PROOF_DEFINITION_CODE,
    'SHADOW',
  );

  if (evaluation.status === 'COMPLETED' && !evaluation.eligible && evaluation.definitionId) {
    await expireRecommendationIfActive(propertyId, evaluation.definitionId);
  }

  if (
    evaluation.status !== 'COMPLETED' ||
    !evaluation.eligible ||
    !evaluation.definitionId ||
    evaluation.ruleVersion === undefined
  ) {
    return { evaluation, recommendationCreated: false };
  }

  const activeSuppression = await findActiveSuppression(propertyId, {
    definitionCode: HVAC_FILTER_PROOF_DEFINITION_CODE,
    category: HVAC_FILTER_PROOF_CATEGORY,
    dedupeKey: HVAC_FILTER_PROOF_DEFINITION_CODE,
  });
  if (activeSuppression) {
    await suppressRecommendationIfActive(propertyId, evaluation.definitionId);
    return { evaluation, recommendationCreated: false, suppressed: true };
  }

  // Scoring input — a scoring-only trait, not read by the rule's eligibility
  // logic, so it's normally known whenever the eligibility trait is (both
  // derive from the same HVAC service history). Falls back to no score
  // (undefined fields) rather than guessing if it's ever unknown.
  const daysSinceServicedReading = evaluation.traitsSnapshot?.['hvacFilterDaysSinceServiced'];
  const scoreResult =
    daysSinceServicedReading?.known && typeof daysSinceServicedReading.value === 'number'
      ? computeHvacFilterProofScore({
          daysSinceServiced: daysSinceServicedReading.value,
          thresholdDays: HVAC_FILTER_OVERDUE_THRESHOLD_DAYS,
          confidence: 1,
          scoreConfigRaw: evaluation.scoreConfig,
        })
      : undefined;

  const { id: recommendationId } = await upsertShadowRecommendation({
    propertyId,
    definitionId: evaluation.definitionId,
    evaluationRunId: evaluation.evaluationRunId ?? null,
    ruleVersion: evaluation.ruleVersion,
    dedupeKey: HVAC_FILTER_PROOF_DEFINITION_CODE,
    // Placeholder copy — not reviewed, never shown to a user (see
    // adr-0002/migration-steps-4-6 plan). Real content authoring is
    // explicitly deferred Phase 1 content work.
    headline: 'HVAC filter may need replacement',
    reasonCodes: [{ code: 'HVAC_FILTER_OVERDUE', templateKey: 'hvac_filter_overdue_reason' }],
    evidence: evaluation,
    score: scoreResult?.score,
    priorityBand: scoreResult?.priorityBand,
    confidence: scoreResult?.confidence,
    scoreBreakdown: scoreResult?.scoreBreakdown,
  });

  return { evaluation, recommendationCreated: true, recommendationId };
}
