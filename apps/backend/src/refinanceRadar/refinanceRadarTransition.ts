import { RefinanceConfidenceLevel, RefinanceRadarState } from '@prisma/client';
import { REFINANCE_UPDATE_THRESHOLDS } from './config/refinanceRadar.config';

export type RefinanceTransitionKind = 'OPEN' | 'UPDATE' | 'CLOSED';

export type RefinanceTransition = {
  kind: RefinanceTransitionKind;
  previousState: RefinanceRadarState | null;
  nextState: RefinanceRadarState;
  materialChangeReasons: string[];
};

type OpportunityMetrics = {
  monthlySavings: number;
  breakEvenMonths: number | null;
  marketRatePct: number;
  confidenceLevel: RefinanceConfidenceLevel | null;
};

export function detectRefinanceTransition(input: {
  previousState: RefinanceRadarState | null;
  nextState: RefinanceRadarState;
  previousOpportunity: OpportunityMetrics | null;
  nextOpportunity: OpportunityMetrics | null;
}): RefinanceTransition | null {
  if (
    input.nextState === RefinanceRadarState.OPEN &&
    input.previousState !== RefinanceRadarState.OPEN
  ) {
    return {
      kind: 'OPEN',
      previousState: input.previousState,
      nextState: input.nextState,
      materialChangeReasons: ['OPPORTUNITY_THRESHOLD_MET'],
    };
  }

  if (
    input.nextState === RefinanceRadarState.CLOSED &&
    input.previousState === RefinanceRadarState.OPEN
  ) {
    return {
      kind: 'CLOSED',
      previousState: input.previousState,
      nextState: input.nextState,
      materialChangeReasons: ['OPPORTUNITY_THRESHOLD_NO_LONGER_MET'],
    };
  }

  if (
    input.nextState !== RefinanceRadarState.OPEN ||
    input.previousState !== RefinanceRadarState.OPEN ||
    !input.nextOpportunity
  ) {
    return null;
  }

  if (!input.previousOpportunity) {
    return {
      kind: 'UPDATE',
      previousState: input.previousState,
      nextState: input.nextState,
      materialChangeReasons: ['CURRENT_OPPORTUNITY_RESTORED'],
    };
  }

  const reasons: string[] = [];
  const savingsDelta = Math.abs(
    input.nextOpportunity.monthlySavings - input.previousOpportunity.monthlySavings,
  );
  const savingsThreshold = Math.max(
    REFINANCE_UPDATE_THRESHOLDS.MONTHLY_SAVINGS_USD,
    Math.abs(input.previousOpportunity.monthlySavings) *
      REFINANCE_UPDATE_THRESHOLDS.MONTHLY_SAVINGS_RATIO,
  );
  if (savingsDelta >= savingsThreshold) reasons.push('MONTHLY_SAVINGS_CHANGED');

  if (
    input.nextOpportunity.breakEvenMonths != null &&
    input.previousOpportunity.breakEvenMonths != null &&
    Math.abs(
      input.nextOpportunity.breakEvenMonths -
        input.previousOpportunity.breakEvenMonths,
    ) >= REFINANCE_UPDATE_THRESHOLDS.BREAK_EVEN_MONTHS
  ) {
    reasons.push('BREAK_EVEN_CHANGED');
  }

  if (
    Math.abs(
      input.nextOpportunity.marketRatePct -
        input.previousOpportunity.marketRatePct,
    ) >= REFINANCE_UPDATE_THRESHOLDS.MARKET_RATE_PCT
  ) {
    reasons.push('MARKET_RATE_CHANGED');
  }

  if (
    input.nextOpportunity.confidenceLevel !==
    input.previousOpportunity.confidenceLevel
  ) {
    reasons.push('CONFIDENCE_CHANGED');
  }

  return reasons.length > 0
    ? {
        kind: 'UPDATE',
        previousState: input.previousState,
        nextState: input.nextState,
        materialChangeReasons: reasons,
      }
    : null;
}

export function domainEventTypeForRefinanceTransition(
  kind: RefinanceTransitionKind,
):
  | 'REFINANCE_OPPORTUNITY_OPENED'
  | 'REFINANCE_OPPORTUNITY_UPDATED'
  | 'REFINANCE_OPPORTUNITY_CLOSED' {
  const eventTypes: Record<
    RefinanceTransitionKind,
    | 'REFINANCE_OPPORTUNITY_OPENED'
    | 'REFINANCE_OPPORTUNITY_UPDATED'
    | 'REFINANCE_OPPORTUNITY_CLOSED'
  > = {
    OPEN: 'REFINANCE_OPPORTUNITY_OPENED',
    UPDATE: 'REFINANCE_OPPORTUNITY_UPDATED',
    CLOSED: 'REFINANCE_OPPORTUNITY_CLOSED',
  };
  return eventTypes[kind];
}

export function buildRefinanceTransitionOutboxEvent(input: {
  propertyId: string;
  snapshotId: string;
  opportunityId: string | null;
  transition: RefinanceTransition;
  occurredAt: Date;
}) {
  return {
    type: domainEventTypeForRefinanceTransition(input.transition.kind),
    idempotencyKey:
      `refinance:${input.propertyId}:${input.snapshotId}:${input.transition.kind.toLowerCase()}`,
    payload: {
      propertyId: input.propertyId,
      previousState: input.transition.previousState,
      nextState: input.transition.nextState,
      transitionType: input.transition.kind,
      snapshotId: input.snapshotId,
      opportunityId: input.opportunityId,
      materialChangeReasons: input.transition.materialChangeReasons,
      occurredAt: input.occurredAt.toISOString(),
    },
  };
}
