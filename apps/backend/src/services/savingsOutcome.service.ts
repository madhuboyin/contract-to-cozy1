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

import { PropertyHiddenAssetMatchStatus, SavingsOutcomeStage } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { signalService } from './signal.service';

export class SavingsOutcomeGovernanceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'SavingsOutcomeGovernanceError';
  }
}

const TERMINAL_STAGES: SavingsOutcomeStage[] = ['DENIED', 'RECEIVED', 'WITHDRAWN'];

const ALLOWED_NEXT_STAGES: Record<SavingsOutcomeStage, SavingsOutcomeStage[]> = {
  SUBMITTED: ['APPROVED', 'DENIED', 'WITHDRAWN'],
  APPROVED: ['RECEIVED', 'WITHDRAWN'],
  DENIED: [],
  RECEIVED: [],
  WITHDRAWN: [],
};

/**
 * True when recording `to` is a legal next stage given the current latest
 * stage (`from`, or null if no outcome has been recorded yet). A null
 * `from` accepts any stage — a homeowner recording their real history for
 * the first time shouldn't have to fabricate a SUBMITTED entry before they
 * can record that they already received the benefit.
 */
export function isValidOutcomeTransition(
  from: SavingsOutcomeStage | null,
  to: SavingsOutcomeStage
): boolean {
  if (from === null) return true;
  if (TERMINAL_STAGES.includes(from)) return false;
  return ALLOWED_NEXT_STAGES[from].includes(to);
}

export interface RecordOutcomeInput {
  stage: SavingsOutcomeStage;
  evidenceNote?: string | null;
  denialReason?: string | null;
}

function assertStageInputIsComplete(input: RecordOutcomeInput, hasValue: boolean): void {
  if (input.stage === 'RECEIVED') {
    if (!hasValue) {
      throw new SavingsOutcomeGovernanceError(
        'MISSING_VALUE',
        'A RECEIVED outcome must include the amount or value actually received.'
      );
    }
    if (!input.evidenceNote?.trim()) {
      throw new SavingsOutcomeGovernanceError(
        'MISSING_EVIDENCE',
        'A RECEIVED outcome must state what evidence backs it.'
      );
    }
  }
  if (input.stage === 'DENIED' && !input.denialReason?.trim()) {
    throw new SavingsOutcomeGovernanceError('MISSING_DENIAL_REASON', 'A DENIED outcome must include a reason.');
  }
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

  const latest = await prisma.hiddenAssetMatchOutcome.findFirst({
    where: { matchId },
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
        recordedBy: userId,
      },
    });
    // Marking PURSUING is a homeowner intent signal, not the outcome trail
    // itself — once a real outcome exists, the match should reflect it too
    // rather than staying frozen at PURSUING.
    if (match.status === PropertyHiddenAssetMatchStatus.PURSUING) {
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

  const latest = await prisma.homeSavingsOpportunityOutcome.findFirst({
    where: { opportunityId },
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
      recordedBy: userId,
    },
  });

  if (input.stage === 'RECEIVED' && opportunity.propertyId) {
    const annualValue = input.observedAnnualValue ?? (input.observedMonthlyValue ?? 0) * 12;
    try {
      await signalService.publishSavingsRealizationSignal({
        propertyId: opportunity.propertyId,
        opportunityId: opportunity.id,
        observedAnnualValue: annualValue,
        observedMonthlyValue: input.observedMonthlyValue ?? null,
        currency: outcome.currency,
        evidenceNote: input.evidenceNote?.trim() ?? '',
      });
    } catch {
      // A signal-publish failure must never fail the outcome recording
      // itself — the ledger row above is the durable record; the shared
      // signal is a downstream projection of it.
    }
  }

  return outcome;
}

export async function getHomeSavingsOpportunityOutcomes(opportunityId: string, userId: string) {
  await assertOpportunityForUser(opportunityId, userId);
  return prisma.homeSavingsOpportunityOutcome.findMany({
    where: { opportunityId },
    orderBy: [{ recordedAt: 'asc' }, { createdAt: 'asc' }],
  });
}
