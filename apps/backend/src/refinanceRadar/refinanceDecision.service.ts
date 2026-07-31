import {
  DomainEventType,
  Prisma,
  PropertyMortgageStatus,
  RefinanceDecisionStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import type { RecordRefinanceDecisionBody } from './validators/refinanceRadar.validators';

const ALLOWED_TRANSITIONS: Record<RefinanceDecisionStatus, RefinanceDecisionStatus[]> = {
  EXPLORING: ['DEFERRED', 'KEEP_CURRENT_LOAN', 'PROCEEDING', 'OFFER_SELECTED', 'ABANDONED'],
  DEFERRED: ['EXPLORING', 'KEEP_CURRENT_LOAN', 'PROCEEDING', 'SUPERSEDED'],
  KEEP_CURRENT_LOAN: ['EXPLORING', 'PROCEEDING', 'SUPERSEDED'],
  PROCEEDING: ['DEFERRED', 'KEEP_CURRENT_LOAN', 'OFFER_SELECTED', 'APPLICATION_IN_PROGRESS', 'ABANDONED'],
  OFFER_SELECTED: ['PROCEEDING', 'APPLICATION_IN_PROGRESS', 'ABANDONED'],
  APPLICATION_IN_PROGRESS: ['CLOSED', 'DECLINED', 'ABANDONED'],
  CLOSED: ['SUPERSEDED'],
  DECLINED: ['EXPLORING', 'SUPERSEDED'],
  ABANDONED: ['EXPLORING', 'SUPERSEDED'],
  SUPERSEDED: [],
};

const INITIAL_STATUSES = new Set<RefinanceDecisionStatus>([
  RefinanceDecisionStatus.EXPLORING,
  RefinanceDecisionStatus.DEFERRED,
  RefinanceDecisionStatus.KEEP_CURRENT_LOAN,
  RefinanceDecisionStatus.PROCEEDING,
]);

const OUTCOME_STATUSES = new Set<RefinanceDecisionStatus>([
  RefinanceDecisionStatus.CLOSED,
  RefinanceDecisionStatus.DECLINED,
  RefinanceDecisionStatus.ABANDONED,
]);

export function assertRefinanceDecisionTransition(
  fromStatus: RefinanceDecisionStatus | null,
  toStatus: RefinanceDecisionStatus,
): void {
  if (fromStatus == null) {
    if (!INITIAL_STATUSES.has(toStatus)) {
      throw new APIError(
        `A refinance journey cannot begin in ${toStatus}.`,
        409,
        'INVALID_REFINANCE_DECISION_TRANSITION',
      );
    }
    return;
  }
  if (fromStatus === toStatus || !ALLOWED_TRANSITIONS[fromStatus].includes(toStatus)) {
    throw new APIError(
      `A refinance decision cannot move from ${fromStatus} to ${toStatus}.`,
      409,
      'INVALID_REFINANCE_DECISION_TRANSITION',
    );
  }
}

function eventTypeForTransition(
  fromStatus: RefinanceDecisionStatus | null,
  toStatus: RefinanceDecisionStatus,
): DomainEventType {
  if (fromStatus == null) return DomainEventType.REFINANCE_DECISION_RECORDED;
  if (OUTCOME_STATUSES.has(toStatus)) return DomainEventType.REFINANCE_OUTCOME_COMPLETED;
  if (
    toStatus === RefinanceDecisionStatus.OFFER_SELECTED ||
    toStatus === RefinanceDecisionStatus.APPLICATION_IN_PROGRESS
  ) {
    return DomainEventType.REFINANCE_NEXT_STEP_STARTED;
  }
  return DomainEventType.REFINANCE_DECISION_CHANGED;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function offerIds(value: unknown): string[] {
  const source = record(value);
  const offers = Array.isArray(value)
    ? value
    : Array.isArray(source.offers)
      ? source.offers
      : [];
  return offers.flatMap((offer) => {
    const id = record(offer).id;
    return typeof id === 'string' ? [id] : [];
  });
}

function toDecisionDto(row: any) {
  return {
    id: row.id,
    propertyId: row.propertyId,
    recordedByUserId: row.recordedByUserId,
    status: row.status,
    radarOpportunityId: row.radarOpportunityId,
    scenarioSnapshotId: row.scenarioSnapshotId,
    loanEstimateComparisonId: row.loanEstimateComparisonId,
    selectedOfferId: row.selectedOfferId,
    rationale: row.rationale,
    nextReviewAt: row.nextReviewAt?.toISOString() ?? null,
    decidedAt: row.decidedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    history: (row.history ?? []).map((item: any) => ({
      id: item.id,
      fromStatus: item.fromStatus,
      toStatus: item.toStatus,
      rationale: item.rationale,
      occurredAt: item.occurredAt.toISOString(),
    })),
  };
}

function validateNextReviewAt(value: string | undefined, now: Date): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  const maximum = new Date(now);
  maximum.setUTCFullYear(maximum.getUTCFullYear() + 2);
  if (Number.isNaN(parsed.getTime()) || parsed <= now || parsed > maximum) {
    throw new APIError(
      'The next review date must be in the future and within two years.',
      400,
      'INVALID_REFINANCE_REVIEW_DATE',
    );
  }
  return parsed;
}

async function validateLinkedRecords(
  tx: Prisma.TransactionClient,
  propertyId: string,
  input: RecordRefinanceDecisionBody,
) {
  const [opportunity, scenario, comparison, radarState] = await Promise.all([
    input.radarOpportunityId
      ? tx.refinanceOpportunity.findFirst({
          where: { id: input.radarOpportunityId, propertyId },
          select: { id: true },
        })
      : null,
    input.scenarioSnapshotId
      ? tx.refinanceScenarioSnapshot.findFirst({
          where: { id: input.scenarioSnapshotId, propertyId, isSaved: true },
          select: { id: true },
        })
      : null,
    input.loanEstimateComparisonId
      ? tx.refinanceLoanEstimateComparisonSnapshot.findFirst({
          where: { id: input.loanEstimateComparisonId, propertyId },
          select: { id: true, offersJson: true },
        })
      : null,
    tx.propertyRefinanceRadarState.findUnique({
      where: { propertyId },
      select: { currentOpportunityId: true },
    }),
  ]);
  if (input.radarOpportunityId && !opportunity) {
    throw new APIError('Refinance opportunity not found for this property.', 404, 'REFINANCE_OPPORTUNITY_NOT_FOUND');
  }
  if (input.scenarioSnapshotId && !scenario) {
    throw new APIError('Saved refinance scenario not found for this property.', 404, 'REFINANCE_SCENARIO_NOT_FOUND');
  }
  if (input.loanEstimateComparisonId && !comparison) {
    throw new APIError('Saved Loan Estimate comparison not found for this property.', 404, 'REFINANCE_COMPARISON_NOT_FOUND');
  }
  if (input.selectedOfferId) {
    if (!comparison || !offerIds(comparison.offersJson).includes(input.selectedOfferId)) {
      throw new APIError(
        'The selected offer must belong to the linked saved Loan Estimate comparison.',
        400,
        'REFINANCE_SELECTED_OFFER_NOT_FOUND',
      );
    }
  }
  return {
    radarOpportunityId: input.radarOpportunityId ?? radarState?.currentOpportunityId ?? null,
  };
}

async function loadDecision(tx: Prisma.TransactionClient, decisionId: string) {
  return tx.refinanceDecision.findUniqueOrThrow({
    where: { id: decisionId },
    include: { history: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] } },
  });
}

