// apps/backend/src/modules/personalization/infrastructure/compositionDataRepository.ts
//
// One small write function per composition table, called only from
// application/recordProfileAnswer.usecase.ts on an ANSWERED (consented)
// event. These five tables have existed since Phase 1 step 1 but stayed
// empty until this file — "do not infer composition," only ever write what
// a household explicitly answered.
//
// HouseholdMemberSummary/HouseholdGoal/HouseholdPreference/LifestyleAttribute
// all key their `@@unique` on a column that can be null (lifeStage/propertyId)
// — Prisma's generated compound-unique `where` input requires a non-null
// value for those fields, so `upsert`'s `where` can't target a null-keyed row
// at all. findFirst-then-create-or-update below is the manual equivalent
// (same "filter/match in application code, not a Prisma `where`" convention
// already used for loadActiveRule/suppressionRepository); non-atomic, but
// safe here since isQuestionEligible already prevents a household from
// reaching this call more than once for the same question.
import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

type PersonalizationDb = typeof prisma | Prisma.TransactionClient;

export async function upsertHouseholdMemberSummary(
  householdId: string,
  params: { type: 'CHILD' | 'SENIOR' | 'ADULT'; lifeStage?: string | null; count?: number },
  db: PersonalizationDb = prisma,
): Promise<void> {
  const lifeStage = params.lifeStage ?? null;
  const existing = await db.householdMemberSummary.findFirst({
    where: { householdId, type: params.type, lifeStage },
    select: { id: true },
  });

  if (existing) {
    await db.householdMemberSummary.update({
      where: { id: existing.id },
      data: { count: params.count ?? 1, status: 'ACTIVE' },
    });
    return;
  }

  await db.householdMemberSummary.create({
    data: {
      householdId,
      type: params.type,
      lifeStage,
      count: params.count ?? 1,
      source: 'USER_INPUT',
    },
  });
}

/**
 * No unique constraint exists on PetProfile (pre-existing schema gap, not
 * introduced here) — a plain create is safe in practice because
 * isQuestionEligible already prevents a household from answering the same
 * question (and therefore reaching this call) more than once.
 */
export async function createPetProfile(
  householdId: string,
  params: {
    petType: 'DOG' | 'CAT' | 'OTHER';
    count?: number;
    sizeBand?: string;
    sheddingLevel?: string;
    indoorOutdoor?: string;
    yardFenceDependent?: boolean;
  },
  db: PersonalizationDb = prisma,
): Promise<void> {
  await db.petProfile.create({
    data: {
      householdId,
      petType: params.petType,
      count: params.count ?? 1,
      sizeBand: params.sizeBand,
      sheddingLevel: params.sheddingLevel,
      indoorOutdoor: params.indoorOutdoor,
      yardFenceDependent: params.yardFenceDependent,
      status: 'ACTIVE',
    },
  });
}

export async function upsertHouseholdGoal(
  householdId: string,
  params: { goalCode: string; propertyId?: string | null; priority?: number; horizon?: string },
  db: PersonalizationDb = prisma,
): Promise<void> {
  const propertyId = params.propertyId ?? null;
  const existing = await db.householdGoal.findFirst({
    where: { householdId, propertyId, goalCode: params.goalCode },
    select: { id: true },
  });

  if (existing) {
    await db.householdGoal.update({
      where: { id: existing.id },
      data: { priority: params.priority ?? 0, horizon: params.horizon, status: 'ACTIVE' },
    });
    return;
  }

  await db.householdGoal.create({
    data: {
      householdId,
      propertyId,
      goalCode: params.goalCode,
      priority: params.priority ?? 0,
      horizon: params.horizon,
      source: 'USER_INPUT',
    },
  });
}

export async function upsertHouseholdPreference(
  householdId: string,
  params: { key: string; propertyId?: string | null; valueJson: unknown },
  db: PersonalizationDb = prisma,
): Promise<void> {
  const propertyId = params.propertyId ?? null;
  const existing = await db.householdPreference.findFirst({
    where: { householdId, propertyId, key: params.key },
    select: { id: true },
  });

  if (existing) {
    await db.householdPreference.update({
      where: { id: existing.id },
      data: { valueJson: params.valueJson as Prisma.InputJsonValue, status: 'ACTIVE' },
    });
    return;
  }

  await db.householdPreference.create({
    data: {
      householdId,
      propertyId,
      key: params.key,
      valueJson: params.valueJson as Prisma.InputJsonValue,
    },
  });
}

export async function upsertLifestyleAttribute(
  householdId: string,
  params: { key: string; propertyId?: string | null; valueBoolean?: boolean; source?: string; confidence?: number },
  db: PersonalizationDb = prisma,
): Promise<void> {
  const propertyId = params.propertyId ?? null;
  const existing = await db.lifestyleAttribute.findFirst({
    where: { householdId, propertyId, key: params.key },
    select: { id: true },
  });

  if (existing) {
    await db.lifestyleAttribute.update({
      where: { id: existing.id },
      data: { valueBoolean: params.valueBoolean, status: 'ACTIVE' },
    });
    return;
  }

  await db.lifestyleAttribute.create({
    data: {
      householdId,
      propertyId,
      key: params.key,
      source: params.source ?? 'EXPLICIT',
      confidence: params.confidence ?? 1.0,
      valueBoolean: params.valueBoolean,
    },
  });
}
