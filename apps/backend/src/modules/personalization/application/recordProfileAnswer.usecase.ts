// apps/backend/src/modules/personalization/application/recordProfileAnswer.usecase.ts
//
// Processes an ANSWERED/SKIPPED/SNOOZED event for one question. Idempotent
// on idempotencyKey (same pattern as recordRecommendationFeedback.usecase.ts).
// ANSWERED is retained only after confirming consent (PER-PRIV-002).
// SKIPPED/SNOOZED never create a profile fact.
//
// The catalog's answerSchema selects a small, explicitly supported pilot
// shape. ProfileAnswer.answerJson is the single source of truth.
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import {
  loadQuestionById,
  findAnswerByIdempotencyKey,
  recordAnswerEvent,
} from '../infrastructure/profileQuestionRepository';
import { getHouseholdConsent } from '../infrastructure/consentRepository';
import { computeNextEligibleAt, ProfileAnswerAction } from '../domain/profiling';

export type RecordProfileAnswerStatus =
  | 'RECORDED'
  | 'DUPLICATE'
  | 'CONSENT_REQUIRED'
  | 'QUESTION_NOT_FOUND'
  | 'QUESTION_NOT_ACTIVE'
  | 'INVALID_ANSWER';

export interface RecordProfileAnswerParams {
  questionId: string;
  householdId: string;
  idempotencyKey: string;
  action: ProfileAnswerAction;
  answerJson?: unknown;
}

export interface RecordProfileAnswerResult {
  status: RecordProfileAnswerStatus;
}

const booleanAnswerSchema = z.object({ value: z.boolean() }).strict();
const memberAnswerSchema = z.object({
  hasChildren: z.boolean(),
  hasSeniors: z.boolean(),
}).strict();
const petAnswerSchema = z.object({
  hasPet: z.boolean(),
  petType: z.enum(['DOG', 'CAT', 'OTHER']).optional(),
}).strict().superRefine((answer, ctx) => {
  if (answer.hasPet && !answer.petType) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['petType'], message: 'petType is required when hasPet is true' });
  }
});

function validateAnswer(answerSchema: unknown, answerJson: unknown): boolean {
  const schemaType =
    answerSchema && typeof answerSchema === 'object' && !Array.isArray(answerSchema)
      ? (answerSchema as Record<string, unknown>).type
      : undefined;

  if (schemaType === 'multi_select') {
    return memberAnswerSchema.safeParse(answerJson).success;
  }
  if (schemaType === 'select_with_detail') {
    return petAnswerSchema.safeParse(answerJson).success;
  }
  if (schemaType === 'boolean') {
    return booleanAnswerSchema.safeParse(answerJson).success;
  }
  return false;
}

export async function recordProfileAnswer(params: RecordProfileAnswerParams): Promise<RecordProfileAnswerResult> {
  const question = await loadQuestionById(params.questionId);
  if (!question) {
    return { status: 'QUESTION_NOT_FOUND' };
  }
  if (question.status !== 'ACTIVE') {
    return { status: 'QUESTION_NOT_ACTIVE' };
  }

  if (params.action === 'ANSWERED' && !validateAnswer(question.answerSchema, params.answerJson)) {
    return { status: 'INVALID_ANSWER' };
  }

  try {
    return await prisma.$transaction(async (db) => {
      const existing = await findAnswerByIdempotencyKey(params.idempotencyKey, db);
      if (existing) return { status: 'DUPLICATE' as const };

      if (params.action === 'ANSWERED') {
        const consent = await getHouseholdConsent(params.householdId, db);
        if (!consent?.consentVersion) return { status: 'CONSENT_REQUIRED' as const };
      }

      await recordAnswerEvent({
        questionId: params.questionId,
        householdId: params.householdId,
        idempotencyKey: params.idempotencyKey,
        action: params.action,
        answerJson: params.action === 'ANSWERED' ? params.answerJson : null,
        nextEligibleAt: computeNextEligibleAt(params.action),
      }, db);

      return { status: 'RECORDED' as const };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { status: 'DUPLICATE' };
    }
    throw error;
  }
}
