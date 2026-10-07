import { getPropertyContext } from '../../../modules/propertyContext/application/getPropertyContext';
import type { PropertyContextSnapshot } from '../../../modules/propertyContext/domain/contracts';
import { WARRANTY_EXPIRING_DAYS, warrantyDaysRemaining } from '../handlers/warranties.handler';
import {
  DEFAULT_CANDIDATE_SIGNALS, DEFAULT_CANDIDATE_TRAITS, SuggestedNextActionCandidateSchema,
  type SuggestedNextActionCandidate,
} from './suggestedNextActionCandidate';

export const HOME_OPPORTUNITY_PRODUCER_ID = 'home-opportunities.signals';

export interface HomeOpportunityState {
  contextVersion: string;
  capitalItemsUpcoming: boolean;
  warrantyExpiring: boolean;
  openFindings: boolean;
}

type Row = Record<string, unknown>;
const knownRows = (facts: Record<string, { state: string; value: unknown }>, key: string): Row[] => {
  const fact = facts[key];
  return fact?.state === 'KNOWN' && Array.isArray(fact.value)
    ? fact.value.filter((value): value is Row => Boolean(value) && typeof value === 'object' && !Array.isArray(value))
    : [];
};
const validDate = (value: unknown): Date | null => {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

export function homeOpportunityStateFromSnapshot(snapshot: PropertyContextSnapshot, now = new Date()): HomeOpportunityState {
  const capitalHorizon = new Date(now);
  capitalHorizon.setUTCMonth(capitalHorizon.getUTCMonth() + 24);
  const capitalItemsUpcoming = knownRows(snapshot.facts, 'financial.upcomingCapitalExposure').some((row) => {
    const start = validDate(row.windowStart); const end = validDate(row.windowEnd);
    return Boolean(start && end && start <= capitalHorizon && end >= now);
  });
  const warrantyExpiring = knownRows(snapshot.facts, 'coverage.warranties').some((row) => {
    const start = validDate(row.startDate); const expiry = validDate(row.expiryDate);
    if (!start || !expiry || start > now) return false;
    const days = warrantyDaysRemaining(expiry, now);
    return days >= 0 && days <= WARRANTY_EXPIRING_DAYS;
  });
  return {
    contextVersion: snapshot.contextVersion,
    capitalItemsUpcoming,
    warrantyExpiring,
    openFindings: knownRows(snapshot.facts, 'inspection.openFindings').length > 0,
  };
}

export async function loadHomeOpportunityState(
  input: { userId: string; propertyId: string },
  now = new Date(),
  loadContext: typeof getPropertyContext = getPropertyContext,
): Promise<HomeOpportunityState> {
  const snapshot = await loadContext(input.propertyId, { userId: input.userId }, { scopes: ['FINANCIAL', 'COVERAGE', 'INSPECTION'] });
  return homeOpportunityStateFromSnapshot(snapshot, now);
}

export async function homeOpportunityCandidates(
  input: { userId: string; propertyId: string },
  loadState: typeof loadHomeOpportunityState = loadHomeOpportunityState,
): Promise<SuggestedNextActionCandidate[]> {
  const state = await loadState(input);
  const base = {
    source: 'PLATFORM_STATE' as const, sourceOperationId: null, interactionType: 'CONVERSATION_CONTINUE' as const,
    entityContext: { propertyId: input.propertyId, entityType: null, entityId: null, contextVersion: state.contextVersion },
    tier: 'DISCOVERY' as const, slotClass: 'HOME_OPPORTUNITY' as const, requiredFacts: [] as string[],
    signals: { ...DEFAULT_CANDIDATE_SIGNALS, materiality: 2 as const, sourceConfidence: 1 }, traits: { ...DEFAULT_CANDIDATE_TRAITS },
  };
  return [
    state.capitalItemsUpcoming ? { ...base, label: 'See the big projects coming up', message: 'Show my capital reserve plan.', operationId: 'CAPITAL_RESERVE_PLAN', outcomeKey: 'REVIEW_CAPITAL_OUTLOOK', reasonCodes: ['WHY_NOW_CAPITAL_ITEMS_UPCOMING'] } : null,
    state.warrantyExpiring ? { ...base, label: "Check what's expiring soon", message: 'Show warranties expiring soon.', operationId: 'WARRANTY_LOOKUP', outcomeKey: 'REVIEW_EXPIRING_WARRANTIES', reasonCodes: ['WHY_NOW_WARRANTY_EXPIRING'] } : null,
    state.openFindings ? { ...base, label: 'Review the open inspection items', message: 'Show my open inspection findings.', operationId: 'INSPECTION_FINDINGS', outcomeKey: 'REVIEW_OPEN_FINDINGS', reasonCodes: ['WHY_NOW_OPEN_FINDINGS'] } : null,
  ].filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null).map((candidate) => SuggestedNextActionCandidateSchema.parse(candidate));
}
