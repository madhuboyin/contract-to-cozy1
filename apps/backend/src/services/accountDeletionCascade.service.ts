// apps/backend/src/services/accountDeletionCascade.service.ts
//
// Closes the gap flagged in docs/personalization/11-risks-and-open-questions.md
// ("Profile deletion incomplete"): user.controller.ts's deleteAccount only ever
// anonymized the User row — HomeownerProfile/Property/household domain data
// survived forever, orphaned under the anonymized shell user.
import { Prisma } from '@prisma/client';

export class HouseholdOwnershipBlockedError extends Error {
  constructor(public properties: Array<{ id: string; name: string | null }>) {
    super(
      'Cannot delete account while other household members remain on properties you own. Transfer ownership or remove them first.'
    );
    this.name = 'HouseholdOwnershipBlockedError';
  }
}

/**
 * Hard-deletes every property owned by this user's HomeownerProfile, along
 * with its property-scoped domain data — but only if no other household
 * member (CONTRIBUTOR/VIEWER) remains on any of those properties. If any
 * owned property still has other members, throws HouseholdOwnershipBlockedError
 * without mutating anything, so the caller can ask the user to transfer
 * ownership or remove those members first.
 *
 * Must run inside the same transaction as the rest of account deletion.
 *
 * Scope note: this covers the property-scoped tables that are either wired
 * with a real onDelete: Cascade relation to Property in schema.prisma (the
 * large majority — cascades automatically via homeownerProfile.delete()
 * below) or that this function deletes explicitly because they have no FK
 * relation at all (SellerPrepPlan, SellerPrepLead, Feedback). It deliberately
 * does NOT touch event/audit-style tables (DomainEvent, AuditLog, Incident*
 * event/suppression tables, Orchestration* traces, SignalProvenance) or the
 * deliberately loosely-coupled Gazette family (see GazetteStory's "no FK to
 * upstream domain tables" comment in schema.prisma) — those are left as a
 * separate, explicit follow-up decision rather than guessed at here.
 */
export async function cascadeDeleteOwnedProperties(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<void> {
  const homeownerProfile = await tx.homeownerProfile.findUnique({
    where: { userId },
    select: {
      properties: {
        select: {
          id: true,
          name: true,
          householdMembers: { select: { userId: true } },
        },
      },
    },
  });

  if (!homeownerProfile) {
    return;
  }

  const blocked = homeownerProfile.properties.filter((property) =>
    property.householdMembers.some((member) => member.userId !== userId)
  );

  if (blocked.length > 0) {
    throw new HouseholdOwnershipBlockedError(
      blocked.map((property) => ({ id: property.id, name: property.name }))
    );
  }

  // Explicit cleanup for property-scoped tables with no FK/cascade wired in
  // schema.prisma — homeownerProfile.delete() below won't touch these.
  for (const property of homeownerProfile.properties) {
    await tx.sellerPrepPlan.deleteMany({ where: { propertyId: property.id } });
    await tx.sellerPrepLead.deleteMany({ where: { propertyId: property.id } });
    await tx.feedback.deleteMany({ where: { propertyId: property.id } });
    // PropertySaleCase → SaleReadinessItem/PropertyTransition cascade via a
    // real Prisma relation, but PropertySaleCase.propertyId itself is a
    // loose FK (no relation to Property), so it needs the same explicit
    // cleanup as SellerPrepPlan above.
    await tx.propertySaleCase.deleteMany({ where: { propertyId: property.id } });
  }

  // Cascades Property + every properly FK'd property-scoped table (the vast
  // majority of the schema), including this user's own HouseholdMember rows
  // on these properties.
  await tx.homeownerProfile.delete({ where: { userId } });

  // Remove this user's membership on properties they don't own (household
  // collaborator/viewer elsewhere) — the property and its owner are untouched.
  await tx.householdMember.deleteMany({ where: { userId } });
}
