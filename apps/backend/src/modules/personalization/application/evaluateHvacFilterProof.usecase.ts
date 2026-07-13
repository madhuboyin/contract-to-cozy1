// apps/backend/src/modules/personalization/application/evaluateHvacFilterProof.usecase.ts
//
// The "evaluation run/snapshot" item in
// docs/personalization/09-implementation-roadmap.md's first implementation
// step. Orchestrates the whole thin-proof pipeline for one property:
// load the proof definition's rule -> validate its AST -> derive the one
// property trait -> evaluate -> persist a PersonalizationEvaluationRun.
//
// Not exposed via any route or job yet (see adr-0001) — called directly by
// tests today, and will be the thing a future admin endpoint or BullMQ job
// calls once this proof graduates past "thin vertical proof."
import { validateRuleAst } from '../domain/ruleAst';
import { evaluateRule, TraitMap } from '../domain/evaluator';
import { deriveHvacFilterReplacementOverdue } from '../domain/traits';
import {
  loadActiveRule,
  loadHomeAssetFacts,
  recordEvaluationRun,
} from '../infrastructure/evaluationRunRepository';

export type EvaluationRunStatus = 'COMPLETED' | 'FAILED';
export type EvaluationRunErrorCode = 'DEFINITION_NOT_FOUND' | 'INVALID_RULE_AST';

export interface EvaluateHvacFilterProofResult {
  status: EvaluationRunStatus;
  result?: 'TRUE' | 'FALSE' | 'UNKNOWN';
  eligible?: boolean;
  errorCode?: EvaluationRunErrorCode;
}

export async function evaluateHvacFilterProofForProperty(
  propertyId: string,
  definitionCode: string,
  trigger = 'MANUAL',
): Promise<EvaluateHvacFilterProofResult> {
  const startedAt = new Date();

  const loadedRule = await loadActiveRule(definitionCode);
  if (!loadedRule) {
    // No definitionId to attach a run row to (required FK) — nothing to persist.
    return { status: 'FAILED', errorCode: 'DEFINITION_NOT_FOUND' };
  }

  const validated = validateRuleAst(loadedRule.ruleAst);
  if (!validated.success || !validated.data) {
    await recordEvaluationRun({
      propertyId,
      definitionId: loadedRule.definitionId,
      ruleVersion: loadedRule.ruleVersion,
      trigger,
      status: 'FAILED',
      errorCode: 'INVALID_RULE_AST',
      startedAt,
      completedAt: new Date(),
    });
    return { status: 'FAILED', errorCode: 'INVALID_RULE_AST' };
  }

  const homeAssets = await loadHomeAssetFacts(propertyId);
  const hvacReading = deriveHvacFilterReplacementOverdue(homeAssets);
  const traits: TraitMap = { hvacFilterReplacementOverdue: hvacReading };

  const evaluation = evaluateRule(validated.data, traits);

  await recordEvaluationRun({
    propertyId,
    definitionId: loadedRule.definitionId,
    ruleVersion: loadedRule.ruleVersion,
    trigger,
    status: 'COMPLETED',
    result: evaluation.result,
    resultJson: { traits, evidence: evaluation.evidence },
    startedAt,
    completedAt: new Date(),
  });

  return { status: 'COMPLETED', result: evaluation.result, eligible: evaluation.eligible };
}
