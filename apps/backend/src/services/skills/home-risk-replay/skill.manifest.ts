import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.50, capability-card audit (Appendix D): the third new operation for a capability
// the audit found with no Ask operation. Reads getPastHazardExposure, the same call the Home Risk Replay page's route
// (GET /properties/:id/past-hazard-exposure) makes, behind the same reviewed-coverage production gate. Read-only;
// recording an effect and linking evidence are a follow-up. Current weather near the home stays with home-event-radar.
export const HOME_RISK_REPLAY_SKILL = Object.freeze({
  id: 'home-risk-replay',
  version: '1.0.0',
  domain: 'HOME_PROTECTION',
  displayName: 'Home Risk Replay',
  description: "Review this home's past hazard exposure and long-term hazard context from reviewed sources, with any effect the household recorded.",
  homeownerJobs: ['STAY_AHEAD', 'DECIDE_WITH_CONFIDENCE'],
  supportedGoals: ['review-past-hazard-exposure'],
  aliases: ['home risk replay', 'past hazards', 'hazard history', 'flood zone'],
  operations: [{
    operationId: 'PAST_HAZARD_EXPOSURE',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'home-risk-replay.exposure', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['PAST_HAZARD_EXPOSURE'] }],
  autonomyLevel: 1,
  riskPolicy: {
    effects: ['READ'],
    materiality: 'LOW',
    riskDomains: ['HOME_SAFETY'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'LIMITATION', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'PAST_HAZARD_EXPOSURE', version: '1.0', required: true },
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
  evaluationSuite: 'skill-home-risk-replay-golden',
  featureFlag: 'ASK_SKILL_HOME_RISK_REPLAY_ENABLED',
  killSwitch: 'ASK_SKILL_HOME_RISK_REPLAY_KILL_SWITCH',
  owner: 'Homeowner Product / Home Protection',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
