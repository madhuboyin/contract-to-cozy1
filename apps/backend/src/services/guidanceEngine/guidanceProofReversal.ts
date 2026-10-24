// When the only proof of a completed step is reversed (a provider withdrew or lost a confirmed completion, or it was disputed), the step must not stay completed (continuation FRD section 47).
// The original evidence is PRESERVED: it is marked invalidated with the reversal reason, never deleted. The exact step is reopened, a journey that had completed is active again and needs
// attention, and the homeowner is told. A later reconfirmation records NEW evidence, which supersedes the invalidated row.

import { getGuidanceModels } from './guidanceTypes';
import { logger } from '../../lib/logger';
import { NotificationService } from '../notification.service';

/** Marks active evidence rows as invalidated with the reason; the rows stay. Returns the invalidated rows. */
export async function invalidateEvidence(where: { stepId?: string; evidenceRefType: string; evidenceRefId: string }, reason: string): Promise<any[]> {
  const { guidanceStepEvidence } = getGuidanceModels();
  const rows = await guidanceStepEvidence.findMany({ where: { ...where, invalidatedAt: null, status: { notIn: ['REJECTED', 'SUPERSEDED'] } } });
  const now = new Date();
  for (const row of rows) {
    await guidanceStepEvidence.update({
      where: { id: row.id },
      data: { invalidatedAt: now, status: 'REJECTED', metadataJson: { ...(row.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson) ? row.metadataJson : {}), reversalReason: reason, invalidatedAt: now.toISOString() } },
    });
  }
  return rows;
}

/** Records that newer evidence replaces the invalidated rows (so the trail reads old -> new). */
export async function supersedeInvalidated(rows: Array<{ id: string }>, newEvidenceId: string): Promise<void> {
  const { guidanceStepEvidence } = getGuidanceModels();
  for (const row of rows) await guidanceStepEvidence.update({ where: { id: row.id }, data: { supersededById: newEvidenceId } }).catch(() => null);
}

/**
 * Reopens a completed step whose proof was reversed, reactivates its journey if it had completed, writes the events and notifies the homeowner. Does nothing for a step that is not completed.
 * Side effects a completed journey already produced (e.g. a resolution event) are not unwound here.
 */
export async function reopenStepAfterReversal(args: { propertyId: string; stepId: string; reasonCode: string; reason: string; notifyUserId: string | null }): Promise<boolean> {
  const { guidanceJourney, guidanceJourneyStep, guidanceJourneyEvent } = getGuidanceModels();
  const step = await guidanceJourneyStep.findFirst({ where: { id: args.stepId, journey: { propertyId: args.propertyId } }, include: { journey: true } });
  if (!step || step.status !== 'COMPLETED') return false;
  await guidanceJourneyStep.update({ where: { id: step.id }, data: { status: 'PENDING', completedAt: null } });
  await guidanceJourneyEvent.create({
    data: { propertyId: args.propertyId, journeyId: step.journeyId, stepId: step.id, eventType: 'STEP_STATUS_CHANGED', actorType: 'SYSTEM', fromStepStatus: 'COMPLETED', toStepStatus: 'PENDING', reasonCode: args.reasonCode, payloadJson: { reason: args.reason } },
  });
  const journey = step.journey;
  const reactivate = journey.status === 'COMPLETED';
  await guidanceJourney.update({
    where: { id: journey.id },
    data: { ...(reactivate ? { status: 'ACTIVE', completedAt: null } : {}), currentStepKey: step.stepKey, currentStepOrder: step.stepOrder, version: { increment: 1 } },
  });
  if (reactivate) {
    await guidanceJourneyEvent.create({
      data: { propertyId: args.propertyId, journeyId: journey.id, eventType: 'JOURNEY_STATUS_CHANGED', actorType: 'SYSTEM', fromJourneyStatus: 'COMPLETED', toJourneyStatus: 'ACTIVE', reasonCode: args.reasonCode },
    });
  }
  if (args.notifyUserId) {
    await NotificationService.create({
      userId: args.notifyUserId, type: 'GUIDANCE_STEP_REOPENED', title: 'A completed step needs attention again',
      message: `"${step.label}" was reopened: ${args.reason}`,
      actionUrl: `/dashboard/properties/${args.propertyId}/tools/guidance-overview?journeyId=${journey.id}`,
      entityType: 'GUIDANCE_JOURNEY', entityId: journey.id, metadata: { propertyId: args.propertyId, journeyId: journey.id, stepId: step.id, reasonCode: args.reasonCode },
    }).catch((error: unknown) => logger.warn({ error, stepId: step.id }, '[GUIDANCE] reopen notification failed'));
  }
  return true;
}
