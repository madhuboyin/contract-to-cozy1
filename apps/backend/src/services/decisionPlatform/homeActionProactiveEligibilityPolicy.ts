// Ask Intelligence FRD §18.2/§18.3, Phase 9C. Pure, DB-free eligibility
// checklist for whether a single PRIORITY_LIST item (Phase 9B) may be sent
// externally. Mirrors radarNotificationPolicy.ts's shape (pure function,
// stable reason codes, ranked/normalized inputs) but scoped to governed
// Home Actions rather than Radar events. All impure lookups -- consent,
// channel policy, budget counts -- are resolved by the caller
// (homeActionProactiveDelivery.service.ts) and passed in already-resolved,
// so this stays unit-testable without a database, like priorityListPolicy.ts.
//
// FRD §18.2: "Safety and mandatory deadlines use separately reviewed
// policies. They do not silently bypass channel law, consent, or emergency
// boundaries" -- this module has no override path: every check applies
// uniformly, including to DO_NOW/safety-tier items. A SAFETY_EMERGENCY item
// still needs consent and budget headroom to go out externally; the urgency
// only affects category routing (see categorizeHomeActionForNotification),
// never this eligibility gate.

import type { NotificationCategory } from '../../productFramework/notificationPolicy.contract';
import type { RankedHomeAction } from '../homeActions.service';
import type { ConsumerPriorityCategory } from './priorityListPolicy';

export const HOME_ACTION_PROACTIVE_REASON_CODES = [
  'ELIGIBLE',
  'NOT_MATERIAL',
  'SUPPRESSED',
  'COMPLETED',
  'UNAVAILABLE',
  'NO_ACTIONABLE_CTA',
  'CONSENT_MISSING',
  'CHANNEL_DISABLED',
  'DAILY_BUDGET_EXCEEDED',
  'WEEKLY_BUDGET_EXCEEDED',
] as const;
export type HomeActionProactiveReasonCode = typeof HOME_ACTION_PROACTIVE_REASON_CODES[number];

// FRD §17.3's DO_NOW/PLAN_SOON are the only categories with a real,
// time-bounded action behind them -- WATCH/OPTIONAL/NO_ACTION are honest
// "nothing to do yet" states that never justify interrupting a user outside
// the product.
const MATERIAL_CONSUMER_PRIORITIES = new Set<ConsumerPriorityCategory>(['DO_NOW', 'PLAN_SOON']);

export interface HomeActionProactiveEligibilityItem {
  consumerPriority: ConsumerPriorityCategory;
  cta: { href: string; label: string } | null;
  suppressed: boolean;
  completed: boolean;
  unavailable: boolean;
}

export interface HomeActionProactiveBudget {
  dailyCount: number;
  dailyLimit: number;
  weeklyCount: number;
  weeklyLimit: number;
}

export interface HomeActionProactiveEligibilityInput {
  item: HomeActionProactiveEligibilityItem;
  hasConsent: boolean;
  channelEnabled: boolean;
  budget: HomeActionProactiveBudget;
  /**
   * True when this item's materiality just increased over its previously
   * sent state (e.g. PLAN_SOON -> DO_NOW) since the last external send for
   * this Home Action. FRD §18.2: "Safety and mandatory deadlines... do not
   * silently bypass channel law, consent, or emergency boundaries" -- so an
   * escalation only ever bypasses the *daily* budget, never consent,
   * channel, suppression, completion, or the weekly budget.
   */
  isEscalation?: boolean;
}

export interface HomeActionProactiveEligibilityResult {
  eligible: boolean;
  reasonCodes: HomeActionProactiveReasonCode[];
  escalationBudgetBypassed: boolean;
}

