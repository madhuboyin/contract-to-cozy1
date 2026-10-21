import type { OperationalWorkEvidenceType } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { deleteWorkEvidence, recordWorkEvent } from '../infrastructure/workItemRepository';

/** Evidence a homeowner attached themselves; anything else is written by the governing record and is not withdrawn from here. */
export const HOMEOWNER_WITHDRAWABLE_EVIDENCE: readonly OperationalWorkEvidenceType[] = ['DOCUMENT', 'HOME_EVENT', 'PROPERTY_FACT'];

export class EvidenceNotWithdrawableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceNotWithdrawableError';
  }
}

/**
 * Withdraws pending or rejected evidence the homeowner attached. Verified evidence, and evidence written by the governing record, stays: it may
 * already back a completion or approval. The withdrawal is paired with a work event so the history still shows it was attached and removed.
 */
export async function removeEvidence(input: { workItemId: string; evidenceId: string; actorUserId: string; idempotencyKey: string }) {
  const evidence = await prisma.operationalWorkEvidence.findFirst({ where: { id: input.evidenceId, workItemId: input.workItemId } });
  if (!evidence) return { removed: false as const };
  if (!HOMEOWNER_WITHDRAWABLE_EVIDENCE.includes(evidence.evidenceType)) {
    throw new EvidenceNotWithdrawableError('This evidence was recorded by the record that governs this work and cannot be removed here.');
  }
  if (evidence.verificationStatus === 'VERIFIED') {
    throw new EvidenceNotWithdrawableError('Verified evidence cannot be removed because a completion or approval may rely on it.');
  }
  await deleteWorkEvidence(input.workItemId, evidence.id);
  await recordWorkEvent({
    workItemId: input.workItemId,
    eventType: 'OUTCOME_EVIDENCE_REMOVED',
    actorType: 'USER',
    actorUserId: input.actorUserId,
    idempotencyKey: input.idempotencyKey,
    payload: { evidenceType: evidence.evidenceType, evidenceEntityId: evidence.evidenceEntityId, verificationStatus: evidence.verificationStatus },
  });
  return { removed: true as const };
}
