// Exact-four curated starters (inventory D-O4/D-O16): PURE nominations, one function per starter source. Not registered in
// SUGGESTED_NEXT_ACTION_PRODUCERS and not called by the finalizer, so nothing here is live; the activation step wires it. A starter is the
// last-resort fill: it declares its slot class, carries no entity, and reads no recorded data. The producer identity is the registered
// nominations key (`STARTER_SEASONAL_PRODUCER_ID`), never a field on the candidate.
import { SuggestedNextActionCandidateSchema, DEFAULT_CANDIDATE_SIGNALS, DEFAULT_CANDIDATE_TRAITS, type SuggestedNextActionCandidate } from './suggestedNextActionCandidate';
import { SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE, SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE } from '../support/seasonalHomeCare';

export const STARTER_SEASONAL_PRODUCER_ID = 'starter.seasonal-home-care';

/** The seasonal read's two starters: distinct outcomes and messages on ONE operation (so a disabled operation removes both: inventory 4a). */
export function seasonalHomeCareStarters(propertyId: string): SuggestedNextActionCandidate[] {
  const base = {
    source: 'CAPABILITY_RECOMMENDATION' as const,
    sourceOperationId: null,
    operationId: 'SEASONAL_HOME_CARE',
    interactionType: 'CONVERSATION_CONTINUE' as const,
    entityContext: { propertyId, entityType: null, entityId: null, contextVersion: null },
    tier: 'DISCOVERY' as const,
    slotClass: 'CURATED_STARTER' as const,
    requiredFacts: [],
    reasonCodes: ['SEASONAL_STARTER'],
    signals: { ...DEFAULT_CANDIDATE_SIGNALS },
    traits: { ...DEFAULT_CANDIDATE_TRAITS },
  };
  return [
    SuggestedNextActionCandidateSchema.parse({ ...base, label: 'Home care for this season', message: SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE, outcomeKey: 'REVIEW_THIS_SEASON' }),
    SuggestedNextActionCandidateSchema.parse({ ...base, label: 'Get ready for next season', message: SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE, outcomeKey: 'PREPARE_NEXT_SEASON' }),
  ];
}
