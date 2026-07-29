export type ServiceQuoteDecisionStage =
  | 'QUOTE_INTAKE'
  | 'PRICE_REVIEW'
  | 'SCOPE_REVIEW'
  | 'COMPARISON'
  | 'NEGOTIATION'
  | 'FINALIZATION'
  | 'BOOKING'
  | 'SCHEDULED'
  | 'COMPLETED'
  | 'CLOSED';

export type ServiceQuoteDecisionOutcome =
  | 'OPEN'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'DEFERRED'
  | 'BOOKED'
  | 'COMPLETED'
  | 'CANCELLED';

export type ServiceQuoteDecisionEntityType =
  | 'INVENTORY_ITEM'
  | 'DOCUMENT'
  | 'INCIDENT'
  | 'SERVICE_RADAR_CHECK'
  | 'GUIDANCE_JOURNEY'
  | 'NEGOTIATION_CASE'
  | 'PRICE_FINALIZATION'
  | 'BOOKING'
  | 'PROJECT'
  | 'OTHER';

const ALLOWED_TRANSITIONS: Record<ServiceQuoteDecisionStage, ServiceQuoteDecisionStage[]> = {
  QUOTE_INTAKE: ['PRICE_REVIEW', 'SCOPE_REVIEW', 'COMPARISON', 'NEGOTIATION', 'FINALIZATION', 'CLOSED'],
  PRICE_REVIEW: ['SCOPE_REVIEW', 'COMPARISON', 'NEGOTIATION', 'FINALIZATION', 'CLOSED'],
  SCOPE_REVIEW: ['PRICE_REVIEW', 'COMPARISON', 'NEGOTIATION', 'FINALIZATION', 'CLOSED'],
  COMPARISON: ['SCOPE_REVIEW', 'NEGOTIATION', 'FINALIZATION', 'CLOSED'],
  NEGOTIATION: ['SCOPE_REVIEW', 'COMPARISON', 'FINALIZATION', 'CLOSED'],
  FINALIZATION: ['NEGOTIATION', 'BOOKING', 'CLOSED'],
  BOOKING: ['SCHEDULED', 'COMPLETED', 'CLOSED'],
  SCHEDULED: ['COMPLETED', 'CLOSED'],
  COMPLETED: ['CLOSED'],
  CLOSED: [],
};

export function canTransitionServiceQuoteDecision(
  fromStage: ServiceQuoteDecisionStage,
  toStage: ServiceQuoteDecisionStage,
) {
  return fromStage === toStage || ALLOWED_TRANSITIONS[fromStage].includes(toStage);
}
