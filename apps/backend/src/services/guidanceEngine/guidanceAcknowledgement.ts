// A typed, durable acknowledgement for a journey step whose whole job is to be reviewed (continuation FRD section 27: proof policy ACKNOWLEDGEMENT).
//
// It is recorded as step evidence through the same completion path every other tool uses, with a typed payload naming the exact signal and its version, the step,
// the person, the time and the outcome. It is valid only for a true review step: a safety, financial, compliance, execution or repair step is never completed by a
// self-attestation, so the allowed step keys are listed here and nowhere else. `review_compliance_requirement` is reading and understanding a requirement (what, when, what proof is needed);
// meeting the requirement is a different step with its own proof.

import { logger } from '../../lib/logger';
import { guidanceJourneyService } from './guidanceJourney.service';
import { getGuidanceModels } from './guidanceTypes';
import { resolveGuidanceStepBinding, type GuidanceStepRefusal } from './guidanceStepBinding';

/** The steps an acknowledgement may complete (tool `guidance-overview`). Anything else needs its own proof. */
export const ACKNOWLEDGEABLE_STEP_KEYS = ['review_signal', 'review_compliance_requirement'] as const;
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
  /** What the homeowner decided to do about it (Desktop's quick decision); not part of the proof of review. */
  disposition?: AcknowledgementDisposition | null;
  note?: string | null;
};

export const ACKNOWLEDGEMENT_DISPOSITIONS = ['act_now', 'plan_soon', 'monitor'] as const;
export type AcknowledgementDisposition = (typeof ACKNOWLEDGEMENT_DISPOSITIONS)[number];

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
      ...(ack.disposition ? { signalDisposition: ack.disposition } : {}),
      ...(ack.note ? { note: ack.note.slice(0, 500) } : {}),
    },
  };
}

/** Records an acknowledgement and returns what the guidance engine returned (the signal, journey and step), or null. This IS the write, so a failure is the caller's to report. */
export async function recordStepAcknowledgement(propertyId: string, actorUserId: string, ack: StepAcknowledgement) {
  if (!(ACKNOWLEDGEABLE_STEP_KEYS as readonly string[]).includes(ack.stepKey)) return null;
  try {
    return await guidanceJourneyService.recordToolCompletion(buildStepAcknowledgement(propertyId, actorUserId, ack));
  } catch (error) {
    logger.warn({ error, stepId: ack.stepId }, '[GUIDANCE] step acknowledgement failed');
    return null;
  }
}

/** Records an acknowledgement. Unlike a tool report this IS the write, so a failure is returned to the caller, not swallowed. */
export async function acknowledgeGuidanceStep(propertyId: string, actorUserId: string, ack: StepAcknowledgement): Promise<boolean> {
  return (await recordStepAcknowledgement(propertyId, actorUserId, ack)) !== null;
}

export type AcknowledgeByStepResult = { ok: true; result: NonNullable<Awaited<ReturnType<typeof recordStepAcknowledgement>>> } | { ok: false; reason: GuidanceStepRefusal | 'RECORD_FAILED' };

/**
 * The Desktop entry: acknowledge a step by id. It re-reads the step inside the home, requires the guidance-overview tool's open acknowledgeable step on an open journey, names the signal as it
 * stands now, and records the same typed proof Ask records. There is no other way for a review step to be completed.
 */
export async function acknowledgeGuidanceStepById(propertyId: string, actorUserId: string, stepId: string, extras: { disposition?: AcknowledgementDisposition | null; note?: string | null } = {}): Promise<AcknowledgeByStepResult> {
  const bound = await resolveGuidanceStepBinding(propertyId, stepId, { toolKey: ACKNOWLEDGEMENT_TOOL_KEY, stepKeys: ACKNOWLEDGEABLE_STEP_KEYS });
  if (!bound.ok) return { ok: false, reason: bound.reason };
  const step = await getGuidanceModels().guidanceJourneyStep.findFirst({
    where: { id: stepId, journey: { propertyId } },
    select: { journey: { select: { primarySignal: { select: { id: true, signalIntentFamily: true, updatedAt: true } } } } },
  });
  const signal = step?.journey.primarySignal ?? null;
  const result = await recordStepAcknowledgement(propertyId, actorUserId, {
    stepId, stepKey: bound.binding.stepKey, journeyId: bound.binding.journeyId, signalId: signal?.id ?? null,
    signalVersion: signal?.updatedAt ? new Date(signal.updatedAt).toISOString() : null, inventoryItemId: bound.binding.inventoryItemId,
    signalIntentFamily: signal?.signalIntentFamily ?? null, acknowledgedAt: new Date(), disposition: extras.disposition ?? null, note: extras.note ?? null,
  });
  return result ? { ok: true, result } : { ok: false, reason: 'RECORD_FAILED' };
}
