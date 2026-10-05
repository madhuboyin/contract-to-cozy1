// Plan C.15.4 step 7 / packet D12: the governed audience adapter. It decides which audience-conditional profile facts belong in the
// actionable-completeness denominator, from GOVERNED WORKFLOW STATE ONLY:
//   BUYER   an active buyer journey for the property (`HomeBuyerChecklist`) that has NOT yet closed (see BUYER_ACTIVE_STAGES);
//   SELLER  a sale case in a live state (`PropertySaleCase`).
// Both active apply the union; neither excludes all seven conditional facts (see `computeActionableCompleteness`).
//
// Deliberately NOT signals (owner rule: never infer from property type, generic homeowner status or speculative intent):
//   - `DecisionThread` / the sell-hold-rent GOAL capture: it records that the homeowner is CONSIDERING selling, holding or renting
//     ("thinking about selling next year"; the confirmation copy itself says "nothing was listed or sold"). That is speculative
//     intent, not an active selling goal, and there is no recorded buyer goal at all today;
//   - `PropertyOnboarding.ownershipState` (SHOPPING, PREPARING_TRANSFER): a one-time self-report with no lifecycle, so it goes stale;
//   - dwelling type, ownership form, property use, occupancy or any other property fact.
// If an explicit, governed goal record is wanted later it needs its own model and review; the registry then gains a source here.
// A source-text test guards that this file reads only the two workflow tables.
import { logger } from '../../../lib/logger';
import { prisma } from '../../../lib/prisma';
import type { ProfileAudience } from './actionableProfileRegistry';

/** Bounded tokens explaining why an audience is active (for diagnostics and explainability; never homeowner data). */
export type AudienceActivationReason = 'BUYER_JOURNEY_ACTIVE' | 'SALE_CASE_ACTIVE';

export interface BuyerJourneyState {
  status: string;
  stage: string;
  completedAt: Date | null;
  cancelledAt: Date | null;
  handoffCompletedAt: Date | null;
  transitionedToRecurringAt: Date | null;
}

export interface SaleCaseState { status: string }

/**
 * The buyer stages in which the audience-conditional facts matter (owner decision): the pre-closing acquisition stages only. The audience
 * STOPS at CLOSED; every post-closing stage (MOVE_IN, FIRST_30_DAYS, DAYS_31_TO_90, HANDED_OFF) is excluded. A stage not listed here,
 * including any added later, is inactive until the owner classifies it.
 */
export const BUYER_ACTIVE_STAGES: ReadonlySet<string> = new Set(['EXPLORING', 'OFFER_CONTRACT', 'DUE_DILIGENCE', 'CLOSING_PREP']);

/**
 * Active buyer journey (pure): status ACTIVE, in a pre-closing stage, and not completed, cancelled, handed off or transitioned to the
 * recurring home.
 */
export function isBuyerJourneyActive(journey: BuyerJourneyState | null): boolean {
  return journey !== null && journey.status === 'ACTIVE' && BUYER_ACTIVE_STAGES.has(journey.stage) && journey.completedAt === null
    && journey.cancelledAt === null && journey.handoffCompletedAt === null && journey.transitionedToRecurringAt === null;
}

/** Live sale case (pure): preparing, listed or under contract. Closed and cancelled cases are over. */
export const LIVE_SALE_CASE_STATUSES: ReadonlySet<string> = new Set(['PREPARING', 'LISTED', 'UNDER_CONTRACT']);
export function isSaleCaseActive(saleCase: SaleCaseState | null): boolean {
  return saleCase !== null && LIVE_SALE_CASE_STATUSES.has(saleCase.status);
}

/** The slice of Prisma this adapter reads, injectable so no database is needed to test it. */
export interface ProfileAudienceDb {
  homeBuyerChecklist: { findUnique(args: any): Promise<BuyerJourneyState | null> };
  propertySaleCase: { findUnique(args: any): Promise<SaleCaseState | null> };
}

export interface ProfileAudienceState {
  /** Sorted, ready for `computeActionableCompleteness({ activeAudiences })`. */
  audiences: ProfileAudience[];
  reasons: AudienceActivationReason[];
  /**
   * False when a lookup failed. The audience set then contains only what could be established (never a guess), so the denominator may be
   * too small. This MUST propagate: pass `activeAudiences: state.audiences` and `audienceUncertain: !state.ok` to
   * `computeActionableCompleteness`, and the result's `audienceUncertain` to the exact-four policy, which then does not treat the home
   * as at or above 90% and reports the uncertainty.
   */
  ok: boolean;
}

/** Two unique-key reads in parallel, nothing else. Fails toward "not active" (never a guess) and reports `ok: false`. */
export async function loadProfileAudienceState(propertyId: string, db: ProfileAudienceDb = prisma as unknown as ProfileAudienceDb): Promise<ProfileAudienceState> {
  const [journey, saleCase] = await Promise.allSettled([
    db.homeBuyerChecklist.findUnique({
      where: { propertyId },
      select: { status: true, stage: true, completedAt: true, cancelledAt: true, handoffCompletedAt: true, transitionedToRecurringAt: true },
    }),
    db.propertySaleCase.findUnique({ where: { propertyId }, select: { status: true } }),
  ]);
  const audiences: ProfileAudience[] = [];
  const reasons: AudienceActivationReason[] = [];
  let ok = true;
  if (journey.status === 'fulfilled') {
    if (isBuyerJourneyActive(journey.value)) { audiences.push('BUYER'); reasons.push('BUYER_JOURNEY_ACTIVE'); }
  } else {
    ok = false;
    logger.warn({ err: journey.reason, propertyId }, '[ask-suggested-actions] buyer journey audience lookup failed; treated as inactive');
  }
  if (saleCase.status === 'fulfilled') {
    if (isSaleCaseActive(saleCase.value)) { audiences.push('SELLER'); reasons.push('SALE_CASE_ACTIVE'); }
  } else {
    ok = false;
    logger.warn({ err: saleCase.reason, propertyId }, '[ask-suggested-actions] sale case audience lookup failed; treated as inactive');
  }
  return { audiences: audiences.sort(), reasons, ok };
}
