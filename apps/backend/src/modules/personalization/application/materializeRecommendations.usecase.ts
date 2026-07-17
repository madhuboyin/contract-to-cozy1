import { evaluateDefinitionForProperty } from './evaluateDefinition.usecase';
import { PERSONALIZATION_DEFINITIONS } from '../catalog/personalizationDefinitions';
import { findActiveSuppression } from '../infrastructure/suppressionRepository';
import {
  expireRecommendationIfActive,
  suppressRecommendationIfActive,
  upsertRecommendation,
} from '../infrastructure/recommendationRepository';
import { buildPropertyFactSummary, priorityBandFromScore, scoreDefinitionForProperty } from '../domain/scoring';
import { loadActiveRecommendationContent } from '../infrastructure/recommendationContentRepository';

export interface MaterializeRecommendationsResult {
  evaluated: number;
  active: number;
  paused?: boolean;
}

export async function materializeRecommendationsForProperty(
  propertyId: string,
  trigger = 'PROPERTY_READ',
  actorUserId?: string,
): Promise<MaterializeRecommendationsResult> {
  let active = 0;

  for (const definition of PERSONALIZATION_DEFINITIONS) {
    const evaluation = await evaluateDefinitionForProperty(propertyId, definition.code, trigger, actorUserId);

    // The evaluator owns the kill-switch check. Stop after its first PAUSED
    // result so a read performs one setting lookup, not one per definition.
    if (evaluation.status === 'PAUSED') {
      return { evaluated: 0, active: 0, paused: true };
    }

    if (evaluation.status === 'COMPLETED' && !evaluation.eligible && evaluation.definitionId) {
      await expireRecommendationIfActive(propertyId, evaluation.definitionId);
    }

    // A stored recommendation must disappear when its definition/rule becomes
    // inactive or invalid. Re-activation safely revives it through the normal
    // upsert path on a later read.
    if (evaluation.status === 'FAILED' && evaluation.definitionId) {
      await expireRecommendationIfActive(propertyId, evaluation.definitionId);
    }

    if (
      evaluation.status !== 'COMPLETED' ||
      !evaluation.eligible ||
      !evaluation.definitionId ||
      evaluation.ruleVersion === undefined
    ) {
      continue;
    }

    const content = await loadActiveRecommendationContent(evaluation.definitionId);
    if (!content) {
      await expireRecommendationIfActive(propertyId, evaluation.definitionId);
      continue;
    }

    const suppression = await findActiveSuppression(propertyId, evaluation.definitionId);
    if (suppression) {
      await suppressRecommendationIfActive(propertyId, evaluation.definitionId);
      continue;
    }

    const score = scoreDefinitionForProperty(
      definition.code,
      definition.defaultScore,
      evaluation.traitsSnapshot,
    );
    const factSummary = buildPropertyFactSummary(definition.code, evaluation.traitsSnapshot);

    await upsertRecommendation({
      propertyId,
      definitionId: evaluation.definitionId,
      evaluationRunId: evaluation.evaluationRunId ?? null,
      ruleVersion: evaluation.ruleVersion,
      contentVersion: content.version,
      headline: content.title,
      reasonCodes: [{
        code: definition.reasonCode,
        templateKey: definition.reasonTemplateKey,
        params: { message: content.body, ...(factSummary ? { factSummary } : {}) },
      }],
      evidence: { result: evaluation.result },
      score,
      priorityBand: priorityBandFromScore(score),
      confidence: 1,
    });
    active += 1;
  }

  return { evaluated: PERSONALIZATION_DEFINITIONS.length, active };
}
