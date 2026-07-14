import { evaluateDefinitionForProperty } from './evaluateHvacFilterProof.usecase';
import { PILOT_DEFINITIONS } from '../catalog/pilotDefinitions';
import { findActiveSuppression } from '../infrastructure/suppressionRepository';
import {
  expireRecommendationIfActive,
  suppressRecommendationIfActive,
  upsertRecommendation,
} from '../infrastructure/recommendationRepository';
import { priorityBandFromScore } from '../domain/scoring';
import { loadActivePilotContent } from '../infrastructure/pilotContentRepository';

export interface MaterializePilotResult {
  evaluated: number;
  active: number;
  paused?: boolean;
}

export async function materializePilotRecommendationsForProperty(
  propertyId: string,
  trigger = 'PROPERTY_READ',
): Promise<MaterializePilotResult> {
  let active = 0;

  for (const definition of PILOT_DEFINITIONS) {
    const evaluation = await evaluateDefinitionForProperty(propertyId, definition.code, trigger);

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

    const content = await loadActivePilotContent(evaluation.definitionId);
    if (!content) {
      await expireRecommendationIfActive(propertyId, evaluation.definitionId);
      continue;
    }

    const suppression = await findActiveSuppression(propertyId, evaluation.definitionId);
    if (suppression) {
      await suppressRecommendationIfActive(propertyId, evaluation.definitionId);
      continue;
    }

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
        params: { message: content.body },
      }],
      evidence: { result: evaluation.result },
      score: definition.defaultScore,
      priorityBand: priorityBandFromScore(definition.defaultScore),
      confidence: 1,
    });
    active += 1;
  }

  return { evaluated: PILOT_DEFINITIONS.length, active };
}
