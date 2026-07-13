// apps/backend/src/modules/personalization/application/eraseHouseholdDataForUser.usecase.ts
//
// Closes the gap docs/personalization/05-data-model.md calls out directly:
// "current user anonymization alone is insufficient." user.controller.ts's
// deleteAccount anonymizes the User row in place and never deletes Household,
// so the onDelete: Cascade wired on HouseholdProperty/HouseholdMemberSummary/
// PetProfile/HouseholdGoal/HouseholdPreference/LifestyleAttribute/ProfileAnswer
// never fired. Must run inside the same transaction as the rest of account
// deletion (mirrors accountDeletionCascade.service.ts's cascadeDeleteOwnedProperties).
//
// Deliberately does NOT touch DerivedTrait/TraitSnapshot/PersonalizedRecommendation/
// RecommendationSuppression — those are onDelete: SetNull from Household (by
// design, they're property-scoped) and already get hard-deleted via
// cascadeDeleteOwnedProperties' own Property cascade when that runs in the
// same transaction. This is a household-deletion step, not a full
// personalization-reset job (revoking consent + erasure on demand, separate
// from account deletion, remains deferred Phase 1 work).
import { Prisma } from '@prisma/client';

export async function eraseHouseholdDataForUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.household.deleteMany({ where: { ownerUserId: userId } });
}
