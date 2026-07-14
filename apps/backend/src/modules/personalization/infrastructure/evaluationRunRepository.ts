// apps/backend/src/modules/personalization/infrastructure/evaluationRunRepository.ts
//
// The one Prisma-backed repository in this proof's infrastructure/ layer —
// per docs/personalization/04-target-architecture.md's module layout,
// domain/application code doesn't import Prisma personalization tables
// directly; this is the boundary that owns those queries.
import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export interface LoadedRule {
  definitionId: string;
  ruleVersion: number;
  ruleAst: unknown;
  /** Opaque scoring-weight config for this rule version — see domain/scoring.ts. */
  scoreConfig: unknown;
}

export type LoadActiveRuleOutcome =
  | { rule: LoadedRule }
  | { rule: null; reason: 'NOT_FOUND' | 'NOT_ACTIVE' };

/**
 * Loads a definition's latest ACTIVE rule version by code — the actual
 * enforcement point for "DRAFT/PAUSED/RETIRED/out-of-window definitions and
 * rules must never be evaluated" (PER-FR-004). Filtered in application code
 * rather than via a Prisma relation `where` so this stays testable against
 * plain object mocks that don't implement Prisma's query semantics.
 *
 * `reason: 'NOT_ACTIVE'` covers: definition.status !== 'ACTIVE', a
 * per-definition pause (pausedAt set), outside the definition's
 * effectiveFrom/effectiveTo window, or no rule with status: 'ACTIVE' exists
 * for it (a DRAFT-only or fully-retired rule set).
 */
export async function loadActiveRule(definitionCode: string): Promise<LoadActiveRuleOutcome> {
  const now = new Date();
  const definition = await prisma.recommendationDefinition.findUnique({
    where: { code: definitionCode },
    include: { rules: { orderBy: { version: 'desc' } } },
  });
  if (!definition) return { rule: null, reason: 'NOT_FOUND' };

  const definitionIsActive =
    definition.status === 'ACTIVE' &&
    !definition.pausedAt &&
    (!definition.effectiveFrom || definition.effectiveFrom <= now) &&
    (!definition.effectiveTo || definition.effectiveTo >= now);

  const activeRule = (
    definition.rules as Array<{
      version: number;
      ruleAst: unknown;
      status: string;
      scoreConfig?: unknown;
      authoredBy?: string | null;
      reviewedBy?: string | null;
    }>
  ).find((r) => r.status === 'ACTIVE');

  const safetyReviewComplete =
    definition.safetyClass !== 'SAFETY_SENSITIVE' ||
    Boolean(
      activeRule?.authoredBy &&
      activeRule.reviewedBy &&
      activeRule.authoredBy !== activeRule.reviewedBy,
    );

  if (!definitionIsActive || !activeRule || !safetyReviewComplete) {
    return { rule: null, reason: 'NOT_ACTIVE' };
  }

  return {
    rule: {
      definitionId: definition.id,
      ruleVersion: activeRule.version,
      ruleAst: activeRule.ruleAst,
      scoreConfig: activeRule.scoreConfig ?? null,
    },
  };
}

export interface RecordEvaluationRunParams {
  propertyId: string;
  definitionId: string;
  ruleVersion: number;
  trigger: string;
  status: 'COMPLETED' | 'FAILED';
  result?: 'TRUE' | 'FALSE' | 'UNKNOWN';
  resultJson?: unknown;
  errorCode?: string;
  startedAt: Date;
  completedAt: Date;
}

export async function recordEvaluationRun(params: RecordEvaluationRunParams): Promise<{ id: string }> {
  const run = await prisma.personalizationEvaluationRun.create({
    data: {
      propertyId: params.propertyId,
      definitionId: params.definitionId,
      ruleVersion: params.ruleVersion,
      trigger: params.trigger,
      status: params.status,
      result: params.result,
      ...(params.resultJson !== undefined
        ? { resultJson: params.resultJson as Prisma.InputJsonValue }
        : {}),
      errorCode: params.errorCode,
      startedAt: params.startedAt,
      completedAt: params.completedAt,
      durationMs: params.completedAt.getTime() - params.startedAt.getTime(),
    },
  });

  return { id: run.id };
}
