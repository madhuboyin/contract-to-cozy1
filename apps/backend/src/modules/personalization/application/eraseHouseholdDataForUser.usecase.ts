// apps/backend/src/modules/personalization/application/eraseHouseholdDataForUser.usecase.ts
//
// Closes the gap docs/personalization/05-data-model.md calls out directly:
// "current user anonymization alone is insufficient." user.controller.ts's
// deleteAccount anonymizes the User row in place and never deletes Household,
// so the onDelete: Cascade wired on HouseholdProperty/ProfileAnswer never
// fired. Must run inside the same transaction as the rest of account
// deletion (mirrors accountDeletionCascade.service.ts's cascadeDeleteOwnedProperties).
//
// Deliberately does not touch property-owned DerivedTrait rows or property-only
// recommendations/suppressions. Property deletion handles those through its
// own cascades; optional-profile reset removes only household-owned outputs.
import { Prisma } from '@prisma/client';

export async function eraseHouseholdDataForUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.household.deleteMany({ where: { ownerUserId: userId } });
}
