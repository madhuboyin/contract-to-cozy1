// apps/backend/src/modules/personalization/infrastructure/profileQuestionRepository.ts
//
// Prisma-backed repository for ProfileQuestion/ProfileAnswer.
import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export interface LoadedProfileQuestion {
  id: string;
  code: string;
  targetTable: string;
  targetKey: string | null;
  valueScore: number;
  effortScore: number;
  maxImpressions: number;
}

/**
 * ACTIVE questions offered in this placement context, filtered in application
 * code (not a Prisma `where` on the array field) — same "stay testable
 * against plain mocks" convention loadActiveRule (evaluationRunRepository.ts)
 * established.
 */
export async function loadActiveQuestionsForPlacement(placement: string): Promise<LoadedProfileQuestion[]> {
  const questions = await prisma.profileQuestion.findMany({
    where: { status: 'ACTIVE' },
  });

  return (
    questions as Array<{
      id: string;
      code: string;
      targetTable: string;
      targetKey: string | null;
      valueScore: number;
      effortScore: number;
      maxImpressions: number;
      placementContexts: string[];
    }>
  )
    .filter((q) => q.placementContexts.includes(placement))
    .map((q) => ({
      id: q.id,
      code: q.code,
      targetTable: q.targetTable,
      targetKey: q.targetKey,
      valueScore: q.valueScore,
      effortScore: q.effortScore,
      maxImpressions: q.maxImpressions,
    }));
}

export interface LoadedProfileAnswer {
  questionId: string;
  action: string;
  nextEligibleAt: Date | null;
  askedAt: Date;
}

export async function loadQuestionById(questionId: string): Promise<LoadedProfileQuestion | null> {
  const question = await prisma.profileQuestion.findUnique({ where: { id: questionId } });
  if (!question) return null;
  return {
    id: question.id,
    code: question.code,
    targetTable: question.targetTable,
    targetKey: question.targetKey,
    valueScore: question.valueScore,
    effortScore: question.effortScore,
    maxImpressions: question.maxImpressions,
  };
}

export async function loadAnswerHistoryForHousehold(householdId: string): Promise<LoadedProfileAnswer[]> {
  return prisma.profileAnswer.findMany({
    where: { householdId },
    select: { questionId: true, action: true, nextEligibleAt: true, askedAt: true },
  });
}

export async function findAnswerByIdempotencyKey(idempotencyKey: string): Promise<{ id: string } | null> {
  return prisma.profileAnswer.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
}

export interface RecordAnswerEventParams {
  questionId: string;
  householdId: string;
  idempotencyKey: string;
  action: 'ANSWERED' | 'SKIPPED' | 'SNOOZED';
  answerJson: unknown;
  nextEligibleAt: Date | null;
}

export async function recordAnswerEvent(params: RecordAnswerEventParams): Promise<{ id: string }> {
  const now = new Date();
  return prisma.profileAnswer.create({
    data: {
      questionId: params.questionId,
      householdId: params.householdId,
      idempotencyKey: params.idempotencyKey,
      action: params.action,
      answerJson: params.answerJson === undefined ? undefined : (params.answerJson as Prisma.InputJsonValue),
      askedAt: now,
      answeredAt: params.action === 'ANSWERED' ? now : null,
      skippedAt: params.action === 'SKIPPED' ? now : null,
      snoozedAt: params.action === 'SNOOZED' ? now : null,
      nextEligibleAt: params.nextEligibleAt,
    },
    select: { id: true },
  });
}
