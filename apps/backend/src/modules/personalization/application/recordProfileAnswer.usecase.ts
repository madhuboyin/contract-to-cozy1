// apps/backend/src/modules/personalization/application/recordProfileAnswer.usecase.ts
//
// Processes an ANSWERED/SKIPPED/SNOOZED event for one question. Idempotent
// on idempotencyKey (same pattern as recordRecommendationFeedback.usecase.ts).
// Only ANSWERED ever touches a sensitive composition table, and only after
// confirming consent (PER-PRIV-002) — SKIPPED/SNOOZED never do (08-personalization-frd.md
// UC-10: "skip never creates inference").
//
// answerJson shape is fixed per targetTable for this starter question set
// (one question per table): HOUSEHOLD_MEMBER_SUMMARY -> {hasChildren,
// hasSeniors}, PET_PROFILE -> {hasPet, petType?}, HOUSEHOLD_GOAL -> {present},
// HOUSEHOLD_PREFERENCE -> {value}, LIFESTYLE_ATTRIBUTE -> {value}. A richer,
// per-question-defined answer schema (question.answerSchema is already Json,
// unused beyond documentation today) is later work once more than one
// question per table exists.
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

export type RecordProfileAnswerStatus = 'RECORDED' | 'DUPLICATE' | 'CONSENT_REQUIRED' | 'QUESTION_NOT_FOUND';

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

async function writeCompositionData(householdId: string, targetTable: string, targetKey: string | null, answerJson: unknown): Promise<void> {
  const answer = (answerJson ?? {}) as Record<string, unknown>;

  switch (targetTable) {
    case 'HOUSEHOLD_MEMBER_SUMMARY': {
      if (answer.hasChildren === true) {
        await upsertHouseholdMemberSummary(householdId, { type: 'CHILD' });
      }
      if (answer.hasSeniors === true) {
        await upsertHouseholdMemberSummary(householdId, { type: 'SENIOR' });
      }
      return;
    }
    case 'PET_PROFILE': {
      if (answer.hasPet === true && typeof answer.petType === 'string') {
        await createPetProfile(householdId, { petType: answer.petType as 'DOG' | 'CAT' | 'OTHER' });
      }
      return;
    }
    case 'HOUSEHOLD_GOAL': {
      if (answer.present === true && targetKey) {
        await upsertHouseholdGoal(householdId, { goalCode: targetKey });
      }
      return;
    }
    case 'HOUSEHOLD_PREFERENCE': {
      if (targetKey) {
        await upsertHouseholdPreference(householdId, { key: targetKey, valueJson: { value: answer.value === true } });
      }
      return;
    }
    case 'LIFESTYLE_ATTRIBUTE': {
      if (targetKey) {
        await upsertLifestyleAttribute(householdId, { key: targetKey, valueBoolean: answer.value === true });
      }
      return;
    }
    default:
      return;
  }
}

export async function recordProfileAnswer(params: RecordProfileAnswerParams): Promise<RecordProfileAnswerResult> {
  const existing = await findAnswerByIdempotencyKey(params.idempotencyKey);
  if (existing) {
    return { status: 'DUPLICATE' };
  }

  const question = await loadQuestionById(params.questionId);
  if (!question) {
    return { status: 'QUESTION_NOT_FOUND' };
  }

  if (params.action === 'ANSWERED') {
    const consent = await getHouseholdConsent(params.householdId);
    if (!consent?.consentVersion) {
      return { status: 'CONSENT_REQUIRED' };
    }
    await writeCompositionData(params.householdId, question.targetTable, question.targetKey, params.answerJson);
  }

  await recordAnswerEvent({
    questionId: params.questionId,
    householdId: params.householdId,
    idempotencyKey: params.idempotencyKey,
    action: params.action,
    answerJson: params.action === 'ANSWERED' ? (params.answerJson ?? null) : null,
    nextEligibleAt: computeNextEligibleAt(params.action),
  });

  return { status: 'RECORDED' };
}
