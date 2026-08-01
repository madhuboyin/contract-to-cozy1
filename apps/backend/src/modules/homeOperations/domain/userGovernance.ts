import type {
  OperationalWorkItemDisposition,
  OperationalWorkItemState,
  RecommendationSafetyTier,
} from '@prisma/client';
import { LEGAL_TRANSITIONS } from './transitions';

type GovernedWorkItem = {
  state: OperationalWorkItemState;
  safetyTier: RecommendationSafetyTier;
};

const DOMAIN_MANAGED_STATES = new Set<OperationalWorkItemState>([
  'IN_GUIDANCE',
  'IN_PROJECT',
  'REPORTED_COMPLETE',
  'VERIFIED',
  'FOLLOW_UP_DUE',
]);

/**
 * States a homeowner may change directly on the portfolio record. Execution
 * and outcome states are deliberately absent: Maintenance, Guidance, Project
 * Tracker, Booking, or another authoritative domain must publish those.
 */
export function legalUserWorkItemTransitions(item: GovernedWorkItem): OperationalWorkItemState[] {
  return LEGAL_TRANSITIONS[item.state].filter((to) => {
    if (DOMAIN_MANAGED_STATES.has(to)) return false;
    if (to === 'CLOSED' && item.state !== 'CANDIDATE') return false;
    if (item.safetyTier === 'SAFETY_EMERGENCY' && (to === 'DEFERRED' || to === 'CLOSED')) return false;
    return true;
  });
}

export class GovernedWorkItemTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GovernedWorkItemTransitionError';
  }
}

export function assertUserWorkItemTransition(
  item: GovernedWorkItem,
  to: OperationalWorkItemState,
  disposition?: OperationalWorkItemDisposition,
): void {
  if (!legalUserWorkItemTransitions(item).includes(to)) {
    if (DOMAIN_MANAGED_STATES.has(to) || (to === 'CLOSED' && item.state !== 'CANDIDATE')) {
      throw new GovernedWorkItemTransitionError(
        'This status is controlled by the linked task, guidance journey, booking, or project. Complete or update the work there.',
      );
    }
    if (item.safetyTier === 'SAFETY_EMERGENCY') {
      throw new GovernedWorkItemTransitionError(
        'Safety and emergency work cannot be deferred or dismissed from Home Operations. Use the governed resolution path.',
      );
    }
    throw new GovernedWorkItemTransitionError(`The requested ${item.state} → ${to} transition is not available to a homeowner.`);
  }

  if (to === 'CLOSED' && !disposition) {
    throw new GovernedWorkItemTransitionError('Removing a recommendation requires an explicit disposition.');
  }
}

