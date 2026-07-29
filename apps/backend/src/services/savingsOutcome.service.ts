// apps/backend/src/services/savingsOutcome.service.ts
//
// Application/award trail for Savings and Benefits opportunities (Hidden
// Savings and Benefits Capability Audit, Slice 7). PURSUING (benefits) and
// APPLIED/SWITCHED (recurring-cost) were both dead ends — no submitted,
// approved, denied, or received tracking, and no realized-value ledger.
// This service adds an append-only outcome trail for both, and is the only
// legitimate trigger for a real SAVINGS_REALIZATION signal (see
// signal.service.ts) — marking an opportunity APPLIED/SWITCHED no longer
// publishes one.
//
// Deliberately out of scope: publishing a signal from a HiddenAssetMatch
// RECEIVED outcome. SIGNAL_OWNER_BY_KEY pins SAVINGS_REALIZATION's owner to
// 'HomeSavingsService' and downstream consumers (financialAssumption.service.ts,
// doNothingSimulator.service.ts) were built assuming that ownership; widening
// it is a separate, deliberate change, not a side effect of this slice. The
// benefits-side outcome ledger is still fully real and evidence-backed —
// it just doesn't yet feed the shared signal system.

import {
  HomeSavingsOpportunityStatus,
  PropertyHiddenAssetMatchStatus,
  SavingsOutcomeStage,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

export class SavingsOutcomeGovernanceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'SavingsOutcomeGovernanceError';
  }
}

const TERMINAL_STAGES: SavingsOutcomeStage[] = [
  'DENIED',
  'RECEIVED',
  'WITHDRAWN',
  'EXPIRED',
  'NO_ACTION',
];

const ALLOWED_NEXT_STAGES: Record<SavingsOutcomeStage, SavingsOutcomeStage[]> = {
  SUBMITTED: ['APPROVED', 'DENIED', 'WITHDRAWN', 'EXPIRED', 'NO_ACTION'],
  APPROVED: ['RECEIVED', 'WITHDRAWN', 'EXPIRED', 'NO_ACTION'],
  DENIED: [],
  RECEIVED: [],
  WITHDRAWN: [],
  EXPIRED: [],
  NO_ACTION: [],
};

/**
 * True when recording `to` is a legal next stage given the current latest
 * stage (`from`, or null if no outcome has been recorded yet). New trails
 * start at SUBMITTED so application intent, approval, and receipt cannot be
 * collapsed into one unchecked status change.
 */
export function isValidOutcomeTransition(
  from: SavingsOutcomeStage | null,
  to: SavingsOutcomeStage
): boolean {
  if (from === null) return to === 'SUBMITTED' || to === 'EXPIRED' || to === 'NO_ACTION';
  if (TERMINAL_STAGES.includes(from)) return false;
  return ALLOWED_NEXT_STAGES[from].includes(to);
}

export interface RecordOutcomeInput {
  stage: SavingsOutcomeStage;
  evidenceNote?: string | null;
  denialReason?: string | null;
  closureReason?: string | null;
  /** Existing Document Vault rows to attach as evidence for this ledger entry (HSB-033). */
  documentIds?: string[];
  supersedesOutcomeId?: string | null;
}

function assertStageInputIsComplete(input: RecordOutcomeInput, hasValue: boolean): void {
  if (input.stage === 'RECEIVED') {
    if (!hasValue) {
      throw new SavingsOutcomeGovernanceError(
        'MISSING_VALUE',
        'A RECEIVED outcome must include the amount or value actually received.'
      );
    }
    // A text note or an attached document (award letter, confirmation
    // screenshot) both count as "stated evidence" — one is not required to
    // duplicate the other.
    const hasNote = !!input.evidenceNote?.trim();
    const hasDocuments = (input.documentIds?.length ?? 0) > 0;
    if (!hasNote && !hasDocuments) {
      throw new SavingsOutcomeGovernanceError(
        'MISSING_EVIDENCE',
        'A RECEIVED outcome must state what evidence backs it, or attach a supporting document.'
      );
    }
  }
  if (input.stage === 'DENIED' && !input.denialReason?.trim()) {
    throw new SavingsOutcomeGovernanceError('MISSING_DENIAL_REASON', 'A DENIED outcome must include a reason.');
  }
  if (
    (input.stage === 'WITHDRAWN' || input.stage === 'EXPIRED' || input.stage === 'NO_ACTION')
    && !input.closureReason?.trim()
  ) {
    throw new SavingsOutcomeGovernanceError(
      'MISSING_CLOSURE_REASON',
      `A ${input.stage} outcome must include a reason.`,
    );
  }
}

