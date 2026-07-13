// apps/backend/src/modules/personalization/application/evaluateHvacFilterProof.usecase.ts
//
// The "evaluation run/snapshot" item in
// docs/personalization/09-implementation-roadmap.md's first implementation
// step. Orchestrates the whole thin-proof pipeline for one property:
// load the proof definition's rule -> validate its AST -> compute the
// property's trait snapshot -> evaluate -> persist a
// PersonalizationEvaluationRun.
//
// Trait computation was originally inline here (Phase 0, before
// computePropertyTraitSnapshot.usecase.ts existed in Phase 1 step 3) —
// refactored to call that use case instead, so there's one trait-derivation
// path, not two that could drift. This also means a run now persists
// DerivedTrait/TraitSnapshot rows as a side effect, and correctly fails
// with PROPERTY_NOT_FOUND for a nonexistent property instead of silently
// evaluating to UNKNOWN (the old inline loader never checked the property
// existed at all).
//
// Not exposed via any route or job yet (see adr-0001) — called directly by
// tests today, and by the shadow-evaluation use case (migration steps 4-6).
import { validateRuleAst } from '../domain/ruleAst';
import { evaluateRule } from '../domain/evaluator';
import { computePropertyTraitSnapshot } from './computePropertyTraitSnapshot.usecase';
import { loadActiveRule, recordEvaluationRun } from '../infrastructure/evaluationRunRepository';

export type EvaluationRunStatus = 'COMPLETED' | 'FAILED';
export type EvaluationRunErrorCode = 'DEFINITION_NOT_FOUND' | 'INVALID_RULE_AST' | 'PROPERTY_NOT_FOUND';

export interface EvaluateHvacFilterProofResult {
  status: EvaluationRunStatus;
  result?: 'TRUE' | 'FALSE' | 'UNKNOWN';
  eligible?: boolean;
  errorCode?: EvaluationRunErrorCode;
  /** Present whenever the definition was found, even on a FAILED result — lets callers (e.g. the shadow use case) attach a PersonalizedRecommendation without a second lookup. */
  definitionId?: string;
  ruleVersion?: number;
  /** Present only when a PersonalizationEvaluationRun row was actually written. */
  evaluationRunId?: string;
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
    const run = await recordEvaluationRun({
      propertyId,
      definitionId: loadedRule.definitionId,
      ruleVersion: loadedRule.ruleVersion,
      trigger,
      status: 'FAILED',
      errorCode: 'INVALID_RULE_AST',
      startedAt,
      completedAt: new Date(),
    });
    return {
      status: 'FAILED',
      errorCode: 'INVALID_RULE_AST',
      definitionId: loadedRule.definitionId,
      ruleVersion: loadedRule.ruleVersion,
      evaluationRunId: run.id,
    };
  }

  const snapshot = await computePropertyTraitSnapshot(propertyId);
  if (snapshot.status === 'FAILED' || !snapshot.traits) {
    const run = await recordEvaluationRun({
      propertyId,
      definitionId: loadedRule.definitionId,
      ruleVersion: loadedRule.ruleVersion,
      trigger,
      status: 'FAILED',
      errorCode: 'PROPERTY_NOT_FOUND',
      startedAt,
      completedAt: new Date(),
    });
    return {
      status: 'FAILED',
      errorCode: 'PROPERTY_NOT_FOUND',
      definitionId: loadedRule.definitionId,
      ruleVersion: loadedRule.ruleVersion,
      evaluationRunId: run.id,
    };
  }

  const evaluation = evaluateRule(validated.data, snapshot.traits);

  const run = await recordEvaluationRun({
    propertyId,
    definitionId: loadedRule.definitionId,
    ruleVersion: loadedRule.ruleVersion,
    trigger,
    status: 'COMPLETED',
    result: evaluation.result,
    resultJson: { traits: snapshot.traits, evidence: evaluation.evidence },
    startedAt,
    completedAt: new Date(),
  });

  return {
    status: 'COMPLETED',
    result: evaluation.result,
    eligible: evaluation.eligible,
    definitionId: loadedRule.definitionId,
    ruleVersion: loadedRule.ruleVersion,
    evaluationRunId: run.id,
  };
}
