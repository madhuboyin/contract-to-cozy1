// apps/backend/src/modules/personalization/application/recordProfileAnswer.usecase.ts
//
// Processes an ANSWERED/SKIPPED/SNOOZED event for one question. Idempotent
// on idempotencyKey (same pattern as recordRecommendationFeedback.usecase.ts).
// Only ANSWERED ever touches a sensitive composition table, and only after
// confirming consent (PER-PRIV-002) — SKIPPED/SNOOZED never do (08-personalization-frd.md
// UC-10: "skip never creates inference").
//
// The catalog's answerSchema selects a small, explicitly supported pilot
// shape. Validation happens before any sensitive write, and the composition
// write plus answer event are committed in one transaction.
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import {
  loadQuestionById,
  findAnswerByIdempotencyKey,
  recordAnswerEvent,
} from '../infrastructure/profileQuestionRepository';
import { getHouseholdConsent } from '../infrastructure/consentRepository';
import {
  upsertHouseholdMemberSummary,
  createPetProfile,
  upsertHouseholdGoal,
  upsertHouseholdPreference,
  upsertLifestyleAttribute,
} from '../infrastructure/compositionDataRepository';
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
  placement?: string;
}

export interface RecordProfileAnswerResult {
  status: RecordProfileAnswerStatus;
}

const booleanAnswerSchema = z.object({ value: z.boolean() }).strict();
const presentAnswerSchema = z.object({ present: z.boolean() }).strict();
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

function validateAnswer(answerSchema: unknown, targetTable: string, answerJson: unknown): boolean {
  const schemaType =
    answerSchema && typeof answerSchema === 'object' && !Array.isArray(answerSchema)
      ? (answerSchema as Record<string, unknown>).type
      : undefined;

  if (targetTable === 'HOUSEHOLD_MEMBER_SUMMARY' && schemaType === 'multi_select') {
    return memberAnswerSchema.safeParse(answerJson).success;
  }
  if (targetTable === 'PET_PROFILE' && schemaType === 'select_with_detail') {
    return petAnswerSchema.safeParse(answerJson).success;
  }
  if (targetTable === 'HOUSEHOLD_GOAL' && schemaType === 'boolean') {
    return presentAnswerSchema.safeParse(answerJson).success;
  }
  if (
    (targetTable === 'HOUSEHOLD_PREFERENCE' || targetTable === 'LIFESTYLE_ATTRIBUTE') &&
    schemaType === 'boolean'
  ) {
    return booleanAnswerSchema.safeParse(answerJson).success;
  }
  return false;
}

async function writeCompositionData(
  householdId: string,
  targetTable: string,
  targetKey: string | null,
  answerJson: unknown,
  db: Prisma.TransactionClient,
): Promise<void> {
  const answer = (answerJson ?? {}) as Record<string, unknown>;

  switch (targetTable) {
    case 'HOUSEHOLD_MEMBER_SUMMARY': {
      if (answer.hasChildren === true) {
        await upsertHouseholdMemberSummary(householdId, { type: 'CHILD' }, db);
      }
      if (answer.hasSeniors === true) {
        await upsertHouseholdMemberSummary(householdId, { type: 'SENIOR' }, db);
      }
      return;
    }
    case 'PET_PROFILE': {
      if (answer.hasPet === true && typeof answer.petType === 'string') {
        await createPetProfile(householdId, { petType: answer.petType as 'DOG' | 'CAT' | 'OTHER' }, db);
      }
      return;
    }
    case 'HOUSEHOLD_GOAL': {
      if (answer.present === true && targetKey) {
        await upsertHouseholdGoal(householdId, { goalCode: targetKey }, db);
      }
      return;
    }
    case 'HOUSEHOLD_PREFERENCE': {
      if (targetKey) {
        await upsertHouseholdPreference(householdId, { key: targetKey, valueJson: { value: answer.value === true } }, db);
      }
      return;
    }
    case 'LIFESTYLE_ATTRIBUTE': {
      if (targetKey) {
        await upsertLifestyleAttribute(householdId, { key: targetKey, valueBoolean: answer.value === true }, db);
      }
      return;
    }
    default:
      return;
  }
}

export async function recordProfileAnswer(params: RecordProfileAnswerParams): Promise<RecordProfileAnswerResult> {
  const question = await loadQuestionById(params.questionId);
  if (!question) {
    return { status: 'QUESTION_NOT_FOUND' };
  }
  if (question.status !== 'ACTIVE' || (params.placement && !question.placementContexts.includes(params.placement))) {
    return { status: 'QUESTION_NOT_ACTIVE' };
  }

  if (params.action === 'ANSWERED' && !validateAnswer(question.answerSchema, question.targetTable, params.answerJson)) {
    return { status: 'INVALID_ANSWER' };
  }

  try {
    return await prisma.$transaction(async (db) => {
      const existing = await findAnswerByIdempotencyKey(params.idempotencyKey, db);
      if (existing) return { status: 'DUPLICATE' as const };

      if (params.action === 'ANSWERED') {
        const consent = await getHouseholdConsent(params.householdId, db);
        if (!consent?.consentVersion) return { status: 'CONSENT_REQUIRED' as const };
        await writeCompositionData(
          params.householdId,
          question.targetTable,
          question.targetKey,
          params.answerJson,
          db,
        );
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
