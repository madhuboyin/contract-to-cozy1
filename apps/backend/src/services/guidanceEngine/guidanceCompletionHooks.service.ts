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
 *   FR-12 — Sets InventoryItem.condition based on repair/replace verdict:
 *           REPLACE_NOW | REPLACE_SOON → condition = NEW, installedOn = now
 *           REPAIR_AND_MONITOR | REPAIR_ONLY | (no verdict) → condition = GOOD
 *   FR-11 — Creates a HomeEvent of type VERIFIED_RESOLUTION linked to the journey
 *
 * Note: lastServicedOn is already updated by booking.service.ts when a booking
 * transitions to COMPLETED (Phase 5.1). Do not overwrite it here.
 */

import { prisma } from '../../lib/prisma';

const REPLACEMENT_VERDICTS = new Set(['REPLACE_NOW', 'REPLACE_SOON']);

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
      derivedSnapshotJson: true,
    },
  });

  // Only run for user-initiated journeys — system/signal journeys are not
  // "resolved" in the FRD sense and should not produce certified records.
  if (!journey?.isUserInitiated) return;

  // FR-12: Determine whether the resolution was a replacement or a repair by
  // reading the replaceRepairVerdict stored in derivedSnapshotJson when the
  // repair_replace_decision step was completed.
  const derivedLatest =
    journey.derivedSnapshotJson &&
    typeof journey.derivedSnapshotJson === 'object' &&
    !Array.isArray(journey.derivedSnapshotJson)
      ? ((journey.derivedSnapshotJson as Record<string, unknown>).latest as Record<string, unknown> | undefined)
      : undefined;
  const replaceRepairVerdict =
    typeof derivedLatest?.replaceRepairVerdict === 'string'
      ? derivedLatest.replaceRepairVerdict
      : null;
  const isReplacement = replaceRepairVerdict !== null && REPLACEMENT_VERDICTS.has(replaceRepairVerdict);

  const now = new Date();

  await db.$transaction(async (tx: any) => {
    if (journey.inventoryItemId) {
      if (isReplacement) {
        // FR-12 (replacement path): Asset was replaced — reset age and mark as NEW.
        // installedOn is set to today so all age-based calculations (health score,
        // lifecycle signals, expected expiry) restart from the replacement date.
        await tx.inventoryItem.update({
          where: { id: journey.inventoryItemId },
          data: {
            condition: 'NEW',
            installedOn: now,
            // Clear any previously computed expiry — the AI oracle will
            // recalculate it on the next health score pass with the new age.
            expectedExpiryDate: null,
          },
        });
      } else {
        // FR-12 (repair path): Issue resolved — mark condition as GOOD.
        await tx.inventoryItem.update({
          where: { id: journey.inventoryItemId },
          data: { condition: 'GOOD' },
        });
      }
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
        title: isReplacement
          ? `Asset replaced: ${journey.issueType ?? 'Replacement completed'}`
          : `Issue resolved: ${journey.issueType ?? 'Asset serviced'}`,
        summary: isReplacement
          ? 'Asset was replaced as part of a guided resolution. Age and condition have been reset.'
          : 'Guided resolution completed via the Guidance Engine. All required steps were verified.',
        occurredAt: now,
        sourceBadge: 'VERIFIED',
        importance: 'HIGH',
        isRetrospective: false,
      },
    });
  });
}
