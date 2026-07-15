import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

type PersonalizationDb = typeof prisma | Prisma.TransactionClient;

export interface LoadedProfileQuestion {
  id: string;
  code: string;
  valueScore: number;
  effortScore: number;
  maxImpressions: number;
  answerSchema: unknown;
  prompt: string;
  whyAsked: string;
  privacyNote: string;
  status: string;
}

/** Active optional-profile questions for the current guidance surface. */
export async function loadActiveQuestions(): Promise<LoadedProfileQuestion[]> {
  return prisma.profileQuestion.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      code: true,
      valueScore: true,
      effortScore: true,
      maxImpressions: true,
      answerSchema: true,
      prompt: true,
      whyAsked: true,
      privacyNote: true,
      status: true,
    },
  });
}

export interface LoadedProfileAnswer {
  questionId: string;
  action: string;
  nextEligibleAt: Date | null;
  createdAt: Date;
}

export async function loadQuestionById(
  questionId: string,
  db: PersonalizationDb = prisma,
): Promise<LoadedProfileQuestion | null> {
  return db.profileQuestion.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      code: true,
      valueScore: true,
      effortScore: true,
      maxImpressions: true,
      answerSchema: true,
      prompt: true,
      whyAsked: true,
      privacyNote: true,
      status: true,
    },
  });
}

export async function loadAnswerHistoryForHousehold(householdId: string): Promise<LoadedProfileAnswer[]> {
  return prisma.profileAnswer.findMany({
    where: { householdId },
    select: { questionId: true, action: true, nextEligibleAt: true, createdAt: true },
  });
}

export async function findAnswerByIdempotencyKey(
  idempotencyKey: string,
  db: PersonalizationDb = prisma,
): Promise<{ id: string } | null> {
  return db.profileAnswer.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
}

export async function findAnsweredQuestionForHousehold(
  householdId: string,
  questionId: string,
  db: PersonalizationDb = prisma,
): Promise<{ id: string } | null> {
  return db.profileAnswer.findFirst({
    where: { householdId, questionId, action: 'ANSWERED' },
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

export async function recordAnswerEvent(
  params: RecordAnswerEventParams,
  db: PersonalizationDb = prisma,
): Promise<{ id: string }> {
  return db.profileAnswer.create({
    data: {
      questionId: params.questionId,
      householdId: params.householdId,
      idempotencyKey: params.idempotencyKey,
      action: params.action,
      answerJson: params.answerJson === undefined ? undefined : (params.answerJson as Prisma.InputJsonValue),
      nextEligibleAt: params.nextEligibleAt,
    },
    select: { id: true },
  });
}
