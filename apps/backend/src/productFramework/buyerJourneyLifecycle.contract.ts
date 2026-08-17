import type { z } from 'zod';
import {
  BuyerJourneyStageSchema,
  BuyerJourneyStatusSchema,
} from './buyerAcquisition.contract';

export type BuyerJourneyStageValue = z.infer<typeof BuyerJourneyStageSchema>;
export type BuyerJourneyStatusValue = z.infer<typeof BuyerJourneyStatusSchema>;

const FORWARD_STAGE_TRANSITIONS: Record<BuyerJourneyStageValue, readonly BuyerJourneyStageValue[]> = {
  EXPLORING: ['OFFER_CONTRACT', 'DUE_DILIGENCE'],
  OFFER_CONTRACT: ['EXPLORING', 'DUE_DILIGENCE'],
  DUE_DILIGENCE: ['OFFER_CONTRACT', 'CLOSING_PREP'],
  CLOSING_PREP: ['DUE_DILIGENCE', 'CLOSED'],
  CLOSED: ['MOVE_IN', 'FIRST_30_DAYS'],
  MOVE_IN: ['FIRST_30_DAYS'],
  FIRST_30_DAYS: ['DAYS_31_TO_90'],
  DAYS_31_TO_90: ['HANDED_OFF'],
  HANDED_OFF: [],
};

export const BUYER_JOURNEY_STATUS_TRANSITIONS: Record<BuyerJourneyStatusValue, readonly BuyerJourneyStatusValue[]> = {
  ACTIVE: ['PAUSED', 'CANCELLED', 'HANDED_OFF', 'ARCHIVED'],
  PAUSED: ['ACTIVE', 'CANCELLED', 'ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  HANDED_OFF: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionBuyerJourneyStage(
  current: BuyerJourneyStageValue,
  next: BuyerJourneyStageValue,
): boolean {
  return current === next || FORWARD_STAGE_TRANSITIONS[current].includes(next);
}

export function assertBuyerJourneyStageTransition(
  current: BuyerJourneyStageValue,
  next: BuyerJourneyStageValue,
): void {
  if (!canTransitionBuyerJourneyStage(current, next)) {
    throw new Error(`INVALID_BUYER_TRANSITION:${current}:${next}`);
  }
}

export function canTransitionBuyerJourneyStatus(
  current: BuyerJourneyStatusValue,
  next: BuyerJourneyStatusValue,
): boolean {
  return current === next || BUYER_JOURNEY_STATUS_TRANSITIONS[current].includes(next);
}

export function assertBuyerJourneyStatusTransition(
  current: BuyerJourneyStatusValue,
  next: BuyerJourneyStatusValue,
): void {
  if (!canTransitionBuyerJourneyStatus(current, next)) {
    throw new Error(`INVALID_BUYER_STATUS_TRANSITION:${current}:${next}`);
  }
}

export function deriveBuyerJourneyStage(input: {
  currentStage: BuyerJourneyStageValue;
  ownershipState?: 'SHOPPING' | 'UNDER_CONTRACT' | 'RECENT_OWNER' | 'ESTABLISHED_OWNER' | null;
  contractAccepted?: boolean;
  dueDiligenceStarted?: boolean;
  closingPreparationStarted?: boolean;
  closeConfirmed?: boolean;
  moveInConfirmed?: boolean;
  daysSinceOwnershipStart?: number | null;
  handoffCompleted?: boolean;
}): BuyerJourneyStageValue {
  if (input.handoffCompleted || input.ownershipState === 'ESTABLISHED_OWNER') return 'HANDED_OFF';
  if (input.closeConfirmed) {
    if (input.daysSinceOwnershipStart != null && input.daysSinceOwnershipStart >= 31) return 'DAYS_31_TO_90';
    if (input.daysSinceOwnershipStart != null && input.daysSinceOwnershipStart >= 1) return 'FIRST_30_DAYS';
    if (input.moveInConfirmed) return 'MOVE_IN';
    return 'CLOSED';
  }
  const inferredPreCloseStage = input.closingPreparationStarted
    ? 'CLOSING_PREP'
    : input.dueDiligenceStarted || input.ownershipState === 'UNDER_CONTRACT'
      ? 'DUE_DILIGENCE'
      : input.contractAccepted
        ? 'OFFER_CONTRACT'
        : 'EXPLORING';
  const preCloseOrder: readonly BuyerJourneyStageValue[] = [
    'EXPLORING',
    'OFFER_CONTRACT',
    'DUE_DILIGENCE',
    'CLOSING_PREP',
  ];
  const currentIndex = preCloseOrder.indexOf(input.currentStage);
  const inferredIndex = preCloseOrder.indexOf(inferredPreCloseStage);
  if (currentIndex === -1) return input.currentStage;
  return currentIndex > inferredIndex ? input.currentStage : inferredPreCloseStage;
}
