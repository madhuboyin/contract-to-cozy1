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
// Ineligible (FALSE/UNKNOWN) results do not create or update a
// recommendation row — this slice does not yet retire/expire a
// previously-eligible row that's since become ineligible; that lifecycle
// handling is later work once a real consumer needs it.
import {
  evaluateHvacFilterProofForProperty,
  EvaluateHvacFilterProofResult,
} from './evaluateHvacFilterProof.usecase';
import { HVAC_FILTER_PROOF_DEFINITION_CODE } from '../catalog/proofDefinition';
import { upsertShadowRecommendation } from '../infrastructure/recommendationRepository';

export interface ShadowEvaluateResult {
  evaluation: EvaluateHvacFilterProofResult;
  recommendationCreated: boolean;
  recommendationId?: string;
}

export async function shadowEvaluateHvacFilterProofForProperty(
  propertyId: string,
): Promise<ShadowEvaluateResult> {
  const evaluation = await evaluateHvacFilterProofForProperty(
    propertyId,
    HVAC_FILTER_PROOF_DEFINITION_CODE,
    'SHADOW',
  );

  if (
    evaluation.status !== 'COMPLETED' ||
    !evaluation.eligible ||
    !evaluation.definitionId ||
    evaluation.ruleVersion === undefined
  ) {
    return { evaluation, recommendationCreated: false };
  }

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
  });

  return { evaluation, recommendationCreated: true, recommendationId };
}
