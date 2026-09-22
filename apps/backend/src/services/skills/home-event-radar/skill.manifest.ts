import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD Phase 1 cross-cutting, capability-card audit
// (Appendix D), second reference journey (2026-09-22). Deliberately its own
// skill reading radarQueryService.listFeed/getDetail directly -- the SAME
// canonical read the traditional Home Event Radar page itself calls (via
// /radar/events, /radar/events/:matchId) -- rather than routing through
// INTELLIGENCE_ENVELOPE_QUERY (query-envelope skill), which the FRD
// explicitly flags as not proof of this specific workflow: wrong item set
// (cross-domain normalized envelope items, not radar matches), wrong
// filters, wrong grouping. Read-only first slice: state transitions
// (save/dismiss/acted-on), structured feedback, and task-candidate/creation
// writes are a deliberately separate, unscoped follow-up -- this skill has
// exactly one operation.
export const HOME_EVENT_RADAR_SKILL = Object.freeze({
  id: 'home-event-radar',
  version: '1.0.0',
  domain: 'HOME_PROTECTION',
  displayName: 'Home Event Radar',
  description: 'Read the canonical feed of monitored home events (weather, air quality, disaster, utility, tax, and insurance signals matched to this property) and their full detail.',
  homeownerJobs: ['STAY_AHEAD', 'DECIDE_WITH_CONFIDENCE'],
  supportedGoals: ['review-monitored-home-events', 'review-monitored-event-detail'],
  aliases: ['home event radar', 'radar feed', 'monitored home events', 'radar matches'],
  operations: [{
    operationId: 'HOME_EVENT_RADAR_FEED',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    // Audience-governed read so the audience layer can neutrally frame the
    // feed by operating mode (never gate on it) -- same convention as
    // query-envelope and capital-planning's own optional journey provider.
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'home-event-radar.feed', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [
    { consumer: 'ASK', operations: ['HOME_EVENT_RADAR_FEED'] },
  ],
  autonomyLevel: 1,
  riskPolicy: {
    effects: ['READ'],
    materiality: 'MATERIAL',
    riskDomains: ['HOME_SAFETY'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  // Not added to askOperationRegistry.ts's CAPABILITY_CONTINUITY_OPERATIONS
  // set -- same as INTELLIGENCE_ENVELOPE_QUERY, not CAPITAL_RESERVE_PLAN --
  // so no CAPABILITY_LIST block here, matching query-envelope's own list.
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'EMPTY_STATE', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'HOME_EVENT_RADAR_FEED', version: '1.0', required: true },
  ],
  contextBudget: {
    maxFacts: 50,
    maxEntities: 25,
    maxDocuments: 0,
    maxHistoryEvents: 0,
    maxSerializedBytes: 96_000,
    maxProviderLatencyMs: 3_000,
    maxOverallLatencyMs: 10_000,
  },
  evaluationSuite: 'skill-home-event-radar-golden',
  featureFlag: 'ASK_SKILL_HOME_EVENT_RADAR_ENABLED',
  killSwitch: 'ASK_SKILL_HOME_EVENT_RADAR_KILL_SWITCH',
  owner: 'Homeowner Product / Home Protection',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
