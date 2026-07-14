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
}

export async function materializePilotRecommendationsForProperty(
  propertyId: string,
  trigger = 'PROPERTY_READ',
): Promise<MaterializePilotResult> {
  let active = 0;

  for (const definition of PILOT_DEFINITIONS) {
    const evaluation = await evaluateDefinitionForProperty(propertyId, definition.code, trigger);

    if (evaluation.status === 'COMPLETED' && !evaluation.eligible && evaluation.definitionId) {
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

    const suppression = await findActiveSuppression(propertyId, {
      definitionCode: definition.code,
      category: definition.category,
      dedupeKey: definition.code,
    });
    if (suppression) {
      await suppressRecommendationIfActive(propertyId, evaluation.definitionId);
      continue;
    }

    await upsertRecommendation({
      propertyId,
      // The current reviewed catalog uses property signals only. Optional
      // household-profile consent must never gate or own these instances.
      householdId: null,
      definitionId: evaluation.definitionId,
      evaluationRunId: evaluation.evaluationRunId ?? null,
      ruleVersion: evaluation.ruleVersion,
      contentVersion: content.version,
      dedupeKey: definition.code,
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
      scoreBreakdown: { modelVersion: 'pilot-static-v1' },
    });
    active += 1;
  }

  return { evaluated: PILOT_DEFINITIONS.length, active };
}
