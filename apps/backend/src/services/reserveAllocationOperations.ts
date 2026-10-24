// Confirming a reserve line item's allocation: the proof that an expense is funded (continuation FRD section 33).
//
// A reserve line item is created and updated by the recalculation service, so it existing, or its calculated amount, proves nothing. A person confirming THAT line item does. This is the
// one write that sets the confirmation, and the one place that reports it to a guided journey: the Desktop route and Ask both call it, so neither can complete the step with weaker proof.
// A generic contribution to the parent fund never reaches here.

import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { logger } from '../lib/logger';
import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';
import { resolveGuidanceStepBinding, type GuidanceStepBindingResult } from './guidanceEngine/guidanceStepBinding';
import { homeReserveFundCalculationService } from './homeReserveFundCalculation.service';

export const FUNDING_STEP_TOOL_KEY = 'capital-timeline';
export const FUNDING_STEP_KEYS = ['fund_capital_expense'] as const;

type LineItemRow = { id: string; timelineItemId: string; allocatedMonthlyCents: number; targetCostCents: number; allocationConfirmedAt: Date | null; allocationConfirmedMonthlyCents: number | null };

/**
 * Whether a journey step may be completed by confirming this line item: the capital-timeline funding step, open, on an open journey, and the journey is about this very expense (the reserve-fund shortfall signal
 * names the timeline item; a journey whose signal did not come from the reserve fund, or names another expense, is refused). Re-read every time it is used.
 */
export async function resolveFundingStepBinding(propertyId: string, stepId: string, lineItem: Pick<LineItemRow, 'timelineItemId'>): Promise<GuidanceStepBindingResult> {
  const bound = await resolveGuidanceStepBinding(propertyId, stepId, { toolKey: FUNDING_STEP_TOOL_KEY, stepKeys: FUNDING_STEP_KEYS });
  if (!bound.ok) return bound;
  const source = bound.binding.signalSource;
  if (source.toolKey !== 'reserve-fund' || !source.entityId || source.entityId !== lineItem.timelineItemId) return { ok: false, reason: 'WRONG_SUBJECT' };
  return bound;
}

/** Builds the report for a confirmed allocation: the line item, who confirmed it and the monthly amount they confirmed. */
export function buildReserveAllocationCompletion(propertyId: string, actorUserId: string, lineItem: LineItemRow, target: { journeyId: string; stepKey: string; signalIntentFamily: string | null; inventoryItemId: string | null }) {
  const confirmedAt = (lineItem.allocationConfirmedAt ?? new Date()).toISOString();
  return {
    propertyId, actorUserId, journeyId: target.journeyId, inventoryItemId: target.inventoryItemId,
    signalIntentFamily: target.signalIntentFamily ?? 'financial_exposure', issueDomain: 'FINANCIAL' as const,
    sourceToolKey: FUNDING_STEP_TOOL_KEY, sourceEntityType: 'RESERVE_FUND_LINE_ITEM', sourceEntityId: lineItem.id,
    stepKey: target.stepKey, status: 'COMPLETED' as const,
    dedupeKey: `reserve-allocation:${propertyId}:${lineItem.id}:${lineItem.allocationConfirmedMonthlyCents ?? lineItem.allocatedMonthlyCents}:${confirmedAt}`,
    producedData: {
      proofType: 'reserve_allocation_confirmation', proofId: lineItem.id, lineItemId: lineItem.id, timelineItemId: lineItem.timelineItemId,
      confirmedMonthlyCents: lineItem.allocationConfirmedMonthlyCents ?? lineItem.allocatedMonthlyCents, targetCostCents: lineItem.targetCostCents, confirmedAt, confirmedByUserId: actorUserId,
    },
  };
}

export type ConfirmAllocationResult = {
  lineItem: any;
  /** Whether the journey step was updated: null when no step was named, false when the step did not fit or the report failed. */
  guidanceReported: boolean | null;
  guidanceRefusal: string | null;
};

/**
 * Confirms a line item's current allocation (explicit homeowner confirmation), then reports it to the journey step it was started for, if one was named. The confirmation is saved even when the
 * report cannot be made; a step that does not fit (stale, another tool, another expense) reports nothing and falls back to no other step.
 */
export async function confirmReserveAllocationWithEffects(propertyId: string, userId: string, lineItemId: string, options: { guidanceStepId?: string | null } = {}): Promise<ConfirmAllocationResult> {
  const fund = await homeReserveFundCalculationService.getOrCreateFund(propertyId);
  const existing = await prisma.homeReserveFundLineItem.findFirst({ where: { id: lineItemId, fundId: fund.id } });
  if (!existing) throw new APIError('Line item not found', 404, 'LINE_ITEM_NOT_FOUND');
  if (existing.status !== 'ACTIVE') throw new APIError('Line item is not active', 400, 'LINE_ITEM_NOT_ACTIVE');
  const lineItem = await prisma.homeReserveFundLineItem.update({
    where: { id: lineItemId },
    data: { allocationConfirmedAt: new Date(), allocationConfirmedByUserId: userId, allocationConfirmedMonthlyCents: existing.allocatedMonthlyCents },
  });
  if (!options.guidanceStepId) return { lineItem, guidanceReported: null, guidanceRefusal: null };
  const bound = await resolveFundingStepBinding(propertyId, options.guidanceStepId, lineItem);
  if (!bound.ok) return { lineItem, guidanceReported: false, guidanceRefusal: bound.reason };
  try {
    await guidanceJourneyService.recordToolCompletion(buildReserveAllocationCompletion(propertyId, userId, lineItem as LineItemRow, bound.binding));
    return { lineItem, guidanceReported: true, guidanceRefusal: null };
  } catch (guidanceError) {
    logger.warn({ guidanceError, lineItemId }, '[GUIDANCE] reserve allocation completion report failed');
    return { lineItem, guidanceReported: false, guidanceRefusal: null };
  }
}
