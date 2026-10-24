// Keeps journey proof in step with a provider-confirmed booking (continuation FRD section 47). Called after the booking completes, is cancelled, or a dispute is opened or closed on it.
//
//   - Booking COMPLETED (by its provider) and not disputed since: the tasks explicitly linked to it (`bookingId`) report to their linked journey steps through the shared reporter.
//   - Completion withdrawn (cancelled), disputed or no longer COMPLETED: the booking's evidence rows are invalidated with the reason (kept, never deleted). If other verified evidence remains the
//     step is re-reported on that; otherwise the exact step is reopened, the journey is active again and the homeowner is notified.
//   - A provider's later re-completion is a new version (new completion time) and records new evidence that supersedes the invalidated rows.

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { bookingCompletionEvidence, reportLinkedTaskCompletion, verifiedCompletionEvidence } from './maintenanceTaskJourneyOperations';
import { invalidateEvidence, reopenStepAfterReversal, supersedeInvalidated } from './guidanceEngine/guidanceProofReversal';
import { getGuidanceModels } from './guidanceEngine/guidanceTypes';

function reversalReason(booking: { status: string }, disputed: boolean): { code: string; text: string } {
  if (disputed || booking.status === 'DISPUTED') return { code: 'PROVIDER_COMPLETION_DISPUTED', text: 'the provider-confirmed completion of the linked booking was disputed' };
  if (booking.status === 'CANCELLED') return { code: 'PROVIDER_COMPLETION_WITHDRAWN', text: 'the linked booking was cancelled after it was confirmed complete' };
  return { code: 'PROVIDER_COMPLETION_WITHDRAWN', text: 'the provider no longer confirms the linked booking as complete' };
}

export async function syncBookingMaintenanceProofs(bookingId: string): Promise<{ reported: number; reopened: number }> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true, propertyId: true, status: true, completedAt: true, providerId: true } });
  if (!booking) return { reported: 0, reopened: 0 };
  const tasks = await prisma.propertyMaintenanceTask.findMany({ where: { bookingId, propertyId: booking.propertyId } });
  let reported = 0; let reopened = 0;
  for (const task of tasks) {
    const links = await prisma.guidanceStepMaintenanceTaskLink.findMany({ where: { maintenanceTaskId: task.id, propertyId: booking.propertyId } });
    if (links.length === 0) continue;
    const proof = await bookingCompletionEvidence(task);
    const { guidanceStepEvidence } = getGuidanceModels();
    if (proof) {
      reported += (await reportLinkedTaskCompletion(null, task.id)).length;
      // Newer evidence supersedes any invalidated rows for the same booking and step.
      for (const link of links) {
        const fresh = await guidanceStepEvidence.findFirst({ where: { stepId: link.stepId, evidenceRefType: 'BOOKING', evidenceRefId: bookingId, invalidatedAt: null }, orderBy: { createdAt: 'desc' } });
        const old = await guidanceStepEvidence.findMany({ where: { stepId: link.stepId, evidenceRefType: 'BOOKING', evidenceRefId: bookingId, NOT: { invalidatedAt: null }, supersededById: null } });
        if (fresh && old.length) await supersedeInvalidated(old, fresh.id);
      }
      continue;
    }
    const disputed = (await prisma.adminCase.count({ where: { type: 'DISPUTE', entityType: 'BOOKING', entityId: bookingId, ...(booking.completedAt ? { createdAt: { gt: booking.completedAt } } : {}) } })) > 0;
    const reason = reversalReason(booking, disputed);
    for (const link of links) {
      const invalidated = await invalidateEvidence({ stepId: link.stepId, evidenceRefType: 'BOOKING', evidenceRefId: bookingId }, reason.text);
      if (invalidated.length === 0) continue;
      // Other verified evidence (a Home Record, a verified Home Event) may still carry the step; only then is it re-reported rather than reopened.
      const remaining = await verifiedCompletionEvidence(task);
      if (remaining.length > 0) {
        // The step stays done, now on the remaining proof: it is briefly reopened (silently) so the shared reporter can record that proof as the step's new evidence.
        await reopenStepAfterReversal({ propertyId: booking.propertyId, stepId: link.stepId, reasonCode: reason.code, reason: reason.text, notifyUserId: null });
        await reportLinkedTaskCompletion(null, task.id);
        continue;
      }
      const did = await reopenStepAfterReversal({ propertyId: booking.propertyId, stepId: link.stepId, reasonCode: reason.code, reason: reason.text, notifyUserId: link.linkedByUserId ?? null });
      if (did) reopened += 1;
    }
  }
  return { reported, reopened };
}

/** Post-commit hook for booking paths: a failure here never fails the booking write. */
export async function syncBookingMaintenanceProofsSafely(bookingId: string): Promise<void> {
  try {
    await syncBookingMaintenanceProofs(bookingId);
  } catch (error) {
    logger.warn({ error, bookingId }, '[GUIDANCE] booking proof sync failed');
  }
}