/**
 * Verifies every documentId belongs to this homeowner (via Document.uploadedBy,
 * which stores homeownerProfile.id — see documentAuth.middleware.ts for the
 * same pattern) before linking any of them as outcome evidence.
 */
async function assertDocumentsOwnedByUser(
  documentIds: string[] | undefined,
  userId: string,
  propertyId: string | null,
): Promise<string[]> {
  if (!documentIds || documentIds.length === 0) return [];
  if (!propertyId) {
    throw new SavingsOutcomeGovernanceError(
      'DOCUMENT_PROPERTY_REQUIRED',
      'Evidence can only be attached to a property-scoped savings opportunity.',
    );
  }
  const owned = await prisma.document.findMany({
    where: { id: { in: documentIds }, uploadedBy: userId, propertyId },
    select: { id: true },
  });
  if (owned.length !== documentIds.length) {
    throw new SavingsOutcomeGovernanceError('DOCUMENT_NOT_FOUND', 'One or more attached documents were not found.');
  }
  return owned.map((d) => d.id);
}

// ============================================================================
// HIDDEN ASSET MATCH (benefits / rebates) OUTCOMES
// ============================================================================

async function assertMatchForUser(matchId: string, userId: string) {
  const match = await prisma.propertyHiddenAssetMatch.findFirst({
    where: { id: matchId, property: { homeownerProfile: { userId } } },
  });
  if (!match) throw new Error('Match not found or access denied.');
  return match;
}

export interface RecordHiddenAssetMatchOutcomeInput extends RecordOutcomeInput {
  amountReceived?: number | null;
  currency?: string;
}

export async function recordHiddenAssetMatchOutcome(
  matchId: string,
  userId: string,
  input: RecordHiddenAssetMatchOutcomeInput
) {
  const match = await assertMatchForUser(matchId, userId);
  assertStageInputIsComplete(input, input.amountReceived != null);
  const ownedDocumentIds = await assertDocumentsOwnedByUser(input.documentIds, userId, match.propertyId);

  const latest = await prisma.hiddenAssetMatchOutcome.findFirst({
    where: { matchId, revokedAt: null },
    orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
  });
  if (!isValidOutcomeTransition(latest?.stage ?? null, input.stage)) {
    throw new SavingsOutcomeGovernanceError(
      'INVALID_TRANSITION',
      `Cannot record ${input.stage} after ${latest ? latest.stage : 'no prior outcome'}.`
    );
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const created = await tx.hiddenAssetMatchOutcome.create({
      data: {
        matchId,
        stage: input.stage,
        amountReceived: input.stage === 'RECEIVED' ? input.amountReceived ?? null : null,
        currency: input.currency ?? 'USD',
        evidenceNote: input.evidenceNote ?? null,
        denialReason: input.stage === 'DENIED' ? input.denialReason ?? null : null,
        closureReason:
          input.stage === 'WITHDRAWN' || input.stage === 'EXPIRED' || input.stage === 'NO_ACTION'
            ? input.closureReason ?? null
            : null,
        verificationState: ownedDocumentIds.length > 0 ? 'EVIDENCE_ATTACHED' : 'SELF_REPORTED',
        supersedesOutcomeId: input.supersedesOutcomeId ?? null,
        recordedBy: userId,
      },
    });
    if (ownedDocumentIds.length > 0) {
      await tx.document.updateMany({
        where: { id: { in: ownedDocumentIds } },
        data: { hiddenAssetMatchOutcomeId: created.id },
      });
    }
    // Marking PURSUING is a homeowner intent signal, not the outcome trail
    // itself — once a real outcome exists, the match should reflect it too
    // rather than staying frozen at PURSUING.
    if (input.stage === 'EXPIRED') {
      await tx.propertyHiddenAssetMatch.update({
        where: { id: matchId },
        data: { status: PropertyHiddenAssetMatchStatus.EXPIRED },
      });
    } else if (
      input.stage === 'DENIED'
      || input.stage === 'WITHDRAWN'
      || input.stage === 'NO_ACTION'
    ) {
      await tx.propertyHiddenAssetMatch.update({
        where: { id: matchId },
        data: { status: PropertyHiddenAssetMatchStatus.INACTIVE },
      });
    } else if (match.status === PropertyHiddenAssetMatchStatus.PURSUING) {
      await tx.propertyHiddenAssetMatch.update({
        where: { id: matchId },
        data: { pursuedAt: match.pursuedAt ?? created.recordedAt },
      });
    }
    return created;
  });

  return outcome;
}