export function evaluateHomeActionProactiveEligibility(
  input: HomeActionProactiveEligibilityInput,
): HomeActionProactiveEligibilityResult {
  const reasonCodes: HomeActionProactiveReasonCode[] = [];
  const dailyBudgetExceeded = input.budget.dailyCount >= input.budget.dailyLimit;
  const escalationBudgetBypassed = Boolean(input.isEscalation) && dailyBudgetExceeded;

  if (!MATERIAL_CONSUMER_PRIORITIES.has(input.item.consumerPriority)) reasonCodes.push('NOT_MATERIAL');
  if (input.item.suppressed) reasonCodes.push('SUPPRESSED');
  if (input.item.completed) reasonCodes.push('COMPLETED');
  if (input.item.unavailable) reasonCodes.push('UNAVAILABLE');
  if (!input.item.cta) reasonCodes.push('NO_ACTIONABLE_CTA');
  if (!input.hasConsent) reasonCodes.push('CONSENT_MISSING');
  if (!input.channelEnabled) reasonCodes.push('CHANNEL_DISABLED');
  if (dailyBudgetExceeded && !escalationBudgetBypassed) reasonCodes.push('DAILY_BUDGET_EXCEEDED');
  if (input.budget.weeklyCount >= input.budget.weeklyLimit) reasonCodes.push('WEEKLY_BUDGET_EXCEEDED');

  if (reasonCodes.length) return { eligible: false, reasonCodes, escalationBudgetBypassed: false };
  return { eligible: true, reasonCodes: ['ELIGIBLE'], escalationBudgetBypassed };
}

/**
 * Whether `next` represents a genuine materiality escalation over `previous`
 * for external-delivery purposes -- the only transition within the two
 * externally-eligible categories (FRD §17.3's DO_NOW/PLAN_SOON) that
 * justifies bypassing the daily budget. A repeat at the same category, a
 * downgrade, or no prior send at all is never an escalation.
 */
export function isHomeActionProactiveEscalation(
  previous: ConsumerPriorityCategory | null,
  next: ConsumerPriorityCategory,
): boolean {
  return previous === 'PLAN_SOON' && next === 'DO_NOW';
}

// FRD §18.3 "lock-screen redaction" applied conservatively to email as well
// -- material-financial and regulated-coverage items should not put dollar
// figures or percentages into a message that could be read by someone other
// than the intended recipient (a shared inbox, a lock-screen preview a
// forwarded copy). This never touches the in-product PRIORITY_LIST/
// Concierge Home rendering, only the copy handed to an external channel.
const CURRENCY_OR_PERCENT_PATTERN = /\$[\d,]+(?:\.\d+)?|\b\d+(?:\.\d+)?%/g;
const REDACTED_SAFETY_TIERS = new Set(['MATERIAL_FINANCIAL', 'REGULATED_COVERAGE']);

export function redactProactiveMessageBody(text: string, safetyTier: string): string {
  if (!REDACTED_SAFETY_TIERS.has(safetyTier)) return text;
  return text.replace(CURRENCY_OR_PERCENT_PATTERN, '[redacted]');
}

/**
 * Routes a Home Action to the existing notification taxonomy
 * (notificationPolicy.contract.ts) so it goes through the same
 * consent/preference/quiet-hours machinery every other category already
 * uses, rather than inventing a parallel one. Safety and coverage floors
 * take priority over source kind, matching priorityListPolicy.ts's
 * SAFETY_EMERGENCY hard floor.
 */
export function categorizeHomeActionForNotification(
  action: Pick<RankedHomeAction, 'governance' | 'source'>,
): NotificationCategory {
  if (action.governance.safetyTier === 'SAFETY_EMERGENCY') return 'SAFETY';
  if (action.governance.safetyTier === 'REGULATED_COVERAGE') return 'COVERAGE';
  switch (action.source.kind) {
    case 'MAINTENANCE': return 'MAINTENANCE';
    case 'PROJECT': return 'PROJECT';
    case 'RECALL': return 'RECALL';
    case 'SAVINGS_BENEFITS': return 'SAVINGS_BENEFITS';
    default: return 'GENERAL';
  }
}
