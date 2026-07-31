import type { GuidanceJourney, RecommendationSafetyTier } from '@prisma/client';
import type { ProposedWorkItem, WorkItemSourceAdapter } from '../domain/sourceAdapter';
import type { WorkSubject } from '../domain/workKey';

/**
 * Proof adapter for Slice 1 — proves the identity resolver end to end for
 * one real source. Guidance was chosen over Maintenance/Project because it
 * is the cleanest single-obligation-per-journey case: no recurrence model
 * to design around (unlike Maintenance) and no execution-link duality
 * (unlike Project). This adapter is NOT wired into
 * homeActionSourcePromotion.service.ts or any live route/job — that cutover
 * is Slice 2's job.
 *
 * GuidanceJourney has no safetyTier column of its own (it lives on
 * GuidanceJourneyStep) — callers must resolve the journey's current step's
 * safetyTier and pass it in, since fetching it is a query concern, not
 * adapter logic.
 */
export type GuidanceJourneyForAdapter = Pick<GuidanceJourney,
  'id' | 'propertyId' | 'inventoryItemId' | 'journeyTypeKey' | 'scopeCategory' |
  'status' | 'templateVersion' | 'version' | 'isLowContext' | 'missingContextKeys'
> & {
  currentStepSafetyTier: RecommendationSafetyTier | null;
};

// Matches the open-journey filter already used in production by
// homeActionSourcePromotion.service.ts's loadGuidanceActions.
const OPEN_JOURNEY_STATUSES = new Set(['NOT_STARTED', 'ACTIVE']);

export const guidanceJourneySourceAdapter: WorkItemSourceAdapter<GuidanceJourneyForAdapter> = {
  sourceType: 'GUIDANCE',
  propose(journey, propertyId): ProposedWorkItem | null {
    if (!OPEN_JOURNEY_STATUSES.has(journey.status)) return null;

    const subject: WorkSubject = journey.scopeCategory === 'ITEM' && journey.inventoryItemId
      ? { type: 'INVENTORY_ITEM', id: journey.inventoryItemId }
      : { type: 'PROPERTY', id: propertyId };

    return {
      propertyId,
      subject,
      obligationType: 'DECISION',
      occurrence: { obligationSlug: `guidance-${journey.journeyTypeKey ?? 'resolution'}` },
      title: 'Resolve guidance decision',
      homeownerReason: 'A guided decision is open for this item.',
      expectedOutcome: 'A clear next step is chosen and recorded.',
      priority: journey.status === 'ACTIVE' ? 'SOON' : 'PLAN',
      safetyTier: journey.currentStepSafetyTier ?? 'LOW_CONSEQUENCE',
      // Item #19 (§5.15): intentionally no dueWindowStart/dueAt/dueWindowEnd
      // — a guidance DECISION obligation has no execution-date concept by
      // design (see the plan's non-goals). It gets only the next-review
      // half of the model (nextReviewAt on BLOCKED), not this half. Not
      // fabricated here to force uniformity with the other five systems.
      confidence: journey.isLowContext ? 0.4 : null,
      missingContext: journey.missingContextKeys,
      source: {
        sourceType: 'GUIDANCE',
        sourceEntityId: journey.id,
        sourceVersion: journey.templateVersion ?? String(journey.version),
        sourceRole: 'TRIGGER',
      },
    };
  },
};
