/**
 * FRD-FR-11/FR-12: Journey completion side-effect hooks.
 *
 * Lives in its own file to avoid circular imports between
 * guidanceJourney.service.ts ↔ guidanceStepResolver.service.ts.
 *
 * Called by guidanceStepResolver.service.ts when recomputeJourneyState()
 * determines that a journey has transitioned to COMPLETED for the first time.
 *
 * Side effects (only for isUserInitiated journeys):
 *   FR-12 — Sets InventoryItem.condition = GOOD
 *   FR-11 — Creates a HomeEvent of type VERIFIED_RESOLUTION linked to the journey
 *
 * Note: lastServicedOn is already updated by booking.service.ts when a booking
 * transitions to COMPLETED (Phase 5.1). Do not overwrite it here.
 */

import { prisma } from '../../lib/prisma';

export async function runJourneyCompletionHooks(journeyId: string): Promise<void> {
  const db = prisma as any;

  const journey = await db.guidanceJourney.findUnique({
    where: { id: journeyId },
    select: {
      id: true,
      propertyId: true,
      inventoryItemId: true,
      issueType: true,
      isUserInitiated: true,
    },
  });

  // Only run for user-initiated journeys — system/signal journeys are not
  // "resolved" in the FRD sense and should not produce certified records.
  if (!journey?.isUserInitiated) return;

  await db.$transaction(async (tx: any) => {
    // FR-12: Mark the asset condition as GOOD now that the issue is resolved.
    // InventoryItemCondition enum: NEW | GOOD | FAIR | POOR | UNKNOWN
    if (journey.inventoryItemId) {
      await tx.inventoryItem.update({
        where: { id: journey.inventoryItemId },
        data: { condition: 'GOOD' },
      });
    }

    // FR-11: Create the certified VERIFIED_RESOLUTION HomeEvent.
    // guidanceJourneyId links the event back to the journey for the history
    // sidebar and for the 2-year lookback check (getAssetResolutionContext).
    await tx.homeEvent.create({
      data: {
        propertyId: journey.propertyId,
        inventoryItemId: journey.inventoryItemId ?? undefined,
        guidanceJourneyId: journey.id,
        type: 'VERIFIED_RESOLUTION',
        title: `Issue resolved: ${journey.issueType ?? 'Asset serviced'}`,
        summary:
          'Guided resolution completed via the Guidance Engine. All required steps were verified.',
        occurredAt: new Date(),
        sourceBadge: 'VERIFIED',
        importance: 'HIGH',
        isRetrospective: false,
      },
    });
  });
}