export async function getCurrentRefinanceDecision(propertyId: string) {
  const row = await prisma.refinanceDecision.findFirst({
    where: { propertyId, currentKey: propertyId },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    include: { history: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] } },
  });
  return row ? toDecisionDto(row) : null;
}

export async function recordRefinanceDecision(input: {
  propertyId: string;
  userId: string;
  body: RecordRefinanceDecisionBody;
}) {
  const now = new Date();
  const nextReviewAt = input.body.status === RefinanceDecisionStatus.DEFERRED
    ? validateNextReviewAt(input.body.nextReviewAt, now)
    : null;

  return prisma.$transaction(async (tx) => {
    const repeated = await tx.refinanceDecisionHistory.findUnique({
      where: { clientMutationId: input.body.clientMutationId },
      include: { decision: true },
    });
    if (repeated) {
      if (repeated.decision.propertyId !== input.propertyId) {
        throw new APIError('The mutation ID is already in use.', 409, 'REFINANCE_MUTATION_CONFLICT');
      }
      return { decision: toDecisionDto(await loadDecision(tx, repeated.decisionId)), idempotent: true };
    }

    const current = await tx.refinanceDecision.findFirst({
      where: { propertyId: input.propertyId, currentKey: input.propertyId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    const fromStatus = current?.status ?? null;
    const toStatus = input.body.status as RefinanceDecisionStatus;
    assertRefinanceDecisionTransition(fromStatus, toStatus);
    if (current && input.body.expectedVersion != null && input.body.expectedVersion !== current.version) {
      throw new APIError(
        'This refinance decision changed in another session. Refresh before trying again.',
        409,
        'REFINANCE_DECISION_VERSION_CONFLICT',
      );
    }

    const linked = await validateLinkedRecords(tx, input.propertyId, input.body);
    const previousMortgage = toStatus === RefinanceDecisionStatus.CLOSED
      ? await tx.propertyFinancingProfile.findUnique({ where: { propertyId: input.propertyId } })
      : null;
    const existingMetadata = record(current?.metadataJson);
    const completionMetadata = input.body.completedMortgage
      ? {
          verifiedClosing: {
            confirmedByUserId: input.userId,
            confirmedAt: now.toISOString(),
            priorMortgage: previousMortgage ? {
              mortgageStatus: previousMortgage.mortgageStatus,
              currentMortgageBalanceCents: previousMortgage.currentMortgageBalanceCents,
              interestRateBps: previousMortgage.interestRateBps,
              remainingTermMonths: previousMortgage.remainingTermMonths,
              monthlyPaymentCents: previousMortgage.monthlyPaymentCents,
              mortgageBalanceAsOfDate: previousMortgage.mortgageBalanceAsOfDate?.toISOString() ?? null,
            } : null,
          },
        }
      : {};

    let decisionId: string;
    let version: number;
    if (!current) {
      const created = await tx.refinanceDecision.create({
        data: {
          propertyId: input.propertyId,
          currentKey: input.propertyId,
          recordedByUserId: input.userId,
          status: toStatus,
          radarOpportunityId: linked.radarOpportunityId,
          scenarioSnapshotId: input.body.scenarioSnapshotId,
          loanEstimateComparisonId: input.body.loanEstimateComparisonId,
          selectedOfferId: input.body.selectedOfferId,
          rationale: input.body.rationale,
          nextReviewAt,
          completedAt: OUTCOME_STATUSES.has(toStatus) ? now : null,
          metadataJson: { contractVersion: 'refinance-decision-v1', ...completionMetadata },
        },
        select: { id: true, version: true },
      });
      decisionId = created.id;
      version = created.version;
    } else {
      const result = await tx.refinanceDecision.updateMany({
        where: { id: current.id, version: current.version },
        data: {
          status: toStatus,
          currentKey: toStatus === RefinanceDecisionStatus.SUPERSEDED
            ? null
            : input.propertyId,
          recordedByUserId: input.userId,
          radarOpportunityId: linked.radarOpportunityId ?? current.radarOpportunityId,
          scenarioSnapshotId: input.body.scenarioSnapshotId ?? current.scenarioSnapshotId,
          loanEstimateComparisonId:
            input.body.loanEstimateComparisonId ?? current.loanEstimateComparisonId,
          selectedOfferId: input.body.selectedOfferId ?? current.selectedOfferId,
          rationale: input.body.rationale ?? current.rationale,
          nextReviewAt,
          completedAt: OUTCOME_STATUSES.has(toStatus) ? now : null,
          version: { increment: 1 },
          metadataJson: { ...existingMetadata, ...completionMetadata },
        },
      });
      if (result.count !== 1) {
        throw new APIError(
          'This refinance decision changed in another session. Refresh before trying again.',
          409,
          'REFINANCE_DECISION_VERSION_CONFLICT',
        );
      }
      decisionId = current.id;
      version = current.version + 1;
    }

    const history = await tx.refinanceDecisionHistory.create({
      data: {
        decisionId,
        actorUserId: input.userId,
        fromStatus,
        toStatus,
        rationale: input.body.rationale,
        clientMutationId: input.body.clientMutationId,
        metadataJson: {
          version,
          radarOpportunityId: linked.radarOpportunityId,
          scenarioSnapshotId: input.body.scenarioSnapshotId ?? null,
          loanEstimateComparisonId: input.body.loanEstimateComparisonId ?? null,
          selectedOfferId: input.body.selectedOfferId ?? null,
        },
      },
    });

    if (input.body.completedMortgage) {
      const mortgage = input.body.completedMortgage;
      await tx.propertyFinancingProfile.upsert({
        where: { propertyId: input.propertyId },
        create: {
          propertyId: input.propertyId,
          mortgageStatus: PropertyMortgageStatus.MORTGAGED,
          currentMortgageBalanceCents: Math.round(mortgage.currentMortgageBalanceUsd * 100),
          interestRateBps: Math.round(mortgage.interestRatePct * 100),
          remainingTermMonths: mortgage.remainingTermMonths,
          monthlyPaymentCents: mortgage.monthlyPaymentUsd == null
            ? undefined
            : Math.round(mortgage.monthlyPaymentUsd * 100),
          mortgageBalanceAsOfDate: new Date(mortgage.mortgageBalanceAsOfDate),
        },
        update: {
          mortgageStatus: PropertyMortgageStatus.MORTGAGED,
          currentMortgageBalanceCents: Math.round(mortgage.currentMortgageBalanceUsd * 100),
          interestRateBps: Math.round(mortgage.interestRatePct * 100),
          remainingTermMonths: mortgage.remainingTermMonths,
          ...(mortgage.monthlyPaymentUsd == null ? {} : {
            monthlyPaymentCents: Math.round(mortgage.monthlyPaymentUsd * 100),
          }),
          mortgageBalanceAsOfDate: new Date(mortgage.mortgageBalanceAsOfDate),
        },
      });
    }

    const eventType = eventTypeForTransition(fromStatus, toStatus);
    await tx.domainEvent.create({
      data: {
        type: eventType,
        status: 'PENDING',
        propertyId: input.propertyId,
        userId: input.userId,
        idempotencyKey: `refinance-decision:${history.id}`,
        payload: {
          decisionId,
          historyId: history.id,
          fromStatus,
          toStatus,
          version,
          nextReviewAt: nextReviewAt?.toISOString() ?? null,
          occurredAt: history.occurredAt.toISOString(),
        },
      },
    });

    return { decision: toDecisionDto(await loadDecision(tx, decisionId)), idempotent: false };
  });
}

export async function deleteRefinanceDecision(
  propertyId: string,
  decisionId: string,
): Promise<boolean> {
  const deleted = await prisma.refinanceDecision.deleteMany({
    where: { id: decisionId, propertyId },
  });
  return deleted.count === 1;
}
