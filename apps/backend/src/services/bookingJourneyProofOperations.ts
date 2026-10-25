// A provider-confirmed booking as the proof of a journey's "the service was done" steps (continuation FRD section 50): `confirm_cleaning_complete` and `track_resolution`.
//
// The service outcome is the PROVIDER's, so a homeowner's say-so never completes these steps. The proof is a booking that belongs to this exact journey (the booking stored the journey when it was
// created from the journey's booking step; no booking is matched by category), whose provider completed it (`COMPLETED`, provider identity and `completedAt` on the booking) and that no
// dispute case was opened on after that completion. It is versioned by the completion time. If the provider's completion is later withdrawn (cancelled) or disputed, the evidence is invalidated (kept, with
// the reason), the exact step reopens, the journey is active again and the homeowner is told; a provider's later re-completion is new evidence that supersedes the invalidated row.

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';
import { resolveGuidanceStepBindingByKey } from './guidanceEngine/guidanceStepBinding';
import { getGuidanceModels } from './guidanceEngine/guidanceTypes';
import { invalidateEvidence, reopenStepAfterReversal, supersedeInvalidated } from './guidanceEngine/guidanceProofReversal';

export const BOOKING_PROOF_TOOL_KEY = 'guidance-overview';
export const BOOKING_PROOF_STEP_KEYS = ['confirm_cleaning_complete', 'track_resolution'];

type BookingRow = { id: string; propertyId: string; homeownerId: string; status: string; providerId: string | null; completedAt: Date | null; guidanceJourneyId: string | null; inventoryItemId: string | null; finalPrice?: unknown };

/** Whether the booking's completion stands as proof right now: provider-completed, with identity and time, and no dispute case opened after it. */
export async function bookingCompletionStands(booking: Pick<BookingRow, 'id' | 'status' | 'providerId' | 'completedAt'>): Promise<boolean> {
  if (booking.status !== 'COMPLETED' || !booking.providerId || !booking.completedAt) return false;
  const disputed = await prisma.adminCase.count({ where: { type: 'DISPUTE', entityType: 'BOOKING', entityId: booking.id, createdAt: { gt: booking.completedAt } } });
  return disputed === 0;
}

export function buildBookingServiceCompletion(booking: BookingRow, binding: { journeyId: string; stepKey: string; signalIntentFamily: string | null; inventoryItemId: string | null }) {
  const version = booking.completedAt!.toISOString();
  return {
    propertyId: booking.propertyId, actorUserId: booking.homeownerId, journeyId: binding.journeyId, inventoryItemId: binding.inventoryItemId ?? booking.inventoryItemId ?? null,
    signalIntentFamily: binding.signalIntentFamily ?? 'service_needed', issueDomain: 'MAINTENANCE' as const,
    sourceToolKey: BOOKING_PROOF_TOOL_KEY, sourceEntityType: 'BOOKING', sourceEntityId: booking.id, stepKey: binding.stepKey, status: 'COMPLETED' as const,
    dedupeKey: `booking-service-completed:${booking.propertyId}:${booking.id}:${version}:${binding.stepKey}`,
    producedData: { proofType: 'booking_service_completed', proofId: booking.id, bookingId: booking.id, providerId: booking.providerId, completedAt: version },
  };
}

/** Called after a booking changes. Reports, invalidates or reinstates the proof for the journey the booking belongs to. Never throws. */
export async function syncBookingJourneyProofs(bookingId: string): Promise<{ reported: number; reopened: number }> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true, propertyId: true, homeownerId: true, status: true, providerId: true, completedAt: true, guidanceJourneyId: true, inventoryItemId: true } });
  if (!booking?.guidanceJourneyId) return { reported: 0, reopened: 0 };
  const standing = await bookingCompletionStands(booking);
  const { guidanceStepEvidence } = getGuidanceModels();
  let reported = 0; let reopened = 0;
  for (const stepKey of BOOKING_PROOF_STEP_KEYS) {
    // The booking names its journey, so the step is found by that journey and the key; it must still be this tool's open step (a completed one is only reopened on reversal).
    const steps = await getGuidanceModels().guidanceJourneyStep.findFirst({ where: { journeyId: booking.guidanceJourneyId, stepKey, toolKey: BOOKING_PROOF_TOOL_KEY, journey: { propertyId: booking.propertyId } }, select: { id: true } });
    if (!steps) continue;
    if (standing) {
      const bound = await resolveGuidanceStepBindingByKey(booking.propertyId, booking.guidanceJourneyId, stepKey, { toolKey: BOOKING_PROOF_TOOL_KEY });
      if (!bound.ok) continue;
      try {
        await guidanceJourneyService.recordToolCompletion(buildBookingServiceCompletion(booking as BookingRow, bound.binding));
        reported += 1;
        const fresh = await guidanceStepEvidence.findFirst({ where: { stepId: steps.id, evidenceRefType: 'BOOKING', evidenceRefId: booking.id, invalidatedAt: null }, orderBy: { createdAt: 'desc' } });
        const old = await guidanceStepEvidence.findMany({ where: { stepId: steps.id, evidenceRefType: 'BOOKING', evidenceRefId: booking.id, NOT: { invalidatedAt: null }, supersededById: null } });
        if (fresh && old.length) await supersedeInvalidated(old, fresh.id);
      } catch (error) {
        logger.warn({ error, bookingId, stepKey }, '[GUIDANCE] booking service completion report failed');
      }
      continue;
    }
    const reason = booking.status === 'CANCELLED' ? 'the booking was cancelled after the provider confirmed it complete'
      : booking.status === 'DISPUTED' || booking.completedAt ? 'the provider-confirmed completion of the booking was disputed or is no longer confirmed' : null;
    if (!reason) continue;
    const invalidated = await invalidateEvidence({ stepId: steps.id, evidenceRefType: 'BOOKING', evidenceRefId: booking.id }, reason);
    if (invalidated.length === 0) continue;
    // This booking was the step's only proof, so the step does not stay completed.
    const did = await reopenStepAfterReversal({ propertyId: booking.propertyId, stepId: steps.id, reasonCode: booking.status === 'CANCELLED' ? 'PROVIDER_COMPLETION_WITHDRAWN' : 'PROVIDER_COMPLETION_DISPUTED', reason, notifyUserId: booking.homeownerId });
    if (did) reopened += 1;
  }
  return { reported, reopened };
}
