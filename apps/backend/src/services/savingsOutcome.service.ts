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
  Prisma,
  PropertyHiddenAssetMatchStatus,
  SavingsOutcomeStage,
} from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../lib/prisma';
import { recordAdminAction } from './adminAudit.service';
import { signalService } from './signal.service';

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
  idempotencyKey?: string;
  /** Internal canonical-action linkage; never accepted from homeowner input. */
  actionId?: string;
  stage: SavingsOutcomeStage;
  evidenceNote?: string | null;
  denialReason?: string | null;
  closureReason?: string | null;
  /** Existing Document Vault rows to attach as evidence for this ledger entry (HSB-033). */
  documentIds?: string[];
  supersedesOutcomeId?: string | null;
}

function actionStateForOutcome(stage: SavingsOutcomeStage): 'STARTED' | 'COMPLETED' {
  return TERMINAL_STAGES.includes(stage) ? 'COMPLETED' : 'STARTED';
}

async function reconcileCanonicalActionForOutcome(
  tx: Prisma.TransactionClient,
  input: RecordOutcomeInput,
  relation: { hiddenAssetMatchId?: string; homeSavingsOpportunityId?: string },
) {
  if (!input.actionId) return;
  const state = actionStateForOutcome(input.stage);
  const updated = await tx.savingsBenefitAction.updateMany({
    where: {
      id: input.actionId,
      ...relation,
    },
    data: {
      state,
      completedAt: state === 'COMPLETED' ? new Date() : null,
    },
  });
  if (updated.count !== 1) {
    throw new SavingsOutcomeGovernanceError(
      'ACTION_LINK_MISMATCH',
      'The canonical action is not linked to this opportunity.',
    );
  }
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
  const homeownerProfile = await prisma.homeownerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!homeownerProfile) {
    throw new SavingsOutcomeGovernanceError(
      'HOMEOWNER_PROFILE_NOT_FOUND',
      'A homeowner profile is required to attach Document Vault evidence.',
    );
  }
  const owned = await prisma.document.findMany({
    where: {
      id: { in: documentIds },
      uploadedBy: homeownerProfile.id,
      propertyId,
    },
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

  let resolvedIdempotencyKey = input.idempotencyKey?.trim() || '';
  try {
    return await prisma.$transaction(async (tx) => {
      const latest = await tx.hiddenAssetMatchOutcome.findFirst({
        where: { matchId, revokedAt: null },
        orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
      });
      resolvedIdempotencyKey ||= `${input.stage}:${latest?.id ?? 'INITIAL'}`;
      const existing = await tx.hiddenAssetMatchOutcome.findUnique?.({
        where: {
          matchId_idempotencyKey: {
            matchId,
            idempotencyKey: resolvedIdempotencyKey,
          },
        },
      });
      if (existing) {
        await reconcileCanonicalActionForOutcome(tx, input, { hiddenAssetMatchId: matchId });
        return existing;
      }
      if (!isValidOutcomeTransition(latest?.stage ?? null, input.stage)) {
        throw new SavingsOutcomeGovernanceError(
          'INVALID_TRANSITION',
          `Cannot record ${input.stage} after ${latest ? latest.stage : 'no prior outcome'}.`
        );
      }

      const created = await tx.hiddenAssetMatchOutcome.create({
      data: {
        matchId,
        actionId: input.actionId ?? null,
        idempotencyKey: resolvedIdempotencyKey,
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
      await reconcileCanonicalActionForOutcome(tx, input, { hiddenAssetMatchId: matchId });
      return created;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
      && resolvedIdempotencyKey
    ) {
      const raced = await prisma.hiddenAssetMatchOutcome.findUnique({
        where: {
          matchId_idempotencyKey: {
            matchId,
            idempotencyKey: resolvedIdempotencyKey,
          },
        },
      });
      if (raced) return raced;
    }
    throw error;
  }
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
    where: {
      id: opportunityId,
      homeownerProfile: { userId },
      resultKind: {
        in: ['BENCHMARK_OPPORTUNITY', 'ADDRESS_QUALIFIED_OPPORTUNITY'],
      },
    },
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

  let resolvedIdempotencyKey = input.idempotencyKey?.trim() || '';
  try {
    return await prisma.$transaction(async (tx) => {
      const latest = await tx.homeSavingsOpportunityOutcome.findFirst({
        where: { opportunityId, revokedAt: null },
        orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
      });
      resolvedIdempotencyKey ||= `${input.stage}:${latest?.id ?? 'INITIAL'}`;
      const existing = await tx.homeSavingsOpportunityOutcome.findUnique?.({
        where: {
          opportunityId_idempotencyKey: {
            opportunityId,
            idempotencyKey: resolvedIdempotencyKey,
          },
        },
      });
      if (existing) {
        await reconcileCanonicalActionForOutcome(tx, input, { homeSavingsOpportunityId: opportunityId });
        return existing;
      }
      if (!isValidOutcomeTransition(latest?.stage ?? null, input.stage)) {
        throw new SavingsOutcomeGovernanceError(
          'INVALID_TRANSITION',
          `Cannot record ${input.stage} after ${latest ? latest.stage : 'no prior outcome'}.`
        );
      }

      const outcome = await tx.homeSavingsOpportunityOutcome.create({
        data: {
          opportunityId,
          actionId: input.actionId ?? null,
          idempotencyKey: resolvedIdempotencyKey,
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
        await tx.document.updateMany({
          where: { id: { in: ownedDocumentIds } },
          data: { homeSavingsOpportunityOutcomeId: outcome.id },
        });
      }
      if (input.stage === 'EXPIRED') {
        await tx.homeSavingsOpportunity.update({
          where: { id: opportunityId },
          data: { status: HomeSavingsOpportunityStatus.EXPIRED },
        });
      } else if (
        input.stage === 'DENIED'
        || input.stage === 'WITHDRAWN'
        || input.stage === 'NO_ACTION'
      ) {
        await tx.homeSavingsOpportunity.update({
          where: { id: opportunityId },
          data: { status: HomeSavingsOpportunityStatus.DISMISSED },
        });
      }
      await reconcileCanonicalActionForOutcome(tx, input, { homeSavingsOpportunityId: opportunityId });
      return outcome;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
      && resolvedIdempotencyKey
    ) {
      const raced = await prisma.homeSavingsOpportunityOutcome.findUnique({
        where: {
          opportunityId_idempotencyKey: {
            opportunityId,
            idempotencyKey: resolvedIdempotencyKey,
          },
        },
      });
      if (raced) return raced;
    }
    throw error;
  }
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
  return prisma.$transaction(async (tx) => {
    const latest = await tx.hiddenAssetMatchOutcome.findFirst({
      where: { matchId: outcome.matchId, revokedAt: null },
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (latest?.id !== outcome.id) {
      throw new SavingsOutcomeGovernanceError(
        'ONLY_LATEST_CAN_BE_REVOKED',
        'Revoke the latest outcome before correcting an earlier stage.',
      );
    }
    const revokedWrite = await tx.hiddenAssetMatchOutcome.updateMany({
      where: { id: outcomeId, revokedAt: null },
      data: {
        verificationState: 'REVOKED',
        revokedAt: new Date(),
        revokedBy: userId,
        revocationReason: reason,
      },
    });
    if (revokedWrite.count !== 1) {
      throw new SavingsOutcomeGovernanceError(
        'OUTCOME_CHANGED_CONCURRENTLY',
        'This outcome changed concurrently. Refresh and try again.',
      );
    }
    const revoked = await tx.hiddenAssetMatchOutcome.findUniqueOrThrow({ where: { id: outcomeId } });
    const previous = await tx.hiddenAssetMatchOutcome.findFirst({
      where: { matchId: outcome.matchId, revokedAt: null },
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
    });
    await tx.propertyHiddenAssetMatch.update({
      where: { id: outcome.matchId },
      data: {
        status:
          previous?.stage === 'EXPIRED'
            ? 'EXPIRED'
            : previous && ['DENIED', 'WITHDRAWN', 'NO_ACTION'].includes(previous.stage)
              ? 'INACTIVE'
              : 'PURSUING',
      },
    });
    if (outcome.actionId) {
      const state = previous && TERMINAL_STAGES.includes(previous.stage) ? 'COMPLETED' : 'STARTED';
      await tx.savingsBenefitAction.updateMany({
        where: { id: outcome.actionId, hiddenAssetMatchId: outcome.matchId },
        data: { state, completedAt: state === 'COMPLETED' ? previous?.recordedAt ?? new Date() : null },
      });
    }
    return revoked;
  });
}

export async function revokeHomeSavingsOpportunityOutcome(
  outcomeId: string,
  userId: string,
  reason: string,
) {
  const outcome = await prisma.homeSavingsOpportunityOutcome.findFirst({
    where: { id: outcomeId, opportunity: { homeownerProfile: { userId } } },
    include: { opportunity: { select: { propertyId: true } } },
  });
  if (!outcome) throw new Error('Outcome not found or access denied.');
  if (outcome.revokedAt) {
    throw new SavingsOutcomeGovernanceError('ALREADY_REVOKED', 'This outcome is already revoked.');
  }
  const revokedAt = new Date();
  return prisma.$transaction(async (tx) => {
    const latest = await tx.homeSavingsOpportunityOutcome.findFirst({
      where: { opportunityId: outcome.opportunityId, revokedAt: null },
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (latest?.id !== outcome.id) {
      throw new SavingsOutcomeGovernanceError(
        'ONLY_LATEST_CAN_BE_REVOKED',
        'Revoke the latest outcome before correcting an earlier stage.',
      );
    }
    const revokedWrite = await tx.homeSavingsOpportunityOutcome.updateMany({
      where: { id: outcomeId, revokedAt: null },
      data: {
        verificationState: 'REVOKED',
        revokedAt,
        revokedBy: userId,
        revocationReason: reason,
      },
    });
    if (revokedWrite.count !== 1) {
      throw new SavingsOutcomeGovernanceError(
        'OUTCOME_CHANGED_CONCURRENTLY',
        'This outcome changed concurrently. Refresh and try again.',
      );
    }
    const revoked = await tx.homeSavingsOpportunityOutcome.findUniqueOrThrow({ where: { id: outcomeId } });
    const previous = await tx.homeSavingsOpportunityOutcome.findFirst({
      where: { opportunityId: outcome.opportunityId, revokedAt: null },
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
    });
    await tx.homeSavingsOpportunity.update({
      where: { id: outcome.opportunityId },
      data: {
        status:
          previous?.stage === 'EXPIRED'
            ? 'EXPIRED'
            : previous && ['DENIED', 'WITHDRAWN', 'NO_ACTION'].includes(previous.stage)
              ? 'DISMISSED'
              : previous?.stage === 'RECEIVED'
                ? 'SWITCHED'
                : 'APPLIED',
      },
    });
    if (outcome.actionId) {
      const state = previous && TERMINAL_STAGES.includes(previous.stage) ? 'COMPLETED' : 'STARTED';
      await tx.savingsBenefitAction.updateMany({
        where: { id: outcome.actionId, homeSavingsOpportunityId: outcome.opportunityId },
        data: { state, completedAt: state === 'COMPLETED' ? previous?.recordedAt ?? new Date() : null },
      });
    }
    if (outcome.opportunity.propertyId) {
      await tx.signal.updateMany({
        where: {
          propertyId: outcome.opportunity.propertyId,
          signalKey: 'SAVINGS_REALIZATION',
          sourceModel: 'HomeSavingsService',
          sourceId: outcome.opportunityId,
          OR: [{ validUntil: null }, { validUntil: { gt: revokedAt } }],
        },
        data: { validUntil: revokedAt },
      });
    }
    return revoked;
  });
}

export async function verifySavingsBenefitOutcome(
  family: 'BENEFIT' | 'RECURRING_COST',
  outcomeId: string,
  actorId: string,
  reason: string,
  req?: Pick<Request, 'ip' | 'headers'> | null,
) {
  let propertyId: string | null = null;
  const verified = await prisma.$transaction(async (tx) => {
    if (family === 'BENEFIT') {
      const outcome = await tx.hiddenAssetMatchOutcome.findUnique({
        where: { id: outcomeId },
        include: {
          documents: { select: { id: true } },
          match: { select: { propertyId: true } },
        },
      });
      if (!outcome) throw new Error('Outcome not found.');
      if (outcome.recordedBy === actorId) {
        throw new SavingsOutcomeGovernanceError(
          'INDEPENDENT_REVIEWER_REQUIRED',
          'An outcome must be verified by a different administrator than the person who recorded it.',
        );
      }
      if (outcome.verificationState === 'VERIFIED') {
        throw new SavingsOutcomeGovernanceError(
          'OUTCOME_ALREADY_VERIFIED',
          'This outcome has already been independently verified.',
        );
      }
      if (outcome.stage !== 'RECEIVED' || outcome.revokedAt) {
        throw new SavingsOutcomeGovernanceError(
          'OUTCOME_NOT_VERIFIABLE',
          'Only a current RECEIVED outcome can be verified.',
        );
      }
      if (outcome.documents.length === 0) {
        throw new SavingsOutcomeGovernanceError(
          'VERIFICATION_EVIDENCE_REQUIRED',
          'Independent verification requires attached Document Vault evidence.',
        );
      }
      propertyId = outcome.match.propertyId;
      const verifiedAt = new Date();
      const verifiedWrite = await tx.hiddenAssetMatchOutcome.updateMany({
        where: {
          id: outcome.id,
          stage: 'RECEIVED',
          revokedAt: null,
          verificationState: outcome.verificationState,
        },
        data: { verificationState: 'VERIFIED', verifiedAt, verifiedBy: actorId },
      });
      if (verifiedWrite.count !== 1) {
        throw new SavingsOutcomeGovernanceError(
          'OUTCOME_CHANGED_CONCURRENTLY',
          'This outcome changed concurrently. Refresh the verification queue and try again.',
        );
      }
      const updated = await tx.hiddenAssetMatchOutcome.findUniqueOrThrow({ where: { id: outcome.id } });
      await recordAdminAction({
        actorId,
        action: 'ADMIN_SAVINGS_BENEFITS_OUTCOME_VERIFY',
        entityType: 'HIDDEN_ASSET_MATCH_OUTCOME',
        entityId: outcome.id,
        capability: 'SAVINGS_BENEFITS_REVIEW',
        reason,
        disposition: 'VERIFIED',
        oldValues: { verificationState: outcome.verificationState },
        newValues: { verificationState: 'VERIFIED' },
        relatedRefs: { propertyId: outcome.match.propertyId, matchId: outcome.matchId },
        req,
      }, tx);
      return updated;
    }

    const outcome = await tx.homeSavingsOpportunityOutcome.findUnique({
      where: { id: outcomeId },
      include: {
        documents: { select: { id: true } },
        opportunity: { select: { propertyId: true } },
      },
    });
    if (!outcome) throw new Error('Outcome not found.');
    if (outcome.recordedBy === actorId) {
      throw new SavingsOutcomeGovernanceError(
        'INDEPENDENT_REVIEWER_REQUIRED',
        'An outcome must be verified by a different administrator than the person who recorded it.',
      );
    }
    if (outcome.verificationState === 'VERIFIED') {
      throw new SavingsOutcomeGovernanceError(
        'OUTCOME_ALREADY_VERIFIED',
        'This outcome has already been independently verified.',
      );
    }
    if (outcome.stage !== 'RECEIVED' || outcome.revokedAt) {
      throw new SavingsOutcomeGovernanceError(
        'OUTCOME_NOT_VERIFIABLE',
        'Only a current RECEIVED outcome can be verified.',
      );
    }
    if (outcome.documents.length === 0) {
      throw new SavingsOutcomeGovernanceError(
        'VERIFICATION_EVIDENCE_REQUIRED',
        'Independent verification requires attached Document Vault evidence.',
      );
    }
    if (!outcome.opportunity.propertyId) {
      throw new SavingsOutcomeGovernanceError(
        'PROPERTY_REQUIRED',
        'A property-scoped outcome is required for verification.',
      );
    }
    propertyId = outcome.opportunity.propertyId;
    const verifiedAt = new Date();
    const verifiedWrite = await tx.homeSavingsOpportunityOutcome.updateMany({
      where: {
        id: outcome.id,
        stage: 'RECEIVED',
        revokedAt: null,
        verificationState: outcome.verificationState,
      },
      data: { verificationState: 'VERIFIED', verifiedAt, verifiedBy: actorId },
    });
    if (verifiedWrite.count !== 1) {
      throw new SavingsOutcomeGovernanceError(
        'OUTCOME_CHANGED_CONCURRENTLY',
        'This outcome changed concurrently. Refresh the verification queue and try again.',
      );
    }
    const updated = await tx.homeSavingsOpportunityOutcome.findUniqueOrThrow({ where: { id: outcome.id } });
    await recordAdminAction({
      actorId,
      action: 'ADMIN_SAVINGS_BENEFITS_OUTCOME_VERIFY',
      entityType: 'HOME_SAVINGS_OPPORTUNITY_OUTCOME',
      entityId: outcome.id,
      capability: 'SAVINGS_BENEFITS_REVIEW',
      reason,
      disposition: 'VERIFIED',
      oldValues: { verificationState: outcome.verificationState },
      newValues: { verificationState: 'VERIFIED' },
      relatedRefs: { propertyId, opportunityId: outcome.opportunityId },
      req,
    }, tx);
    return updated;
  });

  // The verified ledger write is authoritative. Refreshing the derived
  // shared signal happens after commit and can be safely retried.
  if (family === 'RECURRING_COST' && propertyId) {
    await signalService.refreshSignalsForProperty(propertyId);
  }
  return verified;
}

export async function listSavingsBenefitOutcomeVerificationQueue(
  options: { offset?: number; limit?: number } = {},
) {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const benefitWhere: Prisma.HiddenAssetMatchOutcomeWhereInput = {
    stage: 'RECEIVED',
    revokedAt: null,
    verificationState: { in: ['SELF_REPORTED', 'EVIDENCE_ATTACHED'] },
  };
  const recurringWhere: Prisma.HomeSavingsOpportunityOutcomeWhereInput = {
    stage: 'RECEIVED',
    revokedAt: null,
    verificationState: { in: ['SELF_REPORTED', 'EVIDENCE_ATTACHED'] },
  };
  const [benefits, recurring, benefitCount, recurringCount] = await Promise.all([
    prisma.hiddenAssetMatchOutcome.findMany({
      where: benefitWhere,
      include: {
        documents: { select: { id: true, name: true } },
        match: { include: { program: { select: { name: true } } } },
      },
      orderBy: { recordedAt: 'asc' },
      take: offset + limit,
    }),
    prisma.homeSavingsOpportunityOutcome.findMany({
      where: recurringWhere,
      include: {
        documents: { select: { id: true, name: true } },
        opportunity: { select: { headline: true } },
      },
      orderBy: { recordedAt: 'asc' },
      take: offset + limit,
    }),
    prisma.hiddenAssetMatchOutcome.count({ where: benefitWhere }),
    prisma.homeSavingsOpportunityOutcome.count({ where: recurringWhere }),
  ]);
  const outcomes = [
    ...benefits.map((outcome) => ({
      family: 'BENEFIT' as const,
      id: outcome.id,
      title: outcome.match.program.name,
      value: outcome.amountReceived?.toString() ?? null,
      currency: outcome.currency,
      verificationState: outcome.verificationState,
      evidenceNote: outcome.evidenceNote,
      documents: outcome.documents,
      recordedAt: outcome.recordedAt,
    })),
    ...recurring.map((outcome) => ({
      family: 'RECURRING_COST' as const,
      id: outcome.id,
      title: outcome.opportunity.headline,
      value:
        outcome.observedAnnualValue?.toString()
        ?? outcome.observedMonthlyValue?.toString()
        ?? null,
      currency: outcome.currency,
      verificationState: outcome.verificationState,
      evidenceNote: outcome.evidenceNote,
      documents: outcome.documents,
      recordedAt: outcome.recordedAt,
    })),
  ]
    .sort((a, b) =>
      a.recordedAt.getTime() - b.recordedAt.getTime()
      || a.id.localeCompare(b.id))
    .slice(offset, offset + limit);
  return { outcomes, total: benefitCount + recurringCount, offset, limit };
}
