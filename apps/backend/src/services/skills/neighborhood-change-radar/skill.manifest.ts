import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.49, capability-card audit (Appendix D): the second new operation for a capability
// the audit found with no Ask operation. Reads getAroundYourHome, the same call the Around Your Home page's route
// (GET /properties/:id/around-your-home) makes. Read-only first slice; the per-user interaction writes (follow,
// dismiss, not relevant, mark seen) are a follow-up. Weather and hazard events stay with home-event-radar.
export const NEIGHBORHOOD_CHANGE_RADAR_SKILL = Object.freeze({
  id: 'neighborhood-change-radar',
  version: '1.0.0',
  domain: 'HOME_PROTECTION',
  displayName: 'Around Your Home',
  description: 'Review reviewed local changes around this home (planning, development, zoning, infrastructure, land use, flood maps and schools) with their possible relevance and matched geography.',
  homeownerJobs: ['STAY_AHEAD'],
  supportedGoals: ['review-local-changes-around-home'],
  aliases: ['around your home', 'neighborhood changes', 'local development', 'zoning changes near my home'],
  operations: [{
    operationId: 'NEIGHBORHOOD_CHANGE_FEED',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'neighborhood-change.feed', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['NEIGHBORHOOD_CHANGE_FEED'] }],
  autonomyLevel: 1,
  riskPolicy: {
    effects: ['READ'],
    materiality: 'LOW',
    riskDomains: ['HOME_SAFETY', 'PRIVACY'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'LIMITATION', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'NEIGHBORHOOD_CHANGE_FEED', version: '1.0', required: true },
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
  evaluationSuite: 'skill-neighborhood-change-radar-golden',
  featureFlag: 'ASK_SKILL_NEIGHBORHOOD_CHANGE_RADAR_ENABLED',
  killSwitch: 'ASK_SKILL_NEIGHBORHOOD_CHANGE_RADAR_KILL_SWITCH',
  owner: 'Homeowner Product / Home Protection',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
