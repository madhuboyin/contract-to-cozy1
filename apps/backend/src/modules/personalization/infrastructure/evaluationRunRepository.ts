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
}

/** Loads a definition's latest rule version by code. Null if the definition or any rule is missing. */
export async function loadActiveRule(definitionCode: string): Promise<LoadedRule | null> {
  const definition = await prisma.recommendationDefinition.findUnique({
    where: { code: definitionCode },
    include: { rules: { orderBy: { version: 'desc' }, take: 1 } },
  });
  if (!definition || definition.rules.length === 0) return null;

  const rule = definition.rules[0];
  return { definitionId: definition.id, ruleVersion: rule.version, ruleAst: rule.ruleAst };
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