export async function getHiddenAssetMatchOutcomes(matchId: string, userId: string) {
  await assertMatchForUser(matchId, userId);
  return prisma.hiddenAssetMatchOutcome.findMany({
    where: { matchId },
    orderBy: [{ recordedAt: 'asc' }, { createdAt: 'asc' }],
    include: { documents: { select: { id: true, name: true, type: true, mimeType: true, fileSize: true } } },
  });
}

// ============================================================================
// HOME SAVINGS OPPORTUNITY (recurring-cost) OUTCOMES
// ============================================================================

async function assertOpportunityForUser(opportunityId: string, userId: string) {
  const opportunity = await prisma.homeSavingsOpportunity.findFirst({
    where: { id: opportunityId, homeownerProfile: { userId } },
  });
  if (!opportunity) throw new Error('Opportunity not found or access denied.');
  return opportunity;
}

export interface RecordHomeSavingsOpportunityOutcomeInput extends RecordOutcomeInput {
  observedMonthlyValue?: number | null;
  observedAnnualValue?: number | null;
  currency?: string;
  observationStartedAt?: Date | null;
  observationEndedAt?: Date | null;
}

function assertRecurringObservationWindow(input: RecordHomeSavingsOpportunityOutcomeInput): void {
  if (input.stage !== 'RECEIVED') return;
  if (!input.observationStartedAt || !input.observationEndedAt) {
    throw new SavingsOutcomeGovernanceError(
      'MISSING_OBSERVATION_WINDOW',
      'A recurring RECEIVED outcome requires the start and end dates of the observed billing period.',
    );
  }
  const durationMs = input.observationEndedAt.getTime() - input.observationStartedAt.getTime();
  if (durationMs < 28 * 24 * 60 * 60 * 1000) {
    throw new SavingsOutcomeGovernanceError(
      'OBSERVATION_WINDOW_TOO_SHORT',
      'Recurring savings must be observed for at least 28 days before being recorded as received.',
    );
  }
}

