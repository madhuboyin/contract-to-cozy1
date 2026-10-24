// A typed, durable acknowledgement for a journey step whose whole job is to be reviewed (continuation FRD section 27: proof policy ACKNOWLEDGEMENT).
//
// It is recorded as step evidence through the same completion path every other tool uses, with a typed payload naming the exact signal and its version, the step,
// the person, the time and the outcome. It is valid only for a true review step: a safety, financial, compliance, execution or repair step is never completed by a
// self-attestation, so the allowed step keys are listed here and nowhere else.

import { logger } from '../../lib/logger';
import { guidanceJourneyService } from './guidanceJourney.service';

/** The steps an acknowledgement may complete (tool `guidance-overview`). Anything else needs its own proof. */
export const ACKNOWLEDGEABLE_STEP_KEYS = ['review_signal'] as const;
export const ACKNOWLEDGEMENT_TOOL_KEY = 'guidance-overview';

export type StepAcknowledgement = {
  stepId: string;
  stepKey: string;
  journeyId: string;
  signalId: string | null;
  /** The signal as it was when it was reviewed (its last-updated time), so a later change to the signal is not covered by this review. */
  signalVersion: string | null;
  inventoryItemId?: string | null;
  signalIntentFamily?: string | null;
  acknowledgedAt: Date;
};

export function buildStepAcknowledgement(propertyId: string, actorUserId: string, ack: StepAcknowledgement) {
  return {
    propertyId,
    actorUserId,
    journeyId: ack.journeyId,
    inventoryItemId: ack.inventoryItemId ?? null,
    signalIntentFamily: ack.signalIntentFamily ?? 'generic_actionable_signal',
    sourceToolKey: ACKNOWLEDGEMENT_TOOL_KEY,
    sourceEntityType: 'GUIDANCE_SIGNAL',
    sourceEntityId: ack.signalId ?? ack.stepId,
    stepKey: ack.stepKey,
    status: 'COMPLETED' as const,
    dedupeKey: `acknowledgement:${propertyId}:${ack.stepId}:${ack.signalId ?? 'none'}:${ack.signalVersion ?? 'none'}`,
    producedData: {
      proofType: 'acknowledgement',
      proofId: ack.signalId ?? ack.stepId,
      outcome: 'REVIEWED',
      stepId: ack.stepId,
      signalId: ack.signalId,
      signalVersion: ack.signalVersion,
      actorUserId,
      acknowledgedAt: ack.acknowledgedAt.toISOString(),
    },
  };
}

/** Records an acknowledgement. Unlike a tool report this IS the write, so a failure is returned to the caller, not swallowed. */
export async function acknowledgeGuidanceStep(propertyId: string, actorUserId: string, ack: StepAcknowledgement): Promise<boolean> {
  if (!(ACKNOWLEDGEABLE_STEP_KEYS as readonly string[]).includes(ack.stepKey)) return false;
  try {
    await guidanceJourneyService.recordToolCompletion(buildStepAcknowledgement(propertyId, actorUserId, ack));
    return true;
  } catch (error) {
    logger.warn({ error, stepId: ack.stepId }, '[GUIDANCE] step acknowledgement failed');
    return false;
  }
}
