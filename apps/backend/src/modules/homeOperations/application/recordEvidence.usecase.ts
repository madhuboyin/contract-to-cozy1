import type { OperationalWorkEvidenceType, OperationalWorkEvidenceVerificationStatus } from '@prisma/client';
import { recordWorkEvent, recordWorkEvidence } from '../infrastructure/workItemRepository';

/**
 * Home Operations Slice 8: pairs the evidence write with a recordWorkEvent,
 * matching every sibling usecase's shape (assignOwner, watchers,
 * recordDuplicateDecision) — recordWorkEvidence itself is a bare repository
 * function with no event pairing until now.
 */
export async function recordEvidence(input: {
  workItemId: string;
  evidenceType: OperationalWorkEvidenceType;
  evidenceEntityId: string;
  verificationStatus?: OperationalWorkEvidenceVerificationStatus;
  observedAt: Date;
  actorUserId: string;
  idempotencyKey: string;
}) {
  const evidence = await recordWorkEvidence({
    workItemId: input.workItemId,
    evidenceType: input.evidenceType,
    evidenceEntityId: input.evidenceEntityId,
    verificationStatus: input.verificationStatus,
    observedAt: input.observedAt,
  });
  await recordWorkEvent({
    workItemId: input.workItemId,
    eventType: 'OUTCOME_EVIDENCE_ADDED',
    actorType: 'USER',
    actorUserId: input.actorUserId,
    idempotencyKey: input.idempotencyKey,
    payload: { evidenceType: input.evidenceType, evidenceEntityId: input.evidenceEntityId },
  });
  return evidence;
}
