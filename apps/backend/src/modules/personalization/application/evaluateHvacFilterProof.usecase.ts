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
// current property-owned DerivedTrait rows as a side effect, and correctly fails
// with PROPERTY_NOT_FOUND for a nonexistent property instead of silently
// evaluating to UNKNOWN (the old inline loader never checked the property
// existed at all).
//
// Not exposed via any route or job yet (see adr-0001) — called directly by
// tests today, and by the shadow-evaluation use case (migration steps 4-6).
import { validateRuleAst } from '../domain/ruleAst';
import { evaluateRule, TraitReading } from '../domain/evaluator';
import { computePropertyTraitSnapshot } from './computePropertyTraitSnapshot.usecase';
import { loadActiveRule, recordEvaluationRun } from '../infrastructure/evaluationRunRepository';
import { isPersonalizationPaused } from '../../../services/personalizationKillSwitch.service';

export type EvaluationRunStatus = 'COMPLETED' | 'FAILED' | 'PAUSED';
export type EvaluationRunErrorCode =
  | 'DEFINITION_NOT_FOUND'
  | 'DEFINITION_NOT_ACTIVE'
  | 'INVALID_RULE_AST'
  | 'PROPERTY_NOT_FOUND';

export interface EvaluateDefinitionResult {
  status: EvaluationRunStatus;
  result?: 'TRUE' | 'FALSE' | 'UNKNOWN';
  eligible?: boolean;
  errorCode?: EvaluationRunErrorCode;
  /** Present whenever the definition was found, even on a FAILED result — lets callers (e.g. the shadow use case) attach a PersonalizedRecommendation without a second lookup. */
  definitionId?: string;
  ruleVersion?: number;
  /** Present only when a PersonalizationEvaluationRun row was actually written. */
  evaluationRunId?: string;
  /** Present only on COMPLETED — the trait set this evaluation ran against, for scoring inputs (e.g. hvacFilterDaysSinceServiced) that aren't part of the rule's eligibility logic. */
  traitsSnapshot?: Record<string, TraitReading>;
  /** Present only on COMPLETED — the active rule's opaque scoring-weight config (domain/scoring.ts parses it). */
  scoreConfig?: unknown;
}

export async function evaluateDefinitionForProperty(
  propertyId: string,
  definitionCode: string,
  trigger = 'MANUAL',
): Promise<EvaluateDefinitionResult> {
  const startedAt = new Date();

  if (await isPersonalizationPaused()) {
    // The kill switch's actual enforcement point (personalizationKillSwitch.service.ts) —
    // no definitionId yet to attach a run row to, so nothing is persisted, same as the
    // DEFINITION_NOT_FOUND case below.
    return { status: 'PAUSED' };
  }

  const loaded = await loadActiveRule(definitionCode);
  if (!loaded.rule) {
    // No definitionId to attach a run row to (required FK) — nothing to persist,
    // for either reason (doesn't exist at all, or exists but isn't an active,
    // reviewed, in-window rule/definition — PER-FR-004).
    return {
      status: 'FAILED',
      errorCode: loaded.reason === 'NOT_FOUND' ? 'DEFINITION_NOT_FOUND' : 'DEFINITION_NOT_ACTIVE',
      ...(loaded.definitionId ? { definitionId: loaded.definitionId } : {}),
    };
  }
  const loadedRule = loaded.rule;

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
    traitsSnapshot: snapshot.traits,
    scoreConfig: loadedRule.scoreConfig,
  };
}

// Compatibility aliases for existing callers while the pilot moves from the
// original one-definition proof to the generic evaluator.
export type EvaluateHvacFilterProofResult = EvaluateDefinitionResult;
export const evaluateHvacFilterProofForProperty = evaluateDefinitionForProperty;