export async function recordHomeSavingsOpportunityOutcome(
  opportunityId: string,
  userId: string,
  input: RecordHomeSavingsOpportunityOutcomeInput
) {
  const opportunity = await assertOpportunityForUser(opportunityId, userId);
  assertStageInputIsComplete(
    input,
    input.observedAnnualValue != null || input.observedMonthlyValue != null
  );
  assertRecurringObservationWindow(input);
  const ownedDocumentIds = await assertDocumentsOwnedByUser(
    input.documentIds,
    userId,
    opportunity.propertyId,
  );

  const latest = await prisma.homeSavingsOpportunityOutcome.findFirst({
    where: { opportunityId, revokedAt: null },
    orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
  });
  if (!isValidOutcomeTransition(latest?.stage ?? null, input.stage)) {
    throw new SavingsOutcomeGovernanceError(
      'INVALID_TRANSITION',
      `Cannot record ${input.stage} after ${latest ? latest.stage : 'no prior outcome'}.`
    );
  }

  const outcome = await prisma.homeSavingsOpportunityOutcome.create({
    data: {
      opportunityId,
      stage: input.stage,
      observedMonthlyValue: input.stage === 'RECEIVED' ? input.observedMonthlyValue ?? null : null,
      observedAnnualValue: input.stage === 'RECEIVED' ? input.observedAnnualValue ?? null : null,
      currency: input.currency ?? opportunity.currency,
      evidenceNote: input.evidenceNote ?? null,
      denialReason: input.stage === 'DENIED' ? input.denialReason ?? null : null,
      closureReason:
        input.stage === 'WITHDRAWN' || input.stage === 'EXPIRED' || input.stage === 'NO_ACTION'
          ? input.closureReason ?? null
          : null,
      verificationState: ownedDocumentIds.length > 0 ? 'EVIDENCE_ATTACHED' : 'SELF_REPORTED',
      observationStartedAt: input.stage === 'RECEIVED' ? input.observationStartedAt ?? null : null,
      observationEndedAt: input.stage === 'RECEIVED' ? input.observationEndedAt ?? null : null,
      supersedesOutcomeId: input.supersedesOutcomeId ?? null,
      recordedBy: userId,
    },
  });

  if (ownedDocumentIds.length > 0) {
    await prisma.document.updateMany({
      where: { id: { in: ownedDocumentIds } },
      data: { homeSavingsOpportunityOutcomeId: outcome.id },
    });
  }
  if (input.stage === 'EXPIRED') {
    await prisma.homeSavingsOpportunity.update({
      where: { id: opportunityId },
      data: { status: HomeSavingsOpportunityStatus.EXPIRED },
    });
  } else if (
    input.stage === 'DENIED'
    || input.stage === 'WITHDRAWN'
    || input.stage === 'NO_ACTION'
  ) {
    await prisma.homeSavingsOpportunity.update({
      where: { id: opportunityId },
      data: { status: HomeSavingsOpportunityStatus.DISMISSED },
    });
  }

  // Homeowner-recorded outcomes remain SELF_REPORTED or EVIDENCE_ATTACHED.
  // They do not publish the platform's verified SAVINGS_REALIZATION signal.

  return outcome;
}

export async function getHomeSavingsOpportunityOutcomes(opportunityId: string, userId: string) {
  await assertOpportunityForUser(opportunityId, userId);
  return prisma.homeSavingsOpportunityOutcome.findMany({
    where: { opportunityId },
    orderBy: [{ recordedAt: 'asc' }, { createdAt: 'asc' }],
    include: { documents: { select: { id: true, name: true, type: true, mimeType: true, fileSize: true } } },
  });
}

export async function revokeHiddenAssetMatchOutcome(
  outcomeId: string,
  userId: string,
  reason: string,
) {
  const outcome = await prisma.hiddenAssetMatchOutcome.findFirst({
    where: { id: outcomeId, match: { property: { homeownerProfile: { userId } } } },
  });
  if (!outcome) throw new Error('Outcome not found or access denied.');
  if (outcome.revokedAt) {
    throw new SavingsOutcomeGovernanceError('ALREADY_REVOKED', 'This outcome is already revoked.');
  }
  return prisma.hiddenAssetMatchOutcome.update({
    where: { id: outcomeId },
    data: {
      verificationState: 'REVOKED',
      revokedAt: new Date(),
      revokedBy: userId,
      revocationReason: reason,
    },
  });
}

export async function revokeHomeSavingsOpportunityOutcome(
  outcomeId: string,
  userId: string,
  reason: string,
) {
  const outcome = await prisma.homeSavingsOpportunityOutcome.findFirst({
    where: { id: outcomeId, opportunity: { homeownerProfile: { userId } } },
  });
  if (!outcome) throw new Error('Outcome not found or access denied.');
  if (outcome.revokedAt) {
    throw new SavingsOutcomeGovernanceError('ALREADY_REVOKED', 'This outcome is already revoked.');
  }
  return prisma.homeSavingsOpportunityOutcome.update({
    where: { id: outcomeId },
    data: {
      verificationState: 'REVOKED',
      revokedAt: new Date(),
      revokedBy: userId,
      revocationReason: reason,
    },
  });
}
