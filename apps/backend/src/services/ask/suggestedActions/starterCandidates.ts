// Exact-four curated starters (inventory D-O4/D-O16): PURE nominations, one function per starter source. Not registered in
// SUGGESTED_NEXT_ACTION_PRODUCERS and not called by the finalizer, so nothing here is live; the activation step wires it. A starter is the
// last-resort fill: it declares its slot class, carries no entity, and reads no recorded data. The producer identity is the registered
// nominations key (`STARTER_SEASONAL_PRODUCER_ID`), never a field on the candidate.
import { SuggestedNextActionCandidateSchema, DEFAULT_CANDIDATE_SIGNALS, DEFAULT_CANDIDATE_TRAITS, type SuggestedNextActionCandidate } from './suggestedNextActionCandidate';
import { SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE, SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE } from '../support/seasonalHomeCare';
import { HOME_BASICS_MONTHLY_MESSAGE, HOME_BASICS_SAFETY_MESSAGE } from '../support/homeBasicsGuide';
import { HIRING_GUIDE_MESSAGE } from '../support/hiringGuide';

export const STARTER_SEASONAL_PRODUCER_ID = 'starter.seasonal-home-care';
export const STARTER_HOME_BASICS_PRODUCER_ID = 'starter.home-basics';
export const STARTER_HIRING_GUIDE_PRODUCER_ID = 'starter.hiring-guide';
export const STARTER_PROPERTY_SUMMARY_PRODUCER_ID = 'starter.property-summary';

/** The home-record summary's two stored starter messages. PROPERTY_SUMMARY is message-routable, so these are also real questions; the second selects the completeness focus. */
export const PROPERTY_SUMMARY_STARTER_MESSAGE = 'Give me a summary of my home record';
export const PROPERTY_SUMMARY_COMPLETENESS_STARTER_MESSAGE = 'How complete is my home record?';

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

/** The authored home-basics read's two starters: distinct outcomes and messages on ONE operation, no entity, no recorded data. */
export function homeBasicsStarters(propertyId: string): SuggestedNextActionCandidate[] {
  const base = {
    source: 'CAPABILITY_RECOMMENDATION' as const,
    sourceOperationId: null,
    operationId: 'HOME_BASICS_GUIDE',
    interactionType: 'CONVERSATION_CONTINUE' as const,
    entityContext: { propertyId, entityType: null, entityId: null, contextVersion: null },
    tier: 'DISCOVERY' as const,
    slotClass: 'CURATED_STARTER' as const,
    requiredFacts: [],
    reasonCodes: ['HOME_BASICS_STARTER'],
    signals: { ...DEFAULT_CANDIDATE_SIGNALS },
    traits: { ...DEFAULT_CANDIDATE_TRAITS },
  };
  return [
    SuggestedNextActionCandidateSchema.parse({ ...base, label: 'Home safety basics', message: HOME_BASICS_SAFETY_MESSAGE, outcomeKey: 'REVIEW_SAFETY_BASICS' }),
    SuggestedNextActionCandidateSchema.parse({ ...base, label: 'A simple monthly routine', message: HOME_BASICS_MONTHLY_MESSAGE, outcomeKey: 'REVIEW_MONTHLY_ROUTINE' }),
  ];
}

/** The authored hiring guide's one starter: a single, strong outcome (a second would need genuinely different value). */
export function hiringGuideStarters(propertyId: string): SuggestedNextActionCandidate[] {
  return [SuggestedNextActionCandidateSchema.parse({
    source: 'CAPABILITY_RECOMMENDATION',
    sourceOperationId: null,
    operationId: 'HIRING_GUIDE',
    interactionType: 'CONVERSATION_CONTINUE',
    entityContext: { propertyId, entityType: null, entityId: null, contextVersion: null },
    tier: 'DISCOVERY',
    slotClass: 'CURATED_STARTER',
    requiredFacts: [],
    reasonCodes: ['HIRING_GUIDE_STARTER'],
    signals: { ...DEFAULT_CANDIDATE_SIGNALS },
    traits: { ...DEFAULT_CANDIDATE_TRAITS },
    label: 'Before you hire a contractor',
    message: HIRING_GUIDE_MESSAGE,
    outcomeKey: 'REVIEW_HIRING_CHECKLIST',
  })];
}

/** The home-record summary's two starters: distinct outcomes and messages on ONE operation, no entity. Executed on an empty home (inventory 4c). */
export function propertySummaryStarters(propertyId: string): SuggestedNextActionCandidate[] {
  const base = {
    source: 'CAPABILITY_RECOMMENDATION' as const,
    sourceOperationId: null,
    operationId: 'PROPERTY_SUMMARY',
    interactionType: 'CONVERSATION_CONTINUE' as const,
    entityContext: { propertyId, entityType: null, entityId: null, contextVersion: null },
    tier: 'DISCOVERY' as const,
    slotClass: 'CURATED_STARTER' as const,
    requiredFacts: [],
    reasonCodes: ['PROPERTY_SUMMARY_STARTER'],
    signals: { ...DEFAULT_CANDIDATE_SIGNALS },
    traits: { ...DEFAULT_CANDIDATE_TRAITS },
  };
  return [
    SuggestedNextActionCandidateSchema.parse({ ...base, label: 'Summarize my home record', message: PROPERTY_SUMMARY_STARTER_MESSAGE, outcomeKey: 'REVIEW_HOME_SUMMARY' }),
    SuggestedNextActionCandidateSchema.parse({ ...base, label: 'How complete is my home record?', message: PROPERTY_SUMMARY_COMPLETENESS_STARTER_MESSAGE, outcomeKey: 'REVIEW_COMPLETENESS' }),
  ];
}
