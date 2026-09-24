import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.61, capability-card audit (Appendix D): the thirteenth new operation for a capability
// the audit found with no Ask operation. Reads HomeEventsService.listHomeEvents, the call GET /properties/:id/home-events
// makes for the Home Timeline page, and hides other members' PRIVATE events as Ask's other home-event reads do.
// Read-only; logging, correcting, confirming, evidence and visibility stay on the page or their own operations.
export const HOME_TIMELINE_SKILL = Object.freeze({
  id: 'home-timeline',
  version: '1.0.0',
  domain: 'HOME_CARE',
  displayName: 'Home Timeline',
  description: "Review this home's recorded history on the Home Timeline: repairs, improvements, purchases, inspections and claims, with how verified each event is.",
  homeownerJobs: ['NAVIGATE_MAJOR_MOMENTS'],
  supportedGoals: ['review-home-timeline'],
  aliases: ['home timeline', 'home history', 'house history'],
  operations: [{
    operationId: 'HOME_TIMELINE_EVENTS',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'home-timeline.events', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['HOME_TIMELINE_EVENTS'] }],
  autonomyLevel: 1,
  riskPolicy: {
    effects: ['READ'],
    materiality: 'LOW',
    riskDomains: ['PRIVACY'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'TIMELINE', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'HOME_TIMELINE_EVENTS', version: '1.0', required: true },
  ],
  contextBudget: {
    maxFacts: 50,
    maxEntities: 50,
    maxDocuments: 0,
    maxHistoryEvents: 0,
    maxSerializedBytes: 96_000,
    maxProviderLatencyMs: 3_000,
    maxOverallLatencyMs: 10_000,
  },
  evaluationSuite: 'skill-home-timeline-golden',
  featureFlag: 'ASK_SKILL_HOME_TIMELINE_ENABLED',
  killSwitch: 'ASK_SKILL_HOME_TIMELINE_KILL_SWITCH',
  owner: 'Homeowner Product / Home Records',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
